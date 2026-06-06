import React, { useState, useRef } from 'react';
import { Car, Shield, Eye, AlertTriangle, Volume2, VolumeX } from 'lucide-react';

export default function RoleSelection({ onSelect }) {
  const [videoFinished, setVideoFinished] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);

  const handleSkip = () => {
    setVideoFinished(true);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  if (!videoFinished) {
    return (
      <div style={styles.videoOverlay}>
        <video 
          ref={videoRef}
          src="/intro.mp4" 
          autoPlay 
          muted={isMuted}
          playsInline 
          onEnded={() => setVideoFinished(true)} 
          style={styles.introVideo}
        />
        
        <div style={styles.videoControls}>
          <button onClick={toggleMute} style={styles.videoControlBtn}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <span>{isMuted ? "Unmute Sound" : "Mute Sound"}</span>
          </button>
          
          <button onClick={handleSkip} style={styles.skipBtn}>
            <span>Skip Intro</span>
            <span style={{ fontSize: '1.1rem' }}>&rarr;</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} className="intro-fade-in">
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <Eye size={40} color="#6366f1" style={styles.eyeIcon} />
          <h1 style={styles.title}>Smart Driver Drowsiness Detection System</h1>
        </div>
        <p style={styles.subtitle}>AI-Powered Driver Drowsiness Monitoring</p>
      </header>

      <div className="grid-cols-2" style={styles.cardContainer}>
        {/* Driver Card */}
        <div 
          className="glass-card glass-card-interactive flex-center" 
          style={styles.card}
          onClick={() => onSelect('driver')}
        >
          <div style={styles.iconCircle}>
            <Car size={36} color="#6366f1" />
          </div>
          <h2 style={styles.cardTitle}>Driver Panel</h2>
          <p style={styles.cardDesc}>
            Register your vehicle, pair your camera feed, and activate background AI monitoring to keep yourself safe on the road.
          </p>
          <div style={styles.cardFooter}>
            <span>Access Portal</span>
            <span style={styles.arrow}>&rarr;</span>
          </div>
        </div>

        {/* Owner Card */}
        <div 
          className="glass-card glass-card-interactive flex-center" 
          style={styles.card}
          onClick={() => onSelect('owner')}
        >
          <div style={styles.iconCircle}>
            <Shield size={36} color="#10b981" />
          </div>
          <h2 style={styles.cardTitle}>Owner Dashboard</h2>
          <p style={styles.cardDesc}>
            Monitor active vehicles in real-time, view live video streams with face meshes, and analyze historical safety alert statistics.
          </p>
          <div style={styles.cardFooter}>
            <span style={{ color: '#10b981' }}>Access Portal</span>
            <span style={{ ...styles.arrow, color: '#10b981' }}>&rarr;</span>
          </div>
        </div>
      </div>
      
      <div style={styles.alertBanner}>
        <AlertTriangle size={18} color="#f59e0b" />
        <span style={styles.bannerText}>Ensure your camera is connected before starting the monitoring session.</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '85vh',
    padding: '2rem 1rem',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '3rem',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  eyeIcon: {
    filter: 'drop-shadow(0 0 10px rgba(99, 102, 241, 0.5))',
  },
  title: {
    fontSize: '2.25rem',
    fontWeight: '800',
    fontFamily: "'Batangas', 'Cinzel', serif",
    letterSpacing: '0.02em',
    background: 'linear-gradient(135deg, #ffffff 40%, #c7d2fe 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '1.125rem',
    color: 'var(--text-muted)',
    maxWidth: '600px',
    lineHeight: '1.6',
  },
  cardContainer: {
    width: '100%',
    maxWidth: '850px',
  },
  card: {
    flexDirection: 'column',
    textAlign: 'center',
    padding: '2.5rem 2rem',
    minHeight: '320px',
  },
  iconCircle: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--glass-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.5rem',
    boxShadow: 'inset 0 4px 10px rgba(0, 0, 0, 0.2)',
  },
  cardTitle: {
    fontSize: '1.5rem',
    marginBottom: '1rem',
    fontWeight: '700',
    fontFamily: "'Petrov Sans', 'Outfit', 'Montserrat', sans-serif",
  },
  cardDesc: {
    color: 'var(--text-muted)',
    fontSize: '0.95rem',
    lineHeight: '1.6',
    flexGrow: 1,
    marginBottom: '1.5rem',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: '600',
    fontSize: '0.95rem',
    color: 'var(--primary-hover)',
  },
  arrow: {
    transition: 'transform 0.2s ease',
  },
  alertBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '4rem',
    padding: '0.75rem 1.25rem',
    borderRadius: '8px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
  },
  bannerText: {
    fontSize: '0.875rem',
    color: 'var(--status-yellow)',
    fontWeight: '500',
  },
  videoOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: '#02040a',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  introVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  videoControls: {
    position: 'absolute',
    bottom: '2.5rem',
    left: '0',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    gap: '1.5rem',
    padding: '0 2rem',
    zIndex: 10000,
  },
  videoControlBtn: {
    background: 'rgba(15, 22, 38, 0.7)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#fff',
    padding: '0.75rem 1.25rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
  },
  skipBtn: {
    background: 'rgba(79, 70, 229, 0.85)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
    transition: 'all 0.2s ease',
  }
};
