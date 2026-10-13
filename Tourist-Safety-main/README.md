# 🛡️ Tourist Safety Monitoring System

<p align="center">
  <strong>Smart Tourism • Real-Time Monitoring • Emergency Response</strong>
</p>

<p align="center">
  A technology-driven system designed to support tourist safety through location monitoring, geofencing, QR-based identification, and emergency SOS alerts.
</p>

<p align="center">
  <a href="https://github.com/pavithran244/Tourist-Safety">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github" alt="GitHub Repository">
  </a>
  <img src="https://img.shields.io/badge/Python-FastAPI-009688?style=for-the-badge&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/React%20Native-Expo-4630EB?style=for-the-badge&logo=expo" alt="Expo">
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
</p>

---

## 🌟 Overview

The **Tourist Safety Monitoring System** is designed to improve tourist safety by combining a backend monitoring service with a mobile application.

The system provides features for tourist registration, QR code generation and validation, location updates, geofence management, and SOS emergency alerts.

It aims to help administrators monitor tourist safety information and respond more effectively to potential emergencies.

## ✨ Key Features

<table>
  <tr>
    <td align="center" width="50%">
      <h3>📍 Location Monitoring</h3>
      Supports receiving and managing tourist location updates.
    </td>
    <td align="center" width="50%">
      <h3>🚨 SOS Alerts</h3>
      Provides an emergency alert mechanism for safety-related incidents.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <h3>🗺️ Geofencing</h3>
      Supports configurable geographic zones and radius settings.
    </td>
    <td align="center" width="50%">
      <h3>🔐 QR Identification</h3>
      Supports tourist QR code generation and validation.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <h3>👤 Tourist Registration</h3>
      Provides an API endpoint for registering tourists.
    </td>
    <td align="center" width="50%">
      <h3>📊 Monitoring Dashboard</h3>
      Includes a backend dashboard interface for monitoring-related information.
    </td>
  </tr>
</table>

## 🏗️ Technology Stack

| Component | Technology |
|---|---|
| Backend | Python |
| API Framework | FastAPI |
| Mobile Application | React Native |
| Mobile Development | Expo |
| Programming Language | TypeScript |
| Package Management | npm |
| Version Control | Git and GitHub |

## 📁 Project Structure

```text
Tourist-Safety/
│
├── backend/
│   ├── main.py
│   ├── ai_engine.py
│   ├── dashboard.html
│   ├── requirements.txt
│   └── test_simulation.py
│
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── assets/
│   ├── src/
│   ├── app.json
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
│
├── .gitignore
└── README.md
```

## ⚙️ Getting Started

### Prerequisites

Install the following tools before running the project:

- Python 3.10 or a compatible version for the backend dependencies
- Node.js and npm
- Git
- Expo-compatible mobile device or emulator

### 1. Clone the Repository

```bash
git clone https://github.com/pavithran244/Tourist-Safety.git
cd Tourist-Safety
```

### 2. Start the Backend

Open a terminal in the project directory.

**Windows PowerShell:**

```powershell
cd backend

python -m venv venv

.\venv\Scripts\Activate.ps1

pip install -r requirements.txt

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

If PowerShell blocks virtual environment activation, you can use Command Prompt or run Uvicorn through the virtual environment's Python executable.

**Backend URLs:**

- API server: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### 3. Start the Mobile Application

Open another terminal:

```bash
cd mobile

npm install

npx expo start
```

Follow the Expo terminal instructions to launch the app on a compatible emulator or device.

**Important:** A physical phone cannot normally reach a backend through its own `127.0.0.1` address. Configure the mobile app to use your computer's LAN IP address when testing on a phone, and make sure both devices can communicate over the network.

## 🔌 Backend API Modules

The backend includes endpoints for the following operations:

| Endpoint | Purpose |
|---|---|
| `/register` | Tourist registration |
| `/qr/{tourist_id}` | Tourist QR code generation |
| `/validate-qr` | QR code validation |
| `/location` | Location updates (includes AI predictive safety score) |
| `/sos` | Emergency SOS alerts |
| `/tourists` | Tourist information |
| `/alerts` | Alert information |
| `/geofence` | Retrieve or update geofence configuration |
| `/api/ai/incidents` | List or log historical incidents archive |
| `/api/ai/hotspots` | Unsupervised DBSCAN incident clusters & hotspots |
| `/api/ai/predict-risk` | AI predictive safety score & early warning alerts |
| `/api/ai/analytics` | Incident category, time-of-day, & severity analytics |


For exact request formats and parameters, start the backend and visit `/docs`.

## 🗺️ Geofencing

The system includes configurable geofence settings to support geographic safety-zone management.

Geofence configuration can include:
- Zone name or location
- Latitude and longitude
- Radius in meters
- Zone type

Actual location tracking and zone-crossing detection depend on the implemented backend and mobile logic.

## 🚨 Emergency SOS Workflow

1. A tourist initiates an SOS alert through the supported application workflow.
2. The application sends the alert to the backend.
3. The backend processes the request and makes alert information available through its API.
4. An authorized monitoring interface can retrieve available alert information.

**Note:** Successful alert processing does not automatically mean emergency services have been contacted. External notification and emergency-service integration must be configured separately if required.

## 🧪 Testing

The repository includes a backend simulation/test script:

```bash
cd backend

python test_simulation.py
```

Run the script in the configured Python environment. Review its output to confirm the scenarios it tests and whether they pass.

## 🔒 Security Considerations

- Never commit passwords, API keys, private tokens, or production credentials.
- Keep local environment files and generated data out of version control.
- Validate and authenticate sensitive API operations before deployment.
- Restrict access to tourist location data and emergency alerts.
- Use HTTPS and appropriate access controls in production.
- Test the system with sample data before using real tourist information.

## 🚀 Future Enhancements

Potential enhancements include:

- Live map-based tourist monitoring
- Push notifications for SOS events
- Geofence entry and exit notifications
- Authorized administrator authentication
- Emergency contact integration
- Tourist travel history and reporting
- Cloud deployment and scalable data storage

These are possible future improvements and may require additional implementation.

## 🎯 Project Objectives

- Improve awareness of tourist safety conditions.
- Support geographic safety-zone monitoring.
- Provide QR-based tourist identification workflows.
- Enable emergency alert submission and monitoring.
- Demonstrate the integration of a mobile application and a REST API.

## 👨‍💻 Repository

**GitHub:** [pavithran244/Tourist-Safety](https://github.com/pavithran244/Tourist-Safety)

Contributions, suggestions, and improvements are welcome.

## 📜 License

Refer to the repository's `mobile/LICENSE` file for the mobile application's license terms. Add a project-wide license if you intend the entire repository to be distributed under the same license.

---

<p align="center">
  <strong>🛡️ Building Safer Journeys Through Technology</strong>
  <br>
  <sub>Tourist Safety Monitoring System</sub>
</p>
