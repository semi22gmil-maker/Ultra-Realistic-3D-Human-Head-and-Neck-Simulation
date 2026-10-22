import React, { useState } from 'react';

interface FirmwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirmwareGuideModal: React.FC<FirmwareGuideModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const esp32Code = `/*
 * ESP32 + MPU-6050 Wheelchair Head Motion Control Firmware
 * Baud Rate: 115200 (Default COM25 on target Windows setup)
 * Protocol: dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
 *
 * Wiring (ESP32 DevKit V1 -> MPU-6050):
 *   3V3  -----> VCC
 *   GND  -----> GND
 *   GPIO 21 --> SDA (I2C Data)
 *   GPIO 22 --> SCL (I2C Clock)
 */

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

// Wheelchair Motion Thresholds (Degrees)
const float THRESHOLD = 12.0; // Angle required to engage motion
const float DEADBAND  = 3.5;  // Deadband around center to prevent tremor false-triggers

// Complementary filter weights
const float ALPHA = 0.96; // Gyro weight vs Accelerometer weight
float pitch = 0.0;
float roll  = 0.0;
unsigned long lastTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(21, 22); // SDA=21, SCL=22

  if (!mpu.begin()) {
    Serial.println("ERROR: MPU6050 chip not detected! Check I2C wiring.");
    while (1) { delay(500); }
  }

  // Configure sensor ranges for head motion tracking
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  lastTime = millis();
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  unsigned long now = millis();
  float dt = (now - lastTime) / 1000.0;
  lastTime = now;
  if (dt <= 0.0 || dt > 0.2) dt = 0.02; // Safeguard

  // 1. Calculate Pitch and Roll from Accelerometer Gravity Vector
  // (Note: Accelerometers detect gravity; yaw is perpendicular to gravity and cannot be measured without a magnetometer)
  float accelPitch = atan2(-a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z)) * 180.0 / PI;
  float accelRoll  = atan2(a.acceleration.y, a.acceleration.z) * 180.0 / PI;

  // 2. Complementary Filter (fuses Gyro angular velocity + Accel gravity reference)
  pitch = ALPHA * (pitch + (g.gyro.y * 180.0 / PI) * dt) + (1.0 - ALPHA) * accelPitch;
  roll  = ALPHA * (roll  + (g.gyro.x * 180.0 / PI) * dt) + (1.0 - ALPHA) * accelRoll;

  // 3. Evaluate Wheelchair Motion Command
  char cmd = 'S'; // Default: STOP
  float pMag = abs(pitch);
  float rMag = abs(roll);

  if (pMag > DEADBAND || rMag > DEADBAND) {
    if (pMag >= rMag) {
      if (pitch >= THRESHOLD)       cmd = 'F'; // Forward (head tilted down)
      else if (pitch <= -THRESHOLD) cmd = 'B'; // Backward (head tilted up)
    } else {
      if (roll <= -THRESHOLD)      cmd = 'L'; // Left tilt
      else if (roll >= THRESHOLD)  cmd = 'R'; // Right tilt
    }
  }

  // 4. Output target formatted newline string
  // Format: dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
  char outBuffer[80];
  char pSign = (pitch >= 0) ? '+' : '-';
  char rSign = (roll >= 0)  ? '+' : '-';

  snprintf(outBuffer, sizeof(outBuffer),
    "dP=%c%.1f dR=%c%.1f | pMag=%.1f rMag=%.1f | CMD='%c'",
    pSign, pMag, rSign, rMag, pMag, rMag, cmd
  );

  Serial.println(outBuffer);

  delay(25); // ~40Hz broadcast rate
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(esp32Code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl font-mono text-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="font-bold text-white text-sm tracking-wider font-sans">
              ESP32 & MPU-6050 FIRMWARE & PROTOCOL DOCUMENTATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-5 text-zinc-300 leading-relaxed font-sans">
          {/* Section 1: Hardware Wiring */}
          <div>
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5 text-emerald-400">
              1. ESP32 to MPU-6050 I2C Hardware Wiring
            </h3>
            <div className="bg-black/60 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800 pb-1">
                    <th className="pb-1">ESP32 Pin</th>
                    <th className="pb-1">MPU-6050 Pin</th>
                    <th className="pb-1">Function</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  <tr><td className="py-1 text-emerald-400">3V3</td><td className="py-1">VCC</td><td className="py-1 text-zinc-400">3.3V Power</td></tr>
                  <tr><td className="py-1 text-emerald-400">GND</td><td className="py-1">GND</td><td className="py-1 text-zinc-400">Common Ground</td></tr>
                  <tr><td className="py-1 text-emerald-400">GPIO 21</td><td className="py-1">SDA</td><td className="py-1 text-zinc-400">I2C Serial Data</td></tr>
                  <tr><td className="py-1 text-emerald-400">GPIO 22</td><td className="py-1">SCL</td><td className="py-1 text-zinc-400">I2C Serial Clock</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Sensor Physics & Limitation of Accelerometer Yaw */}
          <div>
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-1 font-mono flex items-center gap-1.5 text-amber-400">
              2. Scientific Notice: Accelerometer Pitch/Roll vs Yaw
            </h3>
            <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-lg text-xs text-zinc-300 flex flex-col gap-2">
              <p>
                <strong>Why does the MPU-6050 deliver reliable Pitch and Roll, but NOT absolute Yaw?</strong>
              </p>
              <p className="text-zinc-400">
                An accelerometer measures the static 1G Earth gravity vector. Pitch (forward/back) and Roll (lateral tilt) alter the angle of the sensor relative to the gravitational pull vector, allowing trigonometric recovery via <code className="text-emerald-400 font-mono">atan2()</code>.
              </p>
              <p className="text-zinc-400">
                However, <strong>horizontal Yaw rotation occurs entirely perpendicular to the gravity vector</strong>. Rotating left or right around the vertical axis produces zero change in gravitational acceleration. Without a 9-axis sensor containing a magnetic compass (magnetometer) or external optical fiducial tracking, any gyro-integrated yaw inevitably experiences severe gyro drift.
              </p>
              <p className="text-emerald-400 font-mono text-[11px]">
                ✓ Pitch and Roll are derived directly from the MPU6050 hardware stream.<br />
                ✓ Yaw remains centered at 0° or can be tested via the manual simulation slider.
              </p>
            </div>
          </div>

          {/* Section 3: Serial Protocol */}
          <div>
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-1 font-mono flex items-center gap-1.5 text-cyan-400">
              3. Serial Protocol Specification
            </h3>
            <div className="bg-black/60 border border-zinc-800 p-3 rounded-lg font-mono text-xs text-zinc-300 flex flex-col gap-2">
              <div className="text-emerald-400 bg-zinc-900/80 p-2 rounded border border-zinc-800">
                dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
              </div>
              <ul className="list-disc list-inside text-zinc-400 text-[11px] flex flex-col gap-1">
                <li><strong className="text-white">dP:</strong> Relative Pitch angle in degrees (+ = forward flexion/look down, - = extension/look up).</li>
                <li><strong className="text-white">dR:</strong> Relative Roll angle in degrees (- = left lateral tilt, + = right lateral tilt).</li>
                <li><strong className="text-white">CMD:</strong> Active wheelchair drive state:
                  <span className="text-emerald-400 ml-1 font-bold">'F' (Forward)</span>,
                  <span className="text-amber-400 ml-1 font-bold">'B' (Backward)</span>,
                  <span className="text-blue-400 ml-1 font-bold">'L' (Left)</span>,
                  <span className="text-purple-400 ml-1 font-bold">'R' (Right)</span>,
                  <span className="text-zinc-400 ml-1 font-bold">'S' (Stop/Neutral)</span>.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 4: ESP32 Arduino C++ Firmware Code */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider font-mono text-emerald-400">
                4. ESP32 Arduino / PlatformIO Firmware (Ready to Flash)
              </h3>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-mono transition-colors flex items-center gap-1"
              >
                {copied ? '✓ COPIED CODE' : 'COPY ARDUINO CODE'}
              </button>
            </div>
            <pre className="bg-black border border-zinc-800 rounded-lg p-3 font-mono text-[11px] text-emerald-300/90 overflow-x-auto max-h-56 leading-relaxed select-all">
              {esp32Code}
            </pre>
          </div>

          {/* Section 5: Troubleshooting */}
          <div>
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-1 font-mono text-red-400">
              5. Web Serial & COM25 Troubleshooting
            </h3>
            <ul className="list-disc list-inside text-zinc-400 text-xs flex flex-col gap-1.5 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800">
              <li>
                <strong className="text-zinc-200">Browser Security:</strong> Web Serial API requires Google Chrome, Microsoft Edge, or Opera running in HTTPS or <code className="text-zinc-300">localhost</code>.
              </li>
              <li>
                <strong className="text-zinc-200">Port Busy:</strong> If COM25 fails to open, close the Arduino IDE Serial Monitor or Putty. Only one application can access a COM port at a time.
              </li>
              <li>
                <strong className="text-zinc-200">USB Cable:</strong> Use a data-capable micro-USB/USB-C cable. Charging-only cables do not enumerate COM ports.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-sans font-medium text-xs transition-colors"
          >
            CLOSE GUIDE
          </button>
        </div>
      </div>
    </div>
  );
};
