# Intelligent Real-Time Human Activity Monitoring and Unsafe Behaviour System

A full-stack system for real-time multi-camera monitoring with **person detection**, **restricted-zone intrusion**, **face recognition (allowlist)**, **freeze (motionlessness) detection**, and **PPE (helmet/vest) compliance**. Events are logged to SQLite, streamed via Server-Sent Events (SSE), and optional email alerts and PDF reports are supported.

---

## Abstract

Human activity monitoring has become increasingly critical at homes, hospitals, offices, public spaces, and industrial facilities, where timely identification of unsafe or abnormal behaviour can reduce the incidence of accidents and greatly improve general safety. This project implements an **Intelligent Real-Time Human Activity Monitoring and Unsafe Behaviour Detection System** using computer vision, deep learning, and artificial intelligence to recognize human activities and detect behaviour that may present safety risks. The system uses the **YOLOv8** object detection framework integrated with **OpenCV** for accurate recognition of activities such as walking, sitting, falling, running, or entering restricted or sensitive areas. Real-time video streams are processed on a frame-by-frame basis to achieve low latency during monitoring and rapid response. The system automatically initiates alerts upon the detection of unsafe or anomalous behaviour while recording all events at the central data repository for further analysis. **DeepFace**-based face recognition allows the identification of authorized personnel in controlled access scenarios. A dedicated **React** interface for live monitoring offers activity analytics, incident histories, and behaviour trends via intuitive visualizations. On the backend, **FastAPI** ensures efficient data management, scalability for multi-camera setups, and optional cloud connectivity. By marrying modular architecture, real-time processing, and AI-driven decision support, the system is robust and adaptable for enhancing safety, situational awareness, and proactive behaviour monitoring across multiple domains.

---

## Table of Contents

- [Abstract](#abstract)
- [Overview](#overview)
- [System Layers (Input / Backend / Frontend)](#system-layers-input--backend--frontend)
- [System Architecture](#system-architecture)
- [System Architecture (Detailed)](#system-architecture-detailed)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Full API Reference](#full-api-reference)
- [API Examples (cURL)](#api-examples-curl)
- [HTTP Status Codes](#http-status-codes)
- [SSE Event Payload Examples](#sse-event-payload-examples)
- [Machine Learning (ML) Pipeline](#machine-learning-ml-pipeline)
- [ML Algorithm Details](#ml-algorithm-details)
- [Model Implementation (Research)](#model-implementation-research)
- [Performance Analysis](#performance-analysis)
- [Frontend](#frontend)
- [Frontend State & Data Flow](#frontend-state--data-flow)
- [Database Schema](#database-schema)
- [Database Writes & Queries](#database-writes--queries)
- [Zone Configuration](#zone-configuration)
- [Allowlist (Known Faces)](#allowlist-known-faces)
- [Camera Discovery](#camera-discovery)
- [Email Alerts](#email-alerts)
- [Security & Admin](#security--admin)
- [Report Generation](#report-generation)
- [Report Charts & PDF Structure](#report-charts--pdf-structure)
- [Development Workflow](#development-workflow)
- [Deployment Notes](#deployment-notes)
- [Known Limitations](#known-limitations)
- [Glossary](#glossary)
- [System Deployment (Paper)](#system-deployment-paper)
- [Results](#results)
- [Conclusion & Future Work](#conclusion--future-work)
- [Troubleshooting](#troubleshooting)

---

## Overview

The system consists of:

1. **Backend (FastAPI)** — Multi-camera capture, YOLO person detection, zone/PPE/freeze logic, DeepFace verification on zone entry, SQLite persistence, SSE event stream, and REST API.
2. **Frontend (React + Vite)** — Live video grid, camera binding, event stream, admin dashboard, logs, and PDF report generation.
3. **ML pipeline** — Pre-trained YOLO (person + optional PPE), Shapely for zone geometry, and DeepFace for face verification against an allowlist.

No training code is included; the system uses pre-trained models (YOLOv8, DeepFace) and configurable zones/allowlists.

---

## System Layers (Input / Backend / Frontend)

The system is designed with three layers that work together to perform real-time activity recognition and behaviour analysis:

| Layer | Description |
|-------|-------------|
| **Input Layer** | Continuous video streams are captured from standard webcams, IP cameras, and other compatible video devices installed in patient rooms, hallways, living spaces, offices, or public areas. These cameras provide real-time visual input for monitoring human activities. The use of widely available webcams and IP cameras enables easy deployment, low cost, and compatibility for diversified environments. |
| **Backend Layer** | Incoming video frames are processed by the **YOLOv8** deep learning model, which detects human presence and supports recognition of activities such as walking, sitting, falling, running, lying down, and entering restricted zones via the **FastAPI** backend. YOLOv8 allows quick and accurate activity recognition suitable for real-time monitoring. **DeepFace** is integrated to support identity-based monitoring by recognizing authorized individuals and differentiating known from unknown persons. All detected events are stored with activity type, identity, confidence score, and timestamps in the **SQLite** database for lightweight, fast behaviour logging and reliable multi-camera real-time operation. |
| **Frontend Layer** | The interface is developed in **React** with a modern UI and depicts real-time feeds from cameras, activity status, and alerts with color codes (e.g. green for normal, orange for attention required, red for unsafe conditions). Real-time analytics, logs, and trends are available on the dashboard, along with report generation tools for supervisors or caregivers. |

The modular design allows easy integration into existing infrastructure and supports scaling with more cameras, additional behaviour categories, or cloud extensions. Independent yet cohesive modules—detection, identity recognition, event management, and analytics—enable deployments ranging from small spaces to large distributed networks.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + Vite)                         │
│  • Camera grid / single view    • Admin panel (stats, logs, email)          │
│  • Device binding & activate    • Events dialog, CSV export                  │
│  • SSE /events, /video streams  • PDF report (date range)                    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTP / SSE (VITE_API, default :8000)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI + Uvicorn)                          │
│  • REST API (health, cams, activate, video, events, classify, report, admin) │
│  • CORS enabled; optional HTTP Basic for /admin/*                            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ CameraWorker  │         │ push_event()    │         │ SQLite           │
│ (per camera)  │         │ → SSE + DB      │         │ recognitions.db  │
│ • OpenCV cap  │         │ → Email (alert) │         │ • recognitions   │
│ • YOLO detect │         │ → events_log    │         │ • indexes        │
│ • Zones/PPE/  │         └─────────────────┘         └─────────────────┘
│   Freeze      │
│ • DeepFace    │         ┌─────────────────┐
│   on entry    │         │ known_faces/    │
└───────────────┘         │ (allowlist)     │
                          └─────────────────┘
```

- **Single process:** One Python process runs the FastAPI app and one `CameraWorker` thread per active camera.
- **Activation:** Cameras are logical IDs (e.g. `cameraA`). Physical binding is done via `POST /activate_map` (map logical ID → device name/index). Until then, no capture runs.
- **Event flow:** Worker detects zone intrusion, freeze, or PPE violation → `threadsafe_event()` → `push_event()` → SQLite insert, optional email, and broadcast to all SSE subscribers.
- **Video:** Each worker writes the latest JPEG to `latest_jpeg[cam_id]`; `GET /video?cam=<id>` streams it as MJPEG.

*Fig. 1: System Architecture Diagram of Intelligent Real-Time Human Activity Monitoring and Unsafe Behaviour System (as in the accompanying IEEE-style paper).*

### System Architecture (Detailed)

| Component | Description |
|-----------|-------------|
| **Process model** | Single Python process: FastAPI app (Uvicorn) + one `CameraWorker` thread per active camera. No separate worker processes. |
| **Event loop** | `app.state.loop` holds the asyncio event loop; workers call `threadsafe_event()` which schedules `push_event()` on this loop via `run_coroutine_threadsafe`. |
| **Thread pool** | `ThreadPoolExecutor(max_workers=2)` used for DB inserts and email sending inside `push_event()` so the async loop is not blocked. |
| **In-memory state** | `events_log`: unbounded list of all events (append-only). `subscribers`: list of `asyncio.Queue` for SSE; each new `/events` connection gets a queue and is appended; on disconnect the queue is removed. |
| **Worker lifecycle** | `POST /activate_map` parses body: for each `cam_id` → device label (e.g. `"Integrated Camera (index 0)"`). Index is parsed via regex `(index\s+(\d+))` or integer; then `start_worker(cam_id, index, device_name)` or `stop_worker(cam_id)` as needed. Workers are started with `CameraWorker(cam_id, cam_index, model_path).start()`. |
| **Video stream** | Async generator `gen()` in `/video` runs in a loop: reads `latest_jpeg.get(cam)` every 20 ms, yields MJPEG boundary + JPEG bytes; if no frame, waits and retries (logs every ~5 s). |
| **Startup** | `on_startup`: set `app.state.loop`, `init_db()`, `scan_known_faces(allowlist_dir)`, load `KNOWN_FACES` RGB list from disk, set `EMAIL_ENABLED`, log admin/email status. |

### Workflow

Video streams are conveyed to the backend, preprocessed, and analysed with **YOLOv8**. The model detects persons, classifies activities, and detects unsafe behaviours such as falls, running, collapsing, or entering restricted zones. **DeepFace** is used to validate identities when required (e.g. on zone entry). Results from these model analyses are stored in **SQLite** and reflected on the live dashboard for real-time monitoring, incident review, and behaviour analysis. The design ensures low latency; the current implementation uses **Server-Sent Events (SSE)** for real-time event delivery to the frontend, with no mandatory dependency on IoT devices or the cloud.

### Advantages Over Existing Systems

- **Purely vision-based** — No IoT devices or wearables required; standard cameras suffice.
- **Real-time YOLOv8 inference** — Sub-second detection suitable for safety-critical monitoring.
- **DeepFace identity-based monitoring** — Authorized vs unauthorized personnel differentiation in controlled access scenarios.
- **FastAPI with SSE** — Efficient backend with real-time event stream for ultra-low latency updates to the dashboard.
- **Lightweight, portable SQLite storage** — Fast write operations and simple deployment; easily scalable across multiple cameras and environments.

---

## Features

| Feature | Description |
|--------|-------------|
| **Multi-camera** | Support for multiple logical cameras (e.g. cameraA–D), each bound to a physical device. |
| **Zone intrusion** | Configurable polygons per camera; alerts when a person enters (center / overlap / feet). |
| **Face recognition** | On zone entry, face crop is verified against allowlist in `known_faces/` (filename = identity). |
| **Freeze detection** | Tracks velocity (px/s); alerts when a person stays below threshold for sustained seconds. |
| **PPE compliance** | Optional helmet/vest detection via YOLO; configurable require-helmet/require-vest. |
| **Live video** | MJPEG stream per camera. |
| **SSE events** | Real-time event stream for UI (ZONE_ALERT, FREEZE_ALERT, PPE_VIOLATION, FACE_CLASSIFIED). |
| **SQLite logging** | All events stored in `recognitions.db` with timestamps and metadata. |
| **Email alerts** | Optional SMTP alerts for ZONE_ALERT, FREEZE_ALERT, PPE_VIOLATION (toggle in admin). |
| **PDF reports** | Date-filtered reports with charts and tables (reportlab + matplotlib + pandas). |
| **Admin panel** | Stats, in-memory and DB logs, email toggle, report generation (HTTP Basic). |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3, FastAPI, Uvicorn, Pydantic |
| **ML / CV** | OpenCV, Ultralytics YOLO, DeepFace, Shapely |
| **Database** | SQLite3 (stdlib) |
| **Streaming** | sse-starlette (SSE), MJPEG over HTTP |
| **Reports** | ReportLab, Matplotlib, Pandas, Seaborn |
| **Frontend** | React 19, Vite 7 |
| **Auth** | HTTP Basic (admin routes) |

---

## Project Structure

```
.
├── app7.py                 # Backend entry (FastAPI, workers, ML, DB)
├── launch7.ps1             # PowerShell launch script (example CLI)
├── requirements.txt        # Python dependencies
├── check_cams.py           # Utility: probe OpenCV camera indices (0–4)
├── zones.json              # Default zone polygons (fallback)
├── zones_cameraA.json      # Per-camera zones (cameraA–D)
├── zones_cameraB.json
├── zones_cameraC.json
├── zones_cameraD.json
├── known_faces/            # Allowlist: one image per person (filename = label)
├── captures/               # Saved crop images (created at runtime)
├── recognitions.db         # SQLite DB (created at runtime)
├── beep.wav                # Zone/alert sound
├── freeze_beep.wav         # Freeze alert sound
├── cv-frontend-2/          # React frontend
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx         # Main layout, camera grid, SSE, config
│   │   ├── AdminPanel.jsx  # Admin dashboard, logs, email, stats
│   │   ├── MenuWindow.jsx  # Settings / Analytics / Report
│   │   ├── EventsDialog.jsx
│   │   ├── LogHistory.jsx
│   │   └── App.css, index.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
└── README.md               # This file
```

---

## Installation

### Backend

1. **Python 3.10+** recommended.
2. Create a virtual environment and install dependencies:

   ```bash
   python -m venv venv
   venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   ```

3. **YOLO:** First run will download the default model (e.g. `yolov8n.pt`) if not present.
4. **DeepFace:** First use may download the chosen face model (e.g. VGG-Face).

### Frontend

```bash
cd cv-frontend-2
npm install
```

### Optional: Camera check (Windows)

```bash
python check_cams.py
```

Probes camera indices 0–4 with MSMF/DSHOW to list available devices.

---

## Configuration

### Backend (CLI)

| Argument | Default | Description |
|----------|---------|-------------|
| `--model` | `yolov8n.pt` | YOLOv8 model path (person detection). |
| `--ppe-model` | `yolov8n.pt` | YOLO model for PPE (helmet/vest). |
| `--cams` | `cameraA=0,cameraB=1,...` | Logical camera IDs and placeholders (`id=source`). |
| `--zones` | `zones.json` | Fallback zones file. |
| `--conf` | `0.35` | YOLO confidence threshold. |
| `--imgsz` | `640` | YOLO input size. |
| `--skip-frames` | `2` | Process every Nth frame (1 = all). |
| `--port` | `8000` | HTTP server port. |
| `--draw-zones` | — | Launch interactive zone drawer (use with `--cam-id`). |
| `--cam-id` | — | Camera ID for zone drawer. |
| `--hit` | `overlap` | Intrusion rule: `center`, `overlap`, or `feet`. |
| `--overlap-thresh` | `0.05` | Min overlap ratio for `overlap` hit. |
| `--allowlist-dir` | `./known_faces` | Folder of allowed face images (filename = label). |
| `--min-face` | `90` | Min face crop size (px) for DeepFace. |
| `--face-threshold` | `1.0` | Face verification threshold (higher = more lenient). |
| `--face-model` | `VGG-Face` | DeepFace model (e.g. VGG-Face, Facenet, ArcFace). |
| `--freeze-eps` | `8.0` | Velocity (px/s) below which person is “still”. |
| `--freeze-sustain` | `30.0` | Seconds still before FREEZE_ALERT. |
| `--freeze-cooldown` | `5.0` | Cooldown between freeze alerts. |
| `--zone-cooldown` | `2.0` | Cooldown between zone alerts. |
| `--classify-cooldown` | `10.0` | Seconds before re-classifying same track. |
| `--enable-ppe` | — | Enable PPE (helmet/vest) checks. |
| `--require-helmet` | — | Require helmet for zone entry. |
| `--require-vest` | — | Require vest for zone entry. |
| `--ppe-cooldown` | `3.0` | Cooldown between PPE violation alerts. |
| `--helmet-classes` | `0` | Comma-separated YOLO class IDs for helmet. |
| `--vest-classes` | `1` | Comma-separated YOLO class IDs for vest. |

### Frontend

- **API base URL:** Set `VITE_API` at build time (e.g. `http://localhost:8000`). If unset, the app uses `http://${window.location.hostname}:8000`.

---

## Running the Application

1. **Start backend:**

   ```bash
   python app7.py --port 8000
   ```

   Or use the provided script (adjust args as needed):

   ```powershell
   .\launch7.ps1
   ```

2. **Start frontend (dev):**

   ```bash
   cd cv-frontend-2
   npm run dev
   ```

   Frontend runs at `http://localhost:5173` and connects to the backend (default port 8000).

3. **Activate cameras:** In the UI, select physical devices for each logical camera and click Activate. Or call `POST /activate_map` with the mapping.

4. **Draw zones (optional):** Run once with `--draw-zones --cam-id cameraA` (and correct `--cams`) to create or edit `zones_cameraA.json`, then run the main app.

---

## API Documentation

The backend is built with **FastAPI**, which provides interactive API documentation at **`/docs`** (Swagger UI) and **`/redoc`** (ReDoc) when the server is running. Use the base URL, e.g. `http://localhost:8000/docs`.

### Base URL & Content Types

| Item | Value |
|------|--------|
| **Base URL** | `http://localhost:8000` (or your backend host and port, e.g. `--port`) |
| **JSON requests** | `Content-Type: application/json` |
| **Form/multipart** | `Content-Type: multipart/form-data` (for file upload) |

### Authentication

- **Public endpoints** (health, cam_ids, devices, activate_map, cams, video, beep, freeze_beep, events, stats, classify_live, classify_upload, generate_report): **No authentication** required.
- **Admin endpoints** (`/admin/*`): **HTTP Basic Authentication** required.
  - **Username:** `admin` (configurable in code: `ADMIN_USERNAME`)
  - **Password:** `admin123` (configurable in code: `ADMIN_PASSWORD`)
  - **Header:** `Authorization: Basic <base64(username:password)>`, or use `curl -u admin:admin123`.

---

### Endpoint Summary

#### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check; returns slots and active cameras |
| GET | `/cam_ids` | List logical camera IDs from `--cams` |
| GET | `/devices` | List detected camera devices (index + name) |
| POST | `/activate_map` | Bind logical cameras to physical devices; start workers |
| POST | `/activate` | Alias for `/activate_map` |
| GET | `/cams` | Active cameras and current mapping |
| GET | `/video` | MJPEG stream for one camera |
| GET | `/beep` | Alert sound file (WAV) |
| GET | `/freeze_beep` | Freeze alert sound file (WAV) |
| GET | `/events` | SSE stream of real-time events |
| GET | `/stats` | In-memory event count and last event time |
| POST | `/classify_live` | Face classification on latest frame for a camera |
| POST | `/classify_upload` | Face classification on an uploaded image |
| POST | `/generate_report` | Generate PDF report (date range optional) |

#### Admin endpoints (HTTP Basic required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/email/status` | Email notification status and config |
| POST | `/admin/email/toggle` | Enable or disable email alerts |
| GET | `/admin/logs` | In-memory event log (last N entries) |
| GET | `/admin/logs/db` | DB-backed logs with optional date filter |
| GET | `/admin/stats` | DB statistics, email status, active camera count |

---

### Full API Reference

#### GET `/health`

Health check. Returns server status and camera slots.

**Request:** No body or query parameters.

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` when server is up |
| `slots` | string[] | Logical camera IDs (from `--cams`) |
| `active` | string[] | Currently active camera IDs |

**Example response:**
```json
{
  "ok": true,
  "slots": ["cameraA", "cameraB", "cameraC", "cameraD"],
  "active": ["cameraA", "cameraB"]
}
```

---

#### GET `/cam_ids`

Returns the list of logical camera IDs configured at startup.

**Request:** None.

**Response:** `200 OK`

| Field | Type |
|-------|------|
| `cam_ids` | string[] |

**Example response:**
```json
{
  "cam_ids": ["cameraA", "cameraB", "cameraC", "cameraD"]
}
```

---

#### GET `/devices`

Returns detected camera devices by probing OpenCV indices. Used by the frontend to populate the device dropdown for activation.

**Request:** None.

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `devices` | array | List of `{ "index": number, "name": string }` |

**Example response:**
```json
{
  "devices": [
    { "index": 0, "name": "Integrated Camera (index 0)" },
    { "index": 1, "name": "USB Camera (index 1)" }
  ]
}
```

---

#### POST `/activate_map`

Binds logical camera IDs to physical devices and starts or stops worker threads. Device label must include the index, e.g. `"Device Name (index 0)"`.

**Request body:** `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `map` | object | Yes | Keys: logical camera IDs. Values: device label string (must parse to an index, e.g. `"... (index 0)"`). |

**Response:** `200 OK` | `400 Bad Request`

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | `true` on success |
| `changed` | string[] | Camera IDs that were started or stopped |
| `active` | string[] | Device names currently active (one per active camera) |

**Example request:**
```json
{
  "map": {
    "cameraA": "Integrated Camera (index 0)",
    "cameraB": "USB Camera (index 1)"
  }
}
```

**Example response:**
```json
{
  "ok": true,
  "changed": ["cameraA", "cameraB"],
  "active": ["Integrated Camera (index 0)", "USB Camera (index 1)"]
}
```

**Errors:** `400` — Unknown `cam_id` or could not parse index from device label.

---

#### POST `/activate`

Alias for `POST /activate_map`. Same request and response.

---

#### GET `/cams`

Returns currently active cameras and the mapping from camera ID to device name.

**Request:** None.

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `cams` | string[] | Device names of active cameras (display order) |
| `cam_ids` | string[] | Logical IDs of active cameras |
| `cam_map` | object | `cam_id` → device name |

**Example response:**
```json
{
  "cams": ["Integrated Camera (index 0)", "USB Camera (index 1)"],
  "cam_ids": ["cameraA", "cameraB"],
  "cam_map": {
    "cameraA": "Integrated Camera (index 0)",
    "cameraB": "USB Camera (index 1)"
  }
}
```

---

#### GET `/video`

Streams MJPEG video for one camera. Use query parameter `cam` with either the logical camera ID or the device name.

**Query parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cam` | string | Yes | Camera ID (e.g. `cameraA`) or device name (e.g. `Integrated Camera (index 0)`) |

**Response:** `200 OK` — `multipart/x-mixed-replace; boundary=frame` (MJPEG stream)  
**Errors:** `404` — Camera not active.

**Example:** `GET /video?cam=cameraA` or `GET /video?cam=Integrated%20Camera%20(index%200)`

---

#### GET `/beep`

Returns the zone/PPE alert sound file.

**Response:** `200 OK` — `audio/wav`, body is the WAV file.  
**Alternative:** `200 OK` — JSON `{ "error": "Beep file not found" }` if `beep.wav` is missing.

---

#### GET `/freeze_beep`

Returns the freeze alert sound file.

**Response:** Same as `/beep` but for `freeze_beep.wav`.

---

#### GET `/events`

Server-Sent Events (SSE) stream. Each event is a JSON object (e.g. ZONE_ALERT, FREEZE_ALERT, PPE_VIOLATION, FACE_CLASSIFIED) with at least `type` and `human_time`. See [SSE Event Payload Examples](#sse-event-payload-examples) for schemas.

**Request:** None.

**Response:** `200 OK` — `text/event-stream`. Each message: `event: message` and `data: <JSON string>`.

**Example (client):** `new EventSource('http://localhost:8000/events')` and handle `onmessage` with `JSON.parse(e.data)`.

---

#### GET `/stats`

Returns in-memory event count and timestamp of the last event.

**Request:** None.

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `count` | number | Total events in current in-memory log |
| `last` | string | Last event time `"YYYY-MM-DD HH:MM:SS"` or `"-"` |

**Example response:**
```json
{
  "count": 42,
  "last": "2025-03-03 14:30:00"
}
```

---

#### POST `/classify_live`

Runs face classification on the most recent frame stored for the given camera. Emits a FACE_CLASSIFIED event via SSE and returns the result.

**Request body:** `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cam_id` | string | Yes | Logical camera ID (must be active) |
| `zone_id` | string | No | Default `"Z?"` |
| `bbox` | [number, number, number, number] | No | Optional crop `[x1, y1, x2, y2]` |

**Response:** `200 OK` | `404` (camera not active) | `503` (no recent frame)

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | `true` |
| `cam_id` | string | Echo |
| `zone_id` | string | Echo |
| `allowed` | boolean | Whether the face matched the allowlist |
| `class_name` | string | Matched identity or `"Unknown"` |

**Example request:**
```json
{
  "cam_id": "cameraA",
  "zone_id": "Z1",
  "bbox": null
}
```

**Example response:**
```json
{
  "ok": true,
  "cam_id": "cameraA",
  "zone_id": "Z1",
  "allowed": true,
  "class_name": "John"
}
```

---

#### POST `/classify_upload`

Accepts an uploaded image and optional bounding box, runs DeepFace verification against the allowlist, and returns the result. Also emits FACE_CLASSIFIED via SSE.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Image file (e.g. JPEG, PNG) |
| `cam_id` | string | No | Default `"upload"` |
| `zone_id` | string | No | Default `"Z?"` |
| `bbox` | string | No | Optional `"x1,y1,x2,y2"` (four integers) |

**Response:** `200 OK` | `400` (invalid image or bbox format)

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | `true` |
| `cam_id` | string | Echo |
| `zone_id` | string | Echo |
| `allowed` | boolean | Match result |
| `class_name` | string | Matched identity or `"Unknown"` |
| `source` | string | `"upload"` |

**Example (cURL):**
```bash
curl -X POST http://localhost:8000/classify_upload \
  -F "file=@face.jpg" \
  -F "cam_id=cameraA" \
  -F "zone_id=Z1" \
  -F "bbox=100,50,200,150"
```

**Example response:**
```json
{
  "ok": true,
  "cam_id": "cameraA",
  "zone_id": "Z1",
  "allowed": true,
  "class_name": "Jane",
  "source": "upload"
}
```

---

#### POST `/generate_report`

Generates a PDF analytics report for the optional date range. Response is a streaming PDF attachment.

**Request body:** `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start_date` | string | No | Start date `"YYYY-MM-DD"` |
| `end_date` | string | No | End date `"YYYY-MM-DD"` |

**Response:** `200 OK` — `application/pdf` with `Content-Disposition: attachment; filename=sentinel_ai_report_YYYYMMDD_HHMMSS.pdf`  
**Errors:** `500` — Report generation failed.

**Example request:**
```json
{
  "start_date": "2025-01-01",
  "end_date": "2025-12-31"
}
```

---

#### GET `/admin/email/status` *(Admin)*

Returns whether email alerts are enabled and the current config (sender, recipients). No sensitive password is returned.

**Authentication:** HTTP Basic (admin).

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether email alerts are on |
| `config` | object | `sender` (string), `recipients` (string[]) |

**Example response:**
```json
{
  "enabled": true,
  "config": {
    "sender": "alerts@example.com",
    "recipients": ["admin@example.com"]
  }
}
```

---

#### POST `/admin/email/toggle` *(Admin)*

Enables or disables email notifications for ZONE_ALERT, FREEZE_ALERT, and PPE_VIOLATION.

**Authentication:** HTTP Basic (admin).

**Request body:** `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | New state for email alerts |

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Current state after update |
| `message` | string | Confirmation message |

**Example request:** `{ "enabled": false }`  
**Example response:** `{ "enabled": false, "message": "Email notifications disabled" }`

---

#### GET `/admin/logs` *(Admin)*

Returns the last N events from the in-memory event log.

**Authentication:** HTTP Basic (admin).

**Query parameters**

| Name | Type | Default | Constraints | Description |
|------|------|---------|--------------|-------------|
| `limit` | integer | 100 | 1–1000 | Number of most recent events to return |

**Response:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `logs` | array | List of event objects (newest last in slice) |
| `total` | number | Total events in memory |
| `count` | number | Length of `logs` returned |

---

#### GET `/admin/logs/db` *(Admin)*

Returns events from the SQLite database with optional date filter.

**Authentication:** HTTP Basic (admin).

**Query parameters**

| Name | Type | Default | Constraints | Description |
|------|------|---------|--------------|-------------|
| `start_date` | string | — | — | Include events with `timestamp >= start_date` |
| `end_date` | string | — | — | Include events with `timestamp <= end_date` |
| `limit` | integer | 500 | 1–5000 | Maximum number of rows |

**Response:** `200 OK` | `500` (DB error)

| Field | Type | Description |
|-------|------|-------------|
| `logs` | array | Event rows (dict-like; keys match DB columns) |
| `count` | number | Length of `logs` |
| `total` | number | Total in-memory events (for compatibility) |

---

#### GET `/admin/stats` *(Admin)*

Returns aggregate statistics from the database plus email and camera status.

**Authentication:** HTTP Basic (admin).

**Response:** `200 OK` | `500` (DB error)

| Field | Type | Description |
|-------|------|-------------|
| `total_events` | number | Total rows in `recognitions` |
| `recent_events_24h` | number | Events in the last 24 hours |
| `events_by_type` | object | `event_type` → count |
| `events_by_camera` | object | `cam_id` → count |
| `email_enabled` | boolean | Current email toggle state |
| `active_cameras` | number | Number of active camera workers |

**Example response:**
```json
{
  "total_events": 1250,
  "recent_events_24h": 48,
  "events_by_type": {
    "ZONE_ALERT": 600,
    "FACE_CLASSIFIED": 400,
    "FREEZE_ALERT": 150,
    "PPE_VIOLATION": 100
  },
  "events_by_camera": {
    "cameraA": 700,
    "cameraB": 550
  },
  "email_enabled": true,
  "active_cameras": 2
}
```

---

### API Examples (cURL)

```bash
# Health and camera setup
curl -s http://localhost:8000/health
# {"ok":true,"slots":["cameraA","cameraB",...],"active":[]}

curl -s http://localhost:8000/cam_ids
# {"cam_ids":["cameraA","cameraB","cameraC","cameraD"]}

curl -s http://localhost:8000/devices
# {"devices":[{"index":0,"name":"Integrated Camera (index 0)"},...]}

# Activate cameras (map logical ID → device label; backend parses index from " (index N)")
curl -X POST http://localhost:8000/activate_map \
  -H "Content-Type: application/json" \
  -d '{"map":{"cameraA":"Integrated Camera (index 0)","cameraB":"USB Camera (index 1)"}}'
# {"ok":true,"changed":["cameraA","cameraB"],"active":["Integrated Camera (index 0)","USB Camera (index 1)"]}

# Video stream (use in browser or player)
# GET http://localhost:8000/video?cam=cameraA

# Classify latest frame
curl -X POST http://localhost:8000/classify_live \
  -H "Content-Type: application/json" \
  -d '{"cam_id":"cameraA","zone_id":"Z1"}'
# {"ok":true,"cam_id":"cameraA","zone_id":"Z1","allowed":true,"class_name":"John"}

# Generate report (PDF download)
curl -X POST http://localhost:8000/generate_report \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2025-12-31"}' \
  -o report.pdf

# Admin (HTTP Basic)
curl -u admin:admin123 http://localhost:8000/admin/stats
curl -u admin:admin123 "http://localhost:8000/admin/logs/db?start_date=2025-01-01&end_date=2025-12-31&limit=500"
curl -X POST http://localhost:8000/admin/email/toggle -u admin:admin123 \
  -H "Content-Type: application/json" -d '{"enabled":false}'
```

### HTTP Status Codes

| Code | Usage |
|------|--------|
| 200 | Success (JSON or file). |
| 400 | Bad request (e.g. unknown `cam_id` in activate_map, or index not parseable from device label). |
| 401 | Unauthorized (admin routes: wrong or missing Basic credentials). Response includes `WWW-Authenticate: Basic`. |
| 404 | Resource not found (e.g. camera not active for `/video` or `classify_live`). |
| 500 | Server error (e.g. report generation failure, DB error). |
| 503 | Service unavailable (e.g. no recent frame for `classify_live`). |

### SSE Event Payload Examples

**ZONE_ALERT (intrusion):**
```json
{
  "type": "ZONE_ALERT",
  "human_time": "2025-03-03 14:22:01",
  "cam_id": "cameraA",
  "track_id": 3,
  "zone_id": "Z1",
  "label": "INTRUSION",
  "timestamp": 1741010521
}
```

**FREEZE_ALERT:**
```json
{
  "type": "FREEZE_ALERT",
  "human_time": "2025-03-03 14:25:00",
  "cam_id": "cameraA",
  "track_id": 2,
  "zone_id": "Z1",
  "label": "FREEZE",
  "seconds_still": 31,
  "is_allowed": false,
  "timestamp": 1741010700
}
```

**PPE_VIOLATION:**
```json
{
  "type": "PPE_VIOLATION",
  "human_time": "2025-03-03 14:20:15",
  "cam_id": "cameraA",
  "track_id": 1,
  "zone_id": "Z1",
  "label": "PPE VIOLATION",
  "missing_ppe": "helmet, vest",
  "has_helmet": false,
  "has_vest": false,
  "timestamp": 1741010415
}
```

**FACE_CLASSIFIED:**
```json
{
  "type": "FACE_CLASSIFIED",
  "human_time": "2025-03-03 14:18:00",
  "cam_id": "cameraA",
  "zone_id": "Z1",
  "allowed": true,
  "class_name": "Jane",
  "image_path": "captures/cameraA_Z1_1741010280123.jpg",
  "timestamp": 1741010280
}
```

SSE stream format: each message is `event: message` and `data: <JSON string>` (one event object per line in `data`).

---

## Machine Learning (ML) Pipeline

### Models

| Component | Model | Purpose |
|-----------|--------|---------|
| Person detection | YOLOv8 (e.g. `yolov8n.pt`) | COCO class 0 (person); bounding boxes and tracking. |
| PPE (optional) | YOLO (same or `--ppe-model`) | Helmet/vest classes (configurable IDs). |
| Face verification | DeepFace (e.g. VGG-Face) | Verify crop against allowlist in `known_faces/`. |

No training is performed in-repo; all models are pre-trained.

### Pipeline flow

1. **Capture:** OpenCV `VideoCapture` per active camera; frames are optionally skipped (`--skip-frames`).
2. **Detection:** YOLO runs on each processed frame; person class only for main model; optional second YOLO for PPE.
3. **Tracking:** Persisted track IDs for cooldowns and freeze (velocity over time).
4. **Zones:** Shapely polygons loaded from `zones_{cam_id}.json` or `zones.json`. Point-in-polygon or IOU (depending on `--hit`) determines zone entry.
5. **Zone entry:** If PPE is enabled, helmet/vest checked first; on compliance (or no PPE), face crop is sent to DeepFace. Reference images are from `known_faces/` (filename without extension = identity label).
6. **Freeze:** Per-track velocity (px/s) and sustain time; below `--freeze-eps` for `--freeze-sustain` seconds triggers FREEZE_ALERT.
7. **Events:** All alerts are pushed via `push_event()` → SQLite, optional email, and SSE.

### Key files (backend)

- **YOLO load/predict:** `CameraWorker.run()` (person + optional PPE).
- **DeepFace:** `deepface_classify_and_store()` — crop from frame/bbox, `DeepFace.verify(img1_path=crop, img2_path=ref_path, ...)`.
- **Zones:** `load_zones_for_cam()` — reads JSON, builds Shapely polygons.
- **PPE:** `check_ppe_compliance()` — IOU with helmet/vest classes.
- **Freeze:** `TrackState` and `frozen_now()` — velocity and sustain logic.

### ML Algorithm Details

| Topic | Details |
|-------|---------|
| **YOLO** | `model.predict(frame, imgsz=ARGS.imgsz, conf=ARGS.conf, classes=[0], verbose=False, device=device)`. Device is `cuda:0` if CUDA available else `cpu`. PPE model runs separately with same or `--ppe-model`; class IDs for helmet/vest from `--helmet-classes` and `--vest-classes`. |
| **Tracking** | Detection boxes matched to previous frame by IOU (threshold 0.45). New tracks get next ID; tracks not matched for 30 frames are removed. Between processed frames, last detection/track state is reused (frame skip). |
| **Zone rule** | `--hit center`: person center point in polygon. `--hit feet`: bottom-center `(px, y2)` in polygon. `--hit overlap`: Shapely box for bbox; intersection area / bbox area ≥ `--overlap-thresh`. |
| **TrackState** | Per-track: `box`, centroid, `vel_hist` (deque maxlen=45), `low_since`, `last_freeze_emit`, `last_zone_emit`, `last_classify`, `in_zone`, `zone_entry_time`, `zone_accumulated_time`, `last_zone_exit_time`, `shake_anchor`, `anchor_history` (maxlen=10), `is_allowed`, `allowed_name`, `has_helmet`, `has_vest`, `ppe_compliant`, `last_ppe_emit`. Velocity = distance moved / dt; if movement &lt; relative threshold (10% of box size or 20 px), vel=0. Freeze: must be `in_zone` and velocity below `freeze_eps` for `freeze_sustain` seconds; jitter tolerance: drift from anchor &gt; 15% box size or 30 px resets low_since. Brief zone exits (&lt;2 s) keep accumulated zone time. |
| **DeepFace** | Crop: if bbox given and size ≥ `min_face`, use upper 60% of bbox (face region) + 10% padding; else full frame. Min crop 50×50. `DeepFace.verify(img1_path=crop_rgb, img2_path=ref_path, enforce_detection=False, detector_backend="opencv", model_name=ARGS.face_model, distance_metric="cosine", align=True, expand_percentage=10, silent=True, threshold=ARGS.face_threshold)`. Compared against every file in `KNOWN_FACE_PATHS` until match. Match → `is_allowed=True`, `allowed_name=filename`. |
| **PPE** | Person box expanded by 10%; PPE detections (x1,y1,x2,y2, class_id) with IOU vs expanded box &gt; 0.3 count as helmet or vest. `helmet_classes` and `vest_classes` from CLI (default 0 and 1). |
| **Zone entry flow** | On first frame `in_zone` and not `prev_in_zone`, and `(now_ts - last_classify) >= classify_cooldown`: run `deepface_classify_and_store()`, set `ts.is_allowed`, `ts.allowed_name`, `ts.last_classify`. If PPE enabled and not compliant, emit PPE_VIOLATION on entry. Then continuous: if in_zone and not allowed → ZONE_ALERT (cooldown); if in_zone and not PPE compliant and not allowed → PPE_VIOLATION (cooldown); if frozen → FREEZE_ALERT (cooldown) and optional pygame freeze beep. |
| **Drawing** | Box color: freeze → pink; PPE violation (in zone) → orange; zone intrusion (not allowed) → red; else green. Zone polygons drawn in blue. |

---

## Model Implementation (Research)

The following describes the research and model implementation reported in the accompanying IEEE-style paper. The repository uses pre-trained YOLOv8 (and optional custom models); custom training can be done separately with the same architecture.

### Dataset Preparation

- Training for activities including **walking, sitting, lying, running, falling, wandering**, and **entry into prohibited places** was based on **25,000+ labeled images**.
- Balanced dataset containing an equal amount of normal and unsafe samples.
- Augmentation by rotation, scaling, brightness changes, and flips increased robustness regarding lighting, viewpoints, and environments.

### Deep Learning Model Architecture

- Built using **YOLOv8** with an anchor-free detection head and optimized backbone.
- Transfer learning with **COCO** weights fine-tuned on custom activity data.
- Processes **640×640** frames with NMS for accurate detection.
- Supports real-time inference on CCTV, webcams, and web camera feeds with minimal latency.

### Training and Evaluation

- Trained using **Adam** optimizer (learning rate = 0.001, batch size = 16) for **150 epochs**.
- Used **BCE** for classification and **MSE** for localization, with dropout and batch normalization to avoid overfitting.
- Achieved **97% accuracy**, **95.8% mAP**, and **~120 ms** inference speed for safe real-time monitoring in safety-critical scenarios.

---

## Performance Analysis

The proposed system was tested in various environments for accuracy, robustness, and practical usability. The results confirm that the model gives reliable performance for human activity monitoring and unsafe behaviour detection.

### Accuracy and Metrics

- **Overall activity recognition** was correct in **97%** of cases; **unsafe behaviour detection** reached **95%** accuracy.
- **Confusion matrix (Fig. 3.1):** High true-positive rates for walking, sitting, running, and especially fall detection, with **&lt;3% false positives** and **&lt;2% false negatives**.
- **Accuracy trend (Fig. 3.2):** Smooth and gradual improvement of training and validation accuracy, reflecting stable learning.
- **Loss trend (Fig. 3.3):** Progressively decreasing training and validation loss, confirming minimal overfitting and good generalization across varying lighting conditions and camera angles.

### Comparison with Existing Methods

| Model | Accuracy | Inference Time | Misclassification Rate | Precision | Recall | F1-score |
|-------|----------|----------------|--------------------------|-----------|--------|----------|
| Patel et al. (2022) | 94.1% | 2.3 s | 5.9% | 94.0% | 93.7% | — |
| Zhang et al. (2023) | 95.4% | 1.9 s | 4.6% | 95.0% | 95.2% | 95.1% |
| Rahman et al. (2024) | 96.2% | 1.5 s | 3.8% | 96.0% | 96.1% | 96.0% |
| **Proposed (Ours)** | **97%** | **1.2 s** | **≤3%** | **97.5%** | **97.1%** | **97.3%** |

The proposed YOLOv8-based system achieves the highest accuracy (97%), fastest inference (1.2 s end-to-end), and lowest misclassification rate (≤3%), with precision 97.5%, recall 97.1%, and F1-score 97.3%. A real-time speed of **~0.12 s (120 ms) per frame** surpasses other modern architectures such as YOLOv5, MobileNetV3, and Faster R-CNN.

### System Scalability

The system supports multiple video streams, has low computational load, and is suitable for hospitals, elderly care centers, offices, airports, and other public infrastructures. The architecture is suitable for distributed large-scale installations without specialized hardware thanks to its lightweight React frontend and FastAPI backend.

---

## Frontend

- **Stack:** React 19, Vite 7. No router; single-app layout with modals.
- **State:** Local component state (no Redux/MobX). Theme stored in `localStorage` (`theme`).
- **API base:** `import.meta.env.VITE_API || \`http://${window.location.hostname}:8000\``.

### Main components

| File | Role |
|------|------|
| `App.jsx` | Layout: header, camera config (cam_ids, devices, binding), activate/refresh, grid vs single view, video feeds, theme toggle, menu/admin; SSE `/events` for live events and beeps. |
| `AdminPanel.jsx` | Login (Basic), dashboard/stats, email toggle, logs (in-memory + DB), report generation; subscribes to `/events`. |
| `MenuWindow.jsx` | Modal: Settings / Analytics / System; report date range and `POST /generate_report` (PDF download). |
| `EventsDialog.jsx` | Modal: filter/search/paginate events, export CSV (authorized/unauthorized/intrusion/freeze/ppe). |
| `LogHistory.jsx` | Log view and CSV export. |

### Scripts

- `npm run dev` — Dev server (host `0.0.0.0`, port 5173).
- `npm run build` — Production build.
- `npm run preview` — Preview production build.

### Frontend State & Data Flow

| State (App.jsx) | Purpose |
|-----------------|---------|
| `camIds` | Logical camera IDs from `GET /cam_ids`. |
| `devices` | List `{ index, name }` from `GET /devices`. |
| `binding` | Object `camId → selected device label` for dropdowns. |
| `cams`, `activeCamIds` | Active camera list and IDs from `GET /cams`. |
| `selected` | Currently selected camera for single-video view. |
| `stats` | `{ count, last }` from `GET /stats`; also updated on each SSE event. |
| `events` | Array of event objects (newest first); updated from SSE `/events`. |
| `view` | `"grid"` or `"single"`. |
| `theme` | `"dark"` or `"light"`; synced to `localStorage.theme`. |
| `showMenu`, `showEventsDialog`, `showAdminPanel` | Modal visibility. |

**SSE:** On mount, `EventSource(API + '/events')` is opened. Each `onmessage` parses JSON, prepends to `events`, updates `stats`, and triggers audio: `FREEZE_ALERT` → `freeze_beep.wav` (cooldown 3 s); `ZONE_ALERT` or `PPE_VIOLATION` → `beep.wav` (cooldown 3 s). Cleanup on unmount: `es.close()`. **Video:** `videoSrc = API + '/video?cam=' + encodeURIComponent(selected)`; `selected` can be camera ID or device name. **Recent events:** First 20 events from `events` shown in UI (`recentEvents`).

---

## Database Schema

### Overview

| Property | Value |
|----------|--------|
| **Engine** | SQLite 3 |
| **Database file** | `recognitions.db` (path: `DB_PATH` in `app7.py`, default project root) |
| **Creation** | Schema is created at application startup via `init_db()` if the table does not exist |
| **Concurrency** | All database access is guarded by a global `DB_LOCK` (threading lock) |
| **Row access** | `sqlite3.Row` row factory for dict-like column access |
| **Migrations** | None; schema is fixed. Drop the file to reset (schema recreated on next startup) |

---

### Table: `recognitions`

Single table storing all event types: zone alerts, freeze alerts, PPE violations, and face classification results. One row per event.

#### Column reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | No (PK) | Primary key, auto-increment. |
| `timestamp` | TEXT | No | Event time; format `YYYY-MM-DD HH:MM:SS`. |
| `event_type` | TEXT | No | One of: `ZONE_ALERT`, `FREEZE_ALERT`, `PPE_VIOLATION`, `FACE_CLASSIFIED`. |
| `cam_id` | TEXT | Yes | Logical camera ID (e.g. `cameraA`). |
| `zone_id` | TEXT | Yes | Zone identifier (e.g. `Z1`). |
| `track_id` | INTEGER | Yes | In-frame track ID from the detection pipeline. |
| `person_name` | TEXT | Yes | Identity from face recognition (allowlist label) or class name. |
| `allowed` | INTEGER | Yes | 1 = allowed (known face / compliant), 0 = not allowed; NULL if N/A. |
| `label` | TEXT | Yes | Human-readable label (e.g. `INTRUSION`, `FREEZE`, `PPE VIOLATION`). |
| `has_helmet` | INTEGER | Yes | 1 = helmet detected, 0 = not; used for PPE events. |
| `has_vest` | INTEGER | Yes | 1 = vest detected, 0 = not; used for PPE events. |
| `missing_ppe` | TEXT | Yes | Comma-separated list of missing PPE (e.g. `helmet, vest`). |
| `seconds_still` | INTEGER | Yes | Duration (seconds) still for freeze detection; used for FREEZE_ALERT. |
| `confidence` | REAL | Yes | Detection or verification confidence score. |
| `image_path` | TEXT | Yes | Relative path to saved crop image in `captures/` (if saved). |

#### SQL definition

```sql
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
);
```

---

### Indexes

Indexes are created in `init_db()` for common filters and reporting.

| Index name | Table | Column(s) | Purpose |
|------------|--------|-----------|---------|
| `idx_timestamp` | recognitions | `timestamp` | Date-range queries, report generation, admin logs |
| `idx_event_type` | recognitions | `event_type` | Filter by event type (e.g. ZONE_ALERT, FREEZE_ALERT) |
| `idx_cam_id` | recognitions | `cam_id` | Filter by camera, events-by-camera analytics |

```sql
CREATE INDEX IF NOT EXISTS idx_timestamp ON recognitions(timestamp);
CREATE INDEX IF NOT EXISTS idx_event_type ON recognitions(event_type);
CREATE INDEX IF NOT EXISTS idx_cam_id ON recognitions(cam_id);
```

---

### Event type → columns used

| event_type | Typically populated columns |
|------------|----------------------------|
| `ZONE_ALERT` | timestamp, event_type, cam_id, zone_id, track_id, label |
| `FREEZE_ALERT` | timestamp, event_type, cam_id, zone_id, track_id, label, seconds_still, image_path (optional) |
| `PPE_VIOLATION` | timestamp, event_type, cam_id, zone_id, track_id, label, has_helmet, has_vest, missing_ppe |
| `FACE_CLASSIFIED` | timestamp, event_type, cam_id, zone_id, person_name, allowed, label (class_name), image_path |

Other columns may be NULL or set when the event payload includes them.

---

### Insert mapping (application → database)

Events are inserted from `insert_event(event_data)` using this mapping from the in-memory event dict to table columns:

| Table column | Source (event_data key) |
|--------------|--------------------------|
| timestamp | `human_time` (or current time if missing) |
| event_type | `type` |
| cam_id | `cam_id` |
| zone_id | `zone_id` |
| track_id | `track_id` |
| person_name | `class_name` |
| allowed | `allowed` (bool → int) |
| label | `label` |
| has_helmet | `has_helmet` |
| has_vest | `has_vest` |
| missing_ppe | `missing_ppe` |
| seconds_still | `seconds_still` |
| confidence | `confidence` |
| image_path | `image_path` |

---

### Example row

```json
{
  "id": 1,
  "timestamp": "2025-03-03 14:22:01",
  "event_type": "ZONE_ALERT",
  "cam_id": "cameraA",
  "zone_id": "Z1",
  "track_id": 3,
  "person_name": null,
  "allowed": null,
  "label": "INTRUSION",
  "has_helmet": null,
  "has_vest": null,
  "missing_ppe": null,
  "seconds_still": null,
  "confidence": null,
  "image_path": null
}
```

Schema is created at startup with `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`; no migration system is used.

### Database Writes & Queries

| Operation | Where | Details |
|-----------|--------|---------|
| **Insert** | `insert_event(event_data)` called from `push_event()` (via executor). Columns: `timestamp` ← `human_time`, `event_type` ← `type`, `cam_id`, `zone_id`, `track_id`, `person_name` ← `class_name`, `allowed`, `label`, `has_helmet`, `has_vest`, `missing_ppe`, `seconds_still`, `confidence`, `image_path`. All access under `DB_LOCK`. |
| **Admin logs** | `GET /admin/logs/db` | `SELECT * FROM recognitions WHERE 1=1` + optional `timestamp >= ?` and `timestamp <= ?`, `ORDER BY timestamp DESC LIMIT ?`. |
| **Admin stats** | `GET /admin/stats` | `COUNT(*)`, events by type, by camera, recent 24h; plus email and active cameras from app state. |
| **Report** | `create_pdf_report` / `generate_report_charts` | Date-filtered `SELECT * FROM recognitions` for charts and event log table; pandas DataFrame for aggregations. |

In-memory `events_log` is append-only (no cap); admin in-memory logs return last N with `events_log[-limit:]`.

---

## Zone Configuration

Zones are JSON files: **per-camera** `zones_cameraA.json`, `zones_cameraB.json`, … or **fallback** `zones.json`.

**Format:**

```json
[
  {
    "zone_id": "Z1",
    "label": "RESTRICTED",
    "points": [ [x1, y1], [x2, y2], [x3, y3], ... ]
  }
]
```

- `zone_id`: Unique identifier (e.g. Z1, Z2).
- `label`: Human-readable label (e.g. RESTRICTED).
- `points`: Polygon vertices in image pixel coordinates (same resolution as camera feed).

To create or edit zones, run:

```bash
python app7.py --draw-zones --cam-id cameraA --cams "cameraA=0,cameraB=1,cameraC=2,cameraD=3"
```

Then save from the OpenCV window to generate/update `zones_cameraA.json`.

---

## Allowlist (Known Faces)

- **Directory:** `--allowlist-dir` (default `./known_faces`). Scanned at startup via `scan_known_faces()`.
- **Format:** One image per person. **Filename (without extension) = identity label** (e.g. `John.jpg` → label `"John"`). Supported extensions: typically `.jpg`, `.jpeg`, `.png` (see `exts` in `scan_known_faces`).
- **Storage:** Paths stored in `KNOWN_FACE_PATHS` (list of `(name, filepath)`). Optionally RGB images loaded into `KNOWN_FACES` for in-memory use.
- **Usage:** On zone entry, `deepface_classify_and_store()` crops the face region and runs `DeepFace.verify()` against each reference; first match sets `is_allowed` and `allowed_name`. If no faces are loaded, everyone is treated as not allowed.

---

## Camera Discovery

- **Backend:** `list_local_cams()` → `_probe_opencv_indices(max_index=10)`. For each index 0..9, tries OpenCV backends in order: default (0), `cv2.CAP_DSHOW`, `cv2.CAP_MSMF`. If `VideoCapture(i, backend)` opens and a frame is read within 0.3 s, the camera is listed. Device name from `_get_camera_name(index)`: tries PowerShell `Get-PnpDevice`, then WMIC `Win32_PnPEntity` for PNPClass Camera, then fallback `"Camera #N (index N)"`. Returned as `{"index": i, "name": "Device Name (index i)"}` so the frontend can send the full string in `activate_map`; backend parses index with regex `(index\s+(\d+))` or integer.
- **Utility:** `check_cams.py` probes indices 0–4 with MSMF and DSHOW and prints one line per (backend, index, ok).

---

## Email Alerts

- **Config:** In-code `EMAIL_CONFIG`: `smtp_server`, `smtp_port`, `sender`, `password`, `recipients`. `EMAIL_ENABLED` global toggled by `POST /admin/email/toggle`.
- **Trigger:** Only for event types `ZONE_ALERT`, `FREEZE_ALERT`, `PPE_VIOLATION` (inside `push_event()`). FACE_CLASSIFIED does not send email.
- **Content:** Subject line includes event type, camera, zone, timestamp. Body: event type, camera, zone, timestamp; optional track_id, person_name, missing_ppe, seconds_still; footer text. Plain text via `EmailMessage.set_content()`.
- **Sending:** Synchronous in thread pool (so async loop is not blocked). SMTP with STARTTLS, timeout 30 s. Retries: 3 attempts with exponential backoff (2 s, 4 s). Rate limit per event type (same type not sent again within a short window). On success/failure, logs to console.

**Audio:** `beep.wav` (zone/PPE alert) and `freeze_beep.wav` (freeze alert) are served at `GET /beep` and `GET /freeze_beep` (WAV, `audio/wav`). Frontend plays them on SSE events with a 3 s cooldown. Backend can also play `freeze_beep.wav` via pygame when a FREEZE_ALERT is emitted (if pygame is available and file exists).

---

## Security & Admin

- **Admin routes** (`/admin/*`) are protected with **HTTP Basic**. Default username/password are in `app7.py` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). Change these for production.
- **Email** settings (SMTP, sender, recipients) are in `app7.py` (`EMAIL_CONFIG`). Consider moving to environment variables or a config file for production.
- **CORS** is permissive (`allow_origins=["*"]`); tighten for production if needed.

---

## Report Generation

- **Endpoint:** `POST /generate_report` with optional body `{ "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }`.
- **Implementation:** `create_pdf_report()` in `app7.py` uses ReportLab for PDF and Matplotlib/Pandas/Seaborn for charts (e.g. events over time, by type, by camera).
- **Dependencies:** `reportlab`, `matplotlib`, `pandas`, `seaborn` (included in `requirements.txt`).
- **Response:** `StreamingResponse` with `Content-Disposition: attachment; filename=sentinel_ai_report_YYYYMMDD_HHMMSS.pdf`.

### Report Charts & PDF Structure

| Chart key | Description |
|-----------|-------------|
| `pie_events` | Event types distribution (pie chart). |
| `bar_cameras` | Event count per camera (bar chart; camera names from `device_names_by_id`). |
| `histogram_hourly` | Events per hour of day (0–23). |
| `heatmap_day_hour` | Heatmap: day of week × hour; day order Mon–Sun. |
| `bar_zones` | Top 10 zones by event count (horizontal bar). |
| `line_trend` | Daily event count over time (line + fill). |

**PDF sections (in order):** Title page (“Vision Based Human Tracking and Hazard Detection System”, “Analytics Report”); system description and key features; report usage tips; report info table (generated time, date range, total events); summary statistics and event types breakdown table; visual analytics (each chart on its own page where noted); system events log (paginated table from DB with date filter). If chart generation fails, a single-page error PDF is returned.

---

## Development Workflow

1. **Backend:** Run `python app7.py [args]` (or `launch7.ps1`). Change code and restart.
2. **Frontend:** Run `npm run dev` in `cv-frontend-2`; Vite HMR applies. Set `VITE_API` only if backend is on another host/port.
3. **Zones:** Use `--draw-zones --cam-id <id>` to create/edit `zones_<cam_id>.json`; then run main app.
4. **Allowlist:** Add images to `known_faces/` and restart backend to rescan.
5. **DB:** SQLite file `recognitions.db` in project root; delete to start fresh (schema recreated on next startup).

---

## Deployment Notes

- No Docker or systemd files in repo. Run backend as a long-lived process (e.g. systemd service or screen); serve frontend build (e.g. `npm run build` then nginx/static host) or run Vite dev behind a reverse proxy.
- Backend binds `0.0.0.0` on `--port`; ensure firewall allows it. For production: set strong admin password and consider env-based config for email and admin credentials; restrict CORS if needed.
- For PDF reports under load, chart generation and DB queries run in the request thread; for very large date ranges consider background jobs or caching.

---

## Known Limitations

- **events_log** is unbounded; long-running processes may use increasing memory.
- **Single process:** All cameras and API share one process; CPU/GPU contention possible with many streams.
- **PPE:** Default YOLO is COCO (no helmet/vest); use a custom-trained PPE model and set `--helmet-classes` / `--vest-classes` to match.
- **Face:** DeepFace runs on CPU by default; first call per model may be slow (model load). No liveness detection.
- **Zones:** No per-zone “allowed list”; allowlist is global. Zone polygons are 2D image-space (no camera calibration).
- **Email:** Credentials and recipients are in code; no per-recipient or per-event-type toggles in UI.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Allowlist** | Set of known (allowed) identities; one image per person in `known_faces/`; filename = label. |
| **Activate map** | Mapping from logical camera ID to physical device label (e.g. `"Camera (index 0)"`); sent via `POST /activate_map`. |
| **Track** | A persistent ID for a detected person across frames; used for cooldowns, freeze, and zone state. |
| **Freeze** | Person in zone with velocity below threshold for a sustained time (e.g. 30 s); may indicate fall/unconscious. |
| **PPE** | Personal Protective Equipment; helmet and vest checked on zone entry and continuously in zone. |
| **Zone entry** | First frame when a track’s bounding box satisfies the zone rule (center/overlap/feet); triggers face classification (and optional PPE check). |
| **SSE** | Server-Sent Events; one-way stream of JSON events to the browser. |

---

## System Deployment (Paper)

The Intelligent Real-Time Human Activity Monitoring and Unsafe Behaviour Detection System is deployed as a scalable, modular, and cloud-ready web application suitable for hospitals, homes, offices, public spaces, and assisted living facilities. The architecture supports real-time processing, secure data handling, and multi-site scalability, combining an AI detection engine, backend server, web dashboard, and optional cloud services for continuous monitoring and timely alerts.

### Backend Server and API

The backend server, built using **FastAPI**, receives video streams from webcams or IP cameras and processes each frame using the **YOLOv8** activity detection model. Walking, sitting, falling, running, lying down, or entering restricted areas are recognized in real time with sub-second latency. When identity verification is required, the backend integrates **DeepFace** to recognize authorized individuals or flag unknown persons, supporting access control and personalized monitoring. All detected events—activity type, identity, timestamps, and confidence scores—are recorded in a lightweight **SQLite** database, chosen for fast write operations, simplicity, and suitability for multi-camera real-time deployment. The backend provides **REST APIs** and **Server-Sent Events (SSE)** for seamless communication with the frontend dashboard, enabling instant alert delivery, live analytics updates, and rapid retrieval of historical logs. Cloud deployment options allow for centralized monitoring, scheduled report generation, and multi-site scalability.

### Frontend and Dashboard

The **React** frontend presents real-time streams from cameras with color-coded activity or behaviour status. Users can toggle between grid and single-camera views and filter historical logs by activity type, identity, date, or camera. Analytics such as activity charts and unsafe-behaviour heatmaps help identify trends. **SSE** updates ensure immediate alert display. The interface is optimized for desktops, tablets, and mobile devices for remote monitoring.

---

## Results

The system was tested using dual high-resolution cameras in indoor controlled environments where video streaming, behaviour detection, identity recognition, backend processing, and event logging were analysed simultaneously.

- **Main interface** delivered smooth dual-camera displays with synchronized overlays for activities, unsafe behaviours, and identity recognition.
- **YOLOv8** achieved an average inference time of **120 ms per frame**, with **97%** activity accuracy and **95.8%** unsafe-behaviour accuracy.
- Accuracy remained consistent across a variety of lighting scenarios (low light, uneven brightness, backlit scenes, partial shadows), with only minor fluctuations of ±1–2% in detection confidence. The model performed dependably under partial occlusions and background motion.
- **DeepFace** identity recognition verified known individuals and highlighted unknown faces without affecting overall speed.
- The backend handled multiple video streams, YOLOv8 inference, DeepFace classification, and event generation without congestion or frame drops.
- All events (activities, identities, unsafe behaviours, timestamps, confidence scores) are stored in **SQLite** for reliable long-term logging.
- The event viewer supported filtering, color-coded severity levels, and fast navigation through large log sets. **PDF** and **CSV** reports summarized behaviour trends, identity histories, and unsafe-behaviour statistics for audits and analysis.

Overall, the system showed high accuracy, low latency, and robust performance under lighting and environmental changes, making it suitable for hospitals, elderly-care facilities, offices, and other safety-critical environments.

---

## Conclusion & Future Work

The Intelligent Real-Time Human Activity Monitoring and Unsafe Behaviour Detection System provides an accurate and autonomous solution for continuous behavioural surveillance in homes, hospitals, offices, elderly-care facilities, and public spaces. Using **YOLOv8** for activity and unsafe behaviour detection and **DeepFace** for identity verification, the system achieves real-time performance with sub-second latency and stable multi-camera operation. The modular architecture—FastAPI backend, React frontend, and SQLite storage—ensures seamless communication, synchronized processing, and reliable event logging, reducing manual workload and human error in safety-critical environments.

**Planned future enhancements:**

- **Automated alerts** via email, SMS, or push notifications (email alerts are already implemented and toggleable in the admin panel).
- **Cloud-based synchronization** for centralized multi-site monitoring.
- **Scheduled PDF/CSV reporting** for compliance and audits.
- **Advanced analytics** for long-term pattern learning to predict risks (e.g. mobility decline, unusual night activity, early signs of confusion).
- **Multimodal sensing** (audio, depth, wearables), improved pose estimation, and integration with Smart Home and Hospital IoT systems for automated responses (lighting control, restricted-zone locking, nurse-call integration).
- A scalable behavioural intelligence ecosystem with risk scores, heatmaps, and cross-location analytics with minimal human intervention.

---

## Troubleshooting

| Issue | Suggestion |
|-------|------------|
| No video / black feed | Ensure cameras are activated via `POST /activate_map`; check device indices with `check_cams.py`; on Windows try different OpenCV backends (DSHOW vs MSMF). |
| "Camera not active" on /video or classify_live | Activate that camera first with `/activate_map`; use exact `cam_id` or device name returned by `/cams`. |
| DeepFace slow or failing | Increase `--skip-frames`, set `--min-face` to skip tiny crops; try a lighter `--face-model` (e.g. SFace). Ensure crop is at least 50×50 and reference images are clear front-facing faces. |
| No face match (everyone "Unknown") | Add good-quality reference images to `known_faces/`; increase `--face-threshold` (e.g. 0.6–1.0); check console for "No face detected" or distance logs. |
| Freeze alerts too often | Increase `--freeze-eps` or `--freeze-sustain`; increase `--freeze-cooldown`. |
| Zone alerts too often | Increase `--zone-cooldown` or `--classify-cooldown`. |
| PPE never detected | Default YOLO is COCO (no helmet/vest). Use a custom PPE model and set `--helmet-classes` / `--vest-classes` to match its class IDs. |
| Frontend can’t reach API | Set `VITE_API` to backend URL and rebuild; or ensure backend is on same host and port 8000. Check CORS if backend is on different origin. |
| SSE not updating in UI | Verify `GET /events` returns stream (e.g. curl or browser devtools); check that backend is emitting events (zone/freeze/PPE). |
| Report generation fails | Ensure `reportlab`, `matplotlib`, `pandas`, `seaborn` are installed (`pip install -r requirements.txt`). If "No events found", pick a date range that has data in `recognitions.db`. |
| Admin 401 Unauthorized | Use default `admin` / `admin123` or change `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `app7.py`. |
| Email not sending | Check `EMAIL_CONFIG` (server, port, sender, password); enable STARTTLS; if using Gmail, use app password and ensure "Less secure app access" or app-specific password. Toggle in admin to ensure `EMAIL_ENABLED` is true. |
| activate_map 400 "Could not parse index" | Send device label that includes `(index N)`, e.g. `"Integrated Camera (index 0)"`, as returned by `GET /devices`. |
| No .env file | Configuration is via CLI and in-code globals; add `.env` and load in code if desired. |
| High CPU / GPU | Reduce resolution or use smaller YOLO (e.g. yolov8n); increase `--skip-frames`; reduce number of active cameras. |

---

## License

See repository license file (if any). For third-party models (YOLO, DeepFace), refer to their respective licenses.

---

