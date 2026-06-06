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
                self.thread = threading.Thread(target=self._run_monitoring, daemon=True)
                self.thread.start()
                
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
        # Choose camera source
        if self.camera_type == 'webcam':
            source = 0
            # Use DirectShow backend on Windows for quick and reliable camera boot
            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        else:
            source = self.camera_url
            cap = cv2.VideoCapture(source)
            
        if not cap.isOpened():
            print(f"[ERROR] Failed to open camera for {self.vehicle_number}")
            self.status = "Error"
            if self.socketio:
                self.socketio.emit('status_change', {
                    'vehicle_number': self.vehicle_number,
                    'status': 'Camera Error'
                })
            self.running = False
            return
            
        # Initialize MediaPipe
        mp_face_mesh = mp.solutions.face_mesh
        face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        print(f"[INFO] Monitoring started for {self.vehicle_number} using {self.camera_type}")
        
        while self.running:
            try:
                ret, frame = cap.read()
                if not ret:
                    print(f"[WARN] Failed to grab frame for {self.vehicle_number}")
                    time.sleep(0.03)
                    continue
                    
                h, w, c = frame.shape
                
                # Flip frame horizontally for natural mirror view
                frame = cv2.flip(frame, 1)
                
                # Convert color space for MediaPipe
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_mesh.process(rgb_frame)
                
                current_status = "Awake"
                ear = 0.0
                mar = 0.0
                pitch = 0.0
                yaw = 0.0
                roll = 0.0
                
                annotated_frame = frame.copy()
                
                if results.multi_face_landmarks:
                    for face_landmarks in results.multi_face_landmarks:
                        # Extract 2D landmarks (x, y mapped to 0-1)
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
                        if rvec is not None and tvec is not None:
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
                        # If pitch goes below the threshold (nodding forward)
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
        face_mesh.close()
        print(f"[INFO] Monitoring stopped for {self.vehicle_number}")

    @staticmethod
    def test_camera_connection(source_url):
        """Helper to test connection to webcam (integer index) or IP Camera (URL string)"""
        try:
            # Check if source is digit (webcam)
            if str(source_url).isdigit():
                src = int(source_url)
                # DirectShow backend on Windows is more responsive and prevents locks
                cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
            else:
                src = source_url
                cap = cv2.VideoCapture(src)
            
            if cap.isOpened():
                ret, frame = cap.read()
                cap.release()
                return ret
            return False
        except Exception as e:
            print(f"[TEST CAMERA ERROR] {e}")
            return False
