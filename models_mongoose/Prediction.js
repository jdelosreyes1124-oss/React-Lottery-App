const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  _id: Number,
  userId: Number,
  gameType: { type: String, enum: ['539', 'mark6', 'lotto649'], required: true },
  predictionType: { type: String, default: 'standard' },
  predictedNumbers: [Number],
  bonusPrediction: Number,
  confidenceScore: { type: Number, default: 0.5 },
  algorithmsUsed: [String],
  analysisPeriod: { type: String, default: '1month' },
  metadata: mongoose.Schema.Types.Mixed,
  isWinner: Boolean,
  matchedNumbers: Number
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

module.exports = mongoose.model('Prediction', predictionSchema, 'predictions');