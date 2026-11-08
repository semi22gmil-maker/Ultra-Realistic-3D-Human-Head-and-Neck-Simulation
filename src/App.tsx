import React, { useState, useEffect } from 'react';
import { ThreeViewport } from './components/ThreeViewport';
import { TelemetryPanel } from './components/TelemetryPanel';
import { MotionControls } from './components/MotionControls';
import { SerialControlModal } from './components/SerialControlModal';
import { FirmwareGuideModal } from './components/FirmwareGuideModal';
import { ModelInfoModal } from './components/ModelInfoModal';
import { EyeTrackingModal } from './components/EyeTrackingModal';
import { Esp32ConfigModal } from './components/Esp32ConfigModal';
import { OutboundDataModal } from './components/OutboundDataModal';
import { OutboundDataView } from './components/OutboundDataView';
import { headController } from './services/headController';
import { serialController } from './services/serialController';
import { eyeTrackingService } from './services/eyeTrackingService';
import { esp32ConnectionService } from './services/esp32ConnectionService';
import { MotionData, SimulationConfig, ControlSource, SerialState, ModelMetadata, WheelchairControlMode } from './types';

export default function App() {
  const [motion, setMotion] = useState<MotionData>(headController.getMotionData());
  const [source, setSource] = useState<ControlSource>(headController.getControlSource());
  const [config, setConfig] = useState<SimulationConfig>(headController.getConfig());
  const [serialState, setSerialState] = useState<SerialState>(serialController.getState());
  const [isTestRunning, setIsTestRunning] = useState<boolean>(headController.isTestAnimationRunning());
  const [isSimulating, setIsSimulating] = useState<boolean>(serialController.isSimulating());
  const [modelMeta, setModelMeta] = useState<ModelMetadata | null>(null);
  const [fps, setFps] = useState<number>(60);

  // Modals & Panels
  const [showSerialModal, setShowSerialModal] = useState<boolean>(false);
  const [showFirmwareModal, setShowFirmwareModal] = useState<boolean>(false);
  const [showModelModal, setShowModelModal] = useState<boolean>(false);
  const [showEyeModal, setShowEyeModal] = useState<boolean>(false);
  const [showEsp32ConfigModal, setShowEsp32ConfigModal] = useState<boolean>(false);
  const [showOutboundModal, setShowOutboundModal] = useState<boolean>(false);
  const [isPythonConnected, setIsPythonConnected] = useState<boolean>(eyeTrackingService.isPythonConnected());
  const [controlMode, setControlMode] = useState<WheelchairControlMode>(eyeTrackingService.getControlMode());

  // Bottom Dock
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'controls' | 'tuning' | 'motors'>('telemetry');

  useEffect(() => {
    const unsubMotion = headController.subscribeMotion((data) => {
      setMotion(data);
      setSource(headController.getControlSource());
      setIsTestRunning(headController.isTestAnimationRunning());
      esp32ConnectionService.updateMotion(data);
    });

    const unsubSerial = serialController.subscribeState((state) => {
      setSerialState(state);
      setIsSimulating(serialController.isSimulating());
    });

    const unsubPython = eyeTrackingService.subscribePythonConnection((connected) => {
      setIsPythonConnected(connected);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
          setIsDockCollapsed((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubMotion();
      unsubSerial();
      unsubPython();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleControlModeChange = (mode: WheelchairControlMode) => {
    setControlMode(mode);
    eyeTrackingService.setControlMode(mode);
  };

  const handleConfigChange = (partial: Partial<SimulationConfig>) => {
    headController.updateConfig(partial);
    setConfig(headController.getConfig());
  };

  const getCmdColorBadge = (cmd: string) => {
    switch (cmd) {
      case 'F': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400 font-bold';
      case 'B': return 'bg-amber-500/20 text-amber-300 border-amber-400 font-bold';
      case 'L': return 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold';
      case 'R': return 'bg-purple-500/20 text-purple-300 border-purple-400 font-bold';
      default: return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans text-white select-none">
      {/* 1. Main 3D Head & Neck WebGL Viewport */}
      <div className="absolute inset-0 z-0">
        <ThreeViewport
          config={config}
          onModelLoaded={(meta) => setModelMeta(meta)}
          onFpsUpdate={(val) => setFps(val)}
        />
      </div>

      {/* 2. Top Header Navigation Bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-black/95 via-black/75 to-transparent pointer-events-none">
        {/* Right side in RTL (Left in standard) */}
        <div className="flex items-center gap-3.5 pointer-events-auto">
          <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.8)]" />
          <div className="flex flex-col">
            <h1 className="text-sm md:text-base font-bold tracking-wide text-white flex items-center gap-2.5">
              <span>نظام محاكاة والتحكم الذكي بالكرسي المتحرك</span>
              <span className="text-[10px] text-cyan-300 border border-cyan-500/50 bg-cyan-950/60 px-2 py-0.5 rounded font-mono font-medium">
                AI + IMU
              </span>
            </h1>
            <span className="text-xs font-mono text-zinc-400">
              كينماتيكا الرأس والعنق • تتبع بؤبؤ العين (OpenCV) • اتصال ESP32
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Serial Port / ESP32 Status Button */}
          <button
            onClick={() => setShowSerialModal(true)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-sans tracking-wide transition-all flex items-center gap-2 backdrop-blur-md shadow-lg ${
              serialState === 'connected'
                ? isSimulating
                  ? 'bg-blue-950/80 border-blue-500/80 text-blue-300 shadow-glow-cyan'
                  : 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-glow-emerald'
                : 'bg-zinc-900/80 border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                serialState === 'connected'
                  ? isSimulating ? 'bg-blue-400' : 'bg-emerald-400'
                  : 'bg-zinc-500'
              }`}
            />
            <span className="font-semibold">
              {serialState === 'connected'
                ? isSimulating ? 'محاكي ESP32' : 'حساس ESP32 متصل'
                : 'ربط حساس ESP32'}
            </span>
          </button>

          {/* ESP32 Settings Modal Button (Wi-Fi, Bluetooth, Hardware Pins) */}
          <button
            onClick={() => setShowEsp32ConfigModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-cyan-950/70 border border-zinc-700/60 hover:border-cyan-500/70 text-zinc-300 hover:text-cyan-300 text-xs font-sans font-semibold transition-all flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          >
            <span>⚙️</span>
            <span>إعدادات ESP32</span>
          </button>

          {/* Outbound Motor Data to ESP32 Button */}
          <button
            onClick={() => setShowOutboundModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-emerald-950/70 border border-zinc-700/60 hover:border-emerald-500/70 text-zinc-300 hover:text-emerald-300 text-xs font-sans font-semibold transition-all flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          >
            <span>📤</span>
            <span>بيانات المحركات الصادرة</span>
          </button>

          {/* Eye Tracking (Python OpenCV) Button */}
          <button
            onClick={() => setShowEyeModal(true)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-sans tracking-wide transition-all flex items-center gap-2 backdrop-blur-md shadow-lg ${
              isPythonConnected
                ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 shadow-glow-cyan'
                : 'bg-zinc-900/80 border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isPythonConnected ? 'bg-cyan-400' : 'bg-zinc-500'
              }`}
            />
            <span className="font-semibold">
              {isPythonConnected ? 'تتبع العين (بث حي)' : 'تتبع العين (OpenCV)'}
            </span>
          </button>

          {/* Model Info Button */}
          <button
            onClick={() => setShowModelModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 text-xs font-sans transition-colors flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="hidden sm:inline font-semibold">خصائص المجسم 3D</span>
          </button>

          {/* Firmware & Docs Button */}
          <button
            onClick={() => setShowFirmwareModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 text-xs font-sans transition-colors flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline font-semibold">دليل الكود والربط</span>
          </button>
        </div>
      </header>

      {/* Prominent Sensor Connection Banner */}
      {serialState !== 'connected' ? (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            onClick={() => setShowSerialModal(true)}
            className="bg-amber-950/90 hover:bg-amber-900 border border-amber-500/80 text-amber-200 px-4 py-1.5 rounded-full text-xs font-sans tracking-wide flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all hover:scale-105"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>⚠️ حساس الرأس (ESP32) غير مربوط بالمتصفح — اضغط هنا للربط عبر كابل USB (COM)</span>
          </button>
        </div>
      ) : (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            onClick={() => setShowSerialModal(true)}
            className="bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/80 text-emerald-200 px-4 py-1.5 rounded-full text-xs font-sans tracking-wide flex items-center gap-2 shadow-2xl backdrop-blur-md"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>🟢 حساس ESP32 متصل ويستقبل زوايا الرأس بنجاح | اضغط لعرض منفذ السيريال</span>
          </button>
        </div>
      )}

      {/* Prominent Deadman Safety Brake Banner when eyes close */}
      {motion.eyeData && !motion.eyeData.eyeOpen && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-pulse">
          <div className="bg-red-950/95 border-2 border-red-500 text-red-100 px-5 py-2 rounded-full text-xs font-sans tracking-wide flex items-center gap-2.5 shadow-[0_0_25px_rgba(239,68,68,0.6)] backdrop-blur-md">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="font-bold">🛑 فرملة الأمان الحيوي (Deadman Brake): العينان مغلقتان — توقف فوري للكرسي المتحرك</span>
          </div>
        </div>
      )}

      {/* 3. Floating Minimal Heads-Up Display (Visible even when dock is collapsed) */}
      <div className="absolute top-16 left-4 z-10 pointer-events-none flex flex-col gap-1.5 font-mono text-xs">
        <div className="hud-panel px-3.5 py-2 rounded-xl flex items-center gap-3 border border-zinc-800/80 shadow-xl">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-sans text-[11px]">الرأس:</span>
            <strong className="text-white">
              P:{motion.pitch >= 0 ? '+' : ''}{motion.pitch.toFixed(1)}° R:{motion.roll >= 0 ? '+' : ''}{motion.roll.toFixed(1)}° Y:{motion.yaw >= 0 ? '+' : ''}{motion.yaw.toFixed(1)}°
            </strong>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-sans text-[11px]">العين:</span>
            <strong className={motion.eyeData?.eyeOpen ? 'text-cyan-300' : 'text-red-400'}>
              {motion.eyeData?.direction.toUpperCase() || 'STOP'}
            </strong>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-sans text-[11px]">الأمر:</span>
            <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${getCmdColorBadge(motion.command)}`}>
              CMD='{motion.command}'
            </span>
          </div>
        </div>
      </div>

      {/* 4. Unified Ergonomic Bottom Dock */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[96vw] max-w-5xl transition-all duration-300 ease-out flex flex-col items-center pointer-events-auto ${
          isDockCollapsed ? 'translate-y-[calc(100%-40px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Toggle Tab */}
        <button
          onClick={() => setIsDockCollapsed((prev) => !prev)}
          className="hud-panel hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 border-b-0 px-5 py-1.5 rounded-t-xl text-xs font-sans font-semibold tracking-wide transition-colors flex items-center gap-2 shadow-xl"
        >
          <span>{isDockCollapsed ? '▴ فتح لوحة التحكم [H]' : '▾ إخفاء لوحة التحكم [H]'}</span>
        </button>

        {/* Main Dock Container */}
        <div className="w-full bg-zinc-950/95 border border-zinc-800/90 rounded-xl rounded-t-none shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden">
          {/* Tab Selection Bar */}
          <div className="flex items-center justify-between border-b border-zinc-800/90 px-4 py-2.5 bg-zinc-900/50" dir="rtl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('telemetry')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-sans font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                  activeTab === 'telemetry'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/80 shadow-glow-cyan'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span>📊 لوحة المعطيات والبيانات المفصلة</span>
              </button>

              <button
                onClick={() => setActiveTab('controls')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-sans font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                  activeTab === 'controls'
                    ? 'bg-zinc-800 text-white border border-zinc-600'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span>🕹️ التحكم اليدوي وتجربة الحركة</span>
              </button>

              <button
                onClick={() => setActiveTab('tuning')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-sans font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                  activeTab === 'tuning'
                    ? 'bg-zinc-800 text-white border border-zinc-600'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span>⚙️ معايرة الحساسية والفيزياء</span>
              </button>

              <button
                onClick={() => setActiveTab('motors')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-sans font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                  activeTab === 'motors'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/80 shadow-glow-emerald'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span>📤 أوامر المحركات الصادرة (ESP32)</span>
              </button>
            </div>

            <div className="text-xs font-mono text-zinc-400 hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>تحديث حي فوري للنموذج 3D</span>
            </div>
          </div>

          {/* Tab Contents */}
          <div className="p-3.5 max-h-[420px] overflow-y-auto">
            {activeTab === 'telemetry' && (
              <TelemetryPanel
                motion={motion}
                source={source}
                serialState={serialState}
                fps={fps}
              />
            )}

            {activeTab === 'motors' && (
              <OutboundDataView />
            )}

            {activeTab === 'controls' && (
              <MotionControls
                motion={motion}
                config={config}
                onConfigChange={handleConfigChange}
                source={source}
                isTestRunning={isTestRunning}
              />
            )}

            {activeTab === 'tuning' && (
              <div className="hud-panel p-4 rounded-xl border border-zinc-800/80 flex flex-col gap-4 font-sans text-xs text-right" dir="rtl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cervical Distribution */}
                  <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex justify-between items-center text-zinc-200">
                      <span className="font-bold">نسبة انحناء الفقرات العنقية (Cervical Spine)</span>
                      <strong className="text-emerald-400 font-mono font-bold">
                        {(config.neckDistribution * 100).toFixed(0)}% الرقبة / {((1 - config.neckDistribution) * 100).toFixed(0)}% الجمجمة
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.60"
                      step="0.05"
                      value={config.neckDistribution}
                      onChange={(e) => handleConfigChange({ neckDistribution: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                    />
                    <p className="text-[11px] text-zinc-400">
                      يتحكم بتوزيع زاوية الانحناء التشريحي بين فقرات العنق C1-C7 وقاعدة الجمجمة.
                    </p>
                  </div>

                  {/* Wheelchair Deadband Threshold */}
                  <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex justify-between items-center text-zinc-200">
                      <span className="font-bold">حزام السكون الحيادي (Wheelchair Deadband)</span>
                      <strong className="text-amber-400 font-mono font-bold">±{config.deadband.toFixed(1)}°</strong>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="8.0"
                      step="0.5"
                      value={config.deadband}
                      onChange={(e) => handleConfigChange({ deadband: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[11px] text-zinc-400">
                      منطقة أمان لمنع انطلاق المحركات عند الارتعاشات الطبيعية الخفيفة أو حركات الرأس غير المقصودة.
                    </p>
                  </div>

                  {/* Wheelchair Activation Threshold */}
                  <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex justify-between items-center text-zinc-200">
                      <span className="font-bold">عتبة تفعيل حركة الكرسي (Drive Threshold)</span>
                      <strong className="text-cyan-400 font-mono font-bold">±{config.threshold.toFixed(1)}°</strong>
                    </div>
                    <input
                      type="range"
                      min="6.0"
                      max="25.0"
                      step="1.0"
                      value={config.threshold}
                      onChange={(e) => handleConfigChange({ threshold: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-cyan-500"
                    />
                    <p className="text-[11px] text-zinc-400">
                      زاوية الإمالة المطلوبة لإرسال أمر مستمر للمحركات ('F', 'B', 'L', 'R').
                    </p>
                  </div>

                  {/* Camera Portrait FOV */}
                  <div className="hud-panel-sub p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex justify-between items-center text-zinc-200">
                      <span className="font-bold">مجال رؤية الكاميرا (Perspective FOV)</span>
                      <strong className="text-white font-mono font-bold">{config.cameraFov}°</strong>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max="65"
                      step="1"
                      value={config.cameraFov}
                      onChange={(e) => handleConfigChange({ cameraFov: parseInt(e.target.value, 10) })}
                      className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-white"
                    />
                    <p className="text-[11px] text-zinc-400">
                      مجال رؤية 35°-40° يحاكي عدسة البورتريه الاحترافية لمنع تشوه الملامح الوجهية.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Dialog Modals */}
      <SerialControlModal
        isOpen={showSerialModal}
        onClose={() => setShowSerialModal(false)}
        serialState={serialState}
        isSimulating={isSimulating}
      />

      <Esp32ConfigModal
        isOpen={showEsp32ConfigModal}
        onClose={() => setShowEsp32ConfigModal(false)}
      />

      <OutboundDataModal
        isOpen={showOutboundModal}
        onClose={() => setShowOutboundModal(false)}
      />

      <FirmwareGuideModal
        isOpen={showFirmwareModal}
        onClose={() => setShowFirmwareModal(false)}
      />

      <ModelInfoModal
        isOpen={showModelModal}
        onClose={() => setShowModelModal(false)}
        metadata={modelMeta}
      />

      <EyeTrackingModal
        isOpen={showEyeModal}
        onClose={() => setShowEyeModal(false)}
        eyeData={motion.eyeData || eyeTrackingService.getLatestData()}
        controlMode={controlMode}
        onControlModeChange={handleControlModeChange}
      />
    </div>
  );
}
