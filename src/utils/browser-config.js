/**
 * Configurações do navegador para scraping
 * 
 * Contém configurações para tornar o navegador headless mais humano,
 * incluindo user agents, headers e ajustes de navegador.
 */

// Lista de User Agents modernos e comuns
const USER_AGENTS = [
    // Desktop - Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Desktop - Firefox
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
    // Mobile - iOS
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
    // Mobile - Android
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36'
];

/**
 * Obtém um User Agent aleatório
 * @param {string} [deviceType='desktop'] - 'desktop', 'mobile', ou 'any'
 * @returns {string} User Agent
 */
function getRandomUserAgent(deviceType = 'desktop') {
    let filteredAgents = USER_AGENTS;

    if (deviceType === 'desktop') {
        filteredAgents = USER_AGENTS.filter(ua => !ua.includes('Mobile'));
    } else if (deviceType === 'mobile') {
        filteredAgents = USER_AGENTS.filter(ua => ua.includes('Mobile'));
    }

    const randomIndex = Math.floor(Math.random() * filteredAgents.length);
    return filteredAgents[randomIndex];
}

/**
 * Gera headers HTTP comuns para requisições
 * @param {Object} options - Opções para geração de headers
 * @param {string} [options.userAgent] - User Agent específico (opcional)
 * @param {string} [options.cookies] - Cookies para a requisição (opcional)
 * @param {string} [options.referer] - Referer URL (opcional)
 * @returns {Object} Headers HTTP formatados
 */
function generateHeaders({ userAgent, cookies, referer } = {}) {
    const ua = userAgent || getRandomUserAgent();

    // Headers base
    const headers = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'DNT': '1',
        'Cache-Control': 'max-age=0'
    };

    // Adiciona headers condicionais
    if (cookies) {
        headers['Cookie'] = cookies;
    }

    if (referer) {
        headers['Referer'] = referer;
        headers['Sec-Fetch-Site'] = 'same-origin';
    }

    return headers;
}

/**
 * Configurações para o lançamento do Puppeteer
 * @returns {Object} Configurações do browser
 */
function getPuppeteerConfig() {
    return {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--ignore-certificate-errors',
            '--enable-features=NetworkService',
            '--window-size=1920,1080'
        ],
        defaultViewport: {
            width: 1920,
            height: 1080
        }
    };
}

/**
 * Configurações para humanizar o comportamento do browser
 * @param {Page} page - Instância da página Puppeteer
 * @returns {Promise<void>}
 */
async function humanizeBrowser(page) {
    // Configurar tempo de navegação mais humanizado
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);

    // Mock de WebGL para evitar detecção de fingerprinting
    await page.evaluateOnNewDocument(() => {
        // Overrides para navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });

        // WebGL fingerprinting randomization
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
                return 'Intel Inc.';
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
                return 'Intel Iris OpenGL Engine';
            }
            return getParameter.apply(this, arguments);
        };

        // Adicionar plugins falsos
        const pluginData = [
            {
                name: 'Chrome PDF Plugin',
                filename: 'internal-pdf-viewer',
                description: 'Portable Document Format'
            },
            {
                name: 'Chrome PDF Viewer',
                filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                description: ''
            },
            {
                name: 'Native Client',
                filename: 'internal-nacl-plugin',
                description: ''
            }
        ];

        // Override Navigator.plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = { length: pluginData.length };
                for (let i = 0; i < pluginData.length; i++) {
                    plugins[i] = pluginData[i];
                }
                return plugins;
            }
        });
    });
}

module.exports = {
    getRandomUserAgent,
    generateHeaders,
    getPuppeteerConfig,
    humanizeBrowser
}; 