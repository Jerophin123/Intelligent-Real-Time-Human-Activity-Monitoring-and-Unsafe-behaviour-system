import { useState, useMemo } from "react";

const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API || `http://${window.location.hostname}:8000`;

export default function EventsDialog({ isOpen, onClose, events }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const itemsPerPage = 50;

  // Filter and search events
  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter(e => {
        if (filterType === "authorized") return e.type === "FACE_CLASSIFIED" && e.allowed === true;
        if (filterType === "unauthorized") return e.type === "FACE_CLASSIFIED" && e.allowed === false;
        if (filterType === "intrusion") return e.type === "ZONE_ALERT";
        if (filterType === "freeze") return e.type === "FREEZE_ALERT";
        if (filterType === "ppe") return e.type === "PPE_VIOLATION";
        return true;
      });
    }

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.cam_id?.toLowerCase().includes(term) ||
        e.zone_id?.toLowerCase().includes(term) ||
        e.class_name?.toLowerCase().includes(term) ||
        e.label?.toLowerCase().includes(term) ||
        e.human_time?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [events, filterType, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(start, start + itemsPerPage);
  }, [filteredEvents, currentPage]);

  // Reset page when filters change
  const handleFilterChange = (type) => {
    setFilterType(type);
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const exportToExcel = () => {
    setExporting(true);
    
    // Create CSV content from filtered events
    const headers = ["Timestamp", "Date/Time", "Camera ID", "Zone ID", "Event Type", "Details", "Allowed"];
    const csvContent = [
      headers.join(","),
      ...filteredEvents.map(event => {
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
    link.setAttribute("download", `system_events_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => setExporting(false), 500);
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${API}/generate_report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: null,
          end_date: null
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
    <div className="events-overlay" onClick={onClose}>
      <div className="events-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="events-dialog-header">
          <h2>📊 All System Events</h2>
          <div className="header-actions">
            <button 
              className="report-btn" 
              onClick={generateReport}
              disabled={generating}
            >
              {generating ? "⏳ Generating..." : "📄 Generate Report"}
            </button>
            <button 
              className="export-btn" 
              onClick={exportToExcel}
              disabled={exporting || filteredEvents.length === 0}
            >
              {exporting ? "⏳ Exporting..." : "📥 Export to Excel"}
            </button>
            <button className="events-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Split Content Area */}
        <div className="events-content-split">
          {/* Left Panel - Filters & Stats */}
          <div className="events-left-panel">
            {/* Stats Bar */}
            <div className="events-stats">
              <div className="stat-item">
                <span className="stat-number">{events.length}</span>
                <span className="stat-label">Total Events</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{filteredEvents.length}</span>
                <span className="stat-label">Filtered</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{totalPages}</span>
                <span className="stat-label">Pages</span>
              </div>
            </div>

            {/* Filters */}
            <div className="events-filters">
              <div className="filter-group">
                <label>Filter by Type:</label>
                <div className="filter-buttons">
                  <button 
                    className={filterType === "all" ? "filter-btn active" : "filter-btn"}
                    onClick={() => handleFilterChange("all")}
                  >
                    <span className="filter-icon">📊</span>
                    <span className="filter-text">All ({events.length})</span>
                  </button>
                  <button 
                    className={filterType === "authorized" ? "filter-btn active success" : "filter-btn success"}
                    onClick={() => handleFilterChange("authorized")}
                  >
                    <span className="filter-icon">✅</span>
                    <span className="filter-text">Authorized</span>
                  </button>
                  <button 
                    className={filterType === "unauthorized" ? "filter-btn active warning" : "filter-btn warning"}
                    onClick={() => handleFilterChange("unauthorized")}
                  >
                    <span className="filter-icon">⚠️</span>
                    <span className="filter-text">Unauthorized</span>
                  </button>
                  <button 
                    className={filterType === "intrusion" ? "filter-btn active danger" : "filter-btn danger"}
                    onClick={() => handleFilterChange("intrusion")}
                  >
                    <span className="filter-icon">🚨</span>
                    <span className="filter-text">Intrusion</span>
                  </button>
                  <button 
                    className={filterType === "freeze" ? "filter-btn active info" : "filter-btn info"}
                    onClick={() => handleFilterChange("freeze")}
                  >
                    <span className="filter-icon">⏸️</span>
                    <span className="filter-text">Freeze</span>
                  </button>
                  <button 
                    className={filterType === "ppe" ? "filter-btn active ppe" : "filter-btn ppe"}
                    onClick={() => handleFilterChange("ppe")}
                  >
                    <span className="filter-icon">🦺</span>
                    <span className="filter-text">PPE Violation</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Events Grid */}
          <div className="events-right-panel">
            {/* Search Bar */}
            <div className="search-group">
              <input
                type="text"
                className="search-input"
                placeholder="🔍 Search by camera, zone, person name..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Events List */}
            <div className="events-list-container">
          {filteredEvents.length === 0 ? (
            <div className="empty-events">
              {searchTerm || filterType !== "all" 
                ? "No events match your filters" 
                : "No events recorded yet"}
            </div>
          ) : (
            <div className="events-list">
              {paginatedEvents.map((event, index) => {
                const isFaceEvent = event.type === "FACE_CLASSIFIED";
                const isFreezeEvent = event.type === "FREEZE_ALERT";
                const isPPEEvent = event.type === "PPE_VIOLATION";
                const isAllowed = event.allowed === true;
                
                let cardClass = "event-card";
                let emoji = "🚨";
                let eventType = "Zone Alert";
                let details = event.label || "Intrusion";
                
                if (isFaceEvent) {
                  if (isAllowed) {
                    cardClass = "event-card success";
                    emoji = "✅";
                    eventType = "Authorized";
                    details = event.class_name;
                  } else {
                    cardClass = "event-card warning";
                    emoji = "⚠️";
                    eventType = "Unauthorized";
                    details = "Unknown person";
                  }
                } else if (isFreezeEvent) {
                  cardClass = "event-card info";
                  emoji = "⏸️";
                  eventType = "Freeze Alert";
                  details = `Stationary ${event.seconds_still}s`;
                } else if (isPPEEvent) {
                  cardClass = "event-card ppe";
                  emoji = "🦺";
                  eventType = "PPE Violation";
                  details = `Missing: ${event.missing_ppe || "PPE"}`;
                }
                
                return (
                  <div key={index} className={cardClass}>
                    <div className="event-card-header">
                      <div className="event-emoji">{emoji}</div>
                      <div className="event-meta">
                        <div className="event-type">{eventType}</div>
                        <div className="event-time">{event.human_time}</div>
                      </div>
                    </div>
                    <div className="event-card-body">
                      <div className="event-detail">
                        <span className="detail-label">Camera:</span>
                        <span className="detail-value">{event.cam_id}</span>
                      </div>
                      <div className="event-detail">
                        <span className="detail-label">Zone:</span>
                        <span className="detail-value">{event.zone_id}</span>
                      </div>
                      <div className="event-detail">
                        <span className="detail-label">Details:</span>
                        <span className="detail-value">{details}</span>
                      </div>
                      {isPPEEvent && (
                        <>
                          {event.has_helmet !== undefined && (
                            <div className="event-detail">
                              <span className="detail-label">Helmet:</span>
                              <span className="detail-value">{event.has_helmet ? "✓ Yes" : "✗ No"}</span>
                            </div>
                          )}
                          {event.has_vest !== undefined && (
                            <div className="event-detail">
                              <span className="detail-label">Vest:</span>
                              <span className="detail-value">{event.has_vest ? "✓ Yes" : "✗ No"}</span>
                            </div>
                          )}
                        </>
                      )}
                      {isFaceEvent && event.image_path && (
                        <div className="event-detail">
                          <span className="detail-label">Image:</span>
                          <span className="detail-value small">{event.image_path.split('/').pop()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="events-pagination">
                <button 
                  className="page-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Previous
                </button>
                <div className="page-info">
                  Page {currentPage} of {totalPages}
                  <span className="page-count">
                    ({(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredEvents.length)} of {filteredEvents.length})
                  </span>
                </div>
                <button 
                  className="page-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="events-dialog-footer">
          <button className="footer-btn" onClick={onClose}>Close</button>
        </div>
      </div>

      <style>{`
        /* Real Liquid Glass Theme Variables - Dark (More Translucent) */
        [data-theme="dark"] {
          --dialog-overlay: rgba(0, 0, 0, 0.75);
          --dialog-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(6, 8, 12, 0.15);
          --dialog-header-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%), linear-gradient(180deg, rgba(10, 12, 16, 0.4), rgba(8, 10, 14, 0.3));
          --dialog-border: rgba(255, 255, 255, 0.18);
          --dialog-text: #ffffff;
          --dialog-text-secondary: #a1a1aa;
          --dialog-shadow: 0 30px 100px rgba(0,0,0,0.9), 0 20px 60px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.6) inset;
          --card-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(12, 14, 18, 0.25);
          --card-hover: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(15, 18, 22, 0.4);
          --input-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(15, 18, 22, 0.3);
          --input-border: rgba(255, 255, 255, 0.15);
        }

        /* Real Liquid Glass Theme Variables - Light (More Translucent) */
        [data-theme="light"] {
          --dialog-overlay: rgba(255, 255, 255, 0.65);
          --dialog-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%), rgba(248, 250, 252, 0.35);
          --dialog-header-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(248, 248, 250, 0.5));
          --dialog-border: rgba(0, 0, 0, 0.15);
          --dialog-text: #1d1d1f;
          --dialog-text-secondary: #6e6e73;
          --dialog-shadow: 0 30px 80px rgba(0,0,0,0.18), 0 20px 50px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,1) inset, 0 -1px 0 rgba(0,0,0,0.08) inset;
          --card-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%), rgba(248, 250, 252, 0.45);
          --card-hover: linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.5) 100%), rgba(255, 255, 255, 0.6);
          --input-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%), rgba(248, 250, 252, 0.4);
          --input-border: rgba(0, 0, 0, 0.12);
        }

        /* Overlay */
        .events-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--dialog-overlay);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          z-index: 2000;
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

        /* Real Liquid Glass Dialog Container */
        [data-theme="dark"] .events-dialog {
          background: var(--dialog-bg);
          backdrop-filter: blur(50px) saturate(200%) brightness(1.1);
          -webkit-backdrop-filter: blur(50px) saturate(200%) brightness(1.1);
          border: 1px solid var(--dialog-border);
          border-radius: 24px;
          width: 100%;
          max-width: 1400px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--dialog-shadow);
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: all 0.3s ease;
        }

        [data-theme="light"] .events-dialog {
          background: var(--dialog-bg);
          backdrop-filter: blur(50px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(50px) saturate(180%) brightness(1.05);
          border: 1px solid var(--dialog-border);
          border-radius: 24px;
          width: 100%;
          max-width: 1400px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--dialog-shadow);
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: all 0.3s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Dialog Header */
        .events-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 28px;
          border-bottom: 1px solid var(--dialog-border);
          background: var(--dialog-header-bg);
          border-radius: 24px 24px 0 0;
          transition: all 0.3s ease;
        }

        .events-dialog-header h2 {
          margin: 0;
          color: var(--dialog-text);
          font-size: 24px;
          font-weight: 700;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        /* Liquid Glass Export Button - Dark Theme */
        [data-theme="dark"] .export-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(16, 185, 129, 0.6), rgba(5, 150, 105, 0.5)),
            linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.25)),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(16, 185, 129, 0.5);
          color: white;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 18px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          box-shadow: 
            0 8px 32px rgba(16, 185, 129, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }

        [data-theme="dark"] .export-btn:hover:not(:disabled) {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.7)),
            linear-gradient(135deg, rgba(16, 185, 129, 0.4), rgba(5, 150, 105, 0.35)),
            rgba(8, 10, 14, 0.35);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 12px 40px rgba(16, 185, 129, 0.6),
            0 20px 60px rgba(16, 185, 129, 0.3),
            0 0 60px rgba(16, 185, 129, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(16, 185, 129, 0.8);
        }

        [data-theme="dark"] .export-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Liquid Glass Export Button - Light Theme */
        [data-theme="light"] .export-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.25)),
            rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(16, 185, 129, 0.4);
          color: #047857;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 18px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 4px 20px rgba(16, 185, 129, 0.15),
            0 8px 40px rgba(16, 185, 129, 0.1),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 0 1px rgba(16, 185, 129, 0.1);
          position: relative;
          overflow: hidden;
        }

        [data-theme="light"] .export-btn:hover:not(:disabled) {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            linear-gradient(135deg, rgba(16, 185, 129, 0.4), rgba(5, 150, 105, 0.35)),
            rgba(255, 255, 255, 0.7);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 6px 28px rgba(16, 185, 129, 0.25),
            0 12px 56px rgba(16, 185, 129, 0.15),
            0 0 60px rgba(16, 185, 129, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          border-color: rgba(16, 185, 129, 0.6);
        }

        [data-theme="light"] .export-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Liquid Glass Report Button - Dark Theme */
        [data-theme="dark"] .report-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.5)),
            linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.25)),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: white;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 18px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          box-shadow: 
            0 8px 32px rgba(59, 130, 246, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }

        [data-theme="dark"] .report-btn:hover:not(:disabled) {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.7)),
            linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(37, 99, 235, 0.35)),
            rgba(8, 10, 14, 0.35);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 12px 48px rgba(59, 130, 246, 0.6),
            0 20px 80px rgba(59, 130, 246, 0.4),
            0 0 80px rgba(59, 130, 246, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.2) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(59, 130, 246, 0.8);
        }

        [data-theme="dark"] .report-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Liquid Glass Report Button - Light Theme */
        [data-theme="light"] .report-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.25)),
            rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #1e40af;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 18px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 4px 20px rgba(59, 130, 246, 0.25),
            0 8px 40px rgba(59, 130, 246, 0.15),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 0 1px rgba(59, 130, 246, 0.1);
          position: relative;
          overflow: hidden;
        }

        [data-theme="light"] .report-btn:hover:not(:disabled) {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(37, 99, 235, 0.35)),
            rgba(255, 255, 255, 0.7);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 6px 28px rgba(59, 130, 246, 0.35),
            0 12px 56px rgba(59, 130, 246, 0.25),
            0 0 60px rgba(59, 130, 246, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          border-color: rgba(59, 130, 246, 0.6);
        }

        [data-theme="light"] .report-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Liquid Glass Close Button - Dark Theme */
        [data-theme="dark"] .events-close {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(220, 38, 38, 0.5)),
            linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25)),
            rgba(8, 10, 14, 0.25);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 8px 14px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 700;
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          box-shadow: 
            0 8px 32px rgba(239, 68, 68, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
        }

        [data-theme="dark"] .events-close:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.7)),
            linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.35)),
            rgba(8, 10, 14, 0.35);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 12px 40px rgba(239, 68, 68, 0.6),
            0 20px 60px rgba(239, 68, 68, 0.3),
            0 0 60px rgba(239, 68, 68, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(239, 68, 68, 0.8);
        }

        /* Liquid Glass Close Button - Light Theme */
        [data-theme="light"] .events-close {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25)),
            rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #dc2626;
          font-size: 20px;
          cursor: pointer;
          padding: 8px 14px;
          border-radius: 10px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 700;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 4px 20px rgba(239, 68, 68, 0.15),
            0 8px 40px rgba(239, 68, 68, 0.1),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 0 1px rgba(239, 68, 68, 0.1);
        }

        [data-theme="light"] .events-close:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.35)),
            rgba(255, 255, 255, 0.7);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 6px 28px rgba(239, 68, 68, 0.25),
            0 12px 56px rgba(239, 68, 68, 0.15),
            0 0 60px rgba(239, 68, 68, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          border-color: rgba(239, 68, 68, 0.6);
        }

        /* Split Content Layout */
        .events-content-split {
          display: flex;
          gap: 20px;
          flex: 1;
          overflow: hidden;
        }

        .events-left-panel {
          width: 280px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: visible;
        }

        .events-right-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow: hidden;
        }

        .events-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          padding: 12px;
          margin-top: 16px;
          margin-left: 12px;
          margin-right: 12px;
          border-bottom: none;
          border-radius: 12px;
          background: var(--card-bg);
          transition: all 0.3s ease;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(0, 122, 255, 0.05);
          border: 1px solid rgba(0, 122, 255, 0.1);
          transition: all 0.3s ease;
        }

        .stat-item:hover {
          background: rgba(0, 122, 255, 0.1);
          border-color: rgba(0, 122, 255, 0.2);
          transform: translateY(-2px);
        }

        .stat-number {
          font-size: 20px;
          font-weight: 700;
          color: #007AFF;
        }

        .stat-label {
          font-size: 9px;
          color: var(--dialog-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: center;
        }

        .events-filters {
          padding: 16px;
          margin-left: 12px;
          margin-right: 12px;
          border-bottom: none;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--card-bg);
          transition: all 0.3s ease;
        }

        .filter-group label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--dialog-text);
          margin-bottom: 12px;
        }

        .filter-buttons {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        /* Real Liquid Glass Filter Buttons (Icon on Top) */
        [data-theme="dark"] .filter-btn {
          padding: 12px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: var(--card-bg);
          color: var(--dialog-text);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-size: 12px;
          font-weight: 600;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 65px;
          backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.08) inset;
        }

        .filter-icon {
          font-size: 24px;
          line-height: 1;
          display: block;
        }

        .filter-text {
          font-size: 11px;
          line-height: 1.2;
          display: block;
        }

        [data-theme="dark"] .filter-btn:hover {
          transform: translateY(-2px) scale(1.02);
          background: var(--card-hover);
          border-color: rgba(0, 122, 255, 0.5);
          box-shadow: 
            0 4px 12px rgba(0, 122, 255, 0.3),
            0 2px 8px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.12) inset,
            0 0 20px rgba(0, 122, 255, 0.15);
        }

        [data-theme="light"] .filter-btn {
          padding: 12px 12px;
          border-radius: 10px;
          border: 1px solid var(--dialog-border);
          background: var(--card-bg);
          color: var(--dialog-text);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-size: 12px;
          font-weight: 600;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 65px;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 1px 3px rgba(0, 0, 0, 0.03),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }

        [data-theme="light"] .filter-btn:hover {
          transform: translateY(-2px) scale(1.02);
          background: var(--card-hover);
          border-color: rgba(0, 122, 255, 0.4);
          box-shadow: 
            0 4px 12px rgba(0, 122, 255, 0.25),
            0 2px 8px rgba(0, 0, 0, 0.08),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 20px rgba(0, 122, 255, 0.15);
        }

        .filter-btn.active {
          border-width: 2px;
        }

        .filter-btn.success {
          border-color: #10b981;
          color: #10b981;
        }

        .filter-btn.success.active {
          background: #10b981;
          color: white;
        }

        .filter-btn.warning {
          border-color: #f59e0b;
          color: #f59e0b;
        }

        .filter-btn.warning.active {
          background: #f59e0b;
          color: white;
        }

        .filter-btn.danger {
          border-color: #ef4444;
          color: #ef4444;
        }

        .filter-btn.danger.active {
          background: #ef4444;
          color: white;
        }

        .filter-btn.info {
          border-color: #818cf8;
          color: #818cf8;
        }

        .filter-btn.info.active {
          background: #818cf8;
          color: white;
        }

        .filter-btn.ppe {
          border-color: #ff9800;
          color: #ff9800;
        }

        .filter-btn.ppe.active {
          background: #ff9800;
          color: white;
        }

        /* Search Bar on Right Panel */
        .events-right-panel > .search-group {
          padding: 16px 16px 16px 16px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--dialog-text);
          font-size: 14px;
          outline: none;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
        }

        .search-input:hover {
          border-color: rgba(0, 122, 255, 0.3);
          background: var(--card-hover);
        }

        .search-input:focus {
          border-color: #007AFF;
          box-shadow: 0 0 0 3px rgba(0,122,255,.2);
          transform: translateY(-1px);
        }

        .search-input::placeholder {
          color: var(--dialog-text-secondary);
        }

        .events-list-container {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .events-list-container::-webkit-scrollbar {
          width: 10px;
        }

        .events-list-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .events-list-container::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #007AFF, #5856D6);
          border-radius: 5px;
        }

        [data-theme="light"] .events-list-container::-webkit-scrollbar-thumb {
          background: rgba(0, 122, 255, 0.3);
        }

        .events-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          padding: 16px;
        }

        /* Real Liquid Glass Event Cards */
        [data-theme="dark"] .event-card {
          background: var(--card-bg);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-left: 4px solid #ef4444;
          border-radius: 12px;
          padding: 16px;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.1) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset;
        }

        [data-theme="dark"] .event-card:hover {
          transform: translateY(-3px) scale(1.01);
          background: var(--card-hover);
          border-color: rgba(0, 122, 255, 0.5);
          box-shadow: 
            0 8px 24px rgba(0, 122, 255, 0.3),
            0 4px 12px rgba(0, 0, 0, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset,
            0 0 30px rgba(0, 122, 255, 0.15);
        }

        [data-theme="light"] .event-card {
          background: var(--card-bg);
          border: 1px solid var(--dialog-border);
          border-left: 4px solid #ef4444;
          border-radius: 12px;
          padding: 16px;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.08),
            0 2px 6px rgba(0, 0, 0, 0.04),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 -1px 0 rgba(0, 0, 0, 0.05) inset;
        }

        [data-theme="light"] .event-card:hover {
          transform: translateY(-3px) scale(1.01);
          background: var(--card-hover);
          border-color: rgba(0, 122, 255, 0.4);
          box-shadow: 
            0 8px 24px rgba(0, 122, 255, 0.25),
            0 4px 12px rgba(0, 0, 0, 0.1),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 -1px 0 rgba(0, 0, 0, 0.08) inset,
            0 0 30px rgba(0, 122, 255, 0.15);
        }

        .event-card.success {
          border-left-color: #10b981;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02));
        }

        [data-theme="light"] .event-card.success {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04));
        }

        .event-card.warning {
          border-left-color: #f59e0b;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.02));
        }

        [data-theme="light"] .event-card.warning {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04));
        }

        .event-card.info {
          border-left-color: #818cf8;
          background: linear-gradient(135deg, rgba(129, 140, 248, 0.08), rgba(129, 140, 248, 0.02));
        }

        [data-theme="light"] .event-card.info {
          background: linear-gradient(135deg, rgba(129, 140, 248, 0.12), rgba(129, 140, 248, 0.04));
        }

        .event-card.ppe {
          border-left-color: #ff9800;
          background: linear-gradient(135deg, rgba(255, 152, 0, 0.08), rgba(255, 152, 0, 0.02));
        }

        [data-theme="light"] .event-card.ppe {
          background: linear-gradient(135deg, rgba(255, 152, 0, 0.12), rgba(255, 152, 0, 0.04));
        }

        .event-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .event-emoji {
          font-size: 28px;
        }

        .event-meta {
          flex: 1;
        }

        .event-type {
          font-weight: 700;
          font-size: 15px;
          color: var(--dialog-text);
          margin-bottom: 2px;
        }

        .event-time {
          font-size: 12px;
          color: var(--dialog-text-secondary);
        }

        .event-card-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .event-detail {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .detail-label {
          font-size: 12px;
          color: var(--dialog-text-secondary);
          font-weight: 600;
        }

        .detail-value {
          font-size: 13px;
          color: var(--dialog-text);
          font-weight: 500;
          text-align: right;
        }

        .detail-value.small {
          font-size: 11px;
          color: var(--dialog-text-secondary);
        }

        .empty-events {
          text-align: center;
          padding: 80px 20px;
          color: var(--dialog-text-secondary);
          font-size: 16px;
        }

        .events-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          margin: 16px;
          border-radius: 12px;
          border-top: none;
          background: var(--card-bg);
          transition: all 0.3s ease;
          flex-shrink: 0;
        }

        /* Liquid Glass Pagination Buttons - Dark Theme */
        [data-theme="dark"] .page-btn {
          padding: 10px 20px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          color: var(--dialog-text);
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.08) inset;
        }

        [data-theme="dark"] .page-btn:hover:not(:disabled) {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.6), rgba(0, 100, 220, 0.5)),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(0, 100, 220, 0.25)),
            rgba(8, 10, 14, 0.25);
          border-color: rgba(0, 122, 255, 0.5);
          color: white;
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 8px 32px rgba(0, 122, 255, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 0 40px rgba(0, 122, 255, 0.3);
        }

        [data-theme="dark"] .page-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        /* Liquid Glass Pagination Buttons - Light Theme */
        [data-theme="light"] .page-btn {
          padding: 10px 20px;
          border-radius: 10px;
          border: 1px solid var(--dialog-border);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            rgba(248, 250, 252, 0.45);
          color: var(--dialog-text);
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 1px 3px rgba(0, 0, 0, 0.03),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }

        [data-theme="light"] .page-btn:hover:not(:disabled) {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(0, 100, 220, 0.25)),
            rgba(255, 255, 255, 0.5);
          border-color: rgba(0, 122, 255, 0.4);
          color: #0064dc;
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 4px 20px rgba(0, 122, 255, 0.15),
            0 8px 40px rgba(0, 122, 255, 0.1),
            0 0 40px rgba(0, 122, 255, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }

        [data-theme="light"] .page-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .page-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-weight: 600;
          color: var(--dialog-text);
        }

        .page-count {
          font-size: 12px;
          color: var(--dialog-text-secondary);
          font-weight: 400;
        }

        .events-dialog-footer {
          padding: 16px 28px;
          border-top: 1px solid var(--dialog-border);
          display: flex;
          justify-content: flex-end;
          background: var(--dialog-header-bg);
          border-radius: 0 0 24px 24px;
          transition: all 0.3s ease;
        }

        /* Liquid Glass Footer Buttons - Dark Theme */
        [data-theme="dark"] .footer-btn {
          padding: 10px 24px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          color: var(--dialog-text);
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          font-size: 14px;
          backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.05);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.08) inset;
        }

        [data-theme="dark"] .footer-btn:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.6), rgba(0, 100, 220, 0.5)),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(0, 100, 220, 0.25)),
            rgba(8, 10, 14, 0.25);
          border-color: rgba(0, 122, 255, 0.5);
          color: white;
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 8px 32px rgba(0, 122, 255, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 0 40px rgba(0, 122, 255, 0.3);
        }

        /* Liquid Glass Footer Buttons - Light Theme */
        [data-theme="light"] .footer-btn {
          padding: 10px 24px;
          border-radius: 10px;
          border: 1px solid var(--dialog-border);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            rgba(248, 250, 252, 0.45);
          color: var(--dialog-text);
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 600;
          font-size: 14px;
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 1px 3px rgba(0, 0, 0, 0.03),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }

        [data-theme="light"] .footer-btn:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(0, 100, 220, 0.25)),
            rgba(255, 255, 255, 0.5);
          border-color: rgba(0, 122, 255, 0.4);
          color: #0064dc;
          transform: translateY(-4px) scale(1.02);
          box-shadow: 
            0 4px 20px rgba(0, 122, 255, 0.15),
            0 8px 40px rgba(0, 122, 255, 0.1),
            0 0 40px rgba(0, 122, 255, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
        }

        @media (max-width: 768px) {
          .events-dialog {
            max-width: 95%;
            max-height: 95vh;
          }

          .events-dialog-header {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
          }

          .header-actions {
            width: 100%;
            justify-content: space-between;
            flex-wrap: wrap;
          }

          .report-btn,
          .export-btn {
            flex: 1;
            justify-content: center;
            min-width: 140px;
          }

          .events-content-split {
            flex-direction: column;
          }

          .events-left-panel {
            width: 100%;
          }

          .events-pagination {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

