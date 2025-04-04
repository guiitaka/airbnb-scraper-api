#!/bin/bash

# Render setup script for Chrome
echo "Iniciando configuração do Chrome no Render..."

# Verificar se está rodando no Render
if [ -z "$RENDER" ]; then
  echo "Este script é destinado ao ambiente Render."
  exit 0
fi

# Instalar dependências do Chrome se necessário
echo "Instalando dependências do Chrome..."
apt-get update
apt-get install -y wget gnupg ca-certificates procps libxss1 libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm-dev

# Verificar se o Chrome já está instalado
if ! command -v google-chrome-stable &> /dev/null; then
  echo "Instalando Google Chrome..."
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
  echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
  apt-get update
  apt-get install -y google-chrome-stable
else
  echo "Google Chrome já está instalado."
fi

# Verificar a versão instalada
CHROME_VERSION=$(google-chrome-stable --version)
echo "Versão do Chrome instalada: $CHROME_VERSION"

# Informações de debug
echo "Caminho do executável Chrome: $(which google-chrome-stable)"
echo "Verificando permissões do Chrome..."
ls -la $(which google-chrome-stable)

echo "Configuração do Chrome concluída!" 