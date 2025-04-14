#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Iniciando configuração do ambiente de scraping...');

// Função para configurar ambiente
async function configureEnvironment() {
    try {
        console.log('Verificando instalação do Chromium...');

        // Verificar se o módulo foi instalado corretamente
        try {
            const chromium = require('@sparticuz/chromium');
            console.log('Chromium carregado com sucesso');
            console.log('Versão do chromium: ' + chromium.args[0] || 'Não disponível');
        } catch (error) {
            console.error('Erro ao carregar @sparticuz/chromium:', error);
            console.log('Tentando instalar @sparticuz/chromium...');
            execSync('npm install @sparticuz/chromium', { stdio: 'inherit' });
        }

        // Verificar puppeteer-core
        try {
            const puppeteer = require('puppeteer-core');
            console.log('puppeteer-core carregado com sucesso');
        } catch (error) {
            console.error('Erro ao carregar puppeteer-core:', error);
            console.log('Tentando instalar puppeteer-core...');
            execSync('npm install puppeteer-core', { stdio: 'inherit' });
        }

        // Criar diretório de cache se não existir
        const cacheDir = path.join(process.cwd(), '.cache');
        if (!fs.existsSync(cacheDir)) {
            console.log('Criando diretório de cache:', cacheDir);
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        console.log('Configuração concluída com sucesso!');
        return true;
    } catch (error) {
        console.error('Erro durante a configuração:', error);
        return false;
    }
}

// Executar a função de configuração
configureEnvironment()
    .then((success) => {
        if (success) {
            console.log('Processo de configuração concluído com sucesso');
            process.exit(0);
        } else {
            console.error('Falha no processo de configuração');
            process.exit(1);
        }
    })
    .catch(err => {
        console.error('Falha no processo de configuração:', err);
        process.exit(1);
    }); 