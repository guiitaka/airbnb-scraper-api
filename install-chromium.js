#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Iniciando configuração do ambiente de scraping...');

// Função para configurar ambiente
async function configureEnvironment() {
    try {
        console.log('Verificando chrome-aws-lambda...');

        // Verificar se o módulo foi instalado corretamente
        try {
            const chromium = require('chrome-aws-lambda');
            console.log('chrome-aws-lambda carregado com sucesso');

            // Verificar versão
            console.log('Versão do chromium: ' + (chromium.version || 'Não disponível'));
        } catch (error) {
            console.error('Erro ao carregar chrome-aws-lambda:', error);
        }

        // Verificar puppeteer-extra
        try {
            const puppeteerExtra = require('puppeteer-extra');
            console.log('puppeteer-extra carregado com sucesso');
        } catch (error) {
            console.error('Erro ao carregar puppeteer-extra:', error);
        }

        // Verificar puppeteer-extra-plugin-stealth
        try {
            const stealthPlugin = require('puppeteer-extra-plugin-stealth');
            console.log('puppeteer-extra-plugin-stealth carregado com sucesso');
        } catch (error) {
            console.error('Erro ao carregar puppeteer-extra-plugin-stealth:', error);
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