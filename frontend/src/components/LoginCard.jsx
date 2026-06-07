import React, { useState } from 'react';
import { ArrowLeft, User, Key, Car, Shield, Eye, EyeOff } from 'lucide-react';
import { API_URL as API_BASE } from '../utils/api';

export default function LoginCard({ role, onBack, onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_number: '',
    name: '',
    owner_id: '',
    password: '',
    confirm_password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const validate = () => {
    if (role === 'driver') {
      if (!formData.vehicle_number.trim()) {
        setError('Vehicle number is required.');
        return false;
      }
      if (isRegister && !formData.name.trim()) {
        setError('Name is required.');
        return false;
      }
    } else {
      if (!formData.owner_id.trim()) {
        setError('Owner ID is required.');
        return false;
      }
    }

    if (!formData.password) {
      setError('Password is required.');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return false;
    }

    if (isRegister && formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const payload = {
      role,
      password: formData.password,
      ...(role === 'driver'
        ? { vehicle_number: formData.vehicle_number, name: formData.name }
        : { owner_id: formData.owner_id })
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      if (isRegister) {
        setSuccessMsg(data.message + ' You can now log in.');
        setIsRegister(false);
        setFormData({ ...formData, password: '', confirm_password: '' });
      } else {
        onLoginSuccess(data);
      }
    } catch (err) {
      setError(err.message || 'Connection error. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.outerContainer}>
      <button onClick={onBack} style={styles.backBtn} className="glass-btn-secondary">
        <ArrowLeft size={16} />
        <span>Back to Roles</span>
      </button>

      <div className="glass-card" style={styles.card}>
        <div style={styles.iconHeader}>
          {role === 'driver' ? (
            <Car size={36} color="#6366f1" />
          ) : (
            <Shield size={36} color="#10b981" />
          )}
          <h2 style={styles.title}>
            {role === 'driver' ? 'Driver Portal' : 'Owner Portal'}
          </h2>
          <p style={styles.subtitle}>
            {isRegister ? 'Create a secure credentials profile' : 'Sign in to access your dashboard'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={styles.tabContainer}>
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); setSuccessMsg(''); }}
            style={{
              ...styles.tab,
              ...(!isRegister ? styles.activeTab : {}),
              borderBottomColor: !isRegister ? (role === 'driver' ? '#6366f1' : '#10b981') : 'transparent'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); setSuccessMsg(''); }}
            style={{
              ...styles.tab,
              ...(isRegister ? styles.activeTab : {}),
              borderBottomColor: isRegister ? (role === 'driver' ? '#6366f1' : '#10b981') : 'transparent'
            }}
          >
            Create Account
          </button>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}
        {successMsg && <div style={styles.successAlert}>{successMsg}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {role === 'driver' ? (
            <>
              {isRegister && (
                <div className="glass-input-group">
                  <label className="glass-input-label">Full Name</label>
                  <div style={styles.inputWrapper}>
                    <User size={18} style={styles.inputIcon} />
                    <input
                      type="text"
                      name="name"
                      placeholder="E.G. HK"
                      className="glass-input"
                      value={formData.name}
                      onChange={handleInputChange}
                      style={styles.inputWithIcon}
                    />
                  </div>
                </div>
              )}
              <div className="glass-input-group">
                <label className="glass-input-label">Vehicle Number</label>
                <div style={styles.inputWrapper}>
                  <Car size={18} style={styles.inputIcon} />
                  <input
                    type="text"
                    name="vehicle_number"
                    placeholder="e.g. TN07CM2026"
                    className="glass-input"
                    value={formData.vehicle_number}
                    onChange={handleInputChange}
                    style={{ ...styles.inputWithIcon, textTransform: 'uppercase' }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="glass-input-group">
              <label className="glass-input-label">Owner ID</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  name="owner_id"
                  placeholder="E.G. owner_main"
                  className="glass-input"
                  value={formData.owner_id}
                  onChange={handleInputChange}
                  style={styles.inputWithIcon}
                />
              </div>
            </div>
          )}

          <div className="glass-input-group">
            <label className="glass-input-label">Password</label>
            <div style={styles.inputWrapper}>
              <Key size={18} style={styles.inputIcon} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                className="glass-input"
                value={formData.password}
                onChange={handleInputChange}
                style={styles.inputWithIcon}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.passwordToggle}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="glass-input-group">
              <label className="glass-input-label">Confirm Password</label>
              <div style={styles.inputWrapper}>
                <Key size={18} style={styles.inputIcon} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="confirm_password"
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="glass-input"
                  value={formData.confirm_password}
                  onChange={handleInputChange}
                  style={styles.inputWithIcon}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="glass-btn"
            disabled={loading}
            style={{
              marginTop: '1rem',
              background: role === 'driver' ? 'var(--primary)' : 'var(--status-green)',
              boxShadow: role === 'driver' ? '0 4px 14px var(--primary-glow)' : '0 4px 14px var(--status-green-glow)'
            }}
          >
            {loading ? 'Authenticating...' : (isRegister ? 'Register Account' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  outerContainer: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '2rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  backBtn: {
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    border: '1px solid var(--glass-border)',
    background: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    width: 'auto',
  },
  card: {
    padding: '2.5rem 2rem',
  },
  iconHeader: {
    textAlign: 'center',
    marginBottom: '2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    marginTop: '0.25rem',
  },
  tabContainer: {
    display: 'flex',
    borderBottom: '1px solid var(--glass-border)',
    marginBottom: '2rem',
  },
  tab: {
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '0.75rem',
    color: 'var(--text-dim)',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },
  activeTab: {
    color: 'var(--text-main)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--text-dim)',
    pointerEvents: 'none',
  },
  inputWithIcon: {
    paddingLeft: '40px',
  },
  passwordToggle: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    color: '#fc8181',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
    lineHeight: '1.4',
  },
  successAlert: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    color: '#a7f3d0',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
    lineHeight: '1.4',
  }
};
