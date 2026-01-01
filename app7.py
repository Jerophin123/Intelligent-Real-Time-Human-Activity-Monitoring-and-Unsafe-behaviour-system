# app5.py
import os, re, cv2, time, json, argparse, threading, asyncio, sqlite3
from datetime import datetime, timedelta
from typing import Dict, Tuple, List, Optional
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Request, Query, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from fastapi import UploadFile, File, Form
import uvicorn
import numpy as np
import smtplib
from email.message import EmailMessage
import secrets

from ultralytics import YOLO
from shapely.geometry import Point, Polygon
from shapely.geometry import box as shapely_box
from shapely.validation import make_valid

# DeepFace (use OpenCV backend + SFace to avoid TF/keras dependencies)
from deepface import DeepFace

# Initialize pygame mixer once at startup
try:
    import pygame
    pygame.mixer.init()
    PYGAME_AVAILABLE = True
except Exception:
    PYGAME_AVAILABLE = False
    print("[audio] pygame not available, audio alerts disabled")

# ---------------- FastAPI ----------------
app = FastAPI()

BEEP_FILE = os.path.join(os.path.dirname(__file__), "beep.wav")
FREEZE_BEEP_FILE = os.path.join(os.path.dirname(__file__), "freeze_beep.wav")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for network access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- CLI ----------------
def parse_args():
    ap = argparse.ArgumentParser(
        "Multi-camera backend (YOLO zones + DeepFace verify on zone entry + FREEZE detection + SQLite logging)"
    )
    ap.add_argument("--model", default="yolov8n.pt", help="YOLOv8 *.pt (COCO person=0)")
    ap.add_argument("--cams", default="cameraA=0,cameraB=1,cameraC=2,cameraD=3",
                    help='Comma list "cameraA=0,cameraB=1,cameraC=2,cameraD=3". Keys are logical ids.')
    ap.add_argument("--zones", default="zones.json", help="Fallback zones file")
    ap.add_argument("--conf", type=float, default=0.35, help="YOLO detection confidence")
    ap.add_argument("--imgsz", type=int, default=640, help="YOLO image size")
    ap.add_argument("--skip-frames", type=int, default=2, help="Process every Nth frame (1=all frames, 2=every other frame)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--draw-zones", action="store_true", help="Open polygon drawer (use --cam-id).")
    ap.add_argument("--cam-id", default=None, help="When --draw-zones, which camera id.")

    ap.add_argument("--hit", choices=["center", "overlap", "feet"], default="overlap",
                    help="Intrusion rule.")
    ap.add_argument("--overlap-thresh", type=float, default=0.05,
                    help="Min overlap ratio for --hit overlap.")

    # Known faces
    ap.add_argument("--allowlist-dir", default="./known_faces",
                    help="Folder of allowed persons. Filename (without ext) = class label.")
    ap.add_argument("--min-face", type=int, default=90,
                    help="Min crop size (px) to attempt DeepFace verify (applied to bounding box).")
    ap.add_argument("--face-threshold", type=float, default=1.0,
                    help="Face recognition threshold (higher = more lenient, default: 1.0). Lower values are stricter.")
    ap.add_argument("--face-model", default="VGG-Face",
                    choices=["VGG-Face", "Facenet", "Facenet512", "OpenFace", "DeepFace", "DeepID", "Dlib", "ArcFace", "SFace", "GhostFaceNet"],
                    help="Face recognition model (default: VGG-Face)")

    # Freeze detection
    # Higher freeze-eps means more motion is treated as "still". We want
    # freeze to trigger for slightly moving / jittering people (e.g. unconscious),
    # but not for normally walking people. Typical walking speed in pixels/sec
    # is much higher than this threshold, so 8.0 works well in practice.
    ap.add_argument("--freeze-eps", type=float, default=8.0, help="Velocity (px/s) considered still.")
    ap.add_argument("--freeze-sustain", type=float, default=30.0,
                    help="Seconds still before FREEZE.")
    ap.add_argument("--freeze-cooldown", type=float, default=5.0,
                    help="Cooldown between FREEZE alerts.")

    # Zone alert throttle
    ap.add_argument("--zone-cooldown", type=float, default=2.0,
                    help="Cooldown between ZONE alerts.")

    # DeepFace run throttle
    ap.add_argument("--classify-cooldown", type=float, default=10.0,
                    help="Seconds to wait before re-classifying the same track again.")
    
    # PPE (Personal Protective Equipment) detection
    ap.add_argument("--enable-ppe", action="store_true",
                    help="Enable helmet and vest detection for zone entry compliance.")
    ap.add_argument("--ppe-model", default="yolov8n.pt",
                    help="YOLO model for PPE detection (helmet, vest). Use same as --model if not specialized.")
    ap.add_argument("--require-helmet", action="store_true", default=False,
                    help="Require helmet for zone entry (PPE compliance).")
    ap.add_argument("--require-vest", action="store_true", default=False,
                    help="Require safety vest for zone entry (PPE compliance).")
    ap.add_argument("--ppe-cooldown", type=float, default=3.0,
                    help="Cooldown between PPE violation alerts.")
    ap.add_argument("--helmet-classes", type=str, default="0",
                    help="Comma-separated list of class IDs for helmets (default: 0)")
    ap.add_argument("--vest-classes", type=str, default="1",
                    help="Comma-separated list of class IDs for vests (default: 1)")
    
    return ap.parse_args()

ARGS = parse_args()

# ---------------- Parse cameras ----------------
def parse_cams(spec: str) -> Dict[str, str]:
    out = {}
    for token in spec.split(","):
        token = token.strip()
        if not token: continue
        if "=" not in token:
            raise ValueError(f'Bad --cams token "{token}". Use id=source.')
        cid, _ = token.split("=", 1)
        out[cid.strip()] = True
    if not out:
        raise ValueError("No cameras parsed from --cams.")
    return out

CAM_IDS: List[str] = list(parse_cams(ARGS.cams).keys())

# ---------------- Geometry helpers ----------------
def clamp_pts(pts, w, h):
    return [[max(0, min(w - 1, int(x))), max(0, min(h - 1, int(y)))] for x, y in pts]

def fix_poly(poly):
    try:
        if not poly.is_valid:
            poly = make_valid(poly)
        if poly.geom_type == "MultiPolygon":
            poly = max(poly.geoms, key=lambda g: g.area)
        poly = poly.buffer(0)
        if poly.is_empty:
            raise ValueError("empty after fix")
    except Exception:
        poly = poly.convex_hull
    return poly

# ---------------- Globals ----------------
app.state.loop = None
latest_jpeg: Dict[str, Optional[bytes]] = {}
events_log: List[dict] = []
subscribers: List[asyncio.Queue] = []

workers_by_id: Dict[str, "CameraWorker"] = {}
active_sources_by_id: Dict[str, int] = {}
device_names_by_id: Dict[str, str] = {}

# Email settings (enabled by default, can be toggled in admin panel)
EMAIL_ENABLED = True
EMAIL_CONFIG = {
    "smtp_server": "smtp.gmail.com",
    "smtp_port": 587,
    "sender": "w7925621@gmail.com",
    "password": "iitmnbdsfdthivse",
    "recipients": ["jerophindegreat78@gmail.com"]
}

# Admin authentication
security = HTTPBasic()
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Colors
ZONE_COLOR   = (255, 0, 0)      # blue-ish lines
SAFE_COLOR   = (0, 255, 0)      # green (BGR format)
ALERT_COLOR  = (0, 0, 255)      # red (BGR format)
ALLOW_COLOR  = (255, 165, 0)    # orange (label only, no box)
FREEZE_COLOR = (180, 105, 255)  # hot pink (BGR format)

# Known faces list (file paths)
KNOWN_FACE_PATHS: List[Tuple[str, str]] = []

# Also keep an RGB in-memory list (optional)
KNOWN_FACES: List[Tuple[str, np.ndarray]] = []

# SQLite
DB_PATH = "recognitions.db"
DB_FILE = DB_PATH  # Alias for compatibility
os.makedirs("captures", exist_ok=True)
DB_LOCK = threading.Lock()

def init_db():
    with DB_LOCK:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        
        # Comprehensive events table for all event types
        cur.execute("""
        CREATE TABLE IF NOT EXISTS recognitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            cam_id TEXT,
            zone_id TEXT,
            track_id INTEGER,
            person_name TEXT,
            allowed INTEGER,
            label TEXT,
            has_helmet INTEGER,
            has_vest INTEGER,
            missing_ppe TEXT,
            seconds_still INTEGER,
            confidence REAL,
            image_path TEXT
        )
        """)
        
        # Create index for faster date-based queries
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_timestamp ON recognitions(timestamp)
        """)
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_event_type ON recognitions(event_type)
        """)
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_cam_id ON recognitions(cam_id)
        """)
        
        con.commit()
        con.close()

def insert_event(event_data: dict):
    """Insert any event into the database"""
    with DB_LOCK:
        try:
            con = sqlite3.connect(DB_PATH)
            cur = con.cursor()
            
            # Extract and format timestamp
            timestamp = event_data.get('human_time') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # Insert event with all relevant fields
            cur.execute("""
                INSERT INTO recognitions (
                    timestamp, event_type, cam_id, zone_id, track_id,
                    person_name, allowed, label, has_helmet, has_vest,
                    missing_ppe, seconds_still, confidence, image_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                timestamp,
                event_data.get('type', 'UNKNOWN'),
                event_data.get('cam_id'),
                event_data.get('zone_id'),
                event_data.get('track_id'),
                event_data.get('class_name'),
                event_data.get('allowed'),
                event_data.get('label'),
                event_data.get('has_helmet'),
                event_data.get('has_vest'),
                event_data.get('missing_ppe'),
                event_data.get('seconds_still'),
                event_data.get('confidence'),
                event_data.get('image_path')
            ))
            
            con.commit()
            con.close()
        except Exception as e:
            print(f"[DB] Failed to insert event: {e}")
            import traceback
            traceback.print_exc()

# Thread pool (kept available)
EXECUTOR = ThreadPoolExecutor(max_workers=2)

# ---------------- Devices ----------------
def _get_camera_name(index: int) -> str:
    """Try to get the actual camera device name using multiple methods"""
    
    # Method 1: Try pygrabber (if available)
    try:
        from pygrabber.dshow_graph import FilterGraph
        devices = FilterGraph().get_input_devices()
        if 0 <= index < len(devices):
            device_name = devices[index]
            print(f"[pygrabber] Camera {index}: {device_name}")
            return f"{device_name} (index {index})"
    except ImportError:
        print(f"[INFO] pygrabber not available, trying alternative methods...")
    except Exception as e:
        print(f"[ERROR] pygrabber failed: {e}")
    
    # Method 2: Try OpenCV DirectShow with name extraction
    try:
        import subprocess
        # Use PowerShell to get camera names on Windows
        result = subprocess.run(
            ['powershell', '-Command', 
             'Get-PnpDevice -Class Camera | Select-Object -ExpandProperty FriendlyName'],
            capture_output=True, text=True, timeout=2, creationflags=subprocess.CREATE_NO_WINDOW
        )
        print(f"[PowerShell] Return code: {result.returncode}")
        print(f"[PowerShell] Output: {result.stdout[:200]}")
        if result.returncode == 0 and result.stdout.strip():
            camera_names = [name.strip() for name in result.stdout.strip().split('\n') if name.strip()]
            print(f"[PowerShell] Found cameras: {camera_names}")
            if 0 <= index < len(camera_names):
                device_name = camera_names[index]
                print(f"[PowerShell] Camera {index}: {device_name}")
                return f"{device_name} (index {index})"
    except Exception as e:
        print(f"[ERROR] PowerShell method failed: {e}")
    
    # Method 3: Try Windows WMI
    try:
        import subprocess
        result = subprocess.run(
            ['wmic', 'path', 'Win32_PnPEntity', 'where', "PNPClass='Camera'", 'get', 'Caption'],
            capture_output=True, text=True, timeout=2, creationflags=subprocess.CREATE_NO_WINDOW
        )
        if result.returncode == 0 and result.stdout.strip():
            lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip() and line.strip() != 'Caption']
            print(f"[WMIC] Found cameras: {lines}")
            if 0 <= index < len(lines):
                device_name = lines[index]
                print(f"[WMIC] Camera {index}: {device_name}")
                return f"{device_name} (index {index})"
    except Exception as e:
        print(f"[ERROR] WMIC method failed: {e}")
    
    # Fallback to generic name
    print(f"[FALLBACK] Using generic name for camera {index}")
    return f"Camera #{index} (index {index})"

def _probe_opencv_indices(max_index: int = 10) -> List[dict]:
    out = []
    for i in range(max_index):
        opened = False
        for backend in (0, cv2.CAP_DSHOW, cv2.CAP_MSMF):
            cap = cv2.VideoCapture(i, backend) if backend != 0 else cv2.VideoCapture(i)
            if not cap.isOpened():
                cap.release(); continue
            ok = False; t0 = time.time()
            while time.time() - t0 < 0.3:
                r, _ = cap.read()
                if r: ok = True; break
                time.sleep(0.02)
            cap.release()
            if ok: opened = True; break
        if opened:
            camera_name = _get_camera_name(i)
            out.append({"index": i, "name": camera_name})
    return out

def list_local_cams() -> List[dict]:
    return _probe_opencv_indices(max_index=10)

# ---------------- Health/API ----------------
@app.get("/health")
def health():
    return {"ok": True, "slots": CAM_IDS, "active": list(active_sources_by_id.keys())}

@app.get("/cam_ids")
def cam_ids():
    return {"cam_ids": CAM_IDS}

@app.get("/devices")
def devices():
    return {"devices": list_local_cams()}

class ActivateMapBody(BaseModel):
    map: Dict[str, str]

def _parse_index_from_label(label: str) -> Optional[int]:
    label = str(label).strip()
    if label.isdigit(): return int(label)
    m = re.search(r"\(index\s+(\d+)\)", label)
    if m: return int(m.group(1))
    try: return int(label)
    except: return None

def stop_worker(cam_id: str):
    w = workers_by_id.pop(cam_id, None)
    if w:
        w.stop()
        try: w.join(timeout=2.0)
        except: pass
    latest_jpeg[cam_id] = None
    active_sources_by_id.pop(cam_id, None)
    device_names_by_id.pop(cam_id, None)

def start_worker(cam_id: str, src_index: int, device_name: str = None):
    w = CameraWorker(cam_id, src_index, ARGS.model)
    w.start()
    workers_by_id[cam_id] = w
    active_sources_by_id[cam_id] = src_index
    if device_name:
        device_names_by_id[cam_id] = device_name
    else:
        device_names_by_id[cam_id] = _get_camera_name(src_index)
    if cam_id not in latest_jpeg:
        latest_jpeg[cam_id] = None

@app.post("/activate_map")
def activate_map(body: ActivateMapBody):
    new_map: Dict[str, tuple] = {}  # Changed to store (index, device_name)
    for cam_id, label in body.map.items():
        if cam_id not in CAM_IDS:
            raise HTTPException(400, f"Unknown cam id: {cam_id}")
        idx = _parse_index_from_label(label)
        if idx is None:
            raise HTTPException(400, f"Could not parse index from '{label}'.")
        # Extract device name from label (everything before "(index X)")
        device_name = label
        if "(index" in label:
            device_name = label.split("(index")[0].strip()
        new_map[cam_id] = (idx, device_name)

    changed = []
    for cam_id in list(active_sources_by_id.keys()):
        if cam_id not in new_map:
            stop_worker(cam_id)
            changed.append(cam_id)

    for cam_id, (src, device_name) in new_map.items():
        have = active_sources_by_id.get(cam_id)
        if have != src:
            if have is not None:
                stop_worker(cam_id)
            start_worker(cam_id, src, device_name)
            changed.append(cam_id)

    return {"ok": True, "changed": changed, "active": list(device_names_by_id.values())}

# Alias endpoint for frontend compatibility
@app.post("/activate")
def activate(body: ActivateMapBody):
    """Alias for /activate_map endpoint for frontend compatibility"""
    return activate_map(body)

@app.get("/cams")
def list_cams():
    # Return a list of camera IDs with their device names
    # Frontend will use camera IDs for video feeds but display device names to users
    cams_with_names = []
    for cam_id in active_sources_by_id.keys():
        device_name = device_names_by_id.get(cam_id, cam_id)
        # Return camera ID, but the frontend will display the device name
        cams_with_names.append(device_name)
    return {"cams": cams_with_names, "cam_ids": list(active_sources_by_id.keys()), "cam_map": device_names_by_id}

@app.get("/video")
def video_feed(cam: str = Query(..., description="Camera id or device name")):
    # Support both camera IDs and device names
    cam_id = cam
    # If cam is a device name, find the corresponding camera ID
    if cam not in active_sources_by_id:
        # Try to find camera ID by device name
        for cid, devname in device_names_by_id.items():
            if devname == cam:
                cam_id = cid
                break
        if cam_id not in active_sources_by_id:
            raise HTTPException(404, f"Camera '{cam}' is not active")
    cam = cam_id  # Use camera ID for the rest of the function
    
    if cam not in active_sources_by_id:
        raise HTTPException(404, f"Camera '{cam}' is not active")

    async def gen():
        boundary = b"--frame\r\n"
        blank_wait = 0
        while True:
            buf = latest_jpeg.get(cam)
            if buf is None:
                blank_wait += 1
                if blank_wait % 250 == 0:
                    print(f"[video] waiting for frames from {cam}...")
                await asyncio.sleep(0.02); continue
            yield boundary
            yield b"Content-Type: image/jpeg\r\n\r\n" + buf + b"\r\n"
            await asyncio.sleep(0.02)
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/beep")
def beep():
    if os.path.exists(BEEP_FILE):
        return FileResponse(BEEP_FILE, media_type="audio/wav", filename="beep.wav")
    return {"error": "Beep file not found"}

@app.get("/freeze_beep")
def freeze_beep():
    if os.path.exists(FREEZE_BEEP_FILE):
        return FileResponse(FREEZE_BEEP_FILE, media_type="audio/wav", filename="freeze_beep.wav")
    return {"error": "Freeze beep file not found"}

@app.get("/events")
async def sse(request: Request):
    q: asyncio.Queue = asyncio.Queue()
    subscribers.append(q)
    async def gen():
        try:
            while True:
                if await request.is_disconnected(): break
                data = await q.get()
                yield {"event": "message", "data": json.dumps(data)}
        finally:
            if q in subscribers: subscribers.remove(q)
    return EventSourceResponse(gen())

@app.get("/stats")
def stats():
    last = events_log[-1]["human_time"] if events_log else "-"
    return {"count": len(events_log), "last": last}

# ---------------- Email Functions ----------------
# Rate limiting for emails (prevent too many rapid sends)
_last_email_time = {}
_email_cooldown = 10.0  # Minimum seconds between emails for same event type

def send_alert_email(event_data: Dict):
    """Send email notification for alerts (runs in thread pool)"""
    if not EMAIL_ENABLED:
        return
    
    # Rate limiting: prevent too many emails of the same type
    event_type = event_data.get('type', 'UNKNOWN')
    now = time.time()
    if event_type in _last_email_time:
        time_since_last = now - _last_email_time[event_type]
        if time_since_last < _email_cooldown:
            return  # Skip if sent recently
    
    try:
        cam_id = event_data.get('cam_id', 'Unknown')
        zone_id = event_data.get('zone_id', 'N/A')
        timestamp = event_data.get('human_time', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        
        # Generate subject based on event type
        if event_type == "ZONE_ALERT":
            subject = f"Security Alert: Unauthorized Entry in {zone_id} (Camera: {cam_id})"
        elif event_type == "FREEZE_ALERT":
            subject = f"Safety Alert: Loitering Detected in {zone_id} (Camera: {cam_id})"
        elif event_type == "PPE_VIOLATION":
            missing_ppe = event_data.get('missing_ppe', 'PPE items')
            subject = f"PPE Violation: Missing {missing_ppe} in {zone_id} (Camera: {cam_id})"
        else:
            subject = f"Alert: {event_type} in {zone_id} (Camera: {cam_id})"
        
        # Generate email body
        body_lines = [
            f"Alert from Camera Monitoring System",
            "",
            f"Event Type: {event_type}",
            f"Camera: {cam_id}",
            f"Zone: {zone_id}",
            f"Timestamp: {timestamp}",
        ]
        
        if event_data.get('track_id'):
            body_lines.append(f"Track ID: {event_data.get('track_id')}")
        if event_data.get('person_name'):
            body_lines.append(f"Person: {event_data.get('person_name')}")
        if event_data.get('missing_ppe'):
            body_lines.append(f"Missing PPE: {event_data.get('missing_ppe')}")
        if event_data.get('seconds_still'):
            body_lines.append(f"Duration: {event_data.get('seconds_still')} seconds")
        
        body_lines.extend([
            "",
            "Please review the incident and take appropriate action.",
            "",
            "This is an automated alert from the Vision Based Worker Tracking and Hazard Detection System."
        ])
        
        body = "\n".join(body_lines)
        
        # Create email message
        msg = EmailMessage()
        msg["From"] = EMAIL_CONFIG["sender"]
        msg["To"] = ", ".join(EMAIL_CONFIG["recipients"])
        msg["Subject"] = subject
        msg.set_content(body)
        
        # Send email with retry logic and timeout
        max_retries = 3
        retry_delay = 2.0  # seconds
        
        for attempt in range(max_retries):
            try:
                # Create SMTP connection with timeout
                server = smtplib.SMTP(EMAIL_CONFIG["smtp_server"], EMAIL_CONFIG["smtp_port"], timeout=30)
                server.set_debuglevel(0)  # Disable debug output
                
                try:
                    server.starttls()
                    server.login(EMAIL_CONFIG["sender"], EMAIL_CONFIG["password"])
                    server.send_message(msg)
                    _last_email_time[event_type] = now  # Update rate limit
                    print(f"[EMAIL] Sent alert email: {subject}")
                    return  # Success
                finally:
                    try:
                        server.quit()
                    except:
                        pass
                    server.close()
                    
            except (smtplib.SMTPException, OSError, ConnectionError) as e:
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    print(f"[EMAIL] Attempt {attempt + 1} failed: {e}. Retrying in {wait_time:.1f}s...")
                    time.sleep(wait_time)
                else:
                    raise  # Re-raise on final attempt
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"[EMAIL] Authentication failed: {e}. Check email credentials.")
    except smtplib.SMTPConnectError as e:
        print(f"[EMAIL] Connection failed: {e}. Check network/SMTP server.")
    except smtplib.SMTPServerDisconnected as e:
        print(f"[EMAIL] Server disconnected: {e}. May be rate-limited.")
    except Exception as e:
        print(f"[EMAIL] Failed to send email: {type(e).__name__}: {e}")

async def push_event(d: Dict):
    d = dict(d)
    d["human_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    events_log.append(d)
    
    # Save event to database (run in thread pool to avoid blocking)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(EXECUTOR, insert_event, d)
    
    # Send email for critical alerts (ZONE_ALERT, FREEZE_ALERT, PPE_VIOLATION)
    if d.get('type') in ['ZONE_ALERT', 'FREEZE_ALERT', 'PPE_VIOLATION']:
        await loop.run_in_executor(EXECUTOR, send_alert_email, d)
    
    # Broadcast to SSE subscribers
    for q in list(subscribers):
        try: await q.put(d)
        except: pass
    return JSONResponse({"ok": True})

def threadsafe_event(d: Dict):
    loop = app.state.loop
    if loop:
        asyncio.run_coroutine_threadsafe(push_event(d), loop)

# ---------------- Zones ----------------
def load_zones_for_cam(cam_id: str, frame_size: Tuple[int, int]) -> List[Dict]:
    w, h = frame_size
    primary = f"zones_{cam_id}.json"
    for candidate in (primary, ARGS.zones):
        if os.path.isfile(candidate):
            try:
                raw = json.load(open(candidate, "r"))
                out = []
                for i, z in enumerate(raw):
                    pts = clamp_pts(z["points"], w, h)
                    poly = fix_poly(Polygon(pts))
                    out.append({"id": z.get("zone_id", f"Z{i+1}"),
                                "label": z.get("label", "RESTRICTED"),
                                "poly": poly, "points": pts})
                if out:
                    print(f"[zones] loaded {len(out)} from {candidate} for {cam_id}")
                    return out
            except Exception as e:
                print(f"[zones] read error {candidate}: {e}")
    padw, padh = int(w * 0.2), int(h * 0.2)
    pts = [[padw, padh], [w - padw, padh], [w - padw, h - padh], [padw, h - padh]]
    return [{"id": "Z1", "label": "RESTRICTED", "poly": fix_poly(Polygon(pts)), "points": pts}]

# ---------------- Drawer (optional UI) ----------------
def draw_zones_interactive(cam_id: str, cam_src):
    cap = cv2.VideoCapture(cam_src, cv2.CAP_DSHOW); ok, frame = cap.read()
    if not (cap.isOpened() and ok):
        print(f"[draw] Camera {cam_id} open failed"); return
    polys=[]; current=[]
    win = f"DRAW ZONES ({cam_id}): L-click add point | n=finish | u=undo | r=remove | s=save | q=quit"
    cv2.namedWindow(win)
    def on_mouse(e,x,y,flags,param):
        nonlocal current
        if e==cv2.EVENT_LBUTTONDOWN: current.append((x,y))
    cv2.setMouseCallback(win,on_mouse)
    while True:
        vis = frame.copy()
        for pl in polys:
            for i in range(len(pl)): cv2.line(vis, pl[i], pl[(i+1)%len(pl)], (255,0,0), 2)
        for i in range(len(current)):
            cv2.line(vis, current[i], current[(i+1)%len(current)], (0,255,0), 2)
            cv2.circle(vis, current[i], 3, (0,255,0), -1)
        cv2.putText(vis, "n=finish, u=undo, r=remove, s=save, q=quit", (10,25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (50,200,50), 2)
        cv2.imshow(win, vis)
        k = cv2.waitKey(20) & 0xFF
        if k==ord('n') and len(current)>=3: polys.append(current.copy()); current=[]
        elif k==ord('u') and current: current.pop()
        elif k==ord('r') and polys: polys.pop()
        elif k==ord('s'):
            out=[]; idx=1
            if len(current)>=3: polys.append(current.copy()); current=[]
            for pl in polys:
                out.append({"zone_id":f"Z{idx}","label":"RESTRICTED","points":[list(p) for p in pl]}); idx+=1
            path = f"zones_{cam_id}.json"
            json.dump(out, open(path,"w"), indent=2)
            print(f"[draw] saved {len(out)} zone(s) to {path}")
            break
        elif k==ord('q') or k==27: break
    cap.release(); cv2.destroyAllWindows()

# ---------------- Tracking / Freeze ----------------
def iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    area = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) - inter
    return inter / max(area, 1e-6)

def check_ppe_compliance(person_box, ppe_detections, helmet_classes=[0], vest_classes=[1], iou_thresh=0.3):
    """
    Check if a person has required PPE equipment.
    
    Args:
        person_box: (x1, y1, x2, y2) bounding box of person
        ppe_detections: List of (x1, y1, x2, y2, class_id) tuples for PPE items
        helmet_classes: List of class IDs that represent helmets
        vest_classes: List of class IDs that represent vests
        iou_thresh: Minimum IoU to consider PPE as belonging to person
    
    Returns:
        (has_helmet: bool, has_vest: bool)
    """
    has_helmet = False
    has_vest = False
    
    px1, py1, px2, py2 = person_box
    person_height = py2 - py1
    person_width = px2 - px1
    
    # Expand person box slightly for PPE matching
    expanded_box = (
        px1 - person_width * 0.1,
        py1 - person_height * 0.1,
        px2 + person_width * 0.1,
        py2 + person_height * 0.1
    )
    
    for ppe_item in ppe_detections:
        ppe_x1, ppe_y1, ppe_x2, ppe_y2, ppe_class = ppe_item
        ppe_box = (ppe_x1, ppe_y1, ppe_x2, ppe_y2)
        
        # Check if PPE item overlaps with person (or is inside person box)
        overlap = iou(expanded_box, ppe_box)
        
        if overlap > iou_thresh:
            if ppe_class in helmet_classes:
                has_helmet = True
            elif ppe_class in vest_classes:
                has_vest = True
    
    return has_helmet, has_vest

class TrackState:
    def __init__(self, tid, box, now_ts, shake_thresh=20):
        self.tid = tid
        self.box = box
        self.cx, self.cy = self._centroid(box)
        self.last_ts = now_ts
        self.vel_hist = deque(maxlen=45)
        self.low_since = None
        self.last_freeze_emit = 0.0
        self.last_zone_emit = 0.0
        self.last_classify = 0.0
        self.visible_frames = 0
        self.missed = 0
        self.in_zone = False
        self.zone_entry_time = None  # When person entered the zone
        self.zone_accumulated_time = 0.0  # Total time spent in zone (handles brief exits)
        self.last_zone_exit_time = None  # Track when they left zone
        self.shake_thresh = shake_thresh  # Increased to 20px to handle bounding box jitter
        self.shake_anchor = (self.cx, self.cy)
        self.anchor_history = deque(maxlen=10)  # Track recent anchor positions for jitter tolerance
        # persisted allow status
        self.is_allowed: bool = False
        self.allowed_name: str = ""
        # PPE (Personal Protective Equipment) status
        self.has_helmet: bool = False
        self.has_vest: bool = False
        self.ppe_compliant: bool = True  # Default to compliant if PPE not required
        self.last_ppe_emit: float = 0.0  # Last PPE violation alert time

    def _centroid(self, b):
        x1, y1, x2, y2 = b
        return ((x1 + x2) // 2, (y1 + y2) // 2)

    def update(self, box, now_ts):
        x1, y1, x2, y2 = box
        nx, ny = self._centroid(box)
        dist = ((nx - self.cx) ** 2 + (ny - self.cy) ** 2) ** 0.5

        # Calculate bounding box size for relative jitter tolerance
        box_width = x2 - x1
        box_height = y2 - y1
        box_size = max(box_width, box_height, 50)  # Minimum 50px to avoid division issues
        
        # Use relative threshold: allow jitter up to 10% of box size or absolute 20px, whichever is larger
        relative_thresh = max(self.shake_thresh, box_size * 0.1)

        if dist < relative_thresh:
            vel = 0.0
        else:
            dt = max(now_ts - self.last_ts, 1e-3)
            vel = dist / dt

        self.vel_hist.append((now_ts, vel))

        if vel < ARGS.freeze_eps:
            if self.low_since is None:
                self.low_since = now_ts
                self.shake_anchor = (nx, ny)
                self.anchor_history.clear()
                self.anchor_history.append((nx, ny))
            else:
                # Track anchor history for jitter tolerance
                self.anchor_history.append((nx, ny))
                
                # Calculate average position from recent history to smooth out jitter
                if len(self.anchor_history) >= 3:
                    avg_x = sum(x for x, y in self.anchor_history) / len(self.anchor_history)
                    avg_y = sum(y for x, y in self.anchor_history) / len(self.anchor_history)
                    # Check drift from original anchor, not current position
                    ax, ay = self.shake_anchor
                    drift = ((avg_x - ax) ** 2 + (avg_y - ay) ** 2) ** 0.5
                    # Use larger drift threshold: 15% of box size or 30px, whichever is larger
                    drift_thresh = max(30, box_size * 0.15)
                    if drift > drift_thresh:
                        # Significant movement detected, reset freeze timer
                        self.low_since = None
                        self.shake_anchor = (nx, ny)
                        self.anchor_history.clear()
                        self.anchor_history.append((nx, ny))
                else:
                    # Not enough history yet, check simple drift
                    ax, ay = self.shake_anchor
                    drift = ((nx - ax) ** 2 + (ny - ay) ** 2) ** 0.5
                    drift_thresh = max(30, box_size * 0.15)
                    if drift > drift_thresh:
                        self.low_since = None
                        self.shake_anchor = (nx, ny)
                        self.anchor_history.clear()
                        self.anchor_history.append((nx, ny))
        else:
            # Movement detected, reset freeze tracking
            self.low_since = None
            self.shake_anchor = (nx, ny)
            self.anchor_history.clear()
            self.anchor_history.append((nx, ny))

        self.box = box
        self.cx, self.cy = nx, ny
        self.last_ts = now_ts
        self.visible_frames += 1
        self.missed = 0

    def frozen_now(self, now_ts):
        """
        Check if person is frozen:
        - Must be inside a restricted zone
        - Movement (velocity) must have been below freeze_eps for at least
          freeze_sustain seconds (with jitter tolerance handled in update()).
        This ensures we trigger on low-movement (unconscious/fallen) people,
        not on normally walking people.
        """
        if not self.in_zone:
            return False

        if self.low_since is None:
            return False

        frozen_duration = now_ts - self.low_since
        return frozen_duration >= ARGS.freeze_sustain

# ---------------- DeepFace: single entry-time classifier (separate function) ----------------
# ---------------- DeepFace: single entry-time classifier (separate function) ----------------
def deepface_classify_and_store(
    frame_bgr: np.ndarray,
    cam_id: str,
    zone_id: str,
    bbox: Optional[Tuple[int, int, int, int]] = None,
) -> Tuple[bool, str]:
    """
    Classify ALLOWED vs NOT ALLOWED against allowlist and store to DB.
    - Crops to bbox if provided and large enough; otherwise uses full frame.
    - Returns (is_allowed, matched_name).
    - Persists to SQLite:
        * recognitions: always (allowed=1/0)
        * allowed_recognitions: only when allowed
    - Emits FACE_CLASSIFIED SSE event.
    - Prints result to CLI for debugging.
    """
    # Check if known faces are loaded
    if len(KNOWN_FACE_PATHS) == 0:
        print(f"[DeepFace] ⚠️ No known faces loaded! Check {ARGS.allowlist_dir} directory")
        is_allowed = False
        matched_name = "Unknown"
    else:
        H, W = frame_bgr.shape[:2]
        # crop selection - focus on upper body/head region for better face detection
        if bbox is not None:
            x1, y1, x2, y2 = bbox
            if (x2 - x1) >= ARGS.min_face and (y2 - y1) >= ARGS.min_face:
                # Focus on upper 60% of person bbox (where face typically is)
                person_height = y2 - y1
                face_region_height = int(person_height * 0.6)
                
                x1c = max(0, x1)
                y1c = max(0, y1)
                x2c = min(W - 1, x2)
                y2c = min(H - 1, y1 + face_region_height)
                
                # Add some padding around the face region
                padding_x = int((x2 - x1) * 0.1)
                padding_y = int((y2 - y1) * 0.1)
                x1c = max(0, x1c - padding_x)
                y1c = max(0, y1c - padding_y)
                x2c = min(W - 1, x2c + padding_x)
                y2c = min(H - 1, y2c + padding_y)
                
                crop_bgr = frame_bgr[y1c:y2c, x1c:x2c]
            else:
                print(f"[DeepFace] ⚠️ Bbox too small ({x2-x1}x{y2-y1}), using full frame")
                crop_bgr = frame_bgr
        else:
            crop_bgr = frame_bgr

        # Validate crop
        if crop_bgr is None or crop_bgr.size == 0:
            print(f"[DeepFace] ⚠️ Invalid crop, skipping verification")
            is_allowed = False
            matched_name = "Unknown"
        else:
            # Convert BGR to RGB for DeepFace
            crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
            
            # Validate crop dimensions
            if crop_rgb.shape[0] < 50 or crop_rgb.shape[1] < 50:
                print(f"[DeepFace] ⚠️ Crop too small ({crop_rgb.shape[1]}x{crop_rgb.shape[0]}), skipping")
                is_allowed = False
                matched_name = "Unknown"
            else:
                # Run DeepFace.verify against all known faces
                is_allowed = False
                matched_name = "Unknown"
                
                print(f"[DeepFace] 🔍 Verifying against {len(KNOWN_FACE_PATHS)} known face(s) using {ARGS.face_model}...")
                
                for name, ref_path in KNOWN_FACE_PATHS:
                    try:
                        # Check if reference file exists
                        if not os.path.exists(ref_path):
                            print(f"[DeepFace] ⚠️ Reference file not found: {ref_path}")
                            continue
                        
                        # Use custom threshold if provided, otherwise use model default
                        res = DeepFace.verify(
                            img1_path=crop_rgb,
                            img2_path=ref_path,
                            enforce_detection=False,
                            detector_backend="opencv",
                            model_name=ARGS.face_model,
                            distance_metric="cosine",
                            align=True,
                            expand_percentage=10,  # Expand face area by 10% for better detection
                            silent=True,  # Suppress verbose output
                            threshold=ARGS.face_threshold,  # Use custom threshold
                        )
                        
                        distance = res.get("distance", 999)
                        threshold_used = res.get("threshold", ARGS.face_threshold)
                        verified = res.get("verified", False)
                        
                        # Use only the verified result from DeepFace (it already uses our threshold)
                        # For cosine distance, lower is better. DeepFace.verify already checks distance < threshold
                        if verified:
                            print(f"[DeepFace] ✅ Match found: {name} (distance={distance:.3f}, threshold={threshold_used:.3f})")
                            is_allowed = True
                            matched_name = name
                            break
                        else:
                            print(f"[DeepFace] ❌ No match with {name} (distance={distance:.3f}, threshold={threshold_used:.3f})")
                    except Exception as e:
                        print(f"[DeepFace] ⚠️ Error verifying against {name}: {type(e).__name__}: {e}")
                        # Only print full traceback for unexpected errors, not for "no face detected"
                        if "No face detected" not in str(e) and "could not detect a face" not in str(e).lower():
                            import traceback
                            traceback.print_exc()
                        continue

    # ---- Print to CLI ----
    if is_allowed:
        print(f"[DeepFace] ✅ Allowed: {matched_name} (cam={cam_id}, zone={zone_id})")
    else:
        print(f"[DeepFace] ❌ Not allowed / no match (cam={cam_id}, zone={zone_id})")

    # Persist one image per entry
    os.makedirs("captures", exist_ok=True)
    fname = f"{cam_id}_{zone_id}_{int(time.time()*1000)}.jpg"
    out_path = os.path.join("captures", fname)
    try:
        cv2.imwrite(out_path, frame_bgr)
    except Exception as e:
        print(f"[deepface] failed to save frame: {e}")
        out_path = ""

    # SSE event (also saves to database via push_event)
    evt = {
        "type": "FACE_CLASSIFIED",
        "cam_id": cam_id,
        "zone_id": zone_id,
        "allowed": bool(is_allowed),
        "class_name": matched_name,
        "image_path": out_path,
        "timestamp": int(time.time()),
    }
    threadsafe_event(evt)

    return is_allowed, matched_name

# ---------- API: classify the latest live frame from a camera ----------
class LiveClassifyBody(BaseModel):
    cam_id: str
    zone_id: str = "Z?"
    # Optional bbox: [x1, y1, x2, y2]
    bbox: Optional[Tuple[int, int, int, int]] = None

@app.post("/classify_live")
def classify_live(body: LiveClassifyBody):
    """
    Uses the most recent JPEG stored in latest_jpeg[cam_id].
    Calls deepface_classify_and_store(frame, cam_id, zone_id, bbox).
    Returns {allowed, class_name}. Also emits FACE_CLASSIFIED via SSE.
    """
    # Ensure camera is active and we have a frame
    if body.cam_id not in active_sources_by_id:
        raise HTTPException(404, f"Camera '{body.cam_id}' is not active")

    buf = latest_jpeg.get(body.cam_id)
    if not buf:
        raise HTTPException(503, f"No recent frame for camera '{body.cam_id}'")

    # Decode the stored JPEG to a BGR frame
    npbuf = np.frombuffer(buf, dtype=np.uint8)
    frame_bgr = cv2.imdecode(npbuf, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise HTTPException(500, "Failed to decode latest frame")

    allowed, matched = deepface_classify_and_store(
        frame_bgr=frame_bgr,
        cam_id=body.cam_id,
        zone_id=body.zone_id,
        bbox=body.bbox,
    )

    return {
        "ok": True,
        "cam_id": body.cam_id,
        "zone_id": body.zone_id,
        "allowed": bool(allowed),
        "class_name": matched,
        # Note: the helper already saved an image and pushed SSE
    }


# ---------- API: classify an uploaded image (multipart/form-data) ----------
@app.post("/classify_upload")
async def classify_upload(
    file: UploadFile = File(...),
    cam_id: str = Form("upload"),
    zone_id: str = Form("Z?"),
    bbox: Optional[str] = Form(None),
):
    """
    Accepts an uploaded image and optional bbox (as 'x1,y1,x2,y2').
    Calls deepface_classify_and_store(frame, cam_id, zone_id, bbox).
    Returns {allowed, class_name}. Also emits FACE_CLASSIFIED via SSE.
    """
    # Read file into memory and decode via OpenCV
    try:
        raw = await file.read()
        npbuf = np.frombuffer(raw, dtype=np.uint8)
        frame_bgr = cv2.imdecode(npbuf, cv2.IMREAD_COLOR)
        if frame_bgr is None:
            raise ValueError("cv2.imdecode returned None")
    except Exception as e:
        raise HTTPException(400, f"Invalid image upload: {e}")

    # Parse optional bbox "x1,y1,x2,y2"
    bbox_tuple: Optional[Tuple[int, int, int, int]] = None
    if bbox:
        try:
            parts = [int(v.strip()) for v in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError("bbox must have 4 comma-separated integers")
            bbox_tuple = (parts[0], parts[1], parts[2], parts[3])
        except Exception as e:
            raise HTTPException(400, f"Bad bbox format: {e}")

    allowed, matched = deepface_classify_and_store(
        frame_bgr=frame_bgr,
        cam_id=cam_id,
        zone_id=zone_id,
        bbox=bbox_tuple,
    )

    return {
        "ok": True,
        "cam_id": cam_id,
        "zone_id": zone_id,
        "allowed": bool(allowed),
        "class_name": matched,
        "source": "upload",
    }


# ---------------- Camera Worker ----------------
class CameraWorker(threading.Thread):
    def __init__(self, cam_id: str, cam_index: int, model_path: str):
        super().__init__(daemon=True)
        self.cam_id = cam_id
        self.cam_index = cam_index
        self.model_path = model_path
        self.stop_flag = False

    def stop(self):
        self.stop_flag = True

    def _open_cap(self, index: int):
        for backend in (0, cv2.CAP_DSHOW, cv2.CAP_MSMF):
            cap = cv2.VideoCapture(index, backend) if backend != 0 else cv2.VideoCapture(index)
            if not cap.isOpened():
                cap.release(); continue
            ok = False; t0 = time.time()
            while time.time() - t0 < 1.0:
                r, _ = cap.read()
                if r: ok = True; break
                time.sleep(0.02)
            if ok: return cap
            cap.release()
        return None

    def run(self):
        global latest_jpeg

        # Probe size
        probe = self._open_cap(self.cam_index)
        if probe is None:
            print(f"[{self.cam_id}] camera open/read failed (index {self.cam_index})"); return
        ok, fr = probe.read()
        if not ok or fr is None:
            print(f"[{self.cam_id}] camera read failed on probe"); probe.release(); return
        h, w = fr.shape[:2]; probe.release()

        zones = load_zones_for_cam(self.cam_id, (w, h))

        model_file = self.model_path if os.path.isfile(self.model_path) else "yolov8n.pt"
        if model_file != self.model_path:
            print(f"[{self.cam_id}] {self.model_path} not found; using {model_file}")
        # Initialize YOLO with GPU if available
        model = YOLO(model_file)
        # Enable half precision if CUDA available for speed
        device = 'cuda:0' if cv2.cuda.getCudaEnabledDeviceCount() > 0 else 'cpu'
        print(f"[{self.cam_id}] Using device: {device}")
        
        # Initialize PPE detection model if enabled
        ppe_model = None
        if ARGS.enable_ppe:
            ppe_model_file = ARGS.ppe_model if os.path.isfile(ARGS.ppe_model) else model_file
            ppe_model = YOLO(ppe_model_file)
            print(f"[{self.cam_id}] PPE detection enabled (helmet: {ARGS.require_helmet}, vest: {ARGS.require_vest})")

        cap = self._open_cap(self.cam_index)
        if cap is None:
            print(f"[{self.cam_id}] cannot open cam again"); return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)

        fail_reads = 0
        next_tid = 1
        tracks: Dict[int, TrackState] = {}
        IOU_MATCH = 0.45
        frame_count = 0
        last_processed_frame = None

        while not self.stop_flag:
            ok, frame = cap.read()
            if not ok or frame is None:
                fail_reads += 1
                time.sleep(0.02)
                if fail_reads > 50:
                    cap.release()
                    cap = self._open_cap(self.cam_index)
                    fail_reads = 0
                    if cap is None: time.sleep(0.5)
                continue
            fail_reads = 0
            frame_count += 1

            # Frame skipping: process detection only on every Nth frame
            should_process = (frame_count % ARGS.skip_frames) == 0
            
            if should_process:
                # Person detection
                res = model.predict(frame, imgsz=ARGS.imgsz, conf=ARGS.conf, classes=[0], verbose=False, device=device)
                boxes_np = res[0].boxes.xyxy.cpu().numpy() if len(res) else np.empty((0,4))
                dets = [tuple(map(int, b[:4])) for b in boxes_np]
                
                # PPE detection (helmet and vest) if enabled
                ppe_detections = []
                if ARGS.enable_ppe and ppe_model is not None:
                    # Note: For PPE detection, you need a model trained on helmet/vest classes
                    # Standard COCO model doesn't have these. You'd use a custom PPE model.
                    # For demonstration, we'll assume: class 0=helmet, class 1=vest in custom model
                    # If using standard COCO, this won't detect anything useful
                    try:
                        ppe_res = ppe_model.predict(frame, imgsz=ARGS.imgsz, conf=ARGS.conf, verbose=False, device=device)
                        if len(ppe_res) and len(ppe_res[0].boxes):
                            ppe_boxes = ppe_res[0].boxes.xyxy.cpu().numpy()
                            ppe_classes = ppe_res[0].boxes.cls.cpu().numpy()
                            ppe_confs = ppe_res[0].boxes.conf.cpu().numpy()
                            helmet_count = 0
                            vest_count = 0
                            for i in range(len(ppe_boxes)):
                                x1, y1, x2, y2 = map(int, ppe_boxes[i][:4])
                                cls_id = int(ppe_classes[i])
                                conf = float(ppe_confs[i])
                                ppe_detections.append((x1, y1, x2, y2, cls_id))
                                # Count helmets and vests
                                if cls_id == 0:  # Helmet
                                    helmet_count += 1
                                elif cls_id == 1:  # Vest
                                    vest_count += 1
                            if frame_count % 30 == 0:  # Log every 30 frames
                                print(f"[{self.cam_id}] PPE detected: {helmet_count} helmets, {vest_count} vests (total: {len(ppe_detections)} items)")
                                # Debug: Show all detected class IDs and confidences
                                class_ids = [int(c) for c in ppe_classes]
                                class_confs = [f"{c:.2f}" for c in ppe_confs]
                                print(f"[{self.cam_id}] PPE class IDs: {class_ids}")
                                print(f"[{self.cam_id}] PPE confidences: {class_confs}")
                                print(f"[{self.cam_id}] Looking for helmet classes: {ARGS.helmet_classes}, vest classes: {ARGS.vest_classes}")
                        elif frame_count % 60 == 0:  # Warn if no PPE detected
                            print(f"[{self.cam_id}] ⚠️ No PPE items detected. Using standard COCO model? Need custom PPE model!")
                    except Exception as e:
                        print(f"[{self.cam_id}] PPE detection error: {e}")

                now_ts = time.time()
                unmatched = set(range(len(dets)))
                det_to_tid: Dict[int, int] = {}

                # Match to existing tracks
                for tid, ts in list(tracks.items()):
                    best_k, best_iou = None, 0.0
                    for k in unmatched:
                        i = iou(ts.box, dets[k])
                        if i > best_iou:
                            best_iou, best_k = i, k
                    if best_k is not None and best_iou >= IOU_MATCH:
                        ts.update(dets[best_k], now_ts)
                        det_to_tid[best_k] = tid
                        unmatched.remove(best_k)
                    else:
                        ts.missed += 1
                        if ts.missed > 30:
                            tracks.pop(tid, None)

                for k in list(unmatched):
                    ts = TrackState(next_tid, dets[k], now_ts)
                    tracks[next_tid] = ts
                    det_to_tid[k] = next_tid
                    next_tid += 1
                
                # Cache the processed frame data for skipped frames
                last_processed_frame = {
                    'dets': dets,
                    'det_to_tid': det_to_tid,
                    'boxes_np': boxes_np,
                    'now_ts': now_ts,
                    'ppe_detections': ppe_detections
                }
            else:
                # Use cached detection results from last processed frame
                if last_processed_frame is not None:
                    dets = last_processed_frame['dets']
                    det_to_tid = last_processed_frame['det_to_tid']
                    boxes_np = last_processed_frame['boxes_np']
                    now_ts = time.time()
                    ppe_detections = last_processed_frame.get('ppe_detections', [])
                else:
                    # No cached frame yet, skip this iteration
                    continue

            # Draw zones
            vis = frame.copy()
            for z in zones:
                pts = z["points"]
                for i in range(len(pts)):
                    p1 = tuple(map(int, pts[i])); p2 = tuple(map(int, pts[(i+1)%len(pts)]))
                    cv2.line(vis, p1, p2, ZONE_COLOR, 2)

            H, W = frame.shape[:2]

            # Per detection: zone check, FREEZE, entry-time classification, and draw
            for i, b in enumerate(boxes_np):
                x1, y1, x2, y2 = map(int, b[:4])
                px = int((x1 + x2) // 2); py = int((y1 + y2) // 2)

                # In-zone?
                in_zone, triggered_zone = False, None
                if ARGS.hit == "center":
                    p = Point((px, py))
                    for z in zones:
                        if z["poly"].contains(p): in_zone, triggered_zone = True, z; break
                elif ARGS.hit == "feet":
                    p = Point((px, int(y2)))
                    for z in zones:
                        if z["poly"].contains(p): in_zone, triggered_zone = True, z; break
                else:
                    bb = shapely_box(x1, y1, x2, y2)
                    for z in zones:
                        try: inter_area = bb.intersection(z["poly"]).area
                        except Exception:
                            try: inter_area = bb.buffer(0).intersection(z["poly"].buffer(0)).area
                            except Exception: continue
                        ratio = inter_area / max(bb.area, 1.0)
                        if ratio >= ARGS.overlap_thresh: in_zone, triggered_zone = True, z; break

                tid = det_to_tid.get(i)
                ts: Optional[TrackState] = tracks.get(tid) if tid is not None else None
                if ts is not None:
                    prev_in_zone = ts.in_zone
                    ts.in_zone = in_zone
                    
                    # Track zone presence time (for freeze detection with jittery bounding boxes)
                    if in_zone:
                        if ts.zone_entry_time is None:
                            # Just entered zone
                            ts.zone_entry_time = now_ts
                            ts.zone_accumulated_time = 0.0
                            ts.last_zone_exit_time = None
                        else:
                            # Still in zone - accumulate time
                            if ts.last_zone_exit_time is not None:
                                # Was out briefly, add accumulated time before exit
                                time_before_exit = ts.last_zone_exit_time - ts.zone_entry_time
                                ts.zone_accumulated_time += time_before_exit
                                ts.zone_entry_time = now_ts  # Reset entry time
                                ts.last_zone_exit_time = None
                            # Current continuous time in zone
                            continuous_time = now_ts - ts.zone_entry_time
                            total_zone_time = ts.zone_accumulated_time + continuous_time
                    else:
                        # Left zone
                        if ts.zone_entry_time is not None:
                            # Accumulate time spent in zone before exit
                            time_in_zone = now_ts - ts.zone_entry_time
                            ts.zone_accumulated_time += time_in_zone
                            ts.last_zone_exit_time = now_ts
                            # Keep zone_entry_time for brief exits (within 2 seconds, consider still in zone)
                            if ts.last_zone_exit_time is not None and (now_ts - ts.last_zone_exit_time) > 2.0:
                                ts.zone_entry_time = None
                                ts.zone_accumulated_time = 0.0  # Reset if out for more than 2 seconds
                    
                    # Check PPE compliance if enabled (check every frame for visual indicators)
                    if ARGS.enable_ppe:
                        person_box = (x1, y1, x2, y2)
                        helmet_classes = [int(x) for x in ARGS.helmet_classes.split(',')]
                        vest_classes = [int(x) for x in ARGS.vest_classes.split(',')]
                        has_helmet, has_vest = check_ppe_compliance(
                            person_box, ppe_detections,
                            helmet_classes=helmet_classes,
                            vest_classes=vest_classes
                        )
                        ts.has_helmet = has_helmet
                        ts.has_vest = has_vest
                        
                        # Determine PPE compliance based on requirements
                        helmet_ok = has_helmet if ARGS.require_helmet else True
                        vest_ok = has_vest if ARGS.require_vest else True
                        ts.ppe_compliant = helmet_ok and vest_ok

                    # On ENTRY into zone -> classify once via the separate function
                    if in_zone and not prev_in_zone and (now_ts - ts.last_classify) >= ARGS.classify_cooldown:
                        zone_id = triggered_zone["id"] if triggered_zone else "Z?"
                        allowed, name = deepface_classify_and_store(
                            frame_bgr=frame,
                            cam_id=self.cam_id,
                            zone_id=zone_id,
                            bbox=(x1, y1, x2, y2),
                        )
                        ts.is_allowed = bool(allowed)
                        ts.allowed_name = name if allowed else ""
                        ts.last_classify = now_ts
                        
                        # IMMEDIATE PPE check on zone entry (critical for safety)
                        if ARGS.enable_ppe and not ts.ppe_compliant:
                            missing_items = []
                            if ARGS.require_helmet and not ts.has_helmet:
                                missing_items.append("helmet")
                            if ARGS.require_vest and not ts.has_vest:
                                missing_items.append("vest")
                            
                            print(f"[{self.cam_id}] 🦺 PPE VIOLATION on zone entry! Track {ts.tid} missing: {', '.join(missing_items)}")
                            
                            evt = {
                                "type": "PPE_VIOLATION",
                                "cam_id": self.cam_id,
                                "track_id": ts.tid,
                                "zone_id": zone_id,
                                "label": "PPE VIOLATION - ZONE ENTRY",
                                "missing_ppe": ", ".join(missing_items),
                                "has_helmet": ts.has_helmet,
                                "has_vest": ts.has_vest,
                                "timestamp": int(now_ts),
                            }
                            threadsafe_event(evt)
                            ts.last_ppe_emit = now_ts

                # Decide events (zone / freeze); drawing happens after this
                if ts is not None:
                    # Continuous PPE violation alert while in zone (with cooldown to prevent spam)
                    # Only check PPE for NOT allowed people
                    if ARGS.enable_ppe and in_zone and not ts.ppe_compliant and not ts.is_allowed:
                        if (now_ts - ts.last_ppe_emit) >= ARGS.ppe_cooldown:
                            missing_items = []
                            if ARGS.require_helmet and not ts.has_helmet:
                                missing_items.append("helmet")
                            if ARGS.require_vest and not ts.has_vest:
                                missing_items.append("vest")
                            
                            print(f"[{self.cam_id}] 🦺 PPE VIOLATION! Track {ts.tid} in zone without: {', '.join(missing_items)}")
                            
                            evt = {
                                "type": "PPE_VIOLATION",
                                "cam_id": self.cam_id,
                                "track_id": ts.tid,
                                "zone_id": triggered_zone["id"] if triggered_zone else "Z?",
                                "label": "PPE VIOLATION",
                                "missing_ppe": ", ".join(missing_items),
                                "has_helmet": ts.has_helmet,
                                "has_vest": ts.has_vest,
                                "timestamp": int(now_ts),
                            }
                            threadsafe_event(evt)
                            ts.last_ppe_emit = now_ts
                    
                    # Intrusion alert only for NOT allowed
                    if in_zone and not ts.is_allowed:
                        if (now_ts - ts.last_zone_emit) >= ARGS.zone_cooldown:
                            evt = {
                                "type": "ZONE_ALERT",
                                "cam_id": self.cam_id,
                                "track_id": ts.tid,
                                "zone_id": triggered_zone["id"] if triggered_zone else "Z?",
                                "label": "INTRUSION",
                                "timestamp": int(now_ts),
                            }
                            threadsafe_event(evt)
                            ts.last_zone_emit = now_ts

                    # Freeze alert for anyone frozen in zone for 30 seconds (including allowed people)
                    # This detects unconscious/fallen people who may need assistance
                    if ts.frozen_now(now_ts):
                        if (now_ts - ts.last_freeze_emit) >= ARGS.freeze_cooldown:
                            evt = {
                                "type": "FREEZE_ALERT",
                                "cam_id": self.cam_id,
                                "track_id": ts.tid,
                                "zone_id": triggered_zone["id"] if triggered_zone else "Z?",
                                "label": "FREEZE",
                                "seconds_still": int(now_ts - (ts.low_since or now_ts)),
                                "is_allowed": ts.is_allowed if ts else False,
                                "timestamp": int(now_ts),
                            }
                            threadsafe_event(evt)
                            # Play audio alert if available (frontend will play beep_cameraA.wav)
                            if PYGAME_AVAILABLE and os.path.exists(FREEZE_BEEP_FILE):
                                try:
                                    pygame.mixer.music.load(FREEZE_BEEP_FILE)
                                    pygame.mixer.music.play()
                                except Exception as e:
                                    print(f"[FREEZE ALERT] Beep failed: {e}")
                            ts.last_freeze_emit = now_ts

                # ── Draw: boxes with color coding
                # Color priority: Freeze > PPE violation > Zone alert > Safe
                
                # Determine color based on state
                is_frozen = False
                if ts is not None:
                    is_frozen = ts.frozen_now(now_ts)
                    if is_frozen:
                        # Pink for freeze (highest priority) - applies to ALL people, including allowed
                        color = FREEZE_COLOR
                        # Debug: print freeze status (only once per freeze event)
                        # Calculate total zone time
                        if ts.zone_entry_time is not None:
                            continuous_time = now_ts - ts.zone_entry_time
                            total_zone_time = ts.zone_accumulated_time + continuous_time
                            seconds_frozen = int(total_zone_time)
                        else:
                            seconds_frozen = int(now_ts - (ts.low_since or now_ts))
                        if not hasattr(ts, '_freeze_debug_printed') or not ts._freeze_debug_printed:
                            print(f"[{self.cam_id}] 🧊 FREEZE DETECTED! Track {ts.tid} in zone for {seconds_frozen}s (box should be PINK)")
                            ts._freeze_debug_printed = True
                    else:
                        # Reset debug flag when not frozen
                        if hasattr(ts, '_freeze_debug_printed'):
                            ts._freeze_debug_printed = False
                        if ARGS.enable_ppe and in_zone and not ts.ppe_compliant:
                            # Orange for PPE violation
                            color = (0, 165, 255)
                        elif in_zone and not ts.is_allowed:
                            # Red for restricted zone intrusion
                            color = ALERT_COLOR
                        else:
                            # Green for safe (outside zone or allowed)
                            color = SAFE_COLOR
                elif in_zone:
                    # Red for restricted zone intrusion (no track state)
                    color = ALERT_COLOR
                else:
                    # Green for safe
                    color = SAFE_COLOR

                # Draw the bounding box with the determined color
                cv2.rectangle(vis, (x1, y1), (x2, y2), color, 3)  # Increased thickness to 3 for better visibility
                if ARGS.hit in ("feet", "center"):
                    cv2.circle(vis, (px, py if ARGS.hit == "center" else y2), 4, color, -1)
                
                # Add FREEZE label if frozen
                if is_frozen and ts is not None:
                    freeze_label = f"FREEZE ({int(now_ts - (ts.low_since or now_ts))}s)"
                    label_size = cv2.getTextSize(freeze_label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                    # Draw background for freeze label
                    cv2.rectangle(vis, (x1, y1 - label_size[1] - 8), 
                                (x1 + label_size[0] + 8, y1 + 4), FREEZE_COLOR, -1)
                    cv2.putText(vis, freeze_label, (x1 + 4, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
                
                # For allowed people, show name above the box (but box color still follows freeze priority)
                if ts is not None and ts.is_allowed and not is_frozen:
                    band_y1 = max(0, y1 - 8)
                    name = ts.allowed_name if ts.allowed_name else "ALLOWED"
                    # Draw background for text (use green background for allowed, but box can be pink if frozen)
                    text_size = cv2.getTextSize(name, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                    cv2.rectangle(vis, (x1, band_y1 - text_size[1] - 4), 
                                (x1 + text_size[0] + 8, band_y1 + 4), (0, 150, 0), -1)
                    cv2.putText(vis, name, (x1 + 4, band_y1),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                
                # Draw PPE status indicators if enabled and in zone (for non-allowed people)
                if ts is not None and not ts.is_allowed:
                    # Draw PPE status indicators if enabled and in zone
                    if ARGS.enable_ppe and ts is not None and in_zone:
                        ppe_y = y1 - 10
                        # Helmet indicator
                        if ARGS.require_helmet:
                            helmet_text = "H: ✓" if ts.has_helmet else "H: ✗"
                            helmet_color = (0, 255, 0) if ts.has_helmet else (0, 0, 255)
                            cv2.putText(vis, helmet_text, (x1, ppe_y), 
                                      cv2.FONT_HERSHEY_SIMPLEX, 0.5, helmet_color, 2, cv2.LINE_AA)
                        # Vest indicator
                        if ARGS.require_vest:
                            vest_text = "V: ✓" if ts.has_vest else "V: ✗"
                            vest_color = (0, 255, 0) if ts.has_vest else (0, 0, 255)
                            vest_x = x1 + 60 if ARGS.require_helmet else x1
                            cv2.putText(vis, vest_text, (vest_x, ppe_y), 
                                      cv2.FONT_HERSHEY_SIMPLEX, 0.5, vest_color, 2, cv2.LINE_AA)

            # Encode frame - use lower quality for better performance
            ok, jpg = cv2.imencode(".jpg", vis, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok:
                latest_jpeg[self.cam_id] = jpg.tobytes()

        cap.release()

# ---------------- PDF Report Generation ----------------
import io
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from datetime import datetime, timedelta

def generate_report_charts(start_date: str = None, end_date: str = None):
    """Generate all charts for the PDF report and return as BytesIO objects"""
    charts = {}
    
    # Connect to database
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    
    try:
        # Build date filter
        date_filter = ""
        params = []
        if start_date and end_date:
            date_filter = "WHERE timestamp BETWEEN ? AND ?"
            params = [start_date, end_date]
        elif start_date:
            date_filter = "WHERE timestamp >= ?"
            params = [start_date]
        elif end_date:
            date_filter = "WHERE timestamp <= ?"
            params = [end_date]
        
        # Get all events
        query = f"SELECT * FROM recognitions {date_filter} ORDER BY timestamp DESC"
        cursor = con.execute(query, params)
        events = [dict(row) for row in cursor.fetchall()]
        
        if not events:
            return None, {"total_events": 0, "message": "No events found for the selected period"}
        
        df = pd.DataFrame(events)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Calculate statistics
        stats = {
            "total_events": len(events),
            "date_range": f"{df['timestamp'].min().strftime('%Y-%m-%d %H:%M')} to {df['timestamp'].max().strftime('%Y-%m-%d %H:%M')}",
            "event_types": {},
            "cameras": {},
            "zones": {},
            "persons": {}
        }
        
        # Event type counts
        event_type_counts = df['event_type'].value_counts()
        stats["event_types"] = event_type_counts.to_dict()
        
        # Camera counts
        camera_counts = df['cam_id'].value_counts()
        stats["cameras"] = camera_counts.to_dict()
        
        # Zone counts (excluding None)
        zone_counts = df[df['zone_id'].notna()]['zone_id'].value_counts()
        stats["zones"] = zone_counts.to_dict()
        
        # Person counts (excluding None)
        person_counts = df[df['person_name'].notna()]['person_name'].value_counts()
        stats["persons"] = person_counts.head(10).to_dict()
        
        # Set style
        sns.set_style("darkgrid")
        plt.rcParams['figure.facecolor'] = 'white'
        
        # 1. PIE CHART: Event Types Distribution
        if len(event_type_counts) > 0:
            fig, ax = plt.subplots(figsize=(8, 6))
            colors_pie = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F']
            wedges, texts, autotexts = ax.pie(
                event_type_counts.values, 
                labels=event_type_counts.index,
                autopct='%1.1f%%',
                colors=colors_pie,
                startangle=90,
                textprops={'fontsize': 10, 'weight': 'bold'}
            )
            for autotext in autotexts:
                autotext.set_color('white')
            ax.set_title('Event Types Distribution', fontsize=14, weight='bold')
            plt.tight_layout()
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            charts['pie_events'] = buf
            plt.close()
        
        # 2. BAR CHART: Events by Camera
        if len(camera_counts) > 0:
            fig, ax = plt.subplots(figsize=(10, 6))
            camera_names = [device_names_by_id.get(cam, cam) for cam in camera_counts.index]
            bars = ax.bar(camera_names, camera_counts.values, color='#3498db', edgecolor='black', linewidth=1.2)
            ax.set_xlabel('Camera', fontsize=12, weight='bold')
            ax.set_ylabel('Number of Events', fontsize=12, weight='bold')
            ax.set_title('Events by Camera', fontsize=14, weight='bold')
            ax.grid(axis='y', alpha=0.3)
            # Add value labels on bars
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height,
                       f'{int(height)}',
                       ha='center', va='bottom', fontsize=10, weight='bold')
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout()
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            charts['bar_cameras'] = buf
            plt.close()
        
        # 3. HISTOGRAM: Events Over Time (Hourly)
        df['hour'] = df['timestamp'].dt.hour
        hourly_counts = df.groupby('hour').size()
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.bar(hourly_counts.index, hourly_counts.values, color='#2ecc71', edgecolor='black', linewidth=1.2)
        ax.set_xlabel('Hour of Day', fontsize=12, weight='bold')
        ax.set_ylabel('Number of Events', fontsize=12, weight='bold')
        ax.set_title('Events Distribution by Hour', fontsize=14, weight='bold')
        ax.set_xticks(range(24))
        ax.grid(axis='y', alpha=0.3)
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        charts['histogram_hourly'] = buf
        plt.close()
        
        # 4. HEATMAP: Events by Day and Hour
        df['date'] = df['timestamp'].dt.date
        df['day_name'] = df['timestamp'].dt.day_name()
        heatmap_data = df.groupby(['day_name', 'hour']).size().unstack(fill_value=0)
        # Reorder days
        day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        heatmap_data = heatmap_data.reindex([d for d in day_order if d in heatmap_data.index])
        
        fig, ax = plt.subplots(figsize=(14, 6))
        sns.heatmap(heatmap_data, annot=True, fmt='d', cmap='YlOrRd', cbar_kws={'label': 'Event Count'},
                   linewidths=0.5, linecolor='gray', ax=ax)
        ax.set_title('Event Heatmap: Day vs Hour', fontsize=14, weight='bold')
        ax.set_xlabel('Hour of Day', fontsize=12, weight='bold')
        ax.set_ylabel('Day of Week', fontsize=12, weight='bold')
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        charts['heatmap_day_hour'] = buf
        plt.close()
        
        # 5. BAR CHART: Top Zones
        if len(zone_counts) > 0:
            top_zones = zone_counts.head(10)
            fig, ax = plt.subplots(figsize=(10, 6))
            bars = ax.barh(range(len(top_zones)), top_zones.values, color='#e74c3c', edgecolor='black', linewidth=1.2)
            ax.set_yticks(range(len(top_zones)))
            ax.set_yticklabels(top_zones.index)
            ax.set_xlabel('Number of Events', fontsize=12, weight='bold')
            ax.set_ylabel('Zone', fontsize=12, weight='bold')
            ax.set_title('Top 10 Active Zones', fontsize=14, weight='bold')
            ax.grid(axis='x', alpha=0.3)
            # Add value labels
            for i, bar in enumerate(bars):
                width = bar.get_width()
                ax.text(width + 5, bar.get_y() + bar.get_height()/2.,
                       f'{int(width)}',
                       ha='left', va='center', fontsize=10, weight='bold')
            plt.tight_layout()
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            charts['bar_zones'] = buf
            plt.close()
        
        # 6. LINE CHART: Events Trend Over Time
        df_daily = df.groupby(df['timestamp'].dt.date).size()
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.plot(df_daily.index, df_daily.values, marker='o', linewidth=2, markersize=6, color='#9b59b6')
        ax.fill_between(df_daily.index, df_daily.values, alpha=0.3, color='#9b59b6')
        ax.set_xlabel('Date', fontsize=12, weight='bold')
        ax.set_ylabel('Number of Events', fontsize=12, weight='bold')
        ax.set_title('Events Trend Over Time', fontsize=14, weight='bold')
        ax.grid(True, alpha=0.3)
        plt.xticks(rotation=45, ha='right')
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        charts['line_trend'] = buf
        plt.close()
        
        return charts, stats
        
    except Exception as e:
        print(f"[ERROR] Chart generation failed: {e}")
        import traceback
        traceback.print_exc()
        return None, {"error": str(e)}
    finally:
        con.close()

def create_pdf_report(start_date: str = None, end_date: str = None) -> io.BytesIO:
    """Generate a comprehensive PDF report with charts and statistics"""
    
    try:
        # Generate charts
        charts, stats = generate_report_charts(start_date, end_date)
        
        if charts is None:
            # Return simple error PDF
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=letter)
            styles = getSampleStyleSheet()
            story = []
            story.append(Paragraph("Report Generation Failed", styles['Title']))
            story.append(Spacer(1, 0.2*inch))
            error_msg = stats.get('error', stats.get('message', 'Unknown error'))
            story.append(Paragraph(str(error_msg), styles['Normal']))
            doc.build(story)
            buffer.seek(0)
            return buffer
    except Exception as e:
        # Fallback error PDF
        print(f"[REPORT ERROR] {e}")
        import traceback
        traceback.print_exc()
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        story.append(Paragraph("Report Generation Error", styles['Title']))
        story.append(Spacer(1, 0.2*inch))
        story.append(Paragraph(f"Error: {str(e)}", styles['Normal']))
        doc.build(story)
        buffer.seek(0)
        return buffer
    
    # Create PDF with simplified styling
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Use built-in styles only
    styles = getSampleStyleSheet()
    
    story = []
    
    # Title Page - using simple built-in styles
    story.append(Spacer(1, 0.8*inch))
    story.append(Paragraph("<b>Vision Based Human Tracking and Hazard Detection System</b>", styles['Title']))
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph("<b>Analytics Report</b>", styles['Heading1']))
    story.append(Spacer(1, 0.4*inch))
    
    # System Description
    description_text = """
    <b>About This System:</b><br/>
    This AI-powered monitoring system provides real-time surveillance and automated hazard detection 
    in restricted zones using computer vision and deep learning technologies. The system tracks human 
    movement, identifies authorized personnel through facial recognition, and monitors Personal 
    Protective Equipment (PPE) compliance to ensure safety in industrial and high-security environments.
    """
    story.append(Paragraph(description_text, styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    # Key Features Box
    features_text = """
    <b>Key Features:</b><br/>
    • <b>Real-time Human Tracking:</b> Tracks multiple individuals simultaneously across camera zones<br/>
    • <b>Facial Recognition:</b> Identifies authorized vs unauthorized personnel<br/>
    • <b>Zone Intrusion Detection:</b> Alerts when restricted areas are breached<br/>
    • <b>Freeze/Loitering Detection:</b> Identifies suspicious stationary behavior<br/>
    • <b>PPE Compliance Monitoring:</b> Detects missing helmets and safety vests<br/>
    • <b>Multi-Camera Support:</b> Seamless monitoring across multiple camera feeds
    """
    story.append(Paragraph(features_text, styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    # Tips and Guidelines Box
    tips_text = """
    <b>Report Usage Tips:</b><br/>
    • <b>Charts:</b> Visual analytics provide quick insights into event patterns and trends<br/>
    • <b>Event Log:</b> Detailed table includes all events with timestamps and classifications<br/>
    • <b>Time Analysis:</b> Use heatmaps to identify peak activity hours and days<br/>
    • <b>Compliance Tracking:</b> Monitor PPE violations to improve safety protocols<br/>
    • <b>Date Filtering:</b> Generate reports for specific periods to track improvements<br/>
    • <b>Export Options:</b> Reports can be shared with management for compliance audits
    """
    story.append(Paragraph(tips_text, styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Report Info Table
    report_info = [
        ["Report Generated:", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["Date Range:", stats.get('date_range', 'N/A')],
        ["Total Events Analyzed:", str(stats.get('total_events', 0))],
        ["Report Type:", "Comprehensive Analytics"],
    ]
    t = Table(report_info, colWidths=[2.2*inch, 4.3*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#3498db')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey)
    ]))
    story.append(t)
    story.append(PageBreak())
    
    # Summary Statistics
    story.append(Paragraph("<b>Summary Statistics</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))
    
    # Event Types Table
    story.append(Paragraph("<b>Event Types Breakdown</b>", styles['Heading3']))
    event_data = [["Event Type", "Count", "Percentage"]]
    total = stats['total_events']
    for event_type, count in stats['event_types'].items():
        percentage = (count / total * 100) if total > 0 else 0
        event_data.append([event_type, str(count), f"{percentage:.1f}%"])
    
    t = Table(event_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ecf0f1')])
    ]))
    story.append(t)
    story.append(Spacer(1, 0.3*inch))
    
    # Charts Section
    story.append(PageBreak())
    story.append(Paragraph("<b>Visual Analytics</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))
    
    # Add charts
    chart_titles = {
        'pie_events': 'Event Types Distribution',
        'bar_cameras': 'Events by Camera',
        'histogram_hourly': 'Hourly Event Distribution',
        'heatmap_day_hour': 'Day vs Hour Heatmap',
        'bar_zones': 'Top Active Zones',
        'line_trend': 'Events Trend Over Time'
    }
    
    for chart_key, chart_buf in charts.items():
        if chart_buf:
            story.append(Paragraph(chart_titles.get(chart_key, chart_key), styles['Heading3']))
            story.append(Spacer(1, 0.1*inch))
            img = RLImage(chart_buf, width=6.5*inch, height=4*inch)
            story.append(img)
            story.append(Spacer(1, 0.3*inch))
            if chart_key in ['histogram_hourly', 'line_trend']:
                story.append(PageBreak())
    
    # Detailed Events Log Section
    story.append(PageBreak())
    story.append(Paragraph("<b>System Events Log</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))
    
    # Get events from database
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    
    # Build date filter
    date_filter = ""
    params = []
    if start_date and end_date:
        date_filter = "WHERE timestamp BETWEEN ? AND ?"
        params = [start_date, end_date]
    elif start_date:
        date_filter = "WHERE timestamp >= ?"
        params = [start_date]
    elif end_date:
        date_filter = "WHERE timestamp <= ?"
        params = [end_date]
    
    # Get events (limit to most recent 500 for PDF size)
    query = f"SELECT * FROM recognitions {date_filter} ORDER BY timestamp DESC LIMIT 500"
    cursor = con.execute(query, params)
    events = [dict(row) for row in cursor.fetchall()]
    con.close()
    
    if events:
        story.append(Paragraph(f"Showing {len(events)} most recent events", styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
        
        # Create events table
        events_data = [["Time", "Event Type", "Camera", "Zone", "Person", "PPE Status", "Details"]]
        
        for event in events:
            # Format timestamp (handle None)
            timestamp = event.get('timestamp')
            time_str = timestamp[:19] if timestamp else 'N/A'
            
            # Event type (without emoji for PDF compatibility)
            event_type = event.get('event_type') or 'UNKNOWN'
            event_display = str(event_type).replace('_', ' ').title() if event_type else 'Unknown'
            
            # Camera name (get device name if available)
            cam_id = event.get('cam_id') or 'N/A'
            camera = device_names_by_id.get(cam_id, cam_id) if cam_id and cam_id != 'N/A' else 'N/A'
            
            # Zone
            zone = event.get('zone_id') or '-'
            
            # Person
            person = event.get('person_name') or '-'
            if event.get('allowed') == 1 and person != '-' and person:
                person = f"[OK] {person}"
            elif event.get('allowed') == 0 and person != '-' and person:
                person = f"[X] {person}"
            
            # PPE Status (without emojis for PDF compatibility)
            ppe_status = '-'
            if event_type == 'PPE_VIOLATION':
                has_helmet = event.get('has_helmet', 0)
                has_vest = event.get('has_vest', 0)
                helmet_status = "H:Y" if has_helmet else "H:N"
                vest_status = "V:Y" if has_vest else "V:N"
                ppe_status = f"{helmet_status} {vest_status}"
            
            # Details
            details = []
            if event.get('allowed') == 1:
                details.append("Authorized")
            elif event.get('allowed') == 0:
                details.append("Unauthorized")
            
            if event_type == 'ZONE_ALERT':
                details.append("Intrusion")
            elif event_type == 'FREEZE_ALERT':
                details.append("Loitering")
            elif event_type == 'PPE_VIOLATION':
                missing = []
                if not event.get('has_helmet', 0):
                    missing.append("Helmet")
                if not event.get('has_vest', 0):
                    missing.append("Vest")
                if missing:
                    details.append(f"Missing: {', '.join(missing)}")
            
            details_str = ', '.join(details) if details else '-'
            
            # Safely truncate strings (handle None values)
            def safe_truncate(value, length):
                if value is None:
                    return '-'
                s = str(value)
                return s[:length] if len(s) > length else s
            
            events_data.append([
                safe_truncate(time_str, 19),
                safe_truncate(event_display, 30),
                safe_truncate(camera, 20),
                safe_truncate(zone, 10),
                safe_truncate(person, 15),
                safe_truncate(ppe_status, 15),
                safe_truncate(details_str, 25)
            ])
        
        # Create table with smaller font for more data
        events_table = Table(events_data, colWidths=[1.1*inch, 1.2*inch, 1*inch, 0.6*inch, 0.8*inch, 0.8*inch, 1*inch])
        events_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            # Data rows
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 1), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ]))
        
        story.append(events_table)
    else:
        story.append(Paragraph("No events found for the selected period.", styles['Normal']))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer

class ReportBody(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@app.post("/generate_report")
async def generate_report(body: ReportBody):
    """Generate PDF report with analytics"""
    try:
        print(f"[REPORT] Generating report from {body.start_date} to {body.end_date}")
        pdf_buffer = create_pdf_report(body.start_date, body.end_date)
        
        filename = f"sentinel_ai_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        print(f"[ERROR] Report generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Report generation failed: {str(e)}")

# ---------------- Admin Authentication ----------------
def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, ADMIN_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

# ---------------- Admin Endpoints ----------------
@app.get("/admin/email/status")
def get_email_status(username: str = Depends(verify_admin)):
    """Get email notification status (admin only)"""
    return {
        "enabled": EMAIL_ENABLED,
        "config": {
            "sender": EMAIL_CONFIG["sender"],
            "recipients": EMAIL_CONFIG["recipients"]
        }
    }

class EmailToggleBody(BaseModel):
    enabled: bool

@app.post("/admin/email/toggle")
def toggle_email(body: EmailToggleBody, username: str = Depends(verify_admin)):
    """Enable/disable email notifications (admin only)"""
    global EMAIL_ENABLED
    EMAIL_ENABLED = body.enabled
    print(f"[ADMIN] Email notifications {'enabled' if EMAIL_ENABLED else 'disabled'} by {username}")
    return {"enabled": EMAIL_ENABLED, "message": f"Email notifications {'enabled' if EMAIL_ENABLED else 'disabled'}"}

@app.get("/admin/logs")
def get_logs(limit: int = Query(100, ge=1, le=1000), username: str = Depends(verify_admin)):
    """Get event logs (admin only)"""
    return {
        "logs": events_log[-limit:],
        "total": len(events_log),
        "count": min(limit, len(events_log))
    }

@app.get("/admin/logs/db")
def get_db_logs(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    username: str = Depends(verify_admin)
):
    """Get logs from database (admin only)"""
    with DB_LOCK:
        try:
            con = sqlite3.connect(DB_PATH)
            con.row_factory = sqlite3.Row
            cur = con.cursor()
            
            query = "SELECT * FROM recognitions WHERE 1=1"
            params = []
            
            if start_date:
                query += " AND timestamp >= ?"
                params.append(start_date)
            if end_date:
                query += " AND timestamp <= ?"
                params.append(end_date)
            
            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)
            
            cur.execute(query, params)
            rows = cur.fetchall()
            logs = [dict(row) for row in rows]
            con.close()
            
            return {
                "logs": logs,
                "count": len(logs),
                "total": len(events_log)
            }
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch logs: {str(e)}")

@app.get("/admin/stats")
def get_admin_stats(username: str = Depends(verify_admin)):
    """Get comprehensive statistics (admin only)"""
    with DB_LOCK:
        try:
            con = sqlite3.connect(DB_PATH)
            con.row_factory = sqlite3.Row
            cur = con.cursor()
            
            # Total events
            cur.execute("SELECT COUNT(*) as count FROM recognitions")
            total_events = cur.fetchone()['count']
            
            # Events by type
            cur.execute("""
                SELECT event_type, COUNT(*) as count 
                FROM recognitions 
                GROUP BY event_type
            """)
            events_by_type = {row['event_type']: row['count'] for row in cur.fetchall()}
            
            # Events by camera
            cur.execute("""
                SELECT cam_id, COUNT(*) as count 
                FROM recognitions 
                WHERE cam_id IS NOT NULL
                GROUP BY cam_id
            """)
            events_by_camera = {row['cam_id']: row['count'] for row in cur.fetchall()}
            
            # Recent events (last 24 hours)
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
            cur.execute("""
                SELECT COUNT(*) as count 
                FROM recognitions 
                WHERE timestamp >= ?
            """, (yesterday,))
            recent_events = cur.fetchone()['count']
            
            con.close()
            
            return {
                "total_events": total_events,
                "recent_events_24h": recent_events,
                "events_by_type": events_by_type,
                "events_by_camera": events_by_camera,
                "email_enabled": EMAIL_ENABLED,
                "active_cameras": len(active_sources_by_id)
            }
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch stats: {str(e)}")

# ---------------- Startup ----------------
def scan_known_faces(dirpath: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    if not dirpath or not os.path.isdir(dirpath):
        print(f"[DeepFace] ⚠️ Known faces directory not found: {dirpath}")
        print(f"[DeepFace] ⚠️ Please create the directory and add face images (jpg, png, etc.)")
        return out
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    try:
        for fn in sorted(os.listdir(dirpath)):
            fp = os.path.join(dirpath, fn)
            if os.path.isfile(fp) and os.path.splitext(fn)[1].lower() in exts:
                out.append((os.path.splitext(fn)[0], fp))
                print(f"[DeepFace] Registered: {fn} -> {os.path.splitext(fn)[0]}")
            elif os.path.isfile(fp):
                print(f"[DeepFace] ⚠️ Skipping {fn} (unsupported format, use: {', '.join(exts)})")
    except Exception as e:
        print(f"[DeepFace] ⚠️ Error scanning directory {dirpath}: {e}")
    return out

@app.on_event("startup")
async def on_startup():
    app.state.loop = asyncio.get_event_loop()
    # ensure DB is ready
    init_db()
    # prepare known face paths
    global KNOWN_FACE_PATHS, EMAIL_ENABLED, EMAIL_CONFIG, ADMIN_USERNAME, ADMIN_PASSWORD
    KNOWN_FACE_PATHS = scan_known_faces(ARGS.allowlist_dir)
    
    # Log known faces status
    if len(KNOWN_FACE_PATHS) > 0:
        print(f"[DeepFace] ✅ Loaded {len(KNOWN_FACE_PATHS)} known face(s) from {ARGS.allowlist_dir}")
        for name, path in KNOWN_FACE_PATHS:
            print(f"[DeepFace]   - {name}: {path}")
        print(f"[DeepFace] 📊 Face recognition settings: model={ARGS.face_model}, threshold={ARGS.face_threshold}")
        print(f"[DeepFace] 💡 Tip: If faces aren't recognized, try increasing --face-threshold (current: {ARGS.face_threshold})")
    else:
        print(f"[DeepFace] ⚠️ WARNING: No known faces loaded from {ARGS.allowlist_dir}")
        print(f"[DeepFace] ⚠️ DeepFace recognition will not work until known faces are added!")
    
    # Email is configured with defaults (enabled by default, can be toggled in admin panel)
    # Email config is already set in global EMAIL_CONFIG above
    EMAIL_ENABLED = True  # Enabled by default
    print(f"[EMAIL] Email notifications enabled by default. Recipients: {EMAIL_CONFIG['recipients']}")
    print(f"[EMAIL] Email can be toggled on/off in the Admin Panel")
    
    # Admin credentials are already set in global variables above (default: admin/admin123)
    print(f"[ADMIN] Admin authentication configured (username: {ADMIN_USERNAME})")
    # optional: also build in-memory RGB
    try:
        faces = []
        for name, fp in KNOWN_FACE_PATHS:
            bgr = cv2.imread(fp)
            if bgr is not None:
                faces.append((name, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
        KNOWN_FACES.clear()
        KNOWN_FACES.extend(faces)
        if len(faces) > 0:
            print(f"[allow] Pre-loaded {len(KNOWN_FACES)} known face image(s) into memory")
    except Exception as e:
        print(f"[startup] known faces load failed: {e}")
        print("[startup] continuing without allowlist.")

# ---------------- Main ----------------
if __name__ == "__main__":
    if ARGS.draw_zones:
        if not ARGS.cam_id or ARGS.cam_id not in CAM_IDS:
            print("When using --draw-zones, also provide --cam-id that exists in --cams.")
            print('Example: --draw-zones --cam-id cameraA --cams "cameraA=0,cameraB=1,cameraC=2,cameraD=3"')
            raise SystemExit(1)
        # Parse camera index from the cam_id
        cam_index = 0  # Default to camera index 0
        if ARGS.cam_id in CAM_IDS:
            # Extract index from the camera specification
            for token in ARGS.cams.split(","):
                if ARGS.cam_id in token and "=" in token:
                    try:
                        cam_index = int(token.split("=")[1])
                        break
                    except:
                        pass
        draw_zones_interactive(ARGS.cam_id, cam_index)
        raise SystemExit(0)

    uvicorn.run(app, host="0.0.0.0", port=ARGS.port, log_level="info")
