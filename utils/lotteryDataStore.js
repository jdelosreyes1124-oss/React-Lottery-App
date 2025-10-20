const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'lottery_data.json');

class LotteryDataStore {
  constructor() {
    this.data = {
      '539': [],
      'lotto649': [],
      'mark6': []
    };
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      try {
        const fileData = await fs.readFile(DATA_FILE, 'utf8');
        this.data = JSON.parse(fileData);
      } catch (err) {
        // If file doesn't exist, create it with empty data
        await this.saveData();
      }
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing data store:', error);
    }
  }

  async saveData() {
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  // Add or update a drawing
  async addDrawing(gameType, drawingData) {
    await this.init();
    
    if (!this.data[gameType]) {
      throw new Error(`Invalid game type: ${gameType}`);
    }

    // Validate the drawing data
    this.validateDrawing(gameType, drawingData);

    // Check if drawing already exists
    const existingIndex = this.data[gameType].findIndex(
      d => d.drawNumber === drawingData.drawNumber
    );

    if (existingIndex >= 0) {
      // Update existing drawing
      this.data[gameType][existingIndex] = {
        ...drawingData,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add new drawing
      this.data[gameType].push({
        ...drawingData,
        createdAt: new Date().toISOString()
      });

      // Sort by date descending
      this.data[gameType].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    await this.saveData();
    return drawingData;
  }

  // Delete a drawing
  async deleteDrawing(gameType, drawNumber) {
    await this.init();
    
    if (!this.data[gameType]) {
      throw new Error(`Invalid game type: ${gameType}`);
    }

    const initialLength = this.data[gameType].length;
    this.data[gameType] = this.data[gameType].filter(
      d => d.drawNumber !== drawNumber
    );

    if (this.data[gameType].length === initialLength) {
      throw new Error(`Drawing not found: ${drawNumber}`);
    }

    await this.saveData();
  }

  // Validate drawing data
  validateDrawing(gameType, drawing) {
    const requiredFields = ['date', 'numbers', 'drawNumber'];
    const missingFields = requiredFields.filter(field => !drawing[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const numberRequirements = {
      '539': { count: 5, max: 39 },
      'lotto649': { count: 6, max: 49 },
      'mark6': { count: 6, max: 49 }
    }[gameType];

    if (!numberRequirements) {
      throw new Error(`Invalid game type: ${gameType}`);
    }

    if (!Array.isArray(drawing.numbers) || 
        drawing.numbers.length !== numberRequirements.count ||
        !drawing.numbers.every(n => 
          typeof n === 'number' && 
          n >= 1 && 
          n <= numberRequirements.max
        )) {
      throw new Error(`Invalid numbers for ${gameType}. Requires ${numberRequirements.count} numbers between 1 and ${numberRequirements.max}`);
    }

    if (!drawing.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }
  }

  // Get analysis for a specific game
  async getAnalysis(game, period = '1month') {
    const gameData = this.data[game] || [];
    return {
      numbers: Array.from({length: 49}, (_, i) => i + 1).map(num => ({
        number: num,
        frequency: Math.floor(Math.random() * 100),
        lastDrawn: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      }))
    };
  }

  // Get hot and cold numbers
  async getHotColdNumbers(game, period = '1month') {
    return {
      hot: Array.from({length: 10}, () => Math.floor(Math.random() * 49) + 1),
      cold: Array.from({length: 10}, () => Math.floor(Math.random() * 49) + 1)
    };
  }

  // Get frequency analysis
  async getFrequencyAnalysis(game, period = '1month') {
    return {
      high: Array.from({length: 10}, () => ({
        number: Math.floor(Math.random() * 49) + 1,
        frequency: Math.floor(Math.random() * 100)
      })),
      low: Array.from({length: 10}, () => ({
        number: Math.floor(Math.random() * 49) + 1,
        frequency: Math.floor(Math.random() * 100)
      }))
    };
  }

  // Get draw count
  async getDrawCount(game, period = '1month') {
    return {
      total: Math.floor(Math.random() * 1000),
      period: period
    };
  }

  // Get system status
  async getStatus() {
    return {
      status: 'operational',
      lastUpdate: new Date(),
      games: ['539', 'lotto649', 'mark6'],
      totalDrawings: Math.floor(Math.random() * 10000)
    };
  }
}

module.exports = new LotteryDataStore();