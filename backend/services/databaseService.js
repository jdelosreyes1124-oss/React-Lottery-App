const db = require('../models');
const { Op } = require('sequelize');

class DatabaseService {
  // User operations
  async createUser(userData) {
    return await db.User.create(userData);
  }

  async findUserByUsername(username) {
    return await db.User.findOne({ where: { username } });
  }

  async findUserById(id) {
    return await db.User.findByPk(id);
  }

  async updateUserLogin(userId) {
    return await db.User.update(
      { last_login: new Date() },
      { where: { id: userId } }
    );
  }

  // Lottery Results operations
  async addLotteryResult(resultData) {
    const { game_type, draw_date, numbers, bonus, source = 'manual' } = resultData;
    
    // Check if result already exists
    const existing = await db.LotteryResult.findOne({
      where: { game_type, draw_date }
    });

    if (existing) {
      // Update existing
      return await existing.update({ numbers, bonus, source });
    }

    // Create new
    return await db.LotteryResult.create({
      game_type,
      draw_date,
      numbers,
      bonus,
      source
    });
  }

  async getLotteryResults(gameType, options = {}) {
    const {
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      order = [['draw_date', 'DESC']]
    } = options;

    const where = { game_type: gameType };

    if (startDate || endDate) {
      where.draw_date = {};
      if (startDate) where.draw_date[Op.gte] = startDate;
      if (endDate) where.draw_date[Op.lte] = endDate;
    }

    return await db.LotteryResult.findAndCountAll({
      where,
      limit,
      offset,
      order
    });
  }

  async getRecentResults(gameType, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await db.LotteryResult.findAll({
      where: {
        game_type: gameType,
        draw_date: {
          [Op.gte]: startDate
        }
      },
      order: [['draw_date', 'DESC']]
    });
  }

  async deleteLotteryResult(id) {
    return await db.LotteryResult.destroy({
      where: { id }
    });
  }

  async bulkAddLotteryResults(results) {
    const operations = results.map(async (result) => {
      const existing = await db.LotteryResult.findOne({
        where: {
          game_type: result.game_type,
          draw_date: result.draw_date
        }
      });

      if (existing) {
        return await existing.update(result);
      }
      return await db.LotteryResult.create(result);
    });

    return await Promise.all(operations);
  }

  // Number frequency analysis
  async getNumberFrequency(gameType, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db.LotteryResult.findAll({
      where: {
        game_type: gameType,
        draw_date: {
          [Op.gte]: startDate
        }
      }
    });

    const frequencyMap = {};
    results.forEach(result => {
      result.numbers.forEach(num => {
        frequencyMap[num] = (frequencyMap[num] || 0) + 1;
      });
    });

    return Object.entries(frequencyMap)
      .map(([number, frequency]) => ({
        number: parseInt(number),
        frequency,
        percentage: ((frequency / results.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  // Predictions
  async savePrediction(predictionData) {
    return await db.Prediction.create(predictionData);
  }

  async getUserPredictions(userId, limit = 10) {
    return await db.Prediction.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit
    });
  }

  // Admin logs
  async logAdminAction(userId, action, details, req = null) {
    const logData = {
      user_id: userId,
      action,
      details
    };

    if (req) {
      logData.ip_address = req.ip || req.connection.remoteAddress;
      logData.user_agent = req.headers['user-agent'];
    }

    return await db.AdminLog.create(logData);
  }

  async getAdminLogs(options = {}) {
    const { limit = 100, offset = 0 } = options;

    return await db.AdminLog.findAndCountAll({
      include: [{
        model: db.User,
        attributes: ['username']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
  }

  // Scheduler jobs
  async getSchedulerJob(gameType) {
    return await db.SchedulerJob.findOne({
      where: { game_type: gameType }
    });
  }

  async updateSchedulerJob(gameType, updateData) {
    const [job, created] = await db.SchedulerJob.findOrCreate({
      where: { game_type: gameType },
      defaults: updateData
    });

    if (!created) {
      await job.update(updateData);
    }

    return job;
  }

  // Record scheduler run
  async recordSchedulerRun(gameType, success, resultsCount = 0, error = null) {
    try {
      const job = await this.getSchedulerJob(gameType);
      
      if (!job) {
        // Create the job if it doesn't exist
        return await this.updateSchedulerJob(gameType, {
          game_type: gameType,
          last_run: new Date(),
          last_status: success ? 'success' : 'failed',
          last_error: error,
          results_scraped: resultsCount,
          total_runs: 1,
          successful_runs: success ? 1 : 0,
          failed_runs: success ? 0 : 1
        });
      }

      // Update existing job
      const updateData = {
        last_run: new Date(),
        last_status: success ? 'success' : 'failed',
        last_error: error,
        total_runs: (job.total_runs || 0) + 1,
        successful_runs: success ? (job.successful_runs || 0) + 1 : job.successful_runs,
        failed_runs: success ? job.failed_runs : (job.failed_runs || 0) + 1
      };

      if (success && resultsCount) {
        updateData.results_scraped = (job.results_scraped || 0) + resultsCount;
      }

      return await job.update(updateData);
    } catch (error) {
      console.error(`Error recording scheduler run for ${gameType}:`, error);
      throw error;
    }
  }

  // Statistics
  async getStatistics() {
    const [
      totalUsers,
      totalPredictions,
      totalResults,
      recentPredictions
    ] = await Promise.all([
      db.User.count(),
      db.Prediction.count(),
      db.LotteryResult.count(),
      db.Prediction.count({
        where: {
          created_at: {
            [Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    return {
      totalUsers,
      totalPredictions,
      totalResults,
      predictionsToday: recentPredictions
    };
  }
}

module.exports = new DatabaseService();