import React, { useState, useEffect, useRef } from 'react';
import { Shield, ShieldAlert, AlertTriangle, Eye, VideoOff, Timer, LogOut } from 'lucide-react';
import io from 'socket.io-client';
import { API_BASE } from '../utils/api';

// MediaPipe Face Mesh indices
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 386, 263, 373, 374];
const INNER_MOUTH = [78, 13, 308, 14];

export default function DriverActive({ vehicleNumber, onStop }) {
  const [status, setStatus] = useState('Awake');
  const [duration, setDuration] = useState(0);
  const [yawnCount, setYawnCount] = useState(0);
  const [nodCount, setNodCount] = useState(0);
  const [sleepCount, setSleepCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [cameraType, setCameraType] = useState(null); // 'webcam', 'ip_camera', or null

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraInstanceRef = useRef(null);

  const eyeClosedStartRef = useRef(null);
  const yawnStartRef = useRef(null);
  const nodStartRef = useRef(null);
  const earHistoryRef = useRef([]);
  const marHistoryRef = useRef([]);
  
  const statusRef = useRef('Awake');
  const cameraTypeRef = useRef(null);
  const baselineRef = useRef(0.3); // ratio baseline

  const lastAlertTimesRef = useRef({
    sleeping: 0,
    yawning: 0,
    nodding: 0
  });
  const lastEmitRef = useRef(0);

  // Keep cameraTypeRef in sync
  useEffect(() => {
    cameraTypeRef.current = cameraType;
  }, [cameraType]);

  const handleImageError = () => {
    setStreamError(true);
    setTimeout(() => {
      setStreamError(false);
      setRetryKey(prev => prev + 1);
    }, 2000);
  };

  // 1. Duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch camera details to determine type
  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/monitoring/status/${vehicleNumber}`);
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setCameraType(data.camera?.camera_type || 'webcam');
          }
        }
      } catch (err) {
        console.error("Error fetching monitoring status:", err);
        if (active) {
          setCameraType('webcam'); // fallback to local webcam
        }
      }
    };
    fetchStatus();
    return () => { active = false; };
  }, [vehicleNumber]);

  // 2. Socket.IO connection for real-time telemetry updates
  useEffect(() => {
    const socket = io(API_BASE);
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Driver Socket Connected');
    });

    // Listen to status updates from backend
    socket.on('status_change', (data) => {
      if (data.vehicle_number === vehicleNumber.toUpperCase()) {
        if (cameraTypeRef.current !== 'webcam') {
          setStatus(data.status);
        }
      }
    });

    // Listen to new alerts triggered to increment counts locally
    socket.on('new_alert', (data) => {
      if (data.vehicle_number === vehicleNumber.toUpperCase()) {
        if (cameraTypeRef.current !== 'webcam') {
          if (data.alert_type === 'sleeping') {
            setSleepCount(c => c + 1);
            const audio = new Audio('/fa.mp3');
            audio.play().catch(e => console.warn("Audio play blocked by browser:", e));
          } else if (data.alert_type === 'yawning') {
            setYawnCount(c => {
              const nextCount = c + 1;
              if (nextCount >= 1) {
                const audio = new Audio('/y.mp3');
                audio.play().catch(e => console.warn("Audio play blocked by browser:", e));
              }
              return nextCount;
            });
          } else if (data.alert_type === 'nodding') {
            setNodCount(c => c + 1);
          }
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [vehicleNumber]);

  // 3. Local Camera and MediaPipe FaceMesh processing (Only if cameraType === 'webcam')
  useEffect(() => {
    if (cameraType !== 'webcam') return;

    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!videoElement || !canvasElement) return;

    console.log("Initializing local MediaPipe FaceMesh & Camera...");

    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      const canvasCtx = canvasElement.getContext('2d');
      if (!canvasCtx) return;

      const canvasWidth = canvasElement.width;
      const canvasHeight = canvasElement.height;

      // Draw the video frame mirrored
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      canvasCtx.translate(canvasWidth, 0);
      canvasCtx.scale(-1, 1);
      
      // If we have a valid image from MediaPipe, draw it
      if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, canvasWidth, canvasHeight);
      }
      canvasCtx.restore();

      let computedStatus = 'Awake';
      let ear = 0.0;
      let mar = 0.0;
      let pitch = 0.0;

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // 1. Calculate EAR
        const distance3D = (p1, p2) => {
          return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) +
            Math.pow(p1.y - p2.y, 2) +
            Math.pow(p1.z - p2.z, 2)
          );
        };

        const calculateEAR = (indices) => {
          const pts = indices.map(idx => landmarks[idx]);
          const A = distance3D(pts[1], pts[5]);
          const B = distance3D(pts[2], pts[4]);
          const C = distance3D(pts[0], pts[3]);
          return (A + B) / (2.0 * C);
        };

        const earLeft = calculateEAR([33, 160, 158, 133, 153, 144]);
        const earRight = calculateEAR([362, 385, 386, 263, 373, 374]);
        const rawEar = (earLeft + earRight) / 2.0;

        // 2. Calculate MAR
        const calculateMAR = (indices) => {
          const pts = indices.map(idx => landmarks[idx]);
          const vertical = distance3D(pts[1], pts[3]);
          const horizontal = distance3D(pts[0], pts[2]);
          return vertical / horizontal;
        };
        const rawMar = calculateMAR([78, 13, 308, 14]);

        // Smooth metrics
        earHistoryRef.current.push(rawEar);
        marHistoryRef.current.push(rawMar);
        if (earHistoryRef.current.length > 5) earHistoryRef.current.shift();
        if (marHistoryRef.current.length > 5) marHistoryRef.current.shift();
        ear = earHistoryRef.current.reduce((a, b) => a + b, 0) / earHistoryRef.current.length;
        mar = marHistoryRef.current.reduce((a, b) => a + b, 0) / marHistoryRef.current.length;

        // 3. Pitch (Nodding) ratio-based calculation
        const yEyes = (landmarks[33].y + landmarks[263].y) / 2;
        const dNose = landmarks[1].y - yEyes;
        const dChin = landmarks[152].y - yEyes;
        const ratio = dChin !== 0 ? dNose / dChin : 0.3;

        // Calibrate baseline when user status is Awake
        if (statusRef.current === 'Awake') {
          baselineRef.current = baselineRef.current * 0.99 + ratio * 0.01;
        }
        pitch = - (ratio - baselineRef.current) * 120.0;

        // --- DETECTOR STATE MACHINE ---
        const now = Date.now();
        
        // A. Sleeping Detection (EAR threshold = 0.23, duration = 1200ms)
        if (ear < 0.23) {
          if (eyeClosedStartRef.current === null) {
            eyeClosedStartRef.current = now;
          } else if (now - eyeClosedStartRef.current >= 1200) {
            computedStatus = 'Sleeping';
          }
        } else {
          eyeClosedStartRef.current = null;
        }

        // B. Yawning Detection (MAR threshold = 0.50, duration = 1500ms)
        if (mar > 0.50) {
          if (yawnStartRef.current === null) {
            yawnStartRef.current = now;
          } else if (now - yawnStartRef.current >= 1500) {
            if (computedStatus !== 'Sleeping') {
              computedStatus = 'Yawning';
            }
          }
        } else {
          yawnStartRef.current = null;
        }

        // C. Head Nodding Detection (Pitch threshold = -15.0, duration = 1200ms)
        if (pitch < -15.0) {
          if (nodStartRef.current === null) {
            nodStartRef.current = now;
          } else if (now - nodStartRef.current >= 1200) {
            if (computedStatus !== 'Sleeping' && computedStatus !== 'Yawning') {
              computedStatus = 'Nodding';
            }
          }
        } else {
          nodStartRef.current = null;
        }

        // --- DRAW OVERLAYS ---
        // 1. Draw Bounding Box
        const drawXCoords = landmarks.map(lm => (1 - lm.x) * canvasWidth);
        const drawYCoords = landmarks.map(lm => lm.y * canvasHeight);
        const minX = Math.min(...drawXCoords);
        const maxX = Math.max(...drawXCoords);
        const minY = Math.min(...drawYCoords);
        const maxY = Math.max(...drawYCoords);
        const padW = (maxX - minX) * 0.1;
        const padH = (maxY - minY) * 0.15;

        const statusColor = computedStatus === 'Sleeping' ? '#ef4444' : 
                            (computedStatus === 'Yawning' || computedStatus === 'Nodding' ? '#f59e0b' : '#10b981');

        canvasCtx.strokeStyle = statusColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(
          Math.max(0, minX - padW),
          Math.max(0, minY - padH),
          Math.min(canvasWidth, maxX + padW) - Math.max(0, minX - padW),
          Math.min(canvasHeight, maxY + padH) - Math.max(0, minY - padH)
        );

        // 2. Draw Eye Landmarks (Green)
        canvasCtx.fillStyle = '#10b981';
        [33, 160, 158, 133, 153, 144, 362, 385, 386, 263, 373, 374].forEach(idx => {
          const lm = landmarks[idx];
          const cx = (1 - lm.x) * canvasWidth;
          const cy = lm.y * canvasHeight;
          canvasCtx.beginPath();
          canvasCtx.arc(cx, cy, 2, 0, 2 * Math.PI);
          canvasCtx.fill();
        });

        // 3. Draw Mouth Landmarks (Yellow)
        canvasCtx.fillStyle = '#f59e0b';
        [78, 13, 308, 14].forEach(idx => {
          const lm = landmarks[idx];
          const cx = (1 - lm.x) * canvasWidth;
          const cy = lm.y * canvasHeight;
          canvasCtx.beginPath();
          canvasCtx.arc(cx, cy, 2, 0, 2 * Math.PI);
          canvasCtx.fill();
        });

        // 4. Draw Simulated Pose Axis at Nose
        const noseX = (1 - landmarks[1].x) * canvasWidth;
        const noseY = landmarks[1].y * canvasHeight;
        
        canvasCtx.lineWidth = 2;
        // X axis (Red)
        canvasCtx.strokeStyle = '#ef4444';
        canvasCtx.beginPath();
        canvasCtx.moveTo(noseX, noseY);
        canvasCtx.lineTo(noseX + 50, noseY);
        canvasCtx.stroke();

        // Y axis (Green)
        canvasCtx.strokeStyle = '#10b981';
        canvasCtx.beginPath();
        canvasCtx.moveTo(noseX, noseY);
        canvasCtx.lineTo(noseX, noseY - 50 + pitch * 2);
        canvasCtx.stroke();

        // Z axis (Blue)
        canvasCtx.strokeStyle = '#3b82f6';
        canvasCtx.beginPath();
        canvasCtx.moveTo(noseX, noseY);
        canvasCtx.lineTo(noseX - 30, noseY + 30);
        canvasCtx.stroke();

      } else {
        computedStatus = 'No Face Detected';
        eyeClosedStartRef.current = null;
        yawnStartRef.current = null;
        nodStartRef.current = null;
        earHistoryRef.current = [];
        marHistoryRef.current = [];
      }

      // Update state and refs
      if (computedStatus !== statusRef.current) {
        statusRef.current = computedStatus;
        setStatus(computedStatus);
      }

      // Local Alarms and Counts with Cooldown
      if (['Sleeping', 'Yawning', 'Nodding'].includes(computedStatus)) {
        const alertType = computedStatus.toLowerCase();
        const nowAlert = Date.now();
        const COOLDOWN = 6000;
        if (nowAlert - lastAlertTimesRef.current[alertType] >= COOLDOWN) {
          lastAlertTimesRef.current[alertType] = nowAlert;
          
          if (computedStatus === 'Sleeping') {
            setSleepCount(c => c + 1);
            const audio = new Audio('/fa.mp3');
            audio.play().catch(e => console.warn("Audio play blocked:", e));
          } else if (computedStatus === 'Yawning') {
            setYawnCount(c => {
              const audio = new Audio('/y.mp3');
              audio.play().catch(e => console.warn("Audio play blocked:", e));
              return c + 1;
            });
          } else if (computedStatus === 'Nodding') {
            setNodCount(c => c + 1);
          }
        }
      }

      // Draw HUD overlay
      const hudColor = computedStatus === 'Sleeping' ? '#ef4444' : 
                       (computedStatus === 'Yawning' || computedStatus === 'Nodding' ? '#f59e0b' : 
                        (computedStatus === 'No Face Detected' ? '#9ca3af' : '#10b981'));

      canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      canvasCtx.fillRect(10, 10, 270, 120);
      canvasCtx.strokeStyle = hudColor;
      canvasCtx.lineWidth = 1;
      canvasCtx.strokeRect(10, 10, 270, 120);
      
      canvasCtx.fillStyle = '#ffffff';
      canvasCtx.font = '12px monospace';
      canvasCtx.fillText(`VEHICLE: ${vehicleNumber.toUpperCase()}`, 20, 32);
      
      canvasCtx.fillStyle = hudColor;
      canvasCtx.font = 'bold 15px monospace';
      canvasCtx.fillText(`STATUS: ${computedStatus.toUpperCase()}`, 20, 55);
      
      canvasCtx.fillStyle = '#ffffff';
      canvasCtx.font = '12px monospace';
      canvasCtx.fillText(`EAR: ${ear.toFixed(3)} (th:0.230)`, 20, 80);
      canvasCtx.fillText(`MAR: ${mar.toFixed(3)} (th:0.500)`, 20, 98);
      canvasCtx.fillText(`PITCH: ${pitch.toFixed(1)} deg`, 20, 116);

      // Emit base64 frame & telemetry to SocketIO at ~10 FPS (100ms)
      const nowEmit = Date.now();
      if (nowEmit - lastEmitRef.current >= 100) {
        lastEmitRef.current = nowEmit;
        try {
          const base64Frame = canvasElement.toDataURL('image/jpeg', 0.5);
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('driver_frame', {
              vehicle_number: vehicleNumber,
              image: base64Frame,
              status: computedStatus,
              ear: ear,
              mar: mar,
              pitch: pitch
            });
          }
        } catch (err) {
          console.error("Error emitting frame:", err);
        }
      }
    });

    faceMeshRef.current = faceMesh;

    // Start Camera
    const camera = new window.Camera(videoElement, {
      onFrame: async () => {
        try {
          await faceMesh.send({ image: videoElement });
        } catch (err) {
          console.error("FaceMesh send error:", err);
        }
      },
      width: 640,
      height: 480
    });

    cameraInstanceRef.current = camera;
    camera.start().catch((err) => {
      console.error("Camera start error:", err);
      setStreamError(true);
    });

    return () => {
      console.log("Cleaning up local Camera & FaceMesh...");
      if (cameraInstanceRef.current) {
        try {
          cameraInstanceRef.current.stop();
        } catch (e) {}
      }
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (e) {}
      }
      if (videoElement && videoElement.srcObject) {
        try {
          const stream = videoElement.srcObject;
          stream.getTracks().forEach(track => track.stop());
        } catch (e) {}
      }
    };
  }, [cameraType, vehicleNumber]);

  const formatDuration = (sec) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleStopMonitoring = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/monitoring/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vehicle_number: vehicleNumber
        })
      });

      if (response.ok) {
        onStop();
      } else {
        console.error('Failed to stop monitoring.');
      }
    } catch (err) {
      console.error('Network error stopping monitoring:', err);
    } finally {
      setLoading(false);
    }
  };

  // Status mapping to color/glow classes
  const getStatusStyle = (s) => {
    switch (s) {
      case 'Awake':
        return { badge: 'status-badge-awake', border: 'rgba(16, 185, 129, 0.3)' };
      case 'Sleeping':
        return { badge: 'status-badge-sleeping', border: 'rgba(239, 68, 68, 0.5)' };
      case 'Yawning':
      case 'Nodding':
        return { badge: 'status-badge-drowsy', border: 'rgba(245, 158, 11, 0.5)' };
      default:
        return { badge: 'status-badge-offline', border: 'var(--glass-border)' };
    }
  };

  const currentStyle = getStatusStyle(status);

  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {/* Stream Panel */}
        <div className="glass-card" style={{ ...styles.streamCard, borderColor: currentStyle.border }}>
          <div style={styles.streamHeader}>
            <div style={styles.statusLabelContainer}>
              <div className="animate-pulse-green" style={{
                ...styles.activeIndicator,
                background: status === 'Sleeping' ? 'var(--status-red)' : 
                            status === 'Awake' ? 'var(--status-green)' : 'var(--status-yellow)'
              }} />
              <span style={styles.streamTitle}>AI Active Stream</span>
            </div>
            <span className={`status-badge ${currentStyle.badge}`}>
              {status}
            </span>
          </div>

          <div style={styles.videoContainer}>
            {cameraType === null ? (
              <div style={{ ...styles.fallbackContainer, display: 'flex' }}>
                <div className="animate-pulse-green" style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)' }} />
                <p>Initializing Camera Service...</p>
              </div>
            ) : cameraType === 'webcam' ? (
              <>
                <video 
                  ref={videoRef} 
                  style={{ display: 'none' }} 
                  playsInline 
                  muted 
                />
                <canvas 
                  ref={canvasRef} 
                  width={640} 
                  height={480} 
                  style={styles.streamVideo} 
                />
              </>
            ) : !streamError ? (
              <img 
                src={`${API_BASE}/api/stream/${vehicleNumber}?t=${Date.now()}&retry=${retryKey}`} 
                alt="Live Face Feed with AI Meshes"
                style={styles.streamVideo}
                onError={handleImageError}
              />
            ) : (
              <div style={{ ...styles.fallbackContainer, display: 'flex' }}>
                <VideoOff size={48} color="var(--text-dim)" />
                <p>Camera Stream Disconnected (Retrying...)</p>
                <span>Verify that camera is not blocked or selected as incorrect device.</span>
              </div>
            )}
          </div>

          <div style={styles.streamFooter}>
            <p>Vehicle: <strong>{vehicleNumber.toUpperCase()}</strong></p>
            <p style={{ color: 'var(--text-muted)' }}>Backend stream: HTTP MJPEG</p>
          </div>
        </div>

        {/* Telemetry and Controls */}
        <div style={styles.controlPanel}>
          {/* Timer Card */}
          <div className="glass-card" style={styles.timerCard}>
            <div style={styles.panelHeader}>
              <Timer size={22} color="var(--primary-hover)" />
              <h3>Session Duration</h3>
            </div>
            <div style={styles.timerVal}>{formatDuration(duration)}</div>
            <p style={styles.timerDesc}>Continuous driving security active.</p>
          </div>

          {/* Incident Telemetry */}
          <div className="glass-card" style={styles.telemetryCard}>
            <h3>Session Incidents</h3>
            
            <div style={styles.incidentRow}>
              <span>Yawn Warnings:</span>
              <span style={{ 
                ...styles.countBadge, 
                color: yawnCount > 0 ? 'var(--status-yellow)' : 'var(--text-muted)'
              }}>{yawnCount}</span>
            </div>
            <div style={styles.incidentRow}>
              <span>Head Nod Alerts:</span>
              <span style={{ 
                ...styles.countBadge, 
                color: nodCount > 0 ? 'var(--status-yellow)' : 'var(--text-muted)'
              }}>{nodCount}</span>
            </div>
            <div style={styles.incidentRow}>
              <span>Drowsiness Events:</span>
              <span style={{ 
                ...styles.countBadge, 
                color: sleepCount > 0 ? 'var(--status-red)' : 'var(--text-muted)'
              }}>{sleepCount}</span>
            </div>
          </div>

          {/* Action Box */}
          <div className="glass-card flex-center" style={styles.actionCard}>
            {status === 'Sleeping' ? (
              <div style={styles.alertNotice}>
                <ShieldAlert size={36} color="var(--status-red)" />
                <h4>Drowsiness Alert!</h4>
                <p>Pull over safely and rest.</p>
              </div>
            ) : (
              <div style={styles.safeNotice}>
                <Shield size={36} color="var(--status-green)" />
                <h4>Active Safeguard</h4>
                <p>Telemetry reporting status directly to owner.</p>
              </div>
            )}

            <button 
              onClick={handleStopMonitoring} 
              disabled={loading}
              className="glass-btn glass-btn-danger"
              style={styles.stopBtn}
            >
              <LogOut size={16} />
              <span>{loading ? 'Stopping Monitor...' : 'Stop Monitoring'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: '2.5rem',
  },
  streamCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: '16px',
    borderWidth: '1px',
    borderStyle: 'solid',
    transition: 'border-color 0.5s ease',
  },
  streamHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabelContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  activeIndicator: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  streamTitle: {
    fontWeight: '600',
    fontSize: '1.1rem',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: '4/3',
    background: '#040710',
    borderRadius: '12px',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.03)',
  },
  streamVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  fallbackContainer: {
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--text-muted)',
    '& p': {
      fontWeight: '600',
      color: 'var(--text-main)',
    },
    '& span': {
      fontSize: '0.8rem',
      color: 'var(--text-dim)',
      maxWidth: '280px',
    }
  },
  streamFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  controlPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  timerCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--text-muted)',
    '& h3': {
      fontSize: '0.9rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }
  },
  timerVal: {
    fontSize: '2.5rem',
    fontWeight: '700',
    fontFamily: 'monospace',
    background: 'linear-gradient(90deg, #ffffff, var(--primary-hover))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginTop: '0.25rem',
  },
  timerDesc: {
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
  },
  telemetryCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    '& h3': {
      fontSize: '1rem',
      borderBottom: '1px solid var(--glass-border)',
      paddingBottom: '0.5rem',
      color: 'var(--text-muted)',
    }
  },
  incidentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.95rem',
  },
  countBadge: {
    fontWeight: '700',
    fontSize: '1rem',
  },
  actionCard: {
    padding: '1.75rem',
    flexDirection: 'column',
    gap: '1.25rem',
    textAlign: 'center',
  },
  safeNotice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    '& h4': {
      color: 'var(--status-green)',
      fontSize: '1.1rem',
    },
    '& p': {
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
    }
  },
  alertNotice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    '& h4': {
      color: 'var(--status-red)',
      fontSize: '1.1rem',
      fontWeight: '700',
    },
    '& p': {
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
    }
  },
  stopBtn: {
    marginTop: '0.25rem',
  }
};
