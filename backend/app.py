import time
from datetime import datetime
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
import os

import database as db
from detector import DrowsinessDetector

app = Flask(__name__)
app.config['SECRET_KEY'] = 'drowsiness_monitoring_secret_key'
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent' if os.environ.get('USE_GEVENT') else 'threading')

# Store running detector instances by vehicle number
# active_monitors = { 'VEHICLE_NUM': DrowsinessDetectorInstance }
active_monitors = {}

# Initialize DB
db.init_db()

@app.route('/')
def index():
    return jsonify({
        'status': 'healthy',
        'service': 'Smart Driver Drowsiness Detection System Backend'
    })

@app.route('/api/diagnostics', methods=['GET'])
def run_diagnostics():
    import traceback
    import cv2
    results = {}
    
    # 1. System checks
    results['working_dir'] = os.getcwd()
    results['dir_contents'] = os.listdir(os.getcwd())
    if os.path.exists('../'):
        results['parent_dir_contents'] = os.listdir('../')
    
    # 2. Check video file path and existence
    try:
        video_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Video Project 11.mp4'))
        results['video_file'] = {
            'path': video_path,
            'exists': os.path.exists(video_path)
        }
        if os.path.exists(video_path):
            results['video_file']['size_bytes'] = os.path.getsize(video_path)
    except Exception as e:
        results['video_file'] = {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        
    # 3. Test OpenCV VideoCapture opening video
    try:
        if results.get('video_file', {}).get('exists'):
            cap = cv2.VideoCapture(video_path)
            opened = cap.isOpened()
            results['opencv_capture'] = {
                'opened': opened
            }
            if opened:
                ret, frame = cap.read()
                results['opencv_capture']['frame_read_success'] = ret
                if ret:
                    results['opencv_capture']['frame_shape'] = list(frame.shape)
                cap.release()
            else:
                results['opencv_capture']['error'] = 'VideoCapture.isOpened() returned False'
        else:
            results['opencv_capture'] = {
                'skipped': 'Video file does not exist'
            }
    except Exception as e:
        results['opencv_capture'] = {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        
    # 4. Test MediaPipe FaceMesh Initialization
    try:
        import mediapipe as mp
        results['mediapipe_import'] = {
            'success': True,
            'version': mp.__version__
        }
        
        mp_face_mesh = mp.solutions.face_mesh
        face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        results['mediapipe_facemesh'] = {
            'success': True
        }
        face_mesh.close()
    except Exception as e:
        results['mediapipe_facemesh'] = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        
    # 5. Test SQLite database connection and operations
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        val = cursor.fetchone()[0]
        results['database'] = {
            'success': True,
            'test_query_val': val
        }
        conn.close()
    except Exception as e:
        results['database'] = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        
    return jsonify(results)

@app.route('/backend/screenshots/<path:filename>')
def serve_screenshot(filename):
    return send_from_directory(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'), filename)

# Auth Endpoints
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    role = data.get('role') # 'driver' or 'owner'
    
    if not role or role not in ['driver', 'owner']:
        return jsonify({'success': False, 'message': 'Invalid role specified.'}), 400
        
    password = data.get('password')
    if not password or len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters.'}), 400
        
    password_hash = generate_password_hash(password)
    
    if role == 'driver':
        vehicle_number = data.get('vehicle_number')
        name = data.get('name')
        if not vehicle_number or not name:
            return jsonify({'success': False, 'message': 'Vehicle number and name are required.'}), 400
            
        success = db.create_driver(vehicle_number, name, password_hash)
        if success:
            return jsonify({'success': True, 'message': 'Driver registered successfully.'})
        else:
            return jsonify({'success': False, 'message': 'Vehicle number already registered.'}), 400
            
    else: # owner
        owner_id = data.get('owner_id')
        if not owner_id:
            return jsonify({'success': False, 'message': 'Owner ID is required.'}), 400
            
        success = db.create_owner(owner_id, password_hash)
        if success:
            return jsonify({'success': True, 'message': 'Owner registered successfully.'})
        else:
            return jsonify({'success': False, 'message': 'Owner ID already registered.'}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    role = data.get('role')
    
    if not role or role not in ['driver', 'owner']:
        return jsonify({'success': False, 'message': 'Invalid role.'}), 400
        
    password = data.get('password')
    if not password:
        return jsonify({'success': False, 'message': 'Password is required.'}), 400
        
    if role == 'driver':
        vehicle_number = data.get('vehicle_number')
        if not vehicle_number:
            return jsonify({'success': False, 'message': 'Vehicle number is required.'}), 400
            
        driver = db.get_driver(vehicle_number)
        if driver and check_password_hash(driver['password_hash'], password):
            db.log_login(vehicle_number, 'driver')
            login_history = db.get_login_history(vehicle_number, 'driver')
            return jsonify({
                'success': True,
                'message': 'Driver logged in successfully.',
                'user': {
                    'vehicle_number': driver['vehicle_number'],
                    'name': driver['name'],
                    'role': 'driver'
                },
                'login_history': login_history
            })
        return jsonify({'success': False, 'message': 'Invalid vehicle number or password.'}), 401
        
    else: # owner
        owner_id = data.get('owner_id')
        if not owner_id:
            return jsonify({'success': False, 'message': 'Owner ID is required.'}), 400
            
        owner = db.get_owner(owner_id)
        if owner and check_password_hash(owner['password_hash'], password):
            db.log_login(owner_id, 'owner')
            login_history = db.get_login_history(owner_id, 'owner')
            return jsonify({
                'success': True,
                'message': 'Owner logged in successfully.',
                'user': {
                    'owner_id': owner['owner_id'],
                    'role': 'owner'
                },
                'login_history': login_history
            })
        return jsonify({'success': False, 'message': 'Invalid Owner ID or password.'}), 401

# Camera Endpoints
@app.route('/api/camera/test', methods=['POST'])
def test_camera():
    data = request.get_json()
    camera_type = data.get('camera_type') # 'webcam' or 'ip_camera'
    camera_url = data.get('camera_url')
    
    source = 0 if camera_type == 'webcam' else camera_url
    if not source and camera_type == 'ip_camera':
        return jsonify({'success': False, 'message': 'Camera URL required for IP Camera.'}), 400
        
    is_connected = DrowsinessDetector.test_camera_connection(source)
    if is_connected:
        return jsonify({'success': True, 'message': 'Camera connection successful.'})
    else:
        return jsonify({'success': False, 'message': 'Could not connect to camera.'})

@app.route('/api/camera/pair', methods=['POST'])
def pair_camera():
    data = request.get_json()
    vehicle_number = data.get('vehicle_number')
    camera_type = data.get('camera_type')
    camera_url = data.get('camera_url')
    
    if not vehicle_number or not camera_type:
        return jsonify({'success': False, 'message': 'Vehicle number and camera type are required.'}), 400
        
    db.pair_camera(vehicle_number, camera_type, camera_url)
    return jsonify({'success': True, 'message': 'Camera paired with vehicle successfully.'})

# Monitoring Endpoints
@app.route('/api/monitoring/start', methods=['POST'])
def start_monitoring():
    data = request.get_json()
    vehicle_number = data.get('vehicle_number')
    
    if not vehicle_number:
        return jsonify({'success': False, 'message': 'Vehicle number is required.'}), 400
        
    vehicle_number = vehicle_number.upper()
    
    # Check if already running
    if vehicle_number in active_monitors:
        return jsonify({'success': True, 'message': 'Monitoring is already active.'})
        
    # Get camera pairing details
    camera = db.get_camera(vehicle_number)
    if not camera:
        return jsonify({'success': False, 'message': 'No camera paired for this vehicle. Please pair camera first.'}), 400
        
    # Start detector
    try:
        detector = DrowsinessDetector(
            vehicle_number=vehicle_number,
            camera_type=camera['camera_type'],
            camera_url=camera['camera_url'],
            socketio=socketio,
            db_helper=db
        )
        detector.start()
        active_monitors[vehicle_number] = detector
        
        # Broadcast active state
        socketio.emit('vehicle_status_list', get_active_vehicles())
        
        return jsonify({'success': True, 'message': 'Monitoring started successfully.'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to start monitoring: {str(e)}'}), 500

@app.route('/api/monitoring/stop', methods=['POST'])
def stop_monitoring():
    data = request.get_json()
    vehicle_number = data.get('vehicle_number')
    
    if not vehicle_number:
        return jsonify({'success': False, 'message': 'Vehicle number is required.'}), 400
        
    vehicle_number = vehicle_number.upper()
    
    if vehicle_number in active_monitors:
        detector = active_monitors.pop(vehicle_number)
        detector.stop()
        
        # Broadcast updated list
        socketio.emit('vehicle_status_list', get_active_vehicles())
        
        return jsonify({'success': True, 'message': 'Monitoring stopped successfully.'})
    else:
        return jsonify({'success': False, 'message': 'Monitoring was not running for this vehicle.'}), 400

@app.route('/api/monitoring/status/<vehicle_number>', methods=['GET'])
def get_monitoring_status(vehicle_number):
    vehicle_number = vehicle_number.upper()
    is_active = vehicle_number in active_monitors
    status = active_monitors[vehicle_number].status if is_active else 'Offline'
    
    camera = db.get_camera(vehicle_number)
    
    return jsonify({
        'vehicle_number': vehicle_number,
        'active': is_active,
        'status': status,
        'camera': camera
    })

# Video Stream Endpoint
@app.route('/api/stream/<vehicle_number>')
def stream_video(vehicle_number):
    import urllib.parse
    vehicle_number = urllib.parse.unquote(vehicle_number).upper()
    detector = active_monitors.get(vehicle_number)
    
    if not detector:
        # Return fallback placeholder frame if not running
        return "Stream not active", 404
        
    def generate():
        import cv2
        import numpy as np
        
        # Check if we already have a frame ready from detector
        frame = detector.get_latest_frame()
        if frame:
            # If a frame is already available, yield it immediately
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            placeholder_bytes = None
        else:
            # Generate a connecting placeholder frame only if not ready
            placeholder_img = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder_img, "Connecting to stream...", (120, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
            _, jpeg_enc = cv2.imencode('.jpg', placeholder_img)
            placeholder_bytes = jpeg_enc.tobytes()
            
            # Immediately establish the connection by yielding the placeholder
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')
               
        while vehicle_number in active_monitors and detector.running:
            frame = detector.get_latest_frame()
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            else:
                # If frame is not ready yet, keep yielding the placeholder to prevent timeout
                if placeholder_bytes is None:
                    placeholder_img = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(placeholder_img, "Connecting to stream...", (120, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
                    _, jpeg_enc = cv2.imencode('.jpg', placeholder_img)
                    placeholder_bytes = jpeg_enc.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')
            time.sleep(0.04) # ~25 FPS
            
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

# Dashboard & Stats Endpoints
@app.route('/api/dashboard/stats', methods=['GET'])
def get_stats():
    stats = db.get_dashboard_stats()
    stats['active_vehicles'] = get_active_vehicles()
    return jsonify(stats)

@app.route('/api/dashboard/alerts', methods=['GET'])
def get_recent_alerts():
    vehicle_number = request.args.get('vehicle_number')
    limit = request.args.get('limit', default=50, type=int)
    alerts = db.get_alerts(vehicle_number, limit)
    return jsonify(alerts)

# SocketIO Event Handlers
@socketio.on('connect')
def handle_connect():
    print(f"[SOCKET] Client connected: {request.sid}")
    # Send list of active vehicles upon connection
    emit('vehicle_status_list', get_active_vehicles())

@socketio.on('disconnect')
def handle_disconnect():
    print(f"[SOCKET] Client disconnected: {request.sid}")

@socketio.on('driver_frame')
def handle_driver_frame(data):
    vehicle_number = data.get('vehicle_number', '').upper()
    image_data = data.get('image')
    detector = active_monitors.get(vehicle_number)
    if detector and image_data:
        detector.process_client_frame(data)

@socketio.on('join_dashboard')
def handle_join_dashboard(data):
    join_room('owners_room')
    print(f"[SOCKET] Client joined owners dashboard room")
    # Emit initial stats
    emit('vehicle_status_list', get_active_vehicles())

@socketio.on('leave_dashboard')
def handle_leave_dashboard(data):
    leave_room('owners_room')
    print(f"[SOCKET] Client left owners dashboard room")

def get_active_vehicles():
    vehicles = []
    for vehicle_num, detector in active_monitors.items():
        camera = db.get_camera(vehicle_num)
        vehicles.append({
            'vehicle_number': vehicle_num,
            'status': detector.status,
            'camera_type': camera['camera_type'] if camera else 'webcam',
            'last_active': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
    return vehicles

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Disable debug mode in production to prevent duplicate process spawning
    debug_mode = os.environ.get('RENDER') is None
    socketio.run(app, host='0.0.0.0', port=port, debug=debug_mode, allow_unsafe_werkzeug=True)
