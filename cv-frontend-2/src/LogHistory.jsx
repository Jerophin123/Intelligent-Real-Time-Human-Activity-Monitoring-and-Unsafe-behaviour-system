import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API || `http://${window.location.hostname}:8000`;

export default function LogHistory({ isOpen, onClose, events }) {
  const [exporting, setExporting] = useState(false);

  const exportToExcel = () => {
    setExporting(true);
    
    // Create CSV content
    const headers = ["Timestamp", "Date/Time", "Camera ID", "Zone ID", "Event Type", "Details", "Allowed"];
    const csvContent = [
      headers.join(","),
      ...events.map(event => {
        const isFaceEvent = event.type === "FACE_CLASSIFIED";
        const isPPEEvent = event.type === "PPE_VIOLATION";
        const isAllowed = event.allowed === true;
        let eventType = event.type || "ZONE_ALERT";
        let details = event.label || "Intrusion";
        
        if (isFaceEvent) {
          eventType = isAllowed ? "Authorized" : "Unauthorized";
          details = isAllowed ? event.class_name : "Unknown person";
        } else if (event.type === "FREEZE_ALERT") {
          eventType = "Freeze";
          details = `Stationary ${event.seconds_still}s`;
        } else if (isPPEEvent) {
          eventType = "PPE Violation";
          details = `Missing: ${event.missing_ppe || "PPE"}`;
        }
        
        return [
          event.timestamp,
          event.human_time,
          event.cam_id,
          event.zone_id,
          eventType,
          details,
          isFaceEvent ? (isAllowed ? "Yes" : "No") : "N/A"
        ].join(",");
      })
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `camera_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setExporting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="log-overlay">
      <div className="log-modal">
        <div className="log-header">
          <h2>📋 Log History</h2>
          <div className="log-actions">
            <button 
              className="btn export-btn" 
              onClick={exportToExcel}
              disabled={exporting}
            >
              {exporting ? "Exporting..." : "📊 Export to Excel"}
            </button>
            <button className="btn close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        
        <div className="log-content">
          {events.length === 0 ? (
            <div className="empty-logs">No logs available</div>
          ) : (
            <div className="log-table">
              <table>
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Camera</th>
                    <th>Zone</th>
                    <th>Event Type</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => {
                    const isFaceEvent = event.type === "FACE_CLASSIFIED";
                    const isPPEEvent = event.type === "PPE_VIOLATION";
                    const isAllowed = event.allowed === true;
                    let eventType = event.type || "ZONE_ALERT";
                    let details = event.label || "Intrusion";
                    
                    if (isFaceEvent) {
                      eventType = isAllowed ? "✅ Authorized" : "⚠️ Unauthorized";
                      details = isAllowed ? event.class_name : "Unknown person";
                    } else if (event.type === "FREEZE_ALERT") {
                      eventType = "⏸️ Freeze";
                      details = `Stationary ${event.seconds_still}s`;
                    } else if (isPPEEvent) {
                      eventType = "🦺 PPE Violation";
                      details = `Missing: ${event.missing_ppe || "PPE"}`;
                    }
                    
                    return (
                      <tr key={index} style={{ 
                        background: isFaceEvent && isAllowed ? 'rgba(34, 197, 94, 0.05)' : 
                                   isFaceEvent && !isAllowed ? 'rgba(245, 158, 11, 0.05)' : 
                                   isPPEEvent ? 'rgba(255, 152, 0, 0.05)' :
                                   'transparent'
                      }}>
                        <td>{event.human_time}</td>
                        <td className="camera-cell">{event.cam_id}</td>
                        <td>{event.zone_id}</td>
                        <td style={{ fontWeight: 600 }}>{eventType}</td>
                        <td>{details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .log-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(12px);
          animation: fadeIn 0.2s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .log-modal {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 20px;
          width: 90%;
          max-width: 1200px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 70px rgba(0,0,0,0.7);
          animation: slideUp 0.3s ease;
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
        
        .log-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 28px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, #0f121a, #0d1017);
          border-radius: 20px 20px 0 0;
        }
        
        .log-header h2 {
          margin: 0;
          color: var(--text);
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        
        .log-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .btn {
          appearance: none;
          background: #1b1f2a;
          color: var(--text);
          border: 1px solid var(--border);
          padding: 10px 18px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.2px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        
        .btn:hover {
          transform: translateY(-2px);
          border-color: var(--brand);
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        }
        
        .btn:active {
          transform: translateY(0);
        }
        
        .export-btn {
          background: linear-gradient(135deg, var(--brand-2), #10b981);
          border-color: var(--brand-2);
          color: white;
        }
        
        .export-btn:hover {
          background: linear-gradient(135deg, #10b981, var(--brand-2));
          box-shadow: 0 0 0 3px rgba(52,211,153,.2);
          border-color: var(--brand-2);
        }
        
        .close-btn {
          background: var(--warn);
          border-color: var(--warn);
          color: white;
          padding: 10px 14px;
          font-size: 18px;
        }
        
        .close-btn:hover {
          background: #dc2626;
          box-shadow: 0 0 0 3px rgba(239,68,68,.2);
          border-color: var(--warn);
        }
        
        .log-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .log-table {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }
        
        .log-table::-webkit-scrollbar {
          width: 8px;
        }
        
        .log-table::-webkit-scrollbar-track {
          background: var(--card);
        }
        
        .log-table::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, var(--brand), var(--brand-2));
          border-radius: 4px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        th {
          background: #0f1217;
          color: var(--text-dim);
          font-weight: 600;
          text-align: left;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        tbody tr {
          transition: background 0.2s ease, transform 0.1s ease;
        }
        
        tbody tr:hover {
          background: rgba(96, 165, 250, 0.08);
        }
        
        td {
          padding: 16px 24px;
          border-bottom: 1px solid rgba(27, 32, 48, 0.5);
          font-size: 14px;
        }
        
        .camera-cell {
          font-weight: 700;
          color: var(--warn);
          letter-spacing: 0.3px;
        }
        
        .empty-logs {
          text-align: center;
          padding: 80px 20px;
          color: var(--text-dim);
          font-size: 16px;
          letter-spacing: 0.3px;
        }
        
        @media (max-width: 768px) {
          .log-modal {
            width: 95%;
            max-height: 90vh;
            border-radius: 16px;
          }
          
          .log-header {
            flex-direction: column;
            gap: 16px;
            align-items: stretch;
            padding: 20px;
            border-radius: 16px 16px 0 0;
          }
          
          .log-actions {
            justify-content: space-between;
          }
          
          th, td {
            padding: 12px 16px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}
