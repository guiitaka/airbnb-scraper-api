/**
 * Gerenciador de Cookies para Scraping
 * 
 * Armazena e gerencia cookies de sessões bem-sucedidas para uso em 
 * futuras requisições, melhorando a taxa de sucesso do scraping.
 */

// Armazenamento em memória para cookies (em ambiente de produção, usar Redis ou banco de dados)
let cookieStore = {
    airbnb: {
        cookies: [],
        lastSuccess: null,
        successCount: 0,
        rotationIndex: 0
    }
};

/**
 * Adiciona cookies ao armazenamento
 * @param {Array|string} cookies - Cookies para armazenar
 * @param {boolean} successful - Indica se a requisição foi bem-sucedida
 * @returns {void}
 */
function storeCookies(cookies, successful = true) {
    if (!cookies) return;

    // Converte string de cookies para array se necessário
    const cookieArray = typeof cookies === 'string'
        ? cookies.split(';').map(c => c.trim())
        : cookies;

    if (successful) {
        // Adiciona os cookies bem-sucedidos ao início do array (prioridade)
        cookieStore.airbnb.cookies.unshift(cookieArray);
        cookieStore.airbnb.lastSuccess = new Date().toISOString();
        cookieStore.airbnb.successCount++;

        // Limita o tamanho do array para evitar crescimento excessivo
        if (cookieStore.airbnb.cookies.length > 10) {
            cookieStore.airbnb.cookies = cookieStore.airbnb.cookies.slice(0, 10);
        }
    } else {
        // Para cookies de sessões com falha, apenas armazena se não temos muitos
        if (cookieStore.airbnb.cookies.length < 3) {
            cookieStore.airbnb.cookies.push(cookieArray);
        }
    }
}

/**
 * Obtém o próximo conjunto de cookies em rotação
 * @returns {string|null} - String de cookies formatada para o header ou null
 */
function getNextCookies() {
    const { cookies, rotationIndex } = cookieStore.airbnb;

    if (!cookies || cookies.length === 0) {
        return null;
    }

    // Rotação dos cookies disponíveis
    const nextIndex = (rotationIndex + 1) % cookies.length;
    cookieStore.airbnb.rotationIndex = nextIndex;

    const cookieSet = cookies[nextIndex];

    // Formata os cookies para o header
    if (Array.isArray(cookieSet)) {
        return cookieSet.join('; ');
    }

    return cookieSet;
}

/**
 * Extrai cookies da resposta e os armazena
 * @param {Object} response - Resposta HTTP
 * @param {boolean} successful - Indica se a requisição foi bem-sucedida
 */
function extractAndStoreCookies(response, successful = true) {
    if (!response || !response.headers) return;

    try {
        // Obtém cookies do header da resposta
        const setCookieHeader = response.headers.get('set-cookie') ||
            response.headers.get('Set-Cookie');

        if (setCookieHeader) {
            storeCookies(setCookieHeader, successful);
        }
    } catch (error) {
        console.error('Erro ao extrair cookies:', error.message);
    }
}

/**
 * Verifica se temos cookies válidos disponíveis
 * @returns {boolean} - True se há cookies disponíveis
 */
function hasCookies() {
    return cookieStore.airbnb.cookies.length > 0;
}

/**
 * Limpa todos os cookies armazenados
 */
function clearCookies() {
    cookieStore.airbnb.cookies = [];
    cookieStore.airbnb.rotationIndex = 0;
    cookieStore.airbnb.successCount = 0;
}

/**
 * Obtém estatísticas sobre os cookies armazenados
 * @returns {Object} - Estatísticas sobre cookies
 */
function getCookieStats() {
    return {
        cookieSets: cookieStore.airbnb.cookies.length,
        lastSuccess: cookieStore.airbnb.lastSuccess,
        successCount: cookieStore.airbnb.successCount
    };
}

module.exports = {
    storeCookies,
    getNextCookies,
    extractAndStoreCookies,
    hasCookies,
    clearCookies,
    getCookieStats
}; 