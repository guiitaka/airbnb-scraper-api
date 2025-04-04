// Simplified scraper implementation 
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

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

// Implementação real do scraping para o Render.com
async function scrapeAirbnb(url, step = 1) {
    let browser = null;

    try {
        // Limpar a URL
        const cleanUrl = cleanAirbnbUrl(url);
        console.log(`URL limpa: ${cleanUrl}`);

        console.log(`Iniciando scraping da URL: ${cleanUrl}, Etapa: ${step}`);

        // Iniciar o browser com configurações para o Render.com
        const launchOptions = {
            args: [
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
            ],
            headless: true,
            ignoreHTTPSErrors: true
        };

        // Log para debug
        console.log('Opções de lançamento do browser:', JSON.stringify(launchOptions));

        browser = await puppeteer.launch(launchOptions);

        console.log('Browser iniciado com sucesso');

        const page = await browser.newPage();

        // Configurar timeout e viewport
        await page.setDefaultNavigationTimeout(120000); // 2 minutos
        await page.setViewport({ width: 1920, height: 1080 });

        // User agent moderno para evitar detecção
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Interceptar e bloquear recursos desnecessários
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // Etapa 4 precisa de imagens, outras etapas não
            if ((resourceType === 'image' || resourceType === 'font' || resourceType === 'media' || resourceType === 'stylesheet') && step !== 4) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Definir um timeout para a navegação com promise racing
        const navigationPromise = new Promise(async (resolve, reject) => {
            try {
                console.log('Acessando a página...');
                await page.goto(cleanUrl, {
                    waitUntil: 'domcontentloaded', // Mais rápido que networkidle2
                    timeout: 100000 // 100 segundos específicos para navegação
                });

                console.log('Conteúdo DOM carregado, aguardando scripts...');
                await safeWaitForTimeout(3000);

                console.log('Página carregada, extraindo dados...');
                resolve();
            } catch (e) {
                reject(e);
            }
        });

        // Promise de timeout absoluto
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout absoluto ao carregar a página')), 110000)
        );

        // Corrida entre navegação e timeout
        await Promise.race([navigationPromise, timeoutPromise]);

        // Inicializar resultado
        let result = {
            status: 'success',
            step: step,
            totalSteps: 4,
            message: 'Dados extraídos com sucesso',
            data: {}
        };

        // ETAPA 1: Informações básicas
        if (step === 1) {
            // Extrair dados básicos
            const basicInfoData = await page.evaluate(() => {
                // Título (tentar diferentes seletores)
                let title = '';
                const titleSelectors = ['h1', '[data-section-id="TITLE_DEFAULT"] h1', '[data-plugin-in-point-id="TITLE_DEFAULT"] h1'];
                for (const selector of titleSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        title = element.textContent.trim();
                        break;
                    }
                }

                // Descrição (tentar diferentes seletores)
                let description = '';
                const descSelectors = [
                    '[data-section-id="DESCRIPTION_DEFAULT"]',
                    '[data-plugin-in-point-id="DESCRIPTION_DEFAULT"]',
                    '[aria-labelledby="listing-title-descriptor"]'
                ];

                for (const selector of descSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        description = element.textContent.trim();
                        break;
                    }
                }

                // Tipo de imóvel (extrair do título/descrição)
                let type = 'outro'; // valor padrão

                const typeKeywords = {
                    'apartamento': ['apartamento', 'apto', 'flat', 'loft', 'condomínio', 'condominio'],
                    'casa': ['casa', 'chácara', 'sítio', 'fazenda', 'rancho', 'moradia'],
                    'chalé': ['chalé', 'chale', 'cabana', 'cabin', 'chalés'],
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
                    'button[aria-label*="location"]'
                ];

                for (const selector of addressSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        address = element.textContent.trim();
                        break;
                    }
                }

                return { title, description, type, address };
            });

            result.data = basicInfoData;
        }

        // ETAPA 2: Preço e capacidade
        else if (step === 2) {
            // Lógica para extrair preço e capacidade
            const priceCapacityData = await page.evaluate(() => {
                // Preço
                let price = 0;
                const priceSelectors = [
                    '[data-section-id="BOOK_IT_SIDEBAR"] ._tyxjp1',
                    '[data-section-id="BOOK_IT_SIDEBAR"] span[data-testid="price-element"]',
                    '[data-plugin-in-point-id="BOOK_IT_SIDEBAR"] span[data-testid="price-element"]',
                    'span[data-testid="price-element"]'
                ];

                for (const selector of priceSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const priceText = element.textContent.trim();
                        // Extrair números da string (ex: "R$ 250" -> 250)
                        const priceMatch = priceText.match(/\d+/g);
                        if (priceMatch) {
                            price = parseInt(priceMatch.join(''), 10);
                            break;
                        }
                    }
                }

                // Informações de capacidade
                const capacityData = {
                    rooms: 1,
                    bathrooms: 1,
                    beds: 1,
                    guests: 2
                };

                // Buscar capacidade nos detalhes do imóvel
                const capacitySelectors = [
                    '[data-section-id="OVERVIEW_DEFAULT"] div[data-testid="listing-key-details-space"]',
                    '[data-plugin-in-point-id="OVERVIEW_DEFAULT"] div[data-testid="listing-key-details-space"]',
                    'div[data-testid="listing-key-details-space"]'
                ];

                for (const selector of capacitySelectors) {
                    const elements = document.querySelectorAll(`${selector} > div`);
                    if (elements.length > 0) {
                        elements.forEach(element => {
                            const text = element.textContent.toLowerCase();

                            if (text.includes('quarto') || text.includes('room')) {
                                const match = text.match(/\d+/);
                                if (match) capacityData.rooms = parseInt(match[0], 10);
                            }

                            if (text.includes('banheiro') || text.includes('bathroom')) {
                                const match = text.match(/\d+/);
                                if (match) capacityData.bathrooms = parseInt(match[0], 10);
                            }

                            if (text.includes('cama') || text.includes('bed')) {
                                const match = text.match(/\d+/);
                                if (match) capacityData.beds = parseInt(match[0], 10);
                            }

                            if (text.includes('hóspede') || text.includes('guest')) {
                                const match = text.match(/\d+/);
                                if (match) capacityData.guests = parseInt(match[0], 10);
                            }
                        });
                        break;
                    }
                }

                return { price, ...capacityData };
            });

            result.data = priceCapacityData;
        }

        // ETAPA 3: Comodidades
        else if (step === 3) {
            // Lógica para extrair comodidades do imóvel
            const amenitiesData = await page.evaluate(() => {
                const amenities = [];
                const amenitiesWithIcons = [];

                // Selecionar todos os itens de comodidades
                const amenitySelectors = [
                    '[data-section-id="AMENITIES_DEFAULT"] div[data-testid="amenity-row"]',
                    '[data-plugin-in-point-id="AMENITIES_DEFAULT"] div[data-testid="amenity-row"]',
                    'div[data-testid="amenity-row"]'
                ];

                for (const selector of amenitySelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        elements.forEach(element => {
                            const text = element.textContent.trim();
                            if (text) {
                                amenities.push({ text });
                                amenitiesWithIcons.push(text);
                            }
                        });
                        break;
                    }
                }

                return { amenities, amenitiesWithIcons };
            });

            result.data = amenitiesData;
        }

        // ETAPA 4: Fotos
        else if (step === 4) {
            // Lógica para extrair URLs das fotos
            const photosData = await page.evaluate(() => {
                const photos = [];

                // Buscar por elementos de imagem
                const imageSelectors = [
                    '[data-section-id="HERO_DEFAULT"] img',
                    '[data-plugin-in-point-id="HERO_DEFAULT"] img',
                    '[data-testid="photo-viewer"] img',
                    '[data-testid="photo-carousel"] img'
                ];

                for (const selector of imageSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        elements.forEach(element => {
                            if (element.src && element.src.includes('muscache.com')) {
                                photos.push(element.src);
                            }
                        });
                        break;
                    }
                }

                return { photos };
            });

            result.data = photosData;
        }

        console.log(`Dados extraídos com sucesso para etapa ${step}`);
        return result;

    } catch (error) {
        console.error('Erro durante o scraping:', error);
        return {
            status: 'error',
            step: step,
            totalSteps: 4,
            message: error.message || 'Erro desconhecido',
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

module.exports = { scrapeAirbnb }; 