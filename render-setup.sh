#!/bin/bash

# Render setup script for Puppeteer
echo "Iniciando configuração do ambiente para Puppeteer no Render..."

# Verificar se está rodando no Render
if [ -z "$RENDER" ]; then
  echo "Este script é destinado ao ambiente Render."
  exit 0
fi

# Criar diretório de cache para Puppeteer
CACHE_DIR="./.cache/puppeteer"
echo "Criando diretório de cache: $CACHE_DIR"
mkdir -p $CACHE_DIR

# Verificar o ambiente
echo "Informações do sistema:"
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "Diretório atual: $(pwd)"
echo "Listagem de diretórios:"
ls -la

# Verificar se o Chrome está disponível no PATH
if command -v google-chrome-stable &> /dev/null; then
  echo "Google Chrome encontrado: $(which google-chrome-stable)"
  google-chrome-stable --version
else
  echo "Google Chrome não encontrado no PATH. Puppeteer usará o Chromium interno."
fi

# Verificar espaço em disco disponível
echo "Espaço em disco disponível:"
df -h .

# Verificar variáveis de ambiente relevantes
echo "Variáveis de ambiente para Puppeteer:"
echo "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: $PUPPETEER_SKIP_CHROMIUM_DOWNLOAD"
echo "PUPPETEER_EXECUTABLE_PATH: $PUPPETEER_EXECUTABLE_PATH"
echo "PUPPETEER_CACHE_DIR: $PUPPETEER_CACHE_DIR"

echo "Configuração do ambiente concluída!" 