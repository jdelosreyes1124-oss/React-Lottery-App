/**
 * Debug script to inspect the actual HTML structure
 * Run this to see what the page really looks like
 */

const puppeteer = require('puppeteer');

async function inspectPageStructure() {
  console.log('🔍 Inspecting page structure...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  console.log('📡 Loading page...');
  await page.goto('https://en.lottolyzer.com/home/taiwan/daily-cash-539/number-view', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  console.log('⏳ Waiting 5 seconds for dynamic content...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Inspect the page structure
  const structure = await page.evaluate(() => {
    const info = {
      tables: [],
      allText: ''
    };
    
    // Find all tables
    const tables = document.querySelectorAll('table');
    console.log(`Found ${tables.length} tables`);
    
    tables.forEach((table, tableIndex) => {
      const tableInfo = {
        index: tableIndex,
        classes: table.className,
        id: table.id,
        rows: []
      };
      
      const rows = table.querySelectorAll('tr');
      
      rows.forEach((row, rowIndex) => {
        if (rowIndex < 5) { // Only first 5 rows per table
          const rowInfo = {
            rowIndex: rowIndex,
            cells: [],
            fullText: row.textContent.trim()
          };
          
          const cells = row.querySelectorAll('td, th');
          cells.forEach((cell, cellIndex) => {
            rowInfo.cells.push({
              cellIndex: cellIndex,
              text: cell.textContent.trim(),
              classes: cell.className,
              html: cell.innerHTML.substring(0, 200) // First 200 chars
            });
          });
          
          tableInfo.rows.push(rowInfo);
        }
      });
      
      info.tables.push(tableInfo);
    });
    
    // Look for any elements with "ball" or "number" classes
    const ballElements = document.querySelectorAll('[class*="ball"], [class*="number"]');
    info.ballElementsCount = ballElements.length;
    info.sampleBalls = [];
    
    for (let i = 0; i < Math.min(10, ballElements.length); i++) {
      info.sampleBalls.push({
        class: ballElements[i].className,
        text: ballElements[i].textContent.trim(),
        html: ballElements[i].outerHTML.substring(0, 200)
      });
    }
    
    // Get all text content to check for numbers
    info.allText = document.body.textContent.replace(/\s+/g, ' ').substring(0, 2000);
    
    return info;
  });
  
  // Print the structure
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 PAGE STRUCTURE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`Total Tables Found: ${structure.tables.length}\n`);
  
  structure.tables.forEach((table) => {
    console.log(`\n┌─ TABLE ${table.index}`);
    console.log(`│  Classes: "${table.classes}"`);
    console.log(`│  ID: "${table.id}"`);
    console.log(`│  Rows: ${table.rows.length}`);
    console.log('│');
    
    table.rows.forEach((row) => {
      console.log(`│  ├─ Row ${row.rowIndex}:`);
      console.log(`│  │  Full Text: "${row.fullText}"`);
      console.log(`│  │  Cells: ${row.cells.length}`);
      
      row.cells.forEach((cell) => {
        console.log(`│  │  ├─ Cell ${cell.cellIndex}: "${cell.text}"`);
        if (cell.classes) {
          console.log(`│  │  │  Classes: "${cell.classes}"`);
        }
      });
    });
  });
  
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('🎱 BALL/NUMBER ELEMENTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total ball elements found: ${structure.ballElementsCount}\n`);
  
  if (structure.sampleBalls.length > 0) {
    console.log('Sample ball elements:');
    structure.sampleBalls.forEach((ball, i) => {
      console.log(`\n${i + 1}. Class: "${ball.class}"`);
      console.log(`   Text: "${ball.text}"`);
      console.log(`   HTML: ${ball.html}`);
    });
  } else {
    console.log('⚠️ No ball elements found!');
  }
  
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📄 PAGE TEXT PREVIEW');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(structure.allText);
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  // Take screenshot
  await page.screenshot({ path: 'structure-analysis.png', fullPage: true });
  console.log('📸 Screenshot saved: structure-analysis.png');
  
  console.log('\n⏸️ Browser kept open. Inspect the page manually, then close the browser to exit.');
  
  // Don't close browser - let user inspect
}

inspectPageStructure().catch(console.error);