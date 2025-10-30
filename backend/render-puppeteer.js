// render-puppeteer.js

const puppeteer = require('puppeteer');

async function launchBrowser() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_EXECUTABLE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ],
  });
  return browser;
}

module.exports = { launchBrowser };