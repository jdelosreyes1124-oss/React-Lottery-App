module.exports = (sequelize, DataTypes) => {
  const Prediction = sequelize.define('Prediction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    game_type: {
      type: DataTypes.ENUM('539', 'mark6', 'lotto649'),
      allowNull: false
    },
    prediction_type: {
      type: DataTypes.STRING,
      defaultValue: 'standard'
    },
    predicted_numbers: {
      type: DataTypes.JSON, // Changed from ARRAY to JSON
      allowNull: false
    },
    bonus_prediction: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.50,
      validate: {
        min: 0,
        max: 1
      }
    },
    algorithms_used: {
      type: DataTypes.JSON, // Changed from ARRAY to JSON
      defaultValue: null, // Changed from array to null
      get() {
        const value = this.getDataValue('algorithms_used');
        return value || ['AI', 'Statistical']; // Return default if null
      }
    },
    analysis_period: {
      type: DataTypes.STRING,
      defaultValue: '1month'
    },
    metadata: {
      type: DataTypes.JSON, // Changed from JSONB to JSON
      defaultValue: null // Changed from {} to null
    },
    is_winner: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    matched_numbers: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'predictions'
  });

  return Prediction;
};