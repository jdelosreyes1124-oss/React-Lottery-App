const mongoose = require('mongoose');

const schedulerJobSchema = new mongoose.Schema({
  _id: Number,
  gameType: { type: String, enum: ['539', 'mark6', 'lotto649'], unique: true },
  isActive: { type: Boolean, default: false },
  schedule: String,
  lastRun: Date,
  nextRun: Date,
  lastStatus: String,
  lastError: String,
  resultsScraped: { type: Number, default: 0 },
  totalRuns: { type: Number, default: 0 },
  successfulRuns: { type: Number, default: 0 },
  failedRuns: { type: Number, default: 0 }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

module.exports = mongoose.model('SchedulerJob', schedulerJobSchema, 'scheduler_jobs');