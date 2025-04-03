# Airbnb Scraper API

API para extração de dados de anúncios do Airbnb.

## Descrição

Esta API permite extrair informações de anúncios do Airbnb, incluindo:
- Título, descrição e tipo de imóvel
- Preço por noite, quartos, banheiros, camas, capacidade de hóspedes
- Comodidades
- Fotos do imóvel

## Tecnologias

- Node.js
- Express
- Puppeteer
- Docker

## Como usar

### Endpoints

#### GET /
Verifica se a API está online.

**Resposta:**
```json
{
  "status": "online",
  "message": "Airbnb Scraper API is running"
}
```

#### POST /scrape-airbnb
Extrai dados de um anúncio do Airbnb.

**Parâmetros (JSON):**
```json
{
  "url": "https://www.airbnb.com.br/rooms/123456",
  "step": 1
}
```

- `url`: URL completa do anúncio do Airbnb
- `step`: Etapa do scraping (1-4)
  - 1: Informações básicas (título, descrição, tipo)
  - 2: Preço e capacidade
  - 3: Comodidades
  - 4: Fotos

**Exemplo de resposta (Etapa 1):**
```json
{
  "status": "partial",
  "data": {
    "title": "Apartamento com vista para o mar",
    "description": "Lindo apartamento com vista privilegiada...",
    "type": "apartamento"
  },
  "step": 1,
  "totalSteps": 4,
  "message": "Informações básicas extraídas com sucesso"
}
```

## Executando localmente

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento
npm run dev

# Iniciar em modo produção
npm start
```

## Executando com Docker

```bash
# Construir a imagem
docker build -t airbnb-scraper-api .

# Executar o contêiner
docker run -p 8080:8080 airbnb-scraper-api
``` 