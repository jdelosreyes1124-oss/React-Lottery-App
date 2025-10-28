const createScraper = require('./scraper');

// Create a configured instance for 539
const scraper539 = createScraper();

// Configure with 539-specific settings
scraper539.configure({
    baseUrl: 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/page/PAGE_NUM/per-page/50/summary-view',
    latestUrl: 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/summary-view',
    timeout: 60000,
    maxPages: 102
});

module.exports = scraper539;

module.exports = scraper539;