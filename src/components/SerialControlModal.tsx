import React, { useState, useEffect, useRef } from 'react';
import { serialController } from '../services/serialController';
import { SerialState, SerialLogEntry } from '../types';

interface SerialControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  serialState: SerialState;
  isSimulating: boolean;
}

export const SerialControlModal: React.FC<SerialControlModalProps> = ({
  isOpen,
  onClose,
  serialState,
  isSimulating
}) => {
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);
  const [customInput, setCustomInput] = useState<string>('dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD=\'F\'');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(serialController.getLogs());

    const unsubLog = serialController.subscribeLogs((newEntry) => {
      setLogs((prev) => [...prev.slice(-120), newEntry]);
    });

    const unsubState = serialController.subscribeState((state, err) => {
      if (err) setErrorMessage(err);
      else if (state === 'connected') setErrorMessage(null);
    });

    return () => {
      unsubLog();
      unsubState();
    };
  }, []);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setErrorMessage(null);
    try {
      await serialController.connect(baudRate);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to serial port.');
    }
  };

  const handleDisconnect = async () => {
    await serialController.disconnect();
  };

  const handleToggleSimulator = () => {
    if (isSimulating) {
      serialController.stopSimulator();
    } else {
      serialController.startSimulator();
    }
  };

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    serialController.injectCustomLine(customInput);
  };

  const handleQuickPreset = (preset: string) => {
    setCustomInput(preset);
    serialController.injectCustomLine(preset);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl font-mono text-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h2 className="font-bold text-white text-sm tracking-wider font-sans">
              ESP32 & MPU6050 SERIAL HARDWARE CONTROLLER
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Port Configuration & Controls */}
        <div className="p-4 border-b border-zinc-800 bg-black/40 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-zinc-400 text-[11px]">
                <span>BAUD RATE:</span>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(parseInt(e.target.value, 10))}
                  disabled={serialState === 'connected'}
                  className="bg-zinc-900 border border-zinc-700 text-white rounded px-2 py-1 outline-none font-mono"
                >
                  <option value={9600}>9600</option>
                  <option value={19200}>19200</option>
                  <option value={38400}>38400</option>
                  <option value={57600}>57600</option>
                  <option value={115200}>115200 (Default ESP32)</option>
                  <option value={230400}>230400</option>
                </select>
              </label>

              <span className="text-[10px] text-zinc-500">TARGET: COM25 / USB-SERIAL</span>
            </div>

            {/* Connect / Disconnect Buttons */}
            <div className="flex items-center gap-2">
              {serialState === 'connected' ? (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 font-sans font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  DISCONNECT
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={!serialController.isSupported()}
                  className={`px-3 py-1.5 rounded-lg font-sans font-semibold text-xs transition-all flex items-center gap-1.5 shadow ${
                    serialController.isSupported()
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-black shadow-emerald-950'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  CONNECT ESP32 (WEB SERIAL)
                </button>
              )}

              {/* Hardware Simulator Toggle */}
              <button
                onClick={handleToggleSimulator}
                className={`px-3 py-1.5 rounded-lg font-sans font-medium text-xs tracking-wider transition-colors border ${
                  isSimulating
                    ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
                title="Broadcasts synthetic ESP32 serial data matching your exact dP/dR/CMD protocol at 50Hz"
              >
                {isSimulating ? 'STOP SIMULATOR' : 'START ESP32 SIMULATOR'}
              </button>
            </div>
          </div>

          {/* Web Serial Browser Compatibility Note */}
          {!serialController.isSupported() && (
            <div className="bg-amber-950/80 border border-amber-700/80 p-2.5 rounded text-amber-200 text-[11px] leading-relaxed">
              ⚠️ <strong>Web Serial API not supported in this browser.</strong> Please open this application in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Opera</strong>. Web Serial requires a secure context (HTTPS or localhost).
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-950/80 border border-red-700 p-2 rounded text-red-300 text-[11px]">
              {errorMessage}
            </div>
          )}

          {/* Diagnostic status banner */}
          <div className="bg-zinc-900/70 p-2.5 rounded border border-zinc-800 text-[11px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="font-semibold">حالة الاتصال والبيانات المستلمة:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${serialState === 'connected' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-800 text-zinc-400'}`}>
                {serialState === 'connected' ? `متصل (الحزم: ${logs.filter(l => l.type === 'incoming').length})` : 'غير متصل'}
              </span>
            </div>
            {serialState !== 'connected' ? (
              <p className="text-zinc-400 text-[11px]">
                👉 اضغط على <strong>CONNECT ESP32</strong> ثم اختر منفذ الـ COM الخاص بقطعتك في نافذة المتصفح المنبثقة.
              </p>
            ) : logs.filter(l => l.type === 'incoming').length === 0 ? (
              <p className="text-amber-400/90 text-[11px]">
                ⚠️ المنفذ مفتوح لكن لم تصل أية بيانات بعد. تأكد من أن الـ ESP32 يطبع عبر <code className="text-white bg-black px-1 rounded">Serial.println(...)</code> وتأكد من تطابق الـ Baud Rate (115200).
              </p>
            ) : (
              <p className="text-emerald-400 text-[11px]">
                ✓ تصل البيانات بنجاح من الحساس! يتم تدوير الرأس وفقاً لزوايا الميل.
              </p>
            )}
          </div>
        </div>

        {/* Live Serial Monitor Terminal */}
        <div className="p-4 flex-1 flex flex-col gap-2 min-h-[220px]">
          <div className="flex justify-between items-center text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-200">LIVE SERIAL TERMINAL</span>
              <span className="text-[10px] text-zinc-500 font-mono">({logs.length} messages)</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px]">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-zinc-900 border-zinc-700 accent-emerald-500"
                />
                AUTO-SCROLL
              </label>
              <button
                onClick={() => setLogs([])}
                className="hover:text-zinc-200 text-[10px] underline"
              >
                CLEAR
              </button>
            </div>
          </div>

          <div
            ref={terminalRef}
            className="flex-1 bg-black border border-zinc-800 rounded p-3 overflow-y-auto max-h-[260px] font-mono text-[11px] leading-relaxed flex flex-col gap-0.5"
          >
            {logs.length === 0 ? (
              <span className="text-zinc-600 italic">
                Terminal idle. Click "Connect ESP32 (Web Serial)" or "Start ESP32 Simulator" to view incoming newline packets.
              </span>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-zinc-600 shrink-0 select-none">{log.timestamp}</span>
                  <span
                    className={
                      log.type === 'incoming'
                        ? 'text-emerald-400'
                        : log.type === 'error'
                        ? 'text-red-400'
                        : log.type === 'success'
                        ? 'text-cyan-400'
                        : 'text-zinc-400'
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Test Packet Injector Form */}
          <form onSubmit={handleSendCustom} className="flex gap-2 mt-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Test packet: dP=+15.0 dR=-5.0 | CMD='F'"
              className="flex-1 bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded text-zinc-200 outline-none focus:border-emerald-500 font-mono text-xs"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-sans font-medium text-xs transition-colors"
            >
              INJECT TEST
            </button>
          </form>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
            <span className="text-zinc-500">QUICK TEST PACKETS:</span>
            <button
              onClick={() => handleQuickPreset("dP=+22.0 dR=0.0 | pMag=22.0 rMag=0.0 | CMD='F'")}
              className="bg-zinc-900 hover:bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded border border-zinc-800"
            >
              FORWARD (CMD='F')
            </button>
            <button
              onClick={() => handleQuickPreset("dP=-18.0 dR=0.0 | pMag=18.0 rMag=0.0 | CMD='B'")}
              className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 px-2 py-0.5 rounded border border-zinc-800"
            >
              BACKWARD (CMD='B')
            </button>
            <button
              onClick={() => handleQuickPreset("dP=0.0 dR=-20.0 | pMag=0.0 rMag=20.0 | CMD='L'")}
              className="bg-zinc-900 hover:bg-zinc-800 text-blue-400 px-2 py-0.5 rounded border border-zinc-800"
            >
              LEFT (CMD='L')
            </button>
            <button
              onClick={() => handleQuickPreset("dP=0.0 dR=+20.0 | pMag=0.0 rMag=20.0 | CMD='R'")}
              className="bg-zinc-900 hover:bg-zinc-800 text-purple-400 px-2 py-0.5 rounded border border-zinc-800"
            >
              RIGHT (CMD='R')
            </button>
            <button
              onClick={() => handleQuickPreset("dP=0.0 dR=0.0 | pMag=0.0 rMag=0.0 | CMD='S'")}
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-800"
            >
              STOP (CMD='S')
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
