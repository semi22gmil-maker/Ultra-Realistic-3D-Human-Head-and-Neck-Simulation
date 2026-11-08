import React, { useState, useEffect } from 'react';
import { MotionData, ControlSource, WheelchairCommand, WheelchairControlMode } from '../types';
import { esp32ConnectionService, MotorDriveState } from '../services/esp32ConnectionService';
import { eyeTrackingService } from '../services/eyeTrackingService';

interface TelemetryPanelProps {
  motion: MotionData;
  source: ControlSource;
  serialState: string;
  fps: number;
}

interface CommandLogEntry {
  id: string;
  timestamp: string;
  cmd: WheelchairCommand;
  sourceType: string;
  labelAr: string;
  detail: string;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  motion,
  source,
  serialState,
  fps
}) => {
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [motorState, setMotorState] = useState<MotorDriveState>(esp32ConnectionService.getMotorState());

  useEffect(() => {
    const unsub = esp32ConnectionService.subscribe(() => {
      setMotorState(esp32ConnectionService.getMotorState());
    });
    return () => unsub();
  }, []);

  // Track command transitions in live stream log
  useEffect(() => {
    const timeStr = new Date().toLocaleTimeString('ar-EG', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const getArLabel = (cmd: WheelchairCommand) => {
      switch (cmd) {
        case 'F': return 'تقدم للأمام';
        case 'B': return 'رجوع للخلف';
        case 'L': return 'انعطاف يسار';
        case 'R': return 'انعطاف يمين';
        case 'S':
        default:
          return 'توقف حيادي';
      }
    };

    const currentMode = motion.controlMode || 'eye_only';
    const srcLabel = currentMode === 'eye_only' ? 'بؤبؤ العين' : currentMode === 'head_only' ? 'حركة الرأس' : 'هجين (رأس+عين)';

    const newEntry: CommandLogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: timeStr,
      cmd: motion.command,
      sourceType: srcLabel,
      labelAr: getArLabel(motion.command),
      detail: `العين:${motion.eyeData?.direction || 'N/A'} (CMD='${motion.eyeData?.command || 'S'}') | الرأس:P:${motion.pitch.toFixed(1)}° (CMD='${motion.headCommand || 'S'}')`
    };

    setLogs((prev) => [newEntry, ...prev.slice(0, 5)]);
  }, [motion.command, motion.controlMode]);

  const handleModeChange = (mode: WheelchairControlMode) => {
    eyeTrackingService.setControlMode(mode);
  };

  const getCmdColorBadge = (cmd: WheelchairCommand) => {
    switch (cmd) {
      case 'F': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/70 shadow-glow-emerald';
      case 'B': return 'bg-amber-500/20 text-amber-300 border-amber-500/70';
      case 'L': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/70 shadow-glow-cyan';
      case 'R': return 'bg-purple-500/20 text-purple-300 border-purple-500/70';
      case 'S':
      default:
        return 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60';
    }
  };

  const getCmdArName = (cmd: WheelchairCommand) => {
    switch (cmd) {
      case 'F': return 'تقدم للأمام (FORWARD)';
      case 'B': return 'رجوع للخلف (BACKWARD)';
      case 'L': return 'انعطاف لليسار (LEFT)';
      case 'R': return 'انعطاف لليمين (RIGHT)';
      case 'S':
      default:
        return 'وضع التوقف والحياد (STOP / NEUTRAL)';
    }
  };

  const formatDeg = (deg: number) => {
    const sign = deg > 0 ? '+' : deg < 0 ? '' : ' ';
    return `${sign}${deg.toFixed(1)}°`;
  };

  const eyeDir = motion.eyeData?.direction || 'Stop';
  const opennessPct = motion.eyeData?.eyeOpenness ?? (motion.eyeData?.eyeOpen ? 100 : 0);
  const activeControlMode = motion.controlMode || eyeTrackingService.getControlMode();

  return (
    <div className="flex flex-col gap-4 font-sans select-none text-right" dir="rtl">
      {/* 1. Header Toolbar: Connection Diagnostic & Control Mode Switcher */}
      <div className="hud-panel p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-bold text-zinc-300 tracking-wide">مصدر البيانات:</span>
          {source === 'camera_tracking' ? (
            <span className="bg-cyan-950/80 border border-cyan-500/80 text-cyan-300 text-xs px-2.5 py-0.5 rounded-md font-mono font-bold flex items-center gap-1.5 shadow-glow-cyan">
              <span>كاميرا تتبع الرأس والعين المباشرة (OpenCV)</span>
            </span>
          ) : source === 'esp32_hardware' ? (
            <span className="bg-emerald-950/80 border border-emerald-500/80 text-emerald-300 text-xs px-2.5 py-0.5 rounded-md font-mono font-bold">
              حساس ESP32 المادي (USB COM)
            </span>
          ) : source === 'esp32_simulated' ? (
            <span className="bg-blue-950/80 border border-blue-500/80 text-blue-300 text-xs px-2.5 py-0.5 rounded-md font-mono font-bold">
              محاكي تدفق بيانات ESP32
            </span>
          ) : source === 'test_animation' ? (
            <span className="bg-purple-950/80 border border-purple-500/80 text-purple-300 text-xs px-2.5 py-0.5 rounded-md font-mono font-bold">
              دورة الاختبار التلقائية (Autopilot)
            </span>
          ) : (
            <span className="bg-zinc-800 text-zinc-300 text-xs px-2.5 py-0.5 rounded-md font-mono">
              محاكاة المزالق اليدوية
            </span>
          )}
        </div>

        {/* Independent Control Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <span className="text-[11px] font-bold text-zinc-400 px-2 font-sans">توجيه الكرسي عبر:</span>
          <button
            onClick={() => handleModeChange('eye_only')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeControlMode === 'eye_only'
                ? 'bg-cyan-600 text-white shadow-glow-cyan'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <span>👁️</span>
            <span>بؤبؤ العين فقط (منفصل)</span>
          </button>

          <button
            onClick={() => handleModeChange('head_only')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeControlMode === 'head_only'
                ? 'bg-emerald-600 text-white shadow-glow-emerald'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <span>👤</span>
            <span>حركة الرأس فقط (منفصل)</span>
          </button>

          <button
            onClick={() => handleModeChange('fused_head_eye')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeControlMode === 'fused_head_eye'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <span>🔀</span>
            <span>هجين مدمج (رأس + عين)</span>
          </button>
        </div>
      </div>

      {/* 2. Grid of Separated Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Module 1: حركة الرأس والفقرات العنقية (مستقلة تماماً) */}
        <div className="hud-panel p-4 rounded-xl flex flex-col gap-3.5 border border-zinc-800/80">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-950/70 border border-emerald-700/50 flex items-center justify-center text-emerald-400 text-sm">
                👤
              </div>
              <div>
                <h3 className="font-bold text-white text-xs tracking-wide">حركة وزوايا الرأس والعنق (مستقلة)</h3>
                <p className="text-[10px] text-zinc-400 font-mono">HEAD & CERVICAL KINEMATICS</p>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getCmdColorBadge(motion.headCommand || 'S')}`}>
              أمر الرأس: '{motion.headCommand || 'S'}'
            </span>
          </div>

          {/* Sub-card: Pitch */}
          <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-zinc-300">الميل الرأسي للأعلى والأسفل (Pitch)</span>
              <span className="text-emerald-400 font-mono font-bold text-sm tracking-tight">
                {formatDeg(motion.pitch)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
              <span>{motion.pitch > 2 ? 'انحناء للأسفل (خلف)' : motion.pitch < -2 ? 'رفع للأعلى (أمام)' : 'مستوٍ (حيادي)'}</span>
              <span className="text-zinc-400">[-45° إلى +45°]</span>
            </div>
            <div className="w-full bg-zinc-900/90 h-2 rounded-full overflow-hidden relative border border-zinc-800">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-600 z-10" />
              <div
                className={`h-full transition-all duration-75 ${motion.pitch >= 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{
                  marginRight: motion.pitch >= 0 ? '50%' : `${50 + (motion.pitch / 45) * 50}%`,
                  width: `${(Math.abs(motion.pitch) / 45) * 50}%`
                }}
              />
            </div>
          </div>

          {/* Sub-card: Roll */}
          <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-zinc-300">الإمالة الجانبية للكتفين (Roll)</span>
              <span className="text-purple-400 font-mono font-bold text-sm tracking-tight">
                {formatDeg(motion.roll)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
              <span>{motion.roll > 2 ? 'إمالة يمين' : motion.roll < -2 ? 'إمالة يسار' : 'مستوٍ (حيادي)'}</span>
              <span className="text-zinc-400">[-35° إلى +35°]</span>
            </div>
            <div className="w-full bg-zinc-900/90 h-2 rounded-full overflow-hidden relative border border-zinc-800">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-600 z-10" />
              <div
                className={`h-full transition-all duration-75 ${motion.roll >= 0 ? 'bg-purple-400' : 'bg-cyan-400'}`}
                style={{
                  marginRight: motion.roll >= 0 ? '50%' : `${50 + (motion.roll / 35) * 50}%`,
                  width: `${(Math.abs(motion.roll) / 35) * 50}%`
                }}
              />
            </div>
          </div>

          {/* Sub-card: Yaw */}
          <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-zinc-300">الدوران الأفقي (Yaw)</span>
              <span className="text-zinc-300 font-mono font-bold text-sm tracking-tight">
                {formatDeg(motion.yaw)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
              <span>{motion.yaw > 2 ? 'دوران يمين' : motion.yaw < -2 ? 'دوران يسار' : 'المنتصف'}</span>
              <span className="text-zinc-400">[-60° إلى +60°]</span>
            </div>
            <div className="w-full bg-zinc-900/90 h-2 rounded-full overflow-hidden relative border border-zinc-800">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-600 z-10" />
              <div
                className="h-full bg-zinc-400 transition-all duration-75"
                style={{
                  marginRight: motion.yaw >= 0 ? '50%' : `${50 + (motion.yaw / 60) * 50}%`,
                  width: `${(Math.abs(motion.yaw) / 60) * 50}%`
                }}
              />
            </div>
          </div>
        </div>

        {/* Module 2: تتبع بؤبؤ العين ونظام النظر (مستقلة تماماً) */}
        <div className="hud-panel p-4 rounded-xl flex flex-col gap-3.5 border border-zinc-800/80">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-950/70 border border-cyan-700/50 flex items-center justify-center text-cyan-400 text-sm">
                👁️
              </div>
              <div>
                <h3 className="font-bold text-white text-xs tracking-wide">تتبع بؤبؤ العين والنظر (مستقلة)</h3>
                <p className="text-[10px] text-zinc-400 font-mono">PUPIL & GAZE DIRECTION HUD</p>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getCmdColorBadge(motion.eyeData?.command || 'S')}`}>
              أمر العين: '{motion.eyeData?.command || 'S'}'
            </span>
          </div>

          {/* 4-Way Pupil Gaze Direction Grid */}
          <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">الاتجاه المرصود حالياً لبؤبؤ العين:</span>
              <span className={`font-mono font-bold text-sm px-2.5 py-0.5 rounded border ${
                eyeDir === 'Forward' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' :
                eyeDir === 'Backward' ? 'bg-amber-950 border-amber-500 text-amber-300' :
                eyeDir === 'Left' ? 'bg-cyan-950 border-cyan-500 text-cyan-300' :
                eyeDir === 'Right' ? 'bg-purple-950 border-purple-500 text-purple-300' :
                'bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}>
                {eyeDir === 'Forward' ? '▲ للأعلى / للأمام (FORWARD)' :
                 eyeDir === 'Backward' ? '▼ للأسفل / للخلف (BACKWARD)' :
                 eyeDir === 'Left' ? '◄ لليسار (LEFT)' :
                 eyeDir === 'Right' ? 'لليمين (RIGHT) ►' :
                 '● المنتصف الحيادي (STOP)'}
              </span>
            </div>

            {/* Visual 4-Direction Badges */}
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <div className={`p-2 rounded-lg border text-center transition-all ${
                eyeDir === 'Right' ? 'bg-purple-950 border-purple-500 text-purple-200 shadow-lg scale-[1.02]' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}>
                <span>👁️ اليمين (Right) [R]</span>
              </div>

              <div className={`p-2 rounded-lg border text-center transition-all ${
                eyeDir === 'Left' ? 'bg-cyan-950 border-cyan-500 text-cyan-200 shadow-glow-cyan scale-[1.02]' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}>
                <span>👁️ اليسار (Left) [L]</span>
              </div>

              <div className={`p-2 rounded-lg border text-center transition-all ${
                eyeDir === 'Forward' ? 'bg-emerald-950 border-emerald-500 text-emerald-200 shadow-glow-emerald scale-[1.02]' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}>
                <span>👁️ الأعلى / الأمام (Up) [F]</span>
              </div>

              <div className={`p-2 rounded-lg border text-center transition-all ${
                eyeDir === 'Backward' ? 'bg-amber-950 border-amber-500 text-amber-200 shadow-lg scale-[1.02]' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}>
                <span>👁️ الأسفل / الخلف (Down) [B]</span>
              </div>
            </div>
          </div>

          {/* Reticle Visualizer & Pupil Coordinates */}
          <div className="hud-panel-sub p-3 rounded-lg flex items-center justify-between gap-3">
            {/* 2D Compass Reticle Display */}
            <div className="w-20 h-20 bg-black border border-zinc-700 rounded-full relative flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              <div className="w-12 h-12 border border-dashed border-zinc-700 rounded-full" />
              <div className="w-full h-[1px] bg-zinc-800 absolute" />
              <div className="h-full w-[1px] bg-zinc-800 absolute" />
              
              {/* Compass Direction Labels */}
              <span className="absolute top-0.5 text-[8px] font-mono text-zinc-500 font-bold">F</span>
              <span className="absolute bottom-0.5 text-[8px] font-mono text-zinc-500 font-bold">B</span>
              <span className="absolute right-1 text-[8px] font-mono text-zinc-500 font-bold">R</span>
              <span className="absolute left-1 text-[8px] font-mono text-zinc-500 font-bold">L</span>

              {/* Pupil tracking point */}
              <div
                className={`w-4 h-4 rounded-full absolute transition-transform duration-75 shadow-lg ${
                  motion.eyeData?.eyeOpen ? 'bg-cyan-400 ring-2 ring-cyan-200/80 shadow-glow-cyan' : 'bg-red-500 opacity-60'
                }`}
                style={{
                  transform: `translate(${(motion.eyeData?.gazeX ?? 0) * 24}px, ${(motion.eyeData?.gazeY ?? 0) * 24}px)`
                }}
              />
            </div>

            {/* Coordinates & Gaze Direction */}
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-zinc-500">إحداثيات بؤبؤ العين:</span>
                <span className="text-zinc-200">
                  X:<strong className="text-cyan-400">{(motion.eyeData?.gazeX ?? 0).toFixed(2)}</strong> Y:<strong className="text-cyan-400">{(motion.eyeData?.gazeY ?? 0).toFixed(2)}</strong>
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-zinc-500">حالة فتح الجفن:</span>
                <span className={`font-bold ${opennessPct > 40 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {motion.eyeData?.eyeOpen ? `${opennessPct}% (مفتوحة)` : 'مغلقة [فرملة STOP]'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-400">
                يتم قياس حركة البؤبؤ بمستقل عن حركة الرأس
              </div>
            </div>
          </div>

          {/* Eyelid Openness Progress Meter */}
          <div className="hud-panel-sub p-2.5 rounded-lg flex flex-col gap-1.5">
            <div className="w-full bg-zinc-900/90 h-2 rounded-full overflow-hidden border border-zinc-800">
              <div
                className={`h-full transition-all duration-150 rounded-full ${
                  opennessPct > 40 ? 'bg-gradient-to-l from-emerald-500 to-cyan-400' : opennessPct > 20 ? 'bg-amber-400' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, opennessPct))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
              <span className="text-red-400">0% مغلقة (فرملة Deadman)</span>
              <span className="text-emerald-400">100% مفتوحة</span>
            </div>
          </div>
        </div>

        {/* Module 3: لوحة أوامر الكرسي المتحرك ومحركات الدفع */}
        <div className="hud-panel p-4 rounded-xl flex flex-col gap-3.5 border border-zinc-800/80">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-950/70 border border-purple-700/50 flex items-center justify-center text-purple-400 text-sm">
                🦼
              </div>
              <div>
                <h3 className="font-bold text-white text-xs tracking-wide">أوامر قيادة الكرسي المتحرك</h3>
                <p className="text-[10px] text-zinc-400 font-mono">WHEELCHAIR MOTOR DRIVE HUD</p>
              </div>
            </div>
            <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${getCmdColorBadge(motion.command)}`}>
              الأمر الفعال = '{motion.command}'
            </span>
          </div>

          {/* Active Command Status Display */}
          <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-2">
            <div className="flex justify-between items-center text-zinc-400 text-[10px] font-mono">
              <span>الأمر الصادر للمحركات (H-BRIDGE):</span>
              <span className="text-cyan-300 font-bold">
                {activeControlMode === 'eye_only' ? 'مصدر الأمر: بؤبؤ العين' : activeControlMode === 'head_only' ? 'مصدر الأمر: الرأس' : 'مصدر الأمر: هجين'}
              </span>
            </div>
            <div className="text-sm font-bold text-white tracking-wide">
              {getCmdArName(motion.command)}
            </div>
          </div>

          {/* 2D Directional Radar Cross */}
          <div className="hud-panel-sub p-3 rounded-lg flex items-center justify-around">
            <div className="flex flex-col gap-1 text-[11px] font-mono text-zinc-400">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${motion.command === 'F' ? 'bg-emerald-400 animate-ping' : 'bg-zinc-700'}`} />
                <span className={motion.command === 'F' ? 'text-emerald-300 font-bold' : ''}>أمام (Forward - F)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${motion.command === 'B' ? 'bg-amber-400 animate-ping' : 'bg-zinc-700'}`} />
                <span className={motion.command === 'B' ? 'text-amber-300 font-bold' : ''}>خلف (Backward - B)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${motion.command === 'L' ? 'bg-cyan-400 animate-ping' : 'bg-zinc-700'}`} />
                <span className={motion.command === 'L' ? 'text-cyan-300 font-bold' : ''}>يسار (Turn Left - L)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${motion.command === 'R' ? 'bg-purple-400 animate-ping' : 'bg-zinc-700'}`} />
                <span className={motion.command === 'R' ? 'text-purple-300 font-bold' : ''}>يمين (Turn Right - R)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${motion.command === 'S' ? 'bg-zinc-400' : 'bg-zinc-700'}`} />
                <span className={motion.command === 'S' ? 'text-zinc-300 font-bold' : ''}>توقف (Stop - S)</span>
              </div>
            </div>

            {/* Visual Radar Compass */}
            <div className="w-24 h-24 bg-black border border-zinc-800 rounded-xl relative flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute w-full h-[1px] bg-zinc-800" />
              <div className="absolute h-full w-[1px] bg-zinc-800" />
              <div className="absolute w-6 h-6 border border-zinc-700/80 bg-zinc-900/50 rounded-sm" />

              <span className={`absolute top-1 text-[9px] font-mono font-bold ${motion.command === 'F' ? 'text-emerald-400 scale-125' : 'text-zinc-600'}`}>▲ F</span>
              <span className={`absolute bottom-1 text-[9px] font-mono font-bold ${motion.command === 'B' ? 'text-amber-400 scale-125' : 'text-zinc-600'}`}>▼ B</span>
              <span className={`absolute right-1 text-[9px] font-mono font-bold ${motion.command === 'R' ? 'text-purple-400 scale-125' : 'text-zinc-600'}`}>R ▶</span>
              <span className={`absolute left-1 text-[9px] font-mono font-bold ${motion.command === 'L' ? 'text-cyan-400 scale-125' : 'text-zinc-600'}`}>◀ L</span>

              {/* Vector Dot */}
              <div
                className={`w-3.5 h-3.5 rounded-full absolute transition-all duration-75 shadow-md ${
                  motion.command === 'S' ? 'bg-zinc-500' : 'bg-white ring-4 ring-white/30'
                }`}
                style={{
                  transform: `translate(${
                    activeControlMode === 'eye_only'
                      ? (motion.eyeData?.gazeX ?? 0) * 36
                      : -Math.max(-36, Math.min(36, (motion.roll / 35) * 36))
                  }px, ${
                    activeControlMode === 'eye_only'
                      ? (motion.eyeData?.gazeY ?? 0) * 36
                      : Math.max(-36, Math.min(36, (motion.pitch / 45) * 36))
                  }px)`
                }}
              />
            </div>
          </div>

          {/* Real-time Outbound Motor PWM Indicators */}
          <div className="hud-panel-sub p-2.5 rounded-lg flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-sans text-[11px]">محرك أيسر (L):</span>
              <strong className="text-cyan-300 font-bold">{motorState.leftPwm} PWM</strong>
              <span className="text-[10px] text-zinc-500">({motorState.leftDir})</span>
            </div>

            <span className="text-zinc-700">|</span>

            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-sans text-[11px]">محرك أيمن (R):</span>
              <strong className="text-cyan-300 font-bold">{motorState.rightPwm} PWM</strong>
              <span className="text-[10px] text-zinc-500">({motorState.rightDir})</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Live Stream Event Log */}
      <div className="hud-panel p-3.5 rounded-xl flex flex-col gap-2 border border-zinc-800/80">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h4 className="text-xs font-bold text-zinc-300">سجل تدفق الأوامر الحي (Live Telemetry Stream)</h4>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">REALTIME AUDIT LOG</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {logs.slice(0, 3).map((log) => (
            <div key={log.id} className="hud-panel-sub px-3 py-1.5 rounded-lg flex items-center justify-between font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getCmdColorBadge(log.cmd)}`}>
                  {log.cmd}
                </span>
                <span className="text-zinc-200 font-sans">{log.labelAr}</span>
                <span className="text-[9px] text-cyan-300 font-sans">[{log.sourceType}]</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500 text-[10px]">
                <span className="truncate max-w-[140px]">{log.detail}</span>
                <span className="text-zinc-600">{log.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
