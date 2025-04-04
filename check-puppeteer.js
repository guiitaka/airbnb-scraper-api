// Script to verify Puppeteer installation
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function checkPuppeteer() {
    console.log('Checking Puppeteer installation...');

    // Check if puppeteer is installed
    try {
        const browserFetcher = puppeteer.createBrowserFetcher();
        console.log('Browser fetcher created');

        // Try to get the browser executable path
        try {
            console.log('Checking puppeteer.executablePath()...');
            const executablePath = puppeteer.executablePath();
            console.log('Executable path:', executablePath);

            if (fs.existsSync(executablePath)) {
                console.log('✅ Browser executable exists at:', executablePath);
            } else {
                console.log('❌ Browser executable does NOT exist at path:', executablePath);
            }
        } catch (execPathError) {
            console.error('Error getting executable path:', execPathError);
        }

        // Check the cache directory
        const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '.cache', 'puppeteer');
        console.log('Cache directory:', cacheDir);

        if (fs.existsSync(cacheDir)) {
            console.log('✅ Cache directory exists');
            try {
                const files = fs.readdirSync(cacheDir);
                console.log('Cache contents:', files);
            } catch (readError) {
                console.error('Error reading cache directory:', readError);
            }
        } else {
            console.log('❌ Cache directory does NOT exist');
        }

        // Verify we can launch a browser
        console.log('Trying to launch browser...');
        try {
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log('✅ Browser launched successfully!');

            const version = await browser.version();
            console.log('Browser version:', version);

            await browser.close();
            console.log('Browser closed successfully');
        } catch (launchError) {
            console.error('❌ Failed to launch browser:', launchError);
        }

    } catch (error) {
        console.error('Error checking Puppeteer:', error);
    }
}

checkPuppeteer()
    .then(() => console.log('Check completed'))
    .catch(err => console.error('Check failed:', err)); 