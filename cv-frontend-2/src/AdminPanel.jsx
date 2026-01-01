import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API || `http://${window.location.hostname}:8000`;

export default function AdminPanel({ onBack }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [recentAlert, setRecentAlert] = useState(null);
  const [newLogIds, setNewLogIds] = useState(new Set());
  const lastAlertTime = useRef(0);
  const statsRefreshTimeout = useRef(null);
  const audioCache = useRef({});

  // Check authentication status
  useEffect(() => {
    checkAuth();
    loadEmailStatus();
  }, []);

  // Load logs and stats when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
      loadLogs();
      // Polling as backup - refresh every 10 seconds
      const interval = setInterval(() => {
        loadStats();
        loadLogs();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Listen for real-time events and play voice alerts
  useEffect(() => {
    if (!isAuthenticated) return;

    const es = new EventSource(`${API}/events`);
    const AUDIO_COOLDOWN = 5000; // 5 seconds between alerts

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      
      // Play voice alert for critical events
      if (data.type === "ZONE_ALERT" || data.type === "FREEZE_ALERT" || data.type === "PPE_VIOLATION" || data.type === "FACE_CLASSIFIED") {
        const now = Date.now();
        if (now - lastAlertTime.current >= AUDIO_COOLDOWN) {
          playAlertSound(data.type);
          lastAlertTime.current = now;
        }
        // Show alert banner
        setRecentAlert({
          type: data.type,
          message: `${data.type.replace(/_/g, " ")} - Camera: ${data.cam_id || "Unknown"}`,
          timestamp: data.human_time || new Date().toLocaleTimeString(),
        });
        // Auto-hide after 5 seconds
        setTimeout(() => setRecentAlert(null), 5000);
      }
      
      // Update logs in real-time
      setLogs((prev) => {
        const logId = `${data.type}-${data.cam_id}-${Date.now()}`;
        const newLog = {
          id: logId,
          event_type: data.type,
          timestamp: data.human_time || new Date().toISOString(),
          human_time: data.human_time,
          cam_id: data.cam_id,
          zone_id: data.zone_id,
          person_name: data.person_name,
          missing_ppe: data.missing_ppe,
          seconds_still: data.seconds_still,
          label: data.label,
          ...data
        };
        
        // Mark as new for highlighting
        setNewLogIds((prevIds) => new Set([...prevIds, logId]));
        // Remove highlight after 3 seconds
        setTimeout(() => {
          setNewLogIds((prevIds) => {
            const updated = new Set(prevIds);
            updated.delete(logId);
            return updated;
          });
        }, 3000);
        
        return [newLog, ...prev.slice(0, 499)];
      });
      
      // Update stats in real-time when new events arrive
      setStats((prevStats) => {
        // Initialize stats if not loaded yet
        const baseStats = prevStats || {
          total_events: 0,
          recent_events_24h: 0,
          active_cameras: 0,
          events_by_type: {},
          events_by_camera: {},
        };
        
        const updated = { ...baseStats };
        
        // Increment total events
        updated.total_events = (updated.total_events || 0) + 1;
        
        // Update events by type - create new object to trigger React re-render
        updated.events_by_type = { ...(updated.events_by_type || {}) };
        updated.events_by_type[data.type] = (updated.events_by_type[data.type] || 0) + 1;
        
        // Update events by camera - create new object to trigger React re-render
        if (data.cam_id) {
          updated.events_by_camera = { ...(updated.events_by_camera || {}) };
          updated.events_by_camera[data.cam_id] = (updated.events_by_camera[data.cam_id] || 0) + 1;
        }
        
        // Update recent events count (last 24h) - approximate
        updated.recent_events_24h = (updated.recent_events_24h || 0) + 1;
        
        return updated;
      });
      
      // Also refresh stats from server periodically to ensure accuracy (debounced)
      // Only refresh every 2 seconds max to avoid too many requests
      if (statsRefreshTimeout.current) {
        clearTimeout(statsRefreshTimeout.current);
      }
      statsRefreshTimeout.current = setTimeout(() => {
        loadStats();
        statsRefreshTimeout.current = null;
      }, 2000);
    };

    es.onerror = (err) => {
      console.error("EventSource error:", err);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (isAuthenticated) {
          loadStats();
        }
      }, 5000);
    };

    return () => es.close();
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API}/admin/email/status`, {
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        },
      });
      if (response.ok) {
        setIsAuthenticated(true);
        setError("");
      }
    } catch (err) {
      // Not authenticated yet
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/admin/email/status`, {
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        },
      });

      if (response.ok) {
        setIsAuthenticated(true);
        setError("");
        loadEmailStatus();
        loadStats();
        loadLogs();
      } else {
        setError("Invalid username or password");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const loadEmailStatus = async () => {
    try {
      const response = await fetch(`${API}/admin/email/status`, {
        headers: isAuthenticated
          ? { Authorization: `Basic ${btoa(`${username}:${password}`)}` }
          : {},
      });
      if (response.ok) {
        const data = await response.json();
        setEmailEnabled(data.enabled);
      }
    } catch (err) {
      console.error("Failed to load email status:", err);
    }
  };

  const toggleEmail = async (enabled) => {
    try {
      const response = await fetch(`${API}/admin/email/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        const data = await response.json();
        setEmailEnabled(data.enabled);
      }
    } catch (err) {
      console.error("Failed to toggle email:", err);
    }
  };

  const loadStats = async () => {
    if (!isAuthenticated) return;
    try {
      const response = await fetch(`${API}/admin/stats`, {
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const loadLogs = async () => {
    if (!isAuthenticated) return;
    try {
      const response = await fetch(`${API}/admin/logs/db?limit=100`, {
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Add IDs to logs if they don't have them
        const logsWithIds = (data.logs || []).map((log, idx) => ({
          ...log,
          id: log.id || `${log.event_type}-${log.cam_id || 'unknown'}-${idx}-${log.timestamp || Date.now()}`
        }));
        setLogs(logsWithIds);
      }
    } catch (err) {
      console.error("Failed to load logs:", err);
    }
  };

  const playAlertSound = (eventType) => {
    // Map event types to audio files
    const audioMap = {
      "FREEZE_ALERT": "/Freeze.mp3",
      "PPE_VIOLATION": "/PPE_Violation.mp3",
      "ZONE_ALERT": "/Intrusion_Alert.mp3",
      "FACE_CLASSIFIED": "/Unauthorized_Access.mp3",
    };

    const audioFile = audioMap[eventType];
    if (!audioFile) {
      console.warn(`No audio file mapped for event type: ${eventType}`);
      return;
    }

    // Use cached audio or create new one
    if (!audioCache.current[eventType]) {
      audioCache.current[eventType] = new Audio(audioFile);
      audioCache.current[eventType].volume = 0.8; // Set volume to 80%
    }

    const audio = audioCache.current[eventType];
    audio.currentTime = 0;
    audio.play().catch((err) => {
      console.error(`Audio play failed for ${eventType}:`, err);
    });
  };

  const getEventIcon = (type) => {
    switch (type) {
      case "ZONE_ALERT":
        return "🚨";
      case "FREEZE_ALERT":
        return "⏸️";
      case "PPE_VIOLATION":
        return "🦺";
      case "FACE_CLASSIFIED":
        return "👤";
      default:
        return "📋";
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case "ZONE_ALERT":
        return "#FF3B30";
      case "FREEZE_ALERT":
        return "#FF9500";
      case "PPE_VIOLATION":
        return "#FFD60A";
      case "FACE_CLASSIFIED":
        return "#34C759";
      default:
        return "#007AFF";
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-login-container">
        <div className="admin-login-box">
          <div className="admin-login-header">
            <h2>🔐 Admin Login</h2>
            <p>Camera Monitoring System</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="admin-input-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
            <div className="admin-input-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            {error && <div className="admin-error">{error}</div>}
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
          {onBack && (
            <button className="admin-back-btn" onClick={onBack}>
              ← Back to Main
            </button>
          )}
        </div>
        <style>{`
          .admin-login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #050608 0%, #0a0c10 50%, #0e1015 100%);
            padding: 20px;
          }
          .admin-login-box {
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(50px) saturate(200%);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 24px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 20px 80px rgba(0, 0, 0, 0.6);
          }
          .admin-login-header {
            text-align: center;
            margin-bottom: 30px;
          }
          .admin-login-header h2 {
            color: #fff;
            margin: 0 0 8px 0;
            font-size: 24px;
          }
          .admin-login-header p {
            color: rgba(255, 255, 255, 0.6);
            margin: 0;
            font-size: 14px;
          }
          .admin-input-group {
            margin-bottom: 20px;
          }
          .admin-input-group label {
            display: block;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 600;
          }
          .admin-input-group input {
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            color: #fff;
            font-size: 14px;
            box-sizing: border-box;
          }
          .admin-input-group input:focus {
            outline: none;
            border-color: #007AFF;
            background: rgba(255, 255, 255, 0.15);
          }
          .admin-error {
            background: rgba(255, 59, 48, 0.2);
            border: 1px solid rgba(255, 59, 48, 0.4);
            color: #FF3B30;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
          }
          .admin-login-btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #007AFF, #5856D6);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
          }
          .admin-login-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 122, 255, 0.4);
          }
          .admin-login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .admin-back-btn {
            width: 100%;
            margin-top: 16px;
            padding: 12px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s;
          }
          .admin-back-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.3);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div>
          <h1>📊 Admin Dashboard</h1>
          <p>Camera Monitoring System - Admin Panel</p>
        </div>
        <div className="admin-header-actions">
          <button className="admin-logout-btn" onClick={() => setIsAuthenticated(false)}>
            Logout
          </button>
          {onBack && (
            <button className="admin-back-btn" onClick={onBack}>
              ← Main View
            </button>
          )}
        </div>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          📈 Dashboard
        </button>
        <button
          className={`admin-tab ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          📋 Logs
        </button>
        <button
          className={`admin-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          ⚙️ Settings
        </button>
      </div>

      {recentAlert && (
        <div className="alert-banner" style={{ borderLeftColor: getEventColor(recentAlert.type) }}>
          <span className="alert-icon">{getEventIcon(recentAlert.type)}</span>
          <div className="alert-content">
            <div className="alert-title">{recentAlert.message}</div>
            <div className="alert-time">{recentAlert.timestamp}</div>
          </div>
          <button className="alert-close" onClick={() => setRecentAlert(null)}>×</button>
        </div>
      )}

      <div className="admin-content">
        {activeTab === "dashboard" && (
          <div className="admin-dashboard">
            <div className="realtime-indicator">
              <span className="realtime-dot"></span>
              <span>Real-time Updates Active</span>
            </div>
            {stats && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-value">{stats.total_events || 0}</div>
                    <div className="stat-label">Total Events</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🕐</div>
                    <div className="stat-value">{stats.recent_events_24h || 0}</div>
                    <div className="stat-label">Last 24 Hours</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📹</div>
                    <div className="stat-value">{stats.active_cameras || 0}</div>
                    <div className="stat-label">Active Cameras</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">{emailEnabled ? "✅" : "❌"}</div>
                    <div className="stat-value">{emailEnabled ? "ON" : "OFF"}</div>
                    <div className="stat-label">Email Alerts</div>
                  </div>
                </div>

                <div className="stats-sections">
                  <div className="stats-section">
                    <h3>Events by Type</h3>
                    <div className="events-list">
                      {Object.entries(stats.events_by_type || {}).length > 0 ? (
                        Object.entries(stats.events_by_type || {}).map(([type, count]) => (
                          <div key={type} className="event-item event-item-realtime">
                            <span className="event-icon">{getEventIcon(type)}</span>
                            <span className="event-name">{type.replace(/_/g, " ")}</span>
                            <span className="event-count event-count-realtime" key={`${type}-${count}`}>{count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="empty-events">No events yet. Waiting for real-time updates...</div>
                      )}
                    </div>
                  </div>

                  <div className="stats-section">
                    <h3>Events by Camera</h3>
                    <div className="events-list">
                      {Object.entries(stats.events_by_camera || {}).map(([cam, count]) => (
                        <div key={cam} className="event-item">
                          <span className="event-icon">📹</span>
                          <span className="event-name">{cam}</span>
                          <span className="event-count">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <div className="admin-logs">
            <div className="logs-header">
              <h3>Event Logs ({logs.length})</h3>
              <button className="refresh-btn" onClick={loadLogs}>
                🔄 Refresh
              </button>
            </div>
            <div className="logs-container">
              {logs.length === 0 ? (
                <div className="empty-logs">No logs available</div>
              ) : (
                logs.map((log, idx) => (
                  <div 
                    key={log.id || idx} 
                    className={`log-item ${newLogIds.has(log.id) ? 'log-item-new' : ''}`}
                    style={{ borderLeftColor: getEventColor(log.event_type) }}
                  >
                    <div className="log-header">
                      <span className="log-icon">{getEventIcon(log.event_type)}</span>
                      <span className="log-type">{log.event_type || "UNKNOWN"}</span>
                      <span className="log-time">{log.timestamp || log.human_time || "N/A"}</span>
                    </div>
                    <div className="log-details">
                      {log.cam_id && <span>Camera: {log.cam_id}</span>}
                      {log.zone_id && <span>Zone: {log.zone_id}</span>}
                      {log.person_name && <span>Person: {log.person_name}</span>}
                      {log.missing_ppe && <span>Missing: {log.missing_ppe}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="admin-settings">
            <h3>Email Notifications</h3>
            <div className="setting-item">
              <div className="setting-info">
                <h4>Email Alerts</h4>
                <p>Enable or disable email notifications for security alerts</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => toggleEmail(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            {emailEnabled && (
              <div className="email-info">
                <p><strong>Status:</strong> Email notifications are enabled</p>
                <p><strong>Recipients:</strong> {stats?.config?.recipients?.join(", ") || "N/A"}</p>
              </div>
            )}
          </div>
        )}
      </div>


      <style>{`
        .admin-panel {
          min-height: 100vh;
          background: linear-gradient(135deg, #050608 0%, #0a0c10 50%, #0e1015 100%);
          color: #fff;
          padding: 20px;
        }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .admin-header h1 {
          margin: 0 0 8px 0;
          font-size: 28px;
        }
        .admin-header p {
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
        }
        .admin-header-actions {
          display: flex;
          gap: 12px;
        }
        .admin-logout-btn, .admin-back-btn {
          padding: 10px 20px;
          background: rgba(255, 59, 48, 0.2);
          border: 1px solid rgba(255, 59, 48, 0.4);
          border-radius: 12px;
          color: #FF3B30;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        .admin-logout-btn:hover {
          background: rgba(255, 59, 48, 0.3);
          transform: translateY(-2px);
        }
        .admin-back-btn {
          background: rgba(0, 122, 255, 0.2);
          border-color: rgba(0, 122, 255, 0.4);
          color: #007AFF;
        }
        .admin-back-btn:hover {
          background: rgba(0, 122, 255, 0.3);
        }
        .admin-tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 30px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .admin-tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: rgba(255, 255, 255, 0.6);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        .admin-tab:hover {
          color: rgba(255, 255, 255, 0.9);
        }
        .admin-tab.active {
          color: #007AFF;
          border-bottom-color: #007AFF;
        }
        .admin-content {
          max-width: 1400px;
          margin: 0 auto;
        }
        .realtime-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: rgba(52, 199, 89, 0.15);
          border: 1px solid rgba(52, 199, 89, 0.3);
          border-radius: 12px;
          margin-bottom: 20px;
          color: #34C759;
          font-size: 14px;
          font-weight: 600;
        }
        .realtime-dot {
          width: 10px;
          height: 10px;
          background: #34C759;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.2);
          }
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(50px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 20px;
          padding: 24px;
          text-align: center;
        }
        .stat-icon {
          font-size: 32px;
          margin-bottom: 12px;
        }
        .stat-value {
          font-size: 36px;
          font-weight: 700;
          color: #007AFF;
          margin-bottom: 8px;
        }
        .stat-label {
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
        }
        .stats-sections {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 20px;
        }
        .stats-section {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(50px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 20px;
          padding: 24px;
        }
        .stats-section h3 {
          margin: 0 0 20px 0;
          font-size: 20px;
        }
        .events-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .event-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
        }
        .event-icon {
          font-size: 20px;
        }
        .event-name {
          flex: 1;
          text-transform: capitalize;
        }
        .event-count {
          background: #007AFF;
          color: white;
          padding: 4px 12px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.3s ease;
        }
        .event-count-realtime {
          animation: countUpdate 0.5s ease-out;
        }
        @keyframes countUpdate {
          0% {
            transform: scale(1);
            background: #007AFF;
          }
          50% {
            transform: scale(1.2);
            background: #34C759;
          }
          100% {
            transform: scale(1);
            background: #007AFF;
          }
        }
        .event-item-realtime {
          transition: background 0.3s ease;
        }
        .empty-events {
          text-align: center;
          padding: 20px;
          color: rgba(255, 255, 255, 0.5);
          font-style: italic;
        }
        .admin-logs {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(50px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 20px;
          padding: 24px;
        }
        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .logs-header h3 {
          margin: 0;
        }
        .refresh-btn {
          padding: 8px 16px;
          background: rgba(0, 122, 255, 0.2);
          border: 1px solid rgba(0, 122, 255, 0.4);
          border-radius: 8px;
          color: #007AFF;
          font-size: 14px;
          cursor: pointer;
        }
        .logs-container {
          max-height: 600px;
          overflow-y: auto;
        }
        .log-item {
          background: rgba(255, 255, 255, 0.05);
          border-left: 4px solid;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          transition: all 0.3s ease;
        }
        .log-item-new {
          background: rgba(0, 122, 255, 0.15);
          border-left-width: 6px;
          animation: highlightPulse 0.5s ease-out;
        }
        @keyframes highlightPulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.7);
          }
          50% {
            transform: scale(1.02);
            box-shadow: 0 0 0 8px rgba(0, 122, 255, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(0, 122, 255, 0);
          }
        }
        .log-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .log-icon {
          font-size: 20px;
        }
        .log-type {
          font-weight: 600;
          flex: 1;
        }
        .log-time {
          color: rgba(255, 255, 255, 0.6);
          font-size: 12px;
        }
        .log-details {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }
        .log-details span {
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 8px;
          border-radius: 6px;
        }
        .empty-logs {
          text-align: center;
          padding: 40px;
          color: rgba(255, 255, 255, 0.5);
        }
        .admin-settings {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(50px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 20px;
          padding: 24px;
        }
        .admin-settings h3 {
          margin: 0 0 24px 0;
        }
        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .setting-info h4 {
          margin: 0 0 8px 0;
        }
        .setting-info p {
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
        }
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 60px;
          height: 34px;
        }
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.2);
          transition: 0.4s;
          border-radius: 34px;
        }
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 26px;
          width: 26px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: 0.4s;
          border-radius: 50%;
        }
        .toggle-switch input:checked + .toggle-slider {
          background-color: #34C759;
        }
        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(26px);
        }
        .email-info {
          background: rgba(0, 122, 255, 0.1);
          border: 1px solid rgba(0, 122, 255, 0.3);
          border-radius: 12px;
          padding: 16px;
          margin-top: 16px;
        }
        .email-info p {
          margin: 8px 0;
          font-size: 14px;
        }
        .alert-banner {
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-left: 4px solid;
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 1000;
          min-width: 300px;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .alert-icon {
          font-size: 24px;
        }
        .alert-content {
          flex: 1;
        }
        .alert-title {
          font-weight: 600;
          color: #000;
          margin-bottom: 4px;
        }
        .alert-time {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.6);
        }
        .alert-close {
          background: transparent;
          border: none;
          font-size: 24px;
          color: rgba(0, 0, 0, 0.5);
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s;
        }
        .alert-close:hover {
          background: rgba(0, 0, 0, 0.1);
          color: #000;
        }
      `}</style>
    </div>
  );
}

