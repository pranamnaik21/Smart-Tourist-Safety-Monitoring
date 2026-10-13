import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";

const DEFAULT_SERVER = "http://172.16.24.126:8000";

export default function ExploreScreen() {
  const [touristId, setTouristId] = useState("TOURIST-001");
  const [touristName, setTouristName] = useState("Student Tourist");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [serverStatus, setServerStatus] = useState("Checking...");
  const [zoneInfo, setZoneInfo] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      const savedId = await AsyncStorage.getItem("tourist_id");
      if (savedId) setTouristId(savedId);

      const savedName = await AsyncStorage.getItem("tourist_name");
      if (savedName) setTouristName(savedName);

      const savedUrl = await AsyncStorage.getItem("backend_url");
      if (savedUrl) setServerUrl(savedUrl);
    } catch (e) {
      console.log("Could not load explore settings", e);
    }
  }, []);

  const checkConnection = useCallback(async (urlToCheck = serverUrl) => {
    setTesting(true);
    setServerStatus("Connecting...");
    try {
      const res = await fetch(`${urlToCheck}/health`);
      if (res.ok) {
        const data = await res.json();
        setServerStatus(`Online (${data.storage || "SQLite"})`);
        const geoRes = await fetch(`${urlToCheck}/geofence`);
        if (geoRes.ok) {
          const geo = await geoRes.json();
          setZoneInfo(geo);
        }
      } else {
        setServerStatus(`Server Error HTTP ${res.status}`);
      }
    } catch (err: any) {
      setServerStatus("Offline (Check IP & Wi-Fi)");
    } finally {
      setTesting(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    void loadSettings();
    void checkConnection();
  }, [checkConnection, loadSettings]);

  const saveServerUrl = async () => {
    try {
      const trimmed = serverUrl.trim();
      await AsyncStorage.setItem("backend_url", trimmed);
      Alert.alert("Server Saved", `Backend URL updated to ${trimmed}`);
      void checkConnection(trimmed);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleOpenScanner = async () => {
    if (Platform.OS === "web") {
      setScannerOpen(true);
      return;
    }
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert("Camera Permission", "Camera permission is needed to scan authority QR codes. You can also paste the QR token manually.");
        return;
      }
    }
    setScanned(false);
    setScannerOpen(true);
  };

  const processQrData = async (rawCode: string) => {
    if (!rawCode) return;
    setScanned(true);
    try {
      const res = await fetch(`${serverUrl}/validate-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_data: rawCode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const newId = data.tourist.tourist_id;
        const newName = data.tourist.name;
        setTouristId(newId);
        setTouristName(newName);
        await AsyncStorage.setItem("tourist_id", newId);
        await AsyncStorage.setItem("tourist_name", newName);
        setScannerOpen(false);
        Alert.alert("Identity Verified! 🎉", `Tourist ID: ${newId}\nName: ${newName}\nYour device is now bound to this identity.`);
      } else {
        Alert.alert("Validation Failed", data.detail || "QR code is invalid or unauthorized.");
      }
    } catch (err: any) {
      Alert.alert("Network Error", `Could not reach backend to validate QR: ${err.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Explore & Settings</Text>
          <Text style={styles.subtitle}>Identity Registration, QR Scanner & Backend Config</Text>
        </View>

        {/* Tourist Identity Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>TOURIST IDENTITY</Text>
          <View style={styles.identityRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.touristNameText}>{touristName}</Text>
              <Text style={styles.touristIdText}>ID: <Text style={styles.badgeId}>{touristId}</Text></Text>
            </View>
          </View>
          <Text style={styles.hintText}>
            Each physical phone must have its own unique Tourist ID (e.g. T001, T002).
          </Text>
          <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}>
            <Text style={styles.scanBtnText}>📷 SCAN AUTHORITY QR CODE</Text>
          </TouchableOpacity>
        </View>

        {/* Backend Connection Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>FASTAPI BACKEND URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://10.133.34.54:8000"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Connection Status:</Text>
            <Text style={[styles.statusVal, serverStatus.includes("Online") ? styles.statusOnline : styles.statusOffline]}>
              {serverStatus}
            </Text>
          </View>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.saveBtn} onPress={saveServerUrl}>
              <Text style={styles.btnTextWhite}>Save URL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.testBtn} onPress={() => checkConnection()} disabled={testing}>
              {testing ? <ActivityIndicator size="small" color="#2563eb" /> : <Text style={styles.btnTextBlue}>Test Connection</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Geofence Information */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ACTIVE GEOFENCE ZONE</Text>
          <Text style={styles.zoneTitle}>{zoneInfo?.name || "SVIT College Ground"}</Text>
          <View style={styles.zoneDetails}>
            <Text style={styles.zoneDetailText}>Boundary Radius: <Text style={styles.bold}>{zoneInfo?.radius_meters || 50} metres</Text></Text>
            <Text style={styles.zoneDetailText}>Center Latitude: <Text style={styles.bold}>{zoneInfo?.latitude || 13.168130}</Text></Text>
            <Text style={styles.zoneDetailText}>Center Longitude: <Text style={styles.bold}>{zoneInfo?.longitude || 77.558402}</Text></Text>
            <Text style={styles.zoneDetailText}>Zone Rule: <Text style={styles.bold}>Restricted Danger Zone (alerts if inside)</Text></Text>
          </View>
        </View>
      </ScrollView>

      {/* QR Scanner Modal */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan Authority QR Code</Text>
            <TouchableOpacity onPress={() => setScannerOpen(false)}>
              <Text style={styles.closeBtnText}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS !== "web" ? (
            <View style={styles.cameraWrap}>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanned ? undefined : ({ data }) => processQrData(data)}
              />
              <View style={styles.viewfinder}>
                <View style={styles.viewfinderCornerTL} />
                <View style={styles.viewfinderCornerTR} />
                <View style={styles.viewfinderCornerBL} />
                <View style={styles.viewfinderCornerBR} />
              </View>
            </View>
          ) : (
            <View style={styles.webFallbackWrap}>
              <Text style={styles.webFallbackText}>Camera scanning is active on physical phones. In web view, enter or paste the QR payload below:</Text>
            </View>
          )}

          {/* Manual Input Fallback */}
          <View style={styles.manualWrap}>
            <Text style={styles.manualLabel}>Or enter Tourist ID / QR token manually:</Text>
            <TextInput
              style={styles.manualInput}
              placeholder="e.g. T001 or QR JSON token"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.manualSubmitBtn} onPress={() => processQrData(manualCode)}>
              <Text style={styles.btnTextWhite}>Validate & Bind ID</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#64748b", letterSpacing: 0.8, marginBottom: 10 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22 },
  touristNameText: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  touristIdText: { fontSize: 13, color: "#64748b", marginTop: 2 },
  badgeId: { fontWeight: "800", color: "#2563eb" },
  hintText: { fontSize: 12, color: "#94a3b8", lineHeight: 18, marginBottom: 14 },
  scanBtn: { backgroundColor: "#1e3a8a", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  scanBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  statusLabel: { fontSize: 12, color: "#64748b" },
  statusVal: { fontSize: 12, fontWeight: "800" },
  statusOnline: { color: "#16a34a" },
  statusOffline: { color: "#dc2626" },
  btnRow: { flexDirection: "row", gap: 10 },
  saveBtn: { flex: 1, backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  testBtn: { flex: 1, backgroundColor: "#eff6ff", borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#bfdbfe" },
  btnTextWhite: { color: "#ffffff", fontWeight: "800", fontSize: 13 },
  btnTextBlue: { color: "#2563eb", fontWeight: "800", fontSize: 13 },
  zoneTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  zoneDetails: { gap: 4 },
  zoneDetailText: { fontSize: 13, color: "#475569" },
  bold: { fontWeight: "700", color: "#0f172a" },

  // Scanner modal
  scannerContainer: { flex: 1, backgroundColor: "#0f172a" },
  scannerHeader: { flexDirection: "row", justifyContent: "space-between", padding: 20, paddingTop: 40, alignItems: "center" },
  scannerTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800" },
  closeBtnText: { color: "#94a3b8", fontSize: 16, fontWeight: "700" },
  cameraWrap: { flex: 1, position: "relative", justifyContent: "center", alignItems: "center" },
  viewfinder: { width: 220, height: 220, position: "relative" },
  viewfinderCornerTL: { position: "absolute", top: 0, left: 0, width: 24, height: 24, borderTopWidth: 4, borderLeftWidth: 4, borderColor: "#22c55e" },
  viewfinderCornerTR: { position: "absolute", top: 0, right: 0, width: 24, height: 24, borderTopWidth: 4, borderRightWidth: 4, borderColor: "#22c55e" },
  viewfinderCornerBL: { position: "absolute", bottom: 0, left: 0, width: 24, height: 24, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: "#22c55e" },
  viewfinderCornerBR: { position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderBottomWidth: 4, borderRightWidth: 4, borderColor: "#22c55e" },
  webFallbackWrap: { flex: 1, justifyContent: "center", padding: 24 },
  webFallbackText: { color: "#94a3b8", textAlign: "center", fontSize: 14, lineHeight: 22 },
  manualWrap: { padding: 20, backgroundColor: "#1e293b", borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  manualLabel: { color: "#cbd5e1", fontSize: 12, fontWeight: "700", marginBottom: 8 },
  manualInput: { backgroundColor: "#0f172a", color: "#ffffff", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#334155", marginBottom: 10 },
  manualSubmitBtn: { backgroundColor: "#16a34a", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
});
