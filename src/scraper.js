// Configuração principal do scraper
let puppeteer;
let chrome;

// Verificar se estamos no ambiente Render
const isRenderEnvironment = process.env.RENDER === 'true';

try {
    // No ambiente Render, use diretamente o puppeteer padrão
    if (isRenderEnvironment) {
        console.log('Ambiente Render detectado, usando puppeteer padrão');
        puppeteer = require('puppeteer');
        chrome = { args: [], headless: true }; // Objeto fictício para compatibilidade
    } else {
        // Em ambiente local, tente usar puppeteer-core (mais leve)
        puppeteer = require('puppeteer-core');
        console.log('Usando puppeteer-core');

        // Carregar @sparticuz/chromium para ambientes serverless
        try {
            chrome = require('@sparticuz/chromium');
            console.log('Usando @sparticuz/chromium para ambientes serverless');
        } catch (chromeError) {
            console.warn('Erro ao carregar @sparticuz/chromium:', chromeError.message);
            chrome = { args: [], headless: true }; // Fornecer um objeto padrão
        }
    }
} catch (puppeteerCoreError) {
    // Fallback para puppeteer padrão
    console.warn('Erro ao carregar puppeteer-core, utilizando puppeteer padrão:', puppeteerCoreError.message);
    puppeteer = require('puppeteer');
    console.log('Usando puppeteer padrão');
    chrome = { args: [], headless: true }; // Fornecer um objeto padrão
}

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Configuração dos diretórios para o Puppeteer
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '..', '.cache', 'puppeteer');

// Configuração para o Chrome no ambiente serverless
if (chrome) {
    chrome.headless = true;
    if (typeof chrome.setGraphicsMode === 'function') {
        chrome.setGraphicsMode(false);
    } else {
        chrome.setGraphicsMode = false;
    }
}

// Helper function for timeout that works regardless of Puppeteer version
const safeWaitForTimeout = async (page, timeout) => {
    if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(timeout);
    } else {
        // Fallback if waitForTimeout is not available
        await new Promise(resolve => setTimeout(resolve, timeout));
    }
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

// Função para obter o caminho do Chrome como string
async function getChromeExecutablePath() {
    if (!chrome) return null;

    try {
        if (typeof chrome.executablePath === 'function') {
            return await chrome.executablePath();
        } else if (typeof chrome.executablePath === 'string') {
            return chrome.executablePath;
        } else {
            console.warn('chrome.executablePath não é um tipo válido (nem função, nem string):', typeof chrome.executablePath);
            return null;
        }
    } catch (error) {
        console.error('Erro ao obter o caminho executável do Chrome:', error);
        return null;
    }
}

// Função para garantir que o Chrome está instalado
async function ensureChrome() {
    try {
        console.log('Verificando configurações do Puppeteer...');
        console.log(`PUPPETEER_CACHE_DIR: ${PUPPETEER_CACHE_DIR}`);

        // Garantir que o diretório de cache existe
        if (!fs.existsSync(PUPPETEER_CACHE_DIR)) {
            console.log(`Criando diretório de cache: ${PUPPETEER_CACHE_DIR}`);
            fs.mkdirSync(PUPPETEER_CACHE_DIR, { recursive: true });
        }

        // Definir variável de ambiente para o Puppeteer
        process.env.PUPPETEER_CACHE_DIR = PUPPETEER_CACHE_DIR;

        // Obter o caminho do executável
        console.log('Obtendo caminho do Chrome...');
        try {
            // Usar a função helper para obter o caminho como string
            const execPath = await getChromeExecutablePath();

            if (!execPath) {
                console.log('Caminho do executável não disponível, usando padrão de puppeteer');
                return null;
            }

            console.log('Caminho do executável Chrome:', execPath);

            // Verificar se o diretório do executável existe
            const execDir = path.dirname(execPath);
            if (!fs.existsSync(execDir)) {
                console.log(`Criando diretório para o Chrome: ${execDir}`);
                fs.mkdirSync(execDir, { recursive: true });
            }

            // Configurar a variável de ambiente PUPPETEER_EXECUTABLE_PATH
            process.env.PUPPETEER_EXECUTABLE_PATH = execPath;

            return execPath;
        } catch (execPathError) {
            console.error('Erro ao obter caminho do executável:', execPathError);
            // Fallback para o caminho padrão em produção na Render
            if (process.env.RENDER) {
                const defaultPath = '/usr/bin/google-chrome-stable';
                console.log(`Usando caminho padrão do Chrome: ${defaultPath}`);
                return defaultPath;
            }
            return null;
        }
    } catch (error) {
        console.error('Erro ao garantir Chrome:', error);
        return null;
    }
}

// Função principal de scraping
async function scrapeAirbnb(url, step = 1) {
    let browser = null;

    try {
        // Limpar a URL para melhorar as chances de carregamento
        const cleanUrl = cleanAirbnbUrl(url);

        console.log(`Iniciando scraping da URL: ${cleanUrl}, Etapa: ${step}`);

        // Determinar o ambiente (serverless ou local)
        const isServerless = process.env.RENDER || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
        console.log(`Ambiente serverless: ${isServerless ? 'Sim' : 'Não'}`);

        // Configuração específica para o ambiente Render
        if (process.env.RENDER) {
            console.log('Detectado ambiente Render - configurando ambiente específico...');
            // Em vez de usar Chrome pré-instalado (que requer root), usar o Chromium do Puppeteer
            process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = false; // Garantir que o Chromium seja baixado
            console.log('Usando Chromium do Puppeteer no Render');

            // No ambiente Render, usar Puppeteer normal
            console.log('Usando puppeteer normal em vez de puppeteer-core no Render...');
            puppeteer = require('puppeteer');
        }

        // Garantir que o Chrome esteja disponível - mas não lançar erro se falhar
        let executablePath = null;
        try {
            executablePath = await ensureChrome();
            if (executablePath) {
                console.log(`Usando Chrome em: ${executablePath}`);
            } else {
                console.log('Sem caminho do Chrome disponível, vamos usar o Chromium padrão do Puppeteer');
            }
        } catch (execError) {
            console.warn('Falha ao obter caminho do Chrome:', execError);
            console.log('Tentando usar o Chrome do puppeteer padrão...');
        }

        // Argumentos compartilhados para o puppeteer
        const browserArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-first-run',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling',
            '--disable-ipc-flooding-protection'
        ];

        try {
            console.log('Inicializando navegador...');

            // Configuração de lançamento do browser
            const launchOptions = {
                args: browserArgs,
                headless: 'new',
                ignoreHTTPSErrors: true
            };

            // Adicionar args do chrome se disponíveis
            if (chrome && chrome.args && Array.isArray(chrome.args)) {
                launchOptions.args = [...chrome.args, ...browserArgs];
            }

            // Adicionar executablePath apenas se for uma string válida
            if (executablePath && typeof executablePath === 'string') {
                launchOptions.executablePath = executablePath;
                console.log(`Configurando Chrome com caminho executável: ${executablePath}`);
            } else {
                console.log('Usando Chrome bundled com Puppeteer');
            }

            // No Render, sempre usar puppeteer (não puppeteer-core)
            if (process.env.RENDER) {
                console.log('Ambiente Render: usando puppeteer padrão');
                browser = await puppeteer.launch(launchOptions);
            } else {
                // Em outros ambientes
                browser = await puppeteer.launch(launchOptions);
            }
        } catch (chromeError) {
            console.error('Erro ao inicializar browser:', chromeError);

            // Tentar com puppeteer padrão como fallback final
            console.log('Tentando inicializar com puppeteer padrão como fallback final...');
            try {
                const puppeteerFallback = require('puppeteer');
                browser = await puppeteerFallback.launch({
                    args: browserArgs,
                    headless: 'new',
                    ignoreHTTPSErrors: true
                });
            } catch (fallbackError) {
                console.error('Erro ao inicializar com puppeteer padrão:', fallbackError);
                throw new Error(`Falha ao inicializar qualquer browser: ${chromeError.message} / ${fallbackError.message}`);
            }
        }

        console.log('Browser iniciado com sucesso');

        const page = await browser.newPage();

        // Aumentar o timeout para navegação
        await page.setDefaultNavigationTimeout(120000); // 2 minutos

        // Configurar viewport com tamanho grande para garantir que imagens lazy-loaded sejam carregadas
        await page.setViewport({ width: 1920, height: 1080 });

        // User agent moderno para evitar detecção
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Adicionar extra headers para evitar detecção
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'sec-ch-ua': '"Chromium";v="121", "Google Chrome";v="121", "Not=A?Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"'
        });

        // Interceptar requisições de imagem para melhorar performance
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if ((resourceType === 'image' || resourceType === 'font' || resourceType === 'media' || resourceType === 'stylesheet') && step !== 4) {
                // Bloquear mais recursos para melhorar performance, exceto na etapa de fotos
                req.abort();
            } else {
                req.continue();
            }
        });

        // Definir um timeout para a navegação
        const navigationPromise = new Promise(async (resolve, reject) => {
            try {
                console.log('Acessando a página...');
                // Usar o domainBypassCookies para ajudar com problemas de bloqueio do Cloudflare
                await page.goto(cleanUrl, {
                    waitUntil: 'networkidle2', // Aguardar até que a rede esteja quase inativa
                    timeout: 100000 // 100 segundos específicos para esta operação
                });
                console.log('Conteúdo DOM inicial carregado, aguardando mais recursos...');

                // Aguardar pelo conteúdo dinâmico ser carregado
                try {
                    // Tentar aguardar pelo título do anúncio (elemento sempre presente)
                    await page.waitForSelector('h1', { timeout: 10000 });
                    console.log('Título da página detectado');
                } catch (err) {
                    console.warn('Timeout ao aguardar pelo título, continuando mesmo assim...');
                }

                // Aguardar mais um pouco para renderização completa
                await safeWaitForTimeout(page, 8000);

                console.log('Página carregada, extraindo dados...');
                resolve();
            } catch (e) {
                reject(e);
            }
        });

        // Definir um timeout absoluto
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ao carregar a página')), 110000)
        );

        // Esperar pela navegação com timeout
        await Promise.race([navigationPromise, timeoutPromise]);

        let result = {
            status: 'partial',
            data: {},
            step: step,
            totalSteps: 4
        };

        // ETAPA 1: Título do imóvel, descrição e tipo de imóvel
        if (step === 1) {
            console.log('Executando Etapa 1: Título, descrição e tipo de imóvel');

            // Extrair dados básicos com múltiplos seletores para maior compatibilidade
            const basicInfoData = await page.evaluate(() => {
                // Título - tentar diferentes seletores
                let title = '';
                const titleSelectors = [
                    'h1',
                    '[data-section-id="TITLE_DEFAULT"] h1',
                    '[data-plugin-in-point-id="TITLE_DEFAULT"] h1',
                    // Novos seletores para a estrutura atualizada do Airbnb
                    'div._gfomxi > div > h1',
                    'div[data-testid="pdp-title"] h1',
                    'div.t1jojoys'
                ];

                for (const selector of titleSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        title = element.textContent.trim();
                        break;
                    }
                }

                // Descrição - tentar diferentes seletores
                let description = '';
                const descSelectors = [
                    '[data-section-id="DESCRIPTION_DEFAULT"]',
                    '[data-plugin-in-point-id="DESCRIPTION_DEFAULT"]',
                    '[aria-labelledby="listing-title-descriptor"]',
                    // Novos seletores para a estrutura atualizada
                    'div[data-testid="pdp-description"]',
                    'div._1xib9j0i', // Novo seletor de descrição do Airbnb 2024
                    'div.h1vnndll',  // Container de descrição alternativo
                    'section[aria-label="Descrição"] span', // Descrição dentro de uma seção
                    'div[data-section-id="DESCRIPTION_MODALLESS"] div' // Novo formato de container de descrição
                ];

                for (const selector of descSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        // Tentar extrair o texto de cada elemento encontrado
                        for (const element of elements) {
                            const text = element.textContent.trim();
                            // Verificar se o texto parece uma descrição válida (mais de 20 caracteres)
                            if (text && text.length > 20 && !text.includes('Mostrar mais') && !text.includes('Show more')) {
                                description = text;
                                break;
                            }
                        }
                        if (description) break;
                    }
                }

                // Método alternativo: capturar qualquer div grande com texto que pareça uma descrição
                if (!description) {
                    const allDivs = document.querySelectorAll('div');
                    for (const div of allDivs) {
                        const text = div.textContent.trim();
                        // Verificar se o texto parece ser uma descrição válida (mais de 50 caracteres)
                        // e não é um menu ou outro elemento não relevante
                        if (text && text.length > 50 &&
                            !text.includes('Mostrar mais') && !text.includes('Show more') &&
                            !text.includes('Menu') && !text.includes('Log in') &&
                            !div.querySelector('button')) {
                            description = text;
                            break;
                        }
                    }
                }

                // Capturar o endereço (novo)
                let address = '';
                const addressSelectors = [
                    'div._ylefn59', // Seletor de endereço no Airbnb 2024
                    'div.t17lg2d1', // Container de localização alternativo
                    'a[href*="maps"]', // Links para mapas costumam ter o endereço ou parte dele
                    'div[data-section-id="LOCATION_DEFAULT"]', // Container de localização padrão
                    'div[data-testid="pdp-location"]' // Novo teste ID para localização
                ];

                for (const selector of addressSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        for (const element of elements) {
                            const text = element.textContent.trim();
                            // Verificar se o texto parece um endereço (tem palavras como "rua", "avenida", "bairro", etc)
                            const addressKeywords = ["rua", "avenida", "av.", "r.", "bairro", "cidade", "estado", "apartamento", "localizado"];
                            const hasAddressKeyword = addressKeywords.some(keyword => text.toLowerCase().includes(keyword));

                            if (text && (hasAddressKeyword || text.includes(","))) {
                                address = text;
                                break;
                            }
                        }
                        if (address) break;
                    }
                }

                // Tipo de imóvel (extraído do título ou da descrição)
                let type = '';
                const typeKeywords = {
                    'apartamento': ['apartamento', 'apto', 'flat', 'loft', 'condomínio', 'condominio'],
                    'casa': ['casa', 'chácara', 'sítio', 'fazenda', 'rancho', 'moradia'],
                    'chalé': ['chalé', 'chale', 'cabana', 'cabin', 'chalés'],
                    'quarto': ['quarto', 'suíte', 'suite', 'room', 'bedroom'],
                    'hotel': ['hotel', 'pousada', 'hostel', 'inn', 'resort']
                };

                const lowerTitle = title.toLowerCase();
                const lowerDesc = description.toLowerCase();

                for (const [propertyType, keywords] of Object.entries(typeKeywords)) {
                    for (const keyword of keywords) {
                        if (lowerTitle.includes(keyword) || lowerDesc.includes(keyword)) {
                            type = propertyType;
                            break;
                        }
                    }
                    if (type) break;
                }

                // Se não encontrar um tipo específico, usar "Outro"
                if (!type) {
                    type = 'outro';
                }

                return { title, description, type, address };
            });

            result.data = basicInfoData;
            result.status = 'success'; // Mudado para success para indicar conclusão bem-sucedida
            result.message = 'Informações básicas extraídas com sucesso';
        }

        // ETAPA 2: Preço por noite, quartos, banheiros, camas, hóspedes
        else if (step === 2) {
            console.log('Executando Etapa 2: Preço e capacidade');

            const priceAndCapacityData = await page.evaluate(() => {
                // Função para tratar corretamente preços no formato brasileiro
                const cleanBrazilianPrice = (priceText) => {
                    // Remover tudo que não for número, ponto ou vírgula
                    let cleaned = priceText.replace(/[^0-9,.]/g, '');

                    // Verificar se parece ser um preço no formato brasileiro com separador de milhares
                    if (cleaned.includes('.') && !cleaned.includes(',')) {
                        // Formato R$ 1.048 (sem centavos) - interpretar como 1048
                        cleaned = cleaned.replace(/\./g, '');
                        return parseFloat(cleaned);
                    } else if (cleaned.includes(',') && cleaned.indexOf(',') === cleaned.length - 3) {
                        // Formato R$ 1.048,00 - interpretar como 1048.00
                        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
                        return parseFloat(cleaned);
                    } else if (cleaned.includes(',')) {
                        // Outro formato com vírgula - substituir vírgula por ponto
                        cleaned = cleaned.replace(',', '.');
                        return parseFloat(cleaned);
                    }

                    // Se não tiver formatação especial, converter diretamente
                    return parseFloat(cleaned);
                };

                // Preço - tentar diferentes seletores e métodos
                let pricePerNight = 0;
                let totalPrice = 0;

                // Método 1: botão de detalhamento
                const priceButton = document.querySelector('button._194r9nk1');
                if (priceButton) {
                    const priceSpan = priceButton.querySelector('span.u1qzfr7o');
                    if (priceSpan) {
                        const priceText = priceSpan.textContent || '';
                        totalPrice = cleanBrazilianPrice(priceText);
                    }
                }

                // Método 2: element span direto
                if (totalPrice === 0) {
                    const priceSpan = document.querySelector('span.u1qzfr7o');
                    if (priceSpan) {
                        const priceText = priceSpan.textContent || '';
                        totalPrice = cleanBrazilianPrice(priceText);
                    }
                }

                // Método 3: container principal
                if (totalPrice === 0) {
                    const priceContainer = document.querySelector('div._1xm48ww');
                    if (priceContainer) {
                        const priceText = priceContainer.textContent || '';
                        const priceMatch = priceText.match(/R\$\s*([\d.,]+)/);
                        if (priceMatch && priceMatch[1]) {
                            totalPrice = cleanBrazilianPrice(priceMatch[1]);
                        }
                    }
                }

                // Método 4: qualquer seletor que contenha preço
                if (totalPrice === 0) {
                    const priceElements = document.querySelectorAll('[data-testid*="price"]');
                    for (const element of priceElements) {
                        const priceText = element.textContent || '';
                        if (priceText.includes('R$')) {
                            const priceMatch = priceText.match(/R\$\s*([\d.,]+)/);
                            if (priceMatch && priceMatch[1]) {
                                totalPrice = cleanBrazilianPrice(priceMatch[1]);
                                break;
                            }
                        }
                    }
                }

                // Extrair capacidade (quartos, banheiros, hóspedes)
                const capacityContainer = document.querySelector('div._gfomxi > div > h1');
                let rooms = 0;
                let bathrooms = 0;
                let beds = 0;
                let guests = 0;

                // Tentar extrair da seção de capacidade com diferentes abordagens
                // Método 1: Usando o container original
                if (capacityContainer) {
                    const capacityText = capacityContainer.parentElement.textContent || '';

                    // Quartos
                    const roomMatch = capacityText.match(/(\d+)\s*quarto/i);
                    if (roomMatch) rooms = parseInt(roomMatch[1]);

                    // Banheiros
                    const bathroomMatch = capacityText.match(/(\d+)\s*banheiro/i);
                    if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1]);

                    // Camas
                    const bedMatch = capacityText.match(/(\d+)\s*cama/i);
                    if (bedMatch) beds = parseInt(bedMatch[1]);

                    // Hóspedes
                    const guestMatch = capacityText.match(/(\d+)\s*hóspede/i);
                    if (guestMatch) guests = parseInt(guestMatch[1]);
                }

                // Método 2: Buscar por qualquer texto que tenha essas informações
                if (rooms === 0 || bathrooms === 0 || beds === 0 || guests === 0) {
                    // Pegar todo o texto da página
                    const pageText = document.body.textContent || '';

                    // Se ainda não temos quartos, buscar
                    if (rooms === 0) {
                        const roomMatch = pageText.match(/(\d+)\s*quarto/i);
                        if (roomMatch) rooms = parseInt(roomMatch[1]);
                    }

                    // Se ainda não temos banheiros, buscar
                    if (bathrooms === 0) {
                        const bathroomMatch = pageText.match(/(\d+)\s*banheiro/i);
                        if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1]);
                    }

                    // Se ainda não temos camas, buscar
                    if (beds === 0) {
                        const bedMatch = pageText.match(/(\d+)\s*cama/i);
                        if (bedMatch) beds = parseInt(bedMatch[1]);
                    }

                    // Se ainda não temos hóspedes, buscar
                    if (guests === 0) {
                        const guestMatch = pageText.match(/(\d+)\s*hóspede/i);
                        if (guestMatch) guests = parseInt(guestMatch[1]);
                    }
                }

                // Garantir que temos pelo menos valores mínimos
                rooms = rooms || 1;
                bathrooms = bathrooms || 1;
                beds = beds || 1;
                guests = guests || 2;

                return {
                    price: totalPrice,
                    rooms,
                    bathrooms,
                    beds,
                    guests
                };
            });

            result.data = priceAndCapacityData;
            result.status = 'success';
            result.message = 'Informações de preço e capacidade extraídas com sucesso';
        }

        // ETAPA 3: Comodidades
        else if (step === 3) {
            console.log('Executando Etapa 3: Comodidades');

            // Aumentar o tempo de espera
            await safeWaitForTimeout(page, 2000);

            const amenitiesData = await page.evaluate(() => {
                const amenities = [];
                let amenitiesWithIcons = [];

                // Método 1: Procurar na seção de comodidades padrão
                const amenitySection = document.querySelector('[data-section-id="AMENITIES_DEFAULT"]');
                if (amenitySection) {
                    console.log("Encontrada seção de comodidades padrão");
                    // Obter todos os items de comodidades
                    const amenityItems = amenitySection.querySelectorAll('div._19xnuo97');
                    amenityItems.forEach(item => {
                        const text = item.textContent.trim();
                        if (text && !text.includes('Mostrar todas')) {
                            amenities.push({ text });
                        }
                    });
                }

                // Método 2: Novos seletores para 2024
                if (amenities.length === 0) {
                    // Novos seletores para listas de comodidades
                    const newAmenitySelectors = [
                        'div[data-testid="amenities-section"] div',
                        'div[data-section-id="AMENITIES_MODALLESS"] div',
                        'div._8xfrhj',
                        'div.t1e04h6m',
                        'div._1byskwn'
                    ];

                    for (const selector of newAmenitySelectors) {
                        const items = document.querySelectorAll(selector);
                        if (items.length > 0) {
                            console.log(`Encontrados ${items.length} itens com seletor ${selector}`);

                            items.forEach(item => {
                                const text = item.textContent.trim();
                                // Filtrar textos relevantes
                                if (text && text.length > 3 &&
                                    !text.includes('Mostrar todas') &&
                                    !text.includes('O que este lugar oferece') &&
                                    !text.includes('mostrar todos') &&
                                    !text.includes('amenities') &&
                                    !text.includes('available')) {

                                    // Verificar se tem ícone (pode indicar que é uma comodidade)
                                    const hasIcon = item.querySelector('svg') !== null;

                                    if (hasIcon) {
                                        amenitiesWithIcons.push(text);
                                    }

                                    amenities.push({ text });
                                }
                            });

                            if (amenities.length > 0) break;
                        }
                    }
                }

                // Método 3: Tentar com outros seletores se os anteriores falharem
                if (amenities.length === 0) {
                    // Tentar encontrar a seção por texto
                    const allDivs = document.querySelectorAll('div');
                    for (const div of allDivs) {
                        if (div.textContent.includes('O que este lugar oferece') ||
                            div.textContent.includes('What this place offers') ||
                            div.textContent.includes('Comodidades') ||
                            div.textContent.includes('Amenities')) {
                            console.log("Encontrada seção de comodidades pelo texto");

                            // Encontramos a seção, procurar elementos filhos
                            const parent = div.parentElement;
                            const amenityContainers = parent.querySelectorAll('div');

                            for (const container of amenityContainers) {
                                const text = container.textContent.trim();
                                // Filtrar textos relevantes (remover botões e títulos)
                                if (text &&
                                    text.length > 3 &&
                                    !text.includes('Mostrar todas') &&
                                    !text.includes('Show all') &&
                                    !text.includes('O que este lugar oferece') &&
                                    !text.includes('What this place offers') &&
                                    !text.includes('Comodidades') &&
                                    !text.includes('Amenities')) {

                                    // Verificar se tem ícone
                                    const hasIcon = container.querySelector('svg') !== null;

                                    if (hasIcon) {
                                        amenitiesWithIcons.push(text);
                                    }

                                    amenities.push({ text });
                                }
                            }

                            if (amenities.length > 0) break;
                        }
                    }
                }

                // Nova abordagem: pegar qualquer div que tenha um ícone SVG como filho
                if (amenities.length === 0) {
                    const svgContainers = document.querySelectorAll('div:has(svg)');
                    svgContainers.forEach(container => {
                        const text = container.textContent.trim();
                        if (text &&
                            text.length > 3 &&
                            text.length < 50 &&
                            !text.includes('Mostrar') &&
                            !text.includes('Show') &&
                            !text.includes('Menu')) {

                            amenitiesWithIcons.push(text);
                            amenities.push({ text });
                        }
                    });
                }

                // Remover possíveis duplicatas
                const uniqueAmenities = [...new Set(amenities.map(item => item.text))].map(text => ({ text }));
                const uniqueAmenitiesWithIcons = [...new Set(amenitiesWithIcons)];

                return {
                    amenities: uniqueAmenities,
                    amenitiesWithIcons: uniqueAmenitiesWithIcons
                };
            });

            result.data = amenitiesData;
            result.status = 'success';
            result.message = 'Comodidades extraídas com sucesso';
        }

        // ETAPA 4: Fotos do imóvel
        else if (step === 4) {
            console.log('Executando Etapa 4: Fotos do imóvel');

            try {
                // Remover o event listener de interceptação para evitar problemas
                await page.setRequestInterception(false);

                // Recarregar a página para obter as imagens
                await page.goto(cleanUrl, { waitUntil: 'networkidle2' });

                // Dar tempo para a página carregar
                await safeWaitForTimeout(page, 8000);

                // Extrair URLs de imagem diretamente do DOM
                const pagePicturesData = await page.evaluate(() => {
                    const pictures = [];

                    // Novos seletores para imagens no Airbnb 2024
                    const imageContainerSelectors = [
                        'div[data-testid="pdp-images"]',
                        'div[data-section-id="PHOTOS_DEFAULT"]',
                        'div._bb78gu4', // Nova classe de container de imagens
                        'div._vd6w38n', // Outra classe de imagem
                        'div._skzmth'   // Container de fotos alternativo
                    ];

                    // Tentar encontrar containers de imagens específicos primeiro
                    for (const selector of imageContainerSelectors) {
                        const container = document.querySelector(selector);
                        if (container) {
                            console.log(`Encontrado container de imagens com seletor ${selector}`);
                            // Procurar tags de imagem dentro deste container
                            const imgElements = container.querySelectorAll('img');
                            imgElements.forEach(img => {
                                const src = img.src || '';
                                // Verificar se é uma URL válida e não é um ícone
                                if (src && src.includes('http') && !src.includes('icon') && img.width > 200) {
                                    pictures.push(src);
                                }
                                // Verificar também o atributo data-original-uri que o Airbnb às vezes usa
                                const originalSrc = img.getAttribute('data-original-uri');
                                if (originalSrc && originalSrc.includes('http')) {
                                    pictures.push(originalSrc);
                                }
                            });

                            if (pictures.length > 0) break;
                        }
                    }

                    // Se não encontrou imagens nos containers específicos, procurar todas as imagens
                    if (pictures.length === 0) {
                        // Procurar tags de imagem com atributos relevantes
                        const imgElements = document.querySelectorAll('img');
                        imgElements.forEach(img => {
                            // Procurar atributos que podem conter a URL da imagem
                            const possibleSrcs = [
                                img.src,
                                img.getAttribute('data-original-uri'),
                                img.getAttribute('data-src'),
                                img.getAttribute('srcset')?.split(' ')[0]
                            ].filter(Boolean);

                            for (const src of possibleSrcs) {
                                if (src &&
                                    src.includes('http') &&
                                    (src.includes('picture') || src.includes('photo') || src.includes('image') || src.includes('airbnb')) &&
                                    !src.includes('icon') &&
                                    !src.includes('small') &&
                                    !src.includes('thumb') &&
                                    !src.includes('profile') &&
                                    img.width > 200) {
                                    pictures.push(src);
                                }
                            }
                        });
                    }

                    // Procurar divs de background com estilos inline contendo url()
                    const allElements = document.querySelectorAll('div[style*="background"]');
                    allElements.forEach(div => {
                        const style = div.getAttribute('style') || '';
                        const matches = style.match(/url\(['"]?(.*?)['"]?\)/g);
                        if (matches) {
                            for (const match of matches) {
                                const url = match.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
                                if (url &&
                                    url.includes('http') &&
                                    (url.includes('picture') || url.includes('photo') || url.includes('image') || url.includes('airbnb')) &&
                                    !url.includes('icon') &&
                                    !url.includes('small') &&
                                    !url.includes('thumb')) {
                                    pictures.push(url);
                                }
                            }
                        }
                    });

                    // Buscar também em atributos 'srcset', que o Airbnb usa para imagens responsivas
                    const elementsWithSrcset = document.querySelectorAll('[srcset]');
                    elementsWithSrcset.forEach(element => {
                        const srcset = element.getAttribute('srcset') || '';
                        // Pegar a primeira URL do srcset (geralmente a maior resolução)
                        const firstUrl = srcset.split(',')[0]?.split(' ')[0];
                        if (firstUrl && firstUrl.includes('http') && !firstUrl.includes('icon')) {
                            pictures.push(firstUrl);
                        }
                    });

                    return pictures;
                });

                // Remover duplicatas e filtrar imagens
                const uniquePhotos = [...new Set(pagePicturesData)].filter(url => {
                    // Remover imagens de perfil, ícones e outros recursos indesejados
                    return !url.includes('profile') &&
                        !url.includes('user') &&
                        !url.includes('icon') &&
                        !url.includes('avatar') &&
                        !url.includes('logo') &&
                        url.length > 20;
                });

                result.data = { photos: uniquePhotos };
                result.status = 'success';
                result.message = `Fotos extraídas com sucesso: ${uniquePhotos.length} imagens encontradas`;
            } catch (photoError) {
                console.error('Erro ao extrair fotos:', photoError);
                result.status = 'error';
                result.message = `Erro ao extrair fotos: ${photoError.message}`;
                result.data = { photos: [] }; // Array vazio como fallback
                // Não relançar o erro para permitir que o processamento continue
            }
        }

        return result;
    } catch (error) {
        console.error('Erro durante o scraping:', error);

        // Retornar um resultado parcial com informação de erro
        return {
            status: 'error',
            step: step,
            totalSteps: 4,
            message: error.message || 'Erro desconhecido durante o scraping',
            error: error.toString(),
            data: {} // Dados vazios em caso de erro
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

module.exports = { scrapeAirbnb }; 