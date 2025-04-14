const puppeteer = require('puppeteer-core');
const chrome = require('@sparticuz/chromium');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

// Importar utilitários de forma estática para evitar warnings de dependência crítica
let browserFingerprint = {};
let proxyRotator = {};
let cookiesManager = {};
let browserConfig = {};
let scrapeHelpers = {};

// Carregar utilitários com tratamento de erro para maior resiliência
try {
    browserFingerprint = require('../utils/browser-fingerprint');
} catch (error) {
    console.warn(`Aviso: Não foi possível carregar o módulo browser-fingerprint: ${error.message}`);
}

try {
    proxyRotator = require('../utils/proxy-rotator');
} catch (error) {
    console.warn(`Aviso: Não foi possível carregar o módulo proxy-rotator: ${error.message}`);
}

try {
    cookiesManager = require('../utils/cookies-manager');
} catch (error) {
    console.warn(`Aviso: Não foi possível carregar o módulo cookies-manager: ${error.message}`);
}

try {
    browserConfig = require('../utils/browser-config');
} catch (error) {
    console.warn(`Aviso: Não foi possível carregar o módulo browser-config: ${error.message}`);
}

try {
    scrapeHelpers = require('../utils/scrape-helpers');
} catch (error) {
    console.warn(`Aviso: Não foi possível carregar o módulo scrape-helpers: ${error.message}`);
}

// Caminho para armazenar cookies de sessões bem-sucedidas
// Em ambientes sem acesso a disco, usaremos memória
const COOKIES_FILE_PATH = '/tmp/airbnb-cookies.json';
let cookiesCache = null;

// Armazenamento em memória para cookies como fallback
let inMemoryCookies = [];
let lastSuccessfulUserAgent = null;

/**
 * Extracts the listing ID from an Airbnb URL
 * @param {string} url - The Airbnb listing URL
 * @returns {number|null} - The extracted listing ID or null if not found
 */
function getListingId(url) {
    try {
        const matches = url.match(/\/rooms\/(\d+)/);

        if (matches && matches[1]) {
            return parseInt(matches[1], 10);
        }

        return null;
    } catch (error) {
        console.error('Error extracting listing ID:', error);
        return null;
    }
}

/**
 * Generate a random user agent
 * @returns {string} - A random user agent string
 */
function getRandomUserAgent() {
    // Se temos um user-agent que funcionou anteriormente, há 70% de chance de usá-lo novamente
    if (lastSuccessfulUserAgent && Math.random() < 0.7) {
        return lastSuccessfulUserAgent;
    }

    const userAgents = [
        // Chrome em Windows - mais comum
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Chrome em macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Safari em macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
        // Firefox em Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        // Edge em Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        // Chrome em Android (dispositivos móveis podem ter menos limitações)
        'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Verifies if the loaded page is actually the listing detail page
 * @param {Object} page - The Puppeteer page object
 * @param {number} listingId - The expected listing ID
 * @returns {Promise<boolean>} - True if the page is a listing detail page
 */
async function verifyListingPage(page, listingId) {
    try {
        // Check 1: URL still contains the listing ID
        const currentUrl = page.url();
        const stillHasListingId = currentUrl.includes(`/rooms/${listingId}`);

        if (!stillHasListingId) {
            console.log(`URL redirecionada não contém mais o ID da listagem ${listingId}: ${currentUrl}`);
            return false;
        }

        // Check 2: Title should not be the homepage title
        const title = await page.title();
        const isHomePage = title.includes('aluguéis por temporada') && !title.includes('em');

        if (isHomePage) {
            console.log(`Título indica página inicial, não listagem: ${title}`);
            return false;
        }

        // Check 3: Look for elements that should exist on a listing page
        const listingElements = await page.evaluate(() => {
            // Look for price element
            const priceElement = document.querySelector('[data-testid="book-it-default"] span[data-testid="price-element"]');

            // Look for reviews section
            const reviewsElement = document.querySelector('[data-testid="pdp-reviews-header"]');

            // Look for amenities section
            const amenitiesElement = document.querySelector('[data-testid="amenities-section"]');

            // Look for listing title
            const titleElement = document.querySelector('h1');

            // Look for host info section
            const hostElement = document.querySelector('[data-testid="pdp-host-name"]');

            return {
                hasPrice: !!priceElement,
                hasReviews: !!reviewsElement,
                hasAmenities: !!amenitiesElement,
                hasTitle: !!titleElement,
                hasHost: !!hostElement,
                title: titleElement ? titleElement.textContent : null
            };
        });

        console.log('Elementos encontrados na página:', JSON.stringify(listingElements));

        // If we have at least 3 of these elements, it's likely a listing page
        const elementsFound = [
            listingElements.hasPrice,
            listingElements.hasReviews,
            listingElements.hasAmenities,
            listingElements.hasTitle,
            listingElements.hasHost
        ].filter(Boolean).length;

        return elementsFound >= 2;
    } catch (error) {
        console.error('Erro ao verificar página de listagem:', error);
        return false;
    }
}

/**
 * Carrega cookies salvos de sessões anteriores
 * @returns {Promise<Array>} Array de cookies
 */
async function loadSavedCookies() {
    // Se já temos cookies em cache, retorne-os
    if (cookiesCache) {
        return cookiesCache;
    }

    // Se temos cookies em memória, use-os como fallback
    if (inMemoryCookies.length > 0) {
        return inMemoryCookies;
    }

    try {
        // Tentar carregar do arquivo
        const cookiesData = await fs.readFile(COOKIES_FILE_PATH, 'utf8');
        const cookies = JSON.parse(cookiesData);
        cookiesCache = cookies;
        return cookies;
    } catch (error) {
        // Se não conseguir carregar o arquivo, retornar array vazio
        console.log('Nenhum cookie salvo encontrado:', error.message);
        return [];
    }
}

/**
 * Salva cookies para uso em sessões futuras
 * @param {Array} cookies - Array de cookies para salvar
 */
async function saveCookies(cookies) {
    if (!cookies || cookies.length === 0) {
        return;
    }

    // Atualizar cache em memória
    cookiesCache = cookies;
    inMemoryCookies = cookies;

    try {
        // Tentar salvar no arquivo
        await fs.writeFile(COOKIES_FILE_PATH, JSON.stringify(cookies), 'utf8');
        console.log(`${cookies.length} cookies salvos com sucesso`);
    } catch (error) {
        console.log('Não foi possível salvar cookies em arquivo:', error.message);
        // Se não puder salvar no arquivo, pelo menos temos em memória
    }
}

/**
 * Realiza ações que simulam comportamento humano na página
 * @param {Object} page - Objeto de página do Puppeteer 
 */
async function simulateHumanBehavior(page) {
    console.log('Simulando comportamento humano...');

    try {
        // Começar a coletar dados de desempenho (como um navegador real)
        await page.evaluate(() => {
            window.performance.mark('navigation-start');
        });

        // Aguardar carregamento completo da página antes da interação
        await page.waitForTimeout(1000 + Math.random() * 1500);

        // Mover o mouse para diferentes elementos com velocidade variável
        const randomPositions = [
            { x: 100 + Math.floor(Math.random() * 500), y: 100 + Math.floor(Math.random() * 300) },
            { x: 300 + Math.floor(Math.random() * 500), y: 200 + Math.floor(Math.random() * 400) },
            { x: 200 + Math.floor(Math.random() * 400), y: 300 + Math.floor(Math.random() * 300) },
            { x: 400 + Math.floor(Math.random() * 300), y: 150 + Math.floor(Math.random() * 200) }
        ];

        // Realizar movimentos suaves do mouse com velocidade variável
        for (let i = 0; i < randomPositions.length; i++) {
            const pos = randomPositions[i];
            // Tempo de movimento variável (mais realista)
            const steps = 5 + Math.floor(Math.random() * 10);
            await page.mouse.move(pos.x, pos.y, { steps });

            // Pequena pausa aleatória entre movimentos
            await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random() * 1000)));

            // Raramente realizar clique após movimento
            if (Math.random() < 0.3) {
                await page.mouse.click(pos.x, pos.y);
                await page.waitForTimeout(500 + Math.random() * 1000);
            }
        }

        // Simular leitura da página (comportamento humano típico)
        await simulateReading(page);

        // Scroll natural, não-linear em diferentes velocidades
        let currentPosition = 0;
        const targetPosition = Math.floor(Math.random() * 2500) + 1500;

        console.log('Realizando scroll natural até:', targetPosition);

        // Scroll não linear (começa devagar, acelera no meio, desacelera no fim)
        while (currentPosition < targetPosition) {
            // Calcular próximo salto de scroll (variável)
            let jump;

            // Aceleração e desaceleração da rolagem (comportamento humano)
            const progress = currentPosition / targetPosition;
            if (progress < 0.2) {
                // Início lento
                jump = Math.floor(Math.random() * 60) + 30;
            } else if (progress > 0.8) {
                // Fim lento
                jump = Math.floor(Math.random() * 50) + 20;
            } else {
                // Meio mais rápido
                jump = Math.floor(Math.random() * 100) + 50;
            }

            currentPosition += jump;

            // Executar scroll suave
            await page.evaluate((pos) => {
                window.scrollTo({
                    top: pos,
                    behavior: 'smooth'
                });
            }, currentPosition);

            // Pausa variável entre scrolls (pessoas realmente lêem o conteúdo)
            const scrollPause = 100 + Math.floor(Math.random() * 800);
            await new Promise(r => setTimeout(r, scrollPause));

            // Ocasionalmente fazer uma pausa longa (como se estivesse lendo algo interessante)
            if (Math.random() < 0.1) {
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
            }
        }

        // Ocasionalmente, volte um pouco para cima (comportamento bastante humano)
        if (Math.random() < 0.7) {
            const scrollBackAmount = Math.floor(targetPosition * (0.2 + Math.random() * 0.3));
            await page.evaluate((pos) => {
                window.scrollTo({
                    top: pos,
                    behavior: 'smooth'
                });
            }, currentPosition - scrollBackAmount);

            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
        }

        // Terminar coleta de desempenho
        await page.evaluate(() => {
            window.performance.mark('navigation-end');
            window.performance.measure('navigation', 'navigation-start', 'navigation-end');
        });

        // Aguardar carregamento adicional de conteúdo
        await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 1500)));

        // Interagir com elementos da página, como fotos ou carrossel
        await interactWithPageElements(page);

        // Scroll adicional para cima e para baixo (comportamento de revisão)
        await page.evaluate(() => {
            window.scrollTo({
                top: window.scrollY - 500,
                behavior: 'smooth'
            });
        });

        await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

        console.log('Comportamento humano simulado com sucesso');
    } catch (error) {
        console.error('Erro ao simular comportamento humano:', error);
    }
}

/**
 * Simula a leitura de conteúdo na página
 * @param {Object} page - Objeto de página do Puppeteer
 */
async function simulateReading(page) {
    try {
        // Encontrar elementos de texto principais para "ler"
        const textElements = await page.evaluate(() => {
            const elements = [];
            // Procurar por parágrafos, títulos, descrições e outros textos relevantes
            const selectors = [
                'h1', 'h2', 'p', '[data-section-id="DESCRIPTION_DEFAULT"] div',
                '[data-section-id="HIGHLIGHTS_DEFAULT"] div', '[data-section-id="POLICIES_DEFAULT"] div',
                '[data-section-id="AMENITIES_DEFAULT"] div'
            ];

            for (const selector of selectors) {
                const found = document.querySelectorAll(selector);
                found.forEach((el, index) => {
                    if (el.textContent && el.textContent.trim().length > 20) {
                        const rect = el.getBoundingClientRect();
                        elements.push({
                            top: rect.top + window.scrollY,
                            left: rect.left + window.scrollX,
                            text: el.textContent.length
                        });
                    }
                });
            }

            return elements;
        });

        // Se encontramos elementos de texto, simular leitura movendo o mouse e parar para ler
        if (textElements.length > 0) {
            console.log(`Simulando leitura de ${textElements.length} elementos de texto`);

            // Escolher alguns textos aleatórios para "ler"
            const maxToRead = Math.min(4, textElements.length);
            const toRead = [];

            for (let i = 0; i < maxToRead; i++) {
                const randomIndex = Math.floor(Math.random() * textElements.length);
                toRead.push(textElements[randomIndex]);
                textElements.splice(randomIndex, 1);
            }

            // Ordenar por posição na página (leitura natural de cima para baixo)
            toRead.sort((a, b) => a.top - b.top);

            // Simular leitura de cada elemento
            for (const element of toRead) {
                // Scrollar até o elemento
                await page.evaluate((top) => {
                    window.scrollTo({
                        top: Math.max(0, top - 200), // Um pouco acima do elemento
                        behavior: 'smooth'
                    });
                }, element.top);

                await page.waitForTimeout(500 + Math.random() * 800);

                // Mover o mouse para a área do texto
                await page.mouse.move(
                    element.left + 10 + Math.random() * 100,
                    element.top + 10 + Math.random() * 30
                );

                // Tempo de leitura baseado no tamanho do texto
                const readingTime = Math.min(5000, element.text * 20 + 1000 + Math.random() * 2000);
                await page.waitForTimeout(readingTime);
            }
        }
    } catch (error) {
        console.error('Erro ao simular leitura:', error);
    }
}

/**
 * Interage com elementos da página como fotos, botões, etc.
 * @param {Object} page - Objeto de página do Puppeteer
 */
async function interactWithPageElements(page) {
    try {
        // Array de possíveis interações
        const interactions = [
            // Interação com fotos
            async () => {
                const photoElements = await page.$$('[data-testid="photo-carousel"] button, [data-testid="gallery"] button, [aria-label="Galeria de fotos"] button');
                if (photoElements.length > 0) {
                    const randomPhotoElement = photoElements[Math.floor(Math.random() * photoElements.length)];
                    await randomPhotoElement.click();
                    console.log('Clicou em um elemento de foto');

                    // Aguardar um pouco e navegar pelas fotos
                    await page.waitForTimeout(1000 + Math.random() * 1500);

                    // Navegar por algumas fotos (1-4)
                    const photoCount = 1 + Math.floor(Math.random() * 3);
                    for (let i = 0; i < photoCount; i++) {
                        const nextButtons = await page.$$('[aria-label="Próxima foto"], [aria-label="Avançar"], [data-testid="gallery-next-btn"]');
                        if (nextButtons.length > 0) {
                            await nextButtons[0].click();
                            await page.waitForTimeout(1200 + Math.random() * 1800);
                        }
                    }

                    // Tentar fechar o modal de fotos
                    const closeButtons = await page.$$('[aria-label="Fechar"], [data-testid="modal-close"], .close-button');
                    if (closeButtons.length > 0) {
                        await closeButtons[0].click();
                        console.log('Fechou o modal de fotos');
                    }
                }
            },

            // Interação com amenidades
            async () => {
                const amenityButtons = await page.$$('[data-section-id="AMENITIES_DEFAULT"] button, [data-testid="amenities-section"] button, [aria-label="Ver todas as amenidades"]');
                if (amenityButtons.length > 0) {
                    console.log('Clicando em botão de amenidades');
                    await amenityButtons[0].click();
                    await page.waitForTimeout(1200 + Math.random() * 1500);

                    // Scrollar pela lista de amenidades
                    await page.evaluate(() => {
                        const modal = document.querySelector('[role="dialog"]');
                        if (modal) {
                            for (let i = 0; i < 3; i++) {
                                setTimeout(() => {
                                    modal.scrollBy({
                                        top: 200 + Math.random() * 300,
                                        behavior: 'smooth'
                                    });
                                }, i * 1000);
                            }
                        }
                    });

                    await page.waitForTimeout(2000 + Math.random() * 1500);

                    // Fechar modal de amenidades
                    const closeButtons = await page.$$('[aria-label="Fechar"], [data-testid="modal-close"], .close-button');
                    if (closeButtons.length > 0) {
                        await closeButtons[0].click();
                    }
                }
            },

            // Interação com o mapa
            async () => {
                const mapElements = await page.$$('[data-section-id="LOCATION_DEFAULT"] button, [aria-label="Mapa"], [data-testid="pdp-show-map-button"]');
                if (mapElements.length > 0) {
                    console.log('Clicando no mapa');
                    await mapElements[0].click();
                    await page.waitForTimeout(2000 + Math.random() * 2000);

                    // Interagir com o mapa (zoom, pan)
                    const mapContainer = await page.$('[role="dialog"] [role="region"], [data-testid="pdp-map"]');
                    if (mapContainer) {
                        const mapRect = await mapContainer.boundingBox();
                        if (mapRect) {
                            // Simular zoom/pan no mapa
                            await page.mouse.move(mapRect.x + mapRect.width / 2, mapRect.y + mapRect.height / 2);
                            await page.mouse.down();
                            await page.mouse.move(mapRect.x + mapRect.width / 2 + 50, mapRect.y + mapRect.height / 2 + 50, { steps: 10 });
                            await page.mouse.up();

                            await page.waitForTimeout(1000 + Math.random() * 1000);
                        }
                    }

                    // Fechar o mapa
                    const closeButtons = await page.$$('[aria-label="Fechar"], [data-testid="modal-close"], .close-button');
                    if (closeButtons.length > 0) {
                        await closeButtons[0].click();
                    }
                }
            }
        ];

        // Escolher 1-2 interações para realizar
        const interactionCount = 1 + Math.floor(Math.random() * 1.5);
        const shuffledInteractions = interactions.sort(() => 0.5 - Math.random());

        for (let i = 0; i < Math.min(interactionCount, shuffledInteractions.length); i++) {
            try {
                await shuffledInteractions[i]();
            } catch (error) {
                console.log(`Erro na interação ${i + 1}:`, error.message);
            }

            // Pausa entre interações
            if (i < interactionCount - 1) {
                await page.waitForTimeout(1000 + Math.random() * 1500);
            }
        }
    } catch (error) {
        console.error('Erro ao interagir com elementos da página:', error);
    }
}

/**
 * Maps the Airbnb API response to a simplified object structure
 * @param {Object} airbnbListing - The raw Airbnb listing data
 * @returns {Object} - Formatted listing data
 */
function mapListingFromAirbnb(airbnbListing) {
    try {
        // Handle potential missing data with safe defaults
        return {
            airbnbId: airbnbListing.id,
            title: airbnbListing.name || '',
            description: airbnbListing.sectioned_description?.description || '',
            location: {
                lat: airbnbListing.lat,
                lng: airbnbListing.lng,
                city: airbnbListing.address?.city || '',
                country: airbnbListing.address?.country || '',
            },
            pricing: {
                basePrice: airbnbListing.price || 0,
                currency: airbnbListing.price_details?.price_string?.match(/[^\d\s.,]+/) || '',
                cleaningFee: airbnbListing.price_details?.price_items?.find(item =>
                    item.type === 'CLEANING_FEE')?.total_amount || 0,
                serviceFee: airbnbListing.price_details?.price_items?.find(item =>
                    item.type === 'SERVICE_FEE')?.total_amount || 0
            },
            host: {
                name: airbnbListing.primary_host?.host_name || '',
                about: airbnbListing.primary_host?.about || '',
                airbnbId: airbnbListing.primary_host?.id,
                isSuperhost: airbnbListing.primary_host?.is_superhost || false,
                profileUrl: airbnbListing.primary_host?.profile_pic_path || '',
                verified: airbnbListing.primary_host?.identity_verified || false
            },
            specs: {
                guestCapacity: airbnbListing.person_capacity || 0,
                bedroomCount: airbnbListing.bedroom_count || 0,
                bedCount: airbnbListing.bed_count || 0,
                bathroomCount: airbnbListing.bathroom_count || 0,
                minNights: airbnbListing.min_nights || 1,
            },
            photos: (airbnbListing.photos || []).map(photo => ({
                url: photo.picture || '',
                caption: photo.caption || ''
            })),
            amenities: (airbnbListing.listing_amenities || []).map(amenity => ({
                name: amenity.name || '',
                category: amenity.tag || '',
                description: amenity.tooltip || ''
            })),
            reviews: {
                rating: airbnbListing.star_rating || 0,
                count: airbnbListing.review_details_interface?.review_count || 0
            },
            cancelationPolicy: airbnbListing.cancellation_policy_text || '',
            houseRules: airbnbListing.additional_house_rules || '',
            url: airbnbListing.listing_url || ''
        };
    } catch (error) {
        console.error('Error mapping Airbnb data:', error);
        throw error;
    }
}

/**
 * Extract data directly from the DOM when API method fails
 * @param {Object} page - Puppeteer page object
 * @param {string} originalUrl - URL original da listagem
 * @returns {Promise<Object>} - Extracted listing data
 */
async function extractDataFromDom(page, originalUrl) {
    try {
        console.log('Tentando extrair dados diretamente do DOM...');

        // Capturar screenshot como evidência (apenas para debug)
        try {
            await page.screenshot({ path: '/tmp/airbnb-listing-page.png' });
            console.log('Screenshot salvo em /tmp/airbnb-listing-page.png');
        } catch (err) {
            console.error('Não foi possível salvar screenshot:', err.message);
        }

        return await page.evaluate((url) => {
            // Helper function to extract text if element exists
            const getText = (selector) => {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : '';
            };

            // Helper to extract multiple elements text
            const getAllText = (selector) => {
                const elements = document.querySelectorAll(selector);
                return Array.from(elements).map(el => el.textContent.trim());
            };

            // Helper para extrair preço com moeda
            const extractPrice = (priceText) => {
                // Exemplo: "R$150" -> {currency: "R$", value: 150}
                const match = priceText.match(/([^\d\s.,]+)\s*([\d.,]+)/);
                if (match) {
                    return {
                        currency: match[1],
                        value: parseFloat(match[2].replace(/\./g, '').replace(',', '.'))
                    };
                }
                return { currency: '', value: 0 };
            };

            // Get listing title
            const title = getText('h1');

            // Get price (tentar diferentes seletores usados pelo Airbnb)
            const priceSelectors = [
                '[data-testid="book-it-default"] ._tyxjp1',
                '[data-testid="book-it-default"] span[data-testid="price-element"]',
                '._1k4xcdh',
                '._1p7iugi',
                '.lblack'
            ];

            let priceText = '';
            for (const selector of priceSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    priceText = el.textContent.trim();
                    break;
                }
            }

            const priceInfo = extractPrice(priceText);

            // Get rating
            const ratingText = getText('[data-testid="pdp-reviews-header"] ._tyxjp1') ||
                getText('._goo6uz') ||
                getText('._1plk0jz1');
            const rating = ratingText ? parseFloat(ratingText) : 0;

            // Get review count
            const reviewCountText = getText('[data-testid="pdp-reviews-header"] ._12m9o05') ||
                getText('._s65ijh7') ||
                getText('._1qdp1ym');
            const reviewCountMatch = reviewCountText.match(/(\d+)/);
            const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1]) : 0;

            // Get images
            const images = Array.from(document.querySelectorAll('img[data-original-uri], img[data-testid="photo-carousel-image"], ._8kplbn, ._9xgknn'))
                .map(img => ({
                    url: img.src || img.getAttribute('data-original-uri') || '',
                    caption: img.alt || ''
                }))
                .filter(img => img.url && !img.url.includes('profile_pic') && !img.url.includes('avatar'));

            // Get amenities
            const amenities = getAllText('[data-testid="amenities-section"] ._gw4xx4, ._11jhslp, ._19xnuo97')
                .map(amenity => ({
                    name: amenity,
                    category: '',
                    description: ''
                }));

            // Get host info
            const hostName = getText('[data-testid="pdp-host-name"], ._14i3z6h, ._f47qa6');
            const isSuperhost = document.querySelector('[data-testid="pdp-superhost-badge"], ._1mhorg9, ._1qsawv5') !== null;

            // Get location info
            const locationSection = document.querySelector('[data-section-id="LOCATION_DEFAULT"], ._1yfus1e, ._15qmrr8l');
            const locationText = locationSection ? locationSection.textContent : '';

            // Get description
            const description = getText('[data-section-id="DESCRIPTION_DEFAULT"] ._rt9o25, ._bq6krt, ._1hs2w1');

            // Get ID from URL ou DOM
            const idFromUrl = window.location.pathname.match(/\/rooms\/(\d+)/)?.[1];

            // Capturar capacidade, quartos, camas
            const capacityText = getText('._14hqahxx, ._1tanv1h, ._jro6t0');

            const getNumberFromText = (text, pattern) => {
                const match = text.match(pattern);
                return match ? parseInt(match[1]) : 0;
            };

            const guestCapacity = getNumberFromText(capacityText, /(\d+).*hóspedes?/);
            const bedroomCount = getNumberFromText(capacityText, /(\d+).*quartos?/);
            const bedCount = getNumberFromText(capacityText, /(\d+).*camas?/);
            const bathroomCount = getNumberFromText(capacityText, /(\d+).*banheiros?/);

            return {
                airbnbId: idFromUrl || '',
                title,
                description,
                location: {
                    lat: 0, // Can't easily get from DOM
                    lng: 0, // Can't easily get from DOM
                    city: locationText.split(',')[0] || '',
                    country: locationText.split(',').pop() || '',
                },
                pricing: {
                    basePrice: priceInfo.value,
                    currency: priceInfo.currency,
                    cleaningFee: 0, // Not easily accessible from DOM
                    serviceFee: 0, // Not easily accessible from DOM
                },
                host: {
                    name: hostName,
                    about: '',
                    airbnbId: '',
                    isSuperhost,
                    profileUrl: '',
                    verified: false
                },
                specs: {
                    guestCapacity,
                    bedroomCount,
                    bedCount,
                    bathroomCount,
                    minNights: 1,
                },
                photos: images,
                amenities,
                reviews: {
                    rating,
                    count: reviewCount
                },
                cancelationPolicy: getText('[data-section-id="POLICIES_DEFAULT"], ._1n558uk, ._u827kd'),
                houseRules: getText('[data-section-id="HOUSE_RULES_DEFAULT"], ._14tkmhr, ._yqwtm2'),
                url: url || window.location.href,
                dataSource: 'DOM',
                extractedAt: new Date().toISOString()
            };
        }, originalUrl);
    } catch (error) {
        console.error('Erro ao extrair dados do DOM:', error);
        throw error;
    }
}

/**
 * Configura o browser para evitar detecção
 * @param {Object} page - Página do Puppeteer
 * @param {string} userAgent - User agent a ser utilizado
 */
async function setupBrowserEvasion(page, userAgent) {
    try {
        // Gerar fingerprint consistente para a sessão
        const sessionId = `airbnb-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const fingerprint = await browserFingerprint.applyFingerprint(page, sessionId);

        console.log(`Fingerprint aplicado: ${fingerprint.browser.name} ${fingerprint.browser.version} em ${fingerprint.os.name}`);

        // Definir user agent (se não usarmos o applyFingerprint)
        if (!fingerprint) {
            await page.setUserAgent(userAgent);
        }

        // Configurar viewport realista de desktop
        await page.setViewport({
            width: fingerprint ? fingerprint.screen.width : 1920,
            height: fingerprint ? fingerprint.screen.height : 1080,
            deviceScaleFactor: 1,
            hasTouch: fingerprint ? fingerprint.device === 'Mobile' || fingerprint.device === 'Tablet' : false,
            isLandscape: true,
            isMobile: fingerprint ? fingerprint.device === 'Mobile' : false
        });

        // Carregar cookies salvos
        const savedCookies = await loadSavedCookies();
        if (savedCookies && savedCookies.length > 0) {
            console.log(`Carregando ${savedCookies.length} cookies salvos`);
            await page.setCookie(...savedCookies);
        }

        // Definir headers extras, se não usamos o applyFingerprint
        if (!fingerprint) {
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'Upgrade-Insecure-Requests': '1'
            });
        }

        // Injetar scripts para modificar a fingerprint do navegador
        if (!fingerprint) {
            await page.evaluateOnNewDocument(() => {
                // Overriding navigator properties
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
                    ]
                });

                // Definir linguagens do navegador
                Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });

                // Simular navegador Chrome
                window.navigator.chrome = { runtime: {} };

                // Sobrescrever características de hardware para parecer um PC normal
                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
                Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

                // Sobrescrever métodos de data para parecer timezone brasileiro
                const dateProto = Date.prototype;
                const dateNow = Date.now;
                const intl = Intl;

                Date.now = () => dateNow();

                Object.defineProperty(intl.DateTimeFormat.prototype, 'resolvedOptions', {
                    get: () => function () {
                        return { timeZone: 'America/Sao_Paulo', locale: 'pt-BR' };
                    }
                });

                // Sobrescrever função de permissões
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );

                // Definir histórico de navegação fake
                Object.defineProperty(window, 'history', {
                    get: () => {
                        return {
                            length: Math.floor(Math.random() * 5) + 3
                        };
                    }
                });

                // Simular bateria (aparelhos reais possuem)
                if (!navigator.getBattery) {
                    navigator.getBattery = () => Promise.resolve({
                        charging: true,
                        chargingTime: 0,
                        dischargingTime: Infinity,
                        level: 1.0,
                        addEventListener: () => { }
                    });
                }
            });
        }

        return { fingerprint };
    } catch (error) {
        console.error('Erro ao configurar evasão do browser:', error);
        // Se falhar, retornar objeto vazio para não quebrar o fluxo
        return {};
    }
}

/**
 * Testa se um proxy está funcionando
 * @param {Object} proxy - Objeto proxy com host, port e protocol
 * @returns {Promise<boolean>} - true se o proxy funcionar
 */
async function testProxy(proxy) {
    try {
        // Implementação básica para Node sem necessidade de dependências adicionais
        const protocol = proxy.protocol === 'https' ? https : http;
        const url = new URL('https://www.airbnb.com');

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                resolve(false);
            }, 5000);

            const req = protocol.request({
                host: proxy.host,
                port: proxy.port,
                path: url.pathname,
                method: 'HEAD',
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }, (res) => {
                clearTimeout(timeoutId);
                resolve(res.statusCode < 400);
            });

            req.on('error', () => {
                clearTimeout(timeoutId);
                resolve(false);
            });

            req.on('timeout', () => {
                req.destroy();
                clearTimeout(timeoutId);
                resolve(false);
            });

            req.end();
        });
    } catch (error) {
        return false;
    }
}

/**
 * Tenta diferentes abordagens para extrair dados do Airbnb
 */
async function executeScrapingWithRetry(url, maxRetries = 3) {
    let browser = null;
    let lastError = null;
    let proxyServer = null;

    // Extrair o ID da listagem para validação
    const listingId = getListingId(url);
    if (!listingId) {
        return {
            status: 'error',
            message: 'URL inválida: não foi possível extrair o ID da listagem',
            error: 'INVALID_URL',
            data: null
        };
    }

    // Tentar obter um proxy (opcional)
    try {
        if (proxyRotator && proxyRotator.getWorkingProxy) {
            proxyServer = await proxyRotator.getWorkingProxy();
            if (proxyServer) {
                console.log(`Usando proxy: ${proxyServer.host}:${proxyServer.port}`);
            } else {
                console.log('Nenhum proxy disponível, usando conexão direta');
            }
        } else {
            console.log('Módulo de proxy não disponível, usando conexão direta');
        }
    } catch (error) {
        console.log('Erro ao tentar obter proxy, continuando sem proxy:', error.message);
    }

    // Executar com algumas tentativas
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`Iniciando tentativa de scraping ${attempt + 1}/${maxRetries} para: ${url}`);

            // Configurar o navegador
            const executablePath = await chrome.executablePath;
            const userAgent = browserConfig.getRandomUserAgent ?
                browserConfig.getRandomUserAgent() :
                getRandomUserAgent();

            console.log(`Usando User-Agent: ${userAgent}`);

            // Configurar argumentos do browser
            const browserArgs = [
                ...chrome.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ];

            // Adicionar proxy se disponível
            if (proxyServer) {
                browserArgs.push(`--proxy-server=${proxyServer.protocol}://${proxyServer.host}:${proxyServer.port}`);
            }

            browser = await puppeteer.launch({
                args: browserArgs,
                defaultViewport: null, // Permitir viewport em tamanho total
                executablePath,
                headless: 'new',
                ignoreHTTPSErrors: true
            });

            const page = await browser.newPage();

            // Autenticar no proxy se necessário
            if (proxyServer && proxyServer.username && proxyServer.password) {
                await page.authenticate({
                    username: proxyServer.username,
                    password: proxyServer.password
                });
            }

            // Configurar evasão de detecção
            const { fingerprint } = await setupBrowserEvasion(page, userAgent);

            // Navegar para a página com timeout estendido
            console.log(`Navegando para: ${url}`);
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Verificar se a página carregada é a correta
            console.log('Verificando se carregou a página correta...');
            const isListingPage = await verifyListingPage(page, listingId);

            if (!isListingPage) {
                console.log('Carregou uma página que não parece ser a listagem. Tentando comportamento humano...');

                // Tentar comportamento humano para superar bloqueios
                await simulateHumanBehavior(page);

                // Verifica novamente depois do comportamento humano
                const isListingPageAfterBehavior = await verifyListingPage(page, listingId);

                if (!isListingPageAfterBehavior) {
                    console.log('Mesmo após comportamento humano, não carregou a página correta.');

                    // Capturar uma screenshot para debug
                    try {
                        await page.screenshot({ path: '/tmp/airbnb-blocked-page.png' });
                        console.log('Screenshot da página de bloqueio salvo');
                    } catch (e) {
                        console.error('Erro ao salvar screenshot:', e);
                    }

                    // Capturar o HTML da página para diagnóstico
                    try {
                        const content = await page.content();
                        console.log('Conteúdo da página:', content.substring(0, 500) + '...');

                        // Verificar sinais específicos de bloqueio
                        const isBlocked = scrapeHelpers.isBlocked ?
                            scrapeHelpers.isBlocked(content) :
                            content.includes('blocked') ||
                            content.includes('captcha') ||
                            content.includes('robot') ||
                            content.includes('suspicious') ||
                            content.includes('unusual activity');

                        if (isBlocked) {
                            console.log('Detectados sinais de bloqueio na página');
                        }
                    } catch (e) {
                        console.error('Erro ao extrair conteúdo da página:', e);
                    }

                    // Fechar a página atual
                    await page.close();

                    // Se estamos usando proxy e falhou, tentar obter um novo proxy
                    if (proxyServer && attempt < maxRetries - 1) {
                        try {
                            if (proxyRotator && proxyRotator.getWorkingProxy) {
                                proxyServer = await proxyRotator.getWorkingProxy();
                                if (proxyServer) {
                                    console.log(`Tentando novo proxy: ${proxyServer.host}:${proxyServer.port}`);
                                }
                            } else {
                                console.log('Módulo de proxy não disponível para rotação');
                                proxyServer = null;
                            }
                        } catch (e) {
                            console.log('Erro ao obter novo proxy:', e.message);
                            proxyServer = null;
                        }
                    }

                    // Continuar para a próxima tentativa
                    lastError = new Error('Página de listagem não carregada corretamente (bloqueio detectado)');
                    continue;
                }
            }

            console.log('Página de listagem carregada corretamente, extraindo dados...');

            // Salvar cookies para uso futuro
            const cookies = await page.cookies();
            await saveCookies(cookies);

            // Salvar user agent bem-sucedido
            lastSuccessfulUserAgent = userAgent;

            // Extrair dados diretamente do DOM
            const extractedData = await extractDataFromDom(page, url);

            if (!extractedData || !extractedData.title) {
                throw new Error('Dados extraídos inválidos ou vazios');
            }

            // Se chegou até aqui, temos dados. Fechar o browser e retornar
            await browser.close();
            browser = null;

            return {
                status: 'success',
                message: 'Dados extraídos com sucesso',
                data: extractedData
            };
        } catch (error) {
            console.error(`Erro na tentativa ${attempt + 1}:`, error);
            lastError = error;

            // Fechar o browser se ainda estiver aberto
            if (browser) {
                try {
                    await browser.close();
                    browser = null;
                } catch (closeError) {
                    console.error('Erro ao fechar navegador:', closeError);
                }
            }

            // Se for a última tentativa, propagar o erro
            if (attempt === maxRetries - 1) {
                throw error;
            }

            // Esperar um tempo aleatório entre tentativas (2-6 segundos)
            const retryDelay = 2000 + Math.random() * 4000;
            console.log(`Aguardando ${Math.round(retryDelay / 1000)} segundos antes da próxima tentativa...`);
            await new Promise(r => setTimeout(r, retryDelay));
        }
    }

    // Se chegou aqui, todas as tentativas falharam
    throw lastError || new Error('Todas as tentativas de scraping falharam');
}

// Main scraping function - simplified version without steps
export async function scrapeAirbnb(url) {
    try {
        console.log(`Iniciando scraping Airbnb para: ${url}`);

        // Executar scraping com retentativas
        return await executeScrapingWithRetry(url);
    } catch (error) {
        console.error('Erro durante o scraping:', error);

        // Erro estruturado
        return {
            status: 'error',
            message: error.message || 'Erro durante o scraping do Airbnb',
            error: error.toString(),
            data: null
        };
    }
} 