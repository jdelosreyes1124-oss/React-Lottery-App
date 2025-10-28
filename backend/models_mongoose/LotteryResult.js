const mongoose = require('mongoose');

// Check if model already exists to prevent re-registration
if (mongoose.models.LotteryResult) {
  module.exports = mongoose.models.LotteryResult;
} else {
  const lotteryResultSchema = new mongoose.Schema({
    _id: Number,
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
      required: true,
      validate: {
        validator: function(v) {
          return Array.isArray(v) && v.length > 0;
        }
      }
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

  // Add indexes
  lotteryResultSchema.index({ gameType: 1, drawDate: -1 });

  // Pre-save middleware to auto-generate _id
  lotteryResultSchema.pre('save', async function(next) {
    if (!this._id) {
      try {
        const lastDoc = await this.constructor.findOne({}, { _id: 1 }).sort({ _id: -1 });
        this._id = lastDoc ? lastDoc._id + 1 : 10011; // Start from 10011 if no documents exist
        next();
      } catch (error) {
        next(error);
      }
    } else {
      next();
    }
  });

  module.exports = mongoose.model('LotteryResult', lotteryResultSchema);
}