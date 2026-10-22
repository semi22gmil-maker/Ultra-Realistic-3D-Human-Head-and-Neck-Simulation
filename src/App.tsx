import React, { useState, useEffect } from 'react';
import { ThreeViewport } from './components/ThreeViewport';
import { TelemetryPanel } from './components/TelemetryPanel';
import { MotionControls } from './components/MotionControls';
import { SerialControlModal } from './components/SerialControlModal';
import { FirmwareGuideModal } from './components/FirmwareGuideModal';
import { ModelInfoModal } from './components/ModelInfoModal';
import { headController } from './services/headController';
import { serialController } from './services/serialController';
import { MotionData, SimulationConfig, ControlSource, SerialState, ModelMetadata } from './types';

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

  // Bottom Dock
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'telemetry' | 'tuning'>('controls');

  useEffect(() => {
    const unsubMotion = headController.subscribeMotion((data) => {
      setMotion(data);
      setSource(headController.getControlSource());
      setIsTestRunning(headController.isTestAnimationRunning());
    });

    const unsubSerial = serialController.subscribeState((state) => {
      setSerialState(state);
      setIsSimulating(serialController.isSimulating());
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
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleConfigChange = (partial: Partial<SimulationConfig>) => {
    headController.updateConfig(partial);
    setConfig(headController.getConfig());
  };

  const getCmdColorBadge = (cmd: string) => {
    switch (cmd) {
      case 'F': return 'bg-emerald-500 text-black border-emerald-400 font-bold';
      case 'B': return 'bg-amber-500 text-black border-amber-400 font-bold';
      case 'L': return 'bg-blue-500 text-white border-blue-400 font-bold';
      case 'R': return 'bg-purple-500 text-white border-purple-400 font-bold';
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
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-white shadow-glow" />
          <div className="flex flex-col">
            <h1 className="text-xs md:text-sm font-bold tracking-widest uppercase font-mono text-white flex items-center gap-2">
              3D HUMAN HEAD & NECK SIMULATION
              <span className="text-[10px] text-zinc-400 border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 rounded font-normal">
                WHEELCHAIR IMU
              </span>
            </h1>
            <span className="text-[10px] font-mono text-zinc-400">
              CERVICAL SPINE KINEMATICS • ESP32 / MPU6050 SERIAL CONTROL
            </span>
          </div>
        </div>

        {/* Top Right Action Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Serial Port / ESP32 Status Button */}
          <button
            onClick={() => setShowSerialModal(true)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono tracking-wider transition-all flex items-center gap-2 backdrop-blur-md shadow-lg ${
              serialState === 'connected'
                ? isSimulating
                  ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300'
                  : 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                : 'bg-zinc-900/80 border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                serialState === 'connected'
                  ? isSimulating ? 'bg-cyan-400' : 'bg-emerald-400'
                  : 'bg-zinc-500'
              }`}
            />
            <span>
              {serialState === 'connected'
                ? isSimulating ? 'ESP32 SIMULATOR' : 'ESP32 CONNECTED'
                : 'CONNECT ESP32'}
            </span>
          </button>

          {/* Model Info Button */}
          <button
            onClick={() => setShowModelModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="hidden sm:inline">MODEL SPECS</span>
          </button>

          {/* Firmware & Docs Button */}
          <button
            onClick={() => setShowFirmwareModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">FIRMWARE</span>
          </button>
        </div>
      </header>

      {/* 3. Floating Minimal Heads-Up Display (Visible even when dock is collapsed) */}
      <div className="absolute top-16 left-4 z-10 pointer-events-none flex flex-col gap-1.5 font-mono text-[11px]">
        <div className="bg-black/70 border border-zinc-800 px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-3">
          <span className="text-zinc-500">PITCH:</span>
          <strong className="text-white">{motion.pitch >= 0 ? '+' : ''}{motion.pitch.toFixed(1)}°</strong>
          <span className="text-zinc-500">ROLL:</span>
          <strong className="text-white">{motion.roll >= 0 ? '+' : ''}{motion.roll.toFixed(1)}°</strong>
          <span className="text-zinc-500">YAW:</span>
          <strong className="text-zinc-400">{motion.yaw >= 0 ? '+' : ''}{motion.yaw.toFixed(1)}°</strong>
          <span className="text-zinc-700">|</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getCmdColorBadge(motion.command)}`}>
            CMD='{motion.command}'
          </span>
        </div>
      </div>

      {/* 4. Unified Ergonomic Bottom Dock (100% compliant with Three.js guidelines) */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[96vw] max-w-4xl transition-all duration-300 ease-out flex flex-col items-center pointer-events-auto ${
          isDockCollapsed ? 'translate-y-[calc(100%-38px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Toggle Tab */}
        <button
          onClick={() => setIsDockCollapsed((prev) => !prev)}
          className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 px-4 py-1 rounded-t-xl text-[11px] font-mono tracking-widest transition-colors flex items-center gap-1.5 shadow-xl backdrop-blur-md"
        >
          {isDockCollapsed ? '▴ EXPAND CONTROLS [H]' : '▾ HIDE DOCK [H]'}
        </button>

        {/* Main Dock Container */}
        <div className="w-full bg-zinc-950/95 border border-zinc-800 rounded-xl rounded-t-none shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden">
          {/* Tab Selection Bar */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('controls')}
                className={`px-3 py-1 rounded text-xs font-mono font-semibold tracking-wider transition-colors ${
                  activeTab === 'controls'
                    ? 'bg-zinc-800 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                MOTION CONTROLS
              </button>

              <button
                onClick={() => setActiveTab('telemetry')}
                className={`px-3 py-1 rounded text-xs font-mono font-semibold tracking-wider transition-colors ${
                  activeTab === 'telemetry'
                    ? 'bg-zinc-800 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                TELEMETRY & WHEELCHAIR
              </button>

              <button
                onClick={() => setActiveTab('tuning')}
                className={`px-3 py-1 rounded text-xs font-mono font-semibold tracking-wider transition-colors ${
                  activeTab === 'tuning'
                    ? 'bg-zinc-800 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                KINEMATICS & VISUALS
              </button>
            </div>

            <div className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              SLIDERS ACTIVE • INSTANT REAL-TIME 3D UPDATES
            </div>
          </div>

          {/* Tab Contents */}
          <div className="p-3 max-h-[380px] overflow-y-auto">
            {activeTab === 'controls' && (
              <MotionControls
                motion={motion}
                config={config}
                onConfigChange={handleConfigChange}
                source={source}
                isTestRunning={isTestRunning}
              />
            )}

            {activeTab === 'telemetry' && (
              <TelemetryPanel
                motion={motion}
                source={source}
                serialState={serialState}
                fps={fps}
              />
            )}

            {activeTab === 'tuning' && (
              <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg flex flex-col gap-4 text-xs font-mono">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cervical Distribution */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span>CERVICAL SPINE FLEXION RATIO</span>
                      <strong className="text-emerald-400">{(config.neckDistribution * 100).toFixed(0)}% Neck / {((1 - config.neckDistribution) * 100).toFixed(0)}% Skull</strong>
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
                    <p className="text-[10px] text-zinc-500">
                      Controls the anatomical bending distribution between C1-C7 cervical vertebrae and the cranium.
                    </p>
                  </div>

                  {/* Wheelchair Deadband Threshold */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span>WHEELCHAIR DEADBAND</span>
                      <strong className="text-amber-400">±{config.deadband.toFixed(1)}°</strong>
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
                    <p className="text-[10px] text-zinc-500">
                      Resting neutral zone to prevent unintentional motor trigger from involuntary tremors.
                    </p>
                  </div>

                  {/* Wheelchair Activation Threshold */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span>WHEELCHAIR DRIVE THRESHOLD</span>
                      <strong className="text-cyan-400">±{config.threshold.toFixed(1)}°</strong>
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
                    <p className="text-[10px] text-zinc-500">
                      Tilt angle required to trigger continuous directional commands ('F', 'B', 'L', 'R').
                    </p>
                  </div>

                  {/* Camera Portrait FOV */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span>CAMERA PERSPECTIVE FOV</span>
                      <strong className="text-white">{config.cameraFov}°</strong>
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
                    <p className="text-[10px] text-zinc-500">
                      Lower FOV (35-40°) mimics a portrait telephoto lens without wide-angle facial distortion.
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

      <FirmwareGuideModal
        isOpen={showFirmwareModal}
        onClose={() => setShowFirmwareModal(false)}
      />

      <ModelInfoModal
        isOpen={showModelModal}
        onClose={() => setShowModelModal(false)}
        metadata={modelMeta}
      />
    </div>
  );
}
