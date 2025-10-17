/**
 * Web Scraper Service for Taiwan Daily Cash 539
 * 
 * INSTALLATION:
 * npm install axios cheerio
 */

const axios = require('axios');
const cheerio = require('cheerio');

class LotteryScraperService {
  constructor() {
    this.baseUrl = 'https://en.lottolyzer.com/home/taiwan/daily-cash-539/number-view';
    this.timeout = 10000;
    this.retryAttempts = 3;
  }

  async scrapeResults(maxResults = 50) {
    console.log('🔍 Starting scraper for Taiwan Daily Cash 539...');
    
    try {
      const html = await this.fetchPage();
      const results = this.parseResults(html, maxResults);
      
      console.log(`✅ Scraped ${results.length} results successfully`);
      return results;
    } catch (error) {
      console.error('❌ Scraping failed:', error.message);
      throw new Error(`Failed to scrape lottery data: ${error.message}`);
    }
  }

  async fetchPage() {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(`📡 Attempt ${attempt}/${this.retryAttempts}: Fetching page...`);
        
        const response = await axios.get(this.baseUrl, {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        
        if (response.status === 200 && response.data) {
          console.log('✅ Page fetched successfully');
          return response.data;
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.retryAttempts) {
          const delay = attempt * 1000;
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  parseResults(html, maxResults) {
    const $ = cheerio.load(html);
    const results = [];
    
    const selectors = [
      'table.lottery-results tbody tr',
      'table.results-table tbody tr',
      '.result-row',
      'table tbody tr',
      '.lottery-result'
    ];
    
    let $rows = null;
    for (const selector of selectors) {
      $rows = $(selector);
      if ($rows.length > 0) {
        console.log(`✅ Found ${$rows.length} rows using selector: ${selector}`);
        break;
      }
    }
    
    if (!$rows || $rows.length === 0) {
      console.warn('⚠️ No results found with standard selectors. Attempting fallback...');
      return this.parseFallback($, maxResults);
    }
    
    $rows.each((index, element) => {
      if (results.length >= maxResults) return false;
      
      try {
        const $row = $(element);
        const result = this.parseRow($, $row); // FIXED: Pass $ to parseRow 
        
        if (result && result.numbers && result.numbers.length === 5) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to parse row ${index}: ${error.message}`);
      }
    });
    
    return results;
  }

  parseRow($, $row) { // FIXED: Accept $ as parameter 
    let date = null;
    const dateSelectors = ['td:first-child', '.date', 'td.date', '[class*="date"]'];
    
    for (const selector of dateSelectors) {
      const dateText = $row.find(selector).text().trim();
      if (dateText && this.isValidDate(dateText)) {
        date = this.parseDate(dateText);
        break;
      }
    }
    
    if (!date) {
      $row.find('td').each((i, cell) => {
        const text = $(cell).text().trim();
        if (this.isValidDate(text)) {
          date = this.parseDate(text);
          return false;
        }
      });
    }
    
    const numbers = [];
    const numberSelectors = [
      '.ball',
      '.number',
      '[class*="ball"]',
      '[class*="number"]',
      'td'
    ];
    
    for (const selector of numberSelectors) {
      $row.find(selector).each((i, element) => {
        const text = $(element).text().trim();
        const num = parseInt(text);
        
        if (!isNaN(num) && num >= 1 && num <= 39 && !numbers.includes(num)) {
          numbers.push(num);
        }
      });
      
      if (numbers.length === 5) break;
    }
    
    if (numbers.length !== 5) {
      return null;
    }
    
    return {
      date: date || new Date().toISOString().split('T')[0],
      numbers: numbers.sort((a, b) => a - b),
      source: 'lottolyzer',
      scrapedAt: new Date().toISOString()
    };
  }

  parseFallback($, maxResults) {
    console.log('🔄 Using fallback parsing method...');
    
    const results = [];
    const allNumbers = [];
    
    $('*').each((i, element) => {
      const text = $(element).text().trim();
      const num = parseInt(text);
      
      if (!isNaN(num) && num >= 1 && num <= 39) {
        allNumbers.push(num);
      }
    });
    
    for (let i = 0; i < allNumbers.length - 4 && results.length < maxResults; i += 5) {
      const numbers = allNumbers.slice(i, i + 5);
      
      if (numbers.length === 5) {
        const uniqueNumbers = [...new Set(numbers)];
        
        if (uniqueNumbers.length === 5) {
          results.push({
            date: new Date().toISOString().split('T')[0],
            numbers: uniqueNumbers.sort((a, b) => a - b),
            source: 'lottolyzer-fallback',
            scrapedAt: new Date().toISOString()
          });
        }
      }
    }
    
    console.log(`✅ Fallback found ${results.length} potential results`);
    return results;
  }

  isValidDate(text) {
    const datePatterns = [
      /\d{4}[-\/]\d{2}[-\/]\d{2}/,
      /\d{2}[-\/]\d{2}[-\/]\d{4}/,
      /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i
    ];
    
    return datePatterns.some(pattern => pattern.test(text));
  }

  parseDate(dateText) {
    try {
      const date = new Date(dateText);
      
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn('Failed to parse date:', dateText);
    }
    
    return new Date().toISOString().split('T')[0];
  }

  validateResults(results) {
    const report = {
      total: results.length,
      valid: 0,
      invalid: 0,
      errors: []
    };
    
    results.forEach((result, index) => {
      if (!result.numbers || result.numbers.length !== 5) {
        report.invalid++;
        report.errors.push(`Result ${index}: Invalid number count`);
        return;
      }
      
      const allValid = result.numbers.every(n => n >= 1 && n <= 39);
      const allUnique = new Set(result.numbers).size === 5;
      
      if (!allValid) {
        report.invalid++;
        report.errors.push(`Result ${index}: Numbers out of range`);
      } else if (!allUnique) {
        report.invalid++;
        report.errors.push(`Result ${index}: Duplicate numbers`);
      } else {
        report.valid++;
      }
    });
    
    return report;
  }
}

module.exports = new LotteryScraperService();