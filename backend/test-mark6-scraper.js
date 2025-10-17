/**
 * Debug script to test Mark 6 scraper
 * Run: node test-mark6-scraper.js
 */

const puppeteer = require('puppeteer');

async function testMark6Scraper() {
  console.log('🔍 Testing Mark 6 Scraper - Debug Mode\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Test URL - just first page
  const url = 'https://en.lottolyzer.com/history/hong-kong/mark-six/page/1/per-page/50/summary-view';
  
  console.log(`📄 Loading: ${url}\n`);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
  
  // Extract and log debug info
  const debugInfo = await page.evaluate(() => {
    const debug = [];
    const tables = document.querySelectorAll('table');
    
    debug.push(`Found ${tables.length} tables on page`);
    
    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');
      debug.push(`\nTable ${tableIndex + 1}: ${rows.length} rows`);
      
      // Look at first 3 rows only for debugging
      Array.from(rows).slice(0, 3).forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        debug.push(`  Row ${rowIndex + 1}: ${cells.length} cells`);
        
        cells.forEach((cell, cellIndex) => {
          const text = cell.textContent.trim().substring(0, 100);
          const images = cell.querySelectorAll('img');
          
          if (images.length > 0) {
            debug.push(`    Cell ${cellIndex + 1}: "${text}" (${images.length} images)`);
            
            // Log image details
            Array.from(images).forEach((img, imgIndex) => {
              const alt = img.alt || 'no-alt';
              const src = img.src || 'no-src';
              const title = img.title || 'no-title';
              debug.push(`      Image ${imgIndex + 1}: alt="${alt}", title="${title}", src="${src.substring(src.lastIndexOf('/') + 1)}"`);
            });
          } else if (text) {
            debug.push(`    Cell ${cellIndex + 1}: "${text}"`);
          }
        });
      });
    });
    
    return debug;
  });
  
  console.log('=== DEBUG INFO ===');
  debugInfo.forEach(line => console.log(line));
  console.log('==================\n');
  
  // Now try actual extraction
  console.log('🎯 Attempting to extract first result...\n');
  
  const firstResult = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length < 3) continue;
        
        // Try to find date
        let date = null;
        const firstCell = cells[0]?.textContent.trim() || '';
        
        const match = firstCell.match(/(\d{2})\s+(\w{3})\s+(\d{4})/);
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
        
        // Try to find ball numbers
        let numbers = [];
        let bonus = null;
        
        for (const cell of cells) {
          const images = cell.querySelectorAll('img');
          if (images.length >= 6) {
            const extracted = [];
            
            for (const img of images) {
              const alt = img.alt || '';
              const num = parseInt(alt);
              if (num >= 1 && num <= 49) {
                extracted.push(num);
              }
            }
            
            if (extracted.length >= 6) {
              numbers = extracted.slice(0, 6);
              if (extracted.length >= 7) {
                bonus = extracted[6];
              }
              break;
            }
          }
        }
        
        if (date && numbers.length === 6) {
          return {
            date,
            numbers,
            bonus,
            rowHTML: row.innerHTML.substring(0, 500) // First 500 chars for debug
          };
        }
      }
    }
    
    return null;
  });
  
  if (firstResult) {
    console.log('✅ Successfully extracted first result:');
    console.log(`   Date: ${firstResult.date}`);
    console.log(`   Numbers: ${firstResult.numbers.join(', ')}`);
    console.log(`   Bonus: ${firstResult.bonus || 'Not found'}`);
    console.log(`\n   Row HTML preview: ${firstResult.rowHTML}...`);
  } else {
    console.log('❌ Could not extract any result');
  }
  
  console.log('\n\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  await browser.close();
  console.log('\n✅ Done!');
}

testMark6Scraper().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});