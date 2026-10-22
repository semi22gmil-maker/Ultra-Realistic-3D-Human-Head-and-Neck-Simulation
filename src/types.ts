export type WheelchairCommand = 'F' | 'B' | 'L' | 'R' | 'S';

export interface MotionData {
  pitch: number;      // Filtered, calibrated pitch (-45 to +45 deg)
  roll: number;       // Filtered, calibrated roll (-35 to +35 deg)
  yaw: number;        // Yaw (-60 to +60 deg, manual/simulated)
  rawPitch: number;   // Raw parsed dP
  rawRoll: number;    // Raw parsed dR
  rawYaw: number;
  pitchMag: number;
  rollMag: number;
  command: WheelchairCommand;
  commandConfidence?: number;
  timestamp: number;
}

export type ControlSource = 'manual' | 'esp32_hardware' | 'esp32_simulated' | 'test_animation';

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
