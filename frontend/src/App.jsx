import React, { useState } from 'react';
import RoleSelection from './components/RoleSelection';
import LoginCard from './components/LoginCard';
import CameraSetup from './components/CameraSetup';
import DriverActive from './components/DriverActive';
import OwnerDashboard from './components/OwnerDashboard';
import { Eye, Shield, LogOut } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState(null); // 'driver', 'owner', null
  const [user, setUser] = useState(null); // { name, vehicle_number, role } or { owner_id, role }
  const [screen, setScreen] = useState(null); // 'setup', 'active', 'dashboard'
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');

  const triggerLoading = (message, callback) => {
    setLoading(true);
    setLoadingMessage(message);
    setTimeout(() => {
      callback();
      setLoading(false);
    }, 1500); // 1.5 seconds latency
  };

  const handleLogout = () => {
    triggerLoading("Logging out profile...", () => {
      setUser(null);
      setRole(null);
      setScreen(null);
    });
  };

  const handleBackToRoles = () => {
    triggerLoading("Returning to main menu...", () => {
      setRole(null);
      setUser(null);
      setScreen(null);
    });
  };

  return (
    <div style={styles.appContainer}>
      {/* Top Global Status Header (Only for driver view) */}
      {user && role === 'driver' && (
        <header style={styles.appHeader} className="glass-card">
          <div style={styles.logoGroup}>
            <Eye size={22} color="#6366f1" />
            <span style={styles.logoText}>SDDDS Driver Portal</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.userBadge}>
              Driver: <strong>{user.name}</strong> ({user.vehicle_number})
            </span>
            <button onClick={handleLogout} style={styles.logoutMiniBtn} className="glass-btn-secondary">
              <LogOut size={14} />
              <span>Log out</span>
            </button>
          </div>
        </header>
      )}

      {/* View routing */}
      <main style={styles.mainContent}>
        {!user ? (
          // Guest State
          !role ? (
            <RoleSelection onSelect={(r) => triggerLoading("Entering portal...", () => setRole(r))} />
          ) : (
            <LoginCard 
              role={role} 
              onBack={handleBackToRoles} 
              onLoginSuccess={(authResult) => {
                triggerLoading("Verifying profile...", () => {
                  setUser(authResult.user);
                  if (role === 'owner') {
                    setScreen('dashboard');
                  } else {
                    setScreen('setup');
                  }
                });
              }} 
            />
          )
        ) : (
          // Authenticated State
          role === 'driver' ? (
            screen === 'setup' ? (
              <CameraSetup 
                vehicleNumber={user.vehicle_number} 
                onPairSuccess={() => {
                  triggerLoading("Activating active monitoring...", () => {
                    setScreen('active');
                  });
                }} 
              />
            ) : (
              <DriverActive 
                vehicleNumber={user.vehicle_number} 
                onStop={() => {
                  triggerLoading("Terminating session...", () => {
                    setScreen('setup');
                  });
                }} 
              />
            )
          ) : (
            // Owner view
            <OwnerDashboard onLogout={handleLogout} />
          )
        )}
      </main>

      {/* Subtle bottom footer */}
      <footer style={styles.footer}>
        <p>&copy; 2026 SDDDS - Copyrights Reserved By HK</p>
      </footer>

      {/* Global Race Car Wheel Loading Overlay */}
      {loading && (
        <div className="global-loader-overlay">
          <svg className="race-car-wheel-spinner" viewBox="0 0 100 100" width="80" height="80">
            {/* Outer Tire (Black Rubber) */}
            <circle cx="50" cy="50" r="44" stroke="#111827" strokeWidth="9" fill="none" />
            {/* Tire tread grooves */}
            <circle cx="50" cy="50" r="39.5" stroke="#374151" strokeWidth="1.5" strokeDasharray="6, 5" fill="none" />
            {/* Inner Rim Lip */}
            <circle cx="50" cy="50" r="30" stroke="#4b5563" strokeWidth="2.5" fill="none" />
            {/* Spokes (Aluminum Alloys) */}
            <path d="M50,20 L50,80" stroke="#d1d5db" strokeWidth="3.5" />
            <path d="M20,50 L80,50" stroke="#d1d5db" strokeWidth="3.5" />
            <path d="M29,29 L71,71" stroke="#d1d5db" strokeWidth="3.5" />
            <path d="M29,71 L71,29" stroke="#d1d5db" strokeWidth="3.5" />
            {/* Hubcap center */}
            <circle cx="50" cy="50" r="10" fill="#1f2937" stroke="#4b5563" strokeWidth="2" />
            {/* Center hub nut */}
            <circle cx="50" cy="50" r="4" fill="#6366f1" />
            {/* Motion speed ticks */}
            <circle cx="50" cy="50" r="23" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="2.5" strokeDasharray="10, 15" fill="none" />
          </svg>
          <span className="loader-text">{loadingMessage}</span>
        </div>
      )}
    </div>
  );
}


const styles = {
  appContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  appHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.85rem 1.5rem',
    margin: '1.25rem 1.5rem 0 1.5rem',
    borderRadius: '12px',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  logoText: {
    fontWeight: '600',
    fontSize: '1.25rem',
    letterSpacing: '0.02em',
    fontFamily: "'Chaucer', 'MedievalSharp', 'Germania One', serif",
    color: 'var(--text-main)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
  },
  userBadge: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
  },
  logoutMiniBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.8rem',
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    background: 'rgba(239, 68, 68, 0.03)',
    color: '#fc8181',
    cursor: 'pointer',
    width: 'auto',
  },
  mainContent: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  footer: {
    textAlign: 'center',
    padding: '2rem 1rem',
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
    marginTop: 'auto',
  }
};
