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
        version: '1.0.0'
    });
});

// Rota para scraping do Airbnb
app.post('/scrape-airbnb', async (req, res) => {
    try {
        const { url, step = 1 } = req.body;

        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL é obrigatória'
            });
        }

        // Validar se a URL é do Airbnb
        if (!url.includes('airbnb.com')) {
            return res.status(400).json({
                status: 'error',
                message: 'URL inválida. Forneça uma URL válida do Airbnb'
            });
        }

        console.log(`Iniciando scraping de URL: ${url}, Etapa: ${step}`);
        const result = await scrapeAirbnb(url, step);

        // Se tivemos um erro durante o scraping
        if (result.status === 'error') {
            return res.status(result.error?.includes('timeout') ? 504 : 500).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error('Erro na rota de scraping:', error);

        // Erros de timeout recebem código específico
        if (error.message?.includes('timeout') || error.toString().includes('timeout')) {
            return res.status(504).json({
                status: 'error',
                message: 'A requisição excedeu o tempo limite. Tente novamente mais tarde ou use uma URL mais simples.',
                error: error.toString()
            });
        }

        return res.status(500).json({
            status: 'error',
            message: 'Erro interno no servidor',
            error: error.toString()
        });
    }
});

// Rota para scraping completo do Airbnb (todas as etapas)
app.post('/scrape-airbnb-complete', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL é obrigatória'
            });
        }

        // Validar se a URL é do Airbnb
        if (!url.includes('airbnb.com')) {
            return res.status(400).json({
                status: 'error',
                message: 'URL inválida. Forneça uma URL válida do Airbnb'
            });
        }

        console.log(`Iniciando scraping completo da URL: ${url}`);

        // Realizar o scraping em todas as etapas
        const results = {
            status: 'success',
            message: 'Scraping completo realizado com sucesso',
            data: {}
        };

        let hasErrors = false;

        // Etapa 1: Informações básicas
        try {
            console.log('Iniciando etapa 1: Informações básicas');
            const step1Result = await scrapeAirbnb(url, 1);

            if (step1Result.status === 'success') {
                results.data = { ...results.data, ...step1Result.data };
            } else {
                console.warn('Etapa 1 falhou:', step1Result.message);
                hasErrors = true;
            }
        } catch (error) {
            console.error('Erro na etapa 1:', error);
            hasErrors = true;
        }

        // Etapa 2: Preço e capacidade
        try {
            console.log('Iniciando etapa 2: Preço e capacidade');
            const step2Result = await scrapeAirbnb(url, 2);

            if (step2Result.status === 'success') {
                results.data = { ...results.data, ...step2Result.data };
            } else {
                console.warn('Etapa 2 falhou:', step2Result.message);
                hasErrors = true;
            }
        } catch (error) {
            console.error('Erro na etapa 2:', error);
            hasErrors = true;
        }

        // Etapa 3: Comodidades
        try {
            console.log('Iniciando etapa 3: Comodidades');
            const step3Result = await scrapeAirbnb(url, 3);

            if (step3Result.status === 'success') {
                results.data = { ...results.data, ...step3Result.data };
            } else {
                console.warn('Etapa 3 falhou:', step3Result.message);
                hasErrors = true;
            }
        } catch (error) {
            console.error('Erro na etapa 3:', error);
            hasErrors = true;
        }

        // Etapa 4: Fotos
        try {
            console.log('Iniciando etapa 4: Fotos');
            const step4Result = await scrapeAirbnb(url, 4);

            if (step4Result.status === 'success') {
                results.data = { ...results.data, ...step4Result.data };
            } else {
                console.warn('Etapa 4 falhou:', step4Result.message);
                hasErrors = true;
            }
        } catch (error) {
            console.error('Erro na etapa 4:', error);
            hasErrors = true;
        }

        // Garantir que pelo menos temos campos obrigatórios
        if (!results.data.title) {
            results.data.title = 'Título não disponível';
        }

        if (!results.data.description) {
            results.data.description = 'Descrição não disponível';
        }

        if (!results.data.type) {
            results.data.type = 'outro';
        }

        if (!results.data.price) {
            results.data.price = 0;
        }

        if (!results.data.rooms) {
            results.data.rooms = 1;
        }

        if (!results.data.bathrooms) {
            results.data.bathrooms = 1;
        }

        if (!results.data.beds) {
            results.data.beds = 1;
        }

        if (!results.data.guests) {
            results.data.guests = 2;
        }

        if (!results.data.amenities) {
            results.data.amenities = [];
        }

        if (!results.data.photos) {
            results.data.photos = [];
        }

        // Atualizar o status se houver erros, mas ainda retornar os dados coletados
        if (hasErrors) {
            results.status = 'partial';
            results.message = 'Scraping parcial: algumas etapas falharam, mas dados foram coletados';
        }

        // Adicionar a URL original
        results.data.sourceUrl = url;

        return res.json(results);

    } catch (error) {
        console.error('Erro no scraping completo:', error);

        return res.status(500).json({
            status: 'error',
            message: 'Erro interno no servidor durante o scraping completo',
            error: error.toString()
        });
    }
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`URL da API: http://localhost:${PORT}`);
}); 