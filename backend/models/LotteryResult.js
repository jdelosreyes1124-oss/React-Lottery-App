module.exports = (sequelize, DataTypes) => {
  const LotteryResult = sequelize.define('LotteryResult', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    game_type: {
      type: DataTypes.ENUM('539', 'mark6', 'lotto649'),
      allowNull: false,
      validate: {
        isIn: [['539', 'mark6', 'lotto649']]
      }
    },
    draw_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    numbers: {
      type: DataTypes.JSON,
      allowNull: false,
      get() {
        const value = this.getDataValue('numbers');
        // Ensure it's always returned as an array
        if (typeof value === 'string') {
          return JSON.parse(value);
        }
        return Array.isArray(value) ? value : [];
      },
      set(value) {
        // Ensure it's stored as an array
        this.setDataValue('numbers', Array.isArray(value) ? value : []);
      },
      validate: {
        isValidNumbers(value) {
          // Ensure value is an array
          if (!Array.isArray(value)) {
            throw new Error('Numbers must be an array');
          }
          
          const config = {
            '539': { count: 5, max: 39 },
            'mark6': { count: 6, max: 49 },
            'lotto649': { count: 6, max: 49 }
          };
          
          const gameConfig = config[this.game_type];
          if (value.length !== gameConfig.count) {
            throw new Error(`Must have exactly ${gameConfig.count} numbers`);
          }
          
          if (value.some(n => n < 1 || n > gameConfig.max)) {
            throw new Error(`Numbers must be between 1 and ${gameConfig.max}`);
          }
          
          if (new Set(value).size !== value.length) {
            throw new Error('Numbers must be unique');
          }
        }
      }
    },
    bonus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        isValidBonus(value) {
          if (this.game_type === '539' && value !== null) {
            throw new Error('539 does not have bonus number');
          }
          
          if (this.game_type !== '539' && value) {
            const max = 49;
            if (value < 1 || value > max) {
              throw new Error(`Bonus must be between 1 and ${max}`);
            }
            if (this.numbers && this.numbers.includes(value)) {
              throw new Error('Bonus cannot be in main numbers');
            }
          }
        }
      }
    },
    draw_number: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    source: {
      type: DataTypes.STRING,
      defaultValue: 'manual',
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: null,
      get() {
        const value = this.getDataValue('metadata');
        if (typeof value === 'string') {
          return JSON.parse(value);
        }
        return value || {};
      }
    }
  }, {
    tableName: 'lottery_results',
    indexes: [
      {
        unique: true,
        fields: ['game_type', 'draw_date']
      },
      {
        fields: ['game_type']
      },
      {
        fields: ['draw_date']
      }
    ]
  });

  return LotteryResult;
};