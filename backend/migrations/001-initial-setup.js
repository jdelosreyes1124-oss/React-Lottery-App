module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create users table
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      email: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      role: {
        type: Sequelize.ENUM('user', 'admin'),
        defaultValue: 'user'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      last_login: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create lottery_results table
    await queryInterface.createTable('lottery_results', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      game_type: {
        type: Sequelize.ENUM('539', 'mark6', 'lotto649'),
        allowNull: false
      },
      draw_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      numbers: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: false
      },
      bonus: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      draw_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      source: {
        type: Sequelize.STRING,
        defaultValue: 'manual',
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add unique constraint
    await queryInterface.addIndex('lottery_results', {
      fields: ['game_type', 'draw_date'],
      unique: true,
      name: 'lottery_results_game_date_unique'
    });

    // Add indexes
    await queryInterface.addIndex('lottery_results', ['game_type']);
    await queryInterface.addIndex('lottery_results', ['draw_date']);

    // Create predictions table
    await queryInterface.createTable('predictions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      game_type: {
        type: Sequelize.ENUM('539', 'mark6', 'lotto649'),
        allowNull: false
      },
      prediction_type: {
        type: Sequelize.STRING,
        defaultValue: 'standard'
      },
      predicted_numbers: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: false
      },
      bonus_prediction: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      confidence_score: {
        type: Sequelize.DECIMAL(3, 2),
        defaultValue: 0.50
      },
      algorithms_used: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: ['AI', 'Statistical']
      },
      analysis_period: {
        type: Sequelize.STRING,
        defaultValue: '1month'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      is_winner: {
        type: Sequelize.BOOLEAN,
        allowNull: true
      },
      matched_numbers: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create scheduler_jobs table
    await queryInterface.createTable('scheduler_jobs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      game_type: {
        type: Sequelize.ENUM('539', 'mark6', 'lotto649'),
        allowNull: false,
        unique: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      schedule: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '0 */6 * * *'
      },
      last_run: {
        type: Sequelize.DATE,
        allowNull: true
      },
      next_run: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_status: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      results_scraped: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_runs: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      successful_runs: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      failed_runs: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create admin_logs table
    await queryInterface.createTable('admin_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false
      },
      details: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('admin_logs');
    await queryInterface.dropTable('scheduler_jobs');
    await queryInterface.dropTable('predictions');
    await queryInterface.dropTable('lottery_results');
    await queryInterface.dropTable('users');
  }
};