#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting Render build script..."

# Instalar dependências do sistema necessárias para o Puppeteer
echo "Installing required system dependencies for Puppeteer..."
apt-get update
apt-get install -y \
    fonts-liberation \
    gconf-service \
    libappindicator1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    wget \
    ca-certificates || true

# Set environment variables for Puppeteer
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
export PUPPETEER_CACHE_DIR=$(pwd)/.cache/puppeteer

# Ensure cache directory exists
mkdir -p $PUPPETEER_CACHE_DIR
echo "Created puppeteer cache directory at $PUPPETEER_CACHE_DIR"

# Check if we have a cached Puppeteer
if [[ -d $XDG_CACHE_HOME/puppeteer ]]; then
  echo "Found existing Puppeteer cache in build cache, copying to project directory"
  cp -R $XDG_CACHE_HOME/puppeteer/ .cache/
else
  echo "No existing Puppeteer cache found in build cache"
fi

# Limpar instalações anteriores para evitar conflitos
echo "Cleaning node_modules..."
rm -rf node_modules package-lock.json

# Instalar dependências com npm
echo "Installing dependencies..."
npm install

# Instalar explicitamente cada dependência do puppeteer para garantir que tudo funcione
echo "Installing puppeteer and plugins explicitly..."
npm install --save puppeteer@21.1.1
npm install --save puppeteer-extra@3.3.6
npm install --save puppeteer-extra-plugin-stealth@2.11.2
npm install --save puppeteer-extra-plugin-adblocker@2.13.6
npm install --save puppeteer-extra-plugin-anonymize-ua@2.4.6
npm install --save random-useragent@0.5.0

# Verificar se o Puppeteer foi instalado corretamente
echo "Running Puppeteer checks..."
node check-puppeteer.js || true

# Store the cache back to the build cache location
echo "Saving Puppeteer cache for future builds..."
mkdir -p $XDG_CACHE_HOME/puppeteer
cp -R .cache/puppeteer/ $XDG_CACHE_HOME/ || echo "Warning: Could not save cache (this is normal for first build)"

echo "Render build script completed!" 