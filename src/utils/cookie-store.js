/**
 * Cookie Store - Gerencia cookies persistentes para evitar bloqueios em scraping
 */

// Armazenamento em memória com cookies válidos por domínio
// Na implementação real, isso poderia ser um banco de dados ou Redis
let cookieStore = {
    'airbnb.com': []
};

// Timestamp da última atualização dos cookies
let lastUpdated = {};

// Validade máxima dos cookies (8 horas)
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 8;

/**
 * Salva cookies para um domínio específico
 * @param {string} domain - Domínio (ex: airbnb.com)
 * @param {Array|string} cookies - Array de cookies ou string com cookies
 */
function saveCookies(domain, cookies) {
    if (!domain) return;

    // Normaliza o domínio removendo www e protocolo
    const normalizedDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');

    // Inicializa o store para o domínio se não existir
    if (!cookieStore[normalizedDomain]) {
        cookieStore[normalizedDomain] = [];
    }

    // Processa cookies em formato de string
    if (typeof cookies === 'string') {
        // Parse da string de cookies para array
        const cookieArray = cookies.split(';').map(c => c.trim());

        // Atualiza cada cookie individualmente
        cookieArray.forEach(cookie => {
            const [name, value] = cookie.split('=').map(part => part.trim());
            if (!name) return;

            // Remove versões antigas do mesmo cookie
            cookieStore[normalizedDomain] = cookieStore[normalizedDomain]
                .filter(c => !c.startsWith(`${name}=`));

            // Adiciona o novo cookie
            cookieStore[normalizedDomain].push(cookie);
        });
    }
    // Processa array de cookies
    else if (Array.isArray(cookies)) {
        cookies.forEach(cookie => saveCookies(normalizedDomain, cookie));
    }

    // Atualiza o timestamp
    lastUpdated[normalizedDomain] = Date.now();
}

/**
 * Retorna cookies válidos para um domínio
 * @param {string} domain - Domínio para buscar cookies
 * @returns {string} - String formatada com cookies
 */
function getCookies(domain) {
    if (!domain) return '';

    const normalizedDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');

    // Verifica se temos cookies para este domínio
    if (!cookieStore[normalizedDomain] || cookieStore[normalizedDomain].length === 0) {
        return '';
    }

    // Verifica se os cookies ainda são válidos
    const now = Date.now();
    if (lastUpdated[normalizedDomain] &&
        now - lastUpdated[normalizedDomain] > COOKIE_MAX_AGE) {
        // Cookies expirados, limpa o store
        cookieStore[normalizedDomain] = [];
        return '';
    }

    // Retorna cookies como string formatada para o header
    return cookieStore[normalizedDomain].join('; ');
}

/**
 * Extrair cookies de resposta HTTP
 * @param {Response} response - Objeto Response da API fetch
 * @param {string} domain - Domínio dos cookies
 */
function extractCookiesFromResponse(response, domain) {
    if (!response || !response.headers) return;

    // Obtém todos os headers Set-Cookie
    const cookies = response.headers.getAll('set-cookie');
    if (cookies && cookies.length) {
        // Processa e normaliza os cookies
        const processedCookies = cookies.map(cookie => cookie.split(';')[0].trim());
        saveCookies(domain, processedCookies);
    }
}

/**
 * Limpa cookies de um domínio específico
 * @param {string} domain - Domínio para limpar cookies
 */
function clearCookies(domain) {
    if (!domain) return;

    const normalizedDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
    cookieStore[normalizedDomain] = [];
    delete lastUpdated[normalizedDomain];
}

module.exports = {
    saveCookies,
    getCookies,
    extractCookiesFromResponse,
    clearCookies
}; 