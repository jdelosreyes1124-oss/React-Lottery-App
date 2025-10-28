const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 10011 } // Start from 10011 since last ID is 10010
});

module.exports = mongoose.model('Counter', counterSchema);