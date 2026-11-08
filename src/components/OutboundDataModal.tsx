import React, { useState, useEffect } from 'react';
import { 
  esp32ConnectionService, 
  MotorDriveState, 
  OutboundPacketLog, 
  PacketProtocol, 
  Esp32HardwareConfig 
} from '../services/esp32ConnectionService';
import { WheelchairCommand } from '../types';

interface OutboundDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OutboundDataModal: React.FC<OutboundDataModalProps> = ({ isOpen, onClose }) => {
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

  if (!isOpen) return null;

  const handleProtocolChange = (protocol: PacketProtocol) => {
    esp32ConnectionService.saveConfig({ packetProtocol: protocol });
  };

  const handleTxRateChange = (hz: number) => {
    esp32ConnectionService.saveConfig({ txRateHz: hz });
  };

  const handleAutoTxToggle = () => {
    esp32ConnectionService.saveConfig({ autoTransmit: !config.autoTransmit });
  };

  const handleManualCommand = (cmd: WheelchairCommand) => {
    // Injects temporary manual motion for testing motors
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

  const getCmdArName = (cmd: WheelchairCommand) => {
    switch (cmd) {
      case 'F': return 'أمام (FORWARD)';
      case 'B': return 'خلف (BACKWARD)';
      case 'L': return 'انعطاف يسار (LEFT)';
      case 'R': return 'انعطاف يمين (RIGHT)';
      case 'S':
      default:
        return 'توقف حيادي (STOP)';
    }
  };

  // Convert PWM 0-255 to estimated motor voltage (assuming 24V wheelchair battery system)
  const leftVolts = ((motorState.leftPwm / 255) * 24.0).toFixed(1);
  const rightVolts = ((motorState.rightPwm / 255) * 24.0).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-sans select-none animate-fadeIn">
      <div 
        className="hud-panel w-full max-w-4xl max-h-[92vh] rounded-2xl flex flex-col border border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.25)] overflow-hidden text-right"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-300 text-lg shadow-glow-emerald">
              📤
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>البيانات الصادرة من المحاكي إلى ESP32 (تحريك الكرسي)</span>
                <span className="text-[10px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded font-mono">
                  Outbound Motor Stream
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                مراقبة حزم الـ PWM وأوامر درايفر المحركات H-Bridge الصادرة في الوقت الحقيقي
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Global Transmission Diagnostic Bar */}
        <div className="px-6 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 font-mono">
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${config.autoTransmit ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              <span className="text-zinc-300 font-sans font-bold">حالة البث:</span>
              <strong className={config.autoTransmit ? 'text-emerald-300 font-bold' : 'text-zinc-400'}>
                {config.autoTransmit ? `بث نشط (${config.txRateHz} Hz)` : 'متوقف مؤقتاً'}
              </strong>
            </div>

            <span className="text-zinc-600">|</span>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 font-sans">القناة:</span>
              <span className="text-cyan-300 font-bold">{esp32ConnectionService.getTransportArName(connStatus.transport)}</span>
            </div>

            <span className="text-zinc-600">|</span>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 font-sans">إجمالي الحزم الصادرة:</span>
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
              {config.autoTransmit ? '⏸ إيقاف البث مؤقتاً' : '▶ استئناف البث المستمر'}
            </button>

            <button
              onClick={() => esp32ConnectionService.clearLogs()}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs transition-colors"
            >
              مسح السجل
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Deadman Safety Alert if engaged */}
          {motorState.deadmanActive && (
            <div className="p-3.5 rounded-xl bg-red-950/90 border-2 border-red-500 text-red-100 flex items-center justify-between shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🛑</span>
                <div>
                  <h4 className="text-xs font-bold">فرملة الأمان الحيوي مفعلة (Deadman Safety Brake Active)</h4>
                  <p className="text-[11px] text-red-200">
                    تم رصد إغلاق العينين أو توقف الإشارة الحيوية — تم تعيين PWM إلى 0 وتفعيل ريلاي التوقف الفوري فورياً.
                  </p>
                </div>
              </div>
              <span className="font-mono font-bold bg-red-900 border border-red-700 px-2.5 py-1 rounded text-xs">
                PWM = 0
              </span>
            </div>
          )}

          {/* Dual Motor H-Bridge Dynamic Visual Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Motor Card */}
            <div className="hud-panel-sub p-4 rounded-xl border border-zinc-800/90 flex flex-col gap-3">
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
                  {motorState.leftDir === 'FWD' ? 'دوران للأمام ⟳' : motorState.leftDir === 'REV' ? 'دوران عكسي للخلف ⟲' : 'فرملة STOP'}
                </span>
              </div>

              {/* PWM Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-zinc-400">قوة الدفع PWM (0-255):</span>
                  <strong className="text-cyan-300 text-sm">{motorState.leftPwm} / 255</strong>
                </div>
                <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-150 rounded-full"
                    style={{ width: `${(motorState.leftPwm / 255) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-850">
                <div>
                  <span className="text-zinc-500 block text-[10px]">النسبة المئوية:</span>
                  <span className="text-zinc-250 font-bold">{Math.round((motorState.leftPwm / 255) * 100)}%</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">فولتية الخرج التقديرية:</span>
                  <span className="text-emerald-400 font-bold">{leftVolts} V</span>
                </div>
              </div>
            </div>

            {/* Right Motor Card */}
            <div className="hud-panel-sub p-4 rounded-xl border border-zinc-800/90 flex flex-col gap-3">
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
                  {motorState.rightDir === 'FWD' ? 'دوران للأمام ⟳' : motorState.rightDir === 'REV' ? 'دوران عكسي للخلف ⟲' : 'فرملة STOP'}
                </span>
              </div>

              {/* PWM Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-zinc-400">قوة الدفع PWM (0-255):</span>
                  <strong className="text-cyan-300 text-sm">{motorState.rightPwm} / 255</strong>
                </div>
                <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-150 rounded-full"
                    style={{ width: `${(motorState.rightPwm / 255) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-850">
                <div>
                  <span className="text-zinc-500 block text-[10px]">النسبة المئوية:</span>
                  <span className="text-zinc-250 font-bold">{Math.round((motorState.rightPwm / 255) * 100)}%</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">فولتية الخرج التقديرية:</span>
                  <span className="text-emerald-400 font-bold">{rightVolts} V</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Command & Format Selector */}
          <div className="hud-panel-sub p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-200">نسق تشفير الحزمة الصادرة (Packet Protocol)</label>
                <p className="text-[11px] text-zinc-400">
                  حدد الصيغة التي يبرمج عليها كود الـ ESP32 الخاص بك لاستقبال الأوامر
                </p>
              </div>

              {/* Protocol Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleProtocolChange('string_kv')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    config.packetProtocol === 'string_kv'
                      ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-glow-emerald'
                      : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  نص منظم (CMD:F,L:200,R:200)
                </button>

                <button
                  onClick={() => handleProtocolChange('raw_char')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    config.packetProtocol === 'raw_char'
                      ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-glow-emerald'
                      : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  حرف مفرد ('F', 'B', 'L', 'R')
                </button>

                <button
                  onClick={() => handleProtocolChange('json')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    config.packetProtocol === 'json'
                      ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-glow-emerald'
                      : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  JSON Payload
                </button>

                <button
                  onClick={() => handleProtocolChange('binary_hex')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    config.packetProtocol === 'binary_hex'
                      ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-glow-emerald'
                      : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  Hex Binary
                </button>
              </div>
            </div>

            {/* Current Real-time Outbound String Preview */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-4 font-mono text-xs" dir="ltr">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-zinc-500 text-[11px] select-none font-sans">Current Tx:</span>
                <span className="text-emerald-400 font-bold tracking-wider">{currentPayload.trim()}</span>
              </div>
              <span className={`px-2.5 py-1 rounded border text-xs font-bold font-sans ${getCmdColor(motorState.command)}`}>
                {getCmdArName(motorState.command)}
              </span>
            </div>
          </div>

          {/* Quick Manual Test Pad */}
          <div className="hud-panel-sub p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-zinc-200">لوحة الاختبار اليدوي السريع للمحركات (Motor Override Test)</h3>
            <p className="text-[11px] text-zinc-400">
              اضغط على أزرار الاتجاهات لإرسال نبضات اختبار مباشرة للمحركات والتأكد من استجابة درايفر ESP32
            </p>

            <div className="flex flex-col items-center gap-2 py-2">
              <button
                onClick={() => handleManualCommand('F')}
                className="w-32 py-2 rounded-xl bg-zinc-850 hover:bg-emerald-600 text-white font-bold text-xs border border-zinc-700 hover:border-emerald-500 transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>▲ تقدم للأمام (F)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleManualCommand('L')}
                  className="w-32 py-2 rounded-xl bg-zinc-850 hover:bg-cyan-600 text-white font-bold text-xs border border-zinc-700 hover:border-cyan-500 transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <span>◄ يسار (L)</span>
                </button>

                <button
                  onClick={() => handleManualCommand('S')}
                  className="w-32 py-2 rounded-xl bg-red-950 hover:bg-red-800 text-red-100 font-bold text-xs border border-red-600 transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <span>🛑 توقف (STOP)</span>
                </button>

                <button
                  onClick={() => handleManualCommand('R')}
                  className="w-32 py-2 rounded-xl bg-zinc-850 hover:bg-purple-600 text-white font-bold text-xs border border-zinc-700 hover:border-purple-500 transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <span>يمين (R) ►</span>
                </button>
              </div>

              <button
                onClick={() => handleManualCommand('B')}
                className="w-32 py-2 rounded-xl bg-zinc-850 hover:bg-amber-600 text-white font-bold text-xs border border-zinc-700 hover:border-amber-500 transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>▼ رجوع للخلف (B)</span>
              </button>
            </div>
          </div>

          {/* Live Outbound Tx Stream Log */}
          <div className="hud-panel-sub p-4 rounded-xl border border-zinc-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-xs font-bold text-zinc-200">شاشة مراقبة حزم الإرسال (Tx Stream Monitor)</h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">آخر {logs.length} حزم أرسلت</span>
            </div>

            <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-3 max-h-[220px] overflow-y-auto font-mono text-[11px] text-zinc-300 space-y-1" dir="ltr">
              {logs.length === 0 ? (
                <div className="text-zinc-600 text-center py-4">في انتظار أول حزمة بيانات صادرة...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between border-b border-zinc-900/80 pb-0.5 hover:bg-zinc-900/40">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">[{log.timestamp}]</span>
                      <span className="text-cyan-400 font-bold">#{log.packetIndex}</span>
                      <span className="text-emerald-300 font-semibold">{log.payload}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span>{log.bytes} B</span>
                      <span>{log.latencyMs}ms</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Direct HTTP / Polling Endpoint for ESP32 */}
          <div className="hud-panel-sub p-4 rounded-xl border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <h4 className="font-bold text-white">رابط قراءة الأوامر المباشر عبر شبكة Wi-Fi (HTTP GET Endpoint)</h4>
              <p className="text-zinc-400 text-[11px]">
                يمكن لـ ESP32 سحب الأمر عبر طلب HTTP GET سريع ومباشر
              </p>
            </div>

            <button
              onClick={copyEndpointUrl}
              className="bg-zinc-800 hover:bg-zinc-700 text-cyan-300 font-mono text-xs px-3.5 py-2 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {copiedUrl ? '✓ تم النسخ' : '📋 نسخ الرابط /api/esp32/command'}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs">
          <span className="text-zinc-400">
            معدل التحديث الحالي: <code className="text-emerald-300 font-mono font-bold">{config.txRateHz} Hz</code> ({Math.round(1000 / config.txRateHz)}ms لكل حزمة)
          </span>

          <button
            onClick={onClose}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-5 py-2 rounded-lg transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
