const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./User');
const LotteryResult = require('./LotteryResult');
const Prediction = require('./Prediction');
const SchedulerJob = require('./SchedulerJob');
const AdminLog = require('./AdminLog');

const connectDB = async () => {
  try {
    // Build connection string
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri.endsWith('/')) mongoUri += '/';
    mongoUri += process.env.MONGODB_DB;
    
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Atlas connected');
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = {
  User,
  LotteryResult,
  Prediction,
  SchedulerJob,
  AdminLog,
  connectDB,
  mongoose
};