import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Cross-Origin Resource Sharing for local Python scripts
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Real-time Eye & Head Tracking state
let latestEyeData = {
  direction: 'Stop',
  command: 'S',
  eyeCommand: 'S',
  headCommand: 'S',
  gazeX: 0,
  gazeY: 0,
  eyeOpen: true,
  eyeOpenness: 100,
  headRoll: 0,
  headPitch: 0,
  headYaw: 0,
  controlMode: 'eye_only',
  timestamp: Date.now(),
  source: 'python_opencv' as const
};

// Connected SSE clients for instantaneous broadcast
const sseClients = new Set<Response>();

// Python OpenCV Endpoint: receives eye & head tracking detections from your python script
app.post('/api/eye-tracking', (req: Request, res: Response) => {
  const { direction, command, eyeCommand, headCommand, gazeX, gazeY, eyeOpen, eyeOpenness, headRoll, headPitch, headYaw, controlMode } = req.body;

  let eyeCmd = 'S';
  const dirLower = String(direction || '').toLowerCase();
  if (dirLower === 'forward') eyeCmd = 'F';
  else if (dirLower === 'backward') eyeCmd = 'B';
  else if (dirLower === 'left') eyeCmd = 'L';
  else if (dirLower === 'right') eyeCmd = 'R';
  else eyeCmd = 'S';

  const finalControlMode = controlMode || 'eye_only';
  let effectiveCmd = eyeCmd;
  if (finalControlMode === 'head_only') {
    effectiveCmd = headCommand || 'S';
  } else if (finalControlMode === 'eye_only') {
    effectiveCmd = eyeCmd;
  } else {
    // fused
    effectiveCmd = eyeCmd !== 'S' ? eyeCmd : (headCommand || 'S');
  }

  latestEyeData = {
    direction: direction || 'Stop',
    command: (command || effectiveCmd) as any,
    eyeCommand: (eyeCommand || eyeCmd) as any,
    headCommand: (headCommand || 'S') as any,
    gazeX: typeof gazeX === 'number' ? Math.max(-1, Math.min(1, gazeX)) : 0,
    gazeY: typeof gazeY === 'number' ? Math.max(-1, Math.min(1, gazeY)) : 0,
    eyeOpen: eyeOpen !== undefined ? !!eyeOpen : true,
    eyeOpenness: typeof eyeOpenness === 'number' ? Math.max(0, Math.min(100, eyeOpenness)) : (eyeOpen === false ? 0 : 100),
    headRoll: typeof headRoll === 'number' ? Math.max(-45, Math.min(45, headRoll)) : 0,
    headPitch: typeof headPitch === 'number' ? Math.max(-50, Math.min(50, headPitch)) : 0,
    headYaw: typeof headYaw === 'number' ? Math.max(-60, Math.min(60, headYaw)) : 0,
    controlMode: finalControlMode,
    timestamp: Date.now(),
    source: 'python_opencv'
  };

  // Broadcast to all active browser windows via SSE
  const payload = `data: ${JSON.stringify(latestEyeData)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }

  res.json({
    status: 'ok',
    message: 'Eye tracking data received and broadcast to 3D simulation',
    received: latestEyeData,
    activeSubscribers: sseClients.size
  });
});

// SSE Stream for React client
app.get('/api/eye-tracking/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state immediately
  res.write(`data: ${JSON.stringify(latestEyeData)}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Outbound ESP32 Motor Commands state
let latestEsp32Outbound = {
  payload: 'CMD:S,L:0,R:0,B:0\n',
  motorState: {
    command: 'S',
    leftPwm: 0,
    rightPwm: 0,
    leftDir: 'BRAKE',
    rightDir: 'BRAKE',
    deadmanActive: false,
    speedPercent: 0,
    timestamp: Date.now()
  },
  timestamp: Date.now()
};

const esp32Clients = new Set<Response>();

let currentEsp32TargetIp: string | null = '192.168.4.1';

// Set active ESP32 IP
app.post('/api/esp32/target-ip', (req: Request, res: Response) => {
  currentEsp32TargetIp = req.body.ip || null;
  res.json({ status: 'ok', targetIp: currentEsp32TargetIp });
});

// Server-side Wi-Fi Ping to ESP32 (bypasses browser CORS & mixed-content restrictions)
app.post('/api/esp32/wifi-ping', async (req: Request, res: Response) => {
  const ip = req.body.ip || currentEsp32TargetIp;
  const port = req.body.port || 80;
  if (!ip) {
    return res.status(400).json({ success: false, error: 'عنوان IP مطلوب' });
  }

  currentEsp32TargetIp = ip;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const resp = await fetch(`http://${ip}:${port}/status`, { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      return res.json({ success: true, ip, data, mode: 'http_rest' });
    }
  } catch (err: any) {
    // Try pinging root /
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const rootResp = await fetch(`http://${ip}:${port}/`, { signal: controller.signal });
      clearTimeout(timer);
      if (rootResp.ok) {
        return res.json({ success: true, ip, mode: 'http_rest', message: 'ESP32 WebServer is online' });
      }
    } catch (e: any) {
      return res.status(502).json({
        success: false,
        ip,
        error: `تعذر الوصول إلى ESP32 على العنوان ${ip}:${port}. تأكد من اتصال الكمبيوتر بشبكة ESP32`
      });
    }
  }

  return res.status(502).json({ success: false, ip, error: 'لم يستجب ESP32' });
});

// Receive outbound motor commands from simulator
app.post('/api/esp32/outbound', (req: Request, res: Response) => {
  const { payload, motorState } = req.body;
  if (payload) {
    latestEsp32Outbound = {
      payload,
      motorState: motorState || latestEsp32Outbound.motorState,
      timestamp: Date.now()
    };

    // Forward command directly to ESP32 via Wi-Fi from server-side Node.js
    if (currentEsp32TargetIp && latestEsp32Outbound.motorState?.command) {
      const cmdChar = latestEsp32Outbound.motorState.command;
      const targetUrl = `http://${currentEsp32TargetIp}/cmd?val=${cmdChar}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600);
      fetch(targetUrl, { signal: controller.signal })
        .then(() => clearTimeout(timeout))
        .catch(() => clearTimeout(timeout));
    }

    const sseMsg = `data: ${JSON.stringify(latestEsp32Outbound)}\n\n`;
    for (const client of esp32Clients) {
      try {
        client.write(sseMsg);
      } catch (e) {
        esp32Clients.delete(client);
      }
    }
  }
  res.json({ status: 'ok', sent: latestEsp32Outbound, targetIp: currentEsp32TargetIp });
});

// Endpoint for ESP32 (Wi-Fi client) to fetch the latest motor command
// Usage: GET /api/esp32/command (returns JSON) or GET /api/esp32/command?format=raw (returns raw string e.g. "CMD:F,L:200,R:200,B:0")
app.get('/api/esp32/command', (req: Request, res: Response) => {
  if (req.query.format === 'raw') {
    res.setHeader('Content-Type', 'text/plain');
    return res.send(latestEsp32Outbound.payload);
  }
  if (req.query.format === 'char') {
    res.setHeader('Content-Type', 'text/plain');
    return res.send(latestEsp32Outbound.motorState?.command || 'S');
  }
  res.json(latestEsp32Outbound);
});

// SSE Stream for connected ESP32 Wi-Fi devices or monitoring clients
app.get('/api/esp32/command/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify(latestEsp32Outbound)}\n\n`);
  esp32Clients.add(res);

  req.on('close', () => {
    esp32Clients.delete(res);
  });
});

// Status check
app.get('/api/eye-tracking', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    latest: latestEyeData,
    subscribers: sseClients.size
  });
});

// Initialize Vite server or static serve
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Eye Tracking API ready at http://localhost:${PORT}/api/eye-tracking`);
  });
}

startServer();
