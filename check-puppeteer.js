// Script to verify Puppeteer installation
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function checkPuppeteer() {
    console.log('\n===== PUPPETEER DIAGNOSTIC CHECK =====');
    console.log('Checking Puppeteer installation...');
    console.log('Node version:', process.version);
    console.log('Puppeteer version:', require('puppeteer/package.json').version);
    console.log('OS:', process.platform, process.arch);
    console.log('Current working directory:', process.cwd());
    console.log('Environment variables:');
    console.log('- PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR || '(not set)');
    console.log('- PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:', process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || '(not set)');

    // Check if puppeteer is installed
    try {
        // Try to get the browser executable path
        let executablePath;
        try {
            console.log('\nChecking puppeteer.executablePath()...');
            executablePath = puppeteer.executablePath();
            console.log('Executable path:', executablePath);
            console.log('Executable path type:', typeof executablePath);

            if (fs.existsSync(executablePath)) {
                console.log('✅ Browser executable exists at:', executablePath);
            } else {
                console.error('❌ Browser executable does NOT exist at path:', executablePath);
            }
        } catch (execPathError) {
            console.error('Error getting executable path:', execPathError);
        }

        // Check the cache directory
        const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '.cache', 'puppeteer');
        console.log('\nCache directory:', cacheDir);

        if (fs.existsSync(cacheDir)) {
            console.log('✅ Cache directory exists');
            try {
                const files = fs.readdirSync(cacheDir);
                console.log('Cache contents:', files);

                // Check chrome directory
                const chromeDir = path.join(cacheDir, 'chrome');
                if (fs.existsSync(chromeDir)) {
                    console.log('✅ Chrome directory exists');
                    const chromeDirContents = fs.readdirSync(chromeDir);
                    console.log('Chrome directory contents:', chromeDirContents);
                } else {
                    console.error('❌ Chrome directory does NOT exist in cache');
                }
            } catch (readError) {
                console.error('Error reading cache directory:', readError);
            }
        } else {
            console.error('❌ Cache directory does NOT exist');
        }

        // Verify we can launch a browser
        console.log('\nTrying to launch browser...');
        try {
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log('✅ Browser launched successfully!');

            const version = await browser.version();
            console.log('Browser version:', version);

            // Test a simple page navigation
            const page = await browser.newPage();
            await page.goto('about:blank');
            console.log('✅ Successfully navigated to blank page');

            await browser.close();
            console.log('Browser closed successfully');
        } catch (launchError) {
            console.error('❌ Failed to launch browser:', launchError);
        }

    } catch (error) {
        console.error('Error checking Puppeteer:', error);
    }

    console.log('\n===== DIAGNOSTIC CHECK COMPLETE =====');
}

checkPuppeteer()
    .then(() => console.log('Check completed'))
    .catch(err => console.error('Check failed:', err)); 