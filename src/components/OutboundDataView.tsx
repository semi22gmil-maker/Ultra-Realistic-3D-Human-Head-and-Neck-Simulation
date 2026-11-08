import React, { useState, useEffect } from 'react';
import { 
  esp32ConnectionService, 
  MotorDriveState, 
  OutboundPacketLog, 
  PacketProtocol, 
  Esp32HardwareConfig 
} from '../services/esp32ConnectionService';
import { WheelchairCommand } from '../types';

export const OutboundDataView: React.FC = () => {
  const [motorState, setMotorState] = useState<MotorDriveState>(esp32ConnectionService.getMotorState());
  const [logs, setLogs] = useState<OutboundPacketLog[]>(esp32ConnectionService.getPacketLogs());
  const [config, setConfig] = useState<Esp32HardwareConfig>(esp32ConnectionService.getConfig());
  const [connStatus, setConnStatus] = useState(esp32ConnectionService.getConnectionStatus());
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    const unsub = esp32ConnectionService.subscribe(() => {
      setMotorState(esp32ConnectionService.getMotorState());
      setLogs(esp32ConnectionService.getPacketLogs());
      setConfig(esp32ConnectionService.getConfig());
      setConnStatus(esp32ConnectionService.getConnectionStatus());
    });
    return () => unsub();
  }, []);

  const handleProtocolChange = (protocol: PacketProtocol) => {
    esp32ConnectionService.saveConfig({ packetProtocol: protocol });
  };

  const handleAutoTxToggle = () => {
    esp32ConnectionService.saveConfig({ autoTransmit: !config.autoTransmit });
  };

  const handleManualCommand = (cmd: WheelchairCommand) => {
    esp32ConnectionService.updateMotion({
      pitch: cmd === 'F' ? 20 : cmd === 'B' ? -20 : 0,
      roll: cmd === 'R' ? 18 : cmd === 'L' ? -18 : 0,
      yaw: 0,
      rawPitch: 0,
      rawRoll: 0,
      rawYaw: 0,
      pitchMag: 20,
      rollMag: 18,
      command: cmd,
      timestamp: Date.now()
    });
    esp32ConnectionService.transmitCurrentPacket();
  };

  const copyEndpointUrl = () => {
    const url = `${window.location.origin}/api/esp32/command`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const currentPayload = esp32ConnectionService.formatOutboundPayload(motorState, config.packetProtocol);

  const getCmdColor = (cmd: WheelchairCommand) => {
    switch (cmd) {
      case 'F': return 'text-emerald-400 bg-emerald-950/80 border-emerald-500/80 shadow-glow-emerald';
      case 'B': return 'text-amber-400 bg-amber-950/80 border-amber-500/80';
      case 'L': return 'text-cyan-400 bg-cyan-950/80 border-cyan-500/80 shadow-glow-cyan';
      case 'R': return 'text-purple-400 bg-purple-950/80 border-purple-500/80';
      case 'S':
      default:
        return 'text-zinc-400 bg-zinc-800 border-zinc-700';
    }
  };

  const leftVolts = ((motorState.leftPwm / 255) * 24.0).toFixed(1);
  const rightVolts = ((motorState.rightPwm / 255) * 24.0).toFixed(1);

  return (
    <div className="flex flex-col gap-4 font-sans select-none text-right" dir="rtl">
      {/* 1. Header Toolbar */}
      <div className="hud-panel p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-zinc-800/80">
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${config.autoTransmit ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span className="text-zinc-300 font-sans font-bold">بث المحركات:</span>
            <strong className={config.autoTransmit ? 'text-emerald-300 font-bold' : 'text-zinc-400'}>
              {config.autoTransmit ? `نشط (${config.txRateHz} Hz)` : 'متوقف'}
            </strong>
          </div>

          <span className="text-zinc-700">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-sans">القناة:</span>
            <span className="text-cyan-300 font-bold">{esp32ConnectionService.getTransportArName(connStatus.transport)}</span>
          </div>

          <span className="text-zinc-700">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-sans">الحزم المرسلة:</span>
            <span className="text-white font-bold">{connStatus.txPackets}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoTxToggle}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
              config.autoTransmit
                ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
                : 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
            }`}
          >
            {config.autoTransmit ? '⏸ إيقاف مؤقت' : '▶ استئناف البث'}
          </button>

          <button
            onClick={() => esp32ConnectionService.clearLogs()}
            className="px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs transition-colors"
          >
            مسح السجل
          </button>
        </div>
      </div>

      {/* Deadman Safety Alert */}
      {motorState.deadmanActive && (
        <div className="p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-100 flex items-center justify-between text-xs animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛑</span>
            <span className="font-bold">فرملة الأمان الحيوي مفعلة (العينان مغلقتان) — توقف فوري لكافة محركات الكرسي المتحرك</span>
          </div>
          <span className="font-mono font-bold bg-red-900 px-2 py-0.5 rounded">PWM: 0</span>
        </div>
      )}

      {/* 2. Visual Dual Motor H-Bridge Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Left Motor */}
        <div className="hud-panel p-3.5 rounded-xl border border-zinc-800/90 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span className="text-xs font-bold text-white">المحرك الأيسر (Left Motor - ENA)</span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
              motorState.leftDir === 'FWD' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' :
              motorState.leftDir === 'REV' ? 'bg-amber-950 border-amber-500 text-amber-300' :
              'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              {motorState.leftDir === 'FWD' ? 'دوران للأمام ⟳' : motorState.leftDir === 'REV' ? 'عكسي للخلف ⟲' : 'فرملة STOP'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400">قوة الدفع PWM:</span>
              <strong className="text-cyan-300">{motorState.leftPwm} / 255 ({Math.round((motorState.leftPwm / 255) * 100)}%)</strong>
            </div>
            <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-150 rounded-full"
                style={{ width: `${(motorState.leftPwm / 255) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400 bg-zinc-950/60 px-2.5 py-1.5 rounded-lg border border-zinc-850">
            <span>فولتية الخرج: <b className="text-emerald-400">{leftVolts} V</b></span>
            <span>المنفذ: GPIO {config.pinMotorL_PWM}</span>
          </div>
        </div>

        {/* Right Motor */}
        <div className="hud-panel p-3.5 rounded-xl border border-zinc-800/90 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span className="text-xs font-bold text-white">المحرك الأيمن (Right Motor - ENB)</span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
              motorState.rightDir === 'FWD' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' :
              motorState.rightDir === 'REV' ? 'bg-amber-950 border-amber-500 text-amber-300' :
              'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              {motorState.rightDir === 'FWD' ? 'دوران للأمام ⟳' : motorState.rightDir === 'REV' ? 'عكسي للخلف ⟲' : 'فرملة STOP'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400">قوة الدفع PWM:</span>
              <strong className="text-cyan-300">{motorState.rightPwm} / 255 ({Math.round((motorState.rightPwm / 255) * 100)}%)</strong>
            </div>
            <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-150 rounded-full"
                style={{ width: `${(motorState.rightPwm / 255) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400 bg-zinc-950/60 px-2.5 py-1.5 rounded-lg border border-zinc-850">
            <span>فولتية الخرج: <b className="text-emerald-400">{rightVolts} V</b></span>
            <span>المنفذ: GPIO {config.pinMotorR_PWM}</span>
          </div>
        </div>
      </div>

      {/* 3. Protocol Selector & Outbound Payload */}
      <div className="hud-panel p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-zinc-200">صيغة التشفير الصادرة (Transmission Protocol):</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleProtocolChange('string_kv')}
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                config.packetProtocol === 'string_kv' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              نص مهيكل (CMD:F,L:200)
            </button>
            <button
              onClick={() => handleProtocolChange('raw_char')}
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                config.packetProtocol === 'raw_char' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              حرف مفرد ('F')
            </button>
            <button
              onClick={() => handleProtocolChange('json')}
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                config.packetProtocol === 'json' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => handleProtocolChange('binary_hex')}
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                config.packetProtocol === 'binary_hex' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              Hex
            </button>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 flex items-center justify-between font-mono text-xs" dir="ltr">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-sans text-[11px]">Tx Payload:</span>
            <span className="text-emerald-400 font-bold">{currentPayload.trim()}</span>
          </div>
          <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${getCmdColor(motorState.command)}`}>
            CMD='{motorState.command}'
          </span>
        </div>
      </div>

      {/* 4. Live Tx Log Monitor & Manual Test Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Manual Test Buttons */}
        <div className="hud-panel p-3 rounded-xl border border-zinc-800 flex flex-col justify-center items-center gap-1.5">
          <span className="text-xs font-bold text-zinc-300 mb-1">اختبار يدوي سريع</span>
          <button
            onClick={() => handleManualCommand('F')}
            className="w-24 py-1.5 rounded-lg bg-zinc-850 hover:bg-emerald-600 text-white text-xs font-bold border border-zinc-700 transition-colors"
          >
            ▲ أمام
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleManualCommand('L')}
              className="w-20 py-1.5 rounded-lg bg-zinc-850 hover:bg-cyan-600 text-white text-xs font-bold border border-zinc-700 transition-colors"
            >
              ◄ يسار
            </button>
            <button
              onClick={() => handleManualCommand('S')}
              className="w-20 py-1.5 rounded-lg bg-red-950 hover:bg-red-800 text-red-200 text-xs font-bold border border-red-700 transition-colors"
            >
              🛑 توقف
            </button>
            <button
              onClick={() => handleManualCommand('R')}
              className="w-20 py-1.5 rounded-lg bg-zinc-850 hover:bg-purple-600 text-white text-xs font-bold border border-zinc-700 transition-colors"
            >
              يمين ►
            </button>
          </div>
          <button
            onClick={() => handleManualCommand('B')}
            className="w-24 py-1.5 rounded-lg bg-zinc-850 hover:bg-amber-600 text-white text-xs font-bold border border-zinc-700 transition-colors"
          >
            ▼ خلف
          </button>
        </div>

        {/* Live Tx Log */}
        <div className="md:col-span-2 hud-panel p-3 rounded-xl border border-zinc-800 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-zinc-200">سجل إرسال الحزم (Tx Outbound Stream)</span>
            </div>
            <button
              onClick={copyEndpointUrl}
              className="text-[10px] text-cyan-300 hover:underline font-mono"
            >
              {copiedUrl ? '✓ تم النسخ' : 'نسخ رابط API'}
            </button>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 max-h-[140px] overflow-y-auto font-mono text-[11px] text-zinc-300 space-y-1" dir="ltr">
            {logs.slice(0, 6).map((log) => (
              <div key={log.id} className="flex justify-between items-center text-[10px] border-b border-zinc-900 pb-0.5">
                <span className="text-zinc-500">[{log.timestamp}] <b className="text-cyan-400">#{log.packetIndex}</b></span>
                <span className="text-emerald-300 truncate max-w-[220px]">{log.payload}</span>
                <span className="text-zinc-500">{log.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
