// Script to verify Puppeteer installation
const puppeteer = require('puppeteer');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const randomUseragent = require('random-useragent');
const fs = require('fs');
const path = require('path');

async function checkPuppeteer() {
    console.log('\n===== PUPPETEER DIAGNOSTIC CHECK =====');
    console.log('Checking Puppeteer and plugins installation...');
    console.log('Node version:', process.version);

    // Verificar versões das dependências
    try {
        console.log('Puppeteer version:', require('puppeteer/package.json').version);
        console.log('Puppeteer-extra version:', require('puppeteer-extra/package.json').version);
        console.log('Stealth plugin version:', require('puppeteer-extra-plugin-stealth/package.json').version);
        console.log('Adblocker plugin version:', require('puppeteer-extra-plugin-adblocker/package.json').version);
        console.log('Anonymize-UA plugin version:', require('puppeteer-extra-plugin-anonymize-ua/package.json').version);
        console.log('Random-useragent version:', require('random-useragent/package.json').version);
    } catch (err) {
        console.error('Error checking plugin versions:', err.message);
    }

    console.log('OS:', process.platform, process.arch);
    console.log('Current working directory:', process.cwd());
    console.log('Environment variables:');
    console.log('- PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR || '(not set)');
    console.log('- PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:', process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || '(not set)');

    // Check if puppeteer is installed
    try {
        // Try to get the browser executable path
        try {
            console.log('\nChecking puppeteer.executablePath()...');
            const executablePath = puppeteer.executablePath();
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

        // Verify we can launch a browser with puppeteer-extra
        console.log('\nTesting puppeteer-extra with plugins...');
        try {
            // Registrar plugins
            puppeteerExtra.use(StealthPlugin());
            puppeteerExtra.use(AdblockerPlugin({ blockTrackers: true }));
            puppeteerExtra.use(AnonymizeUAPlugin());

            console.log('✅ Plugins registered successfully');
        } catch (pluginError) {
            console.error('❌ Error registering plugins:', pluginError);
        }

        // Verificar que conseguimos lançar um browser com puppeteer-extra
        console.log('\nTrying to launch browser with puppeteer-extra...');
        try {
            const browser = await puppeteerExtra.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log('✅ Browser launched successfully with puppeteer-extra!');

            const version = await browser.version();
            console.log('Browser version:', version);

            // Test a simple page navigation
            const page = await browser.newPage();
            await page.goto('about:blank');
            console.log('✅ Successfully navigated to blank page');

            await browser.close();
            console.log('Browser closed successfully');
        } catch (launchError) {
            console.error('❌ Failed to launch browser with puppeteer-extra:', launchError);

            // Fallback para puppeteer regular
            console.log('\nTrying fallback to regular puppeteer...');
            try {
                const browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                console.log('✅ Regular puppeteer browser launched successfully');
                await browser.close();
            } catch (fallbackError) {
                console.error('❌ Failed even with regular puppeteer:', fallbackError);
            }
        }

    } catch (error) {
        console.error('Error checking Puppeteer:', error);
    }

    console.log('\n===== DIAGNOSTIC CHECK COMPLETE =====');
}

checkPuppeteer()
    .then(() => console.log('Check completed'))
    .catch(err => console.error('Check failed:', err)); 