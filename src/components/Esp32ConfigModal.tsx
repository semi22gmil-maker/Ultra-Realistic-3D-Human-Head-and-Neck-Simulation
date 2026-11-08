import React, { useState, useEffect } from 'react';
import { esp32ConnectionService, Esp32HardwareConfig, Esp32TransportType } from '../services/esp32ConnectionService';

interface Esp32ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Esp32ConfigModal: React.FC<Esp32ConfigModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<Esp32HardwareConfig>(esp32ConnectionService.getConfig());
  const [activeTab, setActiveTab] = useState<'wifi' | 'ble' | 'hardware' | 'code' | 'python'>('wifi');
  const [connStatus, setConnStatus] = useState(esp32ConnectionService.getConnectionStatus());
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPythonCode, setCopiedPythonCode] = useState(false);

  useEffect(() => {
    const unsub = esp32ConnectionService.subscribe(() => {
      setConnStatus(esp32ConnectionService.getConnectionStatus());
      setConfig(esp32ConnectionService.getConfig());
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleUpdate = (partial: Partial<Esp32HardwareConfig>) => {
    esp32ConnectionService.saveConfig(partial);
    setConfig(esp32ConnectionService.getConfig());
    setSuccessMessage('تم حفظ الإعدادات بنجاح');
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleWifiConnect = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await esp32ConnectionService.connectWifi();
      setSuccessMessage('تم الاتصال بـ ESP32 عبر شبكة Wi-Fi بنجاح!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر الاتصال بـ ESP32 عبر Wi-Fi');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBleConnect = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await esp32ConnectionService.connectBluetooth();
      setSuccessMessage('تم الاقتران بـ ESP32 عبر البلوتوث بنجاح!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر الاقتران عبر البلوتوث');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    esp32ConnectionService.disconnectCurrent();
    setSuccessMessage('تم قطع الاتصال');
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleCopyArduinoCode = () => {
    const code = esp32ConnectionService.generateArduinoCode();
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-sans select-none animate-fadeIn">
      <div 
        className="hud-panel w-full max-w-4xl max-h-[92vh] rounded-2xl flex flex-col border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden text-right"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/60 flex items-center justify-center text-cyan-300 text-lg shadow-glow-cyan">
              ⚙️
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>إعدادات وحدة ESP32 والتحكم بالكرسي المتحرك</span>
                <span className="text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 rounded font-mono">
                  Wi-Fi • BLE • H-Bridge
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                تهيئة قناة الاتصال اللاسلكي، ومنافذ درايفر المحركات، وتوليد كود الأردوينو المتطابق
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

        {/* Global Connection Badge Status */}
        <div className="px-6 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-mono">
            <span className={`w-2.5 h-2.5 rounded-full ${connStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-zinc-300 font-sans font-bold">الحالة الحالية:</span>
            <span className={connStatus.connected ? 'text-emerald-300 font-bold' : 'text-amber-300'}>
              {connStatus.statusText}
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400">{connStatus.endpoint}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[11px]">قناة النقل:</span>
            <select
              value={connStatus.transport}
              onChange={(e) => esp32ConnectionService.setTransport(e.target.value as Esp32TransportType)}
              className="bg-zinc-950 border border-zinc-700 text-cyan-300 text-xs px-2.5 py-1 rounded-lg font-bold cursor-pointer"
            >
              <option value="serial">USB Serial (كابل مباشر)</option>
              <option value="wifi">Wi-Fi (لاسلكي شبكة)</option>
              <option value="ble">Bluetooth BLE (بلوتوث)</option>
              <option value="virtual">محاكي افتراضي (Virtual Loopback)</option>
            </select>
          </div>
        </div>

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-red-950/80 border border-red-500/80 text-red-200 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 text-xs flex items-center gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-zinc-800 bg-zinc-900/40 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('wifi')}
            className={`pb-3 px-3 text-xs font-bold tracking-wide transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'wifi'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>📡 اتصال Wi-Fi اللاسلكي</span>
          </button>

          <button
            onClick={() => setActiveTab('ble')}
            className={`pb-3 px-3 text-xs font-bold tracking-wide transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'ble'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>📶 اتصال البلوتوث (BLE)</span>
          </button>

          <button
            onClick={() => setActiveTab('hardware')}
            className={`pb-3 px-3 text-xs font-bold tracking-wide transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'hardware'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>⚡ إعدادات المحركات والمنافذ (GPIO)</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`pb-3 px-3 text-xs font-bold tracking-wide transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>💻 كود Arduino C++ المتطابق</span>
          </button>

          <button
            onClick={() => setActiveTab('python')}
            className={`pb-3 px-3 text-xs font-bold tracking-wide transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'python'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🐍 كود بايثون الذكي (MediaPipe)</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* TAB 1: Wi-Fi Settings */}
          {activeTab === 'wifi' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Wi-Fi Mode */}
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">نمط تشغيل شبكة الـ Wi-Fi في ESP32</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => handleUpdate({ wifiMode: 'station' })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        config.wifiMode === 'station'
                          ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 shadow-glow-cyan'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                      }`}
                    >
                      عميل شبكة (Station / STA)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate({ wifiMode: 'access_point' })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        config.wifiMode === 'access_point'
                          ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 shadow-glow-cyan'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                      }`}
                    >
                      نقطة وصول (Access Point / AP)
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    {config.wifiMode === 'station'
                      ? 'يتصل ESP32 بنفس راوتر المنزل أو نقطة اتصال هاتفك مع الحاسوب.'
                      : 'ينشئ ESP32 شبكة Wi-Fi خاصة به مباشرة، ويتصل الحاسوب بها.'}
                  </p>
                </div>

                {/* Wi-Fi Protocol */}
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">بروتوكول البث عبر Wi-Fi</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => handleUpdate({ wifiProtocol: 'websocket' })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        config.wifiProtocol === 'websocket'
                          ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                      }`}
                    >
                      WebSocket ثنائي (ws://)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate({ wifiProtocol: 'http_rest' })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        config.wifiProtocol === 'http_rest'
                          ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                      }`}
                    >
                      HTTP REST / Polling
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    WebSocket يوفر زمن استجابة فائق (أقل من 5 مللي ثانية) مناسب للتحكم الفوري بالكرسي.
                  </p>
                </div>
              </div>

              {/* IP & Port Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">عنوان IP الخاص بـ ESP32</label>
                  <input
                    type="text"
                    value={config.wifiIp}
                    onChange={(e) => handleUpdate({ wifiIp: e.target.value.trim() })}
                    placeholder="مثال: 192.168.4.1 أو 192.168.1.105"
                    className="bg-zinc-950 border border-zinc-700 text-cyan-300 px-3 py-2 rounded-lg text-xs font-mono focus:border-cyan-400 outline-none"
                    dir="ltr"
                  />
                  <span className="text-[11px] text-zinc-400">
                    الافتراضي في نمط AP هو <code className="text-zinc-200">192.168.4.1</code>. وفي نمط STA يظهر في شاشة السيريال بالأردوينو.
                  </span>
                </div>

                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">منفذ الاتصال (Port)</label>
                  <input
                    type="number"
                    value={config.wifiPort}
                    onChange={(e) => handleUpdate({ wifiPort: parseInt(e.target.value, 10) || 81 })}
                    placeholder="81"
                    className="bg-zinc-950 border border-zinc-700 text-cyan-300 px-3 py-2 rounded-lg text-xs font-mono focus:border-cyan-400 outline-none"
                    dir="ltr"
                  />
                  <span className="text-[11px] text-zinc-400">
                    المنفذ القياسي لخادم WebSocket هو <code className="text-zinc-200">81</code> أو <code className="text-zinc-200">80</code> للـ HTTP.
                  </span>
                </div>
              </div>

              {/* SSID & Password */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">اسم شبكة الـ Wi-Fi (SSID)</label>
                  <input
                    type="text"
                    value={config.wifiSsid}
                    onChange={(e) => handleUpdate({ wifiSsid: e.target.value })}
                    className="bg-zinc-950 border border-zinc-700 text-white px-3 py-2 rounded-lg text-xs font-mono focus:border-cyan-400 outline-none"
                    dir="ltr"
                  />
                </div>

                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">كلمة مرور الشبكة</label>
                  <input
                    type="password"
                    value={config.wifiPass}
                    onChange={(e) => handleUpdate({ wifiPass: e.target.value })}
                    className="bg-zinc-950 border border-zinc-700 text-white px-3 py-2 rounded-lg text-xs font-mono focus:border-cyan-400 outline-none"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleWifiConnect}
                    disabled={isConnecting}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-glow-cyan transition-all"
                  >
                    {isConnecting ? (
                      <>
                        <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>جاري الاتصال بـ ESP32...</span>
                      </>
                    ) : (
                      <>
                        <span>🔗 بدء اتصال Wi-Fi مع ESP32</span>
                      </>
                    )}
                  </button>

                  {connStatus.connected && connStatus.transport === 'wifi' && (
                    <button
                      onClick={handleDisconnect}
                      className="bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors"
                    >
                      قطع الاتصال اللاسلكي
                    </button>
                  )}
                </div>

                <span className="text-xs font-mono text-zinc-400">
                  عنوان السيرفر المستهدف: <code className="text-cyan-300">ws://{config.wifiIp}:{config.wifiPort}</code>
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: Bluetooth BLE Settings */}
          {activeTab === 'ble' && (
            <div className="space-y-4">
              <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                <h3 className="text-xs font-bold text-zinc-200">اتصال مباشر عبر Web Bluetooth API</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  يتيح لك المتصفح الاقتران مباشرة بـ ESP32 عبر تقنية Bluetooth Low Energy (BLE UART) بدون الحاجة إلى شبكة Wi-Fi أو كابلات.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">اسم جهاز البلوتوث المعلن (BLE Advertised Name)</label>
                  <input
                    type="text"
                    value={config.bleDeviceName}
                    onChange={(e) => handleUpdate({ bleDeviceName: e.target.value })}
                    className="bg-zinc-950 border border-zinc-700 text-cyan-300 px-3 py-2 rounded-lg text-xs font-mono focus:border-cyan-400 outline-none"
                    dir="ltr"
                  />
                  <span className="text-[11px] text-zinc-400">
                    الاسم الافتراضي في كود ESP32 هو <code className="text-zinc-200">ESP32_WHEELCHAIR</code>
                  </span>
                </div>

                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">معرف الخدمة (Service UUID)</label>
                  <input
                    type="text"
                    value={config.bleServiceUuid}
                    onChange={(e) => handleUpdate({ bleServiceUuid: e.target.value })}
                    className="bg-zinc-950 border border-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-xs font-mono focus:border-cyan-400 outline-none text-[11px]"
                    dir="ltr"
                  />
                  <span className="text-[11px] text-zinc-400">
                    Nordic UART Service القياسي لتبادل البيانات التسلسلية
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleBleConnect}
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all"
                >
                  {isConnecting ? (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>جاري البحث والاقتران...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍 بحث واقتران عبر البلوتوث (Pair BLE)</span>
                    </>
                  )}
                </button>

                {connStatus.connected && connStatus.transport === 'ble' && (
                  <button
                    onClick={handleDisconnect}
                    className="bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors"
                  >
                    قطع اتصال البلوتوث
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Hardware Pins & Motor Configuration */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              {/* Motor Driver Type & Power */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">نوع درايفر المحركات (Motor Driver Module)</label>
                  <select
                    value={config.driverType}
                    onChange={(e) => handleUpdate({ driverType: e.target.value as any })}
                    className="bg-zinc-950 border border-zinc-700 text-cyan-300 text-xs px-3 py-2 rounded-lg font-bold"
                  >
                    <option value="L298N">L298N Dual H-Bridge (الشائع 2A)</option>
                    <option value="BTS7960">BTS7960 High-Power 43A (المخصص للكراسي الثقيلة)</option>
                    <option value="Cytron_MDD10A">Cytron MDD10A (PWM + DIR)</option>
                    <option value="DRV8833">DRV8833 Low Voltage Dual Bridge</option>
                  </select>
                  <p className="text-[11px] text-zinc-400">
                    لكراسي المعاقين الحقيقية ذات محركات 24V/250W يُنصح باستخدام درايفر <b className="text-zinc-200">BTS7960</b> لتحمل التيار العالي.
                  </p>
                </div>

                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <div className="flex justify-between items-center text-zinc-200 text-xs">
                    <span className="font-bold">حد السرعة القصوى للمحركات</span>
                    <strong className="text-cyan-400 font-mono font-bold">{config.maxSpeedPercent}%</strong>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={config.maxSpeedPercent}
                    onChange={(e) => handleUpdate({ maxSpeedPercent: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-cyan-500"
                  />
                  <p className="text-[11px] text-zinc-400">
                    يحد أقصى قيمة PWM صادرة للمحركات لحماية المستخدم أثناء المناورات الضيقة.
                  </p>
                </div>
              </div>

              {/* Pinout Details */}
              <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-3">
                <h3 className="text-xs font-bold text-zinc-200 flex items-center justify-between">
                  <span>خريطة منافذ الـ GPIO في لوحة ESP32</span>
                  <span className="text-[11px] font-mono text-zinc-400">ESP32 Pinout Map</span>
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono" dir="ltr">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Left PWM (ENA)</label>
                    <input
                      type="number"
                      value={config.pinMotorL_PWM}
                      onChange={(e) => handleUpdate({ pinMotorL_PWM: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-cyan-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Left DIR 1 (IN1)</label>
                    <input
                      type="number"
                      value={config.pinMotorL_DIR1}
                      onChange={(e) => handleUpdate({ pinMotorL_DIR1: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-zinc-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Left DIR 2 (IN2)</label>
                    <input
                      type="number"
                      value={config.pinMotorL_DIR2}
                      onChange={(e) => handleUpdate({ pinMotorL_DIR2: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-zinc-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Right PWM (ENB)</label>
                    <input
                      type="number"
                      value={config.pinMotorR_PWM}
                      onChange={(e) => handleUpdate({ pinMotorR_PWM: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-cyan-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Right DIR 1 (IN3)</label>
                    <input
                      type="number"
                      value={config.pinMotorR_DIR1}
                      onChange={(e) => handleUpdate({ pinMotorR_DIR1: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-zinc-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Right DIR 2 (IN4)</label>
                    <input
                      type="number"
                      value={config.pinMotorR_DIR2}
                      onChange={(e) => handleUpdate({ pinMotorR_DIR2: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-zinc-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Safety Relay / Buzzer</label>
                    <input
                      type="number"
                      value={config.pinBuzzerOrRelay}
                      onChange={(e) => handleUpdate({ pinBuzzerOrRelay: parseInt(e.target.value, 10) })}
                      className="bg-zinc-950 border border-zinc-700 text-amber-300 w-full px-2 py-1.5 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">MPU6050 I2C (SDA/SCL)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={config.pinMpuSDA}
                        onChange={(e) => handleUpdate({ pinMpuSDA: parseInt(e.target.value, 10) })}
                        className="bg-zinc-950 border border-zinc-700 text-emerald-300 w-1/2 px-1.5 py-1.5 rounded text-center"
                        title="SDA"
                      />
                      <input
                        type="number"
                        value={config.pinMpuSCL}
                        onChange={(e) => handleUpdate({ pinMpuSCL: parseInt(e.target.value, 10) })}
                        className="bg-zinc-950 border border-zinc-700 text-emerald-300 w-1/2 px-1.5 py-1.5 rounded text-center"
                        title="SCL"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* MPU6050 Address & Baud */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">عنوان حساس MPU6050 (I2C Address)</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => handleUpdate({ mpuAddress: '0x68' })}
                      className={`py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-all ${
                        config.mpuAddress === '0x68'
                          ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                      }`}
                    >
                      0x68 (AD0 إلى GND)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate({ mpuAddress: '0x69' })}
                      className={`py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-all ${
                        config.mpuAddress === '0x69'
                          ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-400 hover:text-white'
                      }`}
                    >
                      0x69 (AD0 إلى 3.3V)
                    </button>
                  </div>
                </div>

                <div className="hud-panel-sub p-4 rounded-xl flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-200">معدل نقل البود التسلسلي (Baud Rate)</label>
                  <select
                    value={config.baudRate}
                    onChange={(e) => handleUpdate({ baudRate: parseInt(e.target.value, 10) })}
                    className="bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg font-mono"
                  >
                    <option value={9600}>9600 Baud</option>
                    <option value={57600}>57600 Baud</option>
                    <option value={115200}>115200 Baud (موصى به لـ ESP32)</option>
                    <option value={230400}>230400 Baud (فائق السرعة)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Dynamically Generated Arduino C++ Code */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white">كود الأردوينو المولد تلقائياً (Arduino IDE Sketch)</h3>
                  <p className="text-[11px] text-zinc-400">
                    كود كامل ومعدل جاهز للرفع على لوحة ESP32، يدمج إعدادات Wi-Fi ومنافذ الدرايفر والفرملة الآمنة
                  </p>
                </div>

                <button
                  onClick={handleCopyArduinoCode}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-glow-cyan transition-all"
                >
                  {copiedCode ? '✓ تم النسخ إلى الحافظة' : '📋 نسخ كود C++ كاملاً'}
                </button>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto max-h-[360px] text-left font-mono text-[11px] text-zinc-300 leading-relaxed" dir="ltr">
                <pre>{esp32ConnectionService.generateArduinoCode()}</pre>
              </div>
            </div>
          )}

          {/* TAB 5: Python MediaPipe & ESP32 Dual Stream Controller Script */}
          {activeTab === 'python' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>كود بايثون للتحكم الذكي وتتبع العين والرأس (MediaPipe + WebSocket)</span>
                    <span className="text-[10px] bg-emerald-950 border border-emerald-500/50 text-emerald-300 px-2 py-0.5 rounded font-mono">
                      جاهز ومعدل
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    كود كامل ومعدل يربط الكاميرا وحركة الوجه مع متحكم ESP32 (IP: <span className="text-cyan-300 font-mono">{config.wifiIp}</span>) ومع محاكي الويب 3D في وقت واحد
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const codeText = `# تشغيل الكود المحدث
# راجع ملف: eye_tracker.py أو wheelchair_control.py
# تم تحديثه بالكامل في المشروع`;
                      navigator.clipboard.writeText(document.getElementById('python-script-box')?.innerText || codeText);
                      setCopiedPythonCode(true);
                      setTimeout(() => setCopiedPythonCode(false), 3000);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-glow-emerald transition-all"
                  >
                    {copiedPythonCode ? '✓ تم النسخ بنجاح' : '📋 نسخ كود Python كاملاً'}
                  </button>
                </div>
              </div>

              {/* Fixed Bugs Cards Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <span>🛡️</span>
                    <span>منع انهيار ESP32</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    تم إيقاف الإرسال العشوائي بكل فريم (60Hz) واستبداله بإرسال فوري عند تغير الأمر ونبض هادئ (4Hz) لمنع امتلاء ذاكرة ESP32.
                  </p>
                </div>

                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <span>👁️</span>
                    <span>كشف الرمش الموثوق (EAR)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    استبدال شرط البكسل الثابت العشوائي بحساب Eye Aspect Ratio الهندسي الذي يعمل بدقة مهما كانت مسافة المستخدم عن الكاميرا.
                  </p>
                </div>

                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <span>🔄</span>
                    <span>إعادة اتصال وبث مزدوج</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    خيط اتصال خلفي يستعيد الاتصال بـ ESP32 تلقائياً دون تجميد الفيديو، ويبث الحركة إلى المحاكي ثلاثي الأبعاد في الشاشة.
                  </p>
                </div>
              </div>

              {/* Python Code Block */}
              <div 
                id="python-script-box"
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto max-h-[340px] text-left font-mono text-[11px] text-emerald-300/90 leading-relaxed" 
                dir="ltr"
              >
                <pre>{`"""
========================================================================================
نظام تتبع حركة الرأس والعين المتقدم بواسطة MediaPipe + OpenCV والتحكم بالكرسي المتحرك ESP32
Advanced MediaPipe + OpenCV Eye & Head Tracking for ESP32 Smart Wheelchair & 3D Simulation
========================================================================================
"""
import sys, os, time, math, json, threading, queue, urllib.request
import cv2, numpy as np, mediapipe as mp

try:
    import websockets, asyncio
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

# ====== [1] إعدادات الاتصال والسرعة ======
ESP32_IP = "${config.wifiIp}"           # عنوان IP الخاص بـ ESP32
WS_URL = f"ws://{ESP32_IP}:81/"           # منفذ WebSocket
SIMULATION_API = "http://localhost:3000/api/eye-tracking"
SPEED = 20                               # سرعة الكرسي (20% للأمان)
HEARTBEAT_INTERVAL = 0.25                # إرسال نبضة كل 250 ميلي ثانية

# ====== [2] كاشف الوجه الشامل (يدعم MediaPipe الحديثة Tasks API والقديمة) ======
try:
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
    import mediapipe as mp
    options = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path='face_landmarker.task'),
        num_faces=1, min_face_detection_confidence=0.5
    )
    detector = mp_vision.FaceLandmarker.create_from_options(options)
    class FaceMeshShim:
        def process(self, rgb):
            res = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if res.face_landmarks and len(res.face_landmarks) > 0:
                class _L: landmark = res.face_landmarks[0]
                class _R: multi_face_landmarks = [_L()]
                return _R()
            class _E: multi_face_landmarks = None
            return _E()
    face_mesh = FaceMeshShim()
except Exception:
    import mediapipe as mp
    face_mesh = getattr(mp, 'solutions', mp).face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)

LEFT_IRIS = [474, 475, 476, 477]
RIGHT_IRIS = [469, 470, 471, 472]
LEFT_EYE_CORNERS = (33, 133)
RIGHT_EYE_CORNERS = (362, 263)
LEFT_EYE_LIDS = (159, 145)
RIGHT_EYE_LIDS = (386, 374)

class Esp32Client:
    def __init__(self, url):
        self.url = url
        self.cmd_queue = queue.Queue(maxsize=10)
        self.is_connected = False
        self.last_sent_cmd = None
        self.last_sent_time = 0.0
        if HAS_WEBSOCKETS:
            self.thread = threading.Thread(target=self._run, daemon=True)
            self.thread.start()

    def _run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._loop())

    async def _loop(self):
        while True:
            try:
                async with websockets.connect(self.url, ping_interval=5, ping_timeout=4) as ws:
                    self.is_connected = True
                    print(f"\\n[ESP32] ✓ تم الاتصال بـ ESP32: {self.url}")
                    while True:
                        try:
                            item = await asyncio.wait_for(
                                asyncio.get_event_loop().run_in_executor(None, self._get_cmd), timeout=0.1
                            )
                            if item: await ws.send(json.dumps(item))
                        except asyncio.TimeoutError: continue
            except Exception:
                self.is_connected = False
                await asyncio.sleep(2.5)

    def _get_cmd(self):
        try: return self.cmd_queue.get(timeout=0.1)
        except queue.Empty: return None

    def send(self, direction, speed):
        now = time.time()
        if (direction != self.last_sent_cmd) or (now - self.last_sent_time >= HEARTBEAT_INTERVAL):
            if self.cmd_queue.full():
                try: self.cmd_queue.get_nowait()
                except queue.Empty: pass
            self.cmd_queue.put({"dir": direction, "speed": int(speed)})
            self.last_sent_cmd = direction
            self.last_sent_time = now

esp32 = Esp32Client(WS_URL)

def send_to_sim(direction, gaze_x, gaze_y, eye_open, openness, pitch, roll, yaw, mode):
    def _post():
        try:
            payload = json.dumps({
                "direction": direction, "gazeX": round(float(gaze_x), 3), "gazeY": round(float(gaze_y), 3),
                "eyeOpen": bool(eye_open), "eyeOpenness": int(openness),
                "headPitch": round(float(pitch), 2), "headRoll": round(float(roll), 2), "headYaw": round(float(yaw), 2),
                "controlMode": str(mode)
            }).encode('utf-8')
            req = urllib.request.Request(SIMULATION_API, data=payload, headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(req, timeout=0.03)
        except Exception: pass
    threading.Thread(target=_post, daemon=True).start()

def get_ear(landmarks, corners, lids, w, h):
    c1 = np.array([landmarks[corners[0]].x * w, landmarks[corners[0]].y * h])
    c2 = np.array([landmarks[corners[1]].x * w, landmarks[corners[1]].y * h])
    l1 = np.array([landmarks[lids[0]].x * w, landmarks[lids[0]].y * h])
    l2 = np.array([landmarks[lids[1]].x * w, landmarks[lids[1]].y * h])
    width = np.linalg.norm(c1 - c2)
    return float(np.linalg.norm(l1 - l2) / width) if width > 1e-4 else 0.25

cap = cv2.VideoCapture(0)
smooth_p, smooth_y, smooth_gx = 0.0, 0.0, 0.0
calib_p, calib_y, calib_gx = 0.0, 0.0, 0.0
closed_start = None

print(">> تشغيل الكاميرا بنجاح! اضغط [c] للمعايرة، [q] للخروج.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break
    frame = cv2.flip(frame, 1)
    h, w = frame.shape[:2]
    res = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    
    cmd = "Stop"
    is_open = True
    ear_pct = 100
    raw_p, raw_y, raw_gx = 0.0, 0.0, 0.0

    if res.multi_face_landmarks:
        lm = res.multi_face_landmarks[0].landmark
        ear = (get_ear(lm, LEFT_EYE_CORNERS, LEFT_EYE_LIDS, w, h) + get_ear(lm, RIGHT_EYE_CORNERS, RIGHT_EYE_LIDS, w, h)) / 2.0
        ear_pct = int(min(100, max(0, (ear / 0.28) * 100)))

        # فرملة الأمان الفورية (Deadman Safety Brake)
        if ear < 0.19:
            if closed_start is None: closed_start = time.time()
            elif time.time() - closed_start >= 0.28: is_open = False
        else:
            closed_start = None
            is_open = True

        nose = np.array([lm[1].x * w, lm[1].y * h])
        raw_p = ((nose[1] - (h * 0.45)) / (h * 0.2)) * 30.0 - calib_p
        raw_y = ((nose[0] - (w * 0.50)) / (w * 0.2)) * 35.0 - calib_y
        
        il_x = sum([lm[i].x * w for i in LEFT_IRIS]) / 4.0
        ir_x = sum([lm[i].x * w for i in RIGHT_IRIS]) / 4.0
        raw_gx = (((il_x + ir_x) / 2.0 - (w * 0.5)) / (w * 0.15)) - calib_gx

    smooth_p += (raw_p - smooth_p) * 0.35
    smooth_y += (raw_y - smooth_y) * 0.35
    smooth_gx += (raw_gx - smooth_gx) * 0.40

    if not is_open:
        cmd = "Stop"
    elif abs(smooth_p) > 9.0:
        cmd = "Forward" if smooth_p < 0 else "Backward"
    elif abs(smooth_y) > 9.0 or abs(smooth_gx) > 0.25:
        cmd = "Left" if (smooth_y < 0 or smooth_gx < 0) else "Right"
    else:
        cmd = "Stop"

    esp32.send(cmd, SPEED)
    send_to_sim(cmd, smooth_gx, 0.0, is_open, ear_pct, smooth_p, 0.0, smooth_y, "fused_head_eye")

    cv2.putText(frame, f"CMD: {cmd} | EAR: {ear_pct}% | ESP32: {'OK' if esp32.is_connected else '...'}", 
                (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0) if is_open else (0, 0, 255), 2)
    cv2.imshow("Wheelchair Controller", frame)
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'): break
    elif key == ord('c'):
        calib_p += smooth_p; calib_y += smooth_y; calib_gx += smooth_gx

cap.release()
cv2.destroyAllWindows()`}</pre>
              </div>

              {/* Execution Commands Note */}
              <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-xl p-4 text-xs flex flex-col gap-3 font-sans">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-cyan-300 font-bold flex items-center gap-2">
                    <span>⚡</span>
                    <span>خطوات التحديث والتشغيل في جهازك (PowerShell):</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href="/eye_tracker.py"
                      download="eye_tracker.py"
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-glow-cyan"
                    >
                      <span>📥 تحميل ملف eye_tracker.py المحدث</span>
                    </a>
                  </div>
                </div>

                <div className="bg-black/90 rounded-lg p-3 text-zinc-300 select-all space-y-2 font-mono text-[11px] border border-cyan-500/30">
                  <div className="text-zinc-400"># 1. تحديث الملف تلقائياً من المحاكي المحلي بأمر واحد:</div>
                  <div className="text-cyan-300 font-bold">curl.exe -o eye_tracker.py http://localhost:3000/eye_tracker.py</div>

                  <div className="text-zinc-400 mt-2"># 2. تشغيل الكود مباشرة:</div>
                  <div className="text-emerald-400 font-bold">python eye_tracker.py</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs">
          <span className="text-zinc-400">
            يتم حفظ كافة الإعدادات تلقائياً في التخزين المحلي للمتصفح (Local Storage).
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
