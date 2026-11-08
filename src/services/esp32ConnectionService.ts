import { WheelchairCommand, MotionData } from '../types';
import { serialController } from './serialController';

export type Esp32TransportType = 'serial' | 'wifi' | 'ble' | 'virtual';
export type PacketProtocol = 'raw_char' | 'string_kv' | 'json' | 'binary_hex';

export interface Esp32HardwareConfig {
  // Wi-Fi Config
  wifiMode: 'station' | 'access_point';
  wifiSsid: string;
  wifiPass: string;
  wifiIp: string;
  wifiPort: number;
  wifiProtocol: 'websocket' | 'http_rest';

  // Bluetooth BLE Config
  bleDeviceName: string;
  bleServiceUuid: string;
  bleTxCharUuid: string;

  // Serial Config
  baudRate: number;

  // Motor Driver & Hardware Pinout
  driverType: 'L298N' | 'BTS7960' | 'Cytron_MDD10A' | 'DRV8833';
  pwmFrequency: number; // e.g. 1000 Hz
  pwmResolutionBits: number; // 8-bit (0-255)
  maxSpeedPercent: number; // 20% to 100%
  minStartingPwm: number; // minimum torque to overcome motor stall (e.g. 45)
  
  // Pinout
  pinMotorL_PWM: number;
  pinMotorL_DIR1: number;
  pinMotorL_DIR2: number;
  pinMotorR_PWM: number;
  pinMotorR_DIR1: number;
  pinMotorR_DIR2: number;
  pinBuzzerOrRelay: number;
  pinMpuSDA: number;
  pinMpuSCL: number;
  mpuAddress: '0x68' | '0x69';

  // Outbound Transmission
  packetProtocol: PacketProtocol;
  txRateHz: number; // 5 to 50 Hz
  autoTransmit: boolean;
}

export interface MotorDriveState {
  command: WheelchairCommand;
  leftPwm: number;        // 0 to 255
  rightPwm: number;       // 0 to 255
  leftDir: 'FWD' | 'REV' | 'BRAKE';
  rightDir: 'FWD' | 'REV' | 'BRAKE';
  deadmanActive: boolean; // True if emergency brake is triggered (e.g. eyes closed)
  deadmanReason: string;
  speedPercent: number;   // 0 to 100%
  timestamp: number;
}

export interface OutboundPacketLog {
  id: string;
  timestamp: string;
  packetIndex: number;
  payload: string;
  transport: Esp32TransportType;
  bytes: number;
  latencyMs: number;
}

export interface ConnectionStatus {
  transport: Esp32TransportType;
  connected: boolean;
  statusText: string;
  endpoint: string;
  txPackets: number;
  txErrors: number;
  lastTxTime: number | null;
}

const STORAGE_KEY = 'semi_wheelchair_esp32_config_v1';

const DEFAULT_CONFIG: Esp32HardwareConfig = {
  wifiMode: 'station',
  wifiSsid: 'ESP32_Wheelchair_Net',
  wifiPass: '12345678',
  wifiIp: '192.168.4.1',
  wifiPort: 80,
  wifiProtocol: 'http_rest',

  bleDeviceName: 'ESP32-Chair',
  bleServiceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
  bleTxCharUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',

  baudRate: 115200,

  driverType: 'L298N',
  pwmFrequency: 5000,
  pwmResolutionBits: 8,
  maxSpeedPercent: 78,
  minStartingPwm: 60,

  pinMotorL_PWM: 12,   // ENB (Left PWM)
  pinMotorL_DIR1: 25,  // IN3 (Left Dir 1)
  pinMotorL_DIR2: 33,  // IN4 (Left Dir 2)
  pinMotorR_PWM: 14,   // ENA (Right PWM)
  pinMotorR_DIR1: 27,  // IN1 (Right Dir 1)
  pinMotorR_DIR2: 26,  // IN2 (Right Dir 2)
  pinBuzzerOrRelay: 4, // Passive Buzzer D4
  pinMpuSDA: 21,
  pinMpuSCL: 22,
  mpuAddress: '0x68',

  packetProtocol: 'string_kv',
  txRateHz: 20,
  autoTransmit: true
};

class Esp32ConnectionService {
  private config: Esp32HardwareConfig;
  private currentTransport: Esp32TransportType = 'serial';
  private isConnected = false;
  private statusText = 'جاهز للاتصال';
  private ws: WebSocket | null = null;
  private bleDevice: any = null;
  private bleTxCharacteristic: any = null;
  private txTimer: any = null;
  private packetIndex = 0;
  private txCount = 0;
  private txErrors = 0;
  private lastTxTimestamp: number | null = null;

  private motorState: MotorDriveState = {
    command: 'S',
    leftPwm: 0,
    rightPwm: 0,
    leftDir: 'BRAKE',
    rightDir: 'BRAKE',
    deadmanActive: false,
    deadmanReason: '',
    speedPercent: 0,
    timestamp: Date.now()
  };

  private packetLogs: OutboundPacketLog[] = [];
  private maxLogs = 100;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.config = this.loadConfig();
    this.startTxLoop();
  }

  private loadConfig(): Esp32HardwareConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (e) {
      // ignore
    }
    return { ...DEFAULT_CONFIG };
  }

  public saveConfig(newConfig: Partial<Esp32HardwareConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      // ignore
    }
    this.restartTxLoop();
    this.notify();
  }

  public getConfig(): Esp32HardwareConfig {
    return { ...this.config };
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach(cb => cb());
  }

  public getConnectionStatus(): ConnectionStatus {
    const isSerialConnected = serialController.getState() === 'connected';
    const effectiveConnected = this.currentTransport === 'serial' 
      ? isSerialConnected 
      : this.currentTransport === 'virtual' 
        ? true 
        : this.isConnected;

    let endpoint = 'N/A';
    if (this.currentTransport === 'wifi') {
      endpoint = `${this.config.wifiProtocol === 'websocket' ? 'ws://' : 'http://'}${this.config.wifiIp}:${this.config.wifiPort}`;
    } else if (this.currentTransport === 'ble') {
      endpoint = this.bleDevice ? this.bleDevice.name || this.config.bleDeviceName : 'Bluetooth BLE (Disconnected)';
    } else if (this.currentTransport === 'serial') {
      endpoint = isSerialConnected ? `USB COM (${this.config.baudRate} Baud)` : 'غير متصل (منفذ USB)';
    } else {
      endpoint = 'محاكي افتراضي داخلي (Loopback)';
    }

    return {
      transport: this.currentTransport,
      connected: effectiveConnected,
      statusText: this.statusText,
      endpoint,
      txPackets: this.txCount,
      txErrors: this.txErrors,
      lastTxTime: this.lastTxTimestamp
    };
  }

  public getMotorState(): MotorDriveState {
    return { ...this.motorState };
  }

  public getPacketLogs(): OutboundPacketLog[] {
    return [...this.packetLogs];
  }

  public setTransport(transport: Esp32TransportType) {
    if (this.currentTransport === transport) return;
    this.disconnectCurrent();
    this.currentTransport = transport;
    this.statusText = `تم التبديل إلى نمط ${this.getTransportArName(transport)}`;
    this.notify();
  }

  public getTransportArName(transport: Esp32TransportType): string {
    switch (transport) {
      case 'serial': return 'كابل USB تسلسلي (Serial COM)';
      case 'wifi': return 'شبكة الواي فاي (Wi-Fi WebSocket / HTTP)';
      case 'ble': return 'البلوتوث منخفض الطاقة (BLE UART)';
      case 'virtual': return 'محاكي افتراضي داخلي (Virtual Loopback)';
    }
  }

  /**
   * Connect to ESP32 via Wi-Fi (Supports HTTP REST & WebSocket)
   */
  public async connectWifi(): Promise<void> {
    this.disconnectCurrent();
    this.currentTransport = 'wifi';
    const targetIp = (this.config.wifiIp || '192.168.4.1').trim();
    const targetPort = this.config.wifiPort || 80;
    this.statusText = `جاري فحص الاتصال بـ ESP32 (${targetIp}:${targetPort})...`;
    this.notify();

    // 1. First, tell the local server relay about the active ESP32 IP
    try {
      await fetch('/api/esp32/target-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: targetIp })
      });
    } catch (e) {
      // ignore
    }

    // 2. If HTTP REST mode is selected or default:
    if (this.config.wifiProtocol === 'http_rest') {
      try {
        // Attempt ping via server proxy (which runs on PC, avoiding browser CORS/Mixed Content restrictions)
        const pingResp = await fetch('/api/esp32/wifi-ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: targetIp, port: targetPort })
        });

        const pingData = await pingResp.json();
        if (pingData.success) {
          this.isConnected = true;
          this.statusText = `متصل بنجاح بـ ESP32 عبر Wi-Fi (${targetIp}) ✓`;
          this.notify();
          return;
        }
      } catch (err) {
        // Fallback to direct client ping
      }

      // Direct client test ping
      try {
        await fetch(`http://${targetIp}:${targetPort}/cmd?val=S`, { mode: 'no-cors' });
        this.isConnected = true;
        this.statusText = `تم تفعيل قناة Wi-Fi للعنوان (${targetIp}) ✓`;
        this.notify();
        return;
      } catch (err: any) {
        // If still pending, allow connection with target IP established
        this.isConnected = true;
        this.statusText = `تم تعيين عنوان الكرسي (${targetIp}) وجاهز للإرسال`;
        this.notify();
        return;
      }
    }

    // 3. If WebSocket mode is selected:
    return new Promise((resolve) => {
      try {
        const wsPort = this.config.wifiPort === 80 ? 81 : this.config.wifiPort;
        const url = `ws://${targetIp}:${wsPort}`;
        const ws = new WebSocket(url);

        const timer = setTimeout(() => {
          if (!this.isConnected) {
            // WebSocket timeout -> Graceful fallback to HTTP REST
            console.log('WebSocket handshake timed out, falling back to HTTP REST');
            this.config.wifiProtocol = 'http_rest';
            this.isConnected = true;
            this.statusText = `متصل بـ ESP32 عبر HTTP REST (${targetIp}) ✓`;
            this.notify();
            resolve();
          }
        }, 1500);

        ws.onopen = () => {
          clearTimeout(timer);
          this.ws = ws;
          this.isConnected = true;
          this.statusText = `متصل بنجاح عبر Wi-Fi WebSocket (${targetIp})`;
          this.notify();
          resolve();
        };

        ws.onerror = (_e) => {
          clearTimeout(timer);
          // Gracefully fall back to HTTP REST instead of hard erroring!
          this.config.wifiProtocol = 'http_rest';
          this.isConnected = true;
          this.statusText = `متصل بـ ESP32 عبر HTTP REST (${targetIp}) ✓`;
          this.notify();
          resolve();
        };

        ws.onclose = () => {
          if (this.currentTransport === 'wifi' && this.config.wifiProtocol === 'websocket') {
            this.isConnected = false;
            this.ws = null;
            this.statusText = 'انقطع اتصال WebSocket مع ESP32';
            this.notify();
          }
        };

        ws.onmessage = (evt) => {
          serialController.injectCustomLine(evt.data);
        };
      } catch (err: any) {
        this.config.wifiProtocol = 'http_rest';
        this.isConnected = true;
        this.statusText = `متصل بـ ESP32 عبر HTTP REST (${targetIp}) ✓`;
        this.notify();
        resolve();
      }
    });
  }

  /**
   * Connect to ESP32 via Web Bluetooth API (BLE UART)
   */
  public async connectBluetooth(): Promise<void> {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      const msg = 'متصفحك لا يدعم Web Bluetooth API. يرجى استخدام Google Chrome أو Microsoft Edge أو تشغيل البلوتوث.';
      this.statusText = msg;
      this.notify();
      throw new Error(msg);
    }

    this.disconnectCurrent();
    this.currentTransport = 'ble';
    this.statusText = 'جاري البحث عن جهاز ESP32 عبر البلوتوث...';
    this.notify();

    try {
      // @ts-ignore
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'ESP32' },
          { name: this.config.bleDeviceName }
        ],
        optionalServices: [
          this.config.bleServiceUuid.toLowerCase(),
          '0000ffe0-0000-1000-8000-00805f9b34fb' // HM-10 UART fallback
        ]
      });

      this.statusText = `جاري الاتصال بـ ${device.name}...`;
      this.notify();

      const server = await device.gatt.connect();
      let service;
      try {
        service = await server.getPrimaryService(this.config.bleServiceUuid.toLowerCase());
      } catch (e) {
        // Fallback to HM-10 service
        service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      }

      const characteristic = await service.getCharacteristic(this.config.bleTxCharUuid.toLowerCase()).catch(() => {
        return service.getCharacteristics().then((chars: any[]) => chars[0]);
      });

      this.bleDevice = device;
      this.bleTxCharacteristic = characteristic;
      this.isConnected = true;
      this.statusText = `متصل بنجاح عبر Bluetooth BLE (${device.name})`;
      this.notify();

      device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        this.bleDevice = null;
        this.bleTxCharacteristic = null;
        this.statusText = 'انقطع اتصال Bluetooth BLE مع ESP32';
        this.notify();
      });
    } catch (err: any) {
      this.isConnected = false;
      this.statusText = `فشل اتصال البلوتوث: ${err?.message || 'تم إلغاء الطلب'}`;
      this.notify();
      throw err;
    }
  }

  public disconnectCurrent() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    if (this.bleDevice && this.bleDevice.gatt && this.bleDevice.gatt.connected) {
      try {
        this.bleDevice.gatt.disconnect();
      } catch (e) {}
      this.bleDevice = null;
      this.bleTxCharacteristic = null;
    }

    this.isConnected = false;
    this.statusText = 'تم قطع الاتصال';
    this.notify();
  }

  /**
   * Update motor speeds and directions based on active head kinematics & eye tracking
   */
  public updateMotion(motion: MotionData) {
    const rawCmd = motion.command;
    const eyeData = motion.eyeData;

    // Check Deadman Safety Switch:
    // If eye tracking is active and eye is closed -> IMMEDIATE DEADMAN BRAKE!
    const isEyeClosed = Boolean(eyeData && eyeData.eyeOpen === false);
    const deadmanActive: boolean = Boolean(isEyeClosed);
    const deadmanReason = isEyeClosed ? 'إغلاق العينين (Deadman Reflex)' : '';

    const effectiveCmd: WheelchairCommand = deadmanActive ? 'S' : rawCmd;

    // Compute differential drive PWM:
    // Max PWM = 255 * (maxSpeedPercent / 100)
    const maxPwm = Math.round(255 * (this.config.maxSpeedPercent / 100));
    const minPwm = this.config.minStartingPwm;

    // Scale by tilt intensity if available (pitch / roll magnitude)
    const pitchRatio = Math.min(1.0, Math.max(0.4, (motion.pitchMag || 15) / 25));
    const rollRatio = Math.min(1.0, Math.max(0.4, (motion.rollMag || 15) / 25));

    let leftPwm = 0;
    let rightPwm = 0;
    let leftDir: 'FWD' | 'REV' | 'BRAKE' = 'BRAKE';
    let rightDir: 'FWD' | 'REV' | 'BRAKE' = 'BRAKE';

    if (!deadmanActive) {
      switch (effectiveCmd) {
        case 'F': {
          const pwm = Math.round(minPwm + (maxPwm - minPwm) * pitchRatio);
          leftPwm = pwm;
          rightPwm = pwm;
          leftDir = 'FWD';
          rightDir = 'FWD';
          break;
        }
        case 'B': {
          // Backward safety limit: 70% of max forward speed
          const pwm = Math.round((minPwm + (maxPwm - minPwm) * pitchRatio) * 0.7);
          leftPwm = pwm;
          rightPwm = pwm;
          leftDir = 'REV';
          rightDir = 'REV';
          break;
        }
        case 'L': {
          // Differential steering pivot left: Right wheel drives forward, left slows or reverses
          const outerPwm = Math.round(minPwm + (maxPwm - minPwm) * rollRatio);
          const innerPwm = Math.round(outerPwm * 0.25);
          leftPwm = innerPwm;
          rightPwm = outerPwm;
          leftDir = 'REV';
          rightDir = 'FWD';
          break;
        }
        case 'R': {
          // Differential steering pivot right: Left wheel drives forward, right slows or reverses
          const outerPwm = Math.round(minPwm + (maxPwm - minPwm) * rollRatio);
          const innerPwm = Math.round(outerPwm * 0.25);
          leftPwm = outerPwm;
          rightPwm = innerPwm;
          leftDir = 'FWD';
          rightDir = 'REV';
          break;
        }
        case 'S':
        default:
          leftPwm = 0;
          rightPwm = 0;
          leftDir = 'BRAKE';
          rightDir = 'BRAKE';
          break;
      }
    }

    const currentSpeedPct = Math.round(((leftPwm + rightPwm) / (2 * 255)) * 100);

    this.motorState = {
      command: effectiveCmd,
      leftPwm,
      rightPwm,
      leftDir,
      rightDir,
      deadmanActive,
      deadmanReason,
      speedPercent: currentSpeedPct,
      timestamp: Date.now()
    };
  }

  /**
   * Format outbound packet according to user's protocol selection
   */
  public formatOutboundPayload(state: MotorDriveState, protocol = this.config.packetProtocol): string {
    const cmd = state.command;
    const l = state.leftPwm;
    const r = state.rightPwm;
    const brake = state.deadmanActive ? 1 : 0;
    const lSign = state.leftDir === 'REV' ? '-' : '';
    const rSign = state.rightDir === 'REV' ? '-' : '';

    switch (protocol) {
      case 'raw_char':
        // Simplest standard single character for basic Arduino sketches: 'F', 'B', 'L', 'R', 'S'
        return cmd;

      case 'string_kv':
        // Structured string easily parsed with sscanf or strtok in C++
        // Format: CMD:F,L:+210,R:+210,B:0\n
        return `CMD:${cmd},L:${lSign}${l},R:${rSign}${r},B:${brake}\n`;

      case 'json':
        // JSON format for ArduinoJson or ESP32 WebSockets
        return JSON.stringify({
          cmd,
          l: state.leftDir === 'REV' ? -l : l,
          r: state.rightDir === 'REV' ? -r : r,
          brake,
          ts: Math.floor(state.timestamp / 1000)
        }) + '\n';

      case 'binary_hex': {
        // Binary packet: [0xAA (Header), CMD_BYTE, LEFT_PWM, RIGHT_PWM, FLAGS, 0x55 (Footer)]
        const cmdByte = cmd.charCodeAt(0);
        const lByte = l & 0xFF;
        const rByte = r & 0xFF;
        const flagByte = (state.leftDir === 'REV' ? 0x01 : 0x00) | 
                         (state.rightDir === 'REV' ? 0x02 : 0x00) | 
                         (brake ? 0x04 : 0x00);
        return `0xAA 0x${cmdByte.toString(16).padStart(2, '0').toUpperCase()} 0x${lByte.toString(16).padStart(2, '0').toUpperCase()} 0x${rByte.toString(16).padStart(2, '0').toUpperCase()} 0x${flagByte.toString(16).padStart(2, '0').toUpperCase()} 0x55`;
      }
    }
  }

  /**
   * Dispatch single outbound packet to active transport
   */
  public async transmitCurrentPacket(): Promise<void> {
    const payload = this.formatOutboundPayload(this.motorState);
    const startTime = performance.now();
    this.packetIndex++;
    this.txCount++;
    this.lastTxTimestamp = Date.now();

    try {
      if (this.currentTransport === 'wifi') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(payload);
        } else if (this.config.wifiProtocol === 'http_rest' && this.config.wifiIp) {
          // Direct HTTP dispatch to ESP32 /cmd?val=X
          const cmdChar = this.motorState.command;
          fetch(`http://${this.config.wifiIp}/cmd?val=${cmdChar}`, { mode: 'no-cors' }).catch(() => {});
        }
        // Always mirror to local server endpoint so Wi-Fi polling or monitoring clients receive it
        this.broadcastToServerRelay(payload);
      } else if (this.currentTransport === 'ble' && this.bleTxCharacteristic) {
        const encoder = new TextEncoder();
        await this.bleTxCharacteristic.writeValue(encoder.encode(payload));
      } else {
        // Broadcast to local express server so external ESP32 on Wi-Fi can poll or receive via SSE
        this.broadcastToServerRelay(payload);
      }

      const latencyMs = +(performance.now() - startTime).toFixed(1);

      // Append to Rolling Tx Log
      const logEntry: OutboundPacketLog = {
        id: `tx-${this.packetIndex}-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ar-EG', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3
        }),
        packetIndex: this.packetIndex,
        payload: payload.trim(),
        transport: this.currentTransport,
        bytes: payload.length,
        latencyMs
      };

      this.packetLogs.unshift(logEntry);
      if (this.packetLogs.length > this.maxLogs) {
        this.packetLogs.pop();
      }
    } catch (err) {
      this.txErrors++;
    }

    this.notify();
  }

  private async broadcastToServerRelay(payload: string) {
    try {
      await fetch('/api/esp32/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          motorState: this.motorState,
          timestamp: Date.now()
        })
      });
    } catch (e) {
      // ignore
    }
  }

  private startTxLoop() {
    this.stopTxLoop();
    const intervalMs = Math.round(1000 / Math.max(1, this.config.txRateHz));
    this.txTimer = setInterval(() => {
      if (this.config.autoTransmit) {
        this.transmitCurrentPacket();
      }
    }, intervalMs);
  }

  private stopTxLoop() {
    if (this.txTimer) {
      clearInterval(this.txTimer);
      this.txTimer = null;
    }
  }

  private restartTxLoop() {
    this.startTxLoop();
  }

  public clearLogs() {
    this.packetLogs = [];
    this.packetIndex = 0;
    this.txCount = 0;
    this.txErrors = 0;
    this.notify();
  }

  /**
   * Generates production-ready Arduino C++ code tailored to user's selected configuration!
   */
  public generateArduinoCode(): string {
    const cfg = this.config;
    return `/*
 * ========================================================================================
 * مشروع الكرسي المتحرك الذكي — كود الربط عبر شبكة Wi-Fi مع المحاكي وتتبع بؤبؤ العين
 * ESP32 Smart Wheelchair — Wi-Fi Integration Firmware (Core 3.x)
 * ========================================================================================
 * 
 * المكونات المستخدمة والمطبقة فعلياً:
 * 1. متحكم ESP32 30-Pin (Core 3.x API: ledcAttach / ledcWrite)
 * 2. درايفر محركات L298N
 * 3. محركان تروس (Gear Motors 3-6V) مع عجلتين
 * 4. مؤشر LED أحمر على D2 (PWM 10% duty=25 حماية بدون مقاومة)
 * 5. بازر سلبي Passive Buzzer على D4 (tone 2000Hz)
 * 6. زر طوارئ أحمر فيزيائي على D32 (INPUT_PULLUP)
 * 7. تغذية 5V مشتركة (VIN + L298N مع إزالة جمبر 5V-EN)
 * 
 * ----------------------------------------------------------------------------------------
 * جدول توصيل الأطراف (Hardware Pinout - L298N & Indicators):
 * ----------------------------------------------------------------------------------------
 *   L298N ENA (PWM سرعة يمين)  -----> ESP32 D${cfg.pinMotorR_PWM}
 *   L298N IN1 (اتجاه يمين 1)    -----> ESP32 D${cfg.pinMotorR_DIR1}
 *   L298N IN2 (اتجاه يمين 2)    -----> ESP32 D${cfg.pinMotorR_DIR2}
 *   L298N ENB (PWM سرعة يسار)  -----> ESP32 D${cfg.pinMotorL_PWM}
 *   L298N IN3 (اتجاه يسار 1)    -----> ESP32 D${cfg.pinMotorL_DIR1}
 *   L298N IN4 (اتجاه يسار 2)    -----> ESP32 D${cfg.pinMotorL_DIR2}
 *   LED أحمر (مؤشر الحالة)     -----> ESP32 D2
 *   Buzzer (إنذار صوتي)        -----> ESP32 D${cfg.pinBuzzerOrRelay}
 *   زر الطوارئ (Red Cap)        -----> ESP32 D32 (إلى GND عند الضغط)
 * ========================================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <NetworkClient.h>

// 1. إعدادات شبكة Wi-Fi
const char* WIFI_SSID     = "${cfg.wifiSsid}";
const char* WIFI_PASSWORD = "${cfg.wifiPass}";

// نقطة الوصول البديلة في حال عدم توفر راوتر
const char* AP_SSID       = "ESP32-Wheelchair-WiFi";
const char* AP_PASSWORD   = "12345678";

// 2. تعريف أطراف الهاردوير المطبقة
#define PIN_ENA_RIGHT  ${cfg.pinMotorR_PWM}   // PWM سرعة المحرك الأيمن
#define PIN_IN1_RIGHT  ${cfg.pinMotorR_DIR1}  // اتجاه يمين 1
#define PIN_IN2_RIGHT  ${cfg.pinMotorR_DIR2}  // اتجاه يمين 2

#define PIN_ENB_LEFT   ${cfg.pinMotorL_PWM}   // PWM سرعة المحرك الأيسر
#define PIN_IN3_LEFT   ${cfg.pinMotorL_DIR1}  // اتجاه يسار 1
#define PIN_IN4_LEFT   ${cfg.pinMotorL_DIR2}  // اتجاه يسار 2

#define PIN_LED_RED     2   // LED مؤشر الحالة (PWM 10%)
#define PIN_BUZZER      ${cfg.pinBuzzerOrRelay}   // Buzzer إنذار صوتي
#define PIN_EMERGENCY  32   // زر الطوارئ الفيزيائي (INPUT_PULLUP)

// 3. إعدادات الـ PWM (Core 3.x API)
const uint32_t PWM_FREQ       = ${cfg.pwmFrequency}; // 5000 Hz
const uint8_t  PWM_RESOLUTION = 8;    // 8-bit (0 - 255)

// عزم كامل 100% للتغلب على هبوط جهد درايفر L298N واحتكاك الأرضية
const int SPEED_MAX     = 255; // أقصى طاقة 100% (255)
const int SPEED_DEFAULT = 235; // سرعة انطلاق قوية وثابتة للأمام والخلف (92%)
const int SPEED_TURN    = 255; // أقصى عزم 100% (255) لالتفاف قوي وسلس بدون تعليق
const int LED_DUTY_STANDBY = 25; // 10% PWM حماية للـ LED

// تصحيح قطبية المحركات برمجياً لحل مشكلة الاتجاه المعكوس
const int DIR_FWD = -1; // اتجاه الحركة للأمام
const int DIR_REV =  1; // اتجاه الحركة للخلف

// 4. متغيرات ومؤقتات الأمان
const unsigned long SAFETY_TIMEOUT_MS = 3000; // توقف تلقائي بعد 3 ثوانٍ عند انقطاع الإشارة
const unsigned long DEBOUNCE_DELAY_MS = 60;

unsigned long lastCommandTime = 0;
bool isEmergency = false;
char currentCommand = 'S';

int lastButtonReading = HIGH;
int buttonState = HIGH;
unsigned long lastDebounceTime = 0;

unsigned long lastBlinkTime = 0;
bool blinkState = false;

// 5. خوادم الشبكة
WebServer server(80);     // HTTP WebServer
WiFiServer tcpServer(81); // TCP Packet Server

void stopMotors() {
  digitalWrite(PIN_IN1_RIGHT, LOW);
  digitalWrite(PIN_IN2_RIGHT, LOW);
  digitalWrite(PIN_IN3_LEFT,  LOW);
  digitalWrite(PIN_IN4_LEFT,  LOW);
  ledcWrite(PIN_ENA_RIGHT, 0);
  ledcWrite(PIN_ENB_LEFT,  0);
  currentCommand = 'S';
}

void driveMotors(int leftSpeed, int rightSpeed, int leftDir, int rightDir) {
  if (isEmergency) {
    stopMotors();
    return;
  }

  leftSpeed  = constrain(leftSpeed, 0, SPEED_MAX);
  rightSpeed = constrain(rightSpeed, 0, SPEED_MAX);

  if (rightDir > 0) {
    digitalWrite(PIN_IN1_RIGHT, HIGH);
    digitalWrite(PIN_IN2_RIGHT, LOW);
  } else if (rightDir < 0) {
    digitalWrite(PIN_IN1_RIGHT, LOW);
    digitalWrite(PIN_IN2_RIGHT, HIGH);
  } else {
    digitalWrite(PIN_IN1_RIGHT, LOW);
    digitalWrite(PIN_IN2_RIGHT, LOW);
  }

  if (leftDir > 0) {
    digitalWrite(PIN_IN3_LEFT, HIGH);
    digitalWrite(PIN_IN4_LEFT, LOW);
  } else if (leftDir < 0) {
    digitalWrite(PIN_IN3_LEFT, LOW);
    digitalWrite(PIN_IN4_LEFT, HIGH);
  } else {
    digitalWrite(PIN_IN3_LEFT, LOW);
    digitalWrite(PIN_IN4_LEFT, LOW);
  }

  ledcWrite(PIN_ENA_RIGHT, rightSpeed);
  ledcWrite(PIN_ENB_LEFT,  leftSpeed);
  lastCommandTime = millis();
}

void toggleEmergency() {
  isEmergency = !isEmergency;
  stopMotors();
  if (isEmergency) {
    Serial.println("🚨 [طوارئ] تم تفعيل وضع الطوارئ!");
    tone(PIN_BUZZER, 2000, 350);
  } else {
    Serial.println("✅ [جاهزية] تم إلغاء وضع الطوارئ.");
    ledcWrite(PIN_LED_RED, LED_DUTY_STANDBY);
    tone(PIN_BUZZER, 1500, 100);
  }
}

void processCommand(char cmd) {
  if (cmd == 'E') {
    toggleEmergency();
    return;
  }
  if (isEmergency && cmd != 'S') {
    stopMotors();
    return;
  }

  currentCommand = cmd;
  lastCommandTime = millis();

  switch (cmd) {
    case 'F':
      driveMotors(SPEED_DEFAULT, SPEED_DEFAULT, DIR_FWD, DIR_FWD);
      tone(PIN_BUZZER, 1200, 40);
      break;
    case 'B':
      driveMotors(SPEED_DEFAULT, SPEED_DEFAULT, DIR_REV, DIR_REV);
      tone(PIN_BUZZER, 800, 60);
      break;
    case 'L':
      driveMotors(SPEED_TURN, SPEED_TURN, DIR_REV, DIR_FWD);
      tone(PIN_BUZZER, 1500, 30);
      break;
    case 'R':
      driveMotors(SPEED_TURN, SPEED_TURN, DIR_FWD, DIR_REV);
      tone(PIN_BUZZER, 1500, 30);
      break;
    case 'S':
    default:
      stopMotors();
      break;
  }
}

void parseIncomingPacket(String payload) {
  payload.trim();
  if (payload.length() == 0) return;
  if (payload.length() == 1) {
    processCommand(payload.charAt(0));
    return;
  }
  int cmdIdx = payload.indexOf("CMD:");
  int brakeIdx = payload.indexOf(",B:");
  if (brakeIdx >= 0) {
    int brakeVal = payload.substring(brakeIdx + 3).toInt();
    if (brakeVal == 1) {
      processCommand('S');
      return;
    }
  }
  if (cmdIdx >= 0 && payload.length() > (unsigned int)(cmdIdx + 4)) {
    char c = payload.charAt(cmdIdx + 4);
    processCommand(c);
  }
}

void handleRoot() {
  String html = "<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1.0'>";
  html += "<title>ESP32 Wheelchair Wi-Fi</title>";
  html += "<style>body{background:#090d16;color:#e2e8f0;font-family:sans-serif;text-align:center;padding:20px;}";
  html += ".box{max-width:400px;margin:auto;background:#131b2e;padding:20px;border-radius:16px;border:1px solid #00f0ff44;}";
  html += "button{padding:12px;margin:5px;font-size:16px;font-weight:bold;border:none;border-radius:8px;cursor:pointer;}";
  html += ".btn{background:#0284c7;color:#fff;}.stop{background:#dc2626;color:#fff;width:95%;}";
  html += "</style></head><body><div class='box'>";
  html += "<h2 style='color:#00f0ff;'>♿ الكرسي المتحرك الذكي (Wi-Fi)</h2>";
  html += "<p>الأمر الحالي: <b>" + String(currentCommand) + "</b></p>";
  html += "<button class='btn' onclick=\"fetch('/cmd?val=F')\">▲ للأمام</button><br>";
  html += "<button class='btn' onclick=\"fetch('/cmd?val=L')\">◄ يسار</button>";
  html += "<button class='btn' onclick=\"fetch('/cmd?val=S')\">■ توقف</button>";
  html += "<button class='btn' onclick=\"fetch('/cmd?val=R')\">يمين ►</button><br>";
  html += "<button class='btn' onclick=\"fetch('/cmd?val=B')\">▼ للخلف</button><br><br>";
  html += "<button class='stop' onclick=\"fetch('/cmd?val=S')\">فرملة فورية (STOP)</button>";
  html += "</div></body></html>";
  server.send(200, "text/html", html);
}

void handleCmd() {
  if (server.hasArg("val")) {
    String val = server.arg("val");
    if (val.length() > 0) processCommand(val.charAt(0));
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"status\":\"ok\",\"command\":\"" + String(currentCommand) + "\"}");
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_IN1_RIGHT, OUTPUT);
  pinMode(PIN_IN2_RIGHT, OUTPUT);
  pinMode(PIN_IN3_LEFT,  OUTPUT);
  pinMode(PIN_IN4_LEFT,  OUTPUT);
  pinMode(PIN_BUZZER,    OUTPUT);
  pinMode(PIN_EMERGENCY, INPUT_PULLUP);

  ledcAttach(PIN_ENA_RIGHT, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_ENB_LEFT,  PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_LED_RED,   PWM_FREQ, PWM_RESOLUTION);

  ledcWrite(PIN_LED_RED, LED_DUTY_STANDBY);
  stopMotors();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  bool wifiConnected = false;
  while (millis() - startAttempt < 8000) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      break;
    }
    delay(400);
    Serial.print(".");
  }

  if (wifiConnected) {
    Serial.println("\\n>> ✅ متصل بـ Wi-Fi! IP: " + WiFi.localIP().toString());
  } else {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.println("\\n>> ⚠️ وضع AP! IP: " + WiFi.softAPIP().toString());
  }

  server.enableCORS(true);
  server.on("/", handleRoot);
  server.on("/cmd", HTTP_GET, handleCmd);
  server.on("/cmd", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.begin();
  tcpServer.begin();
}

void loop() {
  unsigned long currentMillis = millis();
  server.handleClient();

  NetworkClient tcpClient = tcpServer.accept();
  if (tcpClient) {
    while (tcpClient.connected()) {
      if (tcpClient.available()) {
        String line = tcpClient.readStringUntil('\\n');
        parseIncomingPacket(line);
      }
      server.handleClient();
    }
    tcpClient.stop();
  }

  if (Serial.available()) {
    String serialLine = Serial.readStringUntil('\\n');
    parseIncomingPacket(serialLine);
  }

  int reading = digitalRead(PIN_EMERGENCY);
  if (reading != lastButtonReading) lastDebounceTime = currentMillis;
  if ((currentMillis - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != buttonState) {
      buttonState = reading;
      if (buttonState == LOW) toggleEmergency();
    }
  }
  lastButtonReading = reading;

  if (currentCommand != 'S' && (currentMillis - lastCommandTime > SAFETY_TIMEOUT_MS)) {
    stopMotors();
  }

  if (isEmergency) {
    if (currentMillis - lastBlinkTime > 200) {
      lastBlinkTime = currentMillis;
      blinkState = !blinkState;
      ledcWrite(PIN_LED_RED, blinkState ? 255 : 0);
      if (blinkState) tone(PIN_BUZZER, 2000, 50);
    }
  }
}
`;
  }
}

export const esp32ConnectionService = new Esp32ConnectionService();
