import { WheelchairCommand, SerialLogEntry, SerialState } from '../types';

export interface ParsedSerialMessage {
  pitch: number;
  roll: number;
  yaw?: number;
  pitchMag?: number;
  rollMag?: number;
  command: WheelchairCommand;
  rawString: string;
}

export type SerialDataListener = (data: ParsedSerialMessage) => void;
export type SerialStateListener = (state: SerialState, error?: string) => void;
export type SerialLogListener = (log: SerialLogEntry) => void;

class SerialController {
  private port: any = null;
  private reader: any = null;
  private keepReading = false;
  private state: SerialState = 'disconnected';
  private dataListeners: Set<SerialDataListener> = new Set();
  private stateListeners: Set<SerialStateListener> = new Set();
  private logListeners: Set<SerialLogListener> = new Set();
  private logs: SerialLogEntry[] = [];
  private maxLogs = 150;
  private simTimer: any = null;
  private simPhase = 0;

  constructor() {
    if (typeof window !== 'undefined' && !('serial' in navigator)) {
      this.state = 'unsupported';
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  public getState(): SerialState {
    return this.state;
  }

  public getLogs(): SerialLogEntry[] {
    return [...this.logs];
  }

  public subscribeData(listener: SerialDataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  public subscribeState(listener: SerialStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeLogs(listener: SerialLogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private addLog(text: string, type: SerialLogEntry['type'] = 'info') {
    const entry: SerialLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      text,
      type
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.logListeners.forEach(cb => cb(entry));
  }

  private setState(newState: SerialState, errorMsg?: string) {
    this.state = newState;
    this.stateListeners.forEach(cb => cb(newState, errorMsg));
  }

  /**
   * Connect to physical ESP32 using Web Serial API
   */
  public async connect(baudRate = 115200): Promise<void> {
    if (!this.isSupported()) {
      const err = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      this.addLog(err, 'error');
      this.setState('unsupported', err);
      throw new Error(err);
    }

    // Stop simulator if running
    this.stopSimulator();

    try {
      this.setState('connecting');
      this.addLog(`Requesting serial port (Baud: ${baudRate}, default COM25 on target)...`, 'info');

      // Prompt user to select port (browser security requires user gesture)
      // @ts-ignore
      this.port = await navigator.serial.requestPort();

      // Open with requested baud rate
      await this.port.open({ baudRate });
      this.setState('connected');
      this.addLog(`Serial port opened successfully at ${baudRate} baud.`, 'success');

      this.keepReading = true;
      this.readSerialLoop();
    } catch (err: any) {
      this.setState('error', err?.message || 'Failed to open serial port');
      this.addLog(`Serial connection failed: ${err?.message || err}`, 'error');
      this.port = null;
      throw err;
    }
  }

  /**
   * Disconnect the serial port
   */
  public async disconnect(): Promise<void> {
    this.stopSimulator();
    this.keepReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        // ignore
      }
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {
        // ignore
      }
      this.port = null;
    }

    this.setState('disconnected');
    this.addLog('Serial connection closed. Switched to manual simulation.', 'info');
  }

  /**
   * Continuous read loop for incoming serial bytes with newline buffer
   */
  private async readSerialLoop() {
    let lineBuffer = '';

    while (this.port && this.port.readable && this.keepReading) {
      const textDecoder = new TextDecoderStream();
      // @ts-ignore
      const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      try {
        while (this.keepReading) {
          const { value, done } = await this.reader.read();
          if (done) {
            break;
          }
          if (value) {
            lineBuffer += value;
            const lines = lineBuffer.split(/\r?\n/);
            // Keep the last partial string in the buffer
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.length > 0) {
                this.handleIncomingLine(trimmed);
              }
            }
          }
        }
      } catch (error: any) {
        if (this.keepReading) {
          this.addLog(`Serial read error: ${error?.message || error}`, 'error');
          this.setState('error', error?.message);
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch (e) {}
        }
      }
    }
  }

  /**
   * Parse ESP32 text lines.
   * Target format:
   * dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
   */
  public parseLine(line: string): ParsedSerialMessage | null {
    try {
      // 1. Primary ESP32 MPU6050 format:
      // dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
      const dpMatch = line.match(/dP\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
      const drMatch = line.match(/dR\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
      const cmdMatch = line.match(/CMD\s*=\s*['"]?([FBLRS])['"]?/i);
      const pMagMatch = line.match(/pMag\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
      const rMagMatch = line.match(/rMag\s*=\s*([+-]?\d+(?:\.\d+)?)/i);

      if (dpMatch && drMatch) {
        const pitch = parseFloat(dpMatch[1]);
        const roll = parseFloat(drMatch[1]);
        let command: WheelchairCommand = 'S';
        if (cmdMatch) {
          command = cmdMatch[1].toUpperCase() as WheelchairCommand;
        } else {
          command = this.inferCommand(pitch, roll);
        }

        return {
          pitch,
          roll,
          yaw: 0, // Yaw is not available on 6-axis MPU6050 gravity vector
          pitchMag: pMagMatch ? parseFloat(pMagMatch[1]) : Math.abs(pitch),
          rollMag: rMagMatch ? parseFloat(rMagMatch[1]) : Math.abs(roll),
          command,
          rawString: line
        };
      }

      // 2. Alternative CSV format: pitch,roll,yaw,cmd or pitch,roll
      if (/^[+-]?\d+(\.\d+)?,[+-]?\d+/.test(line)) {
        const parts = line.split(',').map(s => s.trim());
        const pitch = parseFloat(parts[0]);
        const roll = parseFloat(parts[1]);
        const yaw = parts.length > 2 && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : 0;
        let command: WheelchairCommand = 'S';
        if (parts.length > 3 && ['F', 'B', 'L', 'R', 'S'].includes(parts[3].toUpperCase())) {
          command = parts[3].toUpperCase() as WheelchairCommand;
        } else {
          command = this.inferCommand(pitch, roll);
        }
        return {
          pitch,
          roll,
          yaw,
          pitchMag: Math.abs(pitch),
          rollMag: Math.abs(roll),
          command,
          rawString: line
        };
      }

      // 3. JSON format fallback: {"pitch": 12.3, "roll": -4.2, "cmd": "F"}
      if (line.startsWith('{') && line.endsWith('}')) {
        const json = JSON.parse(line);
        const pitch = typeof json.pitch === 'number' ? json.pitch : (json.dP || 0);
        const roll = typeof json.roll === 'number' ? json.roll : (json.dR || 0);
        const yaw = typeof json.yaw === 'number' ? json.yaw : 0;
        const command: WheelchairCommand = (json.cmd || json.CMD || this.inferCommand(pitch, roll)).toUpperCase();
        return {
          pitch,
          roll,
          yaw,
          pitchMag: Math.abs(pitch),
          rollMag: Math.abs(roll),
          command,
          rawString: line
        };
      }

      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Infer wheelchair command if firmware did not provide explicit CMD
   */
  private inferCommand(pitch: number, roll: number): WheelchairCommand {
    const threshold = 12.0;
    if (pitch > threshold) return 'F';
    if (pitch < -threshold) return 'B';
    if (roll < -threshold) return 'L';
    if (roll > threshold) return 'R';
    return 'S';
  }

  private handleIncomingLine(line: string) {
    this.addLog(line, 'incoming');
    const parsed = this.parseLine(line);
    if (parsed) {
      this.dataListeners.forEach(listener => listener(parsed));
    }
  }

  /**
   * Start built-in ESP32 Stream Simulator.
   * Feeds realistic serial strings: "dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'"
   * Perfect for testing parser and wheelchair control without physical hardware.
   */
  public startSimulator(intervalMs = 40): void {
    this.stopSimulator();
    this.setState('connected');
    this.addLog('Started ESP32 MPU6050 Hardware Stream Simulator (50Hz broadcast).', 'info');

    this.simTimer = setInterval(() => {
      this.simPhase += 0.04;
      // Synthesize realistic gentle head nodding & tilting motion sequence:
      // Pitch nods forward/back, Roll tilts side to side
      const pitch = +(Math.sin(this.simPhase * 0.7) * 22.0).toFixed(1);
      const roll = +(Math.cos(this.simPhase * 0.9) * 16.0).toFixed(1);

      let cmd: WheelchairCommand = 'S';
      if (pitch > 10.0) cmd = 'F';
      else if (pitch < -10.0) cmd = 'B';
      else if (roll < -10.0) cmd = 'L';
      else if (roll > 10.0) cmd = 'R';

      const pSign = pitch >= 0 ? '+' : '';
      const rSign = roll >= 0 ? '+' : '';
      const pMag = Math.abs(pitch).toFixed(1);
      const rMag = Math.abs(roll).toFixed(1);

      // Exact target ESP32 firmware line format:
      const syntheticLine = `dP=${pSign}${pitch} dR=${rSign}${roll} | pMag=${pMag} rMag=${rMag} | CMD='${cmd}'`;
      this.handleIncomingLine(syntheticLine);
    }, intervalMs);
  }

  public stopSimulator(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
      if (this.state === 'connected' && !this.port) {
        this.setState('disconnected');
        this.addLog('ESP32 Stream Simulator stopped.', 'info');
      }
    }
  }

  public isSimulating(): boolean {
    return this.simTimer !== null;
  }

  public injectCustomLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    this.handleIncomingLine(trimmed);
    return true;
  }
}

export const serialController = new SerialController();
