// .puppeteerrc.cjs

const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),

  // Skips the download of the default Chromium browser.
  skipDownload: true,
};