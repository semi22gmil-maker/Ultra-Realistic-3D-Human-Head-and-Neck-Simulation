export type WheelchairCommand = 'F' | 'B' | 'L' | 'R' | 'S';

export interface EyeTrackingData {
  direction: 'Forward' | 'Backward' | 'Left' | 'Right' | 'Stop';
  command: WheelchairCommand;
  eyeCommand?: WheelchairCommand;
  headCommand?: WheelchairCommand;
  gazeX: number; // -1.0 (left) to +1.0 (right)
  gazeY: number; // -1.0 (up) to +1.0 (down)
  eyeOpen: boolean;
  eyeOpenness?: number; // 0 to 100%
  headRoll?: number; // Head roll in degrees (-35 to +35)
  headPitch?: number; // Head pitch in degrees (-45 to +45)
  headYaw?: number; // Head yaw in degrees (-50 to +50)
  timestamp: number;
  source: 'python_opencv' | 'browser_webcam' | 'simulated';
  controlMode?: WheelchairControlMode;
}

export type WheelchairControlMode = 'head_only' | 'eye_only' | 'fused_head_eye';

export interface MotionData {
  pitch: number;      // Filtered, calibrated pitch (-45 to +45 deg)
  roll: number;       // Filtered, calibrated roll (-35 to +35 deg)
  yaw: number;        // Yaw (-60 to +60 deg, manual/simulated)
  rawPitch: number;   // Raw parsed dP
  rawRoll: number;    // Raw parsed dR
  rawYaw: number;
  pitchMag: number;
  rollMag: number;
  command: WheelchairCommand;      // Effective motor command
  headCommand?: WheelchairCommand; // Command derived strictly from head
  eyeCommand?: WheelchairCommand;  // Command derived strictly from eye pupil
  commandConfidence?: number;
  timestamp: number;
  eyeData?: EyeTrackingData;
  controlMode?: WheelchairControlMode;
}

export type ControlSource = 'manual' | 'esp32_hardware' | 'esp32_simulated' | 'test_animation' | 'camera_tracking';

export type SerialState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'unsupported';

export interface CalibrationOffset {
  pitchOffset: number;
  rollOffset: number;
  yawOffset: number;
}

export interface SimulationConfig {
  sensitivity: number;       // 0.2x to 3.0x
  smoothing: number;         // 0.02 (super smooth) to 0.95 (raw/snappy)
  pitchMin: number;
  pitchMax: number;
  rollMin: number;
  rollMax: number;
  yawMin: number;
  yawMax: number;
  deadband: number;          // Degrees below which wheelchair command is STOP 'S'
  threshold: number;         // Degrees above which command activates
  neckDistribution: number;  // Ratio of tilt absorbed by cervical spine (e.g. 0.35)
  wireframeStyle: 'pure_wireframe' | 'depth_wireframe' | 'shaded_wireframe' | 'solid_monochrome';
  meshColor: string;
  wireframeLineWidth: number;
  showAnatomicalMarkers: boolean;
  showCervicalAxis: boolean;
  cameraFov: number;
}

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'incoming' | 'info' | 'error' | 'success';
}

export interface ModelMetadata {
  name: string;
  source: 'preset_lee_perry_smith' | 'custom_upload';
  vertices: number;
  triangles: number;
  hasBones: boolean;
  boneList: string[];
}
