/*
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
 *   L298N ENA (PWM سرعة يمين)  -----> ESP32 D14
 *   L298N IN1 (اتجاه يمين 1)    -----> ESP32 D27
 *   L298N IN2 (اتجاه يمين 2)    -----> ESP32 D26
 *   L298N ENB (PWM سرعة يسار)  -----> ESP32 D12
 *   L298N IN3 (اتجاه يسار 1)    -----> ESP32 D25
 *   L298N IN4 (اتجاه يسار 2)    -----> ESP32 D33
 *   LED أحمر (مؤشر الحالة)     -----> ESP32 D2
 *   Buzzer (إنذار صوتي)        -----> ESP32 D4
 *   زر الطوارئ (Red Cap)        -----> ESP32 D32 (إلى GND عند الضغط)
 * ========================================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <NetworkClient.h>

// ========================================================================================
// 1. إعدادات شبكة الـ Wi-Fi (عدّل اسم وشبكة الراوتر لديك أو استخدم نقطة اتصال الهاتف)
// ========================================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";     // اكتب هنا اسم شبكة الواي فاي المنزلية أو نقطة اتصال هاتفك
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // كلمة مرور الواي فاي

// في حال عدم توفر راوتر، سينشئ الـ ESP32 نقطة وصول خاصة به (Access Point):
const char* AP_SSID       = "ESP32-Wheelchair-WiFi";
const char* AP_PASSWORD   = "12345678";

// ========================================================================================
// 2. تعريف أطراف الهاردوير المطبقة بدقة (Hardware Pins)
// ========================================================================================
#define PIN_ENA_RIGHT  14   // PWM سرعة المحرك الأيمن
#define PIN_IN1_RIGHT  27   // اتجاه يمين 1
#define PIN_IN2_RIGHT  26   // اتجاه يمين 2

#define PIN_ENB_LEFT   12   // PWM سرعة المحرك الأيسر
#define PIN_IN3_LEFT   25   // اتجاه يسار 1
#define PIN_IN4_LEFT   33   // اتجاه يسار 2

#define PIN_LED_RED     2   // LED مؤشر الحالة (PWM 10%)
#define PIN_BUZZER      4   // Buzzer إنذار صوتي
#define PIN_EMERGENCY  32   // زر الطوارئ الفيزيائي (INPUT_PULLUP)

// ========================================================================================
// 3. إعدادات السرعة وتردد الـ PWM (Core 3.x API)
// ========================================================================================
const uint32_t PWM_FREQ       = 5000; // 5000 Hz
const uint8_t  PWM_RESOLUTION = 8;    // 8-bit (0 - 255)

// رفع السرعة والعزم للتغلب على هبوط الجهد في درايفر L298N واحتكاك الأرضية أثناء الدوران
const int SPEED_MAX     = 255; // أقصى طاقة 100% (255)
const int SPEED_DEFAULT = 235; // سرعة حركة قوية ومستقرة للأمام والخلف (92%)
const int SPEED_TURN    = 255; // أقصى عزم 100% (255) للالتفاف السلس بدون تعليق أو بطء

// تصحيح قطبية المحركات (عكس اتجاه الحركة برمجياً لحل تعاكس الأسلاك)
const int DIR_FWD = -1; // الاتجاه للأمام (معكوس لحل مشكلة الاتجاه المعكوس)
const int DIR_REV =  1; // الاتجاه للخلف

const int LED_DUTY_STANDBY = 25; // 10% PWM حماية للـ LED بدون مقاومة

// ========================================================================================
// 4. متغيرات السلامة ومؤقت الأمان (Safety & Timers)
// ========================================================================================
const unsigned long SAFETY_TIMEOUT_MS = 3000; // توقف تلقائي بعد 3 ثوانٍ في حال انقطاع الإشارة
const unsigned long DEBOUNCE_DELAY_MS = 60;   // فلترة ضغطات زر الطوارئ

unsigned long lastCommandTime = 0;
bool isEmergency = false;
char currentCommand = 'S';

// حالة زر الطوارئ الفيزيائي
int lastButtonReading = HIGH;
int buttonState = HIGH;
unsigned long lastDebounceTime = 0;

// وميض LED في حالة الطوارئ
unsigned long lastBlinkTime = 0;
bool blinkState = false;

// ========================================================================================
// 5. إنشاء خوادم الشبكة (HTTP WebServer + TCP Port 81)
// ========================================================================================
WebServer server(80);          // خادم ويب على المنفذ 80 (لأوامر المتصفح ولوحة التحكم)
WiFiServer tcpServer(81);      // خادم حزم TCP السريع على المنفذ 81 (للمحاكي وللبث الفوري)

// ========================================================================================
// دوال قيادة المحركات والفرامل
// ========================================================================================
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

  // التحكم باتجاه المحرك الأيمن
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

  // التحكم باتجاه المحرك الأيسر
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

  // كتابة قيم السرعة PWM بواسطة Core 3.x API
  ledcWrite(PIN_ENA_RIGHT, rightSpeed);
  ledcWrite(PIN_ENB_LEFT,  leftSpeed);

  lastCommandTime = millis();
}

// تنفيذ أوامر الحركة الأساسية
void processCommand(char cmd) {
  if (cmd == 'E') {
    // تبديل وضع الطوارئ
    toggleEmergency();
    return;
  }

  if (isEmergency && cmd != 'S') {
    Serial.println("⚠️ تحذير: الكرسي في وضع الطوارئ! اضغط الزر الأحمر D32 أو أرسل 'E' لفك الحظر.");
    stopMotors();
    return;
  }

  currentCommand = cmd;
  lastCommandTime = millis();

  switch (cmd) {
    case 'F': // إلى الأمام (Forward)
      Serial.println(">> [حركة] للأمام (Forward)");
      driveMotors(SPEED_DEFAULT, SPEED_DEFAULT, DIR_FWD, DIR_FWD);
      tone(PIN_BUZZER, 1200, 40); // نغمة تنبيه خفيفة
      break;

    case 'B': // إلى الخلف (Backward)
      Serial.println(">> [حركة] للخلف (Backward)");
      driveMotors(SPEED_DEFAULT, SPEED_DEFAULT, DIR_REV, DIR_REV);
      tone(PIN_BUZZER, 800, 60);
      break;

    case 'L': // التفاف يسار (Left) - عزم كامل 100% (255)
      Serial.println(">> [حركة] دوران يسار قوي (Left - Max Torque 255)");
      driveMotors(SPEED_TURN, SPEED_TURN, DIR_REV, DIR_FWD);
      tone(PIN_BUZZER, 1500, 30);
      break;

    case 'R': // التفاف يمين (Right) - عزم كامل 100% (255)
      Serial.println(">> [حركة] دوران يمين قوي (Right - Max Torque 255)");
      driveMotors(SPEED_TURN, SPEED_TURN, DIR_FWD, DIR_REV);
      tone(PIN_BUZZER, 1500, 30);
      break;

    case 'S': // توقف (Stop) أو فرملة حيوية للعين (Deadman Safety)
    default:
      Serial.println(">> [توقف] فرملة المحركات (STOP)");
      stopMotors();
      break;
  }
}

// تبديل حالة الطوارئ (Emergency Toggle)
void toggleEmergency() {
  isEmergency = !isEmergency;
  stopMotors();

  if (isEmergency) {
    Serial.println("🚨 [طوارئ] تم تفعيل وضع الطوارئ! المحركات معطلة.");
    tone(PIN_BUZZER, 2000, 350);
  } else {
    Serial.println("✅ [جاهزية] تم إلغاء وضع الطوارئ. الكرسي جاهز للعمل.");
    ledcWrite(PIN_LED_RED, LED_DUTY_STANDBY);
    tone(PIN_BUZZER, 1500, 100);
  }
}

// تحليل الحزم النصية الموسعة من المحاكي: CMD:F,L:200,R:200,B:0
void parseIncomingPacket(String payload) {
  payload.trim();
  if (payload.length() == 0) return;

  // إذا كان أمراً حرفياً مفرداً
  if (payload.length() == 1) {
    processCommand(payload.charAt(0));
    return;
  }

  // فحص صيغة المحاكي الذكية
  int cmdIdx = payload.indexOf("CMD:");
  int brakeIdx = payload.indexOf(",B:");
  
  if (brakeIdx >= 0) {
    int brakeVal = payload.substring(brakeIdx + 3).toInt();
    if (brakeVal == 1) {
      // إغلاق العين (Deadman Safety Brake) -> توقف فوري
      processCommand('S');
      return;
    }
  }

  if (cmdIdx >= 0 && payload.length() > (unsigned int)(cmdIdx + 4)) {
    char c = payload.charAt(cmdIdx + 4);
    processCommand(c);
  }
}

// ========================================================================================
// مسارات خادم الويب HTTP WebServer (Port 80)
// ========================================================================================
void handleRoot() {
  String html = "<!DOCTYPE html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>ESP32 Wheelchair Wi-Fi Controller</title>";
  html += "<style>";
  html += "body{font-family:sans-serif;background:#090d16;color:#e2e8f0;text-align:center;padding:20px;margin:0;}";
  html += ".card{max-width:440px;margin:auto;background:#131b2e;padding:24px;border-radius:18px;border:1px solid #00f0ff33;box-shadow:0 0 30px #00f0ff22;}";
  html += "h1{color:#00f0ff;font-size:20px;margin-bottom:6px;}";
  html += ".status{font-size:14px;padding:8px;background:#1e293b;border-radius:8px;margin:12px 0;}";
  html += ".grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;}";
  html += "button{padding:14px 6px;font-size:16px;font-weight:bold;border:none;border-radius:10px;cursor:pointer;transition:0.2s;}";
  html += ".btn-cmd{background:#0284c7;color:white;}.btn-cmd:active{background:#0369a1;}";
  html += ".btn-stop{background:#dc2626;color:white;grid-column:span 3;}";
  html += ".btn-emg{background:#7f1d1d;color:#fca5a5;border:1px solid #ef4444;grid-column:span 3;}";
  html += "</style></head><body><div class='card'>";
  html += "<h1>♿ وحدة تحكم الكرسي الذكي (Wi-Fi)</h1>";
  html += "<div class='status'>الحالة الحالية: <b style='color:#00f0ff;'>" + String(currentCommand) + "</b> | الطوارئ: " + String(isEmergency ? "<span style='color:#f87171'>مفعلة 🚨</span>" : "<span style='color:#4ade80'>طبيعية ✓</span>") + "</div>";
  html += "<div class='grid'>";
  html += "<div></div><button class='btn-cmd' onclick=\"fetch('/cmd?val=F')\">▲ للأمام</button><div></div>";
  html += "<button class='btn-cmd' onclick=\"fetch('/cmd?val=L')\">◄ يسار</button>";
  html += "<button class='btn-cmd' onclick=\"fetch('/cmd?val=S')\">■ توقف</button>";
  html += "<button class='btn-cmd' onclick=\"fetch('/cmd?val=R')\">يمين ►</button>";
  html += "<div></div><button class='btn-cmd' onclick=\"fetch('/cmd?val=B')\">▼ للخلف</button><div></div>";
  html += "<button class='btn-stop' onclick=\"fetch('/cmd?val=S')\">فرملة فورية (STOP)</button>";
  html += "<button class='btn-emg' onclick=\"fetch('/cmd?val=E')\">🚨 زر الطوارئ (Emergency Toggle)</button>";
  html += "</div>";
  html += "<p style='font-size:11px;color:#94a3b8;'>متصل بمحاكي حركة بؤبؤ العين والرأس ثلاثي الأبعاد</p>";
  html += "</div></body></html>";
  server.send(200, "text/html", html);
}

void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.send(204);
}

void handleCmd() {
  if (server.hasArg("val")) {
    String val = server.arg("val");
    if (val.length() > 0) {
      processCommand(val.charAt(0));
    }
  }
  // دعم CORS للطلب من المتصفح والمحاكي
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"status\":\"ok\",\"command\":\"" + String(currentCommand) + "\",\"emergency\":" + (isEmergency ? "true" : "false") + "}");
}

void handleStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String currentIp = (WiFi.getMode() == WIFI_AP) ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  String json = "{";
  json += "\"command\":\"" + String(currentCommand) + "\",";
  json += "\"emergency\":" + String(isEmergency ? "true" : "false") + ",";
  json += "\"uptime_ms\":" + String(millis()) + ",";
  json += "\"ip\":\"" + currentIp + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

// ========================================================================================
// دالة الإعداد setup()
// ========================================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=======================================================");
  Serial.println(">> جاري إقلاع نظام الكرسي المتحرك الذكي عبر Wi-Fi...");
  Serial.println("=======================================================");

  // 1. تهيئة أطراف الاتجاه لدرايفر L298N
  pinMode(PIN_IN1_RIGHT, OUTPUT);
  pinMode(PIN_IN2_RIGHT, OUTPUT);
  pinMode(PIN_IN3_LEFT,  OUTPUT);
  pinMode(PIN_IN4_LEFT,  OUTPUT);

  // 2. تهيئة أطراف المؤشرات والأمان
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_EMERGENCY, INPUT_PULLUP);

  // 3. تهيئة قنوات PWM بواسطة Core 3.x API الحديث
  ledcAttach(PIN_ENA_RIGHT, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_ENB_LEFT,  PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_LED_RED,   PWM_FREQ, PWM_RESOLUTION);

  // إضاءة LED أحمر خافتة كإشارة جاهزية (10% duty = 25)
  ledcWrite(PIN_LED_RED, LED_DUTY_STANDBY);

  // التوقف الأولي للمحركات
  stopMotors();

  // نغمة ترحيبية عند بدء التشغيل
  tone(PIN_BUZZER, 1000, 150);
  delay(180);
  tone(PIN_BUZZER, 2000, 200);

  // 4. محاولة الاتصال بشبكة الـ Wi-Fi المنزلية
  Serial.print(">> جاري الاتصال بشبكة Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  bool wifiConnected = false;

  // انتظر 8 ثوانٍ كحد أقصى للاتصال بالراوتر
  while (millis() - startAttempt < 8000) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      break;
    }
    delay(400);
    Serial.print(".");
  }

  Serial.println("");

  if (wifiConnected) {
    Serial.println(">> ✅ تم الاتصال بشبكة Wi-Fi بنجاح!");
    Serial.print(">> 🌐 عنوان IP الخاص بالكرسي: http://");
    Serial.println(WiFi.localIP());
  } else {
    // في حال عدم العثور على الشبكة: فتح نقطة وصول تلقائياً (Access Point)
    Serial.println("⚠️ تعذر الاتصال بالراوتر. جاري إنشاء نقطة وصول خاصة (Access Point)...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.println(">> ✅ تم تشغيل نقطة الوصول بنجاح!");
    Serial.print(">> اسم الشبكة: ");
    Serial.println(AP_SSID);
    Serial.print(">> كلمة المرور: ");
    Serial.println(AP_PASSWORD);
    Serial.print(">> 🌐 عنوان IP الافتراضي: http://");
    Serial.println(WiFi.softAPIP());
  }

  // 5. بدء خوادم الاستقبال
  server.enableCORS(true);
  server.on("/", handleRoot);
  server.on("/cmd", HTTP_GET, handleCmd);
  server.on("/cmd", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.begin();
  Serial.println(">> ✅ خادم الويب HTTP (Port 80) يعمل الآن.");

  tcpServer.begin();
  Serial.println(">> ✅ خادم البث الفوري TCP (Port 81) جاهز لاستقبال بيانات المحاكي.");
  Serial.println("=======================================================\n");
}

// ========================================================================================
// الحلقة الرئيسية loop()
// ========================================================================================
void loop() {
  unsigned long currentMillis = millis();

  // --------------------------------------------------------------------------------------
  // أ. معالجة طلبات خادم الويب HTTP
  // --------------------------------------------------------------------------------------
  server.handleClient();

  // --------------------------------------------------------------------------------------
  // ب. معالجة حزم خادم TCP Port 81 (المحاكي وحزم بؤبؤ العين اللحظية)
  // --------------------------------------------------------------------------------------
  NetworkClient tcpClient = tcpServer.accept();
  if (tcpClient) {
    while (tcpClient.connected()) {
      if (tcpClient.available()) {
        String line = tcpClient.readStringUntil('\n');
        parseIncomingPacket(line);
      }
      server.handleClient(); // الاستمرار في خدمة الويب بالتوازي
    }
    tcpClient.stop();
  }

  // --------------------------------------------------------------------------------------
  // ج. الاستماع الموازي لمنفذ السيريال USB (اختبار الأوامر F, B, L, R, S, E عبر الكابل)
  // --------------------------------------------------------------------------------------
  if (Serial.available()) {
    String serialLine = Serial.readStringUntil('\n');
    parseIncomingPacket(serialLine);
  }

  // --------------------------------------------------------------------------------------
  // د. فحص زر الطوارئ الفيزيائي D32 (مع مانع الارتداد Debounce)
  // --------------------------------------------------------------------------------------
  int reading = digitalRead(PIN_EMERGENCY);
  if (reading != lastButtonReading) {
    lastDebounceTime = currentMillis;
  }

  if ((currentMillis - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != buttonState) {
      buttonState = reading;
      // الزر تم ضغطه (انتقل من HIGH إلى LOW عبر INPUT_PULLUP)
      if (buttonState == LOW) {
        Serial.println("🔘 [زر فيزيائي] تم الضغط على زر الطوارئ D32!");
        toggleEmergency();
      }
    }
  }
  lastButtonReading = reading;

  // --------------------------------------------------------------------------------------
  // هـ. مؤقت الأمان التلقائي (Safety Timeout - 3 ثواني)
  // --------------------------------------------------------------------------------------
  if (currentCommand != 'S' && (currentMillis - lastCommandTime > SAFETY_TIMEOUT_MS)) {
    Serial.println("⏱️ [أمان] انقطعت إشارة الأوامر لأكثر من 3 ثوانٍ -> إيقاف المحركات تلقائياً.");
    stopMotors();
  }

  // --------------------------------------------------------------------------------------
  // و. سلوك المؤشرات في وضع الطوارئ
  // --------------------------------------------------------------------------------------
  if (isEmergency) {
    if (currentMillis - lastBlinkTime > 200) {
      lastBlinkTime = currentMillis;
      blinkState = !blinkState;
      ledcWrite(PIN_LED_RED, blinkState ? 255 : 0);
      if (blinkState) {
        tone(PIN_BUZZER, 2000, 50);
      }
    }
  }
}
