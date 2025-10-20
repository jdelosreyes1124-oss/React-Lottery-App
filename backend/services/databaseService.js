const db = require('../models_mongoose');

class DatabaseService {
  // User operations
  async createUser(userData) {
    const lastUser = await db.User.findOne().sort({ _id: -1 });
    const newId = lastUser ? lastUser._id + 1 : 1;
    
    const user = new db.User({
      _id: newId,
      username: userData.username,
      email: userData.email,
      password: userData.password,
      role: userData.role || 'user'
    });
    return await user.save();
  }

  async findUserByUsername(username) {
    return await db.User.findOne({ username });
  }

  async findUserById(id) {
    return await db.User.findById(id);
  }

  async updateUserLogin(userId) {
    return await db.User.findByIdAndUpdate(
      userId,
      { lastLogin: new Date() },
      { new: true }
    );
  }

  async getAllUsers(options = {}) {
    const query = db.User.find();
    if (options.limit) query.limit(options.limit);
    if (options.offset) query.skip(options.offset);
    
    const rows = await query.sort({ createdAt: -1 });
    const count = await db.User.countDocuments();
    
    return { rows, count };
  }

  // Lottery Results operations - FIXED VERSION
  async addLotteryResult(resultData) {
    const gameType = resultData.gameType || resultData.game_type;
    const drawDate = resultData.drawDate || resultData.draw_date;
    const numbers = resultData.numbers;
    const bonus = resultData.bonus;
    const source = resultData.source || 'manual';
    
    // Check if result already exists
    const existing = await db.LotteryResult.findOne({
      gameType,
      drawDate
    });

    if (existing) {
      // Update existing
      existing.numbers = numbers;
      existing.bonus = bonus;
      existing.source = source;
      existing.updatedAt = new Date();
      return await existing.save();
    }

    // Create new with generated ID - FIXED TO HANDLE MIXED ID TYPES
    let newId = 1;
    
    try {
      // First, try to find the highest numeric ID
      const lastNumericResult = await db.LotteryResult.findOne({
        _id: { $type: "number" }  // Only look for numeric IDs
      }).sort({ _id: -1 });
      
      if (lastNumericResult && typeof lastNumericResult._id === 'number' && !isNaN(lastNumericResult._id)) {
        newId = lastNumericResult._id + 1;
      } else {
        // If no numeric IDs found, use aggregation to find max
        const maxIdResult = await db.LotteryResult.aggregate([
          { $match: { _id: { $type: "number" } } },
          { $group: { _id: null, maxId: { $max: "$_id" } } }
        ]);
        
        if (maxIdResult.length > 0 && maxIdResult[0].maxId) {
          newId = maxIdResult[0].maxId + 1;
        } else {
          // No numeric IDs exist, start from a safe high number
          const totalCount = await db.LotteryResult.countDocuments();
          // Start from 10000 or total count + 1000, whichever is higher
          newId = Math.max(10000, totalCount + 1000);
        }
      }
    } catch (error) {
      console.error('Error generating ID:', error.message);
      // Fallback: use timestamp-based ID to ensure uniqueness
      newId = parseInt(Date.now().toString().slice(-9));
    }
    
    // Final validation - ensure we have a valid numeric ID
    if (isNaN(newId) || !newId || newId < 1) {
      console.error('Invalid ID generated, using timestamp');
      newId = parseInt(Date.now().toString().slice(-9));
    }
    
    const result = new db.LotteryResult({
      _id: newId,
      gameType,
      drawDate,
      numbers,
      bonus,
      source
    });
    
    try {
      return await result.save();
    } catch (saveError) {
      // If save fails due to duplicate ID (race condition), retry with timestamp
      if (saveError.code === 11000) {
        console.log('Duplicate ID detected, retrying with timestamp-based ID');
        result._id = parseInt(Date.now().toString().slice(-9));
        return await result.save();
      }
      throw saveError;
    }
  }

  async getLotteryResults(gameType, options = {}) {
    const {
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;

    const where = { gameType };

    if (startDate || endDate) {
      where.drawDate = {};
      if (startDate) where.drawDate.$gte = startDate;
      if (endDate) where.drawDate.$lte = endDate;
    }

    const query = db.LotteryResult.find(where);
    
    if (limit) query.limit(limit);
    if (offset) query.skip(offset);
    
    const rows = await query.sort({ drawDate: -1 });
    const count = await db.LotteryResult.countDocuments(where);
    
    return { rows, count };
  }

  async getRecentResults(gameType, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await db.LotteryResult.find({
      gameType: gameType,
      drawDate: { $gte: startDate }
    }).sort({ drawDate: -1 });
  }

  async deleteLotteryResult(id) {
    const result = await db.LotteryResult.findByIdAndDelete(id);
    return !!result;
  }

  async bulkAddLotteryResults(results, duplicateStrategy = 'skip') {
    const operations = [];
    
    for (const result of results) {
      try {
        const gameType = result.gameType || result.game_type;
        const drawDate = result.drawDate || result.draw_date;
        
        const existing = await db.LotteryResult.findOne({
          gameType,
          drawDate
        });

        if (existing) {
          if (duplicateStrategy === 'update') {
            existing.numbers = result.numbers;
            existing.bonus = result.bonus;
            existing.source = result.source || existing.source;
            existing.updatedAt = new Date();
            await existing.save();
            operations.push({ ...result, action: 'updated' });
          } else {
            operations.push({ ...result, action: 'skipped' });
          }
        } else {
          // Use the same fixed ID generation logic
          let newId = 1;
          
          try {
            const lastNumericResult = await db.LotteryResult.findOne({
              _id: { $type: "number" }
            }).sort({ _id: -1 });
            
            if (lastNumericResult && typeof lastNumericResult._id === 'number') {
              newId = lastNumericResult._id + 1;
            } else {
              const totalCount = await db.LotteryResult.countDocuments();
              newId = Math.max(10000, totalCount + 1000);
            }
          } catch (error) {
            newId = parseInt(Date.now().toString().slice(-9));
          }
          
          const newResult = new db.LotteryResult({
            _id: newId,
            gameType,
            drawDate,
            numbers: result.numbers,
            bonus: result.bonus,
            source: result.source || 'manual'
          });
          await newResult.save();
          operations.push({ ...result, action: 'created' });
        }
      } catch (error) {
        operations.push({ ...result, action: 'error', error: error.message });
      }
    }

    return operations;
  }

  // Bulk upsert for efficient syncing
  async bulkUpsertLotteryResults(results) {
    try {
      const bulkOps = results.map(result => ({
        updateOne: {
          filter: {
            gameType: result.gameType || result.game_type,
            drawDate: result.drawDate || result.draw_date
          },
          update: {
            $set: {
              gameType: result.gameType || result.game_type,
              drawDate: result.drawDate || result.draw_date,
              numbers: result.numbers,
              bonus: result.bonus || null,
              source: result.source || 'sync',
              updatedAt: new Date()
            },
            $setOnInsert: {
              createdAt: new Date()
            }
          },
          upsert: true
        }
      }));

      if (bulkOps.length === 0) {
        return { inserted: 0, modified: 0, total: 0 };
      }

      const result = await db.LotteryResult.bulkWrite(bulkOps, { ordered: false });
      
      return {
        inserted: result.upsertedCount || 0,
        modified: result.modifiedCount || 0,
        total: result.upsertedCount + result.modifiedCount
      };
    } catch (error) {
      console.error('Bulk upsert error:', error);
      throw error;
    }
  }

  // Fetch latest results
  async fetchLatestResults(gameType, limit = 100) {
    try {
      const results = await db.LotteryResult
        .find({ gameType })
        .sort({ drawDate: -1 })
        .limit(limit)
        .lean();
        
      return results;
    } catch (error) {
      console.error('Error fetching latest results:', error);
      throw error;
    }
  }

  // Find missing dates
  async findMissingDates(gameType, fromDate, toDate) {
    try {
      const results = await db.LotteryResult
        .find({
          gameType,
          drawDate: {
            $gte: fromDate,
            $lte: toDate
          }
        })
        .select('drawDate')
        .lean();
      
      const existingDates = new Set(results.map(r => r.drawDate));
      const missingDates = [];
      
      const current = new Date(fromDate);
      const end = new Date(toDate);
      
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (!existingDates.has(dateStr)) {
          missingDates.push(dateStr);
        }
        current.setDate(current.getDate() + 1);
      }
      
      return missingDates;
    } catch (error) {
      console.error('Error finding missing dates:', error);
      throw error;
    }
  }

  // Get database statistics
  async getDatabaseStats() {
    try {
      const [total539, totalMark6, totalLotto649, oldestResult, newestResult] = await Promise.all([
        db.LotteryResult.countDocuments({ gameType: '539' }),
        db.LotteryResult.countDocuments({ gameType: 'mark6' }),
        db.LotteryResult.countDocuments({ gameType: 'lotto649' }),
        db.LotteryResult.findOne().sort({ drawDate: 1 }).select('drawDate'),
        db.LotteryResult.findOne().sort({ drawDate: -1 }).select('drawDate')
      ]);
      
      return {
        '539': total539,
        'mark6': totalMark6,
        'lotto649': totalLotto649,
        total: total539 + totalMark6 + totalLotto649,
        dateRange: {
          oldest: oldestResult?.drawDate || null,
          newest: newestResult?.drawDate || null
        }
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      throw error;
    }
  }

  // Number frequency analysis
  async getNumberFrequency(gameType, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db.LotteryResult.find({
      gameType,
      drawDate: { $gte: startDate }
    });

    const frequencyMap = {};
    const bonusFrequencyMap = {};
    const maxNumber = gameType === '539' ? 39 : 49;
    
    for (let i = 1; i <= maxNumber; i++) {
      frequencyMap[i] = 0;
      if (gameType !== '539') bonusFrequencyMap[i] = 0;
    }
    
    results.forEach(result => {
      if (result.numbers) {
        result.numbers.forEach(num => {
          if (frequencyMap[num] !== undefined) {
            frequencyMap[num]++;
          }
        });
      }
      if (result.bonus && bonusFrequencyMap[result.bonus] !== undefined) {
        bonusFrequencyMap[result.bonus]++;
      }
    });
    
    const mainNumbers = Object.entries(frequencyMap)
      .map(([number, frequency]) => ({
        number: parseInt(number),
        frequency,
        percentage: results.length > 0 ? ((frequency / results.length) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.frequency - a.frequency);
    
    const bonusNumbers = gameType !== '539' ? 
      Object.entries(bonusFrequencyMap)
        .map(([number, frequency]) => ({
          number: parseInt(number),
          frequency,
          percentage: results.length > 0 ? ((frequency / results.length) * 100).toFixed(1) : '0'
        }))
        .filter(item => item.frequency > 0)
        .sort((a, b) => b.frequency - a.frequency) : [];
    
    return {
      mainNumbers,
      bonusNumbers,
      totalDraws: results.length,
      period: `${days} days`,
      startDate,
      endDate: new Date()
    };
  }

  async getHotColdNumbers(gameType, days = 30) {
    const frequency = await this.getNumberFrequency(gameType, days);
    
    return {
      hot: frequency.mainNumbers.slice(0, 10),
      cold: frequency.mainNumbers.slice(-10).reverse(),
      totalDraws: frequency.totalDraws
    };
  }

  // Predictions
  async savePrediction(predictionData) {
    const lastPrediction = await db.Prediction.findOne().sort({ _id: -1 });
    const newId = lastPrediction ? lastPrediction._id + 1 : 1;
    
    const prediction = new db.Prediction({
      _id: newId,
      userId: predictionData.user_id || predictionData.userId,
      gameType: predictionData.game_type || predictionData.gameType,
      predictionType: predictionData.prediction_type || predictionData.predictionType || 'standard',
      predictedNumbers: predictionData.predicted_numbers || predictionData.predictedNumbers,
      bonusPrediction: predictionData.bonus_prediction || predictionData.bonusPrediction,
      confidenceScore: predictionData.confidence_score || predictionData.confidenceScore || 0.5,
      algorithmsUsed: predictionData.algorithms_used || predictionData.algorithmsUsed || ['AI'],
      analysisPeriod: predictionData.analysis_period || predictionData.analysisPeriod || '1month',
      metadata: predictionData.metadata || {}
    });
    return await prediction.save();
  }

  async getUserPredictions(userId, options = {}) {
    const query = db.Prediction.find({ userId });
    
    if (options.gameType) {
      query.where('gameType').equals(options.gameType);
    }
    if (options.limit) {
      query.limit(options.limit);
    }
    
    return await query.sort({ createdAt: -1 });
  }

  // Admin logs
  async logAdminAction(userId, action, details, req = null) {
    const lastLog = await db.AdminLog.findOne().sort({ _id: -1 });
    const newId = lastLog ? lastLog._id + 1 : 1;
    
    const logData = {
      _id: newId,
      userId,
      action,
      details
    };

    if (req) {
      logData.ipAddress = req.ip || req.connection?.remoteAddress;
      logData.userAgent = req.headers ? req.headers['user-agent'] : null;
    }

    const log = new db.AdminLog(logData);
    return await log.save();
  }

  async getAdminLogs(options = {}) {
    const { limit = 100, offset = 0, action } = options;
    
    const query = db.AdminLog.find();
    
    if (action) {
      query.where('action').equals(action);
    }
    if (limit) query.limit(limit);
    if (offset) query.skip(offset);
    
    const rows = await query.sort({ createdAt: -1 });
    
    for (let log of rows) {
      if (log.userId) {
        const user = await db.User.findById(log.userId).select('username');
        log.User = user;
      }
    }
    
    const count = await db.AdminLog.countDocuments(action ? { action } : {});
    
    return { rows, count };
  }

  // Scheduler jobs
  async getSchedulerJob(gameType) {
    return await db.SchedulerJob.findOne({ gameType });
  }

  async getAllSchedulerJobs() {
    return await db.SchedulerJob.find();
  }

  async updateSchedulerJob(gameType, updateData) {
    let job = await db.SchedulerJob.findOne({ gameType });
    
    if (!job) {
      const lastJob = await db.SchedulerJob.findOne().sort({ _id: -1 });
      const newId = lastJob ? lastJob._id + 1 : 1;
      
      job = new db.SchedulerJob({
        _id: newId,
        gameType,
        ...updateData
      });
      return await job.save();
    }
    
    Object.assign(job, updateData);
    return await job.save();
  }

  async recordSchedulerRun(gameType, success, resultsCount = 0, error = null) {
    try {
      let job = await this.getSchedulerJob(gameType);
      
      if (!job) {
        const lastJob = await db.SchedulerJob.findOne().sort({ _id: -1 });
        const newId = lastJob ? lastJob._id + 1 : 1;
        
        job = new db.SchedulerJob({
          _id: newId,
          gameType: gameType,
          lastRun: new Date(),
          lastStatus: success ? 'success' : 'failed',
          lastError: error,
          resultsScraped: resultsCount,
          totalRuns: 1,
          successfulRuns: success ? 1 : 0,
          failedRuns: success ? 0 : 1
        });
        return await job.save();
      }

      job.lastRun = new Date();
      job.lastStatus = success ? 'success' : 'failed';
      job.lastError = error;
      job.totalRuns = (job.totalRuns || 0) + 1;
      
      if (success) {
        job.successfulRuns = (job.successfulRuns || 0) + 1;
        if (resultsCount) {
          job.resultsScraped = (job.resultsScraped || 0) + resultsCount;
        }
      } else {
        job.failedRuns = (job.failedRuns || 0) + 1;
      }

      return await job.save();
    } catch (error) {
      console.error(`Error recording scheduler run for ${gameType}:`, error);
      throw error;
    }
  }

  // Statistics
  async getStatistics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [
      totalUsers,
      activeUsers,
      totalPredictions,
      totalResults,
      recentPredictions,
      activeSessions
    ] = await Promise.all([
      db.User.countDocuments(),
      db.User.countDocuments({ isActive: true }),
      db.Prediction.countDocuments(),
      db.LotteryResult.countDocuments(),
      db.Prediction.countDocuments({
        createdAt: { $gte: today }
      }),
      db.User.countDocuments({
        lastLogin: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      })
    ]);

    return {
      totalUsers,
      activeUsers,
      totalPredictions,
      totalResults,
      predictionsToday: recentPredictions,
      activeSessions
    };
  }

  async getGameStatistics(gameType) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const totalDraws = await db.LotteryResult.countDocuments({ gameType });
    const monthlyDraws = await db.LotteryResult.countDocuments({
      gameType,
      drawDate: { $gte: thirtyDaysAgo }
    });
    
    const latestResult = await db.LotteryResult.findOne({ gameType })
      .sort({ drawDate: -1 });
    
    const totalPredictions = await db.Prediction.countDocuments({ gameType });
    
    return {
      totalDraws,
      monthlyDraws,
      latestDraw: latestResult?.drawDate,
      totalPredictions
    };
  }
}

module.exports = new DatabaseService();