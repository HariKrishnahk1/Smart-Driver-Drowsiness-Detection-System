import React, { useState } from 'react';
import { Camera, Globe, CheckCircle, AlertTriangle, ArrowRight, Play } from 'lucide-react';
import { API_URL as API_BASE } from '../utils/api';

export default function CameraSetup({ vehicleNumber, onPairSuccess }) {
  const [cameraType, setCameraType] = useState('webcam'); // 'webcam' or 'ip_camera'
  const [cameraUrl, setCameraUrl] = useState('');
  const [testStatus, setTestStatus] = useState('idle'); // 'idle', 'testing', 'success', 'failed'
  const [testMessage, setTestMessage] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);

  const handleTestConnection = async () => {
    if (cameraType === 'ip_camera' && !cameraUrl.trim()) {
      setTestStatus('failed');
      setTestMessage('Please enter a valid IP Camera URL first.');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Connecting to camera feed...');

    try {
      const response = await fetch(`${API_BASE}/camera/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          camera_type: cameraType,
          camera_url: cameraType === 'ip_camera' ? cameraUrl.trim() : null
        })
      });

      const data = await response.json();
      if (data.success) {
        setTestStatus('success');
        setTestMessage('Camera connected successfully! Feed verified.');
      } else {
        setTestStatus('failed');
        setTestMessage(data.message || 'Could not reach the camera. Make sure the webcam is not in use or the URL is valid.');
      }
    } catch (err) {
      setTestStatus('failed');
      setTestMessage('Network error. Failed to reach verification server.');
    }
  };

  const handlePairAndStart = async () => {
    setPairingLoading(true);
    try {
      // 1. Pair camera with vehicle
      const pairResponse = await fetch(`${API_BASE}/camera/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vehicle_number: vehicleNumber,
          camera_type: cameraType,
          camera_url: cameraType === 'ip_camera' ? cameraUrl.trim() : null
        })
      });

      const pairData = await pairResponse.json();
      if (!pairResponse.ok || !pairData.success) {
        throw new Error(pairData.message || 'Failed to pair camera.');
      }

      // 2. Start monitoring service
      const startResponse = await fetch(`${API_BASE}/monitoring/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vehicle_number: vehicleNumber
        })
      });

      const startData = await startResponse.json();
      if (!startResponse.ok || !startData.success) {
        throw new Error(startData.message || 'Failed to start background monitoring.');
      }

      // Success
      onPairSuccess();
    } catch (err) {
      setTestStatus('failed');
      setTestMessage(err.message || 'An error occurred while setting up monitoring.');
    } finally {
      setPairingLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <h2 style={styles.title}>Camera Configuration</h2>
        <p style={styles.subtitle}>
          Select and verify the camera source for vehicle <strong>{vehicleNumber}</strong>
        </p>

        {/* Selection Cards */}
        <div style={styles.typeSelector}>
          <div 
            style={{ 
              ...styles.selectorCard,
              borderColor: cameraType === 'webcam' ? 'var(--primary)' : 'var(--glass-border)',
              background: cameraType === 'webcam' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(255,255,255,0.02)'
            }}
            onClick={() => { setCameraType('webcam'); setTestStatus('idle'); setTestMessage(''); }}
          >
            <Camera size={28} color={cameraType === 'webcam' ? 'var(--primary-hover)' : 'var(--text-dim)'} />
            <div style={styles.selectorText}>
              <h3>Local Webcam</h3>
              <p>Primary integrated system webcam</p>
            </div>
            <input 
              type="radio" 
              name="camType" 
              checked={cameraType === 'webcam'} 
              onChange={() => {}} 
              style={styles.radio}
            />
          </div>

          <div 
            style={{ 
              ...styles.selectorCard,
              borderColor: cameraType === 'ip_camera' ? 'var(--primary)' : 'var(--glass-border)',
              background: cameraType === 'ip_camera' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(255,255,255,0.02)'
            }}
            onClick={() => { setCameraType('ip_camera'); setTestStatus('idle'); setTestMessage(''); }}
          >
            <Globe size={28} color={cameraType === 'ip_camera' ? 'var(--primary-hover)' : 'var(--text-dim)'} />
            <div style={styles.selectorText}>
              <h3>IP / RTSP Camera</h3>
              <p>Network camera stream (RTSP/HTTP)</p>
            </div>
            <input 
              type="radio" 
              name="camType" 
              checked={cameraType === 'ip_camera'} 
              onChange={() => {}} 
              style={styles.radio}
            />
          </div>
        </div>

        {/* IP Camera URL Input */}
        {cameraType === 'ip_camera' && (
          <div className="glass-input-group" style={styles.inputGroup}>
            <label className="glass-input-label">IP Camera URL</label>
            <input 
              type="text" 
              placeholder="e.g. http://192.168.1.100:8080/video or rtsp://admin:123@192.168.1.101/stream1"
              value={cameraUrl}
              onChange={(e) => { setCameraUrl(e.target.value); setTestStatus('idle'); }}
              className="glass-input"
            />
          </div>
        )}

        {/* Action Button for connection test */}
        <button 
          onClick={handleTestConnection} 
          disabled={testStatus === 'testing'}
          className="glass-btn glass-btn-secondary"
          style={styles.testBtn}
        >
          {testStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
        </button>

        {/* Status display */}
        {testStatus !== 'idle' && (
          <div style={{
            ...styles.statusBox,
            background: testStatus === 'success' ? 'rgba(16, 185, 129, 0.06)' : 
                        testStatus === 'testing' ? 'rgba(99, 102, 241, 0.06)' : 'rgba(239, 68, 68, 0.06)',
            borderColor: testStatus === 'success' ? 'rgba(16, 185, 129, 0.2)' : 
                         testStatus === 'testing' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          }}>
            <div style={styles.statusBoxHeader}>
              {testStatus === 'success' && <CheckCircle size={18} color="var(--status-green)" />}
              {testStatus === 'failed' && <AlertTriangle size={18} color="var(--status-red)" />}
              {testStatus === 'testing' && <div className="animate-pulse-green" style={styles.testingIndicator} />}
              <span style={{
                ...styles.statusText,
                color: testStatus === 'success' ? 'var(--status-green)' : 
                       testStatus === 'testing' ? 'var(--primary-hover)' : 'var(--status-red)',
              }}>
                {testStatus === 'success' ? 'Connection Verified' : 
                 testStatus === 'testing' ? 'Verifying Link...' : 'Verification Failed'}
              </span>
            </div>
            <p style={styles.statusDesc}>{testMessage}</p>
          </div>
        )}

        {/* Submit pairing */}
        <button 
          onClick={handlePairAndStart} 
          disabled={testStatus !== 'success' || pairingLoading}
          className="glass-btn"
          style={{ 
            marginTop: '2rem',
            background: testStatus === 'success' ? 'var(--primary)' : 'var(--text-dim)',
            cursor: testStatus === 'success' ? 'pointer' : 'not-allowed',
          }}
        >
          <Play size={18} />
          <span>{pairingLoading ? 'Initiating Service...' : 'Pair & Start Monitoring'}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '540px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  card: {
    padding: '2.5rem 2rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
    marginBottom: '0.25rem',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    marginBottom: '2rem',
  },
  typeSelector: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  selectorCard: {
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    padding: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  selectorText: {
    flexGrow: 1,
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    '& h3': {
      fontSize: '1rem',
      fontWeight: '600',
    },
    '& p': {
      fontSize: '0.825rem',
      color: 'var(--text-dim)',
    }
  },
  radio: {
    cursor: 'pointer',
    width: '18px',
    height: '18px',
  },
  inputGroup: {
    marginTop: '1.5rem',
  },
  testBtn: {
    marginTop: '0.5rem',
    width: 'auto',
    alignSelf: 'flex-start',
  },
  statusBox: {
    marginTop: '1.5rem',
    borderRadius: '10px',
    border: '1px solid',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  statusBoxHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  statusText: {
    fontWeight: '600',
    fontSize: '0.9rem',
  },
  statusDesc: {
    fontSize: '0.825rem',
    color: 'var(--text-muted)',
    lineHeight: '1.4',
  },
  testingIndicator: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'var(--primary)',
  }
};
