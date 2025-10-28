/**
 * Web Scraper Service for Taiwan Daily Cash 539 (History Page)
 * Updated for Render.com deployment
 * services/scraper.js
 */

const puppeteer = require('puppeteer');

class LotteryScraperService {
  constructor() {
    this.baseUrl = 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/page/PAGE_NUM/per-page/50/summary-view';
    this.latestUrl = 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/summary-view';
    this.timeout = 60000;
    this.headless = true;
    this.maxPages = 102;
  }

  async scrapeLatestResults() {
    console.log('🔍 Starting scraper for latest results...');
    let browser = null;
    
    try {
      browser = await this.launchBrowser();
      const page = await this.createPage(browser);
      
      // Navigate to latest results page
      await page.goto(this.latestUrl, { waitUntil: 'networkidle0', timeout: this.timeout });
      console.log('📄 Loaded latest results page');

      // Wait for results table
      await page.waitForSelector('table.history-table', { timeout: this.timeout });

      // Extract first row data
      const latestResult = await page.evaluate(() => {
        const rows = document.querySelectorAll('table.history-table tbody tr');
        if (rows.length === 0) return null;

        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('td');
        
        return {
          drawDate: cells[0].innerText.trim(),
          numbers: Array.from(cells[1].querySelectorAll('.number')).map(n => parseInt(n.innerText.trim())).filter(n => !isNaN(n))
        };
      });

      if (!latestResult) {
        throw new Error('No results found on the page');
      }

      console.log('✅ Scraped latest result:', latestResult);
      return [latestResult];
    } catch (error) {
      console.error('❌ Scraping error:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        console.log('🔒 Browser closed');
      }
    }
  }

  async scrapeResults(maxResults = 50) {
    console.log('🔍 Starting scraper from History page...');
    console.log(`📊 Target: ${maxResults} results (max ${this.maxPages} pages)`);
    
    let browser = null;
    
    try {
      browser = await this.launchBrowser();
      const page = await this.createPage(browser);
      
      const results = await this.collectFromHistoryPages(page, maxResults);
      
      console.log(`✅ Scraped ${results.length} results`);
      return results;
      
    } catch (error) {
      console.error('❌ Failed:', error.message);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  async launchBrowser() {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions'
    ];
    
    // For production (Render), use system Chrome
    const options = {
      headless: this.headless,
      args: args
    };
    
    if (process.env.NODE_ENV === 'production' || process.env.PUPPETEER_EXECUTABLE_PATH) {
      options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    }
    
    return await puppeteer.launch(options);
  }

  async createPage(browser) {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    page.setDefaultTimeout(this.timeout);
    return page;
  }

  async collectFromHistoryPages(page, maxResults) {
    const allResults = [];
    const avgResultsPerPage = 35;
    const estimatedPages = Math.ceil(maxResults / avgResultsPerPage);
    const totalPages = Math.min(estimatedPages, this.maxPages);
    
    console.log(`📋 Will scrape up to ${totalPages} pages`);
    
    let lastPageNum = 0;
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      lastPageNum = pageNum;
      console.log(`\n📄 Page ${pageNum}/${totalPages} (Total: ${allResults.length}/${maxResults})`);
      
      if (allResults.length >= maxResults) {
        console.log('✅ Target reached!');
        break;
      }
      
      const url = this.baseUrl.replace('PAGE_NUM', pageNum);
      
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const pageResults = await this.extractFromHistoryPage(page);
        console.log(`   Extracted: ${pageResults.length} results`);
        
        if (pageNum === 1 && pageResults.length > 0) {
          console.log(`   🎯 Latest result: ${pageResults[0].date} - [${pageResults[0].numbers.join(', ')}]`);
        }
        
        if (pageResults.length === 0) {
          console.log('⚠️ No results, stopping');
          break;
        }
        
        let added = 0;
        for (const result of pageResults) {
          if (allResults.length >= maxResults) break;
          
          if (!allResults.some(r => r.date === result.date)) {
            allResults.push(result);
            added++;
          }
        }
        
        console.log(`   Added: ${added} new`);
        
        if (added === 0 && pageNum > 1) {
          console.log('⚠️ All duplicates, stopping');
          break;
        }
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        continue;
      }
    }
    
    console.log(`\n📊 Final: Scraped ${allResults.length} results from ${lastPageNum} pages`);
    return allResults;
  }

  async extractFromHistoryPage(page) {
    return await page.evaluate(() => {
      const results = [];
      
      // Find the main history table
      const tables = document.querySelectorAll('table');
      
      for (const table of tables) {
        // Find header row to identify column indices
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (!headerRow) continue;
        
        const headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.textContent.trim().toLowerCase());
        
        // Find the column indices we need
        const dateColIndex = headers.findIndex(h => h.includes('date'));
        const winningColIndex = headers.findIndex(h => h.includes('winning') || h.includes('no.'));
        
        // Skip if we can't find the required columns
        if (dateColIndex === -1 || winningColIndex === -1) continue;
        
        console.log(`Found columns - Date: ${dateColIndex}, Winning: ${winningColIndex}`);
        
        // Process data rows
        const rows = table.querySelectorAll('tbody tr, tr');
        
        for (const row of rows) {
          // Skip header rows
          if (row.querySelector('th')) continue;
          
          const cells = Array.from(row.querySelectorAll('td, th'));
          if (cells.length < Math.max(dateColIndex, winningColIndex) + 1) continue;
          
          // Extract date from the date column
          let date = null;
          const dateCell = cells[dateColIndex];
          if (dateCell) {
            const dateText = dateCell.textContent.trim();
            
            // Format: YYYY-MM-DD or YYYY/MM/DD
            let match = dateText.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
            if (match) {
              date = `${match[1]}-${match[2]}-${match[3]}`;
            }
            
            // Format: DD Mon YYYY (e.g., 07 Oct 2025)
            if (!date) {
              match = dateText.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
              if (match) {
                const months = {
                  'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                  'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                  'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                };
                const month = months[match[2]];
                if (month) {
                  const day = match[1].padStart(2, '0');
                  date = `${match[3]}-${month}-${day}`;
                }
              }
            }
          }
          
          // Extract numbers from the winning numbers columns
          let numbers = [];
          const winningCell = cells[winningColIndex];
          if (winningCell) {
            const winningText = winningCell.textContent.trim();
            
            // Parse comma-separated numbers (e.g., "1,16,20,28,34")
            const numMatches = winningText.match(/\d+/g);
            if (numMatches) {
              numbers = numMatches
                .map(n => parseInt(n))
                .filter(n => n >= 1 && n <= 39)
                .slice(0, 5); // Take only first 5 numbers
            }
            
            // Alternative: Try to extract from ball images if text parsing fails
            if (numbers.length === 0) {
              const ballImages = winningCell.querySelectorAll('img');
              for (const img of ballImages) {
                const alt = img.getAttribute('alt') || img.getAttribute('title') || '';
                const num = parseInt(alt);
                if (num >= 1 && num <= 39 && !numbers.includes(num) && numbers.length < 5) {
                  numbers.push(num);
                }
              }
            }
          }
          
          // Valid result must have date and exactly 5
          if (date && numbers.length === 5) {
            results.push({
              date,
              numbers: numbers.sort((a, b) => a - b),
              source: 'lottolyzer-history',
              scrapedAt: new Date().toISOString()
            });
          }
        }
      }
      
      return results;
    });
  }

  validateResults(results) {
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
      
      if (!result.numbers || result.numbers.length !== 5) {
        report.invalid++;
        report.errors.push(`Result ${index}: Invalid number count`);
        return;
      }
      
      if (!result.numbers.every(n => n >= 1 && n <= 39)) {
        report.invalid++;
        report.errors.push(`Result ${index}: Numbers out of range`);
        return;
      }
      
      if (new Set(result.numbers).size !== 5) {
        report.invalid++;
        report.errors.push(`Result ${index}: Duplicate numbers`);
        return;
      }
      
      report.valid++;
    });
    
    return report;
  }

  async debugScrape(maxResults = 50) {
    this.headless = false;
    return this.scrapeResults(maxResults);
  }

  async debugPage1() {
    console.log('🔍 DEBUG MODE - Inspecting Page 1...');
    
    let browser = null;
    
    try {
      browser = await this.launchBrowser();
      const page = await this.createPage(browser);
      
      const url = this.baseUrl.replace('PAGE_NUM', 1);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await page.screenshot({ path: 'debug-page1-full.png', fullPage: true });
      console.log('📸 Screenshot: debug-page1-full.png');
      
      const html = await page.content();
      const fs = require('fs');
      fs.writeFileSync('debug-page1.html', html);
      console.log('💾 HTML saved: debug-page1.html');
      
      const results = await this.extractFromHistoryPage(page);
      console.log(`\n✅ Found ${results.length} results`);
      console.log('\nFirst 3 results:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i+1}. ${r.date}: [${r.numbers.join(', ')}]`);
      });
      
      return results;
      
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }
}

// Create and export the scraper
module.exports = {
    async scrapeLatestResults() {
        console.log('🔍 Starting scraper for latest results...');
        let browser = null;
        
        try {
            browser = await this.launchBrowser();
            const page = await this.createPage(browser);
            
            // Navigate to latest results page
            await page.goto(this.latestUrl, { waitUntil: 'networkidle0', timeout: this.timeout });
            console.log('📄 Loaded latest results page');

            // Wait for results table
            await page.waitForSelector('table.history-table', { timeout: this.timeout });

            // Extract first row data
            const latestResult = await page.evaluate(() => {
                const rows = document.querySelectorAll('table.history-table tbody tr');
                if (rows.length === 0) return null;

                const firstRow = rows[0];
                const cells = firstRow.querySelectorAll('td');
                
                return {
                    drawDate: cells[0].innerText.trim(),
                    numbers: Array.from(cells[1].querySelectorAll('.number')).map(n => parseInt(n.innerText.trim())).filter(n => !isNaN(n))
                };
            });

            if (!latestResult) {
                throw new Error('No results found on the page');
            }

            console.log('✅ Scraped latest result:', latestResult);
            return [latestResult];
        } catch (error) {
            console.error('❌ Scraping error:', error);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
                console.log('🔒 Browser closed');
            }
        }
    },

    async scrapeResults(maxResults) {
        return new LotteryScraperService().scrapeResults(maxResults);
    },

    // Browser methods
    async launchBrowser() {
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--disable-extensions'
        ];
        
        // For production (Render), use system Chrome
        const options = {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'google-chrome-stable',
            args
        };
        
        return await puppeteer.launch(options);
    },

    async createPage(browser) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        return page;
    },

    // Configuration
    baseUrl: 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/page/PAGE_NUM/per-page/50/summary-view',
    latestUrl: 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/summary-view',
    timeout: 60000,
    maxPages: 102
};
module.exports = {
  scrapeResults: (maxResults) => scraperInstance.scrapeResults(maxResults),
  validateResults: (results) => scraperInstance.validateResults(results),
  debugScrape: (maxResults) => scraperInstance.debugScrape(maxResults),
  debugPage1: () => scraperInstance.debugPage1()
};

// CLI functionality
if (require.main === module) {
  const args = process.argv.slice(2);
  const isDebug = args.includes('--debug');
  const isDebugPage = args.includes('--debug-page');
  const maxArg = args.find(arg => arg.startsWith('--max='));
  const maxResults = maxArg ? parseInt(maxArg.split('=')[1]) : 3500;
  
  if (isDebugPage) {
    scraperInstance.debugPage1()
      .then(() => console.log('\n✅ Debug complete'))
      .catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
      });
  } else if (isDebug) {
    scraperInstance.debugScrape(maxResults)
      .then(() => console.log('✅ Debug complete'))
      .catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
      });
  } else {
    scraperInstance.scrapeResults(maxResults)
      .then(results => {
        console.log('\n📊 RESULTS:');
        console.log(`Total: ${results.length}`);
        console.log('First 3:', JSON.stringify(results.slice(0, 3), null, 2));
        console.log('Last 3:', JSON.stringify(results.slice(-3), null, 2));
        
        const validation = scraperInstance.validateResults(results);
        console.log('\n✅ VALIDATION:');
        console.log(validation);
      })
      .catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
      });
  }
}