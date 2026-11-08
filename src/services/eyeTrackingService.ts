import { EyeTrackingData, WheelchairCommand, WheelchairControlMode } from '../types';

export type EyeDataListener = (data: EyeTrackingData) => void;

class EyeTrackingService {
  private currentData: EyeTrackingData = {
    direction: 'Stop',
    command: 'S',
    gazeX: 0,
    gazeY: 0,
    eyeOpen: true,
    timestamp: Date.now(),
    source: 'python_opencv'
  };

  private controlMode: WheelchairControlMode = 'fused_head_eye';
  private listeners: Set<EyeDataListener> = new Set();
  private eventSource: EventSource | null = null;
  private isConnectedToPython = false;
  private pythonConnectionListeners: Set<(connected: boolean) => void> = new Set();
  private lastPythonMessageTime = 0;
  private connectionCheckTimer: any = null;

  constructor() {
    this.initSSEConnection();
    this.startHeartbeatCheck();
  }

  public getControlMode(): WheelchairControlMode {
    return this.controlMode;
  }

  public setControlMode(mode: WheelchairControlMode) {
    this.controlMode = mode;
    this.broadcast();
  }

  public isPythonConnected(): boolean {
    return this.isConnectedToPython && Date.now() - this.lastPythonMessageTime < 3000;
  }

  public subscribe(listener: EyeDataListener): () => void {
    this.listeners.add(listener);
    listener(this.currentData);
    return () => this.listeners.delete(listener);
  }

  public subscribePythonConnection(cb: (connected: boolean) => void): () => void {
    this.pythonConnectionListeners.add(cb);
    cb(this.isPythonConnected());
    return () => this.pythonConnectionListeners.delete(cb);
  }

  public getLatestData(): EyeTrackingData {
    return { ...this.currentData };
  }

  private initSSEConnection() {
    if (typeof window === 'undefined') return;

    try {
      this.eventSource = new EventSource('/api/eye-tracking/stream');

      this.eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && typeof parsed === 'object') {
            this.lastPythonMessageTime = Date.now();
            this.setPythonConnected(true);

            let eyeCmd: WheelchairCommand = (parsed.eyeCommand || 'S') as WheelchairCommand;
            const dir = parsed.direction || 'Stop';
            if (dir === 'Forward') eyeCmd = 'F';
            else if (dir === 'Backward') eyeCmd = 'B';
            else if (dir === 'Left') eyeCmd = 'L';
            else if (dir === 'Right') eyeCmd = 'R';

            this.currentData = {
              direction: dir,
              command: (parsed.command || eyeCmd) as WheelchairCommand,
              eyeCommand: eyeCmd,
              headCommand: (parsed.headCommand || 'S') as WheelchairCommand,
              gazeX: parsed.gazeX ?? 0,
              gazeY: parsed.gazeY ?? 0,
              eyeOpen: parsed.eyeOpen !== undefined ? !!parsed.eyeOpen : true,
              eyeOpenness: parsed.eyeOpenness ?? (parsed.eyeOpen ? 100 : 0),
              headRoll: parsed.headRoll ?? 0,
              headPitch: parsed.headPitch ?? 0,
              headYaw: parsed.headYaw ?? 0,
              controlMode: parsed.controlMode || this.controlMode,
              timestamp: parsed.timestamp || Date.now(),
              source: 'python_opencv'
            };
            if (parsed.controlMode && parsed.controlMode !== this.controlMode) {
              this.controlMode = parsed.controlMode;
            }
            this.broadcast();
          }
        } catch (e) {
          // ignore malformed
        }
      };

      this.eventSource.onerror = () => {
        this.setPythonConnected(false);
      };
    } catch (err) {
      console.warn('SSE Eye Tracking stream init failed:', err);
    }
  }

  private setPythonConnected(connected: boolean) {
    if (this.isConnectedToPython !== connected) {
      this.isConnectedToPython = connected;
      this.pythonConnectionListeners.forEach((cb) => cb(connected));
    }
  }

  private startHeartbeatCheck() {
    this.connectionCheckTimer = setInterval(() => {
      if (this.isConnectedToPython && Date.now() - this.lastPythonMessageTime > 3000) {
        this.setPythonConnected(false);
      }
    }, 1000);
  }

  public setManualGaze(
    direction: 'Forward' | 'Backward' | 'Left' | 'Right' | 'Stop',
    gazeX?: number,
    gazeY?: number,
    eyeOpen = true,
    eyeOpenness = 100,
    headPitch = 0,
    headRoll = 0,
    headYaw = 0,
    source: 'browser_webcam' | 'simulated' = 'simulated'
  ) {
    let cmd: WheelchairCommand = 'S';
    let calcX = gazeX ?? 0;
    let calcY = gazeY ?? 0;

    if (direction === 'Forward') {
      cmd = 'F';
      if (gazeY === undefined) calcY = -0.85;
      if (gazeX === undefined) calcX = 0;
    } else if (direction === 'Backward') {
      cmd = 'B';
      if (gazeY === undefined) calcY = 0.85;
      if (gazeX === undefined) calcX = 0;
    } else if (direction === 'Left') {
      cmd = 'L';
      if (gazeX === undefined) calcX = -0.85;
      if (gazeY === undefined) calcY = 0;
    } else if (direction === 'Right') {
      cmd = 'R';
      if (gazeX === undefined) calcX = 0.85;
      if (gazeY === undefined) calcY = 0;
    } else {
      cmd = 'S';
      if (gazeX === undefined) calcX = 0;
      if (gazeY === undefined) calcY = 0;
    }

    this.currentData = {
      direction,
      command: cmd,
      eyeCommand: cmd,
      headCommand: 'S',
      gazeX: calcX,
      gazeY: calcY,
      eyeOpen,
      eyeOpenness,
      headPitch,
      headRoll,
      headYaw,
      controlMode: this.controlMode,
      timestamp: Date.now(),
      source
    };
    this.broadcast();
  }

  private broadcast() {
    const data = this.getLatestData();
    this.listeners.forEach((listener) => listener(data));
  }
}

export const eyeTrackingService = new EyeTrackingService();
