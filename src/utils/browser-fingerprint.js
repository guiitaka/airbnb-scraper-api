/**
 * Browser Fingerprint Generator
 * 
 * Gera fingerprints de navegador realistas para evitar detecção
 * de bots pelo Airbnb. Os fingerprints são gerados aleatoriamente
 * mas de forma consistente para cada sessão.
 */

const crypto = require('crypto');

// Navegadores populares com suas versões
const BROWSERS = [
    { name: 'Chrome', version: ['118.0.0.0', '119.0.0.0', '120.0.0.0', '121.0.0.0', '122.0.0.0'], weight: 70 },
    { name: 'Firefox', version: ['118.0', '119.0', '120.0', '121.0', '122.0', '123.0'], weight: 20 },
    { name: 'Safari', version: ['16.0', '16.5', '17.0', '17.1', '17.2', '17.3'], weight: 10 }
];

// Sistemas operacionais populares
const OPERATING_SYSTEMS = [
    { name: 'Windows', version: ['10.0', '11.0'], weight: 60 },
    { name: 'Mac OS X', version: ['10.15', '11.0', '12.0', '13.0', '14.0'], weight: 30 },
    { name: 'Linux', version: [''], weight: 5 },
    { name: 'iOS', version: ['16.0', '16.5', '17.0', '17.3', '17.4'], weight: 3 },
    { name: 'Android', version: ['13', '14'], weight: 2 }
];

// Dispositivos populares
const DEVICES = [
    { name: 'Desktop', weight: 85 },
    { name: 'Mobile', weight: 12 },
    { name: 'Tablet', weight: 3 }
];

// Linguagens mais comuns
const LANGUAGES = [
    'en-US', 'en-GB', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'nl-NL', 'zh-CN', 'ja-JP', 'ko-KR', 'ru-RU'
];

// Timezones comuns
const TIMEZONES = [
    'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris',
    'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
];

// Resoluções de tela comuns
const SCREEN_RESOLUTIONS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
    { width: 1280, height: 720 },
    { width: 1680, height: 1050 },
    { width: 1024, height: 768 }
];

// Resoluções de tela de dispositivos móveis
const MOBILE_SCREEN_RESOLUTIONS = [
    { width: 390, height: 844 },  // iPhone 14/15
    { width: 428, height: 926 },  // iPhone 14/15 Pro Max
    { width: 360, height: 800 },  // Galaxy
    { width: 412, height: 915 },  // Pixel
    { width: 375, height: 812 },  // iPhone 11 Pro/X/XS
    { width: 414, height: 896 }   // iPhone 11/XR/XS Max
];

// Cores de tela comuns
const COLOR_DEPTHS = [24, 30, 32, 48];

// Gera um número entre min e max, inclusive
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Seleciona um item aleatório de um array
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Seleciona um item com base em seu peso
function getWeightedRandomItem(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item;
    }

    return items[0]; // Fallback
}

/**
 * Gera um fingerprint de navegador consistente
 * @param {string} seed - String para garantir consistência do fingerprint
 * @returns {Object} Objeto com fingerprint para uso em headers e navegação
 */
function generateFingerprint(seed = '') {
    // Cria um seed baseado na entrada ou gera um novo
    const seedHash = seed ?
        crypto.createHash('md5').update(seed).digest('hex') :
        crypto.randomBytes(16).toString('hex');

    // Cria um gerador de números pseudoaleatórios baseado no seed
    let seedValue = parseInt(seedHash.slice(0, 8), 16);
    const random = () => {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
    };

    // Seleciona navegador e versão
    const browser = getWeightedRandomItem(BROWSERS);
    const browserVersion = getRandomItem(browser.version);

    // Seleciona sistema operacional
    const os = getWeightedRandomItem(OPERATING_SYSTEMS);
    const osVersion = getRandomItem(os.version);

    // Seleciona dispositivo
    const device = getWeightedRandomItem(DEVICES);

    // Seleciona resolução com base no dispositivo
    const resolution = device.name === 'Mobile' ?
        getRandomItem(MOBILE_SCREEN_RESOLUTIONS) :
        getRandomItem(SCREEN_RESOLUTIONS);

    // Seleciona profundidade de cor
    const colorDepth = getRandomItem(COLOR_DEPTHS);

    // Seleciona linguagem
    const language = getRandomItem(LANGUAGES);

    // Seleciona timezone
    const timezone = getRandomItem(TIMEZONES);

    // Simula número de CPUs (entre 2 e 16)
    const cpuCores = getRandomInt(2, 16);

    // Simula memória do dispositivo (entre 2 e 32 GB)
    const deviceMemory = getRandomInt(2, 16);

    // Gera User-Agent
    let userAgent;

    if (browser.name === 'Chrome') {
        userAgent = `Mozilla/5.0 (${os.name === 'Windows' ? 'Windows NT ' + osVersion : os.name === 'Mac OS X' ? 'Macintosh; Intel Mac OS X ' + osVersion.replace('.', '_') : os.name === 'iOS' ? 'iPhone; CPU iPhone OS ' + osVersion.replace('.', '_') + ' like Mac OS X' : os.name === 'Android' ? 'Linux; Android ' + osVersion : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} ${os.name === 'iOS' ? 'Mobile/' + getRandomInt(10000, 20000) : os.name === 'Android' ? 'Mobile' : ''} Safari/537.36`;
    } else if (browser.name === 'Firefox') {
        userAgent = `Mozilla/5.0 (${os.name === 'Windows' ? 'Windows NT ' + osVersion : os.name === 'Mac OS X' ? 'Macintosh; Intel Mac OS X ' + osVersion : os.name === 'iOS' ? 'iPhone; CPU iPhone OS ' + osVersion.replace('.', '_') + ' like Mac OS X' : os.name === 'Android' ? 'Android ' + osVersion + '; Mobile' : 'X11; Linux x86_64'}; rv:${browserVersion}) Gecko/20100101 Firefox/${browserVersion}`;
    } else if (browser.name === 'Safari') {
        userAgent = `Mozilla/5.0 (${os.name === 'iOS' ? 'iPhone; CPU iPhone OS ' + osVersion.replace('.', '_') + ' like Mac OS X' : 'Macintosh; Intel Mac OS X ' + osVersion.replace('.', '_')}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browserVersion} ${os.name === 'iOS' ? 'Mobile/' + getRandomInt(15000, 16000) : ''} Safari/605.1.15`;
    }

    // Gera outros parâmetros
    const acceptLanguage = `${language},en-US;q=0.9,en;q=0.8`;

    // Gera plataform-specific vendor
    let vendor = '';
    let vendorSub = '';

    if (browser.name === 'Chrome') {
        vendor = 'Google Inc.';
    } else if (browser.name === 'Firefox') {
        vendor = '';
    } else if (browser.name === 'Safari') {
        vendor = 'Apple Computer, Inc.';
    }

    // Gera plugins realistas baseados no navegador
    const plugins = [];
    if (browser.name === 'Chrome') {
        plugins.push(
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        );
    } else if (browser.name === 'Firefox') {
        plugins.push(
            { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Firefox DeepSpeech', filename: 'deepspeech', description: 'Speech recognition' }
        );
    } else if (browser.name === 'Safari') {
        plugins.push(
            { name: 'QuickTime Plug-in', filename: 'quicktime', description: 'QuickTime' },
            { name: 'Safari PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
        );
    }

    return {
        userAgent,
        acceptLanguage,
        screen: resolution,
        colorDepth,
        deviceMemory,
        hardwareConcurrency: cpuCores,
        browser: {
            name: browser.name,
            version: browserVersion,
            vendor: vendor,
            vendorSub: vendorSub,
        },
        os: {
            name: os.name,
            version: osVersion
        },
        device: device.name,
        plugins: plugins,
        timezone: timezone,
        // Headers comuns
        headers: {
            'User-Agent': userAgent,
            'Accept-Language': acceptLanguage,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Ch-Ua': `"${browser.name}";v="${browserVersion}", "Not=A?Brand";v="99"`,
            'Sec-Ch-Ua-Mobile': device.name === 'Mobile' ? '?1' : '?0',
            'Sec-Ch-Ua-Platform': `"${os.name === 'Mac OS X' ? 'macOS' : os.name}"`,
            'Sec-Ch-Ua-Platform-Version': osVersion,
            'Sec-Ch-Ua-Full-Version': browserVersion,
            'Sec-Ch-Ua-Full-Version-List': `"${browser.name}";v="${browserVersion}", "Not=A?Brand";v="99"`,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        },
        // Configurações para injetar no navegador como script
        scriptToInject: `
            // Override Navigator properties
            Object.defineProperty(navigator, 'userAgent', { get: () => '${userAgent}' });
            Object.defineProperty(navigator, 'appVersion', { get: () => '${userAgent.split('Mozilla/')[1]}' });
            Object.defineProperty(navigator, 'platform', { get: () => '${os.name === 'Windows' ? 'Win32' : os.name === 'Mac OS X' ? 'MacIntel' : os.name === 'Linux' ? 'Linux x86_64' : os.name === 'iOS' ? 'iPhone' : 'Android'}' });
            Object.defineProperty(navigator, 'vendor', { get: () => '${vendor}' });
            Object.defineProperty(navigator, 'vendorSub', { get: () => '${vendorSub}' });
            Object.defineProperty(navigator, 'productSub', { get: () => '${browser.name === 'Chrome' || browser.name === 'Safari' ? '20030107' : '20100101'}' });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${cpuCores} });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => ${deviceMemory} });
            Object.defineProperty(navigator, 'languages', { get: () => ['${language}', 'en-US', 'en'] });
            
            // Screen properties
            Object.defineProperty(screen, 'width', { get: () => ${resolution.width} });
            Object.defineProperty(screen, 'height', { get: () => ${resolution.height} });
            Object.defineProperty(screen, 'availWidth', { get: () => ${resolution.width} });
            Object.defineProperty(screen, 'availHeight', { get: () => ${resolution.height - 40} });
            Object.defineProperty(screen, 'colorDepth', { get: () => ${colorDepth} });
            Object.defineProperty(screen, 'pixelDepth', { get: () => ${colorDepth} });
            
            // WebGL fingerprinting
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                // UNMASKED_VENDOR_WEBGL or UNMASKED_RENDERER_WEBGL
                if (parameter === 37445) {
                    return '${os.name === 'Mac OS X' ? 'Apple Inc.' : 'Google Inc.'}';
                }
                if (parameter === 37446) {
                    return '${os.name === 'Mac OS X' ? 'Apple GPU' : 'ANGLE (Intel, Intel(R) HD Graphics Direct3D11 vs_5_0 ps_5_0)'}';
                }
                return getParameter.apply(this, arguments);
            };
            
            // Timezone
            const dateToString = Date.prototype.toString;
            Date.prototype.toString = function() {
                const defaultTimezone = '${timezone}';
                try {
                    return dateToString.apply(this).replace(/GMT[+-][0-9]{4}/, function(match) {
                        return match + ' (' + defaultTimezone + ')';
                    });
                } catch (e) {
                    return dateToString.apply(this);
                }
            };
            
            // Canvas fingerprinting
            const oldGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, attributes) {
                const context = oldGetContext.apply(this, arguments);
                if (context && type === '2d') {
                    const oldMeasureText = context.measureText;
                    context.measureText = function(text) {
                        const result = oldMeasureText.apply(this, arguments);
                        // Adicionar pequena variação nas medidas para evitar fingerprinting
                        const randomFactor = 0.98 + Math.random() * 0.04; // Variação de 2%
                        result.width = result.width * randomFactor;
                        return result;
                    };
                }
                return context;
            };
            
            // Navigator plugins
            const pluginArray = [${plugins.map(p => `{ name: '${p.name}', filename: '${p.filename}', description: '${p.description}' }`).join(', ')}];
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const plugins = { length: pluginArray.length };
                    for (let i = 0; i < pluginArray.length; i++) {
                        plugins[i] = pluginArray[i];
                    }
                    return plugins;
                }
            });
        `
    };
}

/**
 * Gera um conjunto de headers HTTP para requisições
 * @param {string} sessionId - ID de sessão opcional para manter consistência
 * @returns {Object} Headers HTTP para fetch/axios
 */
function getRequestHeaders(sessionId = '') {
    const fingerprint = generateFingerprint(sessionId);
    return {
        ...fingerprint.headers,
        // Gera um Referer realista
        'Referer': Math.random() > 0.7
            ? 'https://www.google.com/search?q=airbnb+rental+'
            : Math.random() > 0.5
                ? 'https://www.bing.com/search?q=vacation+rental+airbnb'
                : 'https://duckduckgo.com/?q=airbnb+rooms',
        // Adiciona timestamp para parecer mais humano
        'X-Client-Timestamp': Date.now()
    };
}

/**
 * Aplica o fingerprint em uma página do Puppeteer
 * @param {Object} page - Instância de página do Puppeteer
 * @param {string} sessionId - ID de sessão para consistência
 */
async function applyFingerprint(page, sessionId = '') {
    const fingerprint = generateFingerprint(sessionId);

    // Aplicar User-Agent
    await page.setUserAgent(fingerprint.userAgent);

    // Aplicar headers extras
    await page.setExtraHTTPHeaders(fingerprint.headers);

    // Injetar script para modificar propriedades do navegador
    await page.evaluateOnNewDocument(fingerprint.scriptToInject);

    return fingerprint;
}

module.exports = {
    generateFingerprint,
    getRequestHeaders,
    applyFingerprint
}; 