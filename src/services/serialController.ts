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

  private packetsReceived = 0;
  private lastRawPacket = '';
  private lastParsedPacket: ParsedSerialMessage | null = null;

  public getPacketStats() {
    return {
      packetsReceived: this.packetsReceived,
      lastRawPacket: this.lastRawPacket,
      lastParsedPacket: this.lastParsedPacket
    };
  }

  /**
   * Continuous read loop for incoming serial bytes with newline buffer
   */
  private async readSerialLoop() {
    let lineBuffer = '';
    const decoder = new TextDecoder();

    while (this.port && this.port.readable && this.keepReading) {
      try {
        this.reader = this.port.readable.getReader();
        while (this.keepReading) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            lineBuffer += decoder.decode(value, { stream: true });
            // Split on any combination of \r\n, \n, or \r
            const lines = lineBuffer.split(/\r\n|\n|\r/);
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
          this.reader = null;
        }
      }
    }
  }

  /**
   * Parse ESP32 text lines.
   * Supports target protocol: dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
   * Also intelligently supports:
   * - Pitch: 12.3 Roll: -4.5
   * - P: 12.3 R: -4.5
   * - YPR: 0 12.3 -4.5 (MPU6050 DMP)
   * - AcX/AcY/AcZ raw gravity vectors
   * - Plain comma/space separated values: "12.3, -4.5"
   */
  public parseLine(line: string): ParsedSerialMessage | null {
    try {
      // Strip non-printable ASCII noise (from baud rate sync or restarts)
      const cleanLine = line.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim();
      if (!cleanLine) return null;

      // 1. Primary ESP32 MPU6050 format:
      // dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
      const dpMatch = cleanLine.match(/dP\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const drMatch = cleanLine.match(/dR\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const cmdMatch = cleanLine.match(/CMD\s*[:=]\s*['"]?([FBLRS])['"]?/i);
      const pMagMatch = cleanLine.match(/pMag\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const rMagMatch = cleanLine.match(/rMag\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);

      if (dpMatch && drMatch) {
        const pitch = parseFloat(dpMatch[1]);
        const roll = parseFloat(drMatch[1]);
        const command = cmdMatch ? (cmdMatch[1].toUpperCase() as WheelchairCommand) : this.inferCommand(pitch, roll);

        return {
          pitch,
          roll,
          yaw: 0,
          pitchMag: pMagMatch ? parseFloat(pMagMatch[1]) : Math.abs(pitch),
          rollMag: rMagMatch ? parseFloat(rMagMatch[1]) : Math.abs(roll),
          command,
          rawString: cleanLine
        };
      }

      // 2. Named Pitch / Roll or P / R formats (in any order):
      // e.g. "Pitch: 12.5 Roll: -3.4" or "Roll: -3.4, Pitch: 12.5" or "P=12.5 R=-3.4"
      const namedPitchMatch = cleanLine.match(/(?:pitch|angle[_\s]?x|rot[_\s]?x|p)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const namedRollMatch = cleanLine.match(/(?:roll|angle[_\s]?y|rot[_\s]?y|r)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const namedYawMatch = cleanLine.match(/(?:yaw|angle[_\s]?z|rot[_\s]?z|y)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);

      if (namedPitchMatch && namedRollMatch) {
        const pitch = parseFloat(namedPitchMatch[1]);
        const roll = parseFloat(namedRollMatch[1]);
        const yaw = namedYawMatch ? parseFloat(namedYawMatch[1]) : 0;
        const command = cmdMatch ? (cmdMatch[1].toUpperCase() as WheelchairCommand) : this.inferCommand(pitch, roll);

        return {
          pitch,
          roll,
          yaw,
          pitchMag: Math.abs(pitch),
          rollMag: Math.abs(roll),
          command,
          rawString: cleanLine
        };
      }

      // 3. Raw Accelerometer values: AcX / AcY / AcZ (calculate pitch & roll via atan2)
      // e.g. "AcX = 1200 | AcY = -450 | AcZ = 16000" or "ax: 0.12 ay: -0.04 az: 0.98"
      const acXMatch = cleanLine.match(/(?:acx|accel[_\s]?x|ax)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const acYMatch = cleanLine.match(/(?:acy|accel[_\s]?y|ay)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
      const acZMatch = cleanLine.match(/(?:acz|accel[_\s]?z|az)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);

      if (acXMatch && acYMatch && acZMatch) {
        const ax = parseFloat(acXMatch[1]);
        const ay = parseFloat(acYMatch[1]);
        const az = parseFloat(acZMatch[1]);
        const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180.0 / Math.PI);
        const roll = Math.atan2(ay, az) * (180.0 / Math.PI);

        return {
          pitch: +pitch.toFixed(1),
          roll: +roll.toFixed(1),
          yaw: 0,
          pitchMag: Math.abs(pitch),
          rollMag: Math.abs(roll),
          command: this.inferCommand(pitch, roll),
          rawString: cleanLine
        };
      }

      // 4. MPU6050 DMP YPR format: "ypr: 0.00, 15.20, -3.40" or "ypr\t0.00\t15.20\t-3.40"
      if (/ypr/i.test(cleanLine)) {
        const numbers = cleanLine.match(/[+-]?\d+(?:\.\d+)?/g);
        if (numbers && numbers.length >= 3) {
          const yaw = parseFloat(numbers[0]);
          const pitch = parseFloat(numbers[1]);
          const roll = parseFloat(numbers[2]);
          return {
            pitch,
            roll,
            yaw,
            pitchMag: Math.abs(pitch),
            rollMag: Math.abs(roll),
            command: this.inferCommand(pitch, roll),
            rawString: cleanLine
          };
        }
      }

      // 5. JSON format fallback: {"pitch": 12.3, "roll": -4.2}
      if (cleanLine.startsWith('{') && cleanLine.endsWith('}')) {
        const json = JSON.parse(cleanLine);
        const pitch = typeof json.pitch === 'number' ? json.pitch : (json.dP || json.p || 0);
        const roll = typeof json.roll === 'number' ? json.roll : (json.dR || json.r || 0);
        const yaw = typeof json.yaw === 'number' ? json.yaw : (json.y || 0);
        const command: WheelchairCommand = (json.cmd || json.CMD || this.inferCommand(pitch, roll)).toUpperCase();
        return {
          pitch,
          roll,
          yaw,
          pitchMag: Math.abs(pitch),
          rollMag: Math.abs(roll),
          command,
          rawString: cleanLine
        };
      }

      // 6. CSV or space-separated numbers: "18.5, -2.4" or "18.5 -2.4"
      const numMatches = cleanLine.match(/^[+-]?\d+(?:\.\d+)?(?:[\s,;]+[+-]?\d+(?:\.\d+)?)+/);
      if (numMatches) {
        const parts = cleanLine.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
        const nums = parts.map(Number).filter(n => !isNaN(n));
        if (nums.length >= 2) {
          const pitch = nums[0];
          const roll = nums[1];
          const yaw = nums.length >= 3 ? nums[2] : 0;
          return {
            pitch,
            roll,
            yaw,
            pitchMag: Math.abs(pitch),
            rollMag: Math.abs(roll),
            command: this.inferCommand(pitch, roll),
            rawString: cleanLine
          };
        }
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
    this.packetsReceived++;
    this.lastRawPacket = line;
    const parsed = this.parseLine(line);
    if (parsed) {
      this.lastParsedPacket = parsed;
      this.addLog(line, 'incoming');
      this.dataListeners.forEach(listener => listener(parsed));
    } else {
      this.addLog(`[Raw Unparsed] ${line}`, 'info');
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
