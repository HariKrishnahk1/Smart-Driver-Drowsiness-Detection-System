import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, AlertTriangle, Eye, VideoOff, Timer, LogOut } from 'lucide-react';
import io from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

export default function DriverActive({ vehicleNumber, onStop }) {
  const [status, setStatus] = useState('Awake');
  const [duration, setDuration] = useState(0);
  const [yawnCount, setYawnCount] = useState(0);
  const [nodCount, setNodCount] = useState(0);
  const [sleepCount, setSleepCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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

  // 2. Socket.IO connection for real-time telemetry updates
  useEffect(() => {
    const socket = io(API_BASE);
    
    socket.on('connect', () => {
      console.log('Driver Socket Connected');
    });

    // Listen to status updates from backend
    socket.on('status_change', (data) => {
      if (data.vehicle_number === vehicleNumber.toUpperCase()) {
        setStatus(data.status);
      }
    });

    // Listen to new alerts triggered to increment counts locally
    socket.on('new_alert', (data) => {
      if (data.vehicle_number === vehicleNumber.toUpperCase()) {
        if (data.alert_type === 'sleeping') {
          setSleepCount(c => c + 1);
          // Play the alarm sound fa.mp3 locally to alert the driver
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
    });

    return () => {
      socket.disconnect();
    };
  }, [vehicleNumber]);

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
            {!streamError ? (
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
