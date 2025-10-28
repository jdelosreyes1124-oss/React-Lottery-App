const mongoose = require('mongoose');

// Check if model already exists to prevent re-registration
if (mongoose.models.LotteryResult) {
  module.exports = mongoose.models.LotteryResult;
} else {
  const lotteryResultSchema = new mongoose.Schema({
    _id: { type: Number },
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

  // Initialize sequence if needed
  async function initializeSequence() {
    const db = mongoose.connection.db;
    const collection = db.collection('lottery_results');
    
    // Check if counters collection exists
    const countersColl = db.collection('counters');
    const counter = await countersColl.findOne({ _id: 'lottery_results' });
    
    if (!counter) {
      // Find the highest _id
      const lastDoc = await collection.findOne({}, { sort: { _id: -1 } });
      const startSeq = lastDoc ? lastDoc._id + 1 : 10011;
      
      // Create counter
      await countersColl.insertOne({
        _id: 'lottery_results',
        seq: startSeq
      });
    }
  }

  // Call initialization when model is created
  mongoose.connection.once('connected', () => {
    initializeSequence().catch(console.error);
  });

  // Pre-save middleware to get next sequence
  lotteryResultSchema.pre('save', async function(next) {
    if (!this._id) {
      try {
        const db = mongoose.connection.db;
        const result = await db.collection('counters').findOneAndUpdate(
          { _id: 'lottery_results' },
          { $inc: { seq: 1 } },
          { returnDocument: 'after', upsert: true }
        );
        this._id = result.value.seq;
        next();
      } catch (error) {
        console.error('Error generating sequence:', error);
        next(error);
      }
    } else {
      next();
    }
  });

  module.exports = mongoose.model('LotteryResult', lotteryResultSchema);
}