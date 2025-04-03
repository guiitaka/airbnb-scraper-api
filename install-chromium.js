#!/usr/bin/env node

console.log('Iniciando instalação do Chromium...');

// Função para instalar Chromium
async function installChromium() {
    try {
        // Verificar se o módulo já está instalado
        const chromium = require('@sparticuz/chromium-min');

        console.log('Módulo chromium-min carregado com sucesso');
        console.log('Versão do chromium:', chromium.version);

        // Instalar Chromium explicitamente
        console.log('Iniciando download do Chromium...');

        // Caminho esperado do binário
        const execPath = await chromium.executablePath();
        console.log(`Caminho do executável do Chromium: ${execPath}`);

        console.log('Chromium instalado com sucesso!');
    } catch (error) {
        console.error('Erro ao instalar Chromium:', error);
        process.exit(1);
    }
}

// Executar a função de instalação
installChromium()
    .then(() => {
        console.log('Processo de instalação concluído com sucesso');
    })
    .catch(err => {
        console.error('Falha no processo de instalação:', err);
        process.exit(1);
    }); 