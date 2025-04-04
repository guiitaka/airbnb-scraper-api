// Simplified scraper implementation 
// const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Configuração dos diretórios para o Puppeteer
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '..', '.cache', 'puppeteer');

// Helper function para timeout
const safeWaitForTimeout = async (timeout) => {
    await new Promise(resolve => setTimeout(resolve, timeout));
};

// Função para limpar e simplificar a URL do Airbnb antes do scraping
function cleanAirbnbUrl(url) {
    try {
        // Verificar se é uma URL válida
        const urlObj = new URL(url);

        // Manter apenas o caminho principal e os parâmetros essenciais
        let cleanUrl = `${urlObj.origin}${urlObj.pathname}`;

        // Adicionar apenas check_in e check_out se existirem
        const checkIn = urlObj.searchParams.get('check_in');
        const checkOut = urlObj.searchParams.get('check_out');

        if (checkIn && checkOut) {
            cleanUrl += `?check_in=${checkIn}&check_out=${checkOut}`;
        }

        console.log(`URL original: ${url}`);
        console.log(`URL limpa: ${cleanUrl}`);
        return cleanUrl;
    } catch (e) {
        console.error('Erro ao limpar URL:', e);
        return url; // Retornar a URL original em caso de erro
    }
}

// Mock data implementation temporária para permitir deploy
async function scrapeAirbnb(url, step = 1) {
    console.log(`Iniciando scraping mock para URL: ${url}, Etapa: ${step}`);

    try {
        // Limpar a URL
        const cleanUrl = cleanAirbnbUrl(url);
        console.log(`URL limpa: ${cleanUrl}`);

        // Esperar um pouco para simular processamento
        await safeWaitForTimeout(1000);

        let result = {
            status: 'success',
            step: step,
            totalSteps: 4,
            message: 'Dados mockados para facilitar o deploy',
            data: {}
        };

        // ETAPA 1: Informações básicas
        if (step === 1) {
            result.data = {
                title: "Apartamento com vista para o mar",
                description: "Lindo apartamento com vista para o mar, localizado próximo à praia. Perfeito para casais ou pequenas famílias.",
                type: "apartamento",
                address: "Próximo à praia"
            };
        }

        // ETAPA 2: Preço e capacidade
        else if (step === 2) {
            result.data = {
                price: 250,
                rooms: 2,
                bathrooms: 1,
                beds: 2,
                guests: 4
            };
        }

        // ETAPA 3: Comodidades
        else if (step === 3) {
            result.data = {
                amenities: [
                    { text: "Wi-Fi" },
                    { text: "Ar condicionado" },
                    { text: "Cozinha completa" },
                    { text: "TV" },
                    { text: "Piscina" }
                ],
                amenitiesWithIcons: [
                    "Wi-Fi",
                    "Ar condicionado",
                    "Cozinha completa",
                    "TV",
                    "Piscina"
                ]
            };
        }

        // ETAPA 4: Fotos
        else if (step === 4) {
            result.data = {
                photos: [
                    "https://a0.muscache.com/im/pictures/miso/Hosting-12345/original/123456-123.jpg",
                    "https://a0.muscache.com/im/pictures/miso/Hosting-12345/original/123456-456.jpg",
                    "https://a0.muscache.com/im/pictures/miso/Hosting-12345/original/123456-789.jpg"
                ]
            };
        }

        console.log(`Dados mockados gerados para etapa ${step}`);
        return result;

    } catch (error) {
        console.error('Erro durante mock scraping:', error);
        return {
            status: 'error',
            step: step,
            totalSteps: 4,
            message: error.message || 'Erro desconhecido',
            error: error.toString(),
            data: {}
        };
    }
}

module.exports = { scrapeAirbnb }; 