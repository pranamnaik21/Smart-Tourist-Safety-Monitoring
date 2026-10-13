import io
import json
import math
import os
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

import qrcode
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import ai_engine

# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="Tourist Safety Monitoring System",
    description="Real-time tourist tracking, geofencing, QR registration, and emergency monitoring backend",
    version="2.0.0",
)

# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# DATABASE SETUP (SQLite)
# ============================================================

DB_PATH = Path(__file__).parent / "tourist_safety.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS geofence_config (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_meters REAL NOT NULL,
        zone_type TEXT NOT NULL DEFAULT 'danger'
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tourists (
        tourist_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        token TEXT UNIQUE NOT NULL,
        registered_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SAFE',
        latitude REAL,
        longitude REAL,
        accuracy REAL,
        inside_geofence INTEGER DEFAULT 0,
        distance_from_geofence_meters REAL,
        last_updated TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tourist_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        message TEXT NOT NULL,
        time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        inside_geofence INTEGER DEFAULT 0,
        distance_from_geofence_meters REAL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS location_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tourist_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        status TEXT NOT NULL,
        distance_meters REAL,
        time TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS historical_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        severity INTEGER NOT NULL,
        time_of_day TEXT NOT NULL,
        incident_date TEXT NOT NULL,
        reported_hour INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # Default geofence: SVIT College Ground (as shown in student screenshots)
    cursor.execute("""
    INSERT OR IGNORE INTO geofence_config (id, name, latitude, longitude, radius_meters, zone_type)
    VALUES (1, 'SVIT College Ground', 13.168130, 77.558402, 50.0, 'danger')
    """)

    # Seed initial test tourist if empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM tourists")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("""
        INSERT INTO tourists (
            tourist_id, name, phone, token, registered_at, status,
            latitude, longitude, accuracy, inside_geofence,
            distance_from_geofence_meters, last_updated
        ) VALUES (
            'TOURIST-001', 'Default Student Tourist', '+91 9876543210',
            'token-tourist-001-init', datetime('now'), 'SAFE',
            13.168130, 77.558402, 10.0, 1, 0.0, datetime('now')
        )
        """)

    # Seed benchmark historical incidents if table is empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM historical_incidents")
    if cursor.fetchone()["cnt"] == 0:
        benchmark_incidents = [
            # Cluster 1: North-East Perimeter & Dim Alley (Night theft/harassment hotspot)
            ("Theft & Pickpocketing", "Smartphone Snatching at North Walkway", "Tourist smartphone snatched on poorly illuminated walkway after dark", 13.168580, 77.558880, 3, "Night", "2026-03-12", 21),
            ("Poor Lighting & Harassment", "Verbal Harassment near Perimeter Fence", "Aggressive harassment reported by solo tourist near broken light post", 13.168620, 77.558910, 4, "Night", "2026-04-05", 22),
            ("Theft & Pickpocketing", "Backpack Snatched from Stone Bench", "Tourist backpack containing camera and cash stolen while resting", 13.168550, 77.558850, 3, "Night", "2026-05-18", 20),
            ("Physical Altercation", "Late Night Robbery Attempt", "Attempted robbery altercation requiring security intervention", 13.168640, 77.558940, 5, "Night", "2026-06-22", 23),
            ("Poor Lighting & Harassment", "Tourist Cornered in Alleyway", "Solo female traveler followed and cornered; bystander assisted", 13.168590, 77.558890, 4, "Night", "2026-07-09", 21),
            ("Theft & Pickpocketing", "Purse Pickpocketing during Evening Rush", "Purse cut open with blade during student/visitor movement", 13.168570, 77.558870, 3, "Evening", "2026-08-14", 19),

            # Cluster 2: South Gate & Transit Bus Area (Touting & Crowded Theft Hotspot)
            ("Unauthorized Touting & Scams", "Fake Campus Guide Scam", "Unregistered individuals posing as official campus tour guides charging inflated fees", 13.167280, 77.557880, 2, "Afternoon", "2026-02-10", 14),
            ("Theft & Pickpocketing", "Camera Stolen in Bus Boarding Crowd", "High-value DSLR camera extracted from unzipped backpack at transit stop", 13.167310, 77.557920, 3, "Evening", "2026-03-27", 18),
            ("Unauthorized Touting & Scams", "Overcharging Taxi Extortion", "Unregistered cab driver demanded 5x fare and intimidated international visitor", 13.167250, 77.557850, 3, "Night", "2026-05-02", 20),
            ("Theft & Pickpocketing", "Wallet Snatched at Entry Turnstile", "Wallet stolen while tourist was purchasing entry counter pass", 13.167330, 77.557950, 3, "Evening", "2026-06-11", 17),
            ("Unauthorized Touting & Scams", "Counterfeit Souvenir Hawking", "Aggressive touting of fake memorabilia and forced donations", 13.167270, 77.557870, 2, "Afternoon", "2026-07-30", 15),

            # Cluster 3: Western Hill Excavation & Rough Terrain (Medical Distress Hotspot)
            ("Medical Distress", "Severe Ankle Fracture on Rocky Slope", "Tourist slipped on steep unpaved gravel trail with no handrails", 13.168010, 77.556790, 4, "Morning", "2026-01-19", 11),
            ("Unmarked Hazardous Terrain", "Deep Unfenced Construction Trench", "Unmarked 2-meter excavation ditch without warning signs or lighting", 13.167980, 77.556840, 3, "Afternoon", "2026-04-14", 16),
            ("Medical Distress", "Heat Stroke & Dehydration Collapse", "Elderly tourist collapsed from acute dehydration on unshaded trail", 13.168050, 77.556750, 4, "Afternoon", "2026-05-29", 13),
            ("Unmarked Hazardous Terrain", "Loose Rock Fall on Walking Path", "Erosion caused loose boulders to slide across walking path", 13.168020, 77.556810, 3, "Morning", "2026-08-03", 10),

            # Scattered / Isolated incidents (Area context)
            ("Lost Property & Belongings", "Misplaced Travel Documents", "Passport and itinerary folder left on cafeteria table; recovered", 13.169100, 77.558100, 1, "Morning", "2026-02-25", 10),
            ("Stray Animal Encounter", "Aggressive Stray Dogs Near Cafeteria", "Pack of territorial stray dogs threatened tourist near outer disposal unit", 13.167800, 77.559200, 2, "Morning", "2026-03-04", 8),
            ("Medical Distress", "Acute Insect Sting Reaction", "Severe allergic swelling from wasp sting requiring first-aid clinic visit", 13.168400, 77.557400, 3, "Afternoon", "2026-06-08", 14),
            ("Unmarked Hazardous Terrain", "Slippery Moss on Drainage Steps", "Wet stone stairs caused visitor fall with minor contusions", 13.169300, 77.558700, 2, "Morning", "2026-07-19", 9),
            ("Poor Lighting & Harassment", "Suspicious Loitering Near North Parking", "Unidentified individuals following solo walkers after 9 PM", 13.168750, 77.558200, 3, "Night", "2026-08-22", 21),
        ]
        now_ts = datetime.now().isoformat()
        cursor.executemany("""
        INSERT INTO historical_incidents (
            incident_type, title, description, latitude, longitude,
            severity, time_of_day, incident_date, reported_hour, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [(t, tit, d, lat, lon, s, tod, dt, h, now_ts) for t, tit, d, lat, lon, s, tod, dt, h in benchmark_incidents])

    conn.commit()
    conn.close()

# Initialize DB tables on startup
init_db()

# ============================================================
# DATA MODELS
# ============================================================

class LocationData(BaseModel):
    tourist_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    status: Optional[str] = "SAFE"

class SOSData(BaseModel):
    tourist_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    message: Optional[str] = "Emergency SOS activated"

class TouristRegistration(BaseModel):
    tourist_id: Optional[str] = None
    name: str
    phone: Optional[str] = ""

class ValidateQRRequest(BaseModel):
    qr_data: str

class GeofenceUpdate(BaseModel):
    name: Optional[str] = "SVIT College Ground"
    latitude: float
    longitude: float
    radius_meters: float
    zone_type: Optional[str] = "danger"

class IncidentCreate(BaseModel):
    incident_type: str
    title: str
    description: Optional[str] = ""
    latitude: float
    longitude: float
    severity: int = 3
    time_of_day: Optional[str] = "Afternoon"
    reported_hour: Optional[int] = 14
    incident_date: Optional[str] = None

class PredictRiskRequest(BaseModel):
    latitude: float
    longitude: float
    tourist_id: Optional[str] = None
    current_hour: Optional[int] = None

def get_all_historical_incidents():
    conn = get_db()
    rows = conn.execute("SELECT * FROM historical_incidents ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ============================================================
# DISTANCE & GEOFENCE LOGIC
# ============================================================

def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6371000.0  # meters
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return earth_radius * c

def get_current_geofence():
    conn = get_db()
    row = conn.execute("SELECT * FROM geofence_config WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return {
            "name": "SVIT College Ground",
            "latitude": 13.168130,
            "longitude": 77.558402,
            "radius_meters": 50.0,
            "zone_type": "danger",
        }
    return dict(row)

def check_geofence(latitude: float, longitude: float):
    geo = get_current_geofence()
    distance = calculate_distance_meters(
        latitude, longitude, geo["latitude"], geo["longitude"]
    )
    inside = distance <= geo["radius_meters"]

    if geo["zone_type"] == "danger":
        status = "DANGER_ZONE" if inside else "SAFE"
    else:
        status = "SAFE" if inside else "OUTSIDE_GEOFENCE"

    return {
        "inside": inside,
        "status": status,
        "distance_meters": round(distance, 2),
        "radius_meters": geo["radius_meters"],
        "name": geo["name"],
        "zone_type": geo["zone_type"],
        "center": {
            "latitude": geo["latitude"],
            "longitude": geo["longitude"],
        },
    }

# ============================================================
# CORE API ENDPOINTS
# ============================================================

@app.get("/")
def root():
    return {
        "project": "Tourist Safety Monitoring System",
        "status": "Backend running",
        "version": "2.0.0",
        "storage": "SQLite Database",
        "message": "Tourist Safety Monitoring System API is online",
        "endpoints": [
            "/",
            "/health",
            "/geofence",
            "/register",
            "/qr/{tourist_id}",
            "/validate-qr",
            "/location",
            "/sos",
            "/tourists",
            "/tourists/{tourist_id}",
            "/alerts",
            "/alerts/{alert_id}/acknowledge",
            "/alerts/{alert_id}/resolve",
            "/history",
            "/history/{tourist_id}",
            "/dashboard",
        ],
    }

@app.get("/health")
def health():
    conn = get_db()
    t_count = conn.execute("SELECT COUNT(*) AS c FROM tourists").fetchone()["c"]
    a_count = conn.execute(
        "SELECT COUNT(*) AS c FROM alerts WHERE status = 'ACTIVE'"
    ).fetchone()["c"]
    conn.close()
    return {
        "status": "healthy",
        "backend": "online",
        "storage": "SQLite database persistent",
        "tourists": t_count,
        "active_alerts": a_count,
        "time": datetime.now().isoformat(),
    }

@app.get("/geofence")
def get_geofence():
    return get_current_geofence()

@app.put("/geofence")
def update_geofence(data: GeofenceUpdate):
    conn = get_db()
    conn.execute("""
    UPDATE geofence_config
    SET name = ?, latitude = ?, longitude = ?, radius_meters = ?, zone_type = ?
    WHERE id = 1
    """, (data.name, data.latitude, data.longitude, data.radius_meters, data.zone_type))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": "Geofence updated successfully",
        "geofence": get_current_geofence(),
    }

# ============================================================
# TOURIST REGISTRATION & QR CODE WORKFLOW
# ============================================================

def generate_next_tourist_id(conn) -> str:
    rows = conn.execute("SELECT tourist_id FROM tourists").fetchall()
    existing_ids = [r["tourist_id"] for r in rows]
    # Check T001, T002, etc.
    for i in range(1, 1000):
        candidate = f"T{i:03d}"
        if candidate not in existing_ids:
            return candidate
    return f"T{secrets.token_hex(3).upper()}"

@app.post("/register")
def register_tourist(data: TouristRegistration):
    conn = get_db()
    tourist_id = data.tourist_id.strip() if data.tourist_id else generate_next_tourist_id(conn)

    # Check if ID exists
    existing = conn.execute(
        "SELECT * FROM tourists WHERE tourist_id = ?", (tourist_id,)
    ).fetchone()

    token = secrets.token_urlsafe(16)
    timestamp = datetime.now().isoformat()

    if existing:
        conn.execute("""
        UPDATE tourists
        SET name = ?, phone = ?, token = ?, registered_at = ?
        WHERE tourist_id = ?
        """, (data.name, data.phone or "", token, timestamp, tourist_id))
    else:
        conn.execute("""
        INSERT INTO tourists (
            tourist_id, name, phone, token, registered_at, status, last_updated
        ) VALUES (?, ?, ?, ?, ?, 'SAFE', ?)
        """, (tourist_id, data.name, data.phone or "", token, timestamp, timestamp))

    conn.commit()
    conn.close()

    qr_payload = json.dumps({
        "system": "TOURIST_SAFETY",
        "tourist_id": tourist_id,
        "token": token,
    })

    return {
        "success": True,
        "message": f"Tourist {tourist_id} registered successfully",
        "tourist_id": tourist_id,
        "name": data.name,
        "token": token,
        "qr_payload": qr_payload,
        "qr_image_url": f"/qr/{tourist_id}",
    }

@app.get("/qr/{tourist_id}")
def get_qr_image(tourist_id: str):
    conn = get_db()
    row = conn.execute(
        "SELECT tourist_id, token, name FROM tourists WHERE tourist_id = ?",
        (tourist_id,),
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Tourist not found")

    payload = json.dumps({
        "system": "TOURIST_SAFETY",
        "tourist_id": row["tourist_id"],
        "token": row["token"],
    })

    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=3,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#102b55", back_color="#ffffff")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.getvalue(), media_type="image/png")

@app.post("/validate-qr")
def validate_qr(req: ValidateQRRequest):
    try:
        data = json.loads(req.qr_data)
        tourist_id = data.get("tourist_id")
        token = data.get("token")
    except Exception:
        # If pure plain text ID was scanned
        tourist_id = req.qr_data.strip()
        token = None

    if not tourist_id:
        raise HTTPException(status_code=400, detail="Invalid QR payload")

    conn = get_db()
    if token:
        row = conn.execute(
            "SELECT * FROM tourists WHERE tourist_id = ? AND token = ?",
            (tourist_id, token),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM tourists WHERE tourist_id = ?", (tourist_id,)
        ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=404, detail="QR code not recognized or invalid token"
        )

    return {
        "success": True,
        "message": "QR verification successful",
        "tourist": {
            "tourist_id": row["tourist_id"],
            "name": row["name"],
            "phone": row["phone"],
            "status": row["status"],
            "registered_at": row["registered_at"],
        },
    }

# ============================================================
# LOCATION TRACKING & SOS
# ============================================================

@app.post("/location")
def receive_location(data: LocationData):
    geofence = check_geofence(data.latitude, data.longitude)
    timestamp = datetime.now().isoformat()
    inside_val = 1 if geofence["inside"] else 0

    conn = get_db()
    existing = conn.execute(
        "SELECT status FROM tourists WHERE tourist_id = ?", (data.tourist_id,)
    ).fetchone()

    # Preserve SOS status if current status is SOS and not yet resolved
    current_status = existing["status"] if existing else "SAFE"
    new_status = "SOS" if current_status == "SOS" else geofence["status"]

    if existing:
        conn.execute("""
        UPDATE tourists
        SET latitude = ?, longitude = ?, accuracy = ?, status = ?,
            inside_geofence = ?, distance_from_geofence_meters = ?, last_updated = ?
        WHERE tourist_id = ?
        """, (
            data.latitude, data.longitude, data.accuracy, new_status,
            inside_val, geofence["distance_meters"], timestamp, data.tourist_id
        ))
    else:
        conn.execute("""
        INSERT INTO tourists (
            tourist_id, name, token, registered_at, status, latitude, longitude,
            accuracy, inside_geofence, distance_from_geofence_meters, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.tourist_id, f"Tourist {data.tourist_id}", secrets.token_hex(8),
            timestamp, new_status, data.latitude, data.longitude,
            data.accuracy, inside_val, geofence["distance_meters"], timestamp
        ))

    # Record history
    conn.execute("""
    INSERT INTO location_history (
        tourist_id, latitude, longitude, accuracy, status, distance_meters, time
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data.tourist_id, data.latitude, data.longitude,
        data.accuracy, new_status, geofence["distance_meters"], timestamp
    ))

    # Keep latest 100 history rows per tourist
    conn.execute("""
    DELETE FROM location_history
    WHERE id NOT IN (
        SELECT id FROM location_history
        WHERE tourist_id = ?
        ORDER BY id DESC LIMIT 100
    ) AND tourist_id = ?
    """, (data.tourist_id, data.tourist_id))

    conn.commit()

    updated = conn.execute(
        "SELECT * FROM tourists WHERE tourist_id = ?", (data.tourist_id,)
    ).fetchone()
    conn.close()

    # AI Predictive Safety Analysis
    incidents = get_all_historical_incidents()
    predictive_safety = ai_engine.evaluate_predictive_risk(data.latitude, data.longitude, incidents)

    return {
        "success": True,
        "message": "Location received and stored",
        "tourist": dict(updated),
        "geofence": geofence,
        "predictive_safety": predictive_safety,
    }

@app.post("/sos")
def receive_sos(data: SOSData):
    timestamp = datetime.now().isoformat()
    geofence = check_geofence(data.latitude, data.longitude)
    inside_val = 1 if geofence["inside"] else 0

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO alerts (
        tourist_id, latitude, longitude, accuracy, message, time, status,
        inside_geofence, distance_from_geofence_meters
    ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    """, (
        data.tourist_id, data.latitude, data.longitude, data.accuracy,
        data.message, timestamp, inside_val, geofence["distance_meters"]
    ))
    alert_id = cursor.lastrowid

    # Update tourist status to SOS
    conn.execute("""
    UPDATE tourists
    SET status = 'SOS', latitude = ?, longitude = ?, accuracy = ?,
        distance_from_geofence_meters = ?, last_updated = ?
    WHERE tourist_id = ?
    """, (
        data.latitude, data.longitude, data.accuracy,
        geofence["distance_meters"], timestamp, data.tourist_id
    ))
    conn.commit()

    alert_row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    conn.close()

    return {
        "success": True,
        "message": "SOS received by authority and stored persistently",
        "alert": dict(alert_row),
    }

# ============================================================
# TOURISTS & ALERTS RETRIEVAL
# ============================================================

@app.get("/tourists")
def get_tourists():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tourists ORDER BY last_updated DESC").fetchall()
    conn.close()
    tourists_list = [dict(r) for r in rows]
    return {
        "count": len(tourists_list),
        "tourists": tourists_list,
    }

@app.get("/tourists/{tourist_id}")
def get_tourist(tourist_id: str):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM tourists WHERE tourist_id = ?", (tourist_id,)
    ).fetchone()
    conn.close()
    if not row:
        return {"success": False, "message": "Tourist not found"}
    return {"success": True, "tourist": dict(row)}

@app.get("/alerts")
def get_alerts():
    conn = get_db()
    rows = conn.execute("SELECT * FROM alerts ORDER BY id DESC").fetchall()
    conn.close()
    alerts_list = [dict(r) for r in rows]
    return {
        "count": len(alerts_list),
        "alerts": alerts_list,
    }

@app.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int):
    conn = get_db()
    conn.execute("UPDATE alerts SET status = 'ACKNOWLEDGED' WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Alert {alert_id} acknowledged"}

@app.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int):
    conn = get_db()
    alert = conn.execute("SELECT tourist_id FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    conn.execute("UPDATE alerts SET status = 'RESOLVED' WHERE id = ?", (alert_id,))
    if alert:
        # Check if tourist has other active alerts
        active_remaining = conn.execute(
            "SELECT COUNT(*) AS c FROM alerts WHERE tourist_id = ? AND status = 'ACTIVE'",
            (alert["tourist_id"],),
        ).fetchone()["c"]
        if active_remaining == 0:
            conn.execute(
                "UPDATE tourists SET status = 'SAFE' WHERE tourist_id = ?",
                (alert["tourist_id"],),
            )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Alert {alert_id} resolved"}

@app.get("/history")
def get_history():
    conn = get_db()
    rows = conn.execute("SELECT * FROM location_history ORDER BY id DESC").fetchall()
    conn.close()
    history = {}
    for r in rows:
        tid = r["tourist_id"]
        if tid not in history:
            history[tid] = []
        history[tid].append(dict(r))
    return {"history": history}

@app.get("/history/{tourist_id}")
def get_tourist_history(tourist_id: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM location_history WHERE tourist_id = ? ORDER BY id DESC LIMIT 100",
        (tourist_id,),
    ).fetchall()
    conn.close()
    return {
        "tourist_id": tourist_id,
        "locations": [dict(r) for r in rows],
    }

@app.delete("/clear")
def clear_data():
    conn = get_db()
    conn.execute("DELETE FROM alerts")
    conn.execute("DELETE FROM location_history")
    # Reset tourist status and locations
    conn.execute("""
    UPDATE tourists
    SET status = 'SAFE', latitude = NULL, longitude = NULL,
        inside_geofence = 0, distance_from_geofence_meters = NULL
    """)
    conn.commit()
    conn.close()
    return {"success": True, "message": "All tracking and alert history cleared"}

# ============================================================
# AI HISTORICAL INCIDENT ANALYSIS & PREDICTIVE ALERTS API
# ============================================================

@app.get("/api/ai/incidents")
def list_incidents(incident_type: Optional[str] = None, min_severity: Optional[int] = None):
    conn = get_db()
    query = "SELECT * FROM historical_incidents WHERE 1=1"
    params = []
    if incident_type:
        query += " AND incident_type LIKE ?"
        params.append(f"%{incident_type}%")
    if min_severity:
        query += " AND severity >= ?"
        params.append(min_severity)
    query += " ORDER BY id DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    incidents = [dict(r) for r in rows]
    return {
        "success": True,
        "count": len(incidents),
        "incidents": incidents,
    }

@app.post("/api/ai/incidents")
def create_incident(data: IncidentCreate):
    conn = get_db()
    cursor = conn.cursor()
    now_ts = datetime.now().isoformat()
    inc_date = data.incident_date or datetime.now().strftime("%Y-%m-%d")
    cursor.execute("""
    INSERT INTO historical_incidents (
        incident_type, title, description, latitude, longitude,
        severity, time_of_day, incident_date, reported_hour, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.incident_type, data.title, data.description or "",
        data.latitude, data.longitude, data.severity,
        data.time_of_day or "Afternoon", inc_date,
        data.reported_hour if data.reported_hour is not None else 14,
        now_ts
    ))
    new_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM historical_incidents WHERE id = ?", (new_id,)).fetchone()
    conn.close()
    return {
        "success": True,
        "message": "Incident logged successfully",
        "incident": dict(row),
    }

@app.delete("/api/ai/incidents/{incident_id}")
def delete_incident(incident_id: int):
    conn = get_db()
    conn.execute("DELETE FROM historical_incidents WHERE id = ?", (incident_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Incident {incident_id} deleted"}

@app.get("/api/ai/hotspots")
def get_ai_hotspots(eps_meters: float = 80.0, min_samples: int = 2):
    incidents = get_all_historical_incidents()
    hotspots = ai_engine.cluster_historical_incidents(incidents, eps_meters=eps_meters, min_samples=min_samples)
    return {
        "success": True,
        "total_incidents": len(incidents),
        "hotspots_count": len(hotspots),
        "hotspots": hotspots,
    }

@app.post("/api/ai/predict-risk")
def predict_tourist_risk_endpoint(req: PredictRiskRequest):
    incidents = get_all_historical_incidents()
    prediction = ai_engine.evaluate_predictive_risk(
        latitude=req.latitude,
        longitude=req.longitude,
        incidents=incidents,
        current_hour=req.current_hour,
    )
    if req.tourist_id:
        prediction["tourist_id"] = req.tourist_id
    return {
        "success": True,
        "prediction": prediction,
    }

@app.get("/api/ai/analytics")
def get_incident_analytics():
    incidents = get_all_historical_incidents()
    analytics = ai_engine.aggregate_incident_analytics(incidents)
    return {
        "success": True,
        "analytics": analytics,
    }

# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def dashboard():
    dashboard_path = Path(__file__).parent / "dashboard.html"
    return FileResponse(dashboard_path)

# ============================================================
# LOCAL DIRECT EXECUTION
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
