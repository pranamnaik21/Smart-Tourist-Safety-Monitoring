import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as Location from "expo-location";

import AsyncStorage from
  "@react-native-async-storage/async-storage";


/*
==============================================================
BACKEND CONFIGURATION
==============================================================

IMPORTANT:

Replace 172.16.24.126 with the IPv4 address of the computer
running the FastAPI backend.

Example:

const BACKEND_URL =
  "http://192.168.1.8:8000";

==============================================================
*/

const BACKEND_URL =
  "http://172.16.17.226:8000";


/*
==============================================================
TYPES
==============================================================
*/

type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocationState = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
};


/*
==============================================================
MAIN SCREEN
==============================================================
*/

export default function HomeScreen() {

  const [
    touristId,
    setTouristId
  ] = useState("TOURIST-001");


  const [
    location,
    setLocation
  ] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
  });


  const [
    serverStatus,
    setServerStatus
  ] = useState("Checking");


  const [
    tracking,
    setTracking
  ] = useState(false);


  const [
    status,
    setStatus
  ] = useState("SAFE");


  const [
    lastMessage,
    setLastMessage
  ] = useState(
    "Application ready"
  );

  // AI Predictive Safety States
  const [aiRiskScore, setAiRiskScore] = useState<number | null>(null);
  const [aiRiskLevel, setAiRiskLevel] = useState<string>("LOW");
  const [aiPredictiveAlert, setAiPredictiveAlert] = useState<string | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);


  // DANGER_ZONE_EDITOR_START
  const [zoneName, setZoneName] = useState("SVIT College Ground");
  const [zoneLatitude, setZoneLatitude] = useState("13.16813");
  const [zoneLongitude, setZoneLongitude] = useState("77.558402");
  const [zoneRadius, setZoneRadius] = useState("50");
  const [zoneType, setZoneType] = useState("danger");
  const [zoneSaving, setZoneSaving] = useState(false);

  async function loadDangerZone() {
    try {
      const response = await fetch(`${BACKEND_URL}/geofence`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setZoneName(String(data.name ?? ""));
      setZoneLatitude(String(data.latitude ?? ""));
      setZoneLongitude(String(data.longitude ?? ""));
      setZoneRadius(String(data.radius_meters ?? ""));
      setZoneType(String(data.zone_type ?? "danger"));
      setLastMessage("Danger zone settings loaded");
    } catch (error) {
      setLastMessage("Could not load danger zone settings");
      Alert.alert("Load failed", "Check that the backend is running and the phone can reach it.");
    }
  }

  async function useCurrentLocationForZone() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location permission required", "Allow location access and try again.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setZoneLatitude(position.coords.latitude.toFixed(6));
      setZoneLongitude(position.coords.longitude.toFixed(6));
      setLastMessage("Zone coordinates filled from current GPS");
    } catch {
      Alert.alert("GPS unavailable", "Could not read your current location.");
    }
  }

  async function saveDangerZone() {
    const lat = Number(zoneLatitude);
    const lon = Number(zoneLongitude);
    const radius = Number(zoneRadius);

    if (
      !zoneName.trim() ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180 ||
      !Number.isFinite(radius) || radius <= 0
    ) {
      Alert.alert("Check zone settings", "Enter a name, valid coordinates, and a radius greater than zero.");
      return;
    }

    setZoneSaving(true);
    try {
      const response = await fetch(`${BACKEND_URL}/geofence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: zoneName.trim(),
          latitude: lat,
          longitude: lon,
          radius_meters: radius,
          zone_type: zoneType || "danger",
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.detail || data.message || `HTTP ${response.status}`);
      }
      if (data.geofence) {
        setZoneName(String(data.geofence.name ?? zoneName));
        setZoneLatitude(String(data.geofence.latitude));
        setZoneLongitude(String(data.geofence.longitude));
        setZoneRadius(String(data.geofence.radius_meters));
        setZoneType(String(data.geofence.zone_type ?? "danger"));
      }
      setLastMessage("Danger zone saved successfully");
      Alert.alert("Saved", "Danger-zone settings were updated on the backend.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      Alert.alert("Save failed", message);
    } finally {
      setZoneSaving(false);
    }
  }
  // DANGER_ZONE_EDITOR_END

  const trackingRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);


  /*
  ============================================================
  LOAD SAVED TOURIST ID
  ============================================================
  */

  useEffect(() => {

    loadTouristId();

    checkServer();

    return () => {

      if (
        trackingRef.current
      ) {

        clearInterval(
          trackingRef.current
        );

      }

    };

  }, []);


  /*
  ============================================================
  SAVE TOURIST ID
  ============================================================
  */

  async function saveTouristId(
    value: string
  ) {

    try {

      await AsyncStorage.setItem(
        "tourist_id",
        value
      );

    }

    catch (error) {

      console.log(
        "Unable to save tourist ID",
        error
      );

    }

  }


  /*
  ============================================================
  LOAD TOURIST ID
  ============================================================
  */

  async function loadTouristId() {

    try {

      const saved =
        await AsyncStorage.getItem(
          "tourist_id"
        );

      if (saved) {

        setTouristId(
          saved
        );

      }

    }

    catch (error) {

      console.log(
        "Unable to load tourist ID",
        error
      );

    }

  }


  /*
  ============================================================
  CHECK SERVER
  ============================================================
  */

  async function checkServer() {

    try {

      setServerStatus(
        "Checking..."
      );

      const response =
        await fetch(
          BACKEND_URL +
          "/health"
        );


      if (
        !response.ok
      ) {

        throw new Error(
          "Server unavailable"
        );

      }


      const data =
        await response.json();


      if (
        data.status ===
        "healthy"
      ) {

        setServerStatus(
          "ONLINE"
        );

      }

      else {

        setServerStatus(
          "CONNECTED"
        );

      }


      setLastMessage(
        "Backend connected"
      );

    }

    catch (error) {

      setServerStatus(
        "OFFLINE"
      );

      setLastMessage(
        "Cannot connect to backend"
      );

    }

  }


  /*
  ============================================================
  REQUEST LOCATION PERMISSION
  ============================================================
  */

  async function requestLocationPermission() {

    const {
      status
    } =
      await Location.requestForegroundPermissionsAsync();


    if (
      status !== "granted"
    ) {

      Alert.alert(
        "Location Permission",
        "Location permission is required for tourist safety monitoring."
      );

      return false;

    }


    return true;

  }


  /*
  ============================================================
  GET CURRENT LOCATION
  ============================================================
  */

  async function getCurrentLocation() {

    const permission =
      await requestLocationPermission();


    if (!permission) {

      return null;

    }


    try {

      const result =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.High,
          }
        );


      const newLocation = {

        latitude:
          result.coords.latitude,

        longitude:
          result.coords.longitude,

        accuracy:
          result.coords.accuracy,
      };


      setLocation(
        newLocation
      );


      return newLocation;

    }

    catch (error) {

      Alert.alert(
        "Location Error",
        "Unable to obtain current GPS location."
      );

      return null;

    }

  }


  /*
  ============================================================
  SEND LOCATION TO SERVER
  ============================================================
  */

  async function sendLocation(
    coordinates: Coordinates
  ) {

    try {

      const response =
        await fetch(
          BACKEND_URL +
          "/location",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              {
                tourist_id:
                  touristId,

                latitude:
                  coordinates.latitude,

                longitude:
                  coordinates.longitude,

                accuracy:
                  location.accuracy,

                status:
                  status,
              }
            ),
          }
        );


      if (
        !response.ok
      ) {

        throw new Error(
          "Location request failed"
        );

      }


      const data =
        await response.json();


      if (
        data.geofence
      ) {
        const newStatus = data.geofence.status;
        if (newStatus === "DANGER_ZONE" && status !== "DANGER_ZONE") {
          const alertMsg = data.predictive_safety?.predictive_alert || "High historical incident zone. Multiple theft and harassment events recorded in past data.";
          Alert.alert(
            "🚨 RESTRICTED AREA ALERT",
            `You have entered a restricted area!\n\n` +
            `📊 Historical Incident Analysis:\n${alertMsg}\n\n` +
            `• Risk Level: ${data.predictive_safety?.risk_level || "HIGH"} (${data.predictive_safety?.risk_score || "78"}%)\n` +
            `• Nearest Incident: ${data.predictive_safety?.nearest_incident?.title || "Smartphone Snatching & Robbery"}\n\n` +
            `🛡️ Safety Actions: Avoid isolated paths, keep valuables secure, and exit this restricted zone immediately.`,
            [{ text: "I Understand", style: "default" }]
          );
        }

        setStatus(
          newStatus
        );

      }

      if (data.predictive_safety) {
        setAiRiskScore(data.predictive_safety.risk_score);
        setAiRiskLevel(data.predictive_safety.risk_level);
        setAiPredictiveAlert(data.predictive_safety.predictive_alert);
        setAiRecommendations(data.predictive_safety.recommendations || []);
      }


      setLastMessage(
        "Location sent successfully"
      );

    }

    catch (error) {

      setLastMessage(
        "Location upload failed"
      );

      console.log(
        "Location upload error",
        error
      );

    }

  }


  /*
  ============================================================
  UPDATE LOCATION
  ============================================================
  */

  async function updateLocation() {

    const current =
      await getCurrentLocation();


    if (
      current
    ) {

      await sendLocation(
        current
      );

    }

  }


  /*
  ============================================================
  START LIVE TRACKING
  ============================================================
  */

  async function startTracking() {

    if (
      tracking
    ) {

      return;

    }


    const permission =
      await requestLocationPermission();


    if (!permission) {

      return;

    }


    setTracking(
      true
    );


    setLastMessage(
      "Live tracking started"
    );


    await updateLocation();


    trackingRef.current =
      setInterval(
        async () => {

          await updateLocation();

        },
        5000
      );

  }


  /*
  ============================================================
  STOP LIVE TRACKING
  ============================================================
  */

  function stopTracking() {

    if (
      trackingRef.current
    ) {

      clearInterval(
        trackingRef.current
      );

      trackingRef.current =
        null;

    }


    setTracking(
      false
    );


    setLastMessage(
      "Live tracking stopped"
    );

  }


  /*
  ============================================================
  SEND SOS
  ============================================================
  */

  async function sendSOS() {

    const current =
      await getCurrentLocation();


    if (
      !current
    ) {

      Alert.alert(
        "SOS Error",
        "Current GPS location could not be obtained."
      );

      return;

    }


    try {

      const response =
        await fetch(
          BACKEND_URL +
          "/sos",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              {
                tourist_id:
                  touristId,

                latitude:
                  current.latitude,

                longitude:
                  current.longitude,

                accuracy:
                  current.accuracy,

                message:
                  "Emergency SOS activated from tourist mobile application",
              }
            ),
          }
        );


      if (
        !response.ok
      ) {

        throw new Error(
          "SOS request failed"
        );

      }


      const data =
        await response.json();


      setStatus(
        "SOS"
      );


      setLastMessage(
        "SOS sent to authority"
      );


      Alert.alert(
        "SOS SENT",
        "Emergency alert has been sent to the authority dashboard."
      );


      console.log(
        "SOS response:",
        data
      );

    }

    catch (error) {

      Alert.alert(
        "SOS Failed",
        "Unable to send emergency alert to the backend."
      );

      console.log(
        "SOS error:",
        error
      );

    }

  }


  /*
  ============================================================
  CONFIRM SOS
  ============================================================
  */

  function confirmSOS() {

    Alert.alert(
      "Emergency SOS",
      "Are you sure you want to send an emergency alert?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },

        {
          text: "SEND SOS",
          style: "destructive",
          onPress: sendSOS,
        },
      ]
    );

  }


  /*
  ============================================================
  SAVE TOURIST ID
  ============================================================
  */

  async function handleTouristIdChange(
    value: string
  ) {

    setTouristId(
      value
    );

    await saveTouristId(
      value
    );

  }


  /*
  ============================================================
  UI
  ============================================================
  */

  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <StatusBar
        barStyle="dark-content"
      />


      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >


        <View
          style={styles.header}
        >

          <Text
            style={styles.title}
          >
            Tourist Safety
          </Text>

          <Text
            style={styles.subtitle}
          >
            Monitoring System
          </Text>

        </View>


        <View
          style={styles.card}
        >

          <Text
            style={styles.cardTitle}
          >
            Tourist ID
          </Text>


          <TextInput
            value={touristId}
            onChangeText={
              handleTouristIdChange
            }
            placeholder="Enter Tourist ID"
            style={styles.input}
            autoCapitalize="characters"
          />

        </View>


        <View
          style={styles.card}
        >

          <Text
            style={styles.cardTitle}
          >
            Backend Status
          </Text>


          <Text
            style={[
              styles.statusText,

              serverStatus === "ONLINE"
                ? styles.online
                : styles.offline,
            ]}
          >
            {serverStatus}
          </Text>


          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={checkServer}
          >

            <Text
              style={styles.secondaryButtonText}
            >
              CHECK SERVER
            </Text>

          </TouchableOpacity>

        </View>


        <View
          style={styles.card}
        >

          <Text
            style={styles.cardTitle}
          >
            Current Safety Status
          </Text>


          <View
            style={[
              styles.statusBox,

              status === "SOS"
                ? styles.sosBox
                : status === "OUTSIDE_GEOFENCE"
                  ? styles.warningBox
                  : styles.safeBox,
            ]}
          >

            <Text
              style={styles.statusBoxText}
            >
              {status}
            </Text>

          </View>

        </View>

        {/* AI PREDICTIVE RISK CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI Predictive Risk Assessment</Text>
          <View style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: aiRiskLevel === "CRITICAL" ? "#fee2e2" : aiRiskLevel === "HIGH" ? "#ffedd5" : aiRiskLevel === "MODERATE" ? "#fef3c7" : "#dcfce7",
            marginVertical: 6,
          }}>
            <Text style={{
              fontWeight: "900",
              fontSize: 16,
              color: aiRiskLevel === "CRITICAL" ? "#dc2626" : aiRiskLevel === "HIGH" ? "#c2410c" : aiRiskLevel === "MODERATE" ? "#b45309" : "#15803d",
            }}>
              {aiRiskLevel} RISK ({aiRiskScore !== null ? `${aiRiskScore}%` : "Evaluating..."})
            </Text>
            {aiPredictiveAlert && (
              <Text style={{ fontSize: 13, color: "#991b1b", marginTop: 4, fontWeight: "600" }}>
                {aiPredictiveAlert}
              </Text>
            )}
          </View>
        </View>


        {/* DANGER_ZONE_EDITOR_START */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Danger Zone Editor</Text>
          <Text style={styles.locationText}>Zone name</Text>
          <TextInput
            style={styles.input}
            value={zoneName}
            onChangeText={setZoneName}
            placeholder="Danger zone name"
          />

          <Text style={styles.locationText}>Latitude</Text>
          <TextInput
            style={styles.input}
            value={zoneLatitude}
            onChangeText={setZoneLatitude}
            keyboardType="numeric"
            placeholder="Latitude"
          />

          <Text style={styles.locationText}>Longitude</Text>
          <TextInput
            style={styles.input}
            value={zoneLongitude}
            onChangeText={setZoneLongitude}
            keyboardType="numeric"
            placeholder="Longitude"
          />

          <Text style={styles.locationText}>Radius (meters)</Text>
          <TextInput
            style={styles.input}
            value={zoneRadius}
            onChangeText={setZoneRadius}
            keyboardType="numeric"
            placeholder="Radius in meters"
          />

          <Text style={styles.locationText}>Zone type: {zoneType}</Text>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={useCurrentLocationForZone}
          >
            <Text style={styles.secondaryButtonText}>USE MY CURRENT LOCATION</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.startButton}
            onPress={saveDangerZone}
            disabled={zoneSaving}
          >
            <Text style={styles.buttonText}>
              {zoneSaving ? "SAVING..." : "SAVE DANGER ZONE"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={loadDangerZone}
          >
            <Text style={styles.secondaryButtonText}>RELOAD SAVED ZONE</Text>
          </TouchableOpacity>
        </View>
        {/* DANGER_ZONE_EDITOR_END */}

        <View
          style={styles.card}
        >

          <Text
            style={styles.cardTitle}
          >
            GPS Location
          </Text>


          <Text
            style={styles.locationText}
          >
            Latitude:
            {" "}
            {location.latitude !== null
              ? location.latitude.toFixed(6)
              : "-"}
          </Text>


          <Text
            style={styles.locationText}
          >
            Longitude:
            {" "}
            {location.longitude !== null
              ? location.longitude.toFixed(6)
              : "-"}
          </Text>


          <Text
            style={styles.locationText}
          >
            Accuracy:
            {" "}
            {location.accuracy !== null
              ? location.accuracy.toFixed(2) +
                " m"
              : "-"}
          </Text>


          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={updateLocation}
          >

            <Text
              style={styles.secondaryButtonText}
            >
              GET CURRENT LOCATION
            </Text>

          </TouchableOpacity>

        </View>


        <View
          style={styles.card}
        >

          <Text
            style={styles.cardTitle}
          >
            Live Tracking
          </Text>


          <Text
            style={styles.trackingText}
          >
            {tracking
              ? "Tracking every 5 seconds"
              : "Tracking stopped"}
          </Text>


          <TouchableOpacity
            style={
              tracking
                ? styles.stopButton
                : styles.startButton
            }
            onPress={
              tracking
                ? stopTracking
                : startTracking
            }
          >

            <Text
              style={styles.buttonText}
            >
              {tracking
                ? "STOP TRACKING"
                : "START LIVE TRACKING"}
            </Text>

          </TouchableOpacity>

        </View>


        <TouchableOpacity
          style={styles.sosButton}
          onPress={confirmSOS}
        >

          <Text
            style={styles.sosButtonText}
          >
            EMERGENCY SOS
          </Text>

        </TouchableOpacity>


        <View
          style={styles.messageCard}
        >

          <Text
            style={styles.messageTitle}
          >
            System Message
          </Text>


          <Text
            style={styles.messageText}
          >
            {lastMessage}
          </Text>

        </View>


        <Text
          style={styles.footer}
        >
          Tourist Safety Monitoring System
        </Text>


      </ScrollView>

    </SafeAreaView>

  );

}


/*
==============================================================
STYLES
==============================================================
*/

const styles =
  StyleSheet.create({

    safeArea: {

      flex: 1,

      backgroundColor:
        "#f1f5f9",
    },


    container: {

      padding:
        18,

      paddingBottom:
        40,
    },


    header: {

      marginBottom:
        20,
    },


    title: {

      fontSize:
        32,

      fontWeight:
        "800",

      color:
        "#0f172a",
    },


    subtitle: {

      fontSize:
        16,

      color:
        "#64748b",

      marginTop:
        4,
    },


    card: {

      backgroundColor:
        "#ffffff",

      borderRadius:
        16,

      padding:
        18,

      marginBottom:
        16,

      shadowColor:
        "#000000",

      shadowOpacity:
        0.08,

      shadowRadius:
        8,

      elevation:
        3,
    },


    cardTitle: {

      fontSize:
        18,

      fontWeight:
        "700",

      color:
        "#0f172a",

      marginBottom:
        12,
    },


    input: {

      borderWidth:
        1,

      borderColor:
        "#cbd5e1",

      borderRadius:
        10,

      paddingHorizontal:
        14,

      paddingVertical:
        12,

      fontSize:
        16,

      color:
        "#0f172a",
    },


    statusText: {

      fontSize:
        20,

      fontWeight:
        "800",

      marginBottom:
        12,
    },


    online: {

      color:
        "#15803d",
    },


    offline: {

      color:
        "#dc2626",
    },


    secondaryButton: {

      backgroundColor:
        "#e2e8f0",

      padding:
        14,

      borderRadius:
        10,

      alignItems:
        "center",

      marginTop:
        8,
    },


    secondaryButtonText: {

      color:
        "#0f172a",

      fontWeight:
        "700",
    },


    statusBox: {

      borderRadius:
        12,

      padding:
        18,

      alignItems:
        "center",
    },


    safeBox: {

      backgroundColor:
        "#dcfce7",
    },


    warningBox: {

      backgroundColor:
        "#fef3c7",
    },


    sosBox: {

      backgroundColor:
        "#fee2e2",
    },


    statusBoxText: {

      fontSize:
        20,

      fontWeight:
        "800",

      color:
        "#0f172a",
    },


    locationText: {

      fontSize:
        15,

      color:
        "#334155",

      marginBottom:
        7,
    },


    trackingText: {

      color:
        "#64748b",

      marginBottom:
        10,
    },


    startButton: {

      backgroundColor:
        "#2563eb",

      padding:
        16,

      borderRadius:
        12,

      alignItems:
        "center",
    },


    stopButton: {

      backgroundColor:
        "#475569",

      padding:
        16,

      borderRadius:
        12,

      alignItems:
        "center",
    },


    buttonText: {

      color:
        "#ffffff",

      fontWeight:
        "800",
    },


    sosButton: {

      backgroundColor:
        "#dc2626",

      padding:
        20,

      borderRadius:
        16,

      alignItems:
        "center",

      marginBottom:
        16,

      elevation:
        5,
    },


    sosButtonText: {

      color:
        "#ffffff",

      fontSize:
        20,

      fontWeight:
        "900",
    },


    messageCard: {

      backgroundColor:
        "#e0f2fe",

      borderRadius:
        12,

      padding:
        16,

      marginBottom:
        20,
    },


    messageTitle: {

      fontWeight:
        "800",

      color:
        "#0c4a6e",

      marginBottom:
        6,
    },


    messageText: {

      color:
        "#075985",
    },


    footer: {

      textAlign:
        "center",

      color:
        "#64748b",

      fontSize:
        12,

      marginTop:
        10,
    },

  });




