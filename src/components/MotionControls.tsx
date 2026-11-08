import React from 'react';
import { headController } from '../services/headController';
import { eyeTrackingService } from '../services/eyeTrackingService';
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
    <div className="flex flex-col gap-4 font-sans select-none text-right" dir="rtl">
      {/* Top Action Bar */}
      <div className="hud-panel p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-2.5 border border-zinc-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleTest}
            className={`px-3.5 py-1.5 rounded-lg font-sans font-semibold text-xs tracking-wide transition-all flex items-center gap-2 shadow-lg ${
              isTestRunning
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/50'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/70'
            }`}
          >
            {isTestRunning ? (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                <span>إيقاف دورة الاختبار التلقائي</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>تشغيل دورة الاختبار التلقائي (Autopilot)</span>
              </>
            )}
          </button>

          <button
            onClick={handleResetNeutral}
            title="إعادة الرأس والرقبة إلى وضعية السكون الحيادية 0°"
            className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/70 font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>إعادة للوضع الحيادي (Reset)</span>
          </button>
        </div>

        <button
          onClick={handleCalibrate}
          title="معايرة وضعية الجلوس الطبيعية للمستخدم كنقطة الصفر 0°"
          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-800/60 font-semibold text-xs transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>معايرة وضعية الصفر (Calibrate Zero)</span>
        </button>
      </div>

      {/* Primary Motion Sliders (Pitch, Roll, Yaw) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Pitch Slider */}
        <div className="hud-panel p-3.5 rounded-xl flex flex-col gap-2 border border-zinc-800/80">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-white">الميل الرأسي (Pitch)</span>
            <span className="font-mono font-bold text-emerald-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-xs">
              {motion.pitch >= 0 ? '+' : ''}{motion.pitch.toFixed(1)}°
            </span>
          </div>
          <input
            type="range"
            min={config.pitchMin}
            max={config.pitchMax}
            step="0.5"
            value={motion.pitch}
            onChange={handlePitchChange}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>نظر للأعلى (-45°)</span>
            <span className="text-zinc-500">0° مستوٍ</span>
            <span>نظر للأسفل (+45°)</span>
          </div>
        </div>

        {/* Roll Slider */}
        <div className="hud-panel p-3.5 rounded-xl flex flex-col gap-2 border border-zinc-800/80">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-white">الميل الجانبي (Roll)</span>
            <span className="font-mono font-bold text-cyan-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-xs">
              {motion.roll >= 0 ? '+' : ''}{motion.roll.toFixed(1)}°
            </span>
          </div>
          <input
            type="range"
            min={config.rollMin}
            max={config.rollMax}
            step="0.5"
            value={motion.roll}
            onChange={handleRollChange}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>إمالة يسار (-35°)</span>
            <span className="text-zinc-500">0° مستوٍ</span>
            <span>إمالة يمين (+35°)</span>
          </div>
        </div>

        {/* Yaw Slider */}
        <div className="hud-panel p-3.5 rounded-xl flex flex-col gap-2 border border-zinc-800/80">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-white">الدوران الأفقي (Yaw)</span>
            <span className="font-mono font-bold text-purple-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-xs">
              {motion.yaw >= 0 ? '+' : ''}{motion.yaw.toFixed(1)}°
            </span>
          </div>
          <input
            type="range"
            min={config.yawMin}
            max={config.yawMax}
            step="1.0"
            value={motion.yaw}
            onChange={handleYawChange}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
          />
          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>التفات يسار (-60°)</span>
            <span className="text-zinc-500">0° مستقيم</span>
            <span>التفات يمين (+60°)</span>
          </div>
        </div>
      </div>

      {/* Dedicated Independent Eye Gaze Control Pad */}
      <div className="hud-panel p-3.5 rounded-xl border border-zinc-800/80 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 text-sm">👁️</span>
            <span className="font-bold text-white text-xs">لوحة تجربة واختبار بؤبؤ العين (مستقلة تماماً عن حركة الرأس)</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">
            الاتجاه الحالي: <strong className="text-cyan-300">{motion.eyeData?.direction || 'Stop'}</strong> (CMD='{motion.eyeData?.command || 'S'}')
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
          <button
            onClick={() => eyeTrackingService.setManualGaze('Right')}
            className={`p-2 rounded-lg font-bold border transition-all flex items-center justify-center gap-1.5 ${
              motion.eyeData?.direction === 'Right'
                ? 'bg-purple-950 border-purple-500 text-purple-200 shadow-lg'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span>👁️ يمين (Right)</span>
          </button>

          <button
            onClick={() => eyeTrackingService.setManualGaze('Left')}
            className={`p-2 rounded-lg font-bold border transition-all flex items-center justify-center gap-1.5 ${
              motion.eyeData?.direction === 'Left'
                ? 'bg-cyan-950 border-cyan-500 text-cyan-200 shadow-glow-cyan'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span>👁️ يسار (Left)</span>
          </button>

          <button
            onClick={() => eyeTrackingService.setManualGaze('Forward')}
            className={`p-2 rounded-lg font-bold border transition-all flex items-center justify-center gap-1.5 ${
              motion.eyeData?.direction === 'Forward'
                ? 'bg-emerald-950 border-emerald-500 text-emerald-200 shadow-glow-emerald'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span>▲ أعلى (Forward)</span>
          </button>

          <button
            onClick={() => eyeTrackingService.setManualGaze('Backward')}
            className={`p-2 rounded-lg font-bold border transition-all flex items-center justify-center gap-1.5 ${
              motion.eyeData?.direction === 'Backward'
                ? 'bg-amber-950 border-amber-500 text-amber-200 shadow-lg'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span>▼ أسفل (Backward)</span>
          </button>

          <button
            onClick={() => eyeTrackingService.setManualGaze('Stop')}
            className={`p-2 rounded-lg font-bold border transition-all flex items-center justify-center gap-1.5 ${
              motion.eyeData?.direction === 'Stop' && motion.eyeData?.eyeOpen
                ? 'bg-zinc-800 border-zinc-600 text-white shadow-md'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
            }`}
          >
            <span>● توقف حيادي</span>
          </button>

          <button
            onClick={() => eyeTrackingService.setManualGaze('Stop', 0, 0, false, 0)}
            className={`p-2 rounded-lg font-bold border transition-all flex items-center justify-center gap-1.5 ${
              !motion.eyeData?.eyeOpen
                ? 'bg-red-950 border-red-500 text-red-200 shadow-lg animate-pulse'
                : 'bg-zinc-900 border-zinc-800 text-red-400 hover:bg-zinc-850'
            }`}
          >
            <span>🛑 فرملة إغلاق</span>
          </button>
        </div>
      </div>

      {/* Kinematics Tuning: Sensitivity, Smoothing, and Wireframe Style */}
      <div className="hud-panel p-3.5 rounded-xl border border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
        {/* Sensitivity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-zinc-300">
            <span className="font-semibold">حساسية الاستجابة للحركة</span>
            <span className="font-mono text-emerald-400 font-bold">{config.sensitivity.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.05"
            value={config.sensitivity}
            onChange={(e) => onConfigChange({ sensitivity: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
          />
          <span className="text-[10px] text-zinc-500">مضاعف حركة الرأس بالنسبة لمقدار إمالة المستخدم</span>
        </div>

        {/* Smoothing */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-zinc-300">
            <span className="font-semibold">معدل التنعيم الحركي (Smoothing LERP)</span>
            <span className="font-mono text-cyan-400 font-bold">{config.smoothing.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.04"
            max="0.80"
            step="0.02"
            value={config.smoothing}
            onChange={(e) => onConfigChange({ smoothing: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-cyan-500"
          />
          <span className="text-[10px] text-zinc-500">فلتر إزالة التشويش الحركي لضمان سلاسة حركة الرأس 3D</span>
        </div>

        {/* Wireframe Rendering Style */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-zinc-300">
            <span className="font-semibold">نمط العرض ثلاثي الأبعاد</span>
            <span className="font-mono text-purple-400">3D SHADER</span>
          </div>
          <select
            value={config.wireframeStyle}
            onChange={(e) => onConfigChange({ wireframeStyle: e.target.value as any })}
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 outline-none font-sans"
          >
            <option value="pure_wireframe">شبكي علمي أبيض نقي (Pure White Wireframe)</option>
            <option value="depth_wireframe">شبكي مع تدرج عمق مجسم (Depth Wireframe)</option>
            <option value="shaded_wireframe">شبكي داكن مع ظلال تشريحية (Shaded Wireframe)</option>
            <option value="solid_monochrome">مجسم أحادي اللون حيوي (Biometric Monochrome)</option>
          </select>
          <span className="text-[10px] text-zinc-500">تخصيص المظهر التشريحي والعلمي للرأس ثلاثي الأبعاد</span>
        </div>
      </div>
    </div>
  );
};
