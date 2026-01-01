import { useState } from "react";

const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API || `http://${window.location.hostname}:8000`;

export default function MenuWindow({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("settings");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${API}/generate_report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: startDate || null,
          end_date: endDate || null
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sentinel_ai_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        alert('✅ Report generated successfully!');
      } else {
        throw new Error('Report generation failed');
      }
    } catch (error) {
      console.error('Report generation error:', error);
      alert('❌ Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="menu-overlay" onClick={onClose}>
      <div className="menu-window" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="menu-header">
          <h2>System Menu</h2>
          <button className="menu-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="menu-tabs">
          <button 
            className={`menu-tab ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            ⚙️ Settings
          </button>
          <button 
            className={`menu-tab ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            📊 Analytics
          </button>
          <button 
            className={`menu-tab ${activeTab === "system" ? "active" : ""}`}
            onClick={() => setActiveTab("system")}
          >
            🔧 System
          </button>
        </div>

        {/* Content */}
        <div className="menu-content">
          {activeTab === "settings" && (
            <div className="menu-section">
              <h3>Face Recognition Settings</h3>
              <div className="setting-group">
                <label>
                  <span>Detection Confidence</span>
                  <input type="range" min="0.1" max="1.0" step="0.1" defaultValue="0.7" />
                  <span className="setting-value">0.7</span>
                </label>
                <label>
                  <span>Similarity Threshold</span>
                  <input type="range" min="0.5" max="0.95" step="0.05" defaultValue="0.75" />
                  <span className="setting-value">0.75</span>
                </label>
                <label>
                  <span>Minimum Face Size</span>
                  <input type="range" min="50" max="200" step="10" defaultValue="120" />
                  <span className="setting-value">120px</span>
                </label>
              </div>
              
              <h3>Alert Settings</h3>
              <div className="setting-group">
                <label className="checkbox-label">
                  <input type="checkbox" defaultChecked />
                  <span>Enable Audio Alerts</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" defaultChecked />
                  <span>Show Visual Overlays</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" />
                  <span>Email Notifications</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="menu-section">
              <h3>System Analytics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">24</div>
                  <div className="stat-label">Total Alerts Today</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">98.5%</div>
                  <div className="stat-label">Detection Accuracy</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">2.3s</div>
                  <div className="stat-label">Avg Response Time</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">15</div>
                  <div className="stat-label">False Positives</div>
                </div>
              </div>
              
              <h3>Performance Metrics</h3>
              <div className="metric-item">
                <span>CPU Usage</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: "45%" }}></div>
                </div>
                <span>45%</span>
              </div>
              <div className="metric-item">
                <span>Memory Usage</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: "62%" }}></div>
                </div>
                <span>62%</span>
              </div>
              <div className="metric-item">
                <span>GPU Usage</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: "78%" }}></div>
                </div>
                <span>78%</span>
              </div>

              {/* Report Generation Section */}
              <h3 style={{ marginTop: '20px' }}>📄 Generate PDF Report</h3>
              <div className="report-section">
                <p style={{ fontSize: '13px', color: 'var(--menu-text-secondary)', marginBottom: '12px' }}>
                  Generate comprehensive analytics report with charts and statistics
                </p>
                
                <div className="date-range-selector">
                  <div className="date-input-group">
                    <label>Start Date:</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="date-input"
                    />
                  </div>
                  <div className="date-input-group">
                    <label>End Date:</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="date-input"
                    />
                  </div>
                </div>

                <button 
                  className="action-btn primary"
                  onClick={generateReport}
                  disabled={generating}
                  style={{ width: '100%', marginTop: '12px' }}
                >
                  {generating ? "⏳ Generating Report..." : "📊 Generate PDF Report"}
                </button>

                <div style={{ marginTop: '12px', padding: '10px', background: 'var(--menu-tab-bg)', borderRadius: '8px', fontSize: '12px' }}>
                  <p style={{ marginBottom: '6px', fontWeight: '600' }}>📈 Report includes:</p>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--menu-text-secondary)' }}>
                    <li>Event types distribution (Pie Chart)</li>
                    <li>Events by camera (Bar Chart)</li>
                    <li>Hourly distribution (Histogram)</li>
                    <li>Day vs Hour heatmap</li>
                    <li>Top active zones (Bar Chart)</li>
                    <li>Events trend over time (Line Chart)</li>
                    <li><strong>📋 Detailed Events Log</strong> (up to 500 events)</li>
                    <li style={{ fontSize: '11px', marginTop: '4px', fontStyle: 'italic' }}>
                      • Authorized/Unauthorized entries<br/>
                      • Intrusion alerts<br/>
                      • Freeze/Loitering incidents<br/>
                      • Helmet & Vest violations
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="menu-section">
              <h3>System Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Version</span>
                  <span className="info-value">v2.1.0</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Uptime</span>
                  <span className="info-value">3d 14h 22m</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Active Cameras</span>
                  <span className="info-value">4/4</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Face Database</span>
                  <span className="info-value">2 persons</span>
                </div>
              </div>
              
              <h3>System Actions</h3>
              <div className="action-buttons">
                <button className="action-btn primary">
                  🔄 Reload Face Database
                </button>
                <button className="action-btn">
                  📊 Export Logs
                </button>
                <button className="action-btn">
                  🔧 System Diagnostics
                </button>
                <button className="action-btn warning">
                  ⚠️ Emergency Stop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* Real Liquid Glass Theme Variables - Dark (More Translucent) */
        [data-theme="dark"] {
          --menu-overlay: rgba(0, 0, 0, 0.75);
          --menu-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(6, 8, 12, 0.15);
          --menu-header-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%), linear-gradient(180deg, rgba(10, 12, 16, 0.4), rgba(8, 10, 14, 0.3));
          --menu-border: rgba(255, 255, 255, 0.18);
          --menu-text: #ffffff;
          --menu-text-secondary: #a1a1aa;
          --menu-shadow: 0 30px 100px rgba(0,0,0,0.9), 0 20px 60px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.6) inset;
          --menu-tab-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(15, 18, 22, 0.3);
          --menu-tab-active: linear-gradient(135deg, #007AFF, #5856D6);
          --menu-content-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(10, 12, 16, 0.2);
        }

        /* Real Liquid Glass Theme Variables - Light (More Translucent) */
        [data-theme="light"] {
          --menu-overlay: rgba(255, 255, 255, 0.65);
          --menu-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%), rgba(248, 250, 252, 0.35);
          --menu-header-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(248, 248, 250, 0.5));
          --menu-border: rgba(0, 0, 0, 0.15);
          --menu-text: #1d1d1f;
          --menu-text-secondary: #6e6e73;
          --menu-shadow: 0 30px 80px rgba(0,0,0,0.18), 0 20px 50px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,1) inset, 0 -1px 0 rgba(0,0,0,0.08) inset;
          --menu-tab-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%), rgba(248, 250, 252, 0.4);
          --menu-tab-active: linear-gradient(135deg, #007AFF, #5856D6);
          --menu-content-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%), rgba(248, 250, 252, 0.3);
        }

        .menu-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--menu-overlay);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.3s ease;
          transition: background 0.3s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Real Liquid Glass Menu Window */
        [data-theme="dark"] .menu-window {
          background: var(--menu-bg);
          backdrop-filter: blur(50px) saturate(200%) brightness(1.1);
          -webkit-backdrop-filter: blur(50px) saturate(200%) brightness(1.1);
          border: 1px solid var(--menu-border);
          border-radius: 24px;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: var(--menu-shadow);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: all 0.3s ease;
        }

        [data-theme="light"] .menu-window {
          background: var(--menu-bg);
          backdrop-filter: blur(50px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(50px) saturate(180%) brightness(1.05);
          border: 1px solid var(--menu-border);
          border-radius: 24px;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: var(--menu-shadow);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: all 0.3s ease;
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--menu-border);
          background: var(--menu-header-bg);
          transition: all 0.3s ease;
        }

        .menu-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: var(--menu-text);
        }

        /* Liquid Glass Close Button - Dark Theme */
        [data-theme="dark"] .menu-close {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(220, 38, 38, 0.5)),
            linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25)),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          box-shadow: 
            0 8px 32px rgba(239, 68, 68, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }

        [data-theme="dark"] .menu-close:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.7)),
            linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.35)),
            rgba(8, 10, 14, 0.35);
          box-shadow: 
            0 12px 40px rgba(239, 68, 68, 0.6),
            0 20px 60px rgba(239, 68, 68, 0.3),
            0 0 60px rgba(239, 68, 68, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(239, 68, 68, 0.8);
          transform: translateY(-4px) scale(1.02);
        }
        
        [data-theme="dark"] .menu-close:active {
          transform: translateY(0);
        }

        /* Liquid Glass Close Button - Light Theme */
        [data-theme="light"] .menu-close {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25)),
            rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #dc2626;
          font-size: 18px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 4px 20px rgba(239, 68, 68, 0.15),
            0 8px 40px rgba(239, 68, 68, 0.1),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 0 1px rgba(239, 68, 68, 0.1);
          position: relative;
          overflow: hidden;
        }

        [data-theme="light"] .menu-close:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.35)),
            rgba(255, 255, 255, 0.7);
          box-shadow: 
            0 6px 28px rgba(239, 68, 68, 0.25),
            0 12px 56px rgba(239, 68, 68, 0.15),
            0 0 60px rgba(239, 68, 68, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          border-color: rgba(239, 68, 68, 0.6);
          transform: translateY(-4px) scale(1.02);
        }
        
        [data-theme="light"] .menu-close:active {
          transform: translateY(0);
        }

        .menu-tabs {
          display: flex;
          background: var(--menu-tab-bg);
          border-bottom: 1px solid var(--menu-border);
          transition: all 0.3s ease;
        }

        /* Real Liquid Glass Menu Tabs */
        [data-theme="dark"] .menu-tab {
          background: none;
          border: none;
          color: var(--menu-text-secondary);
          padding: 16px 24px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          border-bottom: 2px solid transparent;
          font-weight: 500;
        }

        [data-theme="dark"] .menu-tab:hover {
          color: var(--menu-text);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
        }

        [data-theme="light"] .menu-tab {
          background: none;
          border: none;
          color: var(--menu-text-secondary);
          padding: 16px 24px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          border-bottom: 2px solid transparent;
          font-weight: 500;
        }

        [data-theme="light"] .menu-tab:hover {
          color: var(--menu-text);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%), rgba(0, 122, 255, 0.08);
          backdrop-filter: blur(30px) saturate(180%);
          -webkit-backdrop-filter: blur(30px) saturate(180%);
        }

        .menu-tab.active {
          color: #007AFF;
          border-bottom-color: #007AFF;
          background: rgba(0, 122, 255, 0.1);
        }

        .menu-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          background: var(--menu-content-bg);
          transition: all 0.3s ease;
        }

        .menu-section h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--menu-text);
          border-bottom: 1px solid var(--menu-border);
          padding-bottom: 8px;
        }

        .setting-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .setting-group label {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--menu-text);
        }

        .setting-group span {
          min-width: 140px;
          font-weight: 500;
        }

        .setting-group input[type="range"] {
          flex: 1;
          height: 6px;
          background: var(--menu-tab-bg);
          border-radius: 3px;
          outline: none;
          -webkit-appearance: none;
        }

        .setting-group input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: #007AFF;
          border-radius: 50%;
          cursor: pointer;
        }

        .setting-value {
          min-width: 60px !important;
          text-align: right;
          color: #007AFF;
          font-weight: 600;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #007AFF;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: var(--menu-tab-bg);
          border: 1px solid var(--menu-border);
          border-radius: 12px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #007AFF;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: var(--menu-text-secondary);
        }

        .metric-item {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .metric-item span:first-child {
          min-width: 100px;
          color: var(--menu-text);
        }

        .metric-item span:last-child {
          min-width: 40px;
          text-align: right;
          color: #007AFF;
          font-weight: 600;
        }

        .progress-bar {
          flex: 1;
          height: 8px;
          background: var(--menu-tab-bg);
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #007AFF, #5856D6);
          transition: width 0.3s ease;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--menu-tab-bg);
          border: 1px solid var(--menu-border);
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .info-label {
          color: var(--menu-text-secondary);
          font-weight: 500;
        }

        .info-value {
          color: var(--menu-text);
          font-weight: 600;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Real Liquid Glass Action Buttons */
        /* Liquid Glass Action Buttons - Dark Theme */
        [data-theme="dark"] .action-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: var(--menu-text);
          padding: 14px 18px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          font-size: 14px;
          backdrop-filter: blur(40px) saturate(200%) brightness(1.1);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }

        [data-theme="dark"] .action-btn:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            rgba(12, 14, 18, 0.35);
          border-color: rgba(0, 122, 255, 0.5);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 12px 40px rgba(0, 122, 255, 0.4),
            0 20px 60px rgba(0, 122, 255, 0.2),
            0 0 60px rgba(0, 122, 255, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.2) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset;
        }

        /* Liquid Glass Action Buttons - Light Theme */
        [data-theme="light"] .action-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            rgba(248, 250, 252, 0.45);
          border: 1px solid var(--menu-border);
          color: var(--menu-text);
          padding: 14px 18px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          font-size: 14px;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 4px 20px rgba(0, 0, 0, 0.08),
            0 8px 40px rgba(0, 0, 0, 0.04),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 0 1px rgba(0, 122, 255, 0.03);
          position: relative;
          overflow: hidden;
        }

        [data-theme="light"] .action-btn:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            rgba(255, 255, 255, 0.7);
          border-color: rgba(0, 122, 255, 0.4);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 6px 28px rgba(0, 122, 255, 0.25),
            0 12px 56px rgba(0, 122, 255, 0.15),
            0 0 60px rgba(0, 122, 255, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }
        
        .action-btn:active {
          transform: translateY(0);
        }

        /* Liquid Glass Primary Buttons (Blue) - Dark Theme */
        [data-theme="dark"] .action-btn.primary {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.6), rgba(29, 78, 216, 0.5)),
            linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(29, 78, 216, 0.25)),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: white;
        }
        
        [data-theme="dark"] .action-btn.primary:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(29, 78, 216, 0.7)),
            linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(29, 78, 216, 0.35)),
            rgba(8, 10, 14, 0.35);
          box-shadow: 
            0 12px 40px rgba(59, 130, 246, 0.6),
            0 20px 60px rgba(59, 130, 246, 0.3),
            0 0 60px rgba(59, 130, 246, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset;
          border-color: rgba(59, 130, 246, 0.8);
        }

        /* Liquid Glass Primary Buttons (Blue) - Light Theme */
        [data-theme="light"] .action-btn.primary {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(29, 78, 216, 0.25)),
            rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #1d4ed8;
        }
        
        [data-theme="light"] .action-btn.primary:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(29, 78, 216, 0.35)),
            rgba(255, 255, 255, 0.7);
          box-shadow: 
            0 6px 28px rgba(59, 130, 246, 0.25),
            0 12px 56px rgba(59, 130, 246, 0.15),
            0 0 60px rgba(59, 130, 246, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          border-color: rgba(59, 130, 246, 0.6);
        }

        /* Liquid Glass Warning Buttons (Red) - Dark Theme */
        [data-theme="dark"] .action-btn.warning {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(220, 38, 38, 0.5)),
            linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25)),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: white;
        }
        
        [data-theme="dark"] .action-btn.warning:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.7)),
            linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.35)),
            rgba(8, 10, 14, 0.35);
          box-shadow: 
            0 12px 40px rgba(239, 68, 68, 0.6),
            0 20px 60px rgba(239, 68, 68, 0.3),
            0 0 60px rgba(239, 68, 68, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset;
          border-color: rgba(239, 68, 68, 0.8);
        }

        /* Liquid Glass Warning Buttons (Red) - Light Theme */
        [data-theme="light"] .action-btn.warning {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25)),
            rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #dc2626;
        }
        
        [data-theme="light"] .action-btn.warning:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.35)),
            rgba(255, 255, 255, 0.7);
          box-shadow: 
            0 6px 28px rgba(239, 68, 68, 0.25),
            0 12px 56px rgba(239, 68, 68, 0.15),
            0 0 60px rgba(239, 68, 68, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          border-color: rgba(239, 68, 68, 0.6);
        }

        /* Report Generation Section */
        .report-section {
          margin-top: 12px;
        }

        .date-range-selector {
          display: flex;
          gap: 12px;
          margin: 12px 0;
        }

        .date-input-group {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .date-input-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--menu-text);
        }

        /* Date Input - Dark Theme */
        [data-theme="dark"] .date-input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          color: var(--menu-text);
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.08) inset;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        [data-theme="dark"] .date-input:focus {
          outline: none;
          border-color: rgba(0, 122, 255, 0.5);
          box-shadow: 
            0 4px 16px rgba(0, 122, 255, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.12) inset;
        }

        [data-theme="dark"] .date-input:hover {
          border-color: rgba(255, 255, 255, 0.25);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.04) 100%),
            rgba(12, 14, 18, 0.35);
        }

        /* Date Input - Light Theme */
        [data-theme="light"] .date-input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--menu-border);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            rgba(248, 250, 252, 0.45);
          color: var(--menu-text);
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 1px 3px rgba(0, 0, 0, 0.03),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        [data-theme="light"] .date-input:focus {
          outline: none;
          border-color: rgba(0, 122, 255, 0.4);
          box-shadow: 
            0 4px 20px rgba(0, 122, 255, 0.15),
            0 8px 40px rgba(0, 122, 255, 0.1),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }

        [data-theme="light"] .date-input:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            rgba(255, 255, 255, 0.7);
          border-color: rgba(0, 122, 255, 0.3);
        }

        /* Fix calendar icon color */
        .date-input::-webkit-calendar-picker-indicator {
          cursor: pointer;
          filter: brightness(0.8);
          opacity: 0.8;
        }

        [data-theme="dark"] .date-input::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(0.8);
        }

        .date-input::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
