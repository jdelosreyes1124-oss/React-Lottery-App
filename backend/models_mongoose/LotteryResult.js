const mongoose = require('mongoose');

// Check if model already exists to prevent re-registration
if (mongoose.models.LotteryResult) {
  module.exports = mongoose.models.LotteryResult;
} else {
  const AutoIncrement = require('mongoose-sequence')(mongoose);
  
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
  // Add indexes
  lotteryResultSchema.index({ gameType: 1, drawDate: -1 });
  
  // Add auto-increment plugin
  lotteryResultSchema.plugin(AutoIncrement, {
    id: 'lottery_result_seq',
    inc_field: '_id',
    start_seq: 10011 // Start from next number after your last ID (10010)
  });

  module.exports = mongoose.model('LotteryResult', lotteryResultSchema);
}