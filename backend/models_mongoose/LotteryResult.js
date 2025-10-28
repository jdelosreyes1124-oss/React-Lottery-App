const mongoose = require('mongoose');
const Counter = require('./Counter');

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

  // Function to get next sequence
  async function getNextSequence(name) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      return counter.seq;
    } catch (error) {
      console.error('Error getting next sequence:', error);
      throw error;
    }
  }

  // Pre-save middleware to auto-generate _id
  lotteryResultSchema.pre('save', async function(next) {
    try {
      if (!this._id) {
        this._id = await getNextSequence('lotteryResultId');
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  module.exports = mongoose.model('LotteryResult', lotteryResultSchema);
}