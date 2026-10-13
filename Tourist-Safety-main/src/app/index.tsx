import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Default Network & Geofence Configuration
const DEFAULT_BACKEND_URL = "http://172.16.24.126:8000";
const SVIT_GROUND_LAT = 13.168130;
const SVIT_GROUND_LON = 77.558402;
const DEFAULT_GEOFENCE_RADIUS = 50.0; // 50 metres

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function HomeScreen() {
  const [touristId, setTouristId] = useState("TOURIST-001");
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [latitude, setLatitude] = useState(13.168130);
  const [longitude, setLongitude] = useState(77.558402);
  const [accuracy, setAccuracy] = useState<number | null>(10);
  const [distance, setDistance] = useState(99);
  const [status, setStatus] = useState<"SAFE" | "DANGER_ZONE" | "SOS">("SAFE");
  const [tracking, setTracking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);

  // Modals for matching screenshot dialogs
  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [hasShownRestrictedAlert, setHasShownRestrictedAlert] = useState(false);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved preferences
  const loadPreferences = useCallback(async () => {
    try {
      const savedId = await AsyncStorage.getItem("tourist_id");
      if (savedId) setTouristId(savedId);

      const savedUrl = await AsyncStorage.getItem("backend_url");
      if (savedUrl) setBackendUrl(savedUrl);
    } catch (e) {
      console.log("Could not load preferences", e);
    }
  }, []);

  // Update distance and status based on coordinates
  const evaluateSafety = useCallback((lat: number, lon: number) => {
    const d = calculateDistanceMeters(lat, lon, SVIT_GROUND_LAT, SVIT_GROUND_LON);
    const roundedDist = Math.round(d);
    setDistance(roundedDist);

    if (roundedDist <= DEFAULT_GEOFENCE_RADIUS) {
      setStatus("DANGER_ZONE");
      if (!hasShownRestrictedAlert) {
        setShowRestrictedModal(true);
        setHasShownRestrictedAlert(true);
      }
    } else {
      setStatus("SAFE");
      setHasShownRestrictedAlert(false);
    }
  }, [hasShownRestrictedAlert]);

  // Send Location update to backend
  const pushLocationToBackend = useCallback(async (lat: number, lon: number, acc: number | null) => {
    try {
      const res = await fetch(`${backendUrl}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourist_id: touristId,
          latitude: lat,
          longitude: lon,
          accuracy: acc,
          status: status === "DANGER_ZONE" ? "DANGER_ZONE" : "SAFE",
        }),
      });
      if (res.ok) {
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    }
  }, [backendUrl, status, touristId]);

  // Fetch current GPS position
  const fetchCurrentLocation = useCallback(async () => {
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        Alert.alert("Permission Required", "Please allow GPS location permission to enable safety tracking.");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newLat = loc.coords.latitude;
      const newLon = loc.coords.longitude;
      const newAcc = loc.coords.accuracy;

      setLatitude(newLat);
      setLongitude(newLon);
      setAccuracy(newAcc);
      evaluateSafety(newLat, newLon);
      await pushLocationToBackend(newLat, newLon, newAcc);
    } catch (err: any) {
      console.log("Error obtaining GPS position:", err);
    }
  }, [evaluateSafety, pushLocationToBackend]);

  // Start live GPS tracking
  const startTracking = async () => {
    setBusy(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        Alert.alert("Permission Denied", "GPS access is required for real-time safety monitoring.");
        setBusy(false);
        return;
      }

      await fetchCurrentLocation();

      // Continuous tracking listener
      if (watchRef.current) {
        watchRef.current.remove();
      }
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 3,
        },
        (loc) => {
          const lat = loc.coords.latitude;
          const lon = loc.coords.longitude;
          const acc = loc.coords.accuracy;
          setLatitude(lat);
          setLongitude(lon);
          setAccuracy(acc);
          evaluateSafety(lat, lon);
          void pushLocationToBackend(lat, lon, acc);
        }
      );

      setTracking(true);
    } catch (e: any) {
      Alert.alert("Tracking Error", e.message || "Failed to start GPS monitoring.");
    } finally {
      setBusy(false);
    }
  };

  // Stop live GPS tracking
  const stopTracking = () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
  };

  // Trigger Emergency SOS with confirmation
  const handleSosPress = () => {
    Alert.alert(
      "Emergency SOS Confirmation",
      "Are you sure you want to send an emergency SOS alert to the authority dashboard with your live location?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "SEND SOS",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              // Send SOS to server
              const res = await fetch(`${backendUrl}/sos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tourist_id: touristId,
                  latitude,
                  longitude,
                  accuracy,
                  message: "Emergency SOS activated from tourist mobile application",
                }),
              });

              if (res.ok) {
                setStatus("SOS");
                setShowSosModal(true);
              } else {
                Alert.alert("SOS Failed", "Server did not confirm SOS receipt. Please retry or contact emergency services.");
              }
            } catch (err: any) {
              Alert.alert("Connection Error", `Could not connect to backend at ${backendUrl}. Check Wi-Fi connection.`);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    void loadPreferences();
    void startTracking();

    return () => {
      if (watchRef.current) watchRef.current.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const isDanger = status === "DANGER_ZONE" || status === "SOS";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Tourist Safety</Text>
            <Text style={styles.headerSubtitle}>Real-Time Safety Monitoring</Text>
          </View>
          <View style={[styles.statusPill, isDanger ? styles.statusPillDanger : styles.statusPillSafe]}>
            <View style={[styles.statusDot, isDanger ? styles.statusDotDanger : styles.statusDotSafe]} />
            <Text style={[styles.statusPillText, isDanger ? styles.statusPillTextDanger : styles.statusPillTextSafe]}>
              {status === "SOS" ? "SOS ALERT" : isDanger ? "DANGER" : "SAFE"}
            </Text>
          </View>
        </View>

        {/* Map Container View */}
        <View style={styles.mapCard}>
          {/* Top Floating Badge */}
          <View style={styles.mapTopBadge}>
            <Text style={styles.mapTopBadgeText}>📍 Live Tourist Location</Text>
          </View>

          {/* Top Right Target Button */}
          <TouchableOpacity style={styles.mapLocateBtn} onPress={fetchCurrentLocation}>
            <Text style={styles.mapLocateIcon}>🎯</Text>
          </TouchableOpacity>

          {/* Simulated High-Fidelity SVIT Map Canvas */}
          <View style={styles.mapCanvas}>
            {/* College background area & roads */}
            <View style={styles.mapRoadH} />
            <View style={styles.mapRoadV} />
            <View style={styles.mapBuildingA}>
              <Text style={styles.buildingLabel}>Sai Vidya Institute of Technology</Text>
              <Text style={styles.buildingLabelKannada}>ಸಾಯಿ ವಿದ್ಯಾ ಇನ್ಸ್ಟಿಟ್ಯೂಟ್ ಆಫ್...</Text>
            </View>
            <View style={styles.mapBuildingB}>
              <Text style={styles.canteenLabel}>SVIT Canteen</Text>
            </View>

            {/* Geofence 50m Restricted Circle at SVIT College Ground */}
            <View style={styles.geofenceCircle}>
              <View style={styles.geofenceInnerPulse} />
            </View>

            {/* Zone Center Callout Bubble */}
            <View style={styles.calloutBubble}>
              <Text style={styles.calloutTitle}>SVIT College Ground</Text>
              <Text style={styles.calloutSub}>Tourist safety monitoring zone</Text>
              <View style={styles.calloutArrow} />
            </View>

            {/* Red Zone Pin Marker */}
            <View style={styles.zonePinMarker}>
              <Text style={styles.pinIcon}>📍</Text>
            </View>

            {/* Blue Tourist Live Location Marker */}
            <View
              style={[
                styles.touristMarker,
                isDanger ? styles.touristMarkerDanger : styles.touristMarkerSafe,
              ]}
            >
              <View style={styles.touristPulse} />
              <View style={styles.touristCoreDot} />
            </View>

            {/* Map Google Watermark and Navigation action icons */}
            <View style={styles.mapFooterIcons}>
              <Text style={styles.googleWatermark}>Google</Text>
              <View style={styles.mapNavIcons}>
                <View style={styles.navSquareBtn}><Text style={styles.navIconText}>↗️</Text></View>
                <View style={styles.navSquareBtn}><Text style={styles.navIconText}>🗺️</Text></View>
              </View>
            </View>
          </View>
        </View>

        {/* Status Card (SAFE AREA / RESTRICTED ZONE) */}
        <View style={styles.safetyCard}>
          <View style={[styles.safetyCheckCircle, isDanger && styles.safetyDangerCircle]}>
            <Text style={styles.checkIconText}>{isDanger ? "🚨" : "✓"}</Text>
          </View>
          <View style={styles.safetyCardTextWrap}>
            <Text style={[styles.safetyCardTitle, isDanger && styles.safetyCardTitleDanger]}>
              {status === "SOS" ? "EMERGENCY SOS ACTIVE" : isDanger ? "RESTRICTED ZONE" : "SAFE AREA"}
            </Text>
            <Text style={styles.safetyCardSubtitle}>
              {isDanger ? "You have entered SVIT College Ground zone" : "GPS location is being monitored"}
            </Text>
          </View>
        </View>

        {/* Two-Column Stats Card (DISTANCE TO ZONE / GEO-FENCE) */}
        <View style={styles.twoColCard}>
          <View style={styles.colHalf}>
            <Text style={styles.colLabel}>DISTANCE TO ZONE</Text>
            <Text style={[styles.distValue, isDanger ? styles.distValueDanger : styles.distValueSafe]}>
              {distance} m
            </Text>
          </View>
          <View style={styles.colDivider} />
          <View style={styles.colHalf}>
            <Text style={styles.colLabel}>GEO-FENCE</Text>
            <Text style={styles.geofenceValue}>50 m</Text>
          </View>
        </View>

        {/* Coordinates Card (LATITUDE / LONGITUDE) */}
        <View style={styles.twoColCard}>
          <View style={styles.colHalf}>
            <Text style={styles.colLabel}>LATITUDE</Text>
            <Text style={styles.coordValue}>{latitude.toFixed(6)}</Text>
          </View>
          <View style={styles.colDivider} />
          <View style={styles.colHalf}>
            <Text style={styles.colLabel}>LONGITUDE</Text>
            <Text style={styles.coordValue}>{longitude.toFixed(6)}</Text>
          </View>
        </View>

        {/* Identity & Server Status Banner */}
        <View style={styles.identityBar}>
          <Text style={styles.identityText}>Tourist ID: <Text style={styles.boldText}>{touristId}</Text></Text>
          <Text style={styles.serverStatusText}>
            Server: <Text style={{ color: serverOnline ? "#16a34a" : "#dc2626", fontWeight: "700" }}>{serverOnline ? "Online" : "Offline"}</Text>
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsWrap}>
          {/* Live Tracking Button */}
          <TouchableOpacity
            style={[styles.btnTracking, !tracking && styles.btnTrackingInactive, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={tracking ? stopTracking : startTracking}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.btnText}>
                {tracking ? "📍 LIVE TRACKING ACTIVE" : "📍 START LIVE TRACKING"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Emergency SOS Button */}
          <TouchableOpacity
            style={[styles.btnSos, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={handleSosPress}
          >
            <Text style={styles.btnText}>🆘 EMERGENCY SOS</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL 1: RESTRICTED ZONE ALERT (Matches Screenshot 3) */}
      <Modal
        visible={showRestrictedModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRestrictedModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogHeader}>🚨 RESTRICTED ZONE</Text>
            <Text style={styles.dialogBody}>
              You have entered the SVIT College Ground safety monitoring zone.
            </Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogOkBtn}
                onPress={() => setShowRestrictedModal(false)}
              >
                <Text style={styles.dialogOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: SOS SENT ALERT (Matches Screenshot 1) */}
      <Modal
        visible={showSosModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSosModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogHeader}>🚨 SOS SENT</Text>
            <Text style={styles.dialogSubHeader}>Emergency alert sent to authority.</Text>

            <View style={styles.sosBreakdown}>
              <Text style={styles.sosSectionTitle}>📍 Current Location</Text>

              <Text style={styles.sosDataLabel}>Latitude:</Text>
              <Text style={styles.sosDataValue}>{latitude.toFixed(6)}</Text>

              <Text style={styles.sosDataLabel}>Longitude:</Text>
              <Text style={styles.sosDataValue}>{longitude.toFixed(6)}</Text>

              <Text style={styles.sosSectionTitle}>📏 Distance from Ground Zone:</Text>
              <Text style={styles.sosDataValue}>{distance} m</Text>

              <Text style={styles.sosSectionTitle}>🚨 Safety Status:</Text>
              <Text style={[styles.sosDataValue, { color: isDanger ? "#dc2626" : "#16a34a" }]}>
                {isDanger ? "RESTRICTED ZONE" : "SAFE AREA"}
              </Text>
            </View>

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogOkBtn}
                onPress={() => setShowSosModal(false)}
              >
                <Text style={styles.dialogOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6fa",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 18 : 12,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusPillSafe: {
    backgroundColor: "#dcfce7",
  },
  statusPillDanger: {
    backgroundColor: "#fee2e2",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotSafe: {
    backgroundColor: "#16a34a",
  },
  statusDotDanger: {
    backgroundColor: "#dc2626",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  statusPillTextSafe: {
    color: "#16a34a",
  },
  statusPillTextDanger: {
    color: "#dc2626",
  },

  // Map Card
  mapCard: {
    height: 250,
    backgroundColor: "#e8eff5",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    position: "relative",
  },
  mapTopBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  mapTopBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e293b",
  },
  mapLocateBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  mapLocateIcon: {
    fontSize: 16,
  },
  mapCanvas: {
    flex: 1,
    position: "relative",
    backgroundColor: "#e5ecf0",
    justifyContent: "center",
    alignItems: "center",
  },
  mapRoadH: {
    position: "absolute",
    width: "120%",
    height: 18,
    backgroundColor: "#ffffff",
    transform: [{ rotate: "-15deg" }],
  },
  mapRoadV: {
    position: "absolute",
    height: "140%",
    width: 16,
    backgroundColor: "#ffffff",
    transform: [{ rotate: "35deg" }],
  },
  mapBuildingA: {
    position: "absolute",
    left: 12,
    top: 80,
    maxWidth: 160,
  },
  buildingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  buildingLabelKannada: {
    fontSize: 10,
    color: "#64748b",
  },
  mapBuildingB: {
    position: "absolute",
    right: 30,
    top: 70,
  },
  canteenLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  geofenceCircle: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(239, 68, 68, 0.22)",
    borderWidth: 2,
    borderColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    top: 60,
    right: 80,
  },
  geofenceInnerPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  calloutBubble: {
    position: "absolute",
    top: 25,
    right: 40,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    zIndex: 5,
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  calloutSub: {
    fontSize: 10,
    color: "#64748b",
  },
  calloutArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(255,255,255,0.96)",
    position: "absolute",
    bottom: -6,
    alignSelf: "center",
  },
  zonePinMarker: {
    position: "absolute",
    top: 65,
    right: 120,
    zIndex: 6,
  },
  pinIcon: {
    fontSize: 28,
  },
  touristMarker: {
    position: "absolute",
    top: 85,
    right: 165,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 7,
  },
  touristMarkerSafe: {
    backgroundColor: "rgba(37, 99, 235, 0.25)",
  },
  touristMarkerDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.25)",
  },
  touristPulse: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2563eb",
  },
  touristCoreDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2563eb",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  mapFooterIcons: {
    position: "absolute",
    bottom: 6,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  googleWatermark: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    opacity: 0.7,
  },
  mapNavIcons: {
    flexDirection: "row",
    gap: 6,
  },
  navSquareBtn: {
    width: 26,
    height: 26,
    backgroundColor: "#ffffff",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  navIconText: {
    fontSize: 12,
  },

  // Status Card
  safetyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  safetyCheckCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  safetyDangerCircle: {
    backgroundColor: "#fee2e2",
  },
  checkIconText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#16a34a",
  },
  safetyCardTextWrap: {
    flex: 1,
  },
  safetyCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  safetyCardTitleDanger: {
    color: "#dc2626",
  },
  safetyCardSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },

  // Two Column Card
  twoColCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  colHalf: {
    flex: 1,
  },
  colDivider: {
    width: 1,
    height: 38,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 12,
  },
  colLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.8,
  },
  distValue: {
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  distValueSafe: {
    color: "#2563eb",
  },
  distValueDanger: {
    color: "#dc2626",
  },
  geofenceValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 4,
  },
  coordValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Identity Bar
  identityBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  identityText: {
    fontSize: 12,
    color: "#64748b",
  },
  boldText: {
    fontWeight: "800",
    color: "#0f172a",
  },
  serverStatusText: {
    fontSize: 12,
    color: "#64748b",
  },

  // Action Buttons
  actionsWrap: {
    gap: 12,
  },
  btnTracking: {
    backgroundColor: "#1d4ed8",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTrackingInactive: {
    backgroundColor: "#475569",
  },
  btnSos: {
    backgroundColor: "#dc2626",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // Modals Styling
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dialogCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  dialogHeader: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },
  dialogSubHeader: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 12,
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 21,
    color: "#334155",
    marginBottom: 20,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  dialogOkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dialogOkText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "800",
  },

  // SOS Breakdown inside Modal
  sosBreakdown: {
    marginVertical: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  sosSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 8,
    marginBottom: 2,
  },
  sosDataLabel: {
    fontSize: 12,
    color: "#64748b",
  },
  sosDataValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
});
