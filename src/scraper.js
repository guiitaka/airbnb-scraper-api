// Usar puppeteer-extra com plugins
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('chrome-aws-lambda');
const puppeteerCore = require('puppeteer-core');
const { existsSync } = require('fs');
const { join } = require('path');

// Registrar o plugin stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

// Helper function for timeout that works regardless of Puppeteer version
const safeWaitForTimeout = async (page, timeout) => {
    if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(timeout);
    } else {
        // Fallback if waitForTimeout is not available
        await new Promise(resolve => setTimeout(resolve, timeout));
    }
};

// Função para encontrar o executável do Chrome
async function getBrowser() {
    console.log('Ambiente: ' + process.env.NODE_ENV);
    console.log('Iniciando configuração do browser...');

    try {
        let executablePath;
        let args = [
            '--disable-web-security',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update'
        ];

        // Configurações específicas para ambiente de produção (Render.com)
        if (process.env.NODE_ENV === 'production') {
            console.log('Usando configuração para ambiente de produção (Render.com)');

            try {
                console.log('Tentando carregar chrome-aws-lambda...');
                executablePath = await chromium.executablePath;

                if (executablePath) {
                    console.log(`Chrome AWS Lambda encontrado em: ${executablePath}`);
                } else {
                    console.log('Chrome AWS Lambda não retornou um caminho de executável');
                }

                // Usar configurações recomendadas do chrome-aws-lambda
                args = chromium.args;

                return await puppeteerExtra.launch({
                    args,
                    executablePath,
                    headless: chromium.headless,
                    ignoreHTTPSErrors: true,
                    dumpio: true // Adicionar este para logs mais detalhados
                });
            } catch (error) {
                console.error('Erro ao usar chrome-aws-lambda:', error);
            }
        }

        // Fallback para ambiente de desenvolvimento ou se o chrome-aws-lambda falhar
        console.log('Usando configuração para ambiente de desenvolvimento');

        // Caminho padrão do Chrome em diferentes sistemas
        const possiblePaths = [
            // Linux
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            // MacOS
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            // Windows
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            // Render.com path
            '/opt/render/project/.render/chrome/opt/google/chrome/chrome'
        ];

        for (const path of possiblePaths) {
            if (existsSync(path)) {
                console.log(`Usando Chrome do caminho local: ${path}`);
                executablePath = path;
                break;
            }
        }

        if (!executablePath) {
            console.warn('Nenhum Chrome encontrado localmente, tentando usar o padrão do sistema');
        }

        return await puppeteerExtra.launch({
            args,
            executablePath,
            headless: true,
            ignoreHTTPSErrors: true
        });
    } catch (error) {
        console.error('Erro fatal ao inicializar o browser:', error);
        throw new Error(`Não foi possível inicializar o browser: ${error.message}`);
    }
}

// Função principal de scraping
async function scrapeAirbnb(url, step = 1) {
    let browser = null;

    try {
        console.log(`Iniciando scraping da URL: ${url}, Etapa: ${step}`);

        // Obter o browser
        browser = await getBrowser();

        if (!browser) {
            throw new Error('Não foi possível inicializar o browser');
        }

        console.log('Browser iniciado com sucesso');

        const page = await browser.newPage();

        // Timeout para caso a página não carregue
        await page.setDefaultNavigationTimeout(60000);

        // Configurar viewport com tamanho grande para garantir que imagens lazy-loaded sejam carregadas
        await page.setViewport({ width: 1920, height: 1080 });

        // Interceptar requisições de imagem para melhorar performance
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if ((resourceType === 'image' || resourceType === 'font' || resourceType === 'media') && step !== 4) {
                // Permitir requisições de imagem na etapa 4
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log('Acessando a página...');
        await page.goto(url, { waitUntil: 'networkidle2' });
        console.log('Página carregada, extraindo dados...');

        let result = {
            status: 'partial',
            data: {},
            step: step,
            totalSteps: 4
        };

        // ETAPA 1: Título do imóvel, descrição e tipo de imóvel
        if (step === 1) {
            console.log('Executando Etapa 1: Título, descrição e tipo de imóvel');
            const basicInfoData = await page.evaluate(() => {
                // Título
                const title = document.querySelector('h1')?.textContent?.trim() || '';

                // Descrição
                const description = document.querySelector('[data-section-id="DESCRIPTION_DEFAULT"]')?.textContent?.trim() || '';

                // Tipo de imóvel (extraído do título ou da descrição)
                let type = '';
                const typeKeywords = {
                    'apartamento': ['apartamento', 'apto', 'flat', 'loft'],
                    'casa': ['casa', 'chácara', 'sítio', 'fazenda', 'rancho'],
                    'chalé': ['chalé', 'chale', 'cabana', 'cabin'],
                    'quarto': ['quarto', 'suíte', 'suite', 'room']
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
            result.status = 'partial';
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

                // Extrair capacidade (quartos, banheiros, hóspedes)
                const capacityContainer = document.querySelector('div._gfomxi > div > h1');
                let rooms = 0;
                let bathrooms = 0;
                let beds = 0;
                let guests = 0;

                // Tentar extrair da seção de capacidade
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

                return {
                    price: totalPrice,
                    rooms,
                    bathrooms,
                    beds,
                    guests
                };
            });

            result.data = priceAndCapacityData;
            result.status = 'partial';
            result.message = 'Informações de preço e capacidade extraídas com sucesso';
        }

        // ETAPA 3: Comodidades
        else if (step === 3) {
            console.log('Executando Etapa 3: Comodidades');

            // Aumentar o tempo de espera
            await new Promise(resolve => setTimeout(resolve, 2000));

            const amenitiesData = await page.evaluate(() => {
                const amenities = [];

                // Procurar na seção de comodidades padrão
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

                return { amenities };
            });

            result.data = amenitiesData;
            result.status = 'partial';
            result.message = 'Comodidades extraídas com sucesso';
        }

        // ETAPA 4: Fotos do imóvel
        else if (step === 4) {
            console.log('Executando Etapa 4: Fotos do imóvel');

            // Configurar para permitir imagens
            await page.setRequestInterception(false);

            // Recarregar a página para obter as imagens
            await page.goto(url, { waitUntil: 'networkidle0' });

            // Dar tempo para a página carregar
            await safeWaitForTimeout(page, 5000);

            const imageUrls = new Set();

            // Registrar as imagens que estão sendo carregadas
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

            // Extrair URLs de imagens
            const extractedImages = await page.evaluate(() => {
                const images = [];

                // Pegar imagens regulares
                document.querySelectorAll('img').forEach(img => {
                    if (img.src &&
                        !img.src.includes('icon') &&
                        !img.src.includes('small') &&
                        img.width > 200 &&
                        img.height > 200) {
                        images.push(img.src);
                    }
                });

                // Pegar de elementos de estilo background-image
                document.querySelectorAll('*').forEach(el => {
                    const style = window.getComputedStyle(el);
                    const bgImage = style.backgroundImage;
                    if (bgImage && bgImage !== 'none') {
                        const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                        if (match && match[1]) {
                            images.push(match[1]);
                        }
                    }
                });

                return images;
            });

            // Adicionar as imagens extraídas ao conjunto
            extractedImages.forEach(url => imageUrls.add(url));

            result.data = {
                photos: Array.from(imageUrls).slice(0, 20) // Limitar a 20 imagens
            };
            result.status = 'success';
            result.message = 'Fotos extraídas com sucesso';
        }

        return result;
    } catch (error) {
        console.error('Erro durante o scraping:', error);
        throw error;
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