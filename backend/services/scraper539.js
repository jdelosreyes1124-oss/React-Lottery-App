const { LotteryScraperService } = require('./scraper');

// Create a configured instance for 539
const scraper539Config = {
    baseUrl: 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/page/PAGE_NUM/per-page/50/summary-view',
    latestUrl: 'https://en.lottolyzer.com/history/taiwan/daily-cash-539/summary-view',
    timeout: 60000,
    maxPages: 102
};

// Create an instance with the 539-specific config
const scraper539 = new LotteryScraperService(scraper539Config);

// Export methods from the scraper instance
module.exports = {
    scrapeLatestResults: () => scraper539.scrapeLatestResults(),
    scrapeResults: (maxResults) => scraper539.scrapeResults(maxResults),
    validateResults: (results) => scraper539.validateResults(results),
    debugScrape: (maxResults) => scraper539.debugScrape(maxResults),
    debugPage1: () => scraper539.debugPage1()
};