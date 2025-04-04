const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    // Changes the cache location for Puppeteer.
    cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
    // Use specific browser version
    defaultProduct: 'chrome',
    // Enable extra debugging
    logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'warn',
}; 