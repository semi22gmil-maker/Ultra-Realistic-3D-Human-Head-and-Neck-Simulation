"""
====================================================================
نظام تتبع حركة بؤبؤ العين والرأس فائق الدقة للتحكم بالكرسي المتحرك والمحاكاة ثلاثية الأبعاد
High-Precision Eye Pupil & Head Tracking with Independent Channels & Real-Time Simulation
متصل مباشرة بسيرفر المحاكاة (Port 3000)
====================================================================
الميزات الرئيسية طبقاً لطلب المستخدم:
1. قياس اتجاه النظر بشكل دقيق ومستقل تماماً:
   - بؤبؤ العين إلى اليمين -> إشارة "Right" (يمين)
   - بؤبؤ العين إلى اليسار -> إشارة "Left" (يسار)
   - بؤبؤ العين إلى الأعلى -> إشارة "Forward" (أمام)
   - بؤبؤ العين إلى الأسفل -> إشارة "Backward" (خلف)
   - بؤبؤ العين في المنتصف -> إشارة "Stop" (توقف حيادي)
   - إغلاق العينين -> فرملة أمان حيوية فورية (Deadman Safety Brake: Stop)
2. فصل تتبع بؤبؤ العين فصلاً كاملاً عن حركة الرأس.
3. كشف الوجه والعين عبر Haar Cascades (Face & Eye Cascades) بدقة عالية.
4. مصفوفة معايرة فورية بمفتاح [c] لمعايرة نقطة المركز.
5. مفتاح [m] للتبديل بين: (تتبع العين فقط / حركة الرأس فقط / هجين مدمج).
====================================================================
"""

import sys
import os
import math
import json
import urllib.request
import time

# التحقق من استيراد مكتبة OpenCV
try:
    import cv2
except ImportError:
    print("\n" + "=" * 65)
    print("❌ خطأ: مكتبة OpenCV غير مثبتة على هذا الجهاز.")
    print("يرجى تشغيل الأمر التالي في الطرفية (PowerShell):")
    print('    pip install "opencv-python<5.0" numpy')
    print("=" * 65 + "\n")
    sys.exit(1)

# فحص توفر دوال وواجهات OpenCV
if not hasattr(cv2, 'CascadeClassifier'):
    if hasattr(cv2, 'cv2') and hasattr(cv2.cv2, 'CascadeClassifier'):
        cv2 = cv2.cv2
    elif hasattr(cv2, 'objdetect') and hasattr(cv2.objdetect, 'CascadeClassifier'):
        cv2.CascadeClassifier = cv2.objdetect.CascadeClassifier
    else:
        cv2_ver = getattr(cv2, '__version__', 'غير معروف')
        print("\n" + "=" * 70)
        print(f"❌ خطأ: إصدار OpenCV المثبت لديك ({cv2_ver}) لا يدعم CascadeClassifier.")
        print("\n💡 الحل الفوري بأمر واحد في PowerShell:")
        print('   pip install "opencv-python<5.0" numpy')
        print("=" * 70 + "\n")
        sys.exit(1)

try:
    import numpy as np
except ImportError:
    print("يرجى تثبيت numpy: pip install numpy")
    sys.exit(1)

API_ENDPOINT = "http://localhost:3000/api/eye-tracking"

def send_to_simulation(direction, gaze_x=0.0, gaze_y=0.0, eye_open=True, 
                       eye_openness=100, eye_command="S",
                       head_pitch=0.0, head_roll=0.0, head_yaw=0.0, 
                       head_command="S", control_mode="eye_only"):
    """
    إرسال بيانات حركة بؤبؤ العين وزوايا الرأس بشكل منفصل لحظياً إلى سيرفر المحاكاة ثلاثية الأبعاد
    """
    try:
        payload = json.dumps({
            "direction": str(direction),
            "command": str(eye_command if control_mode == "eye_only" else (head_command if control_mode == "head_only" else eye_command)),
            "gazeX": round(float(gaze_x), 3),
            "gazeY": round(float(gaze_y), 3),
            "eyeOpen": bool(eye_open),
            "eyeOpenness": int(eye_openness),
            "eyeCommand": str(eye_command),
            "headPitch": round(float(head_pitch), 2),
            "headRoll": round(float(head_roll), 2),
            "headYaw": round(float(head_yaw), 2),
            "headCommand": str(head_command),
            "controlMode": str(control_mode),
            "timestamp": int(time.time() * 1000)
        }).encode('utf-8')
        
        req = urllib.request.Request(
            API_ENDPOINT, 
            data=payload, 
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=0.035)
    except Exception:
        pass

def get_cascade_path(filename):
    """
    الحصول على مسار ملفات Haar Cascade مع فحص المجلد الحالي ومجلد المشروع
    وتنزيل الملف تلقائياً من خادم OpenCV الرسمي إن لم يكن موجوداً
    """
    script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
    cwd = os.getcwd()

    candidates = [
        os.path.join(script_dir, filename),
        os.path.join(script_dir, "haarcascades", filename),
        os.path.join(cwd, filename),
        os.path.join(cwd, "haarcascades", filename),
    ]

    # فحص مسار cv2.data المدمج في بيئة بايثون
    if hasattr(cv2, 'data') and hasattr(cv2.data, 'haarcascades') and cv2.data.haarcascades:
        candidates.append(os.path.join(cv2.data.haarcascades, filename))

    # فحص مسارات مكتبة cv2 في site-packages
    cv2_file = getattr(cv2, '__file__', None)
    if cv2_file:
        cv2_dir = os.path.dirname(os.path.abspath(cv2_file))
        candidates.append(os.path.join(cv2_dir, 'data', filename))
        candidates.append(os.path.join(cv2_dir, 'data', 'haarcascades', filename))

    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 1024:
            return os.path.abspath(p)

    # إذا لم يوجد الملف محلياً، نقوم بتنزيله تلقائياً وفورياً إلى مجلد المشروع
    target_path = os.path.join(script_dir, filename)
    print(f">> ⏳ جاري تنزيل ملف النموذج الذكي ({filename}) تلقائياً من مستودع OpenCV الرسمي...")
    url = f"https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/{filename}"
    try:
        urllib.request.urlretrieve(url, target_path)
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            print(f">> ✅ تم تنزيل ({filename}) وحفظه بنجاح ({os.path.getsize(target_path)} بايت)")
            return os.path.abspath(target_path)
    except Exception as e:
        print(f"⚠️ تعذر التنزيل التلقائي لـ {filename}: {e}")

    return os.path.abspath(target_path)


def detect_pupil_in_eye_roi(eye_roi):
    """
    اكتشاف مكان بؤبؤ العين بدقة داخل صندوق العين (ex, ey, ew, eh)
    مع إزالة الحواجب العلوية لضمان عدم حدوث قراءة خاطئة، وفحص فتح/إغلاق العين
    """
    if eye_roi is None or eye_roi.shape[0] < 12 or eye_roi.shape[1] < 12:
        return None, 0.0, False

    eh, ew = eye_roi.shape

    # استبعاد الثلث العلوي (منطقة الحواجب والرموش العلوية) لتجنب الانخداع بالسواد الخارجي
    y_start = int(eh * 0.18)
    y_end = int(eh * 0.88)
    cornea_crop = eye_roi[y_start:y_end, :]

    if cornea_crop.shape[0] < 8 or cornea_crop.shape[1] < 8:
        return None, 0.0, False

    # تنعيم الصورة لتقليل الضوضاء
    blurred = cv2.GaussianBlur(cornea_crop, (7, 7), 0)

    min_val, max_val, min_loc, _ = cv2.minMaxLoc(blurred)
    mean_val = float(cv2.mean(blurred)[0])
    contrast = mean_val - min_val

    # حساب نسبة انفراج الجفن وفتح العين
    openness_score = min(100.0, max(0.0, contrast * 2.2))

    # إذا كانت العين مغلقة: التباين بين أدكن نقطة والمتوسط يقل جداً
    if contrast < 16.0:
        return None, openness_score, False

    # عتبة تكيفية لاقتطاع أدكن منطقة (البؤبؤ)
    thresh_limit = int(min_val + max(14, contrast * 0.38))
    thresh_limit = min(thresh_limit, 105)

    _, threshold = cv2.threshold(blurred, thresh_limit, 255, cv2.THRESH_BINARY_INV)

    # البحث عن الكنتور المناظر للبؤبؤ
    contours, _ = cv2.findContours(threshold, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    pupil_center = None
    if contours:
        # فرز الكنتورات بحسب المساحة
        valid_contours = []
        for c in contours:
            area = cv2.contourArea(c)
            if area > 6:
                valid_contours.append((area, c))

        if valid_contours:
            valid_contours.sort(key=lambda x: x[0], reverse=True)
            best_contour = valid_contours[0][1]

            # حساب مركز الثقل للكنتور
            M = cv2.moments(best_contour)
            if M["m00"] > 0:
                cx = float(M["m10"] / M["m00"])
                cy = float(M["m01"] / M["m00"]) + y_start
                pupil_center = (int(cx), int(cy), 5)
            else:
                (cx, cy), radius = cv2.minEnclosingCircle(best_contour)
                pupil_center = (int(cx), int(cy) + y_start, int(max(3, radius)))

    if pupil_center is None:
        # احتياطي أدكن بكسل
        pupil_center = (min_loc[0], min_loc[1] + y_start, 4)

    return pupil_center, openness_score, True

def main():
    print("=" * 72)
    print(">> جاري تشغيل نظام تتبع حركة بؤبؤ العين والرأس فائق الدقة...")
    print(f">> الرابط المستهدف للمحاكاة: {API_ENDPOINT}")
    print(">> اختصارات لوحة المفاتيح أثناء تشغيل الكاميرا:")
    print("   [q] : الخروج من البرنامج")
    print("   [c] : معايرة مركز بؤبؤ العين الطبيعي كنقطة الصفر الحيادية (Calibrate)")
    print("   [m] : التبديل بين الأوضاع: (عين فقط / رأس فقط / هجين مدمج)")
    print("=" * 72)

    # تحميل كواشف Haar Cascades
    face_path = get_cascade_path('haarcascade_frontalface_default.xml')
    eye_path = get_cascade_path('haarcascade_eye.xml')

    face_cascade = cv2.CascadeClassifier(face_path)
    if face_cascade.empty():
        # محاولة بديلة لنموذج الوجه
        face_path = get_cascade_path('haarcascade_frontalface_alt2.xml')
        face_cascade = cv2.CascadeClassifier(face_path)

    eye_cascade = cv2.CascadeClassifier(eye_path)
    if eye_cascade.empty():
        # محاولة بديلة لنموذج العين مع النظارات
        eye_path = get_cascade_path('haarcascade_eye_tree_eyeglasses.xml')
        eye_cascade = cv2.CascadeClassifier(eye_path)

    if face_cascade.empty():
        print(f"\n❌ تعذر تحميل نموذج كشف الوجه من المسار: {face_path}")
        print("💡 الملف haarcascade_frontalface_default.xml موجود الآن في مجلد المشروع.")
        print("   يرجى التأكد من تشغيل الأمر داخل مجلد المشروع نفسه:")
        print("   cd C:\\Users\\KING\\Desktop\\semi")
        print("   python eye_tracker.py\n")
        return

    print(f">> ✅ تم تحميل نموذج الوجه بنجاح: {os.path.basename(face_path)}")
    print(f">> ✅ تم تحميل نموذج العين بنجاح: {os.path.basename(eye_path)}")


    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ خطأ: تعذر فتح الكاميرا (Camera 0). تأكد من توصيل الكاميرا.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    # أوضاع التحكم
    CONTROL_MODES = ["eye_only", "head_only", "fused_head_eye"]
    MODE_LABELS = {
        "eye_only": "تتبع بؤبؤ العين فقط (منفصل)",
        "head_only": "حركة الرأس فقط (منفصل)",
        "fused_head_eye": "تحكم هجين (رأس + عين معاً)"
    }
    mode_index = 0

    # متغيرات المعايرة الحركية
    neutral_face_x = None
    neutral_face_y = None
    neutral_face_w = None
    neutral_face_h = None
    neutral_eye_dx = 0.0
    neutral_eye_dy = 0.0

    last_face = None
    face_miss_counter = 0

    last_send_time = 0
    SEND_INTERVAL = 0.030 # ~33 FPS

    # ترشيح وتنعيم منفصل لكل قناة
    smooth_gaze_x = 0.0
    smooth_gaze_y = 0.0
    smooth_pitch = 0.0
    smooth_roll = 0.0
    smooth_yaw = 0.0

    print(">> الكاميرا تعمل بنجاح! يتم الآن تتبع حركة بؤبؤ العين ورصد الاتجاهات.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # انعكاس أفقي للمرآة الطبيعية
        frame = cv2.flip(frame, 1)
        frame_h, frame_w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # كشف الوجه
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.2, 
            minNeighbors=5, 
            minSize=(120, 120)
        )

        eye_found = False
        raw_gaze_x = 0.0
        raw_gaze_y = 0.0
        raw_pitch = 0.0
        raw_roll = 0.0
        raw_yaw = 0.0
        openness_percent = 100.0

        eye_direction = "Stop"
        eye_cmd = "S"
        head_direction = "Stop"
        head_cmd = "S"

        face = None
        if len(faces) > 0:
            face = max(faces, key=lambda f: f[2] * f[3])
            last_face = face
            face_miss_counter = 0
        elif last_face is not None and face_miss_counter < 12:
            face = last_face
            face_miss_counter += 1

        if face is not None:
            fx, fy, fw, fh = face
            cv2.rectangle(frame, (fx, fy), (fx + fw, fy + fh), (60, 60, 60), 1)

            face_center_x = fx + (fw / 2.0)
            face_center_y = fy + (fh / 2.0)

            if neutral_face_x is None:
                neutral_face_x = face_center_x
                neutral_face_y = face_center_y
                neutral_face_w = fw
                neutral_face_h = fh

            # ------------------------------------------------------------------
            # 1. حساب زوايا حركة الرأس (منفصلة تماماً عن بؤبؤ العين)
            # ------------------------------------------------------------------
            # Pitch: انحناء للأعلى / للأسفل
            pitch_delta = (face_center_y - neutral_face_y) / max(1.0, neutral_face_h * 0.28)
            raw_pitch = max(-40.0, min(40.0, -pitch_delta * 30.0))

            # Yaw: التفاف أفقي
            yaw_delta = (face_center_x - neutral_face_x) / max(1.0, neutral_face_w * 0.28)
            raw_yaw = max(-45.0, min(45.0, yaw_delta * 35.0))

            # تقييم أمر حركة الرأس المستقل
            if abs(raw_pitch) > 10.0 or abs(raw_yaw) > 12.0:
                if abs(raw_pitch) >= abs(raw_yaw):
                    if raw_pitch > 10.0:
                        head_direction = "Forward"
                        head_cmd = "F"
                    else:
                        head_direction = "Backward"
                        head_cmd = "B"
                else:
                    if raw_yaw > 12.0:
                        head_direction = "Right"
                        head_cmd = "R"
                    else:
                        head_direction = "Left"
                        head_cmd = "L"
            else:
                head_direction = "Stop"
                head_cmd = "S"

            # ------------------------------------------------------------------
            # 2. كشف العينين وتتبع بؤبؤ العين بدقة عالية (منفصلة تماماً)
            # ------------------------------------------------------------------
            face_gray = gray[fy:fy + int(fh * 0.60), fx:fx + fw]
            detected_eyes = []

            if not eye_cascade.empty():
                detected_eyes = eye_cascade.detectMultiScale(
                    face_gray,
                    scaleFactor=1.12,
                    minNeighbors=3,
                    minSize=(32, 32),
                    maxSize=(int(fw * 0.45), int(fh * 0.38))
                )

            # إذا لم يتمكن eye_cascade من تحديد العين، نستخدم الصناديق التشريحية التلقائية
            if len(detected_eyes) == 0:
                eye_w = int(fw * 0.30)
                eye_h = int(fh * 0.24)
                eye_y = int(fh * 0.20)
                # عين يسرى وعين يمنى بالنسبة لمشاهد الفيديو
                detected_eyes = [
                    (int(fw * 0.14), eye_y, eye_w, eye_h),
                    (int(fw * 0.56), eye_y, eye_w, eye_h)
                ]

            valid_pupil_results = []

            for (ex, ey, ew, eh) in detected_eyes:
                abs_ex = fx + ex
                abs_ey = fy + ey
                eye_roi = face_gray[ey:ey+eh, ex:ex+ew]

                pupil_info, openness_val, is_open = detect_pupil_in_eye_roi(eye_roi)

                # رسم مستطيل العين باللون الأخضر
                cv2.rectangle(frame, (abs_ex, abs_ey), (abs_ex + ew, abs_ey + eh), (0, 255, 0), 1)

                mid_x = ew / 2.0
                mid_y = eh / 2.0

                # رسم علامة التصويب المركزية باللون الأصفر لمشاهدة نقطة المنتصف
                cv2.line(frame, (int(abs_ex + mid_x - 5), int(abs_ey + mid_y)), 
                                (int(abs_ex + mid_x + 5), int(abs_ey + mid_y)), (0, 255, 255), 1)
                cv2.line(frame, (int(abs_ex + mid_x), int(abs_ey + mid_y - 5)), 
                                (int(abs_ex + mid_x), int(abs_ey + mid_y + 5)), (0, 255, 255), 1)

                if is_open and pupil_info:
                    cx, cy, radius = pupil_info
                    # رسم دائرة بؤبؤ العين باللون الأحمر
                    cv2.circle(frame, (abs_ex + cx, abs_ey + cy), radius, (0, 0, 255), 2)
                    cv2.circle(frame, (abs_ex + cx, abs_ey + cy), 2, (0, 255, 255), -1)

                    # حساب انزياح البؤبؤ بالنسبة لمركز العين
                    # في الكاميرا المنعكسة (Mirrored):
                    # - النظر لليمين: يتحرك البؤبؤ ليمين الصورة (cx > mid_x)
                    # - النظر لليسار: يتحرك البؤبؤ ليسار الصورة (cx < mid_x)
                    # - النظر للأعلى: يرتفع البؤبؤ لأعلى الصورة (cy < mid_y)
                    # - النظر للأسفل: ينخفض البؤبؤ لأسفل الصورة (cy > mid_y)
                    dx = cx - mid_x
                    dy = cy - mid_y

                    valid_pupil_results.append((dx, dy, ew, eh, openness_val, abs_ex + cx, abs_ey + cy))

            # حساب زاوية Roll إن وجدنا بؤبؤين
            if len(valid_pupil_results) >= 2:
                p1 = valid_pupil_results[0]
                p2 = valid_pupil_results[1]
                dx_eyes = p2[5] - p1[5]
                dy_eyes = p2[6] - p1[6]
                if abs(dx_eyes) > 10:
                    raw_roll = max(-35.0, min(35.0, math.degrees(math.atan2(dy_eyes, dx_eyes))))

            if len(valid_pupil_results) > 0:
                eye_found = True
                # أخذ متوسط انزياح البؤبؤ
                avg_dx = sum(p[0] for p in valid_pupil_results) / len(valid_pupil_results)
                avg_dy = sum(p[1] for p in valid_pupil_results) / len(valid_pupil_results)
                avg_ew = sum(p[2] for p in valid_pupil_results) / len(valid_pupil_results)
                avg_eh = sum(p[3] for p in valid_pupil_results) / len(valid_pupil_results)
                openness_percent = sum(p[4] for p in valid_pupil_results) / len(valid_pupil_results)

                # تطبيق المعايرة
                cal_dx = avg_dx - neutral_eye_dx
                cal_dy = avg_dy - neutral_eye_dy

                # تطبيع القيمة إلى النطاق [-1.0, 1.0]
                raw_gaze_x = max(-1.0, min(1.0, cal_dx / max(1.0, avg_ew * 0.22)))
                raw_gaze_y = max(-1.0, min(1.0, cal_dy / max(1.0, avg_eh * 0.20)))

                # --------------------------------------------------------------
                # عتبات كشف اتجاه بؤبؤ العين (مطابقة تماماً لطلب المستخدم)
                # --------------------------------------------------------------
                offset_x = max(2.8, avg_ew * 0.075)
                offset_y = max(2.2, avg_eh * 0.065)

                # أولوية الاتجاه الأفقي والعمودي بناءً على الإزاحة الأكبر
                abs_x_ratio = abs(cal_dx) / offset_x
                abs_y_ratio = abs(cal_dy) / offset_y

                if abs_x_ratio > 1.0 or abs_y_ratio > 1.0:
                    if abs_x_ratio >= abs_y_ratio:
                        # حركة أفقية للبؤبؤ
                        if cal_dx > offset_x:
                            eye_direction = "Right"
                            eye_cmd = "R"
                        elif cal_dx < -offset_x:
                            eye_direction = "Left"
                            eye_cmd = "L"
                    else:
                        # حركة عمودية للبؤبؤ
                        # عندما ينظر للأعلى: cy يقل (cal_dy سالب) -> Forward للأمام
                        if cal_dy < -offset_y:
                            eye_direction = "Forward"
                            eye_cmd = "F"
                        # عندما ينظر للأسفل: cy يزداد (cal_dy موجب) -> Backward للخلف
                        elif cal_dy > offset_y:
                            eye_direction = "Backward"
                            eye_cmd = "B"
                else:
                    eye_direction = "Stop"
                    eye_cmd = "S"
            else:
                # العين مغلقة -> توقف فوري (فرملة أمان)
                eye_found = False
                openness_percent = 0.0
                eye_direction = "Stop"
                eye_cmd = "S"
                raw_gaze_x = 0.0
                raw_gaze_y = 0.0

        # تطبيق تنعيم منفصل
        smooth_gaze_x += (raw_gaze_x - smooth_gaze_x) * 0.45
        smooth_gaze_y += (raw_gaze_y - smooth_gaze_y) * 0.45
        smooth_pitch += (raw_pitch - smooth_pitch) * 0.35
        smooth_roll += (raw_roll - smooth_roll) * 0.35
        smooth_yaw += (raw_yaw - smooth_yaw) * 0.35

        current_mode = CONTROL_MODES[mode_index]

        # تحديد الأمر النهائي الصادر للكرسي المتحرك طبقاً للوضع المحدد
        if not eye_found:
            active_cmd = "Stop"
        elif current_mode == "eye_only":
            active_cmd = eye_direction
        elif current_mode == "head_only":
            active_cmd = head_direction
        else: # fused
            if eye_direction != "Stop":
                active_cmd = eye_direction
            elif head_direction != "Stop":
                active_cmd = head_direction
            else:
                active_cmd = "Stop"

        # إرسال البيانات إلى السيرفر دورياً
        curr_time = time.time()
        if curr_time - last_send_time >= SEND_INTERVAL:
            send_to_simulation(
                direction=eye_direction,
                gaze_x=smooth_gaze_x,
                gaze_y=smooth_gaze_y,
                eye_open=eye_found,
                eye_openness=openness_percent,
                eye_command=eye_cmd,
                head_pitch=smooth_pitch,
                head_roll=smooth_roll,
                head_yaw=smooth_yaw,
                head_command=head_cmd,
                control_mode=current_mode
            )
            last_send_time = curr_time

        # ------------------------------------------------------------------
        # رسم الواجهة التفاعلية الاحترافية (HUD) على شاشة الفيديو
        # ------------------------------------------------------------------
        # خلفية الشريط العلوي
        cv2.rectangle(frame, (0, 0), (frame_w, 85), (20, 20, 20), -1)

        # 1. بطاقة اتجاه العين (Eye Gaze Card)
        if not eye_found:
            cv2.rectangle(frame, (10, 8), (270, 76), (0, 0, 160), -1)
            cv2.putText(frame, "[!] EYES CLOSED: STOP", (20, 36), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
            cv2.putText(frame, "DEADMAN BRAKE ACTIVE", (20, 60), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 255), 1)
        else:
            dir_colors = {
                "Forward": (0, 180, 0),     # أخضر للأمام
                "Backward": (0, 140, 220),   # برتقالي للخلف
                "Left": (220, 120, 0),      # أزرق لليسار
                "Right": (180, 0, 180),     # بنفسجي لليمين
                "Stop": (70, 70, 70)        # رمادي للتوقف
            }
            c_color = dir_colors.get(eye_direction, (70, 70, 70))
            cv2.rectangle(frame, (10, 8), (270, 76), c_color, -1)
            cv2.putText(frame, f"EYE: {eye_direction.upper()}", (20, 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
            cv2.putText(frame, f"CMD='{eye_cmd}' | Open: {int(openness_percent)}%", (20, 64), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # 2. بطاقة معلومات الرأس ووضع التحكم (منفصلة تماماً)
        cv2.putText(frame, f"MODE: {MODE_LABELS[current_mode]} [m]", (285, 26), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 220, 255), 1)
        cv2.putText(frame, f"EYE GAZE: X:{smooth_gaze_x:+.2f} | Y:{smooth_gaze_y:+.2f}", (285, 48), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.44, (180, 255, 180), 1)
        cv2.putText(frame, f"HEAD POSE: P:{smooth_pitch:+.1f} R:{smooth_roll:+.1f} Y:{smooth_yaw:+.1f} -> CMD='{head_cmd}'", (285, 70), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (220, 220, 220), 1)

        # 3. علامة التصويب المتقاطعة لبؤبؤ العين (Pupil Reticle) في الزاوية اليمنى
        ret_x, ret_y, ret_r = frame_w - 55, 42, 30
        cv2.circle(frame, (ret_x, ret_y), ret_r, (80, 80, 80), 1)
        cv2.line(frame, (ret_x - ret_r, ret_y), (ret_x + ret_r, ret_y), (60, 60, 60), 1)
        cv2.line(frame, (ret_x, ret_y - ret_r), (ret_x, ret_y + ret_r), (60, 60, 60), 1)

        # أسهم الاتجاهات على علامة التصويب
        cv2.putText(frame, "F", (ret_x - 4, ret_y - ret_r + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 255, 0), 1)
        cv2.putText(frame, "B", (ret_x - 4, ret_y + ret_r - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 165, 255), 1)
        cv2.putText(frame, "L", (ret_x - ret_r + 2, ret_y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (255, 200, 0), 1)
        cv2.putText(frame, "R", (ret_x + ret_r - 10, ret_y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (255, 0, 255), 1)

        target_dot_x = int(ret_x + smooth_gaze_x * (ret_r - 4))
        target_dot_y = int(ret_y + smooth_gaze_y * (ret_r - 4))
        dot_color = (0, 255, 255) if eye_found else (0, 0, 255)
        cv2.circle(frame, (target_dot_x, target_dot_y), 5, dot_color, -1)

        # شريط التعليمات السفلي
        cv2.putText(frame, "[c] Calibrate Center | [m] Toggle Mode | [q] Exit", (15, frame_h - 15), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)

        cv2.imshow('Precision Eye Tracking & Head Simulation', frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c'):
            # معايرة نقطة المنتصف الطبيعية
            if face is not None:
                neutral_face_x = face[0] + (face[2] / 2.0)
                neutral_face_y = face[1] + (face[3] / 2.0)
                neutral_face_w = face[2]
                neutral_face_h = face[3]
                neutral_eye_dx += smooth_gaze_x * (face[2] * 0.22)
                neutral_eye_dy += smooth_gaze_y * (face[3] * 0.20)
                print(">> تم ضبط موضع بؤبؤ العين والرأس الحالي كنقطة الصفر الحيادية بنجاح!")
        elif key == ord('m'):
            mode_index = (mode_index + 1) % len(CONTROL_MODES)
            print(f">> تم تغيير وضع التحكم إلى: {MODE_LABELS[CONTROL_MODES[mode_index]]}")

    cap.release()
    cv2.destroyAllWindows()
    print(">> تم إغلاق الكاميرا بنجاح.")

if __name__ == '__main__':
    main()
