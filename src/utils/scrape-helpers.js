/**
 * Funções Auxiliares para Scraping
 * 
 * Utilitários para melhorar o sucesso do scraping no Airbnb
 * incluindo esperas inteligentes, verificações de bloqueio e
 * comportamento mais humano durante a navegação.
 */

// Função para aguardar entre solicitações (simula comportamento humano)
function randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Verifica se a resposta contém sinais de bloqueio ou captcha
 * @param {string} html - Conteúdo HTML da resposta
 * @returns {boolean} - True se detectado bloqueio, false caso contrário
 */
function isBlocked(html) {
    if (!html) return true;

    const blockSignals = [
        'Access to this page has been denied',
        'Please verify you are a human',
        'captcha',
        'CAPTCHA',
        'Robot or human?',
        'Please complete the security check to access',
        'Sorry, we couldn\'t process your request',
        'Your request has been blocked',
        'We\'ve detected unusual activity from your computer network',
        'cf-error-code',
        '<title>Airbnb - 403 Forbidden</title>',
        '<title>403 Forbidden</title>',
        '<title>Access Denied</title>'
    ];

    return blockSignals.some(signal => html.includes(signal));
}

/**
 * Verifica se a resposta contém os dados esperados do Airbnb
 * @param {string} html - Conteúdo HTML da resposta
 * @returns {boolean} - True se a resposta parece válida
 */
function isValidResponse(html) {
    if (!html || html.length < 1000) return false;

    const validSignals = [
        'Airbnb',
        'serverData',
        'root.initialized.data',
        'deferred_state',
        'layout-init',
        'mediaviewer-modal'
    ];

    return validSignals.some(signal => html.includes(signal));
}

/**
 * Extrai dados JSON do script no HTML
 * @param {string} html - Conteúdo HTML da resposta
 * @param {string} dataPattern - Padrão para encontrar os dados (regex ou string)
 * @returns {Object|null} - Dados extraídos ou null se não encontrados
 */
function extractJsonData(html, dataPattern = 'window.dataCache') {
    try {
        if (!html) return null;

        // Encontra o script que contém os dados
        const scriptRegex = new RegExp(`<script>.*?${dataPattern}.*?=\\s*(\\{.*?\\});.*?</script>`, 's');
        const match = html.match(scriptRegex);

        if (!match || !match[1]) {
            // Tenta outro padrão comum no Airbnb
            const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s;
            const nextDataMatch = html.match(nextDataRegex);

            if (nextDataMatch && nextDataMatch[1]) {
                return JSON.parse(nextDataMatch[1]);
            }

            // Tenta o padrão apollo cache
            const apolloRegex = /window\.__APOLLO_STATE__\s*=\s*(\{.*?\});/s;
            const apolloMatch = html.match(apolloRegex);

            if (apolloMatch && apolloMatch[1]) {
                return JSON.parse(apolloMatch[1]);
            }

            return null;
        }

        return JSON.parse(match[1]);
    } catch (error) {
        console.error('Erro ao extrair JSON:', error.message);
        return null;
    }
}

/**
 * Scrape com retry estratégico
 * @param {Function} scrapeFn - Função que realiza o scraping
 * @param {number} maxRetries - Número máximo de tentativas
 * @param {number} initialDelay - Delay inicial entre tentativas (ms)
 * @returns {Promise<Object>} - Resultado do scraping ou erro
 */
async function scrapeWithRetry(scrapeFn, maxRetries = 3, initialDelay = 2000) {
    let lastError = null;
    let currentDelay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`Tentativa ${attempt}/${maxRetries}...`);
                await randomDelay(currentDelay, currentDelay * 1.5);
                // Aumenta o delay exponencialmente a cada tentativa
                currentDelay *= 2;
            }

            const result = await scrapeFn();

            if (result && (!result.html || isBlocked(result.html))) {
                throw new Error("Detecção de bloqueio ou captcha");
            }

            if (result && result.html && !isValidResponse(result.html)) {
                throw new Error("Resposta incompleta ou inválida");
            }

            return result;
        } catch (error) {
            console.error(`Erro na tentativa ${attempt}:`, error.message);
            lastError = error;
        }
    }

    throw new Error(`Falha após ${maxRetries} tentativas: ${lastError?.message || 'Erro desconhecido'}`);
}

/**
 * Valida os dados obtidos para garantir que são úteis
 * @param {Object} data - Dados extraídos do scraping
 * @returns {boolean} - True se os dados parecem válidos
 */
function validateData(data) {
    if (!data) return false;

    // Verifica se há dados mínimos necessários em diferentes formatos
    if (typeof data === 'object') {
        // Verifica propriedades comuns em diferentes formatos de resposta do Airbnb
        if (data.data && (data.data.presentation || data.data.dora)) return true;
        if (data.props && data.props.pageProps) return true;
        if (data.listing || data.listingInfo) return true;
        if (data.pdpParts) return true;

        // Se chegamos até aqui mas temos um objeto com propriedades, pode ser válido
        return Object.keys(data).length > 5;
    }

    return false;
}

module.exports = {
    randomDelay,
    isBlocked,
    isValidResponse,
    extractJsonData,
    scrapeWithRetry,
    validateData
}; 