const mongoose = require('mongoose');

// Check if model already exists to prevent re-registration
if (mongoose.models.LotteryResult) {
  module.exports = mongoose.models.LotteryResult;
} else {
  const lotteryResultSchema = new mongoose.Schema({
    gameType: { 
      type: String, 
      enum: ['539', 'mark6', 'lotto649'], 
      required: true 
    },
    drawDate: {
      type: Date,
      required: true
    },
    numbers: {
      type: [Number],
      required: true
    },
    bonus: {
      type: Number,
      default: null
    },
    drawNumber: {
      type: Number,
      default: null
    },
    source: { 
      type: String, 
      default: 'manual' 
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }, {
    timestamps: true,
    collection: 'lottery_results'
  });

  // Add index
  lotteryResultSchema.index({ gameType: 1, drawDate: -1 });

  // IMPORTANT: Add this to prevent the _id error
  lotteryResultSchema.pre('save', function(next) {
    // Ensure _id exists before saving
    if (!this._id) {
      this._id = new mongoose.Types.ObjectId();
    }
    next();
  });

  module.exports = mongoose.model('LotteryResult', lotteryResultSchema);
}