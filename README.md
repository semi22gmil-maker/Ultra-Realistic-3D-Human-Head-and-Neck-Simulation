# Ultra-Realistic 3D Human Head and Neck Simulation
### Wheelchair Head-Motion Telemetry & Cervical Kinematics with ESP32 & MPU-6050

An interactive, anatomically accurate 3D simulation of a human head and neck rendered with a scientific white wireframe aesthetic on a pure black background. Designed for wheelchair head-motion control systems powered by an ESP32 microcontroller and MPU-6050 accelerometer/gyroscope.

---

## Features

- **Anatomically Convincing 3D Model**:
  - Uses the 3D human head & neck photogrammetry scan (`LeePerrySmith.glb`, 9,279 vertices, 18,558 polygons).
  - Accurate skull vault, forehead, temples, supraorbital ridges, eye orbits, eyelids, nose with nostrils, upper and lower lips, jawline, chin, ears with visible pinna/helix/tragus contours, and cervical neck down to the clavicle.
  - White wireframe mesh following true surface facial topography on a pure black `#000000` background.
  - Zero decorative cartoon styling or geometric sphere/cylinder approximations.
- **Organic Cervical Spine Articulation**:
  - Hardware-accelerated SkinnedMesh with an anatomical 3-segment cervical hierarchy (`Cervical_C7_Base` at neck root, `Cervical_C4_Mid` for smooth cervical bend, and `Cranium_C1_Head` for skull nodding and axial rotation).
  - Smooth distance-falloff skinning prevents mesh clipping or unnatural neck detachment.
- **ESP32 & MPU-6050 Serial Integration**:
  - Direct USB Web Serial connection (default target `COM25` at `115200` baud).
  - Parses the exact ESP32 newline-terminated firmware string:
    ```text
    dP=+18.5 dR=-2.4 | pMag=18.5 rMag=2.4 | CMD='F'
    ```
  - Extracts `dP` (Pitch angle), `dR` (Roll angle), and `CMD` ('F'=Forward, 'B'=Backward, 'L'=Left, 'R'=Right, 'S'=Stop).
  - Built-in **ESP32 Stream Simulator** allowing desktop validation at 50Hz without physical hardware connected.
  - Robust error handling for malformed or incomplete serial packets.
- **Testing & Telemetry HUD**:
  - Real-time Pitch (`-45°` to `+45°`), Roll (`-35°` to `+35°`), and Yaw (`-60°` to `+60°`) sliders.
  - Signed degree readouts and directional motion vectors.
  - One-click **Reset to Neutral** and **Calibrate Zero** (resting posture compensation).
  - **Play/Pause Test Animation** loop for autonomous nodding, tilting, and scanning validation.
  - Adjustable exponential smoothing (`0.02` to `0.80`) and sensitivity scaling (`0.2x` to `2.5x`).
  - Drag-and-drop support for any custom rigged or unrigged `.glb` / `.gltf` 3D model.

---

## Hardware Connection (ESP32 DevKit to MPU-6050)

| ESP32 Pin | MPU-6050 Pin | Wire Function |
| :--- | :--- | :--- |
| **3V3** | **VCC** | 3.3V DC Power |
| **GND** | **GND** | Common Ground |
| **GPIO 21** | **SDA** | I2C Serial Data line |
| **GPIO 22** | **SCL** | I2C Serial Clock line |

> **Note on Accelerometer Yaw vs Pitch/Roll:**
> 6-axis IMUs (like the MPU-6050) measure Earth's 1G gravity vector. Pitch (flexion/extension) and Roll (lateral tilt) alter the angle of gravity across the axes, allowing exact tilt recovery via `atan2()`. In contrast, horizontal **Yaw** rotation is perpendicular to gravity and causes zero change in the gravity vector. Without a 9-axis sensor (with a magnetometer) or optical tracking, any gyro-integrated yaw experiences drift. The application explicitly labels Yaw as manual/simulated.

---

## ESP32 Arduino Firmware

The firmware sketch is included directly in the application (click the **FIRMWARE** button in the top bar to view or copy).

Dependencies in Arduino IDE:
1. `Adafruit MPU6050`
2. `Adafruit Unified Sensor`
3. `Wire` (built-in)

---

## Running the Application Locally

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# The app is available at http://localhost:3000
```

### Custom GLB Model Loading

- Place any custom `.glb` model into `public/models/` or drag-and-drop the file directly onto the 3D viewport.
- If the model contains bones (e.g. `mixamorig:Head`, `neck`, `spine`), the controller automatically binds the rotation to the existing skeleton.
- If the model is an unrigged mesh, the application automatically builds an anatomical cervical spine rig with smooth skinning.

---

## Troubleshooting

1. **Web Serial API Access**:
   - Web Serial is supported in **Google Chrome**, **Microsoft Edge**, and **Opera**.
   - Requires HTTPS or `localhost` context.
2. **Accessing COM25 on Windows**:
   - Ensure the Arduino IDE Serial Monitor or Putty is closed before clicking **Connect ESP32** in the browser. Only one application can lock the COM port at a time.
3. **USB Cable**:
   - Verify that your USB cable supports high-speed data transmission, not power-only charging.
