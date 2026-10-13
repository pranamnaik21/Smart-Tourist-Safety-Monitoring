import math
from datetime import datetime
from typing import Dict, List, Optional, Any
import numpy as np
from sklearn.cluster import DBSCAN

# ============================================================
# DISTANCE & GEOSPATIAL HELPER
# ============================================================

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance between two GPS coordinates in meters using the Haversine formula."""
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


# ============================================================
# AI INCIDENT CLUSTERING (DBSCAN)
# ============================================================

def cluster_historical_incidents(incidents: List[Dict[str, Any]], eps_meters: float = 80.0, min_samples: int = 2) -> List[Dict[str, Any]]:
    """
    Applies DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
    to discover geographical incident hotspots automatically from historical data.
    """
    if not incidents or len(incidents) < min_samples:
        return []

    # Extract coordinates in radians for Haversine metric
    coords = np.array([[math.radians(inc["latitude"]), math.radians(inc["longitude"])] for inc in incidents])
    kms_per_radian = 6371.0
    epsilon_radians = (eps_meters / 1000.0) / kms_per_radian

    db = DBSCAN(eps=epsilon_radians, min_samples=min_samples, metric="haversine", algorithm="ball_tree")
    labels = db.fit_predict(coords)

    unique_labels = set(labels)
    clusters = []

    for label in unique_labels:
        if label == -1:
            # Noise points (isolated incidents)
            continue

        cluster_points = [incidents[i] for i in range(len(incidents)) if labels[i] == label]
        if not cluster_points:
            continue

        center_lat = float(np.mean([p["latitude"] for p in cluster_points]))
        center_lon = float(np.mean([p["longitude"] for p in cluster_points]))
        severities = [p.get("severity", 3) for p in cluster_points]
        avg_severity = float(np.mean(severities))
        max_severity = max(severities)

        # Count incident types
        type_counts: Dict[str, int] = {}
        for p in cluster_points:
            t = p.get("incident_type", "Other")
            type_counts[t] = type_counts.get(t, 0) + 1
        primary_type = max(type_counts, key=type_counts.get)

        # Calculate cluster radius (max distance from centroid to any point, minimum 35m)
        radii = [haversine_distance_meters(center_lat, center_lon, p["latitude"], p["longitude"]) for p in cluster_points]
        radius_meters = max(round(max(radii) + 15, 1), 35.0)

        # Determine risk label based on frequency and severity
        count = len(cluster_points)
        if count >= 4 or max_severity >= 5:
            risk_level = "CRITICAL"
            badge_color = "#dc2626"
        elif count >= 3 or max_severity >= 4:
            risk_level = "HIGH"
            badge_color = "#ea580c"
        else:
            risk_level = "MODERATE"
            badge_color = "#d97706"

        clusters.append({
            "cluster_id": int(label) + 1,
            "center_latitude": round(center_lat, 6),
            "center_longitude": round(center_lon, 6),
            "radius_meters": radius_meters,
            "incident_count": count,
            "primary_type": primary_type,
            "type_breakdown": type_counts,
            "avg_severity": round(avg_severity, 2),
            "max_severity": max_severity,
            "risk_level": risk_level,
            "badge_color": badge_color,
            "sample_incidents": [p.get("title") for p in cluster_points[:3]],
        })

    # Sort hotspots by incident count descending
    clusters.sort(key=lambda c: (c["incident_count"], c["avg_severity"]), reverse=True)
    return clusters


# ============================================================
# PREDICTIVE RISK EVALUATION & EARLY WARNING ENGINE
# ============================================================

def evaluate_predictive_risk(
    latitude: float,
    longitude: float,
    incidents: List[Dict[str, Any]],
    current_hour: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Calculates a predictive tourist safety score and early warning alerts.
    
    Factors considered:
    1. Spatial Proximity: Distance-decay model to all past incident locations.
    2. Severity Weight: Higher severity incidents produce stronger danger fields.
    3. Temporal / Time-of-Day factor: Nighttime (19:00 - 05:00) boosts danger weighting.
    4. Proximity to dense incident clusters/hotspots.
    """
    if current_hour is None:
        current_hour = datetime.now().hour

    is_night = (current_hour >= 19 or current_hour < 6)
    time_multiplier = 1.35 if is_night else 1.0

    if not incidents:
        return {
            "risk_score": 5.0,
            "risk_level": "LOW",
            "threat_status": "SAFE_ENVIRONMENT",
            "confidence": 95.0,
            "nearest_incident_meters": None,
            "nearest_incident_title": None,
            "hotspots_nearby_count": 0,
            "predictive_alert": None,
            "recommendations": ["Area clear of historical incidents.", "Stay alert and enjoy your visit."],
            "is_night": is_night,
            "time_factor": "Night Risk (+35%)" if is_night else "Standard Daylight",
        }

    # Analyze distances to all incidents
    incident_distances = []
    accumulated_risk_points = 0.0

    for inc in incidents:
        dist = haversine_distance_meters(latitude, longitude, inc["latitude"], inc["longitude"])
        severity = float(inc.get("severity", 3))

        # Time-of-day match bonus: if incident occurred at similar hour, higher relevance
        inc_hour = inc.get("reported_hour", 12)
        hour_diff = abs(current_hour - inc_hour)
        if hour_diff > 12:
            hour_diff = 24 - hour_diff
        hour_relevance = 1.25 if hour_diff <= 3 else 1.0

        # Distance decay formula: Risk decays smoothly with distance (up to 300 meters)
        # Within 30m: 100% influence, at 150m: ~25%, at 300m: negligible
        if dist <= 300.0:
            proximity_factor = math.exp(-dist / 85.0)  # exponential decay
            weight = severity * proximity_factor * hour_relevance * time_multiplier * 18.0
            accumulated_risk_points += weight

        incident_distances.append({
            "incident": inc,
            "distance_meters": round(dist, 1),
            "severity": severity,
        })

    # Sort by nearest distance
    incident_distances.sort(key=lambda x: x["distance_meters"])
    nearest = incident_distances[0]
    nearest_dist = nearest["distance_meters"]
    nearest_inc = nearest["incident"]

    # Also detect nearby clusters
    hotspots = cluster_historical_incidents(incidents)
    nearby_hotspots = []
    for h in hotspots:
        dist_h = haversine_distance_meters(latitude, longitude, h["center_latitude"], h["center_longitude"])
        if dist_h <= (h["radius_meters"] + 70.0):
            nearby_hotspots.append({
                **h,
                "distance_to_center_meters": round(dist_h, 1),
            })

    # Extra cluster proximity boost
    if nearby_hotspots:
        top_hotspot = nearby_hotspots[0]
        if top_hotspot["risk_level"] == "CRITICAL":
            accumulated_risk_points += 25.0
        elif top_hotspot["risk_level"] == "HIGH":
            accumulated_risk_points += 15.0
        else:
            accumulated_risk_points += 8.0

    # Baseline natural noise
    base_score = 8.0 if is_night else 3.0
    raw_risk_score = min(max(base_score + accumulated_risk_points, 5.0), 98.0)
    risk_score = round(raw_risk_score, 1)

    # Classify Risk Level & Early Warning Alert
    predictive_alert = None
    recommendations = []

    if risk_score >= 75.0:
        risk_level = "CRITICAL"
        threat_status = "PREDICTIVE_DANGER_ALERT"
        predictive_alert = (
            f"🚨 CRITICAL SAFETY WARNING: High historical incident zone! "
            f"Nearest incident: '{nearest_inc.get('title')}' is only {nearest_dist:.0f}m away. "
            f"Immediate caution is advised."
        )
        recommendations = [
            "Turn back towards designated safe tourist corridors immediately.",
            "Avoid poorly lit alleys and isolated structures.",
            "Keep emergency SOS trigger ready on your device.",
        ]
    elif risk_score >= 50.0:
        risk_level = "HIGH"
        threat_status = "ELEVATED_RISK"
        predictive_alert = (
            f"⚠️ ELEVATED RISK ADVISORY: Approaching historical incident area. "
            f"Multiple incidents reported within {nearest_dist:.0f}m ({nearest_inc.get('incident_type')})."
        )
        recommendations = [
            "Stay in crowded, well-illuminated areas.",
            "Do not accept unsolicited guides or transportation offers.",
            "Maintain situational awareness.",
        ]
    elif risk_score >= 30.0:
        risk_level = "MODERATE"
        threat_status = "CAUTION_ADVISED"
        predictive_alert = (
            f"ℹ️ CAUTION: You are within {nearest_dist:.0f}m of past reported incidents ({nearest_inc.get('title')})."
        )
        recommendations = [
            "Ensure personal belongings and mobile devices are secured.",
            "Follow marked tourist pathways.",
        ]
    else:
        risk_level = "LOW"
        threat_status = "SAFE_ZONE"
        predictive_alert = None
        recommendations = [
            "Area has low historical incident density.",
            "Normal safety precautions recommended.",
        ]

    return {
        "risk_score": risk_score,
        "safety_index": round(100.0 - risk_score, 1),
        "risk_level": risk_level,
        "threat_status": threat_status,
        "nearest_incident_meters": nearest_dist,
        "nearest_incident": {
            "id": nearest_inc.get("id"),
            "title": nearest_inc.get("title"),
            "type": nearest_inc.get("incident_type"),
            "severity": nearest_inc.get("severity"),
            "distance_meters": nearest_dist,
        },
        "hotspots_nearby_count": len(nearby_hotspots),
        "nearby_hotspots": nearby_hotspots,
        "predictive_alert": predictive_alert,
        "recommendations": recommendations,
        "is_night": is_night,
        "time_factor": "Night Risk Multiplier (1.35x Active)" if is_night else "Standard Daylight (1.0x)",
        "evaluated_at": datetime.now().isoformat(),
    }


# ============================================================
# HISTORICAL ANALYTICS AGGREGATOR
# ============================================================

def aggregate_incident_analytics(incidents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generates analytical summaries of historical incidents for dashboard charts."""
    if not incidents:
        return {
            "total_incidents": 0,
            "by_category": {},
            "by_time_of_day": {},
            "by_severity": {},
            "hourly_distribution": [0] * 24,
            "hotspot_count": 0,
        }

    by_category: Dict[str, int] = {}
    by_time: Dict[str, int] = {}
    by_severity: Dict[str, int] = {"Low (1-2)": 0, "Medium (3)": 0, "High (4-5)": 0}
    hourly_distribution = [0] * 24

    for inc in incidents:
        cat = inc.get("incident_type", "General")
        by_category[cat] = by_category.get(cat, 0) + 1

        tod = inc.get("time_of_day", "Afternoon")
        by_time[tod] = by_time.get(tod, 0) + 1

        sev = inc.get("severity", 3)
        if sev <= 2:
            by_severity["Low (1-2)"] += 1
        elif sev == 3:
            by_severity["Medium (3)"] += 1
        else:
            by_severity["High (4-5)"] += 1

        h = inc.get("reported_hour", 12)
        if 0 <= h < 24:
            hourly_distribution[h] += 1

    hotspots = cluster_historical_incidents(incidents)

    return {
        "total_incidents": len(incidents),
        "by_category": by_category,
        "by_time_of_day": by_time,
        "by_severity": by_severity,
        "hourly_distribution": hourly_distribution,
        "hotspot_count": len(hotspots),
        "top_threat_category": max(by_category, key=by_category.get) if by_category else "None",
        "peak_time_of_day": max(by_time, key=by_time.get) if by_time else "None",
    }
