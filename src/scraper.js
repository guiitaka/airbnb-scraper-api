// Usar puppeteer-core com @sparticuz/chromium para ambientes serverless
const puppeteer = require('puppeteer-core');
const chrome = require('@sparticuz/chromium');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Definir pasta de cache para o Chromium
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache';

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

// Função principal de scraping
async function scrapeAirbnb(url, step = 1) {
    let browser = null;

    try {
        // Limpar a URL para melhorar as chances de carregamento
        const cleanUrl = cleanAirbnbUrl(url);

        console.log(`Iniciando scraping da URL: ${cleanUrl}, Etapa: ${step}`);
        console.log(`Usando pasta de cache: ${PUPPETEER_CACHE_DIR}`);

        // Configuração específica para ambientes serverless (como Render, Vercel, etc)
        const isServerless = process.env.RENDER || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
        console.log(`Ambiente serverless detectado: ${isServerless ? 'Sim' : 'Não'}`);

        // Opções padrão para o puppeteer
        const launchOptions = {
            headless: true,
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
            ignoreHTTPSErrors: true
        };

        if (isServerless) {
            console.log('Usando configuração especial para ambiente serverless');

            // Configuração especial para @sparticuz/chromium em ambiente serverless
            try {
                // Forçar o download do Chromium na inicialização
                chrome.setHeadlessMode = true;
                chrome.setGraphicsMode = false;

                // Pré-baixar o Chromium para garantir que esteja disponível
                await chrome.font();

                const executablePath = await chrome.executablePath;
                console.log(`Caminho do executável do Chromium: ${executablePath}`);

                // Verificar se o executável realmente existe
                if (fs.existsSync(executablePath)) {
                    console.log('Chromium encontrado no caminho especificado.');
                } else {
                    console.log(`Chromium NÃO encontrado em ${executablePath}. Tentando método alternativo...`);

                    // Tentar baixar manualmente se necessário
                    await chrome.ensureChromium();
                }

                // Configurar as opções de lançamento para o ambiente serverless
                browser = await puppeteer.launch({
                    args: [...chrome.args, ...launchOptions.args],
                    executablePath: await chrome.executablePath,
                    headless: chrome.headless,
                    ignoreHTTPSErrors: true
                });

            } catch (chromeError) {
                console.error('Erro ao configurar Chromium serverless:', chromeError);

                // Fallback para Puppeteer regular
                console.log('Tentando fallback para puppeteer normal');
                const puppeteerRegular = require('puppeteer');
                browser = await puppeteerRegular.launch(launchOptions);
            }
        } else {
            // Em ambiente local, usar puppeteer regular
            console.log('Usando puppeteer em ambiente local');
            const puppeteerRegular = require('puppeteer');

            // Adicionar opções adicionais para ambiente local
            const localOptions = {
                ...launchOptions,
                userDataDir: PUPPETEER_CACHE_DIR
            };

            browser = await puppeteerRegular.launch(localOptions);
        }

        console.log('Browser iniciado com sucesso');

        const page = await browser.newPage();

        // Aumentar o timeout para navegação
        await page.setDefaultNavigationTimeout(120000); // 2 minutos

        // Configurar viewport com tamanho grande para garantir que imagens lazy-loaded sejam carregadas
        await page.setViewport({ width: 1920, height: 1080 });

        // User agent moderno para evitar detecção
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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
                    waitUntil: 'domcontentloaded', // Mudar para um método mais rápido de carregamento
                    timeout: 100000 // 100 segundos específicos para esta operação
                });
                console.log('Conteúdo DOM inicial carregado, aguardando mais recursos...');

                // Esperar um pouco mais para scripts terminarem de carregar
                await safeWaitForTimeout(page, 5000);

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
                const titleSelectors = ['h1', '[data-section-id="TITLE_DEFAULT"] h1', '[data-plugin-in-point-id="TITLE_DEFAULT"] h1'];
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
                    '[aria-labelledby="listing-title-descriptor"]'
                ];

                for (const selector of descSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        description = element.textContent.trim();
                        break;
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

                return { title, description, type };
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

                // Método 1: Procurar na seção de comodidades padrão
                const amenitySection = document.querySelector('[data-section-id="AMENITIES_DEFAULT"]');
                if (amenitySection) {
                    // Obter todos os items de comodidades
                    const amenityItems = amenitySection.querySelectorAll('div._19xnuo97');
                    amenityItems.forEach(item => {
                        const text = item.textContent.trim();
                        if (text && !text.includes('Mostrar todas')) {
                            amenities.push({ text });
                        }
                    });
                }

                // Método 2: Tentar com outros seletores se o primeiro falhar
                if (amenities.length === 0) {
                    // Tentar encontrar a seção por texto
                    const allDivs = document.querySelectorAll('div');
                    for (const div of allDivs) {
                        if (div.textContent.includes('O que este lugar oferece') ||
                            div.textContent.includes('What this place offers')) {
                            // Encontramos a seção, procurar elementos filhos
                            const amenityContainers = div.querySelectorAll('div > div');
                            for (const container of amenityContainers) {
                                const text = container.textContent.trim();
                                // Filtrar textos relevantes (remover botões e títulos)
                                if (text &&
                                    !text.includes('Mostrar todas') &&
                                    !text.includes('O que este lugar oferece') &&
                                    !text.includes('What this place offers')) {
                                    amenities.push({ text });
                                }
                            }
                            break; // Encontrou a seção, parar de procurar
                        }
                    }
                }

                return { amenities };
            });

            result.data = amenitiesData;
            result.status = 'success';
            result.message = 'Comodidades extraídas com sucesso';
        }

        // ETAPA 4: Fotos do imóvel
        else if (step === 4) {
            console.log('Executando Etapa 4: Fotos do imóvel');

            // Configurar para permitir imagens
            await page.setRequestInterception(false);

            // Recarregar a página para obter as imagens
            await page.goto(cleanUrl, { waitUntil: 'networkidle0' });

            // Dar tempo para a página carregar
            await safeWaitForTimeout(page, 5000);

            const imageUrls = new Set();

            // Método 1: Registrar as imagens que estão sendo carregadas
            page.on('response', async (response) => {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';

                if (contentType.includes('image/')) {
                    try {
                        const urlObj = new URL(url);

                        // Ignorar ícones e imagens pequenas
                        if (url.includes('icon') || url.includes('small')) {
                            return;
                        }

                        // Para imagens do Airbnb, manter apenas as de alta qualidade
                        if ((urlObj.hostname.includes('airbnb') || urlObj.hostname.includes('muscache')) &&
                            (url.includes('picture') || url.includes('photo') || url.includes('image'))) {
                            imageUrls.add(url);
                        }
                    } catch (e) {
                        // Erro ao processar URL
                    }
                }
            });

            // Método 2: Extrair URLs de imagem diretamente do DOM
            const pagePicturesData = await page.evaluate(() => {
                const pictures = [];

                // Procurar tags de imagem com atributos relevantes
                const imgElements = document.querySelectorAll('img');
                imgElements.forEach(img => {
                    const src = img.src || '';
                    if (src &&
                        (src.includes('picture') || src.includes('photo') || src.includes('image')) &&
                        !src.includes('icon') &&
                        !src.includes('small') &&
                        !src.includes('profile') &&
                        img.width > 200) { // Filtrar imagens pequenas
                        pictures.push(src);
                    }
                });

                // Procurar divs de background com estilos inline contendo url()
                const allElements = document.querySelectorAll('div[style*="background"]');
                allElements.forEach(div => {
                    const style = div.getAttribute('style') || '';
                    const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                    if (match && match[1]) {
                        const url = match[1];
                        if (url &&
                            (url.includes('picture') || url.includes('photo') || url.includes('image')) &&
                            !url.includes('icon') &&
                            !url.includes('small')) {
                            pictures.push(url);
                        }
                    }
                });

                return pictures;
            });

            // Aguardar mais um pouco para garantir que as respostas de imagem sejam capturadas
            await safeWaitForTimeout(page, 3000);

            // Combinar os dois métodos de extração de imagens
            const photos = Array.from(imageUrls);

            // Adicionar as imagens encontradas no DOM
            pagePicturesData.forEach(url => {
                if (!photos.includes(url)) {
                    photos.push(url);
                }
            });

            // Remover duplicatas e filtrar imagens
            const uniquePhotos = [...new Set(photos)].filter(url => {
                // Remover imagens de perfil, ícones e outros recursos indesejados
                return !url.includes('profile') &&
                    !url.includes('user') &&
                    !url.includes('icon') &&
                    url.length > 20;
            });

            result.data = { photos: uniquePhotos };
            result.status = 'success';
            result.message = `Fotos extraídas com sucesso: ${uniquePhotos.length} imagens encontradas`;
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