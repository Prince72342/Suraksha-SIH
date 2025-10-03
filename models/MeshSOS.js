const mongoose = require('mongoose');

const meshSOSSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  msg: { type: String, required: true },
  lat: { type: Number },
  lon: { type: Number },
  ts: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MeshSOS', meshSOSSchema);
