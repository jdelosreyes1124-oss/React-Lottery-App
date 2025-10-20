const mongoose = require('mongoose');
require('dotenv').config();

// Connection function
const connectDB = async () => {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Already connected to MongoDB Atlas');
      return;
    }

    // Check if connecting
    if (mongoose.connection.readyState === 2) {
      console.log('⏳ MongoDB connection already in progress...');
      return;
    }

    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: 'majority'
    };
    
    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('✅ MongoDB Atlas connected with optimized settings');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Only retry if not connected or connecting
    if (mongoose.connection.readyState === 0) {
      setTimeout(connectDB, 5000);
    }
  }
};

// Set up connection event handlers once
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
  // Only reconnect if not already trying
  if (mongoose.connection.readyState === 0) {
    connectDB();
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// User Schema
const UserSchema = new mongoose.Schema({
  _id: Number,
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user', 'guest'], default: 'user' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Lottery Result Schema
const LotteryResultSchema = new mongoose.Schema({
  _id: Number,
  gameType: { type: String, required: true, enum: ['539', 'mark6', 'lotto649'] },
  drawDate: { type: String, required: true },
  numbers: [Number],
  bonus: Number,
  source: { type: String, default: 'manual' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Add compound index for gameType and drawDate
LotteryResultSchema.index({ gameType: 1, drawDate: -1 }, { unique: true });

// Prediction Schema
const PredictionSchema = new mongoose.Schema({
  _id: Number,
  userId: { type: Number, ref: 'User' },
  gameType: { type: String, required: true, enum: ['539', 'mark6', 'lotto649'] },
  predictionType: { type: String, enum: ['standard', 'extended'], default: 'standard' },
  predictedNumbers: [Number],
  bonusPrediction: Number,
  confidenceScore: { type: Number, min: 0, max: 1 },
  algorithmsUsed: [String],
  analysisPeriod: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

// Admin Log Schema
const AdminLogSchema = new mongoose.Schema({
  _id: Number,
  userId: { type: Number, ref: 'User' },
  action: String,
  details: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
});

// Scheduler Job Schema
const SchedulerJobSchema = new mongoose.Schema({
  _id: Number,
  gameType: { type: String, required: true, unique: true, enum: ['539', 'mark6', 'lotto649'] },
  isActive: { type: Boolean, default: false },
  schedule: String,
  lastRun: Date,
  nextRun: Date,
  lastStatus: String,
  lastError: String,
  totalRuns: { type: Number, default: 0 },
  successfulRuns: { type: Number, default: 0 },
  failedRuns: { type: Number, default: 0 },
  resultsScraped: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', UserSchema);
const LotteryResult = mongoose.model('LotteryResult', LotteryResultSchema);
const Prediction = mongoose.model('Prediction', PredictionSchema);
const AdminLog = mongoose.model('AdminLog', AdminLogSchema);
const SchedulerJob = mongoose.model('SchedulerJob', SchedulerJobSchema);

// Export everything
module.exports = {
  connectDB,
  User,
  LotteryResult,
  Prediction,
  AdminLog,
  SchedulerJob,
  mongoose
};