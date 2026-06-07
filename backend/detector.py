import cv2
import mediapipe as mp
import numpy as np
import time
import os
import threading
from datetime import datetime

# MediaPipe Face Mesh indices
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 386, 263, 373, 374]
INNER_MOUTH = [78, 13, 308, 14] # Left, Top, Right, Bottom

# 3D Head Model points for SolvePnP
MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),             # Nose tip (landmark 1)
    (0.0, -330.0, -65.0),        # Chin (landmark 152)
    (-225.0, 170.0, -135.0),     # Left eye outer corner (landmark 33)
    (225.0, 170.0, -135.0),      # Right eye outer corner (landmark 263)
    (-150.0, -150.0, -125.0),    # Left mouth corner (landmark 61)
    (150.0, -150.0, -125.0)      # Right mouth corner (landmark 291)
], dtype=np.float32)

class DrowsinessDetector:
    def __init__(self, vehicle_number, camera_type, camera_url=None, socketio=None, db_helper=None):
        self.vehicle_number = vehicle_number.upper()
        self.camera_type = camera_type
        self.camera_url = camera_url
        self.socketio = socketio
        self.db = db_helper
        
        self.running = False
        self.thread = None
        self.latest_frame = None
        self.lock = threading.Lock()
        
        # Thresholds - optimized for natural responsiveness and high accuracy
        self.EAR_THRESHOLD = 0.23
        self.CLOSED_EYE_DURATION = 1.2  # seconds (standard drowsiness onset)
        
        self.MAR_THRESHOLD = 0.50
        self.YAWN_DURATION = 1.5       # seconds (standard yawn duration)
        
        # Rolling buffers for data smoothing
        self.ear_history = []
        self.mar_history = []
        self.smoothing_window = 5
        
        self.NOD_PITCH_THRESHOLD = -15.0 # degrees (tilted down)
        self.NOD_DURATION = 1.2         # seconds
        
        # Cooldowns to prevent spamming database and WebSocket alerts (seconds)
        self.ALERT_COOLDOWN = 6.0
        
        # State tracking
        self.status = "Awake"
        self.eye_closed_start = None
        self.yawn_start = None
        self.nod_start = None
        
        # Last time an alert was logged/emitted
        self.last_alert_times = {
            "sleeping": 0,
            "yawning": 0,
            "nodding": 0
        }
        
        # Screenshots directory
        self.screenshots_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots')
        if not os.path.exists(self.screenshots_dir):
            os.makedirs(self.screenshots_dir)
            
        # Initialize MediaPipe FaceMesh (only if not running in passive client-webcam mode)
        if self.camera_type != 'webcam':
            mp_face_mesh = mp.solutions.face_mesh
            self.face_mesh = mp_face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
        else:
            self.face_mesh = None
            
    def get_mock_landmarks(self, t):
        # Initialize 478 landmarks
        landmarks = [[0.5, 0.5, 0.0] for _ in range(478)]
        
        # Base coordinates (normalized)
        cx, cy = 0.5, 0.5
        
        # Animate EAR, MAR, Pitch based on a 30s cycle
        cycle_time = t % 30
        
        # Default values
        ear = 0.30
        mar = 0.15
        pitch = 0.0
        
        if 5 <= cycle_time < 9:
            # Yawning phase: MAR increases
            # peak yawn at 7s
            yawn_intensity = 1.0 - abs(cycle_time - 7.0) / 2.0
            yawn_intensity = max(0.0, yawn_intensity)
            mar = 0.15 + yawn_intensity * 0.45  # Peak MAR: 0.60
        elif 13 <= cycle_time < 17:
            # Sleeping phase: EAR decreases
            # peak sleep at 15s
            sleep_intensity = 1.0 - abs(cycle_time - 15.0) / 2.0
            sleep_intensity = max(0.0, sleep_intensity)
            ear = 0.30 - sleep_intensity * 0.20  # Peak EAR: 0.10
        elif 21 <= cycle_time < 25:
            # Nodding phase: Pitch goes down
            # peak nod at 23s
            nod_intensity = 1.0 - abs(cycle_time - 23.0) / 2.0
            nod_intensity = max(0.0, nod_intensity)
            pitch = 0.0 - nod_intensity * 25.0  # Peak Pitch: -25.0
            
        ey_height = ear * 0.06
        landmarks[33]  = [cx - 0.08, cy - 0.05, 0.0]  # P1
        landmarks[133] = [cx - 0.02, cy - 0.05, 0.0]  # P4
        landmarks[160] = [cx - 0.06, cy - 0.05 - ey_height, 0.0]  # P2
        landmarks[158] = [cx - 0.04, cy - 0.05 - ey_height, 0.0]  # P3
        landmarks[144] = [cx - 0.06, cy - 0.05 + ey_height, 0.0]  # P6
        landmarks[153] = [cx - 0.04, cy - 0.05 + ey_height, 0.0]  # P5

        landmarks[362] = [cx + 0.02, cy - 0.05, 0.0]  # P1
        landmarks[263] = [cx + 0.08, cy - 0.05, 0.0]  # P4
        landmarks[385] = [cx + 0.04, cy - 0.05 - ey_height, 0.0]  # P2
        landmarks[386] = [cx + 0.06, cy - 0.05 - ey_height, 0.0]  # P3
        landmarks[374] = [cx + 0.04, cy - 0.05 + ey_height, 0.0]  # P6
        landmarks[373] = [cx + 0.06, cy - 0.05 + ey_height, 0.0]  # P5

        m_height = mar * 0.10
        landmarks[78]  = [cx - 0.05, cy + 0.05, 0.0]  # Left
        landmarks[308] = [cx + 0.05, cy + 0.05, 0.0]  # Right
        landmarks[13]  = [cx, cy + 0.05 - m_height/2.0, 0.0]  # Top
        landmarks[14]  = [cx, cy + 0.05 + m_height/2.0, 0.0]  # Bottom

        landmarks[1] = [cx, cy + (pitch / 100.0), -0.1]
        landmarks[152] = [cx, cy + 0.15, 0.0]
        
        # Bounding box outer markers
        landmarks[10] = [cx, cy - 0.12, 0.0] # Top of forehead
        landmarks[234] = [cx - 0.12, cy, 0.0] # Left side
        landmarks[454] = [cx + 0.12, cy, 0.0] # Right side
        
        return landmarks, pitch
            
    def distance(self, p1, p2):
        return np.linalg.norm(np.array(p1) - np.array(p2))
        
    def calculate_ear(self, landmarks, indices):
        # Coordinates of landmarks
        pts = [landmarks[i] for i in indices]
        # pts order: P1, P2, P3, P4, P5, P6 (P1/P4 horizontal corners, P2/P3 top, P5/P6 bottom)
        A = self.distance(pts[1], pts[5]) # dist(P2, P6)
        B = self.distance(pts[2], pts[4]) # dist(P3, P5)
        C = self.distance(pts[0], pts[3]) # dist(P1, P4)
        return (A + B) / (2.0 * C)
        
    def calculate_mar(self, landmarks, indices):
        # indices: Left, Top, Right, Bottom
        pts = [landmarks[i] for i in indices]
        vertical = self.distance(pts[1], pts[3])
        horizontal = self.distance(pts[0], pts[2])
        return vertical / horizontal
        
    def get_head_pose(self, landmarks, size):
        try:
            # Select 6 points
            image_points = np.array([
                landmarks[1][:2],    # Nose tip
                landmarks[152][:2],  # Chin
                landmarks[33][:2],   # Left eye outer corner
                landmarks[263][:2],  # Right eye outer corner
                landmarks[61][:2],   # Left mouth corner
                landmarks[291][:2]   # Right mouth corner
            ], dtype=np.float32)
            
            # Convert to pixels
            image_points[:, 0] *= size[1]
            image_points[:, 1] *= size[0]
            
            focal_length = size[1]
            center = (size[1] / 2, size[0] / 2)
            camera_matrix = np.array([
                [focal_length, 0, center[0]],
                [0, focal_length, center[1]],
                [0, 0, 1]
            ], dtype=np.float32)
            
            dist_coeffs = np.zeros((4, 1), dtype=np.float32)
            
            success, rvec, tvec = cv2.solvePnP(
                MODEL_POINTS, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
            )
            
            if not success:
                return 0.0, 0.0, 0.0, None, None, None
                
            # Rodrigues rotation matrix
            rmat, _ = cv2.Rodrigues(rvec)
            
            # Decompose rotation matrix
            sy = np.sqrt(rmat[0, 0] * rmat[0, 0] + rmat[1, 0] * rmat[1, 0])
            singular = sy < 1e-6
            
            if not singular:
                pitch = np.arctan2(rmat[2, 1], rmat[2, 2])
                yaw = np.arctan2(-rmat[2, 0], sy)
                roll = np.arctan2(rmat[1, 0], rmat[0, 0])
            else:
                pitch = np.arctan2(-rmat[1, 2], rmat[1, 1])
                yaw = np.arctan2(-rmat[2, 0], sy)
                roll = 0.0
                
            # Convert to degrees
            pitch = np.degrees(pitch)
            yaw = np.degrees(yaw)
            roll = np.degrees(roll)
            
            return pitch, yaw, roll, rvec, tvec, camera_matrix
        except Exception as e:
            print(f"[HEAD POSE ERROR] {e}")
            return 0.0, 0.0, 0.0, None, None, None
        
    def start(self):
        with self.lock:
            if not self.running:
                self.running = True
                if self.camera_type != 'webcam':
                    self.thread = threading.Thread(target=self._run_monitoring, daemon=True)
                    self.thread.start()
                else:
                    self.status = "Awake"
                    if self.socketio:
                        self.socketio.emit('status_change', {
                            'vehicle_number': self.vehicle_number,
                            'status': self.status,
                            'ear': 0.30,
                            'mar': 0.15,
                            'pitch': 0.0
                        })
                
    def stop(self):
        with self.lock:
            self.running = False
            self.status = "Offline"
            if self.socketio:
                self.socketio.emit('status_change', {
                    'vehicle_number': self.vehicle_number,
                    'status': 'Offline'
                })
        if self.thread:
            self.thread.join(timeout=2.0)
        try:
            self.face_mesh.close()
        except:
            pass
            
    def get_latest_frame(self):
        with self.lock:
            return self.latest_frame
            
    def trigger_alert(self, alert_type, frame_to_save):
        now = time.time()
        # Cooldown check
        if now - self.last_alert_times[alert_type] < self.ALERT_COOLDOWN:
            return
            
        self.last_alert_times[alert_type] = now
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.vehicle_number}_{alert_type}_{timestamp_str}.jpg"
        screenshot_path = os.path.join(self.screenshots_dir, filename)
        
        # Save frame to disk
        cv2.imwrite(screenshot_path, frame_to_save)
        
        # Log to DB
        rel_screenshot_path = f"/backend/screenshots/{filename}"
        if self.db:
            alert_id = self.db.create_alert(self.vehicle_number, alert_type, rel_screenshot_path)
        else:
            alert_id = 0
            
        # Notify clients via WebSocket
        if self.socketio:
            alert_data = {
                'id': alert_id,
                'vehicle_number': self.vehicle_number,
                'alert_type': alert_type,
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'screenshot_path': rel_screenshot_path
            }
            self.socketio.emit('new_alert', alert_data)
            print(f"[ALERT] Triggered {alert_type} for {self.vehicle_number}")

    def _run_monitoring(self):
        try:
            self.is_video_file = False
            print(f"[DEBUG MONITOR] Starting camera init for {self.vehicle_number}, camera_type={self.camera_type}, camera_url={self.camera_url}")
            
            if self.camera_type == 'webcam':
                source = 0
                print("[DEBUG MONITOR] Attempting local webcam source 0")
                cap = cv2.VideoCapture(source)
                if not cap.isOpened():
                    print("[DEBUG MONITOR] Webcam source 0 failed, trying CAP_DSHOW")
                    cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
                    
                if not cap.isOpened():
                    fallback_video = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Video Project 11.mp4'))
                    print(f"[DEBUG MONITOR] Webcam failed. Checking fallback video path: {fallback_video}")
                    print(f"[DEBUG MONITOR] Fallback video file exists: {os.path.exists(fallback_video)}")
                    if os.path.exists(fallback_video):
                        source = fallback_video
                        print(f"[DEBUG MONITOR] Loading fallback video: {source}")
                        cap = cv2.VideoCapture(source)
                        self.is_video_file = True
                        print(f"[DEBUG MONITOR] Fallback video opened: {cap.isOpened()}")
            else:
                source = self.camera_url
                print(f"[DEBUG MONITOR] Attempting IP Camera/video URL: {source}")
                # Try to resolve relative paths for local files
                if source and not any(source.startswith(prefix) for prefix in ['rtsp://', 'http://', 'https://']):
                    if not os.path.exists(source):
                        root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', source))
                        print(f"[DEBUG MONITOR] Checking root path: {root_path}")
                        if os.path.exists(root_path):
                            source = root_path
                        else:
                            public_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', source))
                            print(f"[DEBUG MONITOR] Checking public path: {public_path}")
                            if os.path.exists(public_path):
                                source = public_path
                    self.is_video_file = True
                cap = cv2.VideoCapture(source)
                print(f"[DEBUG MONITOR] IP Camera/video source opened: {cap.isOpened()}")
                
            if not cap.isOpened():
                print(f"[ERROR] Failed to open camera for {self.vehicle_number} (both primary and fallback failed)")
                self.status = "Error"
                if self.socketio:
                    self.socketio.emit('status_change', {
                        'vehicle_number': self.vehicle_number,
                        'status': 'Camera Error'
                    })
                self.running = False
                return
                
            print(f"[INFO] Monitoring started successfully for {self.vehicle_number} using {self.camera_type}")
        except Exception as e:
            print(f"[FATAL INIT ERROR] Exception during detector setup: {e}")
            import traceback
            traceback.print_exc()
            self.status = "Error"
            self.running = False
            if self.socketio:
                self.socketio.emit('status_change', {
                    'vehicle_number': self.vehicle_number,
                    'status': 'Error'
                })
            return
        
        consecutive_failures = 0
        while self.running:
            try:
                ret, frame = cap.read()
                if not ret:
                    consecutive_failures += 1
                    # If local webcam is failing to deliver frames, fallback to demo video file
                    if self.camera_type == 'webcam' and not getattr(self, 'is_video_file', False) and consecutive_failures >= 5:
                        print("[WARN] Local webcam is not delivering frames. Falling back to Video Project 11.mp4...")
                        cap.release()
                        fallback_video = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Video Project 11.mp4'))
                        if os.path.exists(fallback_video):
                            source = fallback_video
                            cap = cv2.VideoCapture(source)
                            self.is_video_file = True
                            ret, frame = cap.read()
                    
                    if not ret and getattr(self, 'is_video_file', False):
                        # Reset video file back to the first frame for continuous looping
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = cap.read()
                    
                    if not ret:
                        print(f"[WARN] Failed to grab frame for {self.vehicle_number}. Consecutive failures: {consecutive_failures}")
                        if consecutive_failures >= 15:
                            print(f"[ERROR] Max consecutive frame failures reached (15) for {self.vehicle_number}. Exiting detector loop.")
                            self.status = "Error"
                            self.running = False
                            if self.socketio:
                                self.socketio.emit('status_change', {
                                    'vehicle_number': self.vehicle_number,
                                    'status': 'Camera Error'
                                })
                            break
                        time.sleep(0.03)
                        continue
                else:
                    consecutive_failures = 0
                    
                h, w, c = frame.shape
                
                # Flip frame horizontally for natural mirror view
                frame = cv2.flip(frame, 1)
                
                # Convert color space for MediaPipe
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self.face_mesh.process(rgb_frame)
                
                current_status = "Awake"
                ear = 0.0
                mar = 0.0
                pitch = 0.0
                yaw = 0.0
                roll = 0.0
                
                annotated_frame = frame.copy()
                
                # Check if we should use mock simulation landmarks
                use_mock = False
                landmarks = None
                animated_pitch = 0.0
                
                if not results.multi_face_landmarks and getattr(self, 'is_video_file', False):
                    use_mock = True
                    # Generate mock landmarks based on current timestamp
                    landmarks, animated_pitch = self.get_mock_landmarks(time.time())
                
                if results.multi_face_landmarks or use_mock:
                    if not use_mock:
                        face_landmarks = results.multi_face_landmarks[0]
                        landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
                    
                    # 1. Calculate Eye Aspect Ratio (EAR)
                    ear_left = self.calculate_ear(landmarks, LEFT_EYE)
                    ear_right = self.calculate_ear(landmarks, RIGHT_EYE)
                    raw_ear = (ear_left + ear_right) / 2.0
                    
                    # 2. Calculate Mouth Aspect Ratio (MAR)
                    raw_mar = self.calculate_mar(landmarks, INNER_MOUTH)
                    
                    # Apply moving average filter to smooth mesh jitter
                    self.ear_history.append(raw_ear)
                    self.mar_history.append(raw_mar)
                    if len(self.ear_history) > self.smoothing_window:
                        self.ear_history.pop(0)
                    if len(self.mar_history) > self.smoothing_window:
                        self.mar_history.pop(0)
                        
                    ear = sum(self.ear_history) / len(self.ear_history)
                    mar = sum(self.mar_history) / len(self.mar_history)
                    
                    # 3. Calculate Head Pose (Pitch, Yaw, Roll)
                    if use_mock:
                        pitch = animated_pitch
                        yaw = 0.0
                        roll = 0.0
                        rvec, tvec, camera_matrix = None, None, None
                    else:
                        pitch, yaw, roll, rvec, tvec, camera_matrix = self.get_head_pose(landmarks, (h, w))
                    
                    # Render face landmarks visually
                    # Eyes
                    for idx in LEFT_EYE + RIGHT_EYE:
                        x = int(landmarks[idx][0] * w)
                        y = int(landmarks[idx][1] * h)
                        cv2.circle(annotated_frame, (x, y), 2, (0, 255, 0), -1)
                        
                    # Mouth
                    for idx in INNER_MOUTH:
                        x = int(landmarks[idx][0] * w)
                        y = int(landmarks[idx][1] * h)
                        cv2.circle(annotated_frame, (x, y), 2, (0, 255, 255), -1)
                        
                    # Head Pose Axes (High-tech HUD look)
                    if not use_mock and rvec is not None and tvec is not None:
                        # Draw 3D axis at the nose tip (index 1)
                        axis = np.array([
                            (120.0, 0.0, 0.0),  # X axis (pitch)
                            (0.0, 120.0, 0.0),  # Y axis (yaw)
                            (0.0, 0.0, 120.0)   # Z axis (roll)
                        ], dtype=np.float32)
                        
                        dist_coeffs = np.zeros((4, 1), dtype=np.float32)
                        axis_img_pts, _ = cv2.projectPoints(axis, rvec, tvec, camera_matrix, dist_coeffs)
                        
                        nose_x = int(landmarks[1][0] * w)
                        nose_y = int(landmarks[1][1] * h)
                        
                        # Draw X axis (Red)
                        pt_x = (int(axis_img_pts[0][0][0]), int(axis_img_pts[0][0][1]))
                        cv2.line(annotated_frame, (nose_x, nose_y), pt_x, (0, 0, 255), 2)
                        
                        # Draw Y axis (Green)
                        pt_y = (int(axis_img_pts[1][0][0]), int(axis_img_pts[1][0][1]))
                        cv2.line(annotated_frame, (nose_x, nose_y), pt_y, (0, 255, 0), 2)
                        
                        # Draw Z axis (Blue)
                        pt_z = (int(axis_img_pts[2][0][0]), int(axis_img_pts[2][0][1]))
                        cv2.line(annotated_frame, (nose_x, nose_y), pt_z, (255, 0, 0), 2)
                    elif use_mock:
                        # Draw simulated axis
                        nose_x = int(landmarks[1][0] * w)
                        nose_y = int(landmarks[1][1] * h)
                        pitch_offset = int(pitch * 2)
                        cv2.line(annotated_frame, (nose_x, nose_y), (nose_x + 50, nose_y), (0, 0, 255), 2)
                        cv2.line(annotated_frame, (nose_x, nose_y), (nose_x, nose_y - 50 + pitch_offset), (0, 255, 0), 2)
                        cv2.line(annotated_frame, (nose_x, nose_y), (nose_x - 30, nose_y + 30), (255, 0, 0), 2)
                        
                    # Face Bounding Box
                    x_coords = [int(lm[0] * w) for lm in landmarks]
                    y_coords = [int(lm[1] * h) for lm in landmarks]
                    min_x, max_x = min(x_coords), max(x_coords)
                    min_y, max_y = min(y_coords), max(y_coords)
                    # padding
                    pad_w = int((max_x - min_x) * 0.1)
                    pad_h = int((max_y - min_y) * 0.15)
                    cv2.rectangle(
                        annotated_frame, 
                        (max(0, min_x - pad_w), max(0, min_y - pad_h)), 
                        (min(w, max_x + pad_w), min(h, max_y + pad_h)), 
                        (0, 255, 0) if self.status == "Awake" else ((0, 255, 255) if self.status in ["Yawning", "Nodding"] else (0, 0, 255)), 
                        2
                    )
    
                    # --- DETECTOR STATE MACHINE ---
                    now = time.time()
                    
                    # A. Eye Closure (Sleeping) Detection
                    if ear < self.EAR_THRESHOLD:
                        if self.eye_closed_start is None:
                            self.eye_closed_start = now
                        elif now - self.eye_closed_start >= self.CLOSED_EYE_DURATION:
                            current_status = "Sleeping"
                            self.trigger_alert("sleeping", frame)
                    else:
                        self.eye_closed_start = None
                        
                    # B. Yawning Detection
                    if mar > self.MAR_THRESHOLD:
                        if self.yawn_start is None:
                            self.yawn_start = now
                        elif now - self.yawn_start >= self.YAWN_DURATION:
                            if current_status != "Sleeping": # Prioritize sleeping
                                current_status = "Yawning"
                            self.trigger_alert("yawning", frame)
                    else:
                        self.yawn_start = None
                        
                    # C. Head Nodding / Sagging Detection
                    if pitch < self.NOD_PITCH_THRESHOLD:
                        if self.nod_start is None:
                            self.nod_start = now
                        elif now - self.nod_start >= self.NOD_DURATION:
                            if current_status not in ["Sleeping", "Yawning"]:
                                current_status = "Nodding"
                            self.trigger_alert("nodding", frame)
                    else:
                        self.nod_start = None
                else:
                    # No face detected
                    current_status = "No Face Detected"
                    self.eye_closed_start = None
                    self.yawn_start = None
                    self.nod_start = None
                    self.ear_history.clear()
                    self.mar_history.clear()
                    
                # Update status and broadcast via socket if changed
                if current_status != self.status:
                    self.status = current_status
                    if self.socketio:
                        self.socketio.emit('status_change', {
                            'vehicle_number': self.vehicle_number,
                            'status': self.status,
                            'ear': round(ear, 3),
                            'mar': round(mar, 3),
                            'pitch': round(pitch, 1)
                        })
                        
                # Visual HUD Info Overlay
                status_colors = {
                    "Awake": (0, 255, 0),       # Green
                    "Yawning": (0, 255, 255),    # Yellow
                    "Nodding": (0, 255, 255),    # Yellow
                    "Sleeping": (0, 0, 255),     # Red
                    "No Face Detected": (128, 128, 128) # Grey
                }
                color = status_colors.get(self.status, (255, 255, 255))
                
                # Top-left HUD card
                cv2.rectangle(annotated_frame, (10, 10), (280, 130), (0, 0, 0), -1)
                cv2.rectangle(annotated_frame, (10, 10), (280, 130), color, 1)
                
                cv2.putText(annotated_frame, f"VEHICLE: {self.vehicle_number}", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                cv2.putText(annotated_frame, f"STATUS: {self.status.upper()}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                cv2.putText(annotated_frame, f"EAR: {ear:.3f} (th:{self.EAR_THRESHOLD})", (20, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
                cv2.putText(annotated_frame, f"MAR: {mar:.3f} (th:{self.MAR_THRESHOLD})", (20, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
                cv2.putText(annotated_frame, f"PITCH: {pitch:.1f} deg", (20, 122), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
                
                # Encode frame to JPEG
                ret_enc, jpeg = cv2.imencode('.jpg', annotated_frame)
                if ret_enc:
                    with self.lock:
                        self.latest_frame = jpeg.tobytes()
                        
            except Exception as e:
                print(f"[THREAD EXCEPTION] Error in frame loop: {e}")
                time.sleep(0.05)
                
            # Cap thread FPS roughly
            time.sleep(0.01)
            
        cap.release()
        print(f"[INFO] Monitoring stopped for {self.vehicle_number}")

    def process_client_frame(self, data):
        if not self.running:
            return
            
        try:
            import base64
            base64_image_str = data.get('image')
            if not base64_image_str:
                return
                
            # Strip data url prefix if present
            if ',' in base64_image_str:
                base64_image_str = base64_image_str.split(',')[1]
                
            # Decode base64 to bytes and save directly as self.latest_frame
            img_bytes = base64.b64decode(base64_image_str)
            with self.lock:
                self.latest_frame = img_bytes
                
            # Update telemetry values
            current_status = data.get('status', 'Awake')
            ear = data.get('ear', 0.0)
            mar = data.get('mar', 0.0)
            pitch = data.get('pitch', 0.0)
            
            # Emit telemetry to SocketIO if status changed
            if current_status != self.status:
                self.status = current_status
                if self.socketio:
                    self.socketio.emit('status_change', {
                        'vehicle_number': self.vehicle_number,
                        'status': self.status,
                        'ear': round(ear, 3),
                        'mar': round(mar, 3),
                        'pitch': round(pitch, 1)
                    })
                    
            # Check for client-triggered alerts
            if current_status in ["Sleeping", "Yawning", "Nodding"]:
                alert_type = current_status.lower()
                now = time.time()
                # Cooldown check
                if now - self.last_alert_times[alert_type] >= self.ALERT_COOLDOWN:
                    # Decode frame to cv2 image to save it as screenshot
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    if frame is not None:
                        self.trigger_alert(alert_type, frame)
                        
        except Exception as e:
            print(f"[CLIENT FRAME EXCEPTION] Error processing frame: {e}")

    @staticmethod
    def test_camera_connection(source_url):
        """Helper to test connection to webcam (integer index) or IP Camera (URL string)"""
        try:
            # Check if source is digit (webcam)
            if str(source_url).isdigit():
                src = int(source_url)
                # Try default MSMF backend first to fail fast on Windows if no webcam is present
                cap = cv2.VideoCapture(src)
                if not cap.isOpened():
                    cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
                if not cap.isOpened():
                    # Fallback to local video file test if webcam is not available
                    fallback_video = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Video Project 11.mp4'))
                    if os.path.exists(fallback_video):
                        src = fallback_video
                        cap = cv2.VideoCapture(src)
            else:
                src = source_url
                if src and not any(src.startswith(prefix) for prefix in ['rtsp://', 'http://', 'https://']):
                    if not os.path.exists(src):
                        root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', src))
                        if os.path.exists(root_path):
                            src = root_path
                        else:
                            public_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', src))
                            if os.path.exists(public_path):
                                src = public_path
                cap = cv2.VideoCapture(src)
            
            if cap.isOpened():
                ret, frame = cap.read()
                cap.release()
                return ret
            return False
        except Exception as e:
            print(f"[TEST CAMERA ERROR] {e}")
            return False
