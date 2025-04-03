const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { scrapeAirbnb } = require('./scraper');

// Configuração de ambiente
dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`URL da API: http://localhost:${PORT}`);
}); 