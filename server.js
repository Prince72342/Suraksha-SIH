require("dotenv").config(); // load .env variables
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- MongoDB Setup (Mongoose) ----------------
const mongoUri = process.env.MONGO_URI;
mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ---------------- Schemas ----------------
const alertSchema = new mongoose.Schema({
  district: String,
  alert: String,
  severity: String,
  description: String,
  lat: Number,
  lon: Number,
  type: String,
  issued_on: { type: Date, default: Date.now },
  _source: String,
});

const meshSOSSchema = new mongoose.Schema({
  senderId: String,
  msg: String,
  lat: Number,
  lon: Number,
  ts: { type: Date, default: Date.now },
});

const Alert = mongoose.model("Alert", alertSchema);
const MeshSOS = mongoose.model("MeshSOS", meshSOSSchema);

// ---------------- Helper: Haversine Distance ----------------
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * d;
}

// ---------------- District Coordinates ----------------
const districtCoords = {
  Delhi: { lat: 28.7041, lon: 77.1025 },
  Mumbai: { lat: 19.076, lon: 72.8777 },
  Chennai: { lat: 13.0827, lon: 80.2707 },
  Kolkata: { lat: 22.5726, lon: 88.3639 },
  Bengaluru: { lat: 12.9716, lon: 77.5946 },
  Hyderabad: { lat: 17.385, lon: 78.4867 },
  Ahmedabad: { lat: 23.0225, lon: 72.5714 },
  Pune: { lat: 18.5204, lon: 73.8567 },
  Jaipur: { lat: 26.9124, lon: 75.7873 },
  Lucknow: { lat: 26.8467, lon: 80.9462 },
};

// ---------------- Alerts API ----------------
app.get("/api/alerts", async (req, res) => {
  try {
    const { lat, lon, radius } = req.query;
    let allAlerts = await Alert.find().lean();

    if (lat && lon && radius) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      const radiusNum = parseFloat(radius);

      allAlerts = allAlerts.filter(
        (a) =>
          a.lat &&
          a.lon &&
          haversineKm(latNum, lonNum, a.lat, a.lon) <= radiusNum
      );
    }

    allAlerts.sort((x, y) => new Date(y.issued_on) - new Date(x.issued_on));
    res.json(allAlerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Error fetching alerts" });
  }
});

// ---------------- Add Manual Alert ----------------
app.post("/api/alerts", async (req, res) => {
  try {
    const { district, alert, severity, description, lat, lon, type } = req.body;
    if (!district || !alert || !severity)
      return res
        .status(400)
        .json({ message: "district, alert, and severity required" });

    const newAlert = new Alert({
      district,
      alert,
      severity,
      description: description || "No description provided",
      lat: lat || null,
      lon: lon || null,
      type: type || "default",
      _source: "manual",
    });

    await newAlert.save();
    res.json({ message: "✅ Govt Alert added", alert: newAlert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Error adding alert" });
  }
});

// ---------------- AI Risk Scanning ----------------
app.post("/api/ai-scan", async (req, res) => {
  try {
    const { imageBase64, lat, lon, reporter } = req.body;
    if (!imageBase64)
      return res.status(400).json({ message: "imageBase64 required" });

    const severityRoll = Math.random();
    let severity = "Low";
    if (severityRoll > 0.92) severity = "Critical";
    else if (severityRoll > 0.75) severity = "High";
    else if (severityRoll > 0.45) severity = "Medium";

    const types = ["structural", "fire", "flood", "landslide", "other"];
    const detectedType = types[Math.floor(Math.random() * types.length)];

    const aiAlert = new Alert({
      district: "Unknown",
      alert: `AI Scan: ${detectedType} detected`,
      severity,
      description: `AI-scanned image suggests ${detectedType}. Reporter: ${
        reporter || "anonymous"
      }`,
      lat: lat || null,
      lon: lon || null,
      type: detectedType,
      _source: "ai-scan",
    });

    await aiAlert.save();
    res.json({
      message: "✅ AI analysis complete",
      result: { severity, detectedType, aiAlert },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ AI scan error" });
  }
});

// ---------------- Mesh SOS ----------------
app.post("/api/mesh/sos", async (req, res) => {
  try {
    const { senderId, lat, lon, msg } = req.body;
    if (!senderId || !msg)
      return res.status(400).json({ message: "senderId and msg required" });

    const record = new MeshSOS({
      senderId,
      lat: lat || null,
      lon: lon || null,
      msg,
    });
    await record.save();
    res.json({ message: "📡 SOS stored for mesh sync", record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Error storing SOS" });
  }
});

app.get("/api/mesh/sos", async (req, res) => {
  try {
    const { lat, lon, radius } = req.query;
    let sosList = await MeshSOS.find().lean();

    if (lat && lon && radius) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      const radiusNum = parseFloat(radius);

      sosList = sosList.filter(
        (s) =>
          s.lat &&
          s.lon &&
          haversineKm(latNum, lonNum, s.lat, s.lon) <= radiusNum
      );
    }

    res.json(sosList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Error fetching SOS" });
  }
});

// ---------------- Weather Alerts ----------------
async function fetchWeatherAlerts() {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ OPENWEATHER_API_KEY not set, skipping weather fetch.");
      return;
    }

    for (const [district, coords] of Object.entries(districtCoords)) {
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric`;
      try {
        const res = await fetch(url, { timeout: 10000 });
        const data = await res.json();
        if (data?.alerts?.length > 0) {
          for (const a of data.alerts) {
            const type = a.event.toLowerCase().includes("flood")
              ? "flood"
              : a.event.toLowerCase().includes("storm")
              ? "cyclone"
              : "default";

            await Alert.updateOne(
              { alert: a.event, district, _source: "openweather" },
              {
                $set: {
                  district,
                  alert: a.event,
                  type,
                  issued_on: new Date(a.start * 1000),
                  severity: a.tags?.join(", ") || "General",
                  description: a.description || "No description",
                  lat: coords.lat,
                  lon: coords.lon,
                  _source: "openweather",
                },
              },
              { upsert: true }
            );
          }
        }
      } catch (err) {
        console.error(
          `❌ Error fetching OpenWeather for ${district}:`,
          err.message || err
        );
      }
    }
  } catch (err) {
    console.error("❌ Error in fetchWeatherAlerts:", err.message || err);
  }
}

// initial fetch + periodic refresh
fetchWeatherAlerts();
setInterval(fetchWeatherAlerts, 5 * 60 * 1000);

// ---------------- Serve HTML ----------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Optional: Serve all routes to index.html (SPA)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Suraksha server running at http://localhost:${PORT}`)
);
