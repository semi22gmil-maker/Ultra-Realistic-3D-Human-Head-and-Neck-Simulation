import { MotionData, SimulationConfig, CalibrationOffset, WheelchairCommand, ControlSource } from '../types';
import { serialController, ParsedSerialMessage } from './serialController';

export type MotionListener = (data: MotionData) => void;

class HeadController {
  // Current smoothed angles (degrees)
  private currentPitch = 0;
  private currentRoll = 0;
  private currentYaw = 0;

  // Target raw angles before smoothing (degrees)
  private targetPitch = 0;
  private targetRoll = 0;
  private targetYaw = 0;

  // Calibration offset
  private calibration: CalibrationOffset = {
    pitchOffset: 0,
    rollOffset: 0,
    yawOffset: 0,
  };

  // Configuration
  private config: SimulationConfig = {
    sensitivity: 1.0,
    smoothing: 0.18,
    pitchMin: -45,
    pitchMax: 45,
    rollMin: -35,
    rollMax: 35,
    yawMin: -60,
    yawMax: 60,
    deadband: 3.0,
    threshold: 12.0,
    neckDistribution: 0.35, // 35% of tilt taken by neck curvature, 65% by skull
    wireframeStyle: 'pure_wireframe',
    meshColor: '#ffffff',
    wireframeLineWidth: 1.0,
    showAnatomicalMarkers: false,
    showCervicalAxis: true,
    cameraFov: 38
  };

  private source: ControlSource = 'manual';
  private motionListeners: Set<MotionListener> = new Set();
  private testAnimTimer: any = null;
  private testAnimTime = 0;
  private lastCommand: WheelchairCommand = 'S';
  private unsubSerial: (() => void) | null = null;
  private unsubSerialState: (() => void) | null = null;

  constructor() {
    this.initSerialBinding();
  }

  private initSerialBinding() {
    this.unsubSerial = serialController.subscribeData((msg: ParsedSerialMessage) => {
      // Automatically switch to hardware mode whenever data packets arrive
      if (this.source !== 'esp32_hardware' && this.source !== 'esp32_simulated') {
        this.source = serialController.isSimulating() ? 'esp32_simulated' : 'esp32_hardware';
      }
      this.setHardwareMotion(msg.pitch, msg.roll, msg.yaw || 0, msg.command);
    });

    this.unsubSerialState = serialController.subscribeState((state) => {
      if (state === 'connected') {
        if (serialController.isSimulating()) {
          this.source = 'esp32_simulated';
        } else {
          this.source = 'esp32_hardware';
        }
      } else if (state === 'disconnected') {
        if (this.source === 'esp32_hardware' || this.source === 'esp32_simulated') {
          this.source = 'manual';
        }
      }
      this.broadcastMotion();
    });
  }

  public getConfig(): SimulationConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<SimulationConfig>) {
    this.config = { ...this.config, ...partial };
  }

  public getControlSource(): ControlSource {
    return this.source;
  }

  public setControlSource(source: ControlSource) {
    if (this.source === 'test_animation' && source !== 'test_animation') {
      this.stopTestAnimation();
    }
    this.source = source;
    this.broadcastMotion();
  }

  public subscribeMotion(listener: MotionListener): () => void {
    this.motionListeners.add(listener);
    listener(this.getMotionData());
    return () => this.motionListeners.delete(listener);
  }

  public getMotionData(): MotionData {
    return {
      pitch: this.currentPitch,
      roll: this.currentRoll,
      yaw: this.currentYaw,
      rawPitch: this.targetPitch,
      rawRoll: this.targetRoll,
      rawYaw: this.targetYaw,
      pitchMag: Math.abs(this.currentPitch),
      rollMag: Math.abs(this.currentRoll),
      command: this.lastCommand,
      timestamp: Date.now()
    };
  }

  /**
   * Set manual slider input (when in manual mode)
   */
  public setManualMotion(pitch: number, roll: number, yaw: number) {
    if (this.source === 'test_animation') {
      this.stopTestAnimation();
    }
    this.source = 'manual';
    this.targetPitch = pitch;
    this.targetRoll = roll;
    this.targetYaw = yaw;
  }

  /**
   * Called when serial message arrives from ESP32 MPU6050
   */
  public setHardwareMotion(rawPitch: number, rawRoll: number, rawYaw = 0, explicitCmd?: WheelchairCommand) {
    // Apply calibration offset
    const calibratedPitch = rawPitch - this.calibration.pitchOffset;
    const calibratedRoll = rawRoll - this.calibration.rollOffset;
    const calibratedYaw = rawYaw - this.calibration.yawOffset;

    // Apply sensitivity scaling
    this.targetPitch = calibratedPitch * this.config.sensitivity;
    this.targetRoll = calibratedRoll * this.config.sensitivity;
    this.targetYaw = calibratedYaw * this.config.sensitivity;

    if (explicitCmd) {
      this.lastCommand = explicitCmd;
    }
  }

  /**
   * Calibrate current head angle as neutral (0,0) resting position
   */
  public calibrateCurrentPosition() {
    this.calibration.pitchOffset += this.targetPitch;
    this.calibration.rollOffset += this.targetRoll;
    this.calibration.yawOffset += this.targetYaw;
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.currentRoll = 0;
    this.currentYaw = 0;
    this.broadcastMotion();
  }

  /**
   * Reset calibration and restore to neutral center
   */
  public resetToNeutral() {
    this.stopTestAnimation();
    this.calibration = { pitchOffset: 0, rollOffset: 0, yawOffset: 0 };
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.currentRoll = 0;
    this.currentYaw = 0;
    this.lastCommand = 'S';
    this.broadcastMotion();
  }

  /**
   * Play/Pause natural anatomical test animation
   */
  public toggleTestAnimation(): boolean {
    if (this.testAnimTimer) {
      this.stopTestAnimation();
      return false;
    } else {
      this.startTestAnimation();
      return true;
    }
  }

  public isTestAnimationRunning(): boolean {
    return this.testAnimTimer !== null;
  }

  public startTestAnimation() {
    this.stopTestAnimation();
    this.source = 'test_animation';
    this.testAnimTime = 0;

    this.testAnimTimer = setInterval(() => {
      this.testAnimTime += 0.035;
      const t = this.testAnimTime;

      // Realistic lifelike sequence:
      // Sub-cycle 1: Nod down (forward flexion) & look up (extension)
      // Sub-cycle 2: Lateral neck tilt (roll)
      // Sub-cycle 3: Horizontal gaze shift (yaw)
      const pitch = Math.sin(t * 0.9) * 22;
      const roll = Math.cos(t * 0.7) * 16;
      const yaw = Math.sin(t * 0.45) * 28;

      this.targetPitch = pitch;
      this.targetRoll = roll;
      this.targetYaw = yaw;
    }, 25);
  }

  public stopTestAnimation() {
    if (this.testAnimTimer) {
      clearInterval(this.testAnimTimer);
      this.testAnimTimer = null;
      if (this.source === 'test_animation') {
        this.source = 'manual';
      }
    }
  }

  /**
   * Called every frame from Three.js render loop to smoothly damp angles
   */
  public update(deltaSeconds: number): { pitch: number; roll: number; yaw: number } {
    // Clamp target within safe anatomical limits
    const clampedPitch = Math.max(this.config.pitchMin, Math.min(this.config.pitchMax, this.targetPitch));
    const clampedRoll = Math.max(this.config.rollMin, Math.min(this.config.rollMax, this.targetRoll));
    const clampedYaw = Math.max(this.config.yawMin, Math.min(this.config.yawMax, this.targetYaw));

    // Exponential smoothing: factor based on delta time
    // smoothing config: 0.02 (heavy lag/soft) to 0.95 (snappy)
    const factor = 1 - Math.exp(-this.config.smoothing * 40 * deltaSeconds);

    this.currentPitch += (clampedPitch - this.currentPitch) * factor;
    this.currentRoll += (clampedRoll - this.currentRoll) * factor;
    this.currentYaw += (clampedYaw - this.currentYaw) * factor;

    // Evaluate wheelchair command if not set by hardware
    if (this.source !== 'esp32_hardware' || this.lastCommand === 'S') {
      this.evaluateWheelchairCommand();
    }

    this.broadcastMotion();

    return {
      pitch: this.currentPitch,
      roll: this.currentRoll,
      yaw: this.currentYaw
    };
  }

  private evaluateWheelchairCommand() {
    const p = this.currentPitch;
    const r = this.currentRoll;
    const thresh = this.config.threshold;
    const deadband = this.config.deadband;

    if (Math.abs(p) <= deadband && Math.abs(r) <= deadband) {
      this.lastCommand = 'S';
      return;
    }

    if (Math.abs(p) >= Math.abs(r)) {
      if (p >= thresh) this.lastCommand = 'F';
      else if (p <= -thresh) this.lastCommand = 'B';
      else this.lastCommand = 'S';
    } else {
      if (r <= -thresh) this.lastCommand = 'L';
      else if (r >= thresh) this.lastCommand = 'R';
      else this.lastCommand = 'S';
    }
  }

  private broadcastMotion() {
    const data = this.getMotionData();
    this.motionListeners.forEach(cb => cb(data));
  }
}

export const headController = new HeadController();
