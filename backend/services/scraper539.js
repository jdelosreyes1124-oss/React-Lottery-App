const scraper = require('./scraper');

// Create dedicated interface for 539
const scraper539 = {
    scrapeLatestResults: async () => {
        try {
            console.log('🎲 Starting 539 scraper...');
            const results = await scraper.scrapeLatestResults();
            console.log('✅ 539 scraper complete');
            return results;
        } catch (error) {
            console.error('❌ 539 scraper error:', error);
            throw error;
        }
    },
    scrapeResults: async (maxResults) => {
        try {
            console.log('🎲 Starting 539 scraper...');
            const results = await scraper.scrapeResults(maxResults);
            console.log('✅ 539 scraper complete');
            return results;
        } catch (error) {
            console.error('❌ 539 scraper error:', error);
            throw error;
        }
    }
};

module.exports = scraper539;