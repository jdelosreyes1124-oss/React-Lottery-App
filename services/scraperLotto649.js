// LOTTO649 Scraper - Fixed Version
// Scrapes Taiwan Lotto 649 results from en.lottolyzer.com

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Scrapes Taiwan Lotto 649 results
 * @param {number} maxResults - Maximum number of results to fetch (default: 3000)
 * @returns {Promise<Array>} Array of lottery results with date, numbers, and bonus
 */
async function scrapeResults(maxResults = 3000) {
  const results = [];
  const resultsPerPage = 50;
  const maxPages = Math.ceil(maxResults / resultsPerPage);
  
  console.log(`Starting Taiwan Lotto 649 scrape for ${maxResults} results...`);
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://en.lottolyzer.com/history/taiwan/lotto-649/page/${page}/per-page/50/summary-view`;
      console.log(`Fetching Lotto 649 page ${page}...`);
      
      // Fetch the page
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });
      
      // Load HTML into Cheerio
      const $ = cheerio.load(response.data);
      
      // Find the table
      const table = $('table').first();
      
      // Get header row to identify columns
      const headerCells = table.find('thead tr th, thead tr td');
      let dateColIndex = -1;
      let winningNoColIndex = -1;
      let suppNoColIndex = -1;
      
      // Find column indices by header text
      headerCells.each((index, element) => {
        const headerText = $(element).text().trim().toLowerCase();
        if (headerText.includes('date')) {
          dateColIndex = index;
        } else if (headerText.includes('winning no')) {
          winningNoColIndex = index;
        } else if (headerText.includes('supp no')) {
          suppNoColIndex = index;
        }
      });
      
      // Fallback to default indices if headers not found
      if (dateColIndex === -1) dateColIndex = 1;
      if (winningNoColIndex === -1) winningNoColIndex = 2;
      if (suppNoColIndex === -1) suppNoColIndex = 3;
      
      console.log(`Column indices - Date: ${dateColIndex}, Winning: ${winningNoColIndex}, Supp: ${suppNoColIndex}`);
      
      // Find table rows
      let rows = table.find('tbody tr');
      
      if (rows.length === 0) {
        rows = table.find('tr').not(':first');
      }
      
      console.log(`Found ${rows.length} rows on page ${page}`);
      
      // Process each row 
      rows.each((index, element) => {
        const cells = $(element).find('td');
        
        if (cells.length >= 4) {
          try {
            // Extract data using identified column indices
            const dateText = $(cells[dateColIndex]).text().trim();
            const winningNumbersText = $(cells[winningNoColIndex]).text().trim();
            const suppNumberText = $(cells[suppNoColIndex]).text().trim();
            
            // Debug log for first few rows
            if (results.length < 3) {
              console.log(`\nRow ${index + 1}:`);
              console.log(`  Date: "${dateText}"`);
              console.log(`  Winning: "${winningNumbersText}"`);
              console.log(`  Supp: "${suppNumberText}"`);
            }
            
            // Parse winning numbers - should be exactly 6 numbers
            const winningNumbers = winningNumbersText
              .split(',')
              .map(num => parseInt(num.trim()))
              .filter(num => !isNaN(num) && num >= 1 && num <= 49);
            
            // Parse supplementary number
            const suppNumber = parseInt(suppNumberText.trim());
            
            // Validate: must have exactly 6 winning numbers
            if (dateText && winningNumbers.length === 6) {
              const result = {
                date: dateText,
                numbers: winningNumbers,
                bonus: (!isNaN(suppNumber) && suppNumber >= 1 && suppNumber <= 49) ? suppNumber : null,
                gameType: 'lotto649'
              };
              
              // Final validation
              if (results.length < 3) {
                console.log(`  Parsed: ${result.numbers.join(', ')} + Bonus: ${result.bonus}`);
              }
              
              results.push(result);
            } else {
              if (results.length < 3) {
                console.log(`  ❌ Skipped: Invalid data (${winningNumbers.length} numbers found)`);
              }
            }
          } catch (err) {
            console.error(`Error parsing row ${index}:`, err.message);
          }
        }
      });
      
      console.log(`Lotto 649 Page ${page}: Found ${results.length} total results\n`);
      
      // Stop if we've collected enough results
      if (results.length >= maxResults) {
        break;
      }
      
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
    }
  }
  
  console.log(`\n✅ Lotto 649 scrape complete: ${results.length} results found`);
  return results;
}

/**
 * Validates lottery results data
 * @param {Array} results - Array of lottery result objects
 * @returns {Object} Validation statistics
 */
function validateResults(results) {
  if (!Array.isArray(results)) {
    return {
      total: 0,
      valid: 0,
      invalid: 0,
      validationRate: '0%',
      errors: []
    };
  }

  let valid = 0;
  let invalid = 0;
  const errors = [];

  results.forEach((result, index) => {
    const validation = validateSingleResult(result);
    if (validation.valid) {
      valid++;
    } else {
      invalid++;
      if (errors.length < 10) { // Keep first 10 errors for debugging
        errors.push({
          index,
          date: result?.date,
          error: validation.error
        });
      }
    }
  });

  const total = results.length;
  const validationRate = total > 0 ? `${Math.round((valid / total) * 100)}%` : '0%';

  return {
    total,
    valid,
    invalid,
    validationRate,
    errors
  };
}

/**
 * Validates a single lottery result
 * @param {Object} result - Single lottery result object
 * @returns {Object} Validation result with error message
 */
function validateSingleResult(result) {
  if (!result) {
    return { valid: false, error: 'Result is null or undefined' };
  }
  
  if (!result.date) {
    return { valid: false, error: 'Missing date' };
  }
  
  if (!result.numbers || !Array.isArray(result.numbers)) {
    return { valid: false, error: 'Missing or invalid numbers array' };
  }
  
  // Check we have exactly 6 numbers 
  if (result.numbers.length !== 6) {
    return { valid: false, error: `Expected 6 numbers, got ${result.numbers.length}` };
  }
  
  // Check all numbers are valid (1-49)
  for (let i = 0; i < result.numbers.length; i++) {
    const num = result.numbers[i];
    if (!Number.isInteger(num) || num < 1 || num > 49) {
      return { valid: false, error: `Invalid number at position ${i}: ${num}` };
    }
  }
  
  // Check for duplicates in main numbers
  const uniqueNumbers = new Set(result.numbers);
  if (uniqueNumbers.size !== 6) {
    return { valid: false, error: 'Duplicate numbers found' };
  }
  
  // Check bonus number if present
  if (result.bonus !== null && result.bonus !== undefined) {
    if (!Number.isInteger(result.bonus) || result.bonus < 1 || result.bonus > 49) {
      return { valid: false, error: `Invalid bonus number: ${result.bonus}` };
    }
  }
  
  return { valid: true };
}

// Export functions 
module.exports = {
  scrapeResults,
  validateResults
};