const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  _id: Number,
  userId: Number,
  action: { type: String, required: true },
  details: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

module.exports = mongoose.model('AdminLog', adminLogSchema, 'admin_logs');