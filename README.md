#  RFID Attendance System

A smart attendance system that uses RFID technology + Web Dashboard to track student attendance in real-time.

---

##  Features

*  RFID-based student identification
*  Automatic attendance marking
*  Dashboard with real-time statistics
*  Student attendance tracking & reports
*  Lecture session management (start / end sessions)
*  Buzzer + LED feedback for access control
*  Full-stack system (Hardware + Backend + Frontend)

---

##  Tech Stack

###  Backend

* Node.js
* Express.js
* MongoDB (Atlas / Compass)
* Mongoose
* SerialPort (for RFID communication)

###  Frontend

* React.js
* Dashboard UI

###  Hardware

* ESP32
* MFRC522 RFID Sensor
* LEDs + Buzzer

---

##  How It Works

1. Student scans RFID card
2. ESP32 reads UID and sends it via Serial
3. Backend listens to Serial Port
4. UID is matched with registered students
5. Attendance is marked instantly in MongoDB
6. Dashboard updates in real-time

---

##  Project Structure

```
project/
│
├── backend/
│   ├── server.js
│   ├── models/
│   └── .env
│
├── frontend/
│   ├── src/
│   └── components/
│
└── hardware/
    └── esp32_code.ino
```

---

##  Setup Instructions

### Clone the repo

```bash
git clone https://github.com/your-username/rfid-attendance.git
cd rfid-attendance
```

---

### Backend Setup

```bash
cd backend
npm install
```

Create `.env` file:

```env
PORT=4001
MONGODB_URI=your_mongodb_connection
SERIAL_PORT=COM6
SERIAL_BAUD_RATE=115200
```

Run server:

```bash
npm start
```

---

### Frontend Setup

```bash
cd rfid-attendance
npm install
npm run dev start:all
```

---

### Hardware Setup

* Connect **MFRC522** to ESP32 using SPI
* Upload Arduino code
* Make sure baud rate = **115200**

---

##  API Endpoints

###  Start Session

```
POST /session/start
```

###  End Session

```
POST /session/end
```

###  Scan RFID

```
POST /attendance/scan-rfid
```

###  Dashboard Overview

```
GET /dashboard/overview
```

###  Session History

```
GET /session/history
```


If you like this project, give it a ⭐ on GitHub!
