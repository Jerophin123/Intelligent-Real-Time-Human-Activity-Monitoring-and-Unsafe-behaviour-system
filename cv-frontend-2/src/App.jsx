import { useEffect, useMemo, useRef, useState } from "react";
import MenuWindow from "./MenuWindow";
import EventsDialog from "./EventsDialog";
import AdminPanel from "./AdminPanel";

const API = import.meta.env.VITE_API || `http://${window.location.hostname}:8000`;

export default function App() {
  // ---- logical slots (from --cams keys) ----
  const [camIds, setCamIds] = useState([]);
  const [devices, setDevices] = useState([]);
  const [binding, setBinding] = useState({});
  const [cams, setCams] = useState([]);
  const [activeCamIds, setActiveCamIds] = useState([]); // Store camera IDs for status check
  const [selected, setSelected] = useState("");

  const [stats, setStats] = useState({ count: 0, last: "-" });
  const [events, setEvents] = useState([]);
  const [loadingCams, setLoadingCams] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState("grid"); // 'single' | 'grid'
  const [activating, setActivating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEventsDialog, setShowEventsDialog] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const audioRef = useRef(null);
  const freezeAudioRef = useRef(null);

  // Theme toggle handler
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // --------- data loaders ----------
  const loadCamIds = () => {
    fetch(`${API}/cam_ids`)
      .then((r) => r.json())
      .then((d) => {
        const ids = d?.cam_ids || [];
        console.log('[Frontend] Loaded camera IDs from backend:', ids);
        setCamIds(ids);
        setBinding((prev) => {
          const copy = { ...prev };
          ids.forEach((id) => {
            if (!(id in copy)) copy[id] = "";
          });
          return copy;
        });
      })
      .catch((err) => {
        console.error('[Frontend] Failed to load camera IDs:', err);
        setCamIds([]);
      });
  };

  const loadDevices = () => {
    fetch(`${API}/devices`)
      .then((r) => r.json())
      .then((d) => setDevices(d?.devices || []))
      .catch(() => setDevices([]));
  };

  const loadActiveCams = () => {
    fetch(`${API}/cams`)
      .then((r) => r.json())
      .then((d) => {
        const active = d?.cams || [];
        const activeIds = d?.cam_ids || []; // Extract camera IDs for status check
        setCams(active);
        setActiveCamIds(activeIds); // Store camera IDs
        if (active.length && !selected) setSelected(active[0]);
      })
      .catch(() => {
        setCams([]);
        setActiveCamIds([]);
      })
      .finally(() => setLoadingCams(false));
  };

  const activateCameras = () => {
    setActivating(true);
    const map = {};
    Object.entries(binding).forEach(([camId, devName]) => {
      if (devName) map[camId] = devName;
    });

    fetch(`${API}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map }),
    })
      .then((r) => {
        if (r.ok) setTimeout(loadActiveCams, 500);
      })
      .catch(() => {})
      .finally(() => setActivating(false));
  };

  useEffect(() => {
    loadCamIds();
    loadDevices();
    loadActiveCams();
  }, []);

  useEffect(() => {
    fetch(`${API}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});

    const es = new EventSource(`${API}/events`);
    let lastAudioTime = 0;
    let lastFreezeTime = 0;
    const AUDIO_COOLDOWN = 3000;
    
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setEvents((prev) => [data, ...prev]);
      
      const now = Date.now();
      
      // Play beep_cameraA.wav for FREEZE_ALERT
      if (data.type === "FREEZE_ALERT") {
        if (freezeAudioRef.current && now - lastFreezeTime >= AUDIO_COOLDOWN) {
          freezeAudioRef.current.currentTime = 0;
          freezeAudioRef.current.play().catch(() => {});
          lastFreezeTime = now;
        }
      }
      // Play default beep for other alerts
      else if (data.type === "ZONE_ALERT" || data.type === "PPE_VIOLATION") {
        if (audioRef.current && now - lastAudioTime >= AUDIO_COOLDOWN) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
          lastAudioTime = now;
        }
      }
      
      setStats(prev => ({ ...prev, count: prev.count + 1, last: data.human_time || prev.last }));
    };

    return () => es.close();
  }, []);

  const videoSrc = useMemo(
    () => (selected ? `${API}/video?cam=${encodeURIComponent(selected)}` : ""),
    [selected]
  );

  const recentEvents = useMemo(() => events.slice(0, 20), [events]);

  return (
    <>
      <style>{`
        /* Theme Variables */
        :root {
          --transition-theme: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        /* Apple-Inspired Liquid Glass Design - Preserving Exact Layout */
        
        :root {
          /* Liquid Glass Colors */
          --glass-ultra-light: rgba(255, 255, 255, 0.15);
          --glass-light: rgba(255, 255, 255, 0.12);
          --glass-medium: rgba(255, 255, 255, 0.08);
          --glass-dark: rgba(255, 255, 255, 0.05);
          --glass-border: rgba(255, 255, 255, 0.18);
          --glass-hover: rgba(255, 255, 255, 0.2);
          
          /* Apple System Colors */
          --primary: #007AFF;
          --primary-hover: #0051D5;
          --secondary: #5AC8FA;
          --success: #34C759;
          --warning: #FF9500;
          --danger: #FF3B30;
          --purple: #AF52DE;
          --pink: #FF2D55;
          
          /* Text Colors */
          --text-primary: rgba(255, 255, 255, 0.95);
          --text-secondary: rgba(255, 255, 255, 0.75);
          --text-tertiary: rgba(255, 255, 255, 0.55);
          
          /* Shadows */
          --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.08);
          --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.12);
          --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.16);
          --shadow-lg: 0 16px 32px rgba(0, 0, 0, 0.2);
          --shadow-xl: 0 24px 48px rgba(0, 0, 0, 0.25);
          
          /* Blur Levels */
          --blur-sm: blur(10px);
          --blur-md: blur(20px);
          --blur-lg: blur(30px);
          --blur-xl: blur(40px);
          
          /* Compatibility aliases for existing code */
          --bg: #0a0c10;
          --panel: rgba(255, 255, 255, 0.08);
          --card: rgba(255, 255, 255, 0.05);
          --border: rgba(255, 255, 255, 0.18);
          --text: rgba(255, 255, 255, 0.95);
          --text-dim: rgba(255, 255, 255, 0.55);
          --brand: #007AFF;
          --brand-2: #5AC8FA;
          --ok: #34C759;
          --warn: #FF3B30;
          --amber: #FF9500;
          --shadow: 0 8px 30px rgba(0,0,0,.35);
        }
        
        body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          overflow-x: hidden;
        }
        
        /* Dark Theme */
        .rzm-root[data-theme="dark"] {
          height: 100vh;
          width: 100%;
          color: #ffffff;
          background:
            radial-gradient(circle at 20% 30%, rgba(0, 82, 204, 0.04) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(120, 50, 160, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(60, 140, 200, 0.02) 0%, transparent 70%),
            linear-gradient(135deg, #050608 0%, #0a0c10 50%, #0e1015 100%);
          background-attachment: fixed;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: var(--transition-theme);
        }

        /* Light Theme */
        .rzm-root[data-theme="light"] {
          height: 100vh;
          width: 100%;
          color: #1d1d1f;
          background:
            radial-gradient(circle at 20% 30%, rgba(0, 122, 255, 0.06) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(175, 82, 222, 0.04) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(90, 200, 250, 0.03) 0%, transparent 70%),
            linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 50%, #d1d1d6 100%);
          background-attachment: fixed;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: var(--transition-theme);
        }
        
        /* Floating Liquid Blobs - Dark Theme */
        .rzm-root[data-theme="dark"]::before {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(0, 82, 204, 0.05) 0%, transparent 70%);
          border-radius: 50%;
          top: -300px;
          right: -200px;
          animation: float 20s ease-in-out infinite, blob 15s ease-in-out infinite;
          pointer-events: none;
        }
        
        .rzm-root[data-theme="dark"]::after {
          content: '';
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(120, 50, 160, 0.04) 0%, transparent 70%);
          border-radius: 50%;
          bottom: -250px;
          left: -150px;
          animation: float 25s ease-in-out infinite reverse, blob 20s ease-in-out infinite;
          pointer-events: none;
        }

        /* Floating Liquid Blobs - Light Theme */
        .rzm-root[data-theme="light"]::before {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(0, 122, 255, 0.08) 0%, transparent 70%);
          border-radius: 50%;
          top: -300px;
          right: -200px;
          animation: float 20s ease-in-out infinite, blob 15s ease-in-out infinite;
          pointer-events: none;
        }
        
        .rzm-root[data-theme="light"]::after {
          content: '';
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(175, 82, 222, 0.06) 0%, transparent 70%);
          border-radius: 50%;
          bottom: -250px;
          left: -150px;
          animation: float 25s ease-in-out infinite reverse, blob 20s ease-in-out infinite;
          pointer-events: none;
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-30px) scale(1.1); }
        }
        
        @keyframes blob {
          0%, 100% { border-radius: 45% 55% 60% 40% / 55% 45% 55% 45%; }
          25% { border-radius: 55% 45% 40% 60% / 45% 55% 45% 55%; }
          50% { border-radius: 40% 60% 55% 45% / 60% 40% 60% 40%; }
          75% { border-radius: 60% 40% 45% 55% / 40% 60% 40% 60%; }
        }

        /* Frosted Glass Header - Dark Theme */
        [data-theme="dark"] .hdr {
          flex-shrink: 0;
          z-index: 100;
          width: 100%;
          backdrop-filter: blur(40px) saturate(200%);
          -webkit-backdrop-filter: blur(40px) saturate(200%);
          background: linear-gradient(180deg, rgba(6, 7, 9, 0.75) 0%, rgba(8, 9, 12, 0.65) 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.6),
            0 20px 60px rgba(0, 0, 0, 0.3), 
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          animation: slide-down 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: var(--transition-theme);
        }

        /* Frosted Glass Header - Light Theme */
        [data-theme="light"] .hdr {
          flex-shrink: 0;
          z-index: 100;
          width: 100%;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(248, 248, 250, 0.85) 100%);
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
          animation: slide-down 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          transition: var(--transition-theme);
        }
        
        @keyframes slide-down {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .hdr-inner {
          max-width: 100%;
          margin: 0 auto;
          padding: 10px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        /* Brand Logo - Apple Style */
        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
          animation: fade-in 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s both;
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .brand-logo {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--purple) 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 18px;
          color: white;
          box-shadow: 
            0 4px 16px rgba(0, 122, 255, 0.4),
            0 8px 32px rgba(0, 122, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .brand-logo::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transition: left 0.5s;
        }
        
        .brand-logo:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 
            0 6px 20px rgba(0, 122, 255, 0.5),
            0 12px 40px rgba(0, 122, 255, 0.3);
        }
        
        .brand-logo:hover::before {
          left: 100%;
        }
        
        .brand-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .brand-title {
          font-size: 20px;
          font-weight: 700;
          background: linear-gradient(90deg, var(--primary), var(--secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.6px;
        }
        
        .brand-subtitle {
          font-size: 10px;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.2px;
        }
        
        /* Pulsing Status Indicator */
        .pulse {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7);
          animation: pulse-ring 2s ease-in-out infinite;
        }
        
        @keyframes pulse-ring {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7);
          }
          50% {
            box-shadow: 0 0 0 12px rgba(52, 199, 89, 0);
          }
        }

        /* Glass Menu Button */
        .menu-btn, .admin-btn {
          background: rgba(12, 14, 18, 0.6);
          backdrop-filter: var(--blur-md);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
          font-size: 20px;
          cursor: pointer;
          padding: 10px;
          border-radius: 14px;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          position: relative;
          overflow: hidden;
        }
        
        .menu-btn::before, .admin-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        
        .menu-btn:hover, .admin-btn:hover {
          background: var(--glass-light);
          border-color: var(--glass-hover);
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        
        .menu-btn:hover::before, .admin-btn:hover::before {
          width: 120%;
          height: 120%;
        }
        
        .menu-btn:active, .admin-btn:active {
          transform: scale(0.95);
        }
        
        .admin-btn {
          background: rgba(0, 122, 255, 0.2);
          border-color: rgba(0, 122, 255, 0.3);
        }
        
        .admin-btn:hover {
          background: rgba(0, 122, 255, 0.3);
          border-color: rgba(0, 122, 255, 0.5);
        }

        /* Theme Toggle Button */
        .theme-toggle-btn {
          background: rgba(12, 14, 18, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
          font-size: 18px;
          cursor: pointer;
          padding: 10px;
          border-radius: 14px;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          position: relative;
          overflow: hidden;
        }

        [data-theme="light"] .theme-toggle-btn {
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(0, 0, 0, 0.12);
        }

        .theme-toggle-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0, 122, 255, 0.3), transparent);
          transform: translate(-50%, -50%);
          transition: width 0.5s ease, height 0.5s ease;
        }

        .theme-toggle-btn:hover::before {
          width: 200%;
          height: 200%;
        }

        .theme-toggle-btn:hover {
          transform: scale(1.05) rotate(15deg);
          box-shadow: 0 6px 20px rgba(0, 122, 255, 0.3);
        }

        [data-theme="light"] .theme-toggle-btn:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .theme-toggle-btn:active {
          transform: scale(0.95) rotate(-5deg);
        }

        /* Text Colors - Dark Theme */
        [data-theme="dark"] {
          --text-primary: #ffffff;
          --text-secondary: #a1a1aa;
          --text-tertiary: #71717a;
        }

        /* Text Colors - Light Theme */
        [data-theme="light"] {
          --text-primary: #1d1d1f;
          --text-secondary: #6e6e73;
          --text-tertiary: #86868b;
        }

        /* Brand Logo - Light Theme */
        [data-theme="light"] .brand-logo {
          box-shadow: 
            0 2px 12px rgba(0, 122, 255, 0.3),
            0 4px 24px rgba(0, 122, 255, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }

        /* Brand Title - Light Theme */
        [data-theme="light"] .brand-title {
          background: linear-gradient(90deg, #007AFF, #5856D6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        [data-theme="light"] .brand-subtitle {
          color: #86868b;
        }

        /* Menu Button - Light Theme */
        [data-theme="light"] .menu-btn, [data-theme="light"] .admin-btn {
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: #1d1d1f;
        }

        [data-theme="light"] .menu-btn:hover, [data-theme="light"] .admin-btn:hover {
          background: rgba(255, 255, 255, 0.9);
          border-color: rgba(0, 122, 255, 0.4);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }
        
        [data-theme="light"] .admin-btn {
          background: rgba(0, 122, 255, 0.15);
          border-color: rgba(0, 122, 255, 0.3);
        }
        
        [data-theme="light"] .admin-btn:hover {
          background: rgba(0, 122, 255, 0.25);
        }

        /* Main Content Container */
        .container {
          flex: 1;
          width: 100%;
          max-width: 100%;
          padding: 16px 32px;
          box-sizing: border-box;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .container::-webkit-scrollbar {
          width: 8px;
        }
        
        .container::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .container::-webkit-scrollbar-thumb {
          background: var(--glass-light);
          border-radius: 10px;
          backdrop-filter: var(--blur-sm);
        }

        /* Real Liquid Glass Panels - Dark Theme */
        [data-theme="dark"] .panel {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          backdrop-filter: blur(50px) saturate(200%) brightness(1.1);
          -webkit-backdrop-filter: blur(50px) saturate(200%) brightness(1.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 20px;
          padding: 14px 18px;
          box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.6),
            0 20px 80px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset,
            0 -1px 0 rgba(0, 0, 0, 0.6) inset,
            0 0 0 1px rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          animation: glass-fade-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Light Theme Panels */
        [data-theme="light"] .panel {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 20px;
          padding: 14px 18px;
          box-shadow: 
            0 4px 20px rgba(0, 0, 0, 0.08),
            0 8px 40px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 0 0 1px rgba(0, 122, 255, 0.03);
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          animation: glass-fade-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .panel::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        }
        
        @keyframes glass-fade-in {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        [data-theme="dark"] .panel:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            rgba(8, 10, 14, 0.35);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 
            0 16px 56px rgba(0, 0, 0, 0.7),
            0 28px 100px rgba(0, 0, 0, 0.4),
            0 0 80px rgba(0, 122, 255, 0.25),
            0 2px 0 rgba(255, 255, 255, 0.25) inset,
            0 -2px 0 rgba(0, 0, 0, 0.7) inset,
            0 0 0 1px rgba(255, 255, 255, 0.12);
          transform: translateY(-4px) scale(1.01);
        }

        [data-theme="light"] .panel:hover {
          border-color: rgba(0, 122, 255, 0.5);
          background: rgba(255, 255, 255, 0.75);
          box-shadow: 
            0 6px 28px rgba(0, 0, 0, 0.12),
            0 12px 56px rgba(0, 0, 0, 0.06),
            0 0 60px rgba(0, 122, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
          transform: translateY(-4px) scale(1.01);
        }
        
        .panel-header {
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          margin-bottom: 12px;
        }
        
        .panel-title {
          font-size: 16px; 
          font-weight: 700;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: -0.3px;
        }
        
        .panel-icon {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, rgba(0, 122, 255, 0.25), rgba(90, 200, 250, 0.25));
          backdrop-filter: var(--blur-sm);
          border-radius: 8px;
          border: 1px solid rgba(0, 122, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.2);
        }

        /* Configuration Controls */
        .controls {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }
        
        /* Row - Dark Theme */
        [data-theme="dark"] .row {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(8, 10, 14, 0.35);
          backdrop-filter: blur(30px) saturate(180%);
          -webkit-backdrop-filter: blur(30px) saturate(180%);
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        
        [data-theme="dark"] .row::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(0, 122, 255, 0.15), transparent);
          transition: left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        [data-theme="dark"] .row:hover {
          background: rgba(8, 10, 14, 0.5);
          border-color: rgba(0, 122, 255, 0.5);
          transform: translateX(6px) scale(1.01);
          box-shadow: 
            0 6px 20px rgba(0, 0, 0, 0.4),
            0 10px 40px rgba(0, 122, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }
        
        [data-theme="dark"] .row:hover::before {
          left: 100%;
        }

        /* Rows - Light Theme */
        [data-theme="light"] .row {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(30px) saturate(180%);
          -webkit-backdrop-filter: blur(30px) saturate(180%);
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 4px 16px rgba(0, 0, 0, 0.03),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        [data-theme="light"] .row::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(0, 122, 255, 0.08), transparent);
          transition: left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        [data-theme="light"] .row:hover {
          background: rgba(255, 255, 255, 0.75);
          border-color: rgba(0, 122, 255, 0.5);
          transform: translateX(6px) scale(1.01);
          box-shadow: 
            0 4px 16px rgba(0, 0, 0, 0.08),
            0 8px 32px rgba(0, 0, 0, 0.04),
            0 0 40px rgba(0, 122, 255, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
        }

        [data-theme="light"] .row:hover::before {
          left: 100%;
        }
        
        .slot {
          min-width: 90px;
          font-weight: 700;
          color: var(--text-primary);
          font-size: 13px;
          letter-spacing: -0.2px;
        }
        
        /* Status Badges */
        .status-badge {
          padding: 3px 10px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.7px;
          backdrop-filter: var(--blur-sm);
        }
        
        .status-active {
          background: rgba(52, 199, 89, 0.2);
          color: var(--success);
          border: 1px solid rgba(52, 199, 89, 0.4);
          box-shadow: 0 2px 8px rgba(52, 199, 89, 0.2);
        }
        
        .status-inactive {
          background: var(--glass-dark);
          color: var(--text-tertiary);
          border: 1px solid var(--glass-border);
        }

        /* Status Badges - Light Theme */
        [data-theme="light"] .status-active {
          background: rgba(52, 199, 89, 0.15);
          border-color: rgba(52, 199, 89, 0.5);
        }

        [data-theme="light"] .status-inactive {
          background: rgba(142, 142, 147, 0.15);
          border-color: rgba(142, 142, 147, 0.4);
          color: #86868b;
        }

        /* Real Liquid Glass Buttons - Dark Theme */
        [data-theme="dark"] .btn {
          appearance: none;
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          backdrop-filter: blur(40px) saturate(200%) brightness(1.1);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1);
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 9px 16px;
          border-radius: 14px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          position: relative;
          overflow: hidden;
          letter-spacing: 0.2px;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
        }
        
        [data-theme="dark"] .btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.15) 0%,
            rgba(255, 255, 255, 0.05) 50%,
            transparent 100%);
          opacity: 0;
          transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        [data-theme="dark"] .btn::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        
        [data-theme="dark"] .btn:hover {
          transform: translateY(-4px) scale(1.02);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            rgba(8, 10, 14, 0.35);
          box-shadow: 
            0 16px 48px rgba(0, 0, 0, 0.5),
            0 8px 24px rgba(0, 122, 255, 0.3),
            0 0 60px rgba(0, 122, 255, 0.15),
            0 2px 0 rgba(255, 255, 255, 0.2) inset,
            0 -2px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(255, 255, 255, 0.35);
        }
        
        [data-theme="dark"] .btn:hover::before {
          opacity: 1;
        }

        [data-theme="dark"] .btn:hover::after {
          opacity: 1;
        }
        
        [data-theme="dark"] .btn:active {
          transform: translateY(-2px) scale(0.98);
          transition: all 0.1s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        /* Liquid Glass Button Variants - Dark Theme */
        [data-theme="dark"] .btn.brand {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(90, 200, 250, 0.25)),
            rgba(8, 10, 14, 0.3);
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          border: 1px solid rgba(0, 122, 255, 0.4);
          color: white; 
          box-shadow: 
            0 8px 32px rgba(0, 122, 255, 0.5),
            0 4px 16px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.25) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 40px rgba(0, 122, 255, 0.2);
        }
        
        [data-theme="dark"] .btn.brand:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.4), rgba(90, 200, 250, 0.35)),
            rgba(8, 10, 14, 0.4);
          box-shadow: 
            0 16px 48px rgba(0, 122, 255, 0.6),
            0 8px 24px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(0, 122, 255, 0.3),
            0 2px 0 rgba(255, 255, 255, 0.3) inset,
            0 -2px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(0, 122, 255, 0.6);
        }
        
        [data-theme="dark"] .btn.ok {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(52, 199, 89, 0.3), rgba(48, 209, 88, 0.25)),
            rgba(8, 10, 14, 0.3);
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          border: 1px solid rgba(52, 199, 89, 0.4);
          color: white;
          box-shadow: 
            0 8px 32px rgba(52, 199, 89, 0.5),
            0 4px 16px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.25) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 40px rgba(52, 199, 89, 0.2);
        }
        
        [data-theme="dark"] .btn.ok:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 100%),
            linear-gradient(135deg, rgba(52, 199, 89, 0.4), rgba(48, 209, 88, 0.35)),
            rgba(8, 10, 14, 0.4);
          box-shadow: 
            0 16px 48px rgba(52, 199, 89, 0.6),
            0 8px 24px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(52, 199, 89, 0.3),
            0 2px 0 rgba(255, 255, 255, 0.3) inset,
            0 -2px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(52, 199, 89, 0.6);
        }
        
        [data-theme="dark"] .btn.log {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(255, 149, 0, 0.3), rgba(255, 159, 10, 0.25)),
            rgba(8, 10, 14, 0.3);
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          border: 1px solid rgba(255, 149, 0, 0.4);
          color: white;
          box-shadow: 
            0 8px 32px rgba(255, 149, 0, 0.5),
            0 4px 16px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.25) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 40px rgba(255, 149, 0, 0.2);
        }
        
        [data-theme="dark"] .btn.log:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 100%),
            linear-gradient(135deg, rgba(255, 149, 0, 0.4), rgba(255, 159, 10, 0.35)),
            rgba(8, 10, 14, 0.4);
          box-shadow: 
            0 16px 48px rgba(255, 149, 0, 0.6),
            0 8px 24px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(255, 149, 0, 0.3),
            0 2px 0 rgba(255, 255, 255, 0.3) inset,
            0 -2px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(255, 149, 0, 0.6);
        }
        
        [data-theme="dark"] .btn.events-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%),
            linear-gradient(135deg, rgba(255, 59, 48, 0.3), rgba(255, 45, 85, 0.25)),
            rgba(8, 10, 14, 0.3);
          backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.2);
          border: 1px solid rgba(255, 59, 48, 0.4);
          color: white;
          box-shadow: 
            0 8px 32px rgba(255, 59, 48, 0.5),
            0 4px 16px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.25) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 40px rgba(255, 59, 48, 0.2);
          position: relative;
        }
        
        [data-theme="dark"] .btn.events-btn:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 100%),
            linear-gradient(135deg, rgba(255, 59, 48, 0.4), rgba(255, 45, 85, 0.35)),
            rgba(8, 10, 14, 0.4);
          box-shadow: 
            0 16px 48px rgba(255, 59, 48, 0.6),
            0 8px 24px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(255, 59, 48, 0.3),
            0 2px 0 rgba(255, 255, 255, 0.3) inset,
            0 -2px 0 rgba(0, 0, 0, 0.6) inset;
          border-color: rgba(255, 59, 48, 0.6);
        }

        /* Liquid Glass Button Variants - Light Theme */
        [data-theme="light"] .btn.brand {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.15), rgba(90, 200, 250, 0.12)),
            rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          border: 1px solid rgba(0, 122, 255, 0.35);
          color: #007AFF;
          font-weight: 700;
          box-shadow: 
            0 4px 20px rgba(0, 122, 255, 0.25),
            0 2px 10px rgba(0, 0, 0, 0.08),
            0 1px 0 rgba(255, 255, 255, 0.9) inset,
            0 -1px 0 rgba(0, 122, 255, 0.15) inset,
            0 0 30px rgba(0, 122, 255, 0.1);
        }
        
        [data-theme="light"] .btn.brand:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.22), rgba(90, 200, 250, 0.18)),
            rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 8px 32px rgba(0, 122, 255, 0.35),
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 0 60px rgba(0, 122, 255, 0.2),
            0 2px 0 rgba(255, 255, 255, 0.95) inset,
            0 -2px 0 rgba(0, 122, 255, 0.25) inset;
          border-color: rgba(0, 122, 255, 0.5);
          color: #0051D5;
        }
        
        [data-theme="light"] .btn.ok {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%),
            linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.12)),
            rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          border: 1px solid rgba(52, 199, 89, 0.35);
          color: #34C759;
          font-weight: 700;
          box-shadow: 
            0 4px 20px rgba(52, 199, 89, 0.25),
            0 2px 10px rgba(0, 0, 0, 0.08),
            0 1px 0 rgba(255, 255, 255, 0.9) inset,
            0 -1px 0 rgba(52, 199, 89, 0.15) inset,
            0 0 30px rgba(52, 199, 89, 0.1);
        }
        
        [data-theme="light"] .btn.ok:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(52, 199, 89, 0.22), rgba(48, 209, 88, 0.18)),
            rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 8px 32px rgba(52, 199, 89, 0.35),
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 0 60px rgba(52, 199, 89, 0.2),
            0 2px 0 rgba(255, 255, 255, 0.95) inset,
            0 -2px 0 rgba(52, 199, 89, 0.25) inset;
          border-color: rgba(52, 199, 89, 0.5);
          color: #30D158;
        }
        
        [data-theme="light"] .btn.log {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%),
            linear-gradient(135deg, rgba(255, 149, 0, 0.15), rgba(255, 159, 10, 0.12)),
            rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          border: 1px solid rgba(255, 149, 0, 0.35);
          color: #FF9500;
          font-weight: 700;
          box-shadow: 
            0 4px 20px rgba(255, 149, 0, 0.25),
            0 2px 10px rgba(0, 0, 0, 0.08),
            0 1px 0 rgba(255, 255, 255, 0.9) inset,
            0 -1px 0 rgba(255, 149, 0, 0.15) inset,
            0 0 30px rgba(255, 149, 0, 0.1);
        }
        
        [data-theme="light"] .btn.log:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(255, 149, 0, 0.22), rgba(255, 159, 10, 0.18)),
            rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 8px 32px rgba(255, 149, 0, 0.35),
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 0 60px rgba(255, 149, 0, 0.2),
            0 2px 0 rgba(255, 255, 255, 0.95) inset,
            0 -2px 0 rgba(255, 149, 0, 0.25) inset;
          border-color: rgba(255, 149, 0, 0.5);
          color: #FF9F0A;
        }
        
        [data-theme="light"] .btn.events-btn {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%),
            linear-gradient(135deg, rgba(255, 59, 48, 0.15), rgba(255, 45, 85, 0.12)),
            rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
          border: 1px solid rgba(255, 59, 48, 0.35);
          color: #FF3B30;
          font-weight: 700;
          box-shadow: 
            0 4px 20px rgba(255, 59, 48, 0.25),
            0 2px 10px rgba(0, 0, 0, 0.08),
            0 1px 0 rgba(255, 255, 255, 0.9) inset,
            0 -1px 0 rgba(255, 59, 48, 0.15) inset,
            0 0 30px rgba(255, 59, 48, 0.1);
          position: relative;
        }
        
        [data-theme="light"] .btn.events-btn:hover {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(255, 59, 48, 0.22), rgba(255, 45, 85, 0.18)),
            rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 8px 32px rgba(255, 59, 48, 0.35),
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 0 60px rgba(255, 59, 48, 0.2),
            0 2px 0 rgba(255, 255, 255, 0.95) inset,
            0 -2px 0 rgba(255, 59, 48, 0.25) inset;
          border-color: rgba(255, 59, 48, 0.5);
          color: #FF453A;
        }
        
        /* Event Badge with Pulse */
        .event-badge {
          display: inline-block;
          background: linear-gradient(135deg, #FFD60A, #FF9500);
          color: #1a1a1a;
          padding: 3px 10px;
          border-radius: 12px; 
          font-size: 12px; 
          font-weight: 800;
          margin-left: 8px;
          min-width: 24px;
          text-align: center;
          box-shadow: 
            0 2px 8px rgba(255, 214, 10, 0.4),
            0 4px 16px rgba(255, 214, 10, 0.2);
          animation: pulse-badge 2s ease-in-out infinite;
        }
        
        @keyframes pulse-badge {
          0%, 100% {
            transform: scale(1);
            box-shadow: 
              0 2px 8px rgba(255, 214, 10, 0.4),
              0 4px 16px rgba(255, 214, 10, 0.2);
          }
          50% {
            transform: scale(1.1);
            box-shadow: 
              0 4px 12px rgba(255, 214, 10, 0.6),
              0 6px 20px rgba(255, 214, 10, 0.3);
          }
        }

        /* Buttons - Light Theme */
        [data-theme="light"] .btn {
          appearance: none;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(30px) saturate(180%);
          -webkit-backdrop-filter: blur(30px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.15);
          color: #1d1d1f;
          padding: 9px 16px;
          border-radius: 14px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          position: relative;
          overflow: hidden;
          letter-spacing: 0.2px;
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.08),
            0 4px 16px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        [data-theme="light"] .btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(0, 122, 255, 0.1), transparent);
          opacity: 0;
          transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        [data-theme="light"] .btn:hover {
          transform: translateY(-4px) scale(1.02);
          background: rgba(255, 255, 255, 0.8);
          border-color: rgba(0, 122, 255, 0.5);
          box-shadow: 
            0 6px 24px rgba(0, 0, 0, 0.12),
            0 12px 48px rgba(0, 0, 0, 0.06),
            0 0 40px rgba(0, 122, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
        }

        [data-theme="light"] .btn:hover::before {
          opacity: 1;
        }

        [data-theme="light"] .btn:active {
          transform: translateY(-2px) scale(0.98);
          transition: all 0.1s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Segmented Control - iOS Style */
        /* Liquid Glass Segmented Control - Dark Theme */
        [data-theme="dark"] .seg {
          display: inline-flex;
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            rgba(8, 10, 14, 0.25);
          backdrop-filter: blur(40px) saturate(200%) brightness(1.1);
          -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 14px;
          padding: 4px;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.15) inset,
            0 -1px 0 rgba(0, 0, 0, 0.5) inset,
            0 0 0 1px rgba(255, 255, 255, 0.05);
        }
        
        [data-theme="dark"] .seg button {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          letter-spacing: 0.1px;
        }
        
        [data-theme="dark"] .seg button:hover {
          color: var(--text-primary);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%),
            rgba(255, 255, 255, 0.03);
          transform: scale(1.02);
        }
        
        [data-theme="dark"] .seg button[aria-pressed="true"] {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.6), rgba(0, 100, 220, 0.5)),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(0, 100, 220, 0.25)),
            rgba(8, 10, 14, 0.25);
          color: white;
          border: 1px solid rgba(0, 122, 255, 0.5);
          box-shadow: 
            0 4px 16px rgba(0, 122, 255, 0.4),
            0 8px 32px rgba(0, 122, 255, 0.2),
            0 0 40px rgba(0, 122, 255, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.2) inset;
          transform: scale(1);
        }

        /* Liquid Glass Segmented Control - Light Theme */
        [data-theme="light"] .seg {
          display: inline-flex;
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            rgba(248, 250, 252, 0.45);
          backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.03);
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 14px;
          padding: 4px;
          box-shadow: 
            0 4px 20px rgba(0, 0, 0, 0.08),
            0 8px 40px rgba(0, 0, 0, 0.04),
            0 1px 0 rgba(255, 255, 255, 1) inset,
            0 0 0 1px rgba(0, 122, 255, 0.03);
        }

        [data-theme="light"] .seg button {
          background: transparent;
          border: none;
          color: #6e6e73;
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          letter-spacing: 0.1px;
        }

        [data-theme="light"] .seg button:hover {
          color: #1d1d1f;
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%),
            rgba(255, 255, 255, 0.5);
          transform: scale(1.02);
        }

        [data-theme="light"] .seg button[aria-pressed="true"] {
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.4) 100%),
            linear-gradient(135deg, rgba(0, 122, 255, 0.3), rgba(0, 100, 220, 0.25)),
            rgba(255, 255, 255, 0.5);
          color: #0064dc;
          border: 1px solid rgba(0, 122, 255, 0.4);
          box-shadow: 
            0 4px 20px rgba(0, 122, 255, 0.15),
            0 8px 40px rgba(0, 122, 255, 0.1),
            0 0 40px rgba(0, 122, 255, 0.2),
            0 1px 0 rgba(255, 255, 255, 1) inset;
          transform: scale(1);
        }

        /* Glass Select Dropdown */
        select.sel {
          background: rgba(8, 10, 14, 0.7);
          backdrop-filter: var(--blur-md);
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px; 
          padding: 10px 14px;
          flex: 1;
          outline: none;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.6)' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        
        select.sel:hover {
          border-color: var(--primary);
          background-color: var(--glass-medium);
          transform: translateY(-1px);
        }
        
        select.sel:focus {
          border-color: var(--primary);
          background-color: var(--glass-medium);
          box-shadow: 
            0 0 0 3px rgba(0, 122, 255, 0.2),
            inset 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        select.sel option {
          background: #0a0c10;
          color: white;
          padding: 10px;
          font-size: 13px;
          font-weight: 500;
        }

        /* Select Dropdown - Light Theme */
        [data-theme="light"] select.sel {
          background: rgba(248, 248, 250, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.1);
          color: #1d1d1f;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(0,0,0,0.5)' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
        }

        [data-theme="light"] select.sel:hover {
          background: rgba(255, 255, 255, 1);
          border-color: rgba(0, 122, 255, 0.4);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(0,0,0,0.5)' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
        }

        [data-theme="light"] select.sel option {
          background: #ffffff;
          color: #1d1d1f;
        }

        /* Scrollbar - Light Theme */
        [data-theme="light"] .container::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.02);
        }

        [data-theme="light"] .container::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.5);
        }

        [data-theme="light"] .container::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.25);
        }

        /* Video Grid */
        .dashboard {
          width: 100%;
          flex: 1;
          display: flex; 
          flex-direction: column;
          min-height: 0;
          animation: fade-in 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s both;
        }
        
        .video-section {
          width: 100%;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        
        .grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          min-height: fit-content;
          padding-bottom: 20px;
        }
        
        /* Support for 4 cameras in 2x2 grid */
        .grid:has(.cam:nth-child(3)) {
          grid-template-columns: repeat(2, 1fr);
        }
        
        .grid:has(.cam:nth-child(4)) {
          grid-template-columns: repeat(2, 1fr);
        }
        
        /* Real Liquid Glass Camera Cards (Dark Theme) */
        [data-theme="dark"] .cam {
          position: relative;
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%),
            rgba(6, 8, 12, 0.2);
          backdrop-filter: blur(60px) saturate(200%) brightness(1.15);
          -webkit-backdrop-filter: blur(60px) saturate(200%) brightness(1.15);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 
            0 12px 48px rgba(0, 0, 0, 0.7),
            0 24px 100px rgba(0, 0, 0, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.18) inset,
            0 -1px 0 rgba(0, 0, 0, 0.7) inset,
            0 0 0 1px rgba(255, 255, 255, 0.08);
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
          min-height: 350px;
          animation: glass-fade-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        
        [data-theme="dark"] .cam:nth-child(2) {
          animation-delay: 0.15s;
        }
        
        [data-theme="dark"] .cam:nth-child(3) {
          animation-delay: 0.3s;
        }
        
        [data-theme="dark"] .cam:nth-child(4) {
          animation-delay: 0.45s;
        }
        
        [data-theme="dark"] .cam:hover {
          transform: translateY(-6px) scale(1.03);
          background: 
            linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.03) 100%),
            rgba(6, 8, 12, 0.3);
          box-shadow: 
            0 20px 80px rgba(0, 0, 0, 0.8),
            0 32px 140px rgba(0, 0, 0, 0.6),
            0 0 100px rgba(0, 122, 255, 0.35),
            0 2px 0 rgba(255, 255, 255, 0.25) inset,
            0 -2px 0 rgba(0, 0, 0, 0.8) inset,
            0 0 0 1px rgba(255, 255, 255, 0.15);
          border-color: rgba(0, 122, 255, 0.6);
        }

        /* Camera Cards - Light Theme */
        [data-theme="light"] .cam {
          position: relative;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 
            0 4px 24px rgba(0, 0, 0, 0.08),
            0 8px 48px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 0 0 1px rgba(0, 122, 255, 0.03);
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
          min-height: 350px;
          animation: glass-fade-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        [data-theme="light"] .cam:nth-child(2) {
          animation-delay: 0.15s;
        }
        
        [data-theme="light"] .cam:nth-child(3) {
          animation-delay: 0.3s;
        }
        
        [data-theme="light"] .cam:nth-child(4) {
          animation-delay: 0.45s;
        }

        [data-theme="light"] .cam:hover {
          transform: translateY(-6px) scale(1.03);
          background: rgba(255, 255, 255, 0.75);
          box-shadow: 
            0 8px 40px rgba(0, 0, 0, 0.12),
            0 16px 80px rgba(0, 0, 0, 0.06),
            0 0 60px rgba(0, 122, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
          border-color: rgba(0, 122, 255, 0.5);
        }
        
        .cam-header {
          padding: 14px 20px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
          backdrop-filter: var(--blur-md);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: space-between; 
          flex-shrink: 0;
        }
        
        .cam-title {
          font-size: 16px;
          font-weight: 700; 
          color: var(--text-primary);
          letter-spacing: -0.3px;
        }
        
        /* Live Badge - iOS Style */
        .live-badge {
          padding: 6px 14px;
          background: rgba(52, 199, 89, 0.2);
          backdrop-filter: var(--blur-sm);
          border: 1px solid rgba(52, 199, 89, 0.4);
          border-radius: 14px;
          color: var(--success);
          font-size: 11px; 
          font-weight: 700;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.8px;
          box-shadow: 0 2px 8px rgba(52, 199, 89, 0.2);
        }
        
        .live-dot {
          width: 6px;
          height: 6px;
          background: var(--success);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--success);
          animation: pulse-ring 2s ease-in-out infinite;
        }
        
        .cam img {
          width: 100%;
          height: auto;
          min-height: 300px;
          max-height: 500px;
          object-fit: cover;
          display: block;
          background: linear-gradient(135deg, #050608, #0a0c10);
          flex: 1;
        }

        /* Camera Header & Image - Light Theme */
        [data-theme="light"] .cam-header {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 248, 250, 0.7) 100%);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        [data-theme="light"] .cam img {
          background: linear-gradient(135deg, #f5f5f7, #e8e8ed);
          height: auto;
          min-height: 300px;
          max-height: 500px;
        }
        
        .cam-single {
          max-width: 100%;
          margin: 0 auto;
          grid-column: 1 / -1;
        }

        /* Loading & Empty States */
        .loading, .empty {
          text-align: center;
          padding: 60px 24px;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(6, 8, 12, 0.6);
          backdrop-filter: var(--blur-lg);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        
        .loading-spinner {
          width: 56px;
          height: 56px;
          border: 4px solid var(--glass-border);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
          box-shadow: 0 4px 16px rgba(0, 122, 255, 0.2);
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .empty-icon {
          font-size: 56px;
          margin-bottom: 16px;
          opacity: 0.6;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
        }
        
        .empty-text {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
          letter-spacing: -0.3px;
        }
        
        .empty-subtext {
          font-size: 14px;
          color: var(--text-tertiary);
          line-height: 1.6;
        }

        /* Loading & Empty States - Light Theme */
        [data-theme="light"] .loading,
        [data-theme="light"] .empty {
          background: rgba(248, 248, 250, 0.8);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        [data-theme="light"] .loading-spinner {
          border-color: rgba(0, 0, 0, 0.1);
          border-top-color: #007AFF;
          box-shadow: 0 2px 12px rgba(0, 122, 255, 0.2);
        }

        [data-theme="light"] .empty-icon {
          opacity: 0.5;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.1));
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .grid {
            grid-template-columns: 1fr;
          }
          
          .controls {
            grid-template-columns: 1fr;
          }
        }
        
        @media (max-width: 768px) {
          .hdr-inner {
            padding: 12px 20px;
          }
          
          .container {
            padding: 16px 20px;
            gap: 16px;
          }
          
          .brand-logo {
            width: 40px;
            height: 40px;
            font-size: 18px;
          }
          
          .brand-title {
            font-size: 18px;
          }
          
          .brand-subtitle {
            font-size: 10px;
          }
          
          .btn {
            padding: 10px 16px;
            font-size: 13px;
          }
          
          .panel {
            padding: 16px;
            border-radius: 20px;
          }
          
          .cam {
            border-radius: 20px;
          }
        }
        
        @media (min-width: 769px) and (max-width: 1024px) {
          .container {
            padding: 20px 24px;
          }
        }
      `}</style>

      {showAdminPanel ? (
        <AdminPanel onBack={() => setShowAdminPanel(false)} />
      ) : (
      <div className="rzm-root" data-theme={theme}>
        {/* Header */}
        <header className="hdr">
          <div className="hdr-inner">
            <div className="brand">
              <div className="brand-logo">V</div>
              <div className="brand-text">
                <div className="brand-title">Camera Monitoring</div>
                <div className="brand-subtitle">Restricted Zone Monitor</div>
            </div>
              <div className="pulse" />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button className="admin-btn" onClick={() => setShowAdminPanel(true)} title="Admin Panel">
                🔐
              </button>
              <button className="menu-btn" onClick={() => setShowMenu(true)} title="Menu">
                ☰
            </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="container">
          {/* Controls Panel */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <div className="panel-icon">🎥</div>
                Camera Configuration
                </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 600 }}>
                  Active: <span style={{ color: 'var(--ok)', fontWeight: 700 }}>{cams.length}</span>
                </span>
                        </div>
                </div>

                <div className="controls">
              {camIds.map((id) => {
                const isActive = activeCamIds.includes(id);
                      return (
                  <div key={id} className="row">
                    <span className="slot">{id}</span>
                    <span className={`status-badge ${isActive ? 'status-active' : 'status-inactive'}`}>
                      {isActive ? '● LIVE' : '○ Offline'}
                    </span>
                          <select
                            className="sel"
                            value={binding[id] || ""}
                      onChange={(e) => setBinding({ ...binding, [id]: e.target.value })}
                    >
                      <option value="">— Select Device —</option>
                      {devices.map((d) => (
                        <option key={d.index} value={d.name}>
                                  {d.name}
                                </option>
                      ))}
                          </select>
                        </div>
                      );
              })}
                </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <button className="btn ok" onClick={activateCameras} disabled={activating}>
                {activating ? "⏳ Activating..." : "▶ Activate Cameras"}
              </button>
              <button className="btn brand" onClick={loadDevices}>
                🔄 Refresh Devices
              </button>
              <button className="btn brand" onClick={loadActiveCams}>
                📡 Reload Cameras
              </button>
              <button className="btn events-btn" onClick={() => setShowEventsDialog(true)}>
                🚨 System Events
                {events.length > 0 && <span className="event-badge">{events.length}</span>}
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 600 }}>View:</span>
                <div className="seg">
                    <button
                    onClick={() => setView("grid")}
                    aria-pressed={view === "grid"}
                  >
                    🗂️ Grid
                    </button>
                    <button 
                    onClick={() => setView("single")}
                    aria-pressed={view === "single"}
                    >
                    🔍 Single
                    </button>
                  </div>
                {view === "single" && (
                  <select className="sel" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ minWidth: '180px', maxWidth: '220px', flex: 'none' }}>
                    <option value="">— Select Camera —</option>
                      {cams.map((c) => (
                      <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                )}
                    </div>
                  </div>
                </div>

          {/* Video Display */}
          <div className="dashboard">
            <div className="video-section">
              {loadingCams ? (
                <div className="panel loading">
                  <div className="loading-spinner" />
                  <div className="empty-text">Loading camera system...</div>
                  <div className="empty-subtext">Please wait while we initialize the cameras</div>
                </div>
              ) : view === "single" ? (
                <div className="grid">
                  <div className={`cam cam-single ${selected ? '' : 'empty'}`}>
                  {selected ? (
                      <>
                        <div className="cam-header">
                          <div className="cam-title">{selected}</div>
                          <div className="live-badge">
                            <span className="live-dot" />
                            LIVE
                          </div>
                        </div>
                        <img src={videoSrc} alt={`${selected} feed`} />
                      </>
                    ) : (
                      <div className="empty">
                        <div className="empty-icon">📹</div>
                        <div className="empty-text">No Camera Selected</div>
                        <div className="empty-subtext">Choose a camera from the dropdown above</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid">
                  {cams.length === 0 ? (
                    <div className="panel empty" style={{ gridColumn: '1 / -1' }}>
                      <div className="empty-icon">🎥</div>
                      <div className="empty-text">No Active Cameras</div>
                      <div className="empty-subtext">Configure and activate cameras to start monitoring</div>
                    </div>
                  ) : (
                    cams.map((c) => (
                      <div key={c} className="cam">
                        <div className="cam-header">
                          <div className="cam-title">{c}</div>
                          <div className="live-badge">
                            <span className="live-dot" />
                            LIVE
                          </div>
                        </div>
                        <img
                          src={`${API}/video?cam=${encodeURIComponent(c)}`}
                          alt={`${c} feed`}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
                  </div>
                </div>
                
        {/* Modals */}
        {showMenu && <MenuWindow isOpen={showMenu} onClose={() => setShowMenu(false)} />}
        {showEventsDialog && (
          <EventsDialog isOpen={showEventsDialog} onClose={() => setShowEventsDialog(false)} events={events} />
        )}

        {/* Audio */}
      <audio ref={audioRef} src={`${API}/beep`} preload="auto" />
      <audio ref={freezeAudioRef} src="/beep_cameraA.wav" preload="auto" />
    </div>
      )}
    </>
  );
}
