import React from 'react';
import { headController } from '../services/headController';
import { MotionData, SimulationConfig, ControlSource } from '../types';

interface MotionControlsProps {
  motion: MotionData;
  config: SimulationConfig;
  onConfigChange: (newConfig: Partial<SimulationConfig>) => void;
  source: ControlSource;
  isTestRunning: boolean;
}

export const MotionControls: React.FC<MotionControlsProps> = ({
  motion,
  config,
  onConfigChange,
  source,
  isTestRunning
}) => {
  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    headController.setManualMotion(val, motion.roll, motion.yaw);
  };

  const handleRollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    headController.setManualMotion(motion.pitch, val, motion.yaw);
  };

  const handleYawChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    headController.setManualMotion(motion.pitch, motion.roll, val);
  };

  const handleResetNeutral = () => {
    headController.resetToNeutral();
  };

  const handleToggleTest = () => {
    headController.toggleTestAnimation();
  };

  const handleCalibrate = () => {
    headController.calibrateCurrentPosition();
  };

  return (
    <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-xl p-4 backdrop-blur-md shadow-2xl flex flex-col gap-4 font-mono text-xs">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleTest}
            className={`px-3 py-1.5 rounded-lg font-sans font-medium text-xs tracking-wider transition-all flex items-center gap-1.5 shadow ${
              isTestRunning
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/50'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60'
            }`}
          >
            {isTestRunning ? (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                PAUSE TEST ANIMATION
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                PLAY TEST ANIMATION
              </>
            )}
          </button>

          <button
            onClick={handleResetNeutral}
            title="Restore head and neck to 0° neutral center"
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 font-sans font-medium text-xs tracking-wider transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            RESET NEUTRAL
          </button>
        </div>

        <button
          onClick={handleCalibrate}
          title="Zero out resting tilt offset for wheelchair user comfort"
          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-800/50 font-sans font-medium text-xs tracking-wider transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          CALIBRATE ZERO
        </button>
      </div>

      {/* Primary Motion Sliders (Pitch, Roll, Yaw) */}
      <div className="flex flex-col gap-3.5">
        {/* Pitch Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide">PITCH (FORWARD / BACKWARD)</span>
              <span className="text-[10px] text-zinc-400">[-45° to +45°]</span>
            </div>
            <span className="font-mono font-bold text-emerald-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {motion.pitch >= 0 ? '+' : ''}{motion.pitch.toFixed(1)}°
            </span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min={config.pitchMin}
              max={config.pitchMax}
              step="0.5"
              value={motion.pitch}
              onChange={handlePitchChange}
              className="w-full h-2 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-400 px-1 font-mono">
            <span>LOOK UP (-45°)</span>
            <span className="text-zinc-400">0° (LEVEL)</span>
            <span>LOOK DOWN (+45°)</span>
          </div>
        </div>

        {/* Roll Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide">ROLL (LATERAL TILT)</span>
              <span className="text-[10px] text-zinc-400">[-35° to +35°]</span>
            </div>
            <span className="font-mono font-bold text-blue-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {motion.roll >= 0 ? '+' : ''}{motion.roll.toFixed(1)}°
            </span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min={config.rollMin}
              max={config.rollMax}
              step="0.5"
              value={motion.roll}
              onChange={handleRollChange}
              className="w-full h-2 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-400"
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-400 px-1 font-mono">
            <span>TILT LEFT (-35°)</span>
            <span className="text-zinc-400">0° (CENTER)</span>
            <span>TILT RIGHT (+35°)</span>
          </div>
        </div>

        {/* Yaw Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-300 tracking-wide">YAW (HORIZONTAL ROTATION)</span>
              <span className="text-[10px] text-amber-500/90 font-mono">[SIMULATION CONTROL]</span>
            </div>
            <span className="font-mono font-bold text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {motion.yaw >= 0 ? '+' : ''}{motion.yaw.toFixed(1)}°
            </span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min={config.yawMin}
              max={config.yawMax}
              step="1.0"
              value={motion.yaw}
              onChange={handleYawChange}
              className="w-full h-2 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-zinc-300"
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-400 px-1 font-mono">
            <span>TURN LEFT (-60°)</span>
            <span className="text-zinc-400">0°</span>
            <span>TURN RIGHT (+60°)</span>
          </div>
        </div>
      </div>

      {/* Kinematics Tuning: Sensitivity, Smoothing, and Wireframe Style */}
      <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Sensitivity */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>SENSITIVITY</span>
            <span className="font-mono text-zinc-300">{config.sensitivity.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.05"
            value={config.sensitivity}
            onChange={(e) => onConfigChange({ sensitivity: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-zinc-850 rounded appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* Smoothing */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>SMOOTHING (LERP)</span>
            <span className="font-mono text-zinc-300">{config.smoothing.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.04"
            max="0.80"
            step="0.02"
            value={config.smoothing}
            onChange={(e) => onConfigChange({ smoothing: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-zinc-850 rounded appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Wireframe Rendering Style */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>VISUAL STYLE</span>
            <span className="font-mono text-zinc-400">MONOCHROME</span>
          </div>
          <select
            value={config.wireframeStyle}
            onChange={(e) => onConfigChange({ wireframeStyle: e.target.value as any })}
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 outline-none font-mono"
          >
            <option value="pure_wireframe">Pure White Wireframe (Scientific)</option>
            <option value="depth_wireframe">Wireframe + Subtle Depth Shading</option>
            <option value="shaded_wireframe">Wireframe + Dark Shading</option>
            <option value="solid_monochrome">Solid Biometric Monochrome</option>
          </select>
        </div>
      </div>
    </div>
  );
};
