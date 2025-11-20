/**
 * Web Scraper Service for Hong Kong Mark Six
 * AXIOS VERSION - No Puppeteer/Browser required!
 * Compatible with Render.com and all hosting platforms
 * services/scraperMark6.js
 */

const axios = require('axios');
const cheerio = require('cheerio');

class Mark6ScraperService {
  constructor() {
    this.baseUrl = 'https://en.lottolyzer.com/history/hong-kong/mark-six/page/PAGE_NUM/per-page/50/summary-view';
    this.timeout = 30000;
    this.maxPages = 102;
  }

  /**
   * Main scraping method - scrapes Mark 6 results
   * @param {number} maxResults - Maximum number of results to fetch
   * @returns {Promise<Array>} Array of lottery results
   */
  async scrapeResults(maxResults = 50) {
    console.log('🔍 Starting Mark 6 scraper (Axios version)...');
    console.log(`📊 Target: ${maxResults} results`);
    
    const results = [];
    const resultsPerPage = 50;
    const estimatedPages = Math.ceil(maxResults / resultsPerPage);
    const totalPages = Math.min(estimatedPages, this.maxPages);
    
    console.log(`📋 Will scrape up to ${totalPages} pages`);
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`📄 Page ${pageNum}/${totalPages} (Total: ${results.length}/${maxResults})`);
      
      if (results.length >= maxResults) {
        console.log('✅ Target reached!');
        break;
      }
      
      const url = this.baseUrl.replace('PAGE_NUM', pageNum);
      
      try {
        // Fetch the page
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: this.timeout
        });
        
        // Parse with Cheerio
        const $ = cheerio.load(response.data);
        
        // Extract results from this page
        const pageResults = this.extractFromPage($);
        console.log(`   Extracted: ${pageResults.length} results`);
        
        if (pageResults.length === 0) {
          console.log('   No results found, stopping...');
          break;
        }
        
        // Add new results (avoid duplicates)
        let added = 0;
        for (const result of pageResults) {
          if (results.length >= maxResults) break;
          
          // Check for duplicate dates
          if (!results.some(r => r.date === result.date)) {
            results.push(result);
            added++;
          }
        }
        
        console.log(`   Added: ${added} new results`);
        
        // If we didn't add any new results and we're past page 1, stop
        if (added === 0 && pageNum > 1) {
          console.log('   No new results, stopping...');
          break;
        }
        
        // Add delay between requests to be polite
        if (pageNum < totalPages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        console.error(`   ❌ Error fetching page ${pageNum}:`, error.message);
        // Continue to next page instead of failing completely
        continue;
      }
    }
    
    console.log(`\n✅ Mark 6 scrape complete: ${results.length} results found`);
    return results;
  }

  /**
   * Extract results from a Cheerio-loaded page
   * @param {CheerioStatic} $ - Cheerio instance
   * @returns {Array} Extracted results
   */
  extractFromPage($) {
    const results = [];
    
    // Find all tables on the page
    const tables = $('table');
    
    tables.each((tableIndex, table) => {
      const $table = $(table);
      
      // Get header row to identify columns
      const headerCells = $table.find('thead tr th, thead tr td');
      let dateColIndex = -1;
      let winningNoColIndex = -1;
      let extraNoColIndex = -1;
      
      // Find column indices by header text
      headerCells.each((index, element) => {
        const headerText = $(element).text().trim().toLowerCase();
        if (headerText.includes('date')) {
          dateColIndex = index;
        } else if (headerText.includes('winning no')) {
          winningNoColIndex = index;
        } else if (headerText.includes('extra no') || headerText.includes('bonus')) {
          extraNoColIndex = index;
        }
      });
      
      // Fallback to default indices if headers not found
      if (dateColIndex === -1) dateColIndex = 1;
      if (winningNoColIndex === -1) winningNoColIndex = 2;
      if (extraNoColIndex === -1) extraNoColIndex = 3;
      
      // Find table rows
      let rows = $table.find('tbody tr');
      if (rows.length === 0) {
        rows = $table.find('tr').not(':first');
      }
      
      // Process each row
      rows.each((rowIndex, row) => {
        const cells = $(row).find('td');
        
        // Need at least 4 cells
        if (cells.length < 4) return;
        
        // Skip header rows
        const firstCellText = $(cells[0]).text().trim().toLowerCase();
        if (firstCellText === 'draw' || firstCellText === 'date') return;
        
        try {
          // Extract date
          const dateText = $(cells[dateColIndex]).text().trim();
          let date = null;
          
          // Try YYYY-MM-DD format first
          let match = dateText.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
          if (match) {
            date = `${match[1]}-${match[2]}-${match[3]}`;
          } else {
            // Try DD Mon YYYY format
            match = dateText.match(/(\d{2})\s+(\w{3})\s+(\d{4})/);
            if (match) {
              const months = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
              };
              const month = months[match[2]];
              if (month) {
                date = `${match[3]}-${month}-${match[1]}`;
              }
            }
          }
          
          if (!date) return; // Skip if we couldn't parse the date
          
          // Extract winning numbers
          const numbersText = $(cells[winningNoColIndex]).text().trim();
          const numbers = numbersText
            .split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n) && n >= 1 && n <= 49);
          
          // Must have exactly 6 numbers
          if (numbers.length !== 6) return;
          
          // Extract bonus/extra number
          const bonusText = $(cells[extraNoColIndex]).text().trim();
          const bonus = parseInt(bonusText);
          
          // Create result object
          const result = {
            date,
            numbers: numbers.sort((a, b) => a - b),
            gameType: 'mark6'
          };
          
          // Add bonus if valid and not in main numbers
          if (!isNaN(bonus) && bonus >= 1 && bonus <= 49 && !numbers.includes(bonus)) {
            result.bonus = bonus;
          }
          
          results.push(result);
          
        } catch (err) {
          // Skip invalid rows
          console.error(`   Error parsing row: ${err.message}`);
        }
      });
    });
    
    return results;
  }

  /**
   * Validates lottery results data
   * @param {Array} results - Array of lottery result objects
   * @returns {Object} Validation statistics
   */
  validateResults(results) {
    if (!Array.isArray(results)) {
      return {
        total: 0,
        valid: 0,
        invalid: 0,
        validationRate: '0%',
        errors: [],
        duplicates: 0
      };
    }

    const report = { 
      total: results.length, 
      valid: 0, 
      invalid: 0, 
      errors: [], 
      duplicates: 0 
    };
    
    const seenDates = new Set();
    
    results.forEach((result, index) => {
      if (seenDates.has(result.date)) {
        report.duplicates++;
      }
      seenDates.add(result.date);
      
      const validation = this.validateSingleResult(result);
      if (validation.valid) {
        report.valid++;
      } else {
        report.invalid++;
        if (report.errors.length < 10) {
          report.errors.push({
            index,
            date: result?.date,
            error: validation.error
          });
        }
      }
    });
    
    report.validationRate = report.total > 0 ? `${Math.round((report.valid / report.total) * 100)}%` : '0%';
    
    return report;
  }

  /**
   * Validates a single lottery result
   * @param {Object} result - Single lottery result object
   * @returns {Object} Validation result with error message
   */
  validateSingleResult(result) {
    if (!result) {
      return { valid: false, error: 'Result is null or undefined' };
    }
    
    if (!result.date) {
      return { valid: false, error: 'Missing date' };
    }
    
    if (!result.numbers || !Array.isArray(result.numbers)) {
      return { valid: false, error: 'Missing or invalid numbers array' };
    }
    
    if (result.numbers.length !== 6) {
      return { valid: false, error: `Expected 6 numbers, got ${result.numbers.length}` };
    }
    
    for (let i = 0; i < result.numbers.length; i++) {
      const num = result.numbers[i];
      if (!Number.isInteger(num) || num < 1 || num > 49) {
        return { valid: false, error: `Invalid number at position ${i}: ${num}` };
      }
    }
    
    const uniqueNumbers = new Set(result.numbers);
    if (uniqueNumbers.size !== 6) {
      return { valid: false, error: 'Duplicate numbers found' };
    }
    
    if (result.bonus !== null && result.bonus !== undefined) {
      if (!Number.isInteger(result.bonus) || result.bonus < 1 || result.bonus > 49) {
        return { valid: false, error: `Invalid bonus number: ${result.bonus}` };
      }
      if (result.numbers.includes(result.bonus)) {
        return { valid: false, error: 'Bonus number duplicates main number' };
      }
    }
    
    return { valid: true };
  }

  /**
   * Debug method - same as scrapeResults but with more logging
   */
  async debugScrape(maxResults = 50) {
    return this.scrapeResults(maxResults);
  }
}

// Export singleton instance
module.exports = new Mark6ScraperService();