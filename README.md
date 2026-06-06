<<<<<<< HEAD
# Smart Driver Drowsiness Detection System (SDDDS)

SDDDS is an AI-powered driver safety and drowsiness monitoring system designed to detect driver fatigue and distraction in real-time. The system processes camera feeds using computer vision models to calculate Eye Aspect Ratio (EAR), Mouth Aspect Ratio (MAR), and head pitch angles, immediately alerting drivers locally and streaming live video and telemetry to fleet owners via a responsive web dashboard.

---

## 🌟 Key Features

### 1. Driver Portal & AI Safeguard
* **Drowsiness Detection**: Analyzes eye closure duration using 6 facial landmarks per eye. Triggers an alert if eye closure lasts for 1.2+ seconds.
* **Yawn Tracking**: Detects yawning based on inner lip spacing (MAR threshold).
* **Head Nodding Detection**: Employs a 3D Perspective-n-Point (PnP) solver using a generic 3D head model and facial landmark coordinates. Alerts on sagging/nodding pitch angles (< -15°).
* **Local Sound Alert**: Automatically plays the custom alarm sound `fa.mp3` when the driver falls asleep to wake them up.
* **Annotated AI Feed**: Displays visual landmark matrices, bounding boxes (color-coded by severity), and 3D coordinate axes protruding from the nose (representing real-time yaw, pitch, and roll).

### 2. Owner Dashboard
* **Targeted Vehicle Tracking**: Features a glassmorphic `+` button allowing owners to register specific vehicle numbers they want to monitor.
* **Real-Time Video Streaming**: Delivers high-performance MJPEG streams of active driver feeds directly inside the browser.
* **Live Safety Ticker**: Lists instant warnings with capture links showing saved screenshot evidence.
* **Fleet Analytics**: Renders SVG visualizations detailing total alert distributions, top risky drivers, and hourly trends.
* **Offline Grace Layouts**: Displays a clean fallback UI with a `VideoOff` icon for offline tracked vehicles, avoiding continuous failing HTTP stream loads.
* **Custom Alert Audio**: Automatically triggers `fa.mp3` on the owner's dashboard if a tracked driver triggers a sleep alert.

### 3. Hashed SQLite Database Sync
* **Synced Authentication**: Both panels verify login credentials against database queries.
* **Secure Hashes**: User passwords are saved as cryptographic hashes using `pbkdf2:sha256` via `werkzeug.security`.
* **Auditing Logs**: Stores paired camera connections, login histories, and detailed screenshots for historical safety tracking.

---

## 📂 Project Directory Structure

```
smart-driver-drowsiness-detection-system/
├── backend/
│   ├── app.py                  # Flask REST API & WebSockets server
│   ├── database.py             # SQLite schemas, connections, and helpers
│   ├── detector.py             # AI Monitoring thread (MediaPipe & OpenCV)
│   ├── test_backend.py         # Database and auth integration tests
│   ├── requirements.txt        # Python backend package dependencies
│   └── screenshots/            # Directory where alert screenshots are saved
├── frontend/
│   ├── public/
│   │   └── fa.mp3              # Custom warning alarm chime
│   ├── src/
│   │   ├── App.jsx             # Global app router, header, loader overlays
│   │   ├── index.css           # Premium glassmorphic dark-mode CSS rules
│   │   ├── components/
│   │   │   ├── RoleSelection.jsx # Entry page to choose Driver/Owner role
│   │   │   ├── LoginCard.jsx     # Synced Auth and Registration tabs
│   │   │   ├── CameraSetup.jsx   # Webcam vs IP Camera health checks & pairing
│   │   │   ├── DriverActive.jsx  # Active driver HUD, stats tracker, local audio alarm
│   │   │   └── OwnerDashboard.jsx # Dashboard tracking panel, '+' vehicle tracking modal
│   │   └── main.jsx
│   └── package.json
└── fa.mp3                      # Master copy of the alarm chime
```

---

## ⚙️ Prerequisites

Ensure you have the following software installed:
1. **Python** (version 3.9, 3.10, or 3.11 recommended)
2. **Node.js** (version 18+ recommended)
3. **Webcam** or an RTSP IP Camera stream

---

## 🚀 Step-by-Step Run Guide

### Step 1: Set Up & Run Backend

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   * **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * **Windows (CMD)**:
     ```cmd
     .\venv\Scripts\activate.bat
     ```
   * **macOS / Linux**:
     ```bash
     source venv/bin/activate
     ```

4. Install the package dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   *(Note: This installs Flask, Flask-SocketIO, gevent, opencv-python, and mediapipe==0.10.14 which is optimized for Windows).*

5. (Optional) Run the database integration tests:
   ```bash
   python test_backend.py
   ```
   *Verify that all tests (Database initialization, Owner/Driver auth, camera pairing, alert logging) display `[SUCCESS]`.*

6. Start the Flask server:
   ```bash
   python app.py
   ```
   *The server will start running on `http://localhost:5000`.*

---

### Step 2: Set Up & Run Frontend

1. Open a new terminal window and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install the Node packages:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend application will start running on `http://localhost:5173`.*

---

## 🖥️ How to Use and Test

1. **Access the Web Portal**: Open `http://localhost:5173` in your browser.
2. **Select Driver Portal**:
   * Click **Create Account** and register a driver profile with a vehicle number (e.g. `TN07CM2026`) and password.
   * Sign In using the registered vehicle number and password.
   * Select **Local Webcam** (or enter an IP Camera stream link), click **Test Connection** to verify green feed confirmation, and click **Pair & Start Monitoring**.
3. **Select Owner Portal (Test in separate window)**:
   * Click **Create Account** and register an owner profile.
   * Sign In to open the Dashboard.
   * Click the `+` button in the sidebar next to "Active Fleet Drivers", enter the driver's vehicle number (`TN07CM2026`), and click **Add Vehicle**.
   * The vehicle is added as "Active" (Green badge). Click on it to display the live video feed and telematics details.
4. **Simulate Drowsiness Alert**:
   * Face the camera and close your eyes for at least 1.2 seconds.
   * The driver HUD status updates to `Sleeping` (Red badge) and increments the drowsiness event count.
   * The custom `fa.mp3` alarm chime plays locally to alert the driver, and plays on the Owner Dashboard.
   * An evidence screenshot is automatically logged in the owner's safety alerts list with a "View Capture" preview link.
=======
# Smart-Driver-Drowsiness-Detection-System
Smart Driver Drowsiness Detection System (SDDDS) is an AI-powered driver safety and drowsiness monitoring platform. It detects driver fatigue, yawning, and head nodding in real-time using MediaPipe Face Mesh and OpenCV,

Step-by-Step Run Guide Summary
Step 1: Set Up & Run Backend
bash
cd backend
python -m venv venv
# Activate Virtual Environment:
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate
# Install requirements & start server:
pip install -r requirements.txt
python app.py
Backend runs on http://localhost:5000.

Step 2: Set Up & Run Frontend
bash
cd frontend
npm install
npm run dev
Frontend runs on http://localhost:5173.

The README also includes detailed descriptions of:

The directory structure of the project.
Features of the driver safeguard and owner tracking panel.
Steps to simulate alerts (eye-closure tests) and check evidence screenshots.
>>>>>>> 7b4bbe488fe02f51e2f720a39503c527c3bfef8f
