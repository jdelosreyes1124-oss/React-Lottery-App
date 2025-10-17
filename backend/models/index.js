const { Sequelize } = require('sequelize');
const config = require('../config/database');
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    define: dbConfig.define
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.User = require('./User')(sequelize, Sequelize);
db.LotteryResult = require('./LotteryResult')(sequelize, Sequelize);
db.Prediction = require('./Prediction')(sequelize, Sequelize);
db.SchedulerJob = require('./SchedulerJob')(sequelize, Sequelize);
db.AdminLog = require('./AdminLog')(sequelize, Sequelize);

// Define associations
db.Prediction.belongsTo(db.User, { foreignKey: 'user_id' });
db.User.hasMany(db.Prediction, { foreignKey: 'user_id' });

db.AdminLog.belongsTo(db.User, { foreignKey: 'user_id' });
db.User.hasMany(db.AdminLog, { foreignKey: 'user_id' });

module.exports = db;