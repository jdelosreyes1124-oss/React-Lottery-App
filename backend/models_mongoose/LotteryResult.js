const mongoose = require('mongoose');

const lotteryResultSchema = new mongoose.Schema({
  _id: Number,
  gameType: { type: String, enum: ['539', 'mark6', 'lotto649'], required: true },
  drawDate: Date,
  numbers: [Number],
  bonus: Number,
  drawNumber: Number,
  source: { type: String, default: 'manual' },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

lotteryResultSchema.index({ gameType: 1, drawDate: -1 });

module.exports = mongoose.model('LotteryResult', lotteryResultSchema, 'lottery_results');