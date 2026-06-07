import React, { useState, useEffect, useRef } from 'react';
import { Shield, Eye, Users, AlertOctagon, RefreshCw, BarChart2, Bell, Clock, Database, Image as ImageIcon, X, Plus, Trash2, VideoOff } from 'lucide-react';
import { API_BASE } from '../utils/api';
import io from 'socket.io-client';

export default function OwnerDashboard({ onLogout }) {
  const [activeVehicles, setActiveVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [stats, setStats] = useState({
    total_alerts: 0,
    alerts_by_type: { sleeping: 0, yawning: 0, nodding: 0 },
    alerts_24h: 0,
    alerts_by_vehicle: [],
    hourly_trend: []
  });

  const [streamError, setStreamError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [trackedVehicles, setTrackedVehicles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tracked_vehicles') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVehicleInput, setNewVehicleInput] = useState('');
  const [addModalError, setAddModalError] = useState('');

  // Combine tracked vehicles with active status details
  const displayedVehicles = trackedVehicles.map(vehNum => {
    const active = activeVehicles.find(v => v.vehicle_number === vehNum);
    if (active) {
      return active;
    } else {
      return {
        vehicle_number: vehNum,
        status: 'Offline',
        camera_type: 'webcam',
        last_active: null
      };
    }
  });

  const handleAddVehicle = (e) => {
    e.preventDefault();
    const veh = newVehicleInput.trim().toUpperCase();
    if (!veh) {
      setAddModalError('Please enter a vehicle number.');
      return;
    }

    if (trackedVehicles.includes(veh)) {
      setAddModalError('Vehicle is already in your tracking list.');
      return;
    }

    // Verify if that vehicle number is currently active
    const activeData = activeVehicles.find(v => v.vehicle_number === veh);
    if (!activeData) {
      setAddModalError(`Vehicle ${veh} is not currently active. The driver must log in and start monitoring first.`);
      return;
    }

    const updated = [...trackedVehicles, veh];
    setTrackedVehicles(updated);
    localStorage.setItem('tracked_vehicles', JSON.stringify(updated));

    setSelectedVehicle(activeData);
    setNewVehicleInput('');
    setAddModalError('');
    setShowAddModal(false);
  };

  const handleRemoveVehicle = (veh, e) => {
    e.stopPropagation();
    const updated = trackedVehicles.filter(v => v !== veh);
    setTrackedVehicles(updated);
    localStorage.setItem('tracked_vehicles', JSON.stringify(updated));

    if (selectedVehicle?.vehicle_number === veh) {
      if (updated.length > 0) {
        const nextVeh = updated[0];
        const active = activeVehicles.find(v => v.vehicle_number === nextVeh);
        setSelectedVehicle(active || {
          vehicle_number: nextVeh,
          status: 'Offline',
          camera_type: 'webcam',
          last_active: null
        });
      } else {
        setSelectedVehicle(null);
      }
    }
  };

  const handleImageError = () => {
    setStreamError(true);
    setTimeout(() => {
      setStreamError(false);
      setRetryKey(prev => prev + 1);
    }, 2000);
  };
  
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'history', 'stats'
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef(null);

  // Play warning chime when sleeping alert is received
  const playAlertSound = (frequency = 600, duration = 0.5) => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio play blocked by browser policy. User interaction required first.");
    }
  };

  // Fetch initial stats and history
  const loadDashboardData = async () => {
    try {
      const statsRes = await fetch(`${API_BASE}/api/dashboard/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);
      
      const activeList = statsData.active_vehicles || [];
      setActiveVehicles(activeList);
      
      // Select the first tracked vehicle if none selected
      if (!selectedVehicle && trackedVehicles.length > 0) {
        const firstTracked = trackedVehicles[0];
        const active = activeList.find(v => v.vehicle_number === firstTracked);
        setSelectedVehicle(active || {
          vehicle_number: firstTracked,
          status: 'Offline',
          camera_type: 'webcam',
          last_active: null
        });
      }

      const alertsRes = await fetch(`${API_BASE}/api/dashboard/alerts`);
      const alertsData = await alertsRes.json();
      setRecentAlerts(alertsData);
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    }
  };

  useEffect(() => {
    loadDashboardData();
    
    // Connect to WebSockets
    const socket = io(API_BASE);

    socket.on('connect', () => {
      console.log('Owner Dashboard Socket Connected');
      socket.emit('join_dashboard', {});
    });

    socket.on('vehicle_status_list', (vehiclesList) => {
      setActiveVehicles(vehiclesList);
      // Keep selected vehicle reference up-to-date with new status
      if (selectedVehicle) {
        const updatedSelected = vehiclesList.find(v => v.vehicle_number === selectedVehicle.vehicle_number);
        if (updatedSelected) {
          setSelectedVehicle(updatedSelected);
        } else {
          // Check if still in tracked list (could be offline now)
          const isTracked = trackedVehicles.includes(selectedVehicle.vehicle_number);
          if (isTracked) {
            setSelectedVehicle(prev => prev ? { ...prev, status: 'Offline' } : null);
          } else {
            setSelectedVehicle(null);
          }
        }
      } else if (trackedVehicles.length > 0) {
        const firstTracked = trackedVehicles[0];
        const active = vehiclesList.find(v => v.vehicle_number === firstTracked);
        setSelectedVehicle(active || {
          vehicle_number: firstTracked,
          status: 'Offline',
          camera_type: 'webcam',
          last_active: null
        });
      }
    });

    // Handle new incoming alerts
    socket.on('new_alert', (newAlert) => {
      // 1. Add alert to list
      setRecentAlerts(prev => [newAlert, ...prev]);
      
      // 2. Refresh stats
      setStats(prev => {
        const newTotal = prev.total_alerts + 1;
        const new24h = prev.alerts_24h + 1;
        const newByType = { ...prev.alerts_by_type };
        newByType[newAlert.alert_type] = (newByType[newAlert.alert_type] || 0) + 1;
        
        return {
          ...prev,
          total_alerts: newTotal,
          alerts_24h: new24h,
          alerts_by_type: newByType
        };
      });

      // 3. Play chime based on alert severity
      if (newAlert.alert_type === 'sleeping') {
        if (soundEnabled) {
          const audio = new Audio('/fa.mp3');
          audio.play().catch(e => console.warn("Audio play blocked by browser:", e));
        }
      } else if (newAlert.alert_type === 'yawning') {
        if (soundEnabled) {
          const audio = new Audio('/y.mp3');
          audio.play().catch(e => console.warn("Audio play blocked by browser:", e));
        }
      } else {
        playAlertSound(450, 0.4); // warning pitch
      }
    });

    return () => {
      socket.emit('leave_dashboard', {});
      socket.disconnect();
    };
  }, [selectedVehicle, soundEnabled, trackedVehicles]);

  const handleSelectVehicle = (vehicle) => {
    setSelectedVehicle(vehicle);
    setStreamError(false);
    setRetryKey(0);
  };

  // Status mapping
  const getStatusBadgeClass = (s) => {
    switch (s) {
      case 'Awake': return 'status-badge-awake';
      case 'Sleeping': return 'status-badge-sleeping';
      case 'Yawning': return 'status-badge-drowsy';
      case 'Nodding': return 'status-badge-drowsy';
      default: return 'status-badge-offline';
    }
  };

  return (
    <div style={styles.dashboardContainer}>
      {/* Header bar */}
      <header style={styles.navBar} className="glass-card">
        <div style={styles.logoGroup}>
          <Shield size={24} color="#10b981" />
          <h2 style={styles.navTitle}>SDDDS Owner Portal</h2>
        </div>
        
        <div style={styles.navControls}>
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)} 
            style={{ 
              ...styles.iconButton, 
              background: soundEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderColor: soundEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
              color: soundEnabled ? 'var(--status-green)' : 'var(--status-red)'
            }}
          >
            <Bell size={18} />
            <span>{soundEnabled ? "Chime Active" : "Chime Muted"}</span>
          </button>
          
          <button onClick={loadDashboardData} style={styles.iconButton} className="glass-btn-secondary">
            <RefreshCw size={18} />
            <span>Refresh</span>
          </button>
          
          <button onClick={onLogout} style={styles.logoutBtn} className="glass-btn-secondary">
            Logout Dashboard
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabBar}>
        <button 
          onClick={() => setActiveTab('live')} 
          style={{ ...styles.tabBtn, ...(activeTab === 'live' ? styles.activeTabBtn : {}) }}
        >
          <Eye size={18} />
          <span>Live Tracking ({activeVehicles.length})</span>
        </button>
        <button 
          onClick={() => setActiveTab('stats')} 
          style={{ ...styles.tabBtn, ...(activeTab === 'stats' ? styles.activeTabBtn : {}) }}
        >
          <BarChart2 size={18} />
          <span>Analytics Dashboard</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')} 
          style={{ ...styles.tabBtn, ...(activeTab === 'history' ? styles.activeTabBtn : {}) }}
        >
          <Clock size={18} />
          <span>Alert Logs & History</span>
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'live' && (
        <div style={styles.mainGrid}>
          {/* Active fleet list */}
          <div className="glass-card" style={styles.fleetPanel}>
            <div style={styles.panelTitleContainer}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexGrow: 1 }}>
                <Users size={18} color="var(--primary-hover)" />
                <h3 style={styles.panelTitle}>Active Fleet Drivers</h3>
              </div>
              <button 
                onClick={() => { setShowAddModal(true); setAddModalError(''); setNewVehicleInput(''); }}
                className="dashboard-add-btn"
                title="Add vehicle to track"
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div style={styles.vehicleList}>
              {displayedVehicles.length === 0 ? (
                <div style={styles.noVehicles}>
                  <p>No Tracked Vehicles</p>
                  <span>Click the + button above to add a vehicle number to track.</span>
                </div>
              ) : (
                displayedVehicles.map((v) => (
                  <div 
                    key={v.vehicle_number}
                    style={{
                      ...styles.vehicleItem,
                      backgroundColor: selectedVehicle?.vehicle_number === v.vehicle_number ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                      borderColor: selectedVehicle?.vehicle_number === v.vehicle_number ? 'var(--primary)' : 'var(--glass-border)'
                    }}
                    onClick={() => handleSelectVehicle(v)}
                  >
                    <div style={styles.vehicleItemLeft}>
                      <span style={styles.vehicleNum}>{v.vehicle_number}</span>
                      <span style={styles.camTypeLabel}>Source: {v.camera_type}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`status-badge ${getStatusBadgeClass(v.status)}`} style={styles.smallBadge}>
                        {v.status}
                      </span>
                      <button 
                        onClick={(e) => handleRemoveVehicle(v.vehicle_number, e)}
                        className="dashboard-remove-btn"
                        title="Remove vehicle"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live Stream Panel */}
          <div className="glass-card" style={styles.streamPanel}>
            {selectedVehicle ? (
              <>
                <div style={styles.streamPanelHeader}>
                  <div>
                    <h3 style={styles.selectedVehNum}>{selectedVehicle.vehicle_number}</h3>
                    <p style={styles.selectedVehSub}>Tracking vehicle telematics in real-time</p>
                  </div>
                  <span className={`status-badge ${getStatusBadgeClass(selectedVehicle.status)}`}>
                    {selectedVehicle.status}
                  </span>
                </div>

                <div style={styles.streamFeedBox}>
                  {selectedVehicle.status !== 'Offline' && !streamError ? (
                    <img 
                      src={`${API_BASE}/api/stream/${selectedVehicle.vehicle_number}?t=${Date.now()}&retry=${retryKey}`}
                      alt="Fleet Live stream feed"
                      style={styles.liveStreamImage}
                      onError={handleImageError}
                    />
                  ) : (
                    <div style={{ ...styles.fallbackContainer, display: 'flex' }}>
                      {selectedVehicle.status === 'Offline' ? (
                        <VideoOff size={48} color="var(--text-dim)" />
                      ) : (
                        <AlertOctagon size={48} color="var(--status-yellow)" />
                      )}
                      <p>{selectedVehicle.status === 'Offline' ? 'Driver Offline' : 'Live stream feed unavailable (Retrying...)'}</p>
                      <span>{selectedVehicle.status === 'Offline' ? 'Waiting for the driver to start their monitoring session.' : 'Ensure driver has active camera pairing and monitoring session.'}</span>
                    </div>
                  )}
                </div>

                <div style={styles.streamStatsPanel}>
                  <div style={styles.streamStatItem}>
                    <span style={styles.statLabel}>Camera Type</span>
                    <span style={styles.statVal}>{selectedVehicle.camera_type.toUpperCase()}</span>
                  </div>
                  <div style={styles.streamStatItem}>
                    <span style={styles.statLabel}>Active Status</span>
                    <span style={{ 
                      ...styles.statVal, 
                      color: selectedVehicle.status === 'Awake' ? 'var(--status-green)' : 
                             selectedVehicle.status === 'Sleeping' ? 'var(--status-red)' : 'var(--status-yellow)'
                    }}>{selectedVehicle.status.toUpperCase()}</span>
                  </div>
                  <div style={styles.streamStatItem}>
                    <span style={styles.statLabel}>Session Link</span>
                    <span style={styles.statVal}>{selectedVehicle.status !== 'Offline' ? 'Active WebSocket' : 'Offline'}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={styles.noActiveMonitor}>
                <Eye size={48} color="var(--text-dim)" />
                <h3>No vehicle selected</h3>
                <p>Select a driver from the left sidebar to open their visual mesh telematics feed.</p>
              </div>
            )}
          </div>

          {/* Real-time Alerts ticker */}
          <div className="glass-card" style={styles.realtimeAlertPanel}>
            <div style={styles.panelTitleContainer}>
              <Bell size={18} color="var(--status-red)" />
              <h3 style={styles.panelTitle}>Live Safety Alerts</h3>
            </div>
            
            <div style={styles.alertTickerList}>
              {recentAlerts.slice(0, 15).map((alert, idx) => (
                <div 
                  key={alert.id || idx} 
                  style={{
                    ...styles.alertTickerCard,
                    borderColor: alert.alert_type === 'sleeping' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)',
                    background: alert.alert_type === 'sleeping' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)'
                  }}
                  onClick={() => setSelectedScreenshot(alert.screenshot_path)}
                >
                  <div style={styles.alertTickerHeader}>
                    <span style={styles.alertVeh}>{alert.vehicle_number}</span>
                    <span style={styles.alertTime}>{alert.timestamp.split(' ')[1] || alert.timestamp}</span>
                  </div>
                  <div style={styles.alertTickerBody}>
                    <span style={{ 
                      fontWeight: '700', 
                      color: alert.alert_type === 'sleeping' ? 'var(--status-red)' : 'var(--status-yellow)'
                    }}>
                      {alert.alert_type.toUpperCase()} DETECTED
                    </span>
                    <span style={styles.viewCaptureLink}>
                      <ImageIcon size={12} />
                      View Capture
                    </span>
                  </div>
                </div>
              ))}

              {recentAlerts.length === 0 && (
                <div style={styles.noAlerts}>
                  <p>No alerts recorded</p>
                  <span>Fleet is operating safely.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div style={styles.statsContainer}>
          {/* Quick Metrics */}
          <div style={styles.metricsRow}>
            <div className="glass-card" style={styles.metricCard}>
              <span style={styles.metricLabel}>Total Incident Alerts</span>
              <span style={styles.metricVal}>{stats.total_alerts}</span>
            </div>
            <div className="glass-card" style={styles.metricCard}>
              <span style={styles.metricLabel}>Alerts in Last 24 Hours</span>
              <span style={{ ...styles.metricVal, color: 'var(--status-yellow)' }}>{stats.alerts_24h}</span>
            </div>
            <div className="glass-card" style={styles.metricCard}>
              <span style={styles.metricLabel}>Active Stream Channels</span>
              <span style={{ ...styles.metricVal, color: 'var(--status-green)' }}>{activeVehicles.length}</span>
            </div>
          </div>

          <div style={styles.chartsGrid}>
            {/* SVG Incident breakdown */}
            <div className="glass-card" style={styles.chartPanel}>
              <h3>Alert Types Distribution</h3>
              <div style={styles.chartContainer}>
                {(() => {
                  const data = [
                    { label: 'Sleeping', value: stats.alerts_by_type.sleeping, color: 'var(--status-red)' },
                    { label: 'Yawning', value: stats.alerts_by_type.yawning, color: 'var(--status-yellow)' },
                    { label: 'Nodding', value: stats.alerts_by_type.nodding, color: '#6366f1' }
                  ];
                  const maxVal = Math.max(...data.map(d => d.value), 1);
                  
                  return (
                    <div style={styles.barChart}>
                      {data.map((item) => (
                        <div key={item.label} style={styles.barChartRow}>
                          <span style={styles.barLabel}>{item.label}</span>
                          <div style={styles.barTrack}>
                            <div style={{ 
                              ...styles.barFill, 
                              width: `${(item.value / maxVal) * 100}%`,
                              backgroundColor: item.color 
                            }} />
                          </div>
                          <span style={styles.barVal}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* SVG Alerts per vehicle */}
            <div className="glass-card" style={styles.chartPanel}>
              <h3>Top Risky Vehicles (Total Alerts)</h3>
              <div style={styles.chartContainer}>
                {stats.alerts_by_vehicle.length === 0 ? (
                  <div style={styles.emptyChart}>No incident data available.</div>
                ) : (
                  <div style={styles.barChart}>
                    {stats.alerts_by_vehicle.slice(0, 5).map((item) => {
                      const maxVal = Math.max(...stats.alerts_by_vehicle.map(d => d.count), 1);
                      return (
                        <div key={item.vehicle_number} style={styles.barChartRow}>
                          <span style={styles.barLabel}>{item.vehicle_number}</span>
                          <div style={styles.barTrack}>
                            <div style={{ 
                              ...styles.barFill, 
                              width: `${(item.count / maxVal) * 100}%`,
                              backgroundColor: 'var(--primary-hover)' 
                            }} />
                          </div>
                          <span style={styles.barVal}>{item.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* SVG Alert Trends hourly */}
            <div className="glass-card" style={{ ...styles.chartPanel, gridColumn: 'span 2' }}>
              <h3>Alert Incident Hourly Trend (Recent Hours)</h3>
              <div style={{ ...styles.chartContainer, height: '200px' }}>
                {stats.hourly_trend.length === 0 ? (
                  <div style={styles.emptyChart}>Waiting for hourly data logs...</div>
                ) : (
                  <svg style={styles.lineChartSvg} viewBox="0 0 800 200">
                    {(() => {
                      const trend = stats.hourly_trend;
                      const maxVal = Math.max(...trend.map(t => t.count), 1);
                      const width = 800;
                      const height = 150;
                      const points = trend.map((t, idx) => {
                        const x = (idx / (trend.length - 1 || 1)) * (width - 100) + 50;
                        const y = height - (t.count / maxVal) * (height - 40) - 20;
                        return { x, y, label: t.hour, val: t.count };
                      });
                      
                      const pathD = points.reduce((acc, p, idx) => {
                        return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                      }, '');

                      return (
                        <>
                          {/* Grid Lines */}
                          <line x1="50" y1="20" x2="750" y2="20" stroke="rgba(255,255,255,0.05)" />
                          <line x1="50" y1="75" x2="750" y2="75" stroke="rgba(255,255,255,0.05)" />
                          <line x1="50" y1="130" x2="750" y2="130" stroke="rgba(255,255,255,0.05)" />
                          
                          {/* Trend line */}
                          {trend.length > 1 && (
                            <path d={pathD} fill="none" stroke="var(--primary-hover)" strokeWidth="3" />
                          )}
                          
                          {/* Points and Values */}
                          {points.map((p, idx) => (
                            <g key={idx}>
                              <circle cx={p.x} cy={p.y} r="5" fill="var(--bg-dark)" stroke="var(--primary)" strokeWidth="2" />
                              <text x={p.x} y={p.y - 10} fill="var(--text-main)" fontSize="10" textAnchor="middle">{p.val}</text>
                              <text x={p.x} y="170" fill="var(--text-dim)" fontSize="10" textAnchor="middle">{p.label}</text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="glass-card" style={styles.historyContainer}>
          <div style={styles.historyHeader}>
            <div style={styles.logoGroup}>
              <Database size={20} color="var(--primary-hover)" />
              <h3>Historical Safety Log Files</h3>
            </div>
          </div>

          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Vehicle Number</th>
                  <th>Incident Type</th>
                  <th>Timestamp</th>
                  <th>Capture Evidence</th>
                </tr>
              </thead>
              <tbody>
                {recentAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td><strong>{alert.vehicle_number}</strong></td>
                    <td>
                      <span className={`status-badge ${
                        alert.alert_type === 'sleeping' ? 'status-badge-sleeping' : 'status-badge-drowsy'
                      }`} style={styles.tableBadge}>
                        {alert.alert_type}
                      </span>
                    </td>
                    <td>{alert.timestamp}</td>
                    <td>
                      <button 
                        onClick={() => setSelectedScreenshot(alert.screenshot_path)}
                        style={styles.viewEvidenceBtn}
                        className="glass-btn-secondary"
                      >
                        <ImageIcon size={14} />
                        <span>View Capture</span>
                      </button>
                    </td>
                  </tr>
                ))}

                {recentAlerts.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                      No historical alerts saved in SQLite database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Screenshot Evidence Modal */}
      {selectedScreenshot && (
        <div style={styles.modalOverlay} onClick={() => setSelectedScreenshot(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()} className="glass-card">
            <div style={styles.modalHeader}>
              <h4>Incident Capture Evidence</h4>
              <button onClick={() => setSelectedScreenshot(null)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            
            <div style={styles.modalBody}>
              <img 
                src={`${API_BASE}${selectedScreenshot}`} 
                alt="Alert Screenshot Evidence" 
                style={styles.modalImg} 
              />
            </div>
            
            <div style={styles.modalFooter}>
              <p>Storage Path: <code>{selectedScreenshot}</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '400px' }} onClick={(e) => e.stopPropagation()} className="glass-card">
            <div style={styles.modalHeader}>
              <h4 style={{ fontFamily: "'Petrov Sans', sans-serif" }}>Track New Vehicle</h4>
              <button onClick={() => setShowAddModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {addModalError && <div style={styles.errorAlert}>{addModalError}</div>}
              
              <div className="glass-input-group" style={{ marginBottom: 0 }}>
                <label className="glass-input-label">Vehicle Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. TN07CM2026"
                  value={newVehicleInput}
                  onChange={(e) => { setNewVehicleInput(e.target.value); setAddModalError(''); }}
                  className="glass-input"
                  style={{ textTransform: 'uppercase' }}
                  autoFocus
                />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)} 
                  style={{ ...styles.iconButton, margin: 0 }} 
                  className="glass-btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ 
                    padding: '0.5rem 1.25rem',
                    background: 'var(--primary)',
                    boxShadow: '0 4px 14px var(--primary-glow)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Add Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  dashboardContainer: {
    padding: '2rem 1.5rem',
    maxWidth: '1200px',
    margin: '0 auto',
    minHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    color: '#fc8181',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    lineHeight: '1.4',
  },
  navBar: {
    padding: '1rem 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: '12px',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  navTitle: {
    fontSize: '2rem',
    fontWeight: '600',
    fontFamily: "'Chaucer', 'MedievalSharp', 'Germania One', serif",
    color: '#10b981',
    textShadow: '0 0 10px rgba(16, 185, 129, 0.2)',
  },
  navControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  iconButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: '1px solid var(--glass-border)',
    background: 'none',
    color: 'var(--text-muted)',
    width: 'auto',
  },
  logoutBtn: {
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    background: 'rgba(239, 68, 68, 0.05)',
    color: 'var(--status-red)',
    width: 'auto',
  },
  tabBar: {
    display: 'flex',
    gap: '0.75rem',
    borderBottom: '1px solid var(--glass-border)',
    paddingBottom: '0.5rem',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '0.75rem 1.25rem',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s ease',
  },
  activeTabBtn: {
    color: 'var(--text-main)',
    borderBottomColor: 'var(--primary-hover)',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.6fr 1fr',
    gap: '1.5rem',
    height: '65vh',
  },
  fleetPanel: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  panelTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderBottom: '1px solid var(--glass-border)',
    paddingBottom: '0.75rem',
  },
  panelTitle: {
    fontSize: '0.95rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  vehicleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    overflowY: 'auto',
    flexGrow: 1,
  },
  noVehicles: {
    textAlign: 'center',
    padding: '2rem 1rem',
    color: 'var(--text-dim)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    '& p': {
      fontWeight: '600',
      color: 'var(--text-muted)',
    },
    '& span': {
      fontSize: '0.8rem',
    }
  },
  vehicleItem: {
    border: '1px solid',
    borderRadius: '10px',
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  vehicleItemLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    textAlign: 'left',
  },
  vehicleNum: {
    fontWeight: '700',
    fontSize: '1rem',
  },
  camTypeLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-dim)',
  },
  smallBadge: {
    fontSize: '0.75rem',
    padding: '0.2rem 0.5rem',
  },
  streamPanel: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  streamPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedVehNum: {
    fontSize: '1.3rem',
    fontWeight: '700',
  },
  selectedVehSub: {
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
  },
  streamFeedBox: {
    width: '100%',
    flexGrow: 1,
    background: '#040710',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid var(--glass-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  liveStreamImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
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
  streamStatsPanel: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--glass-border)',
    borderRadius: '10px',
    padding: '0.75rem',
  },
  streamStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  statLabel: {
    fontSize: '0.7rem',
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: '0.825rem',
    fontWeight: '700',
  },
  noActiveMonitor: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    color: 'var(--text-dim)',
    textAlign: 'center',
    padding: '2rem',
    '& h3': {
      color: 'var(--text-muted)',
    },
    '& p': {
      fontSize: '0.85rem',
      maxWidth: '280px',
    }
  },
  realtimeAlertPanel: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  alertTickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    overflowY: 'auto',
    flexGrow: 1,
  },
  alertTickerCard: {
    borderLeft: '4px solid',
    borderWidth: '1px 1px 1px 4px',
    borderStyle: 'solid',
    borderRadius: '8px',
    padding: '0.75rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    transition: 'transform 0.15s ease',
    '&:hover': {
      transform: 'scale(1.02)'
    }
  },
  alertTickerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
  },
  alertVeh: {
    fontWeight: '700',
  },
  alertTime: {
    color: 'var(--text-dim)',
  },
  alertTickerBody: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.825rem',
  },
  viewCaptureLink: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  noAlerts: {
    textAlign: 'center',
    color: 'var(--text-dim)',
    padding: '3rem 1rem',
    '& p': {
      fontWeight: '600',
    }
  },
  statsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1.5rem',
  },
  metricCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  metricLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  metricVal: {
    fontSize: '2.5rem',
    fontWeight: '800',
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.5rem',
  },
  chartPanel: {
    padding: '1.5rem',
    '& h3': {
      fontSize: '1rem',
      marginBottom: '1.5rem',
      color: 'var(--text-muted)',
    }
  },
  chartContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '150px',
  },
  barChart: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  barChartRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  barLabel: {
    width: '90px',
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    fontWeight: '600',
    textAlign: 'left',
  },
  barTrack: {
    flexGrow: 1,
    height: '14px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '9999px',
    overflow: 'hidden',
    border: '1px solid var(--glass-border)',
  },
  barFill: {
    height: '100%',
    borderRadius: '9999px',
  },
  barVal: {
    width: '30px',
    fontSize: '0.9rem',
    fontWeight: '700',
    textAlign: 'right',
  },
  lineChartSvg: {
    width: '100%',
    height: '100%',
  },
  emptyChart: {
    color: 'var(--text-dim)',
  },
  historyContainer: {
    padding: '1.5rem',
  },
  historyHeader: {
    marginBottom: '1.5rem',
  },
  tableScroll: {
    overflowX: 'auto',
    width: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    '& th': {
      padding: '1rem',
      borderBottom: '2px solid var(--glass-border)',
      color: 'var(--text-muted)',
      fontSize: '0.85rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    '& td': {
      padding: '1rem',
      borderBottom: '1px solid var(--glass-border)',
      fontSize: '0.95rem',
    }
  },
  tableBadge: {
    fontSize: '0.75rem',
    padding: '0.2rem 0.5rem',
  },
  viewEvidenceBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8rem',
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '1px solid var(--glass-border)',
    background: 'none',
    color: 'var(--text-muted)',
    width: 'auto',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(5, 7, 12, 0.85)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: '640px',
    padding: '1.5rem',
    background: 'var(--bg-dark-accent)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--glass-border)',
    paddingBottom: '0.75rem',
    marginBottom: '1rem',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
  },
  modalBody: {
    width: '100%',
    aspectRatio: '4/3',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#000',
    border: '1px solid var(--glass-border)',
  },
  modalImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  modalFooter: {
    marginTop: '1rem',
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
  }
};
