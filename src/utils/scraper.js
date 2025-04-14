const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const {
    getPuppeteerConfig,
    humanizeBrowser,
    generateHeaders
} = require('./browser-config');
const {
    getNextCookies,
    extractAndStoreCookies,
    hasCookies
} = require('./cookies-manager');

/**
 * Realiza o scraping de uma página do Airbnb
 * 
 * @param {string} url - URL da pesquisa do Airbnb
 * @param {Object} options - Opções de scraping
 * @param {boolean} options.useProxy - Usar proxy (não implementado)
 * @param {boolean} options.useCookies - Usar cookies armazenados
 * @param {boolean} options.humanLike - Comportamento mais humano
 * @returns {Promise<Object>} Resultados do scraping
 */
async function scrapeAirbnb(url, options = {}) {
    const { useProxy = false, useCookies = true, humanLike = true } = options;

    // Configuração do browser
    const browser = await puppeteer.launch(getPuppeteerConfig());

    try {
        const page = await browser.newPage();

        if (humanLike) {
            await humanizeBrowser(page);
        }

        // Configurar cookies se disponíveis
        if (useCookies && hasCookies()) {
            const cookies = getNextCookies();
            if (cookies) {
                await page.setCookie(...cookies);
                console.log('Cookies configurados:', cookies.length);
            }
        }

        // Configurar headers
        await page.setExtraHTTPHeaders(generateHeaders());

        // Tentar interceptar as chamadas de API
        let apiData = null;
        await page.setRequestInterception(true);

        page.on('request', (request) => {
            request.continue();
        });

        page.on('response', async (response) => {
            const url = response.url();
            const status = response.status();

            // Extrair e armazenar cookies da resposta
            if (status >= 200 && status < 300) {
                const responseCookies = await extractAndStoreCookies(response);
                if (responseCookies) {
                    console.log('Cookies extraídos:', responseCookies.length);
                }
            }

            // Capturar dados da API do Airbnb
            if (url.includes('api.airbnb.com/v2/search_results') ||
                url.includes('airbnb.com/api/v3/StaysSearch')) {
                try {
                    const text = await response.text();
                    if (text) {
                        apiData = JSON.parse(text);
                    }
                } catch (error) {
                    console.error('Erro ao processar resposta da API:', error.message);
                }
            }
        });

        // Navegar para a URL
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Se estamos esperando mais comportamento humano, vamos fazer algumas ações
        if (humanLike) {
            // Scroll para baixo para simular usuário vendo resultados
            await autoScroll(page);

            // Adicionar delay aleatório
            await page.waitForTimeout(2000 + Math.random() * 3000);
        }

        // Extrair o HTML após todas as requisições
        const content = await page.content();

        // Se conseguirmos dados diretamente da API, usamos eles
        if (apiData) {
            return processApiData(apiData);
        }

        // Caso contrário, extraímos os dados do HTML
        return await extractDataFromHTML(content);

    } catch (error) {
        console.error('Erro no scraping:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Extrai os dados da página HTML usando Cheerio
 * 
 * @param {string} html - Conteúdo HTML
 * @returns {Promise<Object>} Dados extraídos
 */
async function extractDataFromHTML(html) {
    const $ = cheerio.load(html);
    const listings = [];

    // Procurar pelos cartões de listagem
    $('div[itemprop="itemListElement"]').each((i, el) => {
        try {
            const $el = $(el);

            // Extrair informações básicas
            const title = $el.find('meta[itemprop="name"]').attr('content') || '';
            const url = $el.find('meta[itemprop="url"]').attr('content') || '';
            const image = $el.find('meta[itemprop="image"]').attr('content') || '';

            // Extrair preço
            const priceText = $el.find('[data-testid="listing-card-price"]').text();
            const price = extractPrice(priceText);

            // Extrair detalhes adicionais
            const details = $el.find('[data-testid="listing-card-subtitle"]').text();

            // Estruturar dados
            if (title && url) {
                listings.push({
                    title,
                    url,
                    image,
                    price,
                    details,
                });
            }
        } catch (err) {
            console.error('Erro ao processar listagem:', err);
        }
    });

    // Verificar se temos resultados
    if (listings.length === 0) {
        // Tentar método alternativo de extração
        try {
            return extractListingsAlternative($);
        } catch (error) {
            console.error('Erro no método alternativo:', error);
        }
    }

    return {
        success: listings.length > 0,
        count: listings.length,
        listings,
        source: 'html'
    };
}

/**
 * Método alternativo para extração de listagens
 * (Airbnb muda frequentemente sua estrutura HTML)
 */
function extractListingsAlternative($) {
    const listings = [];

    // Procura por scripts que contêm dados JSON
    $('script[type="application/json"]').each((i, el) => {
        try {
            const content = $(el).html();
            if (!content || !content.includes('"data"')) return;

            const data = JSON.parse(content);

            // Procurar por dados que parecem ser listagens
            if (data.data && Array.isArray(data.data.presentation?.explore?.sections?.sections)) {
                const sections = data.data.presentation.explore.sections.sections;
                for (const section of sections) {
                    if (section.section && Array.isArray(section.section?.items)) {
                        for (const item of section.section.items) {
                            if (item.listing) {
                                const listing = item.listing;
                                listings.push({
                                    title: listing.name || '',
                                    url: `https://airbnb.com/rooms/${listing.id}`,
                                    image: listing.contextualPictures?.[0]?.picture || '',
                                    price: listing.pricingQuote?.structuredStayDisplayPrice?.primaryLine?.price || '',
                                    details: `${listing.beds || ''} beds · ${listing.bedrooms || ''} bedrooms`
                                });
                            }
                        }
                    }
                }
            }
        } catch (err) { }
    });

    return {
        success: listings.length > 0,
        count: listings.length,
        listings,
        source: 'json'
    };
}

/**
 * Processa os dados obtidos diretamente da API do Airbnb
 * 
 * @param {Object} apiData - Dados da API
 * @returns {Object} Dados processados
 */
function processApiData(apiData) {
    try {
        const listings = [];

        // API v3 (formato mais recente)
        if (apiData.data?.presentation?.explore?.sections?.sections) {
            const sections = apiData.data.presentation.explore.sections.sections;
            for (const section of sections) {
                if (section.section?.items) {
                    for (const item of section.section.items) {
                        if (item.listing) {
                            const listing = item.listing;
                            listings.push({
                                id: listing.id,
                                title: listing.name || '',
                                url: `https://airbnb.com/rooms/${listing.id}`,
                                image: listing.contextualPictures?.[0]?.picture || '',
                                price: extractPriceFromApiData(listing.pricingQuote),
                                details: `${listing.beds || ''} beds · ${listing.bedrooms || ''} bedrooms`,
                                rating: listing.avgRating || null,
                                reviewCount: listing.reviewsCount || 0
                            });
                        }
                    }
                }
            }
        }
        // API v2 (formato legado)
        else if (apiData.search_results) {
            for (const result of apiData.search_results) {
                if (result.listing) {
                    const listing = result.listing;
                    listings.push({
                        id: listing.id,
                        title: listing.name || '',
                        url: `https://airbnb.com/rooms/${listing.id}`,
                        image: listing.picture_url || '',
                        price: listing.price_formatted || '',
                        details: `${listing.beds || ''} beds · ${listing.bedrooms || ''} bedrooms`,
                        rating: listing.star_rating || null,
                        reviewCount: listing.reviews_count || 0
                    });
                }
            }
        }

        return {
            success: listings.length > 0,
            count: listings.length,
            listings,
            source: 'api'
        };
    } catch (error) {
        console.error('Erro ao processar dados da API:', error);
        return { success: false, error: 'Falha ao processar dados da API' };
    }
}

/**
 * Extrai o preço de um texto
 * 
 * @param {string} priceText - Texto contendo o preço
 * @returns {string} Preço extraído
 */
function extractPrice(priceText) {
    if (!priceText) return '';

    // Procura por padrões como R$ 100, $100, €100
    const priceMatch = priceText.match(/[\$\£\€\R\$]\s*[\d,\.]+/);
    return priceMatch ? priceMatch[0].trim() : '';
}

/**
 * Extrai preço de dados da API
 * 
 * @param {Object} pricingQuote - Objeto de preço da API
 * @returns {string} Preço formatado
 */
function extractPriceFromApiData(pricingQuote) {
    if (!pricingQuote) return '';

    if (pricingQuote.structuredStayDisplayPrice?.primaryLine?.price) {
        return pricingQuote.structuredStayDisplayPrice.primaryLine.price;
    }

    if (pricingQuote.rate?.amount_formatted) {
        return pricingQuote.rate.amount_formatted;
    }

    return '';
}

/**
 * Função para fazer scroll automático na página
 * Simula comportamento mais humano
 * 
 * @param {Page} page - Instância de página do Puppeteer
 */
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                // Adicionar pequena pausa aleatória para simular comportamento humano
                if (Math.random() > 0.7) {
                    clearInterval(timer);
                    setTimeout(() => {
                        const newTimer = setInterval(() => {
                            window.scrollBy(0, distance);
                            totalHeight += distance;

                            if (totalHeight >= scrollHeight * 0.7) {
                                clearInterval(newTimer);
                                resolve();
                            }
                        }, 100 + Math.random() * 50);
                    }, 500 + Math.random() * 1000);
                }

                if (totalHeight >= scrollHeight * 0.7) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100 + Math.random() * 50);
        });
    });
}

module.exports = { scrapeAirbnb }; 