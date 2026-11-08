import React, { useState, useEffect, useRef } from 'react';
import { eyeTrackingService } from '../services/eyeTrackingService';
import { EyeTrackingData, WheelchairControlMode } from '../types';

interface EyeTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  eyeData: EyeTrackingData;
  controlMode: WheelchairControlMode;
  onControlModeChange: (mode: WheelchairControlMode) => void;
}

export const EyeTrackingModal: React.FC<EyeTrackingModalProps> = ({
  isOpen,
  onClose,
  eyeData,
  controlMode,
  onControlModeChange
}) => {
  const [copied, setCopied] = useState(false);
  const [isPythonConnected, setIsPythonConnected] = useState(eyeTrackingService.isPythonConnected());
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const unsub = eyeTrackingService.subscribePythonConnection((connected) => {
      setIsPythonConnected(connected);
    });
    return () => unsub();
  }, []);

  // WebCam Browser Tracker Loop
  useEffect(() => {
    if (!webcamActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let isSubscribed = true;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' }
        });
        if (!isSubscribed) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Processing loop
        const processFrame = () => {
          if (!videoRef.current || !canvasRef.current || !webcamActive) return;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 160, 120);
            const frameData = ctx.getImageData(30, 25, 100, 70);
            const data = frameData.data;
            const w = 100;
            const h = 70;

            // Find min brightness and average in the eye ROI
            let minBrightness = 255;
            let sumBrightness = 0;
            const totalPixels = w * h;
            for (let i = 0; i < data.length; i += 4) {
              const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
              sumBrightness += b;
              if (b < minBrightness) minBrightness = b;
            }
            const avgBrightness = sumBrightness / totalPixels;
            const contrast = avgBrightness - minBrightness;

            // Sub-pixel weighted centroid of the darkest pupil cluster
            let sumWX = 0;
            let sumWY = 0;
            let totalWeight = 0;
            const thresh = minBrightness + Math.max(12, contrast * 0.35);

            for (let i = 0; i < data.length; i += 4) {
              const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
              if (b <= thresh) {
                const px = (i / 4) % w;
                const py = Math.floor((i / 4) / w);
                const weight = (thresh - b) * (thresh - b);
                sumWX += px * weight;
                sumWY += py * weight;
                totalWeight += weight;
              }
            }

            // Reliable eye openness & deadman brake
            const isEyeOpen = contrast >= 20 && totalWeight > 40;
            const openness = isEyeOpen ? Math.min(100, Math.round(contrast * 2.2)) : 0;

            if (isEyeOpen && totalWeight > 0) {
              const cx = sumWX / totalWeight;
              const cy = sumWY / totalWeight;
              const normX = Math.max(-1, Math.min(1, (cx - w / 2) / (w * 0.28)));
              const normY = Math.max(-1, Math.min(1, (cy - h / 2) / (h * 0.25)));

              // فصل تام: زوايا الرأس تبقى حيادية لضمان استقلالية حركة بؤبؤ العين
              const headPitch = 0.0;
              const headYaw = 0.0;
              const headRoll = 0.0;

              let dir: 'Forward' | 'Backward' | 'Left' | 'Right' | 'Stop' = 'Stop';
              const deadzone = 0.20;
              if (Math.abs(normX) > deadzone || Math.abs(normY) > deadzone) {
                if (Math.abs(normX) >= Math.abs(normY)) {
                  dir = normX < 0 ? 'Left' : 'Right';
                } else {
                  dir = normY < 0 ? 'Forward' : 'Backward';
                }
              }

              eyeTrackingService.setManualGaze(dir, normX, normY, true, openness, headPitch, headRoll, headYaw, 'browser_webcam');
            } else {
              // Deadman safety brake: eyes closed
              eyeTrackingService.setManualGaze('Stop', 0, 0, false, 0, 0, 0, 0, 'browser_webcam');
            }
          }
          animFrameRef.current = requestAnimationFrame(processFrame);
        };

        animFrameRef.current = requestAnimationFrame(processFrame);
      } catch (err) {
        console.warn('Webcam permission not granted:', err);
        setWebcamActive(false);
      }
    }

    setupCamera();

    return () => {
      isSubscribed = false;
      cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [webcamActive]);

  if (!isOpen) return null;

  // Complete updated Python script ready to copy
  const pythonBridgeCode = `import cv2
import numpy as np
import json
import urllib.request
import time
import math

API_URL = "http://localhost:3000/api/eye-tracking"

def send_to_simulation(direction, gaze_x=0.0, gaze_y=0.0, eye_open=True, eye_openness=100,
                       eye_cmd="S", head_pitch=0.0, head_roll=0.0, head_yaw=0.0, head_cmd="S",
                       control_mode="eye_only"):
    try:
        payload = json.dumps({
            "direction": str(direction),
            "command": str(eye_cmd if control_mode == "eye_only" else (head_cmd if control_mode == "head_only" else eye_cmd)),
            "gazeX": round(float(gaze_x), 3),
            "gazeY": round(float(gaze_y), 3),
            "eyeOpen": bool(eye_open),
            "eyeOpenness": int(eye_openness),
            "eyeCommand": str(eye_cmd),
            "headPitch": round(float(head_pitch), 2),
            "headRoll": round(float(head_roll), 2),
            "headYaw": round(float(head_yaw), 2),
            "headCommand": str(head_cmd),
            "controlMode": str(control_mode)
        }).encode('utf-8')
        req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=0.035)
    except Exception:
        pass

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

neutral_fx, neutral_fy, neutral_fw, neutral_fh = None, None, None, None
neutral_dx, neutral_dy = 0.0, 0.0
smooth_pitch, smooth_roll, smooth_yaw = 0.0, 0.0, 0.0
smooth_gaze_x, smooth_gaze_y = 0.0, 0.0
mode_idx = 0
MODES = ["eye_only", "head_only", "fused_head_eye"]

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break
    frame = cv2.flip(frame, 1)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 5, minSize=(120, 120))
    
    eye_found, raw_gx, raw_gy = False, 0.0, 0.0
    raw_pitch, raw_roll, raw_yaw = 0.0, 0.0, 0.0
    eye_dir, eye_cmd = "Stop", "S"
    head_dir, head_cmd = "Stop", "S"
    openness = 100

    if len(faces) > 0:
        fx, fy, fw, fh = max(faces, key=lambda f: f[2]*f[3])
        fcx, fcy = fx + fw/2.0, fy + fh/2.0
        if neutral_fx is None:
            neutral_fx, neutral_fy, neutral_fw, neutral_fh = fcx, fcy, fw, fh

        # 1. حركة الرأس (منفصلة تماماً)
        raw_pitch = max(-40.0, min(40.0, -((fcy - neutral_fy)/(neutral_fh*0.28))*30.0))
        raw_yaw = max(-45.0, min(45.0, ((fcx - neutral_fx)/(neutral_fw*0.28))*35.0))
        if abs(raw_pitch) > 10.0: head_cmd = "F" if raw_pitch > 10.0 else "B"
        elif abs(raw_yaw) > 12.0: head_cmd = "R" if raw_yaw > 12.0 else "L"

        # 2. كشف العين وتتبع بؤبؤ العين (منفصل تماماً)
        face_roi = gray[fy:fy+int(fh*0.60), fx:fx+fw]
        eyes = eye_cascade.detectMultiScale(face_roi, 1.12, 3, minSize=(30, 30))
        if len(eyes) == 0:
            eyes = [(int(fw*0.14), int(fh*0.20), int(fw*0.30), int(fh*0.24))]

        for (ex, ey, ew, eh) in eyes[:1]:
            eye_roi = face_roi[ey:ey+eh, ex:ex+ew]
            crop = eye_roi[int(eh*0.18):int(eh*0.88), :]
            blurred = cv2.GaussianBlur(crop, (7, 7), 0)
            mn, mx, mloc, _ = cv2.minMaxLoc(blurred)
            contrast = float(cv2.mean(blurred)[0]) - mn

            if contrast < 16.0:
                eye_found = False
                openness = 0
            else:
                eye_found = True
                openness = min(100, int(contrast * 2.2))
                _, thresh = cv2.threshold(blurred, int(mn + max(14, contrast*0.38)), 255, cv2.THRESH_BINARY_INV)
                cnts, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
                cx, cy = mloc[0], mloc[1] + int(eh*0.18)
                if cnts:
                    bc = max(cnts, key=cv2.contourArea)
                    M = cv2.moments(bc)
                    if M["m00"] > 0:
                        cx, cy = M["m10"]/M["m00"], M["m01"]/M["m00"] + int(eh*0.18)

                mid_x, mid_y = ew / 2.0, eh / 2.0
                dx = (cx - mid_x) - neutral_dx
                dy = (cy - mid_y) - neutral_dy
                raw_gx = max(-1.0, min(1.0, dx / (ew * 0.22)))
                raw_gy = max(-1.0, min(1.0, dy / (eh * 0.20)))

                off_x, off_y = max(2.8, ew * 0.075), max(2.2, eh * 0.065)
                if abs(dx)/off_x > 1.0 or abs(dy)/off_y > 1.0:
                    if abs(dx)/off_x >= abs(dy)/off_y:
                        if dx > off_x: eye_dir, eye_cmd = "Right", "R"
                        elif dx < -off_x: eye_dir, eye_cmd = "Left", "L"
                    else:
                        if dy < -off_y: eye_dir, eye_cmd = "Forward", "F"  # نظر لأعلى -> أمام
                        elif dy > off_y: eye_dir, eye_cmd = "Backward", "B" # نظر لأسفل -> خلف
                else:
                    eye_dir, eye_cmd = "Stop", "S"

    smooth_pitch += (raw_pitch - smooth_pitch) * 0.35
    smooth_yaw += (raw_yaw - smooth_yaw) * 0.35
    smooth_gaze_x += (raw_gx - smooth_gaze_x) * 0.45
    smooth_gaze_y += (raw_gy - smooth_gaze_y) * 0.45

    cur_mode = MODES[mode_idx]
    send_to_simulation(eye_dir, smooth_gaze_x, smooth_gaze_y, eye_found, openness, eye_cmd,
                       smooth_pitch, smooth_roll, smooth_yaw, head_cmd, cur_mode)

    cv2.putText(frame, f"EYE: {eye_dir} | CMD={eye_cmd} | MODE: {cur_mode}", (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.imshow('Eye & Head Tracking Simulation', frame)
    k = cv2.waitKey(1) & 0xFF
    if k == ord('q'): break
    elif k == ord('c'):
        neutral_dx += smooth_gaze_x * 15.0
        neutral_dy += smooth_gaze_y * 12.0
    elif k == ord('m'): mode_idx = (mode_idx + 1) % len(MODES)

cap.release()
cv2.destroyAllWindows()`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(pythonBridgeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePresetGaze = (dir: 'Forward' | 'Backward' | 'Left' | 'Right' | 'Stop', x?: number, y?: number) => {
    eyeTrackingService.setManualGaze(dir, x, y, true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl font-mono text-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <h2 className="font-bold text-white text-sm tracking-wider font-sans">
              EYE TRACKING & OPENCV GAZE INTEGRATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 font-sans text-zinc-300">
          {/* Top Status & Mode Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Python Connection Status */}
            <div className="bg-black/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">PYTHON OPENCV FEED:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isPythonConnected ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {isPythonConnected ? '🟢 CONNECTED (LIVE STREAM)' : '⚪ WAITING FOR PYTHON...'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {isPythonConnected
                  ? 'يتم استلام اتجاه البؤبؤ وزوايا النظر مباشرة من كود Python OpenCV ويتحرك الرأس والعينان وفقاً لها.'
                  : 'شغّل كود البايثون أدناه على جهازك ليبدأ بالبث التلقائي للمحاكاة على المنفذ 3000.'}
              </p>
            </div>

            {/* Wheelchair Control Mode */}
            <div className="bg-black/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2 font-mono text-xs">
              <span className="text-zinc-400">نظام التحكم في الكرسي المتحرك:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => onControlModeChange('fused_head_eye')}
                  className={`p-1.5 rounded text-center text-[10px] font-bold border transition-all ${
                    controlMode === 'fused_head_eye'
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  تحكم هجين (رأس + عين)
                </button>
                <button
                  onClick={() => onControlModeChange('head_only')}
                  className={`p-1.5 rounded text-center text-[10px] font-bold border transition-all ${
                    controlMode === 'head_only'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  حركة الرأس فقط
                </button>
                <button
                  onClick={() => onControlModeChange('eye_only')}
                  className={`p-1.5 rounded text-center text-[10px] font-bold border transition-all ${
                    controlMode === 'eye_only'
                      ? 'bg-purple-950 border-purple-500 text-purple-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  حركة العين فقط
                </button>
              </div>
            </div>
          </div>

          {/* Live Gaze Telemetry Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-4 font-mono">
            <div className="flex items-center gap-4">
              {/* Pupil Reticle Visualizer */}
              <div className="w-16 h-16 bg-black border border-zinc-700 rounded-full relative flex items-center justify-center overflow-hidden">
                <div className="w-10 h-10 border border-dashed border-zinc-600 rounded-full" />
                <div className="w-full h-[1px] bg-zinc-800 absolute" />
                <div className="h-full w-[1px] bg-zinc-800 absolute" />
                <div
                  className={`w-3.5 h-3.5 rounded-full absolute transition-transform duration-75 shadow-lg ${
                    eyeData.eyeOpen ? 'bg-cyan-400 ring-2 ring-cyan-200' : 'bg-red-500 opacity-60'
                  }`}
                  style={{
                    transform: `translate(${eyeData.gazeX * 18}px, ${eyeData.gazeY * 18}px)`
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-zinc-400">بيانات التتبع اللحظية (الرأس + العين):</span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white tracking-wider">
                    {eyeData.direction.toUpperCase()}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    eyeData.eyeOpen ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                  }`}>
                    {eyeData.eyeOpen ? `العين مفتوحة (${eyeData.eyeOpenness ?? 100}%)` : 'العين مغلقة [فرملة أمان STOP]'}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 flex flex-wrap gap-x-3 gap-y-1 font-mono">
                  <span>النظر: X=<strong className="text-cyan-300">{eyeData.gazeX.toFixed(2)}</strong> Y=<strong className="text-cyan-300">{eyeData.gazeY.toFixed(2)}</strong></span>
                  <span>|</span>
                  <span>الرأس: P=<strong className="text-emerald-300">{eyeData.headPitch?.toFixed(1) ?? '0.0'}°</strong> R=<strong className="text-purple-300">{eyeData.headRoll?.toFixed(1) ?? '0.0'}°</strong> Y=<strong className="text-amber-300">{eyeData.headYaw?.toFixed(1) ?? '0.0'}°</strong></span>
                </div>
              </div>
            </div>

            {/* In-Browser WebCam & Simulation Buttons */}
            <div className="flex flex-col gap-1.5 items-end">
              <button
                onClick={() => setWebcamActive(!webcamActive)}
                className={`px-3 py-1.5 rounded text-xs font-semibold font-sans tracking-wide transition-all border flex items-center gap-1.5 shadow ${
                  webcamActive
                    ? 'bg-cyan-600 border-cyan-400 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-600'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {webcamActive ? 'إيقاف كاميرا المتصفح' : 'تشغيل كاميرا المتصفح المباشرة'}
              </button>

              {/* Quick Gaze Test Buttons */}
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-zinc-500">تجربة سريعة:</span>
                <button onClick={() => handlePresetGaze('Left', -0.8, 0)} className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-cyan-400">يسار</button>
                <button onClick={() => handlePresetGaze('Forward', 0, -0.8)} className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-emerald-400">أمام</button>
                <button onClick={() => handlePresetGaze('Right', 0.8, 0)} className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-purple-400">يمين</button>
                <button onClick={() => handlePresetGaze('Backward', 0, 0.8)} className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-amber-400">خلف</button>
                <button onClick={() => handlePresetGaze('Stop', 0, 0)} className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">توقف</button>
              </div>
            </div>
          </div>

          {/* Hidden Canvas & Video for in-browser webcam tracking */}
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={canvasRef} width={160} height={120} className="hidden" />

          {/* Python OpenCV Script with 3-line bridge */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-xs uppercase tracking-wider text-cyan-400 font-mono">
                كود Python المحدث للربط المباشر مع المشروع (انسخه وشغله)
              </span>
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-mono transition-colors flex items-center gap-1"
              >
                {copied ? '✓ تم النسخ!' : 'نسخ كود البايثون'}
              </button>
            </div>
            <pre className="bg-black border border-zinc-800 rounded-lg p-3 font-mono text-[11px] text-cyan-300/90 overflow-x-auto max-h-56 leading-relaxed select-all">
              {pythonBridgeCode}
            </pre>
            <p className="text-[11px] text-zinc-400">
              * تم إضافة دالة <code className="text-emerald-400 font-mono">send_to_simulation()</code> لكودك باستخدام مكتبة <code className="text-zinc-200 font-mono">urllib</code> المدمجة في بايثون تلقائياً، دون الحاجة لتثبيت أي مكتبات إضافية!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
          <span className="text-[10px] text-zinc-500 font-mono">
            ENDPOINT: http://localhost:3000/api/eye-tracking
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-sans font-medium text-xs transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
