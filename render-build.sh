#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting Render build script..."

# Instalar dependências do sistema necessárias para o Puppeteer
echo "Installing required system dependencies for Puppeteer..."
apt-get update
apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
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
    xdg-utils || true

# Download do Chrome diretamente (abordagem BigAlRender)
STORAGE_DIR=/opt/render/project/.render

if [[ ! -d $STORAGE_DIR/chrome ]]; then
  echo "...Downloading Chrome directly"
  mkdir -p $STORAGE_DIR/chrome
  cd $STORAGE_DIR/chrome
  wget -P ./ https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  # Usando método mais confiável como sugerido por chpeck no Gist
  ar x google-chrome-stable_current_amd64.deb
  tar -xf data.tar.xz -C $STORAGE_DIR/chrome
  rm ./google-chrome-stable_current_amd64.deb data.tar.xz || true
  cd $OLDPWD # Voltar ao diretório original
else
  echo "...Using Chrome from cache"
fi

# Adicionar o Chrome ao PATH para ser encontrado pelo Puppeteer
export PATH="${PATH}:/opt/render/project/.render/chrome/opt/google/chrome"
export CHROME_BIN="/opt/render/project/.render/chrome/opt/google/chrome/chrome"
echo "Chrome binary path: $CHROME_BIN"

# Set environment variables for Puppeteer
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH="$CHROME_BIN"
echo "Configured Puppeteer to use Chrome at: $PUPPETEER_EXECUTABLE_PATH"

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

# Verificar se o Chrome está no PATH
echo "Checking Chrome binary path..."
which google-chrome || echo "Chrome not found in PATH"
which google-chrome-stable || echo "Chrome-stable not found in PATH"
ls -la /opt/render/project/.render/chrome/opt/google/chrome/ || echo "Chrome directory not accessible"

# Verificar se o Puppeteer foi instalado corretamente
echo "Running Puppeteer checks..."
node check-puppeteer.js || true

echo "Render build script completed!" 