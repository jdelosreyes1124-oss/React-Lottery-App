module.exports = (sequelize, DataTypes) => {
  const SchedulerJob = sequelize.define('SchedulerJob', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    game_type: {
      type: DataTypes.ENUM('539', 'mark6', 'lotto649'),
      allowNull: false,
      unique: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    schedule: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '0 */6 * * *'
    },
    last_run: {
      type: DataTypes.DATE,
      allowNull: true
    },
    next_run: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    last_error: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    results_scraped: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_runs: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    successful_runs: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    failed_runs: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'scheduler_jobs'
  });

  return SchedulerJob;
};