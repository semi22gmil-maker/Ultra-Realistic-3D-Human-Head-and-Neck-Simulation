import React from 'react';
import { MotionData, ControlSource, WheelchairCommand } from '../types';

interface TelemetryPanelProps {
  motion: MotionData;
  source: ControlSource;
  serialState: string;
  fps: number;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  motion,
  source,
  serialState,
  fps
}) => {
  const getCmdColor = (cmd: WheelchairCommand) => {
    switch (cmd) {
      case 'F': return 'bg-emerald-500 text-black border-emerald-400 font-bold';
      case 'B': return 'bg-amber-500 text-black border-amber-400 font-bold';
      case 'L': return 'bg-blue-500 text-white border-blue-400 font-bold';
      case 'R': return 'bg-purple-500 text-white border-purple-400 font-bold';
      case 'S':
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const getCmdLabel = (cmd: WheelchairCommand) => {
    switch (cmd) {
      case 'F': return 'FORWARD';
      case 'B': return 'BACKWARD';
      case 'L': return 'TURN LEFT';
      case 'R': return 'TURN RIGHT';
      case 'S': return 'STOP / NEUTRAL';
    }
  };

  const formatDeg = (deg: number) => {
    const sign = deg > 0 ? '+' : deg < 0 ? '' : ' ';
    return `${sign}${deg.toFixed(1)}°`;
  };

  return (
    <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-xl p-3.5 backdrop-blur-md shadow-2xl flex flex-col gap-3 font-mono text-xs">
      {/* Top Header: Source & Connection Status */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">FEED SOURCE:</span>
          {source === 'esp32_hardware' ? (
            <span className="bg-emerald-950/80 border border-emerald-600/70 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-mono font-semibold">
              ESP32 HARDWARE (USB)
            </span>
          ) : source === 'esp32_simulated' ? (
            <span className="bg-cyan-950/80 border border-cyan-600/70 text-cyan-400 text-[10px] px-2 py-0.5 rounded font-mono font-semibold">
              ESP32 STREAM SIMULATOR
            </span>
          ) : source === 'test_animation' ? (
            <span className="bg-purple-950/80 border border-purple-600/70 text-purple-300 text-[10px] px-2 py-0.5 rounded font-mono font-semibold">
              AUTOPILOT TEST CYCLE
            </span>
          ) : (
            <span className="bg-zinc-800 text-zinc-300 text-[10px] px-2 py-0.5 rounded font-mono">
              MANUAL SIMULATION SLIDERS
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>PORT: <strong className={serialState === 'connected' ? 'text-emerald-400' : 'text-zinc-400'}>{serialState.toUpperCase()}</strong></span>
          <span className="text-zinc-600">|</span>
          <span>{fps} FPS</span>
        </div>
      </div>

      {/* Primary Telemetry Grid: Pitch, Roll, Yaw */}
      <div className="grid grid-cols-3 gap-2">
        {/* Pitch */}
        <div className="bg-black/60 border border-zinc-800/80 p-2.5 rounded-lg flex flex-col">
          <div className="flex justify-between items-center text-[10px] text-zinc-400 mb-1">
            <span>PITCH (TILT)</span>
            <span className="text-[9px] text-zinc-500">dP</span>
          </div>
          <div className="text-lg font-bold text-white tracking-tight flex items-baseline justify-between">
            <span>{formatDeg(motion.pitch)}</span>
            <span className="text-[10px] text-zinc-400 font-normal">
              {motion.pitch > 2 ? 'DOWN' : motion.pitch < -2 ? 'UP' : 'LEVEL'}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full mt-2 overflow-hidden relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-700" />
            <div
              className={`h-full transition-all duration-75 ${motion.pitch >= 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{
                marginLeft: motion.pitch >= 0 ? '50%' : `${50 + (motion.pitch / 45) * 50}%`,
                width: `${(Math.abs(motion.pitch) / 45) * 50}%`
              }}
            />
          </div>
        </div>

        {/* Roll */}
        <div className="bg-black/60 border border-zinc-800/80 p-2.5 rounded-lg flex flex-col">
          <div className="flex justify-between items-center text-[10px] text-zinc-400 mb-1">
            <span>ROLL (SIDE)</span>
            <span className="text-[9px] text-zinc-500">dR</span>
          </div>
          <div className="text-lg font-bold text-white tracking-tight flex items-baseline justify-between">
            <span>{formatDeg(motion.roll)}</span>
            <span className="text-[10px] text-zinc-400 font-normal">
              {motion.roll > 2 ? 'RIGHT' : motion.roll < -2 ? 'LEFT' : 'LEVEL'}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full mt-2 overflow-hidden relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-700" />
            <div
              className={`h-full transition-all duration-75 ${motion.roll >= 0 ? 'bg-purple-400' : 'bg-blue-400'}`}
              style={{
                marginLeft: motion.roll >= 0 ? '50%' : `${50 + (motion.roll / 35) * 50}%`,
                width: `${(Math.abs(motion.roll) / 35) * 50}%`
              }}
            />
          </div>
        </div>

        {/* Yaw */}
        <div className="bg-black/60 border border-zinc-800/80 p-2.5 rounded-lg flex flex-col">
          <div className="flex justify-between items-center text-[10px] text-zinc-400 mb-1">
            <span>YAW (TURN)</span>
            <span className="text-[9px] text-amber-500/80 font-sans" title="6-axis MPU6050 gravity vector does not provide absolute yaw">
              SIM ONLY
            </span>
          </div>
          <div className="text-lg font-bold text-zinc-300 tracking-tight flex items-baseline justify-between">
            <span>{formatDeg(motion.yaw)}</span>
            <span className="text-[10px] text-zinc-400 font-normal">
              {motion.yaw > 2 ? 'R-TURN' : motion.yaw < -2 ? 'L-TURN' : 'CENTER'}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full mt-2 overflow-hidden relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-700" />
            <div
              className="h-full bg-zinc-400 transition-all duration-75"
              style={{
                marginLeft: motion.yaw >= 0 ? '50%' : `${50 + (motion.yaw / 60) * 50}%`,
                width: `${(Math.abs(motion.yaw) / 60) * 50}%`
              }}
            />
          </div>
        </div>
      </div>

      {/* Wheelchair Output HUD */}
      <div className="bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 tracking-wider">WHEELCHAIR CMD</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded border text-sm font-black font-mono ${getCmdColor(motion.command)}`}>
                CMD='{motion.command}'
              </span>
              <span className="text-xs font-semibold text-zinc-200">
                {getCmdLabel(motion.command)}
              </span>
            </div>
          </div>
        </div>

        {/* Directional 2D Cross Visualizer */}
        <div className="w-16 h-16 bg-black border border-zinc-800 rounded relative flex items-center justify-center">
          {/* Axis lines */}
          <div className="absolute w-full h-[1px] bg-zinc-800" />
          <div className="absolute h-full w-[1px] bg-zinc-800" />
          
          {/* Neutral deadband box */}
          <div className="absolute w-4 h-4 border border-zinc-800 bg-zinc-900/40 rounded-sm" />

          {/* Direction indicators */}
          <span className={`absolute top-0.5 text-[8px] font-bold ${motion.command === 'F' ? 'text-emerald-400 scale-125' : 'text-zinc-600'}`}>▲ F</span>
          <span className={`absolute bottom-0.5 text-[8px] font-bold ${motion.command === 'B' ? 'text-amber-400 scale-125' : 'text-zinc-600'}`}>▼ B</span>
          <span className={`absolute left-0.5 text-[8px] font-bold ${motion.command === 'L' ? 'text-blue-400 scale-125' : 'text-zinc-600'}`}>◀ L</span>
          <span className={`absolute right-0.5 text-[8px] font-bold ${motion.command === 'R' ? 'text-purple-400 scale-125' : 'text-zinc-600'}`}>▶ R</span>

          {/* Current Motion Vector Dot */}
          <div
            className={`w-2.5 h-2.5 rounded-full absolute transition-all duration-75 shadow-md ${
              motion.command === 'S' ? 'bg-zinc-500' : 'bg-white ring-2 ring-white/50'
            }`}
            style={{
              transform: `translate(${Math.max(-24, Math.min(24, (motion.roll / 35) * 24))}px, ${Math.max(-24, Math.min(24, (motion.pitch / 45) * 24))}px)`
            }}
          />
        </div>
      </div>
    </div>
  );
};
