const scraper = require('./scraper');

// Export methods directly
module.exports = {
    scrapeLatestResults: scraper.scrapeLatestResults.bind(scraper),
    scrapeResults: scraper.scrapeResults.bind(scraper)
};

module.exports = scraper539;