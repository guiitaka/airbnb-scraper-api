require('dotenv').config();
const express = require('express');
const cors = require('cors');
const scraper = require('./scraper');

const app = express();

// Middleware
app.use(cors({
    origin: '*', // Em produção, restringir para os domínios específicos
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Rota de teste para verificar se a API está online
app.get('/', (req, res) => {
    res.json({ status: 'online', message: 'Airbnb Scraper API is running' });
});

// Rota para scraping do Airbnb
app.post('/scrape-airbnb', async (req, res) => {
    try {
        const { url, step = 1 } = req.body;

        if (!url || !url.includes('airbnb.com')) {
            return res.status(400).json({
                error: 'URL inválida. Por favor, forneça uma URL válida do Airbnb'
            });
        }

        console.log(`Iniciando scraping da URL: ${url}, Etapa: ${step}`);
        const result = await scraper.scrapeAirbnb(url, step);

        return res.json(result);
    } catch (error) {
        console.error('Erro durante o scraping:', error);
        return res.status(500).json({
            error: 'Ocorreu um erro durante o scraping',
            message: error.message
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV}`);
}); 