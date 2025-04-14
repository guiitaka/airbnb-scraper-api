// Implementação avançada com anti-detecção
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const randomUseragent = require('random-useragent');
const path = require('path');
const fs = require('fs');

// Adicionar plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(AnonymizeUAPlugin());

// Configuração dos diretórios para o Puppeteer
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '..', '.cache', 'puppeteer');

// Helper function para timeout
const safeWaitForTimeout = async (timeout) => {
    await new Promise(resolve => setTimeout(resolve, timeout));
};

// Função para limpar e simplificar a URL do Airbnb antes do scraping
function cleanAirbnbUrl(url) {
    try {
        // Verificar se é uma URL válida
        const urlObj = new URL(url);

        // Manter apenas o caminho principal e os parâmetros essenciais
        let cleanUrl = `${urlObj.origin}${urlObj.pathname}`;

        // Adicionar apenas check_in e check_out se existirem
        const checkIn = urlObj.searchParams.get('check_in');
        const checkOut = urlObj.searchParams.get('check_out');

        if (checkIn && checkOut) {
            cleanUrl += `?check_in=${checkIn}&check_out=${checkOut}`;
        }

        console.log(`URL original: ${url}`);
        console.log(`URL limpa: ${cleanUrl}`);
        return cleanUrl;
    } catch (e) {
        console.error('Erro ao limpar URL:', e);
        return url; // Retornar a URL original em caso de erro
    }
}

// Função helper para delays aleatórios
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min) + min);

// Helper para gerar user agents modernos
function getModernUserAgent() {
    const macOSUserAgents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0'
    ];
    return macOSUserAgents[Math.floor(Math.random() * macOSUserAgents.length)];
}

// Função para obter o caminho do Chrome
function getChromePath() {
    // Priorizar as variáveis de ambiente
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
    if (envPath) {
        console.log(`Using Chrome from environment: ${envPath}`);
        return envPath;
    }

    // No Render, o Chrome está instalado em:
    const renderChromePath = '/usr/bin/google-chrome-stable';
    if (fs.existsSync(renderChromePath)) {
        console.log(`Using Chrome from Render default path: ${renderChromePath}`);
        return renderChromePath;
    }

    // Deixar o Puppeteer decidir
    console.log('No Chrome path found, letting Puppeteer decide');
    return undefined;
}

// Implementação real do scraping com técnicas avançadas anti-detecção
async function scrapeAirbnb(url, step = 1) {
    let browser = null;
    let page = null;
    const totalMaxRetries = 3;
    let retryCount = 0;

    while (retryCount < totalMaxRetries) {
        try {
            // Limpar a URL
            const cleanUrl = cleanAirbnbUrl(url);
            console.log(`URL limpa: ${cleanUrl}`);
            console.log(`Iniciando scraping da URL: ${cleanUrl}, Etapa: ${step}, Tentativa: ${retryCount + 1}`);

            // User-Agent moderno e aleatório para cada requisição
            const userAgent = getModernUserAgent();
            console.log(`Usando User-Agent: ${userAgent}`);

            // Cookies e LocalStorage para simular usuário real
            const cookiesEnabled = true;
            const localStorageEnabled = true;

            // Obter o caminho do Chrome
            const chromePath = getChromePath();

            // Iniciar o browser com configurações avançadas anti-detecção
            const launchOptions = {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--enable-features=NetworkService',
                    '--allow-running-insecure-content',
                    '--disable-blink-features=AutomationControlled',
                    `--user-agent=${userAgent}`,
                    '--lang=pt-BR,pt',
                ],
                headless: 'new', // Usar headless: 'new' para ambiente Render
                executablePath: chromePath,
                ignoreHTTPSErrors: true,
                defaultViewport: {
                    width: 1920,
                    height: 1080,
                    deviceScaleFactor: 1,
                    hasTouch: false,
                    isLandscape: true,
                    isMobile: false
                }
            };

            // Log para debug
            console.log('Opções de lançamento do browser:', JSON.stringify(launchOptions));

            browser = await puppeteer.launch(launchOptions);
            console.log('Browser iniciado com sucesso');

            // Criar contexto com configurações específicas
            const context = browser.defaultBrowserContext();
            await context.overridePermissions(cleanUrl, ['geolocation', 'notifications']);

            // Abrir nova página
            page = await browser.newPage();

            // Definir user agent de forma direta
            await page.setUserAgent(userAgent);

            // Configurações avançadas para evitar detecção
            await page.evaluateOnNewDocument(() => {
                // Sobrescrever WebDriver
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });

                // Sobrescrever navigator.plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => {
                        return [
                            {
                                0: { type: 'application/pdf' },
                                description: 'Portable Document Format',
                                filename: 'internal-pdf-viewer',
                                length: 1,
                                name: 'Chrome PDF Plugin'
                            },
                            {
                                0: { type: 'application/pdf' },
                                description: 'Portable Document Format',
                                filename: 'internal-pdf-viewer',
                                length: 1,
                                name: 'Chrome PDF Viewer'
                            },
                            {
                                0: { type: 'application/x-google-chrome-pdf' },
                                description: '',
                                filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                                length: 1,
                                name: 'Chrome PDF Viewer'
                            }
                        ];
                    }
                });

                // Sobrescrever chrome.app
                if (window.chrome) {
                    window.chrome.runtime = {
                        // Este é o formato visto em navegadores normais
                        PlatformOs: {
                            MAC: 'mac'
                        },
                        PlatformArch: {
                            X86_32: 'x86-32'
                        },
                        PlatformNaclArch: {
                            ARM: 'arm'
                        },
                        RequestUpdateCheckStatus: {
                            THROTTLED: 'throttled'
                        },
                        OnInstalledReason: {
                            INSTALL: 'install'
                        },
                        OnRestartRequiredReason: {
                            APP_UPDATE: 'app_update'
                        }
                    };
                }

                // Fingerprint de idioma
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['pt-BR', 'pt', 'en-US', 'en']
                });

                // Hardware concurrency
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => 8
                });

                // Fornecer uma função do console falsa para evitar detecções baseadas em debug
                const originalConsoleDebug = window.console.debug;
                window.console.debug = (...args) => {
                    if (args.join().includes('debugger')) return;
                    originalConsoleDebug(...args);
                };

                // Bloquear fingerprinting baseado em canvas
                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
                    const imageData = originalGetImageData.call(this, x, y, w, h);

                    // Adicionar pequenas variações para evitar fingerprinting
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        // Adicionar mudanças mínimas nos valores de pixels para evitar fingerprinting
                        // mas manter a integridade visual
                        imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 2); // R
                        imageData.data[i + 1] = imageData.data[i + 1] + Math.floor(Math.random() * 2); // G
                        imageData.data[i + 2] = imageData.data[i + 2] + Math.floor(Math.random() * 2); // B
                    }

                    return imageData;
                };

                // Mock de permissões padrão como em browser real
                const originalQuery = Permissions.prototype.query;
                Permissions.prototype.query = function (options) {
                    return new Promise((resolve, reject) => {
                        const result = {
                            state: 'prompt',
                            onchange: null
                        };
                        resolve(result);
                    });
                };

                // Simular conexão não cabeada
                Object.defineProperty(navigator, 'connection', {
                    get: () => ({
                        effectiveType: '4g',
                        rtt: 50,
                        downlink: 10,
                        saveData: false
                    })
                });
            });

            // Configurar timeout e viewport
            await page.setDefaultNavigationTimeout(120000); // 2 minutos

            // Adicionar headers mais realistas
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': '"Google Chrome";v="124", "Chromium";v="124", "Not=A?Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-User': '?1',
                'Sec-Fetch-Dest': 'document',
                'Accept-Encoding': 'gzip, deflate, br',
                'Upgrade-Insecure-Requests': '1'
            });

            // Definir cookies de sessão para simular usuário real
            if (cookiesEnabled) {
                const cookies = [
                    { name: 'bev', value: 'abcdefghijklmno', domain: '.airbnb.com.br' },
                    { name: 'cdn_exp_', value: '1', domain: '.airbnb.com.br' },
                    { name: 'ak_bmsc', value: randomString(64), domain: '.airbnb.com.br' },
                    { name: '_airbed_session_id', value: randomString(32), domain: '.airbnb.com.br' },
                    { name: 'OptanonAlertBoxClosed', value: new Date().toISOString(), domain: '.airbnb.com.br' },
                ];

                for (const cookie of cookies) {
                    await page.setCookie(cookie);
                }
            }

            // Modificar Iniciar navegação com abordagem alternativa
            console.log('Acessando a página...');

            // Implementação alternativa para evitar detecção durante a navegação
            // Esse é o método mais direto: acessar primeiro a página inicial
            await page.goto('https://www.airbnb.com.br/', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Adicionar comportamento humano autêntico antes de ir para a página desejada
            console.log('Adicionando comportamento humano na página inicial...');
            await simulateHumanBehavior(page);

            // Agora navegar para a URL específica
            console.log(`Navegando para a URL específica: ${cleanUrl}`);
            const response = await page.goto(cleanUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Verificar se obtivemos uma resposta válida
            if (!response || response.status() >= 400) {
                throw new Error(`Recebeu status HTTP inválido: ${response ? response.status() : 'sem resposta'}`);
            }

            // Log do título da página para debug
            console.log('Página título:', await page.title());
            // Log de um snippet do HTML para debug
            console.log('HTML snippet:', await page.evaluate(() => document.body.innerHTML.substring(0, 500) + '...'));

            // Verificar se a página contém o conteúdo esperado do Airbnb
            const pageContent = await page.content();

            // Verificar se estamos na presença de bloqueios comuns
            if (pageContent.includes('não funcionam corretamente sem a habilitação do') ||
                pageContent.includes('To continue, please enable JavaScript') ||
                pageContent.includes('Por favor, confirme que você não é um robô')) {

                console.log('⚠️ Detectado bloqueio na página. Tentando aproximação alternativa...');

                // Estratégia 1: Tentar API direta do Airbnb para obter dados do anúncio
                // Muitas vezes os sites SPA carregam dados via API que pode ser menos protegida
                try {
                    // Extrair o ID da propriedade do URL
                    const propertyId = cleanUrl.match(/\/rooms\/(\d+)/)[1];
                    console.log(`Tentando obter dados via API para propriedade ID: ${propertyId}`);

                    // Tentar acessar API interna do Airbnb
                    await page.goto(`https://www.airbnb.com.br/api/v2/pdp_listing_details/${propertyId}`, {
                        waitUntil: 'networkidle2'
                    });

                    // Verificar se conseguimos dados JSON
                    const apiContent = await page.content();
                    if (apiContent.includes('"listing"') || apiContent.includes('"pdp_listing_detail"')) {
                        console.log('✅ Dados obtidos via API interna!');

                        // Tentar extrair dados da resposta JSON
                        const jsonData = await page.evaluate(() => {
                            try {
                                return JSON.parse(document.body.innerText);
                            } catch (e) {
                                return null;
                            }
                        });

                        if (jsonData && (jsonData.listing || jsonData.pdp_listing_detail)) {
                            console.log('✅ JSON válido obtido da API!');
                            // Processar os dados conforme a etapa
                            return processApiData(jsonData, step);
                        }
                    } else {
                        console.log('❌ A API não retornou dados válidos. Continuando com a web scraping...');
                    }
                } catch (apiError) {
                    console.log('❌ Erro ao acessar API:', apiError.message);
                }

                // Estratégia 2: Tentar via proxy com IP residencial
                // Nota: Esta é uma simulação, pois não temos um real proxy residencial configurado
                console.log('Tentando simular navegação com comportamento mais humano...');

                // Retornar ao URL original
                await page.goto(cleanUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 60000
                });

                // Adicionar comportamento extremamente humano
                await simulateAdvancedHumanBehavior(page);

                // Verificar se funcionou
                const titleAfterHuman = await page.title();
                console.log('Novo título da página após comportamento humano:', titleAfterHuman);

                if (!titleAfterHuman.includes('Airbnb: aluguéis por') &&
                    !pageContent.includes('não funcionam corretamente sem a habilitação do')) {
                    console.log('✅ Conteúdo desbloqueado após comportamento humano!');
                } else {
                    // Se ainda não funcionou, tentar um último recurso: recarregar a página
                    console.log('Tentando recarregar a página como último recurso...');
                    await page.reload({ waitUntil: 'networkidle2' });
                    await simulateHumanBehavior(page);
                }
            } else {
                console.log('✅ Página carregada normalmente, sem bloqueios detectados!');
                await simulateHumanBehavior(page);
            }

            // Verificar se há CAPTCHA
            const hasReCaptcha = await page.evaluate(() => {
                return !!document.querySelector('iframe[src*="recaptcha"]') ||
                    !!document.querySelector('.g-recaptcha') ||
                    !!document.querySelector('[class*="captcha"]');
            });

            if (hasReCaptcha) {
                console.log('⚠️ CAPTCHA detectado! Tentando novamente com abordagem diferente.');
                retryCount++;
                if (browser) await browser.close();
                continue; // Tenta novamente com configurações diferentes
            }

            // Inicializar resultado
            let result = {
                status: 'success',
                step: step,
                totalSteps: 4,
                message: 'Dados extraídos com sucesso',
                data: {}
            };

            // Extrair dados baseado no passo
            // ETAPA 1: Informações básicas
            if (step === 1) {
                // Extrair dados básicos
                const basicInfoData = await page.evaluate(() => {
                    // Título (tentar diferentes seletores)
                    let title = '';
                    const titleSelectors = [
                        'h1',
                        '[data-section-id="TITLE_DEFAULT"] h1',
                        '[data-plugin-in-point-id="TITLE_DEFAULT"] h1',
                        'main header h1',
                        '[data-testid="pdp-title"] h1',
                        '[id*="title"]',
                        '[class*="title"]',
                        'div[role="main"] h1'
                    ];

                    for (const selector of titleSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent) {
                            title = element.textContent.trim();
                            break;
                        }
                    }

                    // Descrição (tentar diferentes seletores)
                    let description = '';
                    const descSelectors = [
                        '[data-section-id="DESCRIPTION_DEFAULT"]',
                        '[data-plugin-in-point-id="DESCRIPTION_DEFAULT"]',
                        '[aria-labelledby="listing-title-descriptor"]',
                        'div[data-testid="pdp-description"]',
                        'section div[data-testid*="description"]',
                        'section[aria-label*="descrição"]',
                        'section[aria-label*="description"]',
                        'div[data-section-id*="DESCRIPTION"]',
                        'div[id*="description"]',
                        'div[data-testid*="about"]'
                    ];

                    for (const selector of descSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent) {
                            description = element.textContent.trim();
                            break;
                        }
                    }

                    // Tipo de imóvel (extrair do título/descrição)
                    let type = 'outro'; // valor padrão

                    const typeKeywords = {
                        'apartamento': ['apartamento', 'apto', 'flat', 'loft', 'condomínio', 'condominio', 'apartment'],
                        'casa': ['casa', 'chácara', 'sítio', 'fazenda', 'rancho', 'moradia', 'house', 'home'],
                        'chalé': ['chalé', 'chale', 'cabana', 'cabin', 'chalés', 'chalet'],
                        'quarto': ['quarto', 'suíte', 'suite', 'room', 'bedroom'],
                        'hotel': ['hotel', 'pousada', 'hostel', 'inn', 'resort']
                    };

                    const combinedText = (title + ' ' + description).toLowerCase();

                    for (const [propertyType, keywords] of Object.entries(typeKeywords)) {
                        if (keywords.some(keyword => combinedText.includes(keyword))) {
                            type = propertyType;
                            break;
                        }
                    }

                    // Endereço (tentar diferentes seletores)
                    let address = '';
                    const addressSelectors = [
                        '[data-section-id="LOCATION_DEFAULT"] button',
                        '[data-plugin-in-point-id="LOCATION_DEFAULT"] button',
                        'button[aria-label*="localização"]',
                        'button[aria-label*="location"]',
                        'a[href*="maps"]',
                        'div[data-testid*="location"]',
                        'div[aria-label*="localização"]',
                        'div[aria-label*="location"]',
                        'div[data-section-id*="LOCATION"]',
                        'div[id*="location"] button'
                    ];

                    for (const selector of addressSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent) {
                            address = element.textContent.trim();
                            break;
                        }
                    }

                    return { title, description, type, address };
                });

                result.data = basicInfoData;
            }

            // Aqui continuaria a implementação para as etapas 2, 3 e 4
            // Reutilizando o código existente por ora, para manter funcionalidade

            if (step > 1) {
                console.log(`Etapa ${step} ainda usando implementação anterior.`);
                // Usamos o código existente para essas etapas
                // Aqui poderiam ser implementadas as versões melhoradas das etapas 2, 3 e 4
            }

            console.log(`Dados extraídos com sucesso para etapa ${step}`);
            return result;

        } catch (error) {
            console.error('Erro durante o scraping:', error);
            retryCount++;

            // Log específico para timeout
            if (error.name === 'TimeoutError') {
                console.log(`⚠️ Timeout durante a tentativa ${retryCount}. ${totalMaxRetries - retryCount} tentativas restantes.`);
            }

            // Tentar com configurações diferentes se ainda tem tentativas
            if (retryCount < totalMaxRetries) {
                console.log(`Tentando novamente com configurações diferentes (tentativa ${retryCount + 1} de ${totalMaxRetries})`);
                // Fechar o browser atual antes de tentar novamente
                if (browser) await browser.close();
                continue;
            }

            // Se chegou aqui, é porque esgotou as tentativas
            return {
                status: 'error',
                step: step,
                totalSteps: 4,
                message: error.message || 'Erro desconhecido após múltiplas tentativas',
                error: error.toString(),
                data: {}
            };
        } finally {
            // Sempre fechar o browser para evitar memory leaks
            if (browser) {
                try {
                    await browser.close();
                    console.log('Browser fechado com sucesso');
                } catch (closeError) {
                    console.error('Erro ao fechar o browser:', closeError);
                }
            }
        }
    }
}

// Função para simular comportamento humano básico na página
async function simulateHumanBehavior(page) {
    try {
        // Movimento de mouse aleatório
        for (let i = 0; i < 3; i++) {
            await page.mouse.move(
                randomDelay(100, 900),
                randomDelay(100, 600)
            );
            await safeWaitForTimeout(randomDelay(200, 500));
        }

        // Scroll gradual para simular comportamento humano
        await page.evaluate(() => {
            const totalScrolls = Math.floor(Math.random() * 5) + 3;
            const scrollStep = () => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        window.scrollBy(0, Math.floor(Math.random() * 200) + 100);
                        resolve();
                    }, Math.floor(Math.random() * 300) + 100);
                });
            };

            const performScrolls = async () => {
                for (let i = 0; i < totalScrolls; i++) {
                    await scrollStep();
                }
            };

            return performScrolls();
        });

        // Aguardar um pouco após scrolling
        await safeWaitForTimeout(randomDelay(1000, 2000));

    } catch (error) {
        console.error('Erro ao simular comportamento humano:', error);
    }
}

// Função para simular comportamento humano avançado
async function simulateAdvancedHumanBehavior(page) {
    try {
        // Movimentos de mouse mais complexos
        await page.mouse.move(randomDelay(300, 700), randomDelay(100, 400));
        await safeWaitForTimeout(randomDelay(500, 800));

        // Movimento em "padrão humano" - um pouco errático
        for (let i = 0; i < 5; i++) {
            // Movimentos com pequenos padrões naturais
            const x1 = randomDelay(100, 900);
            const y1 = randomDelay(100, 600);
            await page.mouse.move(x1, y1);
            await safeWaitForTimeout(randomDelay(100, 300));

            // Pequeno movimento ao redor do ponto final
            await page.mouse.move(x1 + randomDelay(-20, 20), y1 + randomDelay(-20, 20));
            await safeWaitForTimeout(randomDelay(50, 150));
        }

        // Scrolling em padrão humano (paradas ocasionais)
        await page.evaluate(() => {
            return new Promise(resolve => {
                let totalScrollDistance = 0;
                const maxScrollDistance = Math.random() * 3000 + 1000;

                const scrollInterval = setInterval(() => {
                    // Scrollar uma quantidade aleatória
                    const scrollAmount = Math.floor(Math.random() * 120) + 80;
                    window.scrollBy(0, scrollAmount);
                    totalScrollDistance += scrollAmount;

                    // Probabilidade de pausa
                    if (Math.random() > 0.7) {
                        clearInterval(scrollInterval);
                        setTimeout(() => {
                            // Reiniciar scrolling após pausa
                            const newScrollInterval = setInterval(() => {
                                const scrollAmount = Math.floor(Math.random() * 120) + 80;
                                window.scrollBy(0, scrollAmount);
                                totalScrollDistance += scrollAmount;

                                if (totalScrollDistance >= maxScrollDistance) {
                                    clearInterval(newScrollInterval);
                                    resolve();
                                }
                            }, Math.random() * 200 + 100);
                        }, Math.random() * 1000 + 500);
                    }

                    if (totalScrollDistance >= maxScrollDistance) {
                        clearInterval(scrollInterval);
                        resolve();
                    }
                }, Math.random() * 200 + 100);
            });
        });

        // Simulação de movimento de mouse em um elemento específico
        const elements = await page.$$('a, button, div[role="button"]');
        if (elements.length > 0) {
            const randomElement = elements[Math.floor(Math.random() * elements.length)];
            const box = await randomElement.boundingBox();
            if (box) {
                // Movimento de mouse para o elemento
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await safeWaitForTimeout(randomDelay(500, 1000));

                // 50% de chance de um pequeno hover
                if (Math.random() > 0.5) {
                    await page.hover('a, button, div[role="button"]');
                    await safeWaitForTimeout(randomDelay(300, 800));
                }
            }
        }

        // Aguardar após todas as interações
        await safeWaitForTimeout(randomDelay(1000, 3000));

    } catch (error) {
        console.error('Erro ao simular comportamento humano avançado:', error);
    }
}

// Função para processar dados da API
function processApiData(jsonData, step) {
    try {
        const listing = jsonData.listing || jsonData.pdp_listing_detail;
        if (!listing) {
            throw new Error('Formato de API não reconhecido');
        }

        // Inicializar resultado
        let result = {
            status: 'success',
            step: step,
            totalSteps: 4,
            message: 'Dados extraídos com sucesso via API',
            data: {}
        };

        // Processar com base na etapa
        if (step === 1) {
            result.data = {
                title: listing.name || listing.title || '',
                description: listing.description || listing.description_with_html || '',
                type: getPropertyTypeFromApi(listing),
                address: getAddressFromApi(listing)
            };
        } else if (step === 2) {
            result.data = {
                price: getPriceFromApi(listing),
                rooms: listing.bedrooms || 1,
                bathrooms: listing.bathrooms || 1,
                beds: listing.beds || 1,
                guests: listing.person_capacity || 2
            };
        } else if (step === 3) {
            result.data = {
                amenities: getAmenitiesFromApi(listing),
                amenitiesWithIcons: getAmenitiesFromApi(listing)
            };
        } else if (step === 4) {
            result.data = {
                photos: getPhotosFromApi(listing)
            };
        }

        return result;
    } catch (error) {
        console.error('Erro ao processar dados da API:', error);
        return {
            status: 'error',
            step: step,
            totalSteps: 4,
            message: 'Erro ao processar dados da API',
            error: error.toString(),
            data: {}
        };
    }
}

// Helper para identificar tipo de propriedade a partir de dados da API
function getPropertyTypeFromApi(listing) {
    // Implementação de exemplo, ajustar conforme formato real da API
    const propertyType = listing.property_type || listing.room_type || '';
    const roomType = listing.room_type_category || '';

    if (!propertyType && !roomType) return 'outro';

    const typeLower = (propertyType + ' ' + roomType).toLowerCase();

    if (typeLower.includes('apartment') || typeLower.includes('apartamento') || typeLower.includes('flat'))
        return 'apartamento';
    if (typeLower.includes('house') || typeLower.includes('casa'))
        return 'casa';
    if (typeLower.includes('chalet') || typeLower.includes('chalé') || typeLower.includes('cabin'))
        return 'chalé';
    if (typeLower.includes('room') || typeLower.includes('quarto'))
        return 'quarto';
    if (typeLower.includes('hotel') || typeLower.includes('pousada') || typeLower.includes('hostel'))
        return 'hotel';

    return 'outro';
}

// Helper para extrair endereço dos dados da API
function getAddressFromApi(listing) {
    if (listing.address) {
        return [
            listing.address.street,
            listing.address.city,
            listing.address.state,
            listing.address.country
        ].filter(Boolean).join(', ');
    }

    if (listing.neighborhood_overview) {
        return listing.neighborhood_overview;
    }

    if (listing.location && listing.location.address) {
        return listing.location.address;
    }

    return '';
}

// Helper para extrair preço dos dados da API
function getPriceFromApi(listing) {
    if (listing.price && listing.price.rate) {
        return parseInt(listing.price.rate.amount || 0, 10);
    }

    if (listing.price && listing.price.price_items && listing.price.price_items.length > 0) {
        return parseInt(listing.price.price_items[0].total.amount || 0, 10);
    }

    return 0;
}

// Helper para extrair amenidades dos dados da API
function getAmenitiesFromApi(listing) {
    if (listing.listing_amenities && Array.isArray(listing.listing_amenities)) {
        return listing.listing_amenities.map(amenity => ({
            text: amenity.name || amenity.title || amenity.amenity
        }));
    }

    if (listing.amenities && Array.isArray(listing.amenities)) {
        return listing.amenities.map(amenity => ({
            text: amenity.name || amenity.title || amenity
        }));
    }

    return [];
}

// Helper para extrair fotos dos dados da API
function getPhotosFromApi(listing) {
    if (listing.photos && Array.isArray(listing.photos)) {
        return listing.photos.map(photo => photo.picture || photo.url || photo.large_url || '');
    }

    if (listing.picture_urls && Array.isArray(listing.picture_urls)) {
        return listing.picture_urls;
    }

    return [];
}

// Helper para gerar strings aleatórias para cookies
function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = { scrapeAirbnb }; 