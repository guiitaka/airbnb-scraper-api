const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { scrapeAirbnb } = require('./scraper');

// Configuração de ambiente
dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

// Middleware - Configuração de CORS melhorada
app.use(cors({
    origin: ['https://www.yallah.com.br', 'https://yallah.com.br', 'http://localhost:3000', 'https://yallah-website.vercel.app'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 horas em segundos
}));
app.use(express.json());

// Adicionar headers CORS manualmente para garantir
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (
        origin.includes('yallah.com.br') ||
        origin.includes('localhost') ||
        origin.includes('yallah-website.vercel.app')
    )) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Responder imediatamente às requisições OPTIONS (pre-flight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// Rota de status da API
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Airbnb Scraper API está funcionando. Use POST /scrape-airbnb para obter dados.',
        version: '2.0.0',
        features: [
            'Extração de dados de listagens do Airbnb',
            'Proteção contra detecção de bots',
            'Rotação de proxies',
            'Extração completa em uma única etapa'
        ]
    });
});

// Rota para teste da infraestrutura
app.get('/test', (req, res) => {
    const puppeteerVersion = require('puppeteer-core/package.json').version;
    const chromiumVersion = require('@sparticuz/chromium/package.json').version;

    res.json({
        status: 'ok',
        message: 'Servidor de scraping funcionando corretamente',
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            puppeteerVersion,
            chromiumVersion
        }
    });
});

// Rota principal para scraping do Airbnb
app.post('/scrape-airbnb', async (req, res) => {
    try {
        const { url } = req.body;
        const startTime = Date.now();

        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL é obrigatória',
                error: 'MISSING_URL',
                data: null
            });
        }

        // Validar se a URL é do Airbnb
        const isValidUrl = url && (
            url.includes('airbnb.com') ||
            url.includes('airbnb.com.br') ||
            url.includes('airbnb.co.uk')
        ) && url.includes('/rooms/');

        if (!isValidUrl) {
            return res.status(400).json({
                status: 'error',
                message: 'URL inválida. Forneça uma URL válida do Airbnb',
                error: 'INVALID_URL',
                data: null
            });
        }

        console.log(`Iniciando scraping de URL: ${url}`);
        const result = await scrapeAirbnb(url);

        // Log do tempo total de processamento
        const processingTime = Date.now() - startTime;
        console.log(`Scraping concluído em ${processingTime / 1000} segundos`);

        return res.json({
            ...result,
            processingTime: `${processingTime}ms`
        });
    } catch (error) {
        console.error('Erro na rota de scraping:', error);

        // Erros de timeout recebem código específico
        if (error.message?.includes('timeout') || error.toString().includes('timeout')) {
            return res.status(504).json({
                status: 'error',
                message: 'A requisição excedeu o tempo limite. Tente novamente mais tarde.',
                error: error.toString(),
                data: null
            });
        }

        // Erros específicos do Puppeteer
        if (error.message?.includes('executablePath') || error.toString().includes('executablePath')) {
            return res.status(500).json({
                status: 'error',
                message: 'Erro na configuração do Puppeteer. O caminho para o Chrome não foi encontrado.',
                error: error.toString(),
                data: null
            });
        }

        if (error.message?.includes('Protocol error') || error.toString().includes('Protocol error')) {
            return res.status(500).json({
                status: 'error',
                message: 'Erro de protocolo do navegador durante o scraping.',
                error: error.toString(),
                data: null
            });
        }

        return res.status(500).json({
            status: 'error',
            message: 'Erro interno no servidor',
            error: error.toString(),
            data: null
        });
    }
});

// Iniciação do servidor com tratamento de erro
const server = app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

// Tratamento para encerramento limpa
process.on('SIGTERM', () => {
    console.log('SIGTERM recebido, desligando servidor...');
    server.close(() => {
        console.log('Servidor encerrado');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT recebido, desligando servidor...');
    server.close(() => {
        console.log('Servidor encerrado');
        process.exit(0);
    });
});

// Capturar erros não tratados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

module.exports = app; 