/**
 * Proxy Rotator - Implementa rotação de proxies gratuitos para web scraping
 */

// Lista de proxies públicos gratuitos
// Esta lista deve ser atualizada regularmente pois proxies gratuitos podem ficar indisponíveis
const FREE_PROXIES = [
    // Format: { host: 'ip', port: port, protocol: 'http/https' }
    // Proxies serão adicionados dinamicamente via API
];

// Cache de proxies funcionais com timestamp
let workingProxies = [];
let lastProxyFetch = null;
const PROXY_FETCH_INTERVAL = 1000 * 60 * 60; // 1 hora

/**
 * Busca proxies gratuitos de APIs públicas
 * @returns {Promise<Array>} Lista de proxies
 */
async function fetchFreeProxies() {
    try {
        // Podemos usar múltiplas fontes para aumentar a confiabilidade
        const sources = [
            'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&filterUpTime=90&protocols=http%2Chttps',
            'https://www.proxy-list.download/api/v1/get?type=https',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
            'https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/data.txt'
        ];

        // Alterna entre as fontes para não sobrecarregar uma única API
        const sourceIndex = Math.floor(Math.random() * sources.length);
        const source = sources[sourceIndex];

        console.log(`Buscando proxies em: ${source}`);

        const response = await fetch(source, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 8000
        });

        if (!response.ok) return [];

        // Processar diferentes formatos de respostas
        let proxies = [];

        // GitHub raw text format (IP:PORT format)
        if (source.includes('githubusercontent.com')) {
            const text = await response.text();
            proxies = text.split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => {
                    const [host, port] = line.trim().split(':');
                    return {
                        host,
                        port: parseInt(port),
                        protocol: source.includes('https.txt') ? 'https' : 'http'
                    };
                });
        }
        // GeoNode API JSON format
        else if (source.includes('geonode')) {
            const data = await response.json();
            proxies = data.data.map(p => ({
                host: p.ip,
                port: parseInt(p.port),
                protocol: p.protocols[0],
                country: p.country,
                anonymity: p.anonymityLevel
            }));
        }
        // proxy-list.download format
        else if (source.includes('proxy-list.download')) {
            const text = await response.text();
            proxies = text.split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => {
                    const [host, port] = line.trim().split(':');
                    return {
                        host,
                        port: parseInt(port),
                        protocol: 'https'
                    };
                });
        }
        // generic text format
        else {
            const text = await response.text();
            proxies = text.split('\n')
                .filter(line => line.trim().length > 0 && line.includes(':'))
                .map(line => {
                    const [host, port] = line.trim().split(':');
                    return {
                        host,
                        port: parseInt(port),
                        protocol: 'http'
                    };
                });
        }

        console.log(`Obtidos ${proxies.length} proxies de ${source}`);
        return proxies.filter(p => p.host && p.port);
    } catch (error) {
        console.error('Erro ao buscar proxies:', error);
        return [];
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
        const protocol = proxy.protocol === 'https' ? require('https') : require('http');
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
 * Obtém um proxy aleatório funcional
 * @returns {Promise<Object|null>} - Objeto proxy ou null se nenhum funcionar
 */
async function getWorkingProxy() {
    // Verifica se precisamos atualizar a lista de proxies
    const now = Date.now();
    if (!lastProxyFetch || (now - lastProxyFetch > PROXY_FETCH_INTERVAL) || workingProxies.length < 3) {
        console.log('Atualizando lista de proxies...');
        const newProxies = await fetchFreeProxies();
        if (newProxies.length > 0) {
            FREE_PROXIES.push(...newProxies);
            // Remover duplicatas
            const uniqueProxies = [];
            const seen = new Set();

            for (const proxy of FREE_PROXIES) {
                const key = `${proxy.host}:${proxy.port}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueProxies.push(proxy);
                }
            }

            FREE_PROXIES.length = 0;
            FREE_PROXIES.push(...uniqueProxies);

            lastProxyFetch = now;
            console.log(`Lista de proxies atualizada. Total: ${FREE_PROXIES.length}`);
        }
    }

    // Primeiro, tenta usar um proxy já testado e funcional
    if (workingProxies.length > 0) {
        // Remove proxies que estão na lista há mais de 3 horas
        workingProxies = workingProxies.filter(p =>
            (now - p.testedAt) < 1000 * 60 * 60 * 3
        );

        if (workingProxies.length > 0) {
            const randomProxy = workingProxies[Math.floor(Math.random() * workingProxies.length)].proxy;
            console.log(`Usando proxy pré-testado: ${randomProxy.host}:${randomProxy.port}`);
            return randomProxy;
        }
    }

    // Se não tiver proxies funcionais, testa alguns da lista
    const maxProxiesToTest = Math.min(10, FREE_PROXIES.length);
    const proxiesToTest = [...FREE_PROXIES]
        .sort(() => 0.5 - Math.random())
        .slice(0, maxProxiesToTest); // Testa até 10 proxies aleatórios

    console.log(`Testando ${proxiesToTest.length} proxies...`);

    // Testar proxies em paralelo para acelerar
    const testPromises = proxiesToTest.map(async (proxy) => {
        const works = await testProxy(proxy);
        return { proxy, works };
    });

    const results = await Promise.all(testPromises);
    const workingResults = results.filter(r => r.works);

    if (workingResults.length > 0) {
        // Adicionar todos os proxies funcionais à lista
        for (const result of workingResults) {
            workingProxies.push({
                proxy: result.proxy,
                testedAt: now
            });
        }

        console.log(`Encontrados ${workingResults.length} proxies funcionais`);
        const selectedProxy = workingResults[0].proxy;
        console.log(`Usando proxy: ${selectedProxy.host}:${selectedProxy.port}`);
        return selectedProxy;
    }

    console.log('Nenhum proxy funcional encontrado');
    return null; // Nenhum proxy funcionou
}

module.exports = {
    getWorkingProxy,
    fetchFreeProxies,
    testProxy
}; 