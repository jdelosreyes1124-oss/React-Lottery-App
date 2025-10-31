/**
 * Web Scraper Service for Hong Kong Mark Six
 * Updated for Render.com deployment with @sparticuz/chromium
 * services/scraperMark6.js
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

class Mark6ScraperService {
  constructor() {
    this.baseUrl = 'https://en.lottolyzer.com/history/hong-kong/mark-six/page/PAGE_NUM/per-page/50/summary-view';
    this.timeout = 60000;
    this.headless = true;
    this.maxPages = 102;
  }

  async scrapeResults(maxResults = 50) {
    console.log('🔍 Starting Mark 6 scraper...');
    console.log(`📊 Target: ${maxResults} results`);
    
    let browser = null;
    
    try {
      browser = await this.launchBrowser();
      const page = await this.createPage(browser);
      const results = await this.collectFromHistoryPages(page, maxResults);
      
      console.log(`✅ Scraped ${results.length} Mark 6 results`);
      return results;
      
    } catch (error) {
      console.error('❌ Failed:', error.message);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  async launchBrowser() {
    try {
      console.log('🚀 Launching browser for Mark 6...');
      
      // Check if running in production (Render) or local development
      const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
      
      let options;
      
      if (isProduction) {
        console.log('📦 Using @sparticuz/chromium for production...');
        
        options = {
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          ignoreHTTPSErrors: true,
        };
      } else {
        console.log('💻 Using local Puppeteer for development...');
        
        // Try to use local Puppeteer installation
        const puppeteerLocal = require('puppeteer');
        const browser = await puppeteerLocal.launch({
          headless: this.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions'
          ],
          ignoreHTTPSErrors: true,
        });
        
        const version = await browser.version();
        console.log('✅ Browser launched successfully:', version);
        return browser;
      }

      const browser = await puppeteer.launch(options);
      const version = await browser.version();
      console.log('✅ Browser launched successfully:', version);
      return browser;
    } catch (error) {
      console.error('❌ Failed to launch browser:', error);
      throw error;
    }
  }

  async createPage(browser) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    page.setDefaultTimeout(this.timeout);
    return page;
  }

  async collectFromHistoryPages(page, maxResults) {
    const allResults = [];
    const avgResultsPerPage = 35;
    const estimatedPages = Math.ceil(maxResults / avgResultsPerPage);
    const totalPages = Math.min(estimatedPages, this.maxPages);
    
    console.log(`📋 Will scrape up to ${totalPages} pages`);
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`📄 Page ${pageNum}/${totalPages} (Total: ${allResults.length}/${maxResults})`);
      
      if (allResults.length >= maxResults) {
        console.log('✅ Target reached!');
        break;
      }
      
      const url = this.baseUrl.replace('PAGE_NUM', pageNum);
      
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const pageResults = await this.extractFromHistoryPage(page);
        console.log(`   Extracted: ${pageResults.length} results`);
        
        if (pageResults.length === 0) break;
        
        let added = 0;
        for (const result of pageResults) {
          if (allResults.length >= maxResults) break;
          if (!allResults.some(r => r.date === result.date)) {
            allResults.push(result);
            added++;
          }
        }
        
        console.log(`   Added: ${added} new`);
        if (added === 0 && pageNum > 1) break;
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        continue;
      }
    }
    
    return allResults;
  }

  async extractFromHistoryPage(page) {
    return await page.evaluate(() => {
      const results = [];
      const tables = document.querySelectorAll('table');
      
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th'));
          
          // Need at least 4 cells: draw, date, numbers, bonus 
          if (cells.length < 4) continue;
          
          // Skip header rows
          const firstCellText = cells[0]?.textContent.trim().toLowerCase() || '';
          if (firstCellText === 'draw' || firstCellText === 'date') continue;
          
          let date = null;
          let numbers = [];
          let bonus = null;
          
          // Cell 2 typically contains the date (index 1)
          const dateCell = cells[1]?.textContent.trim() || '';
          
          // Try YYYY-MM-DD format first
          let match = dateCell.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
          if (match) {
            date = `${match[1]}-${match[2]}-${match[3]}`;
          } else {
            // Try DD Mon YYYY format
            match = dateCell.match(/(\d{2})\s+(\w{3})\s+(\d{4})/);
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
          
          // Cell 3 typically contains the winning numbers (index 2) 
          const numbersCell = cells[2]?.textContent.trim() || '';
          
          // Numbers are comma-separated: "13,21,33,41,44,46"
          if (numbersCell) {
            const numberStrings = numbersCell.split(',');
            numbers = numberStrings
              .map(n => parseInt(n.trim()))
              .filter(n => !isNaN(n) && n >= 1 && n <= 49);
          }
          
          // Cell 4 typically contains the bonus/extra number (index 3)
          const bonusCell = cells[3]?.textContent.trim() || '';
          if (bonusCell) {
            const bonusNum = parseInt(bonusCell);
            if (!isNaN(bonusNum) && bonusNum >= 1 && bonusNum <= 49) {
              bonus = bonusNum;
            }
          }
          
          // Only add if we have valid date and exactly 6 numbers
          if (date && numbers.length === 6) {
            const result = {
              date,
              numbers: numbers.sort((a, b) => a - b),
              source: 'lottolyzer-mark6-history',
              scrapedAt: new Date().toISOString()
            };
            
            // Add bonus if valid and not already in main numbers
            if (bonus && !numbers.includes(bonus)) {
              result.bonus = bonus;
            }
            
            results.push(result);
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
      
      if (!result.numbers || result.numbers.length !== 6) {
        report.invalid++;
        report.errors.push(`Result ${index}: Invalid number count`);
        return;
      }
      
      if (!result.numbers.every(n => n >= 1 && n <= 49)) {
        report.invalid++;
        report.errors.push(`Result ${index}: Numbers out of range`);
        return;
      }
      
      if (new Set(result.numbers).size !== 6) {
        report.invalid++;
        report.errors.push(`Result ${index}: Duplicate numbers`);
        return;
      }
      
      if (result.bonus !== undefined && result.bonus !== null) {
        if (result.bonus < 1 || result.bonus > 49 || result.numbers.includes(result.bonus)) {
          report.invalid++;
          report.errors.push(`Result ${index}: Invalid bonus`);
          return;
        }
      }
      
      report.valid++;
    });
    
    return report;
  }

  async debugScrape(maxResults = 50) {
    this.headless = false;
    return this.scrapeResults(maxResults);
  }
}

module.exports = new Mark6ScraperService();