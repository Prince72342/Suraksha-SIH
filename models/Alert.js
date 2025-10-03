const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  district: { type: String, required: true },
  alert: { type: String, required: true },
  severity: { type: String, required: true },
  description: { type: String, default: "No description provided" },
  lat: { type: Number },
  lon: { type: Number },
  type: { type: String, default: "default" },
  issued_on: { type: Date, default: Date.now },
  _source: { type: String, default: "manual" }
});

module.exports = mongoose.model('Alert', alertSchema);
