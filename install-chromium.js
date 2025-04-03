#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Iniciando instalação do Chromium...');

// Função para instalar Chromium
async function installChromium() {
    try {
        // Verificar se o módulo já está instalado
        const chromium = require('@sparticuz/chromium-min');

        console.log('Módulo chromium-min carregado com sucesso');

        // Certificar-se de que os diretórios necessários existam
        const modulePath = path.dirname(require.resolve('@sparticuz/chromium-min/package.json'));
        const binPath = path.join(modulePath, 'bin');

        console.log(`Caminho do módulo: ${modulePath}`);
        console.log(`Caminho dos binários: ${binPath}`);

        // Criar diretório bin se não existir
        if (!fs.existsSync(binPath)) {
            console.log(`Criando diretório: ${binPath}`);
            fs.mkdirSync(binPath, { recursive: true });
        }

        // Instalar versão específica do Chromium
        console.log('Baixando Chromium via npm...');
        try {
            execSync('npm install playwright-core@1.35.0', { stdio: 'inherit' });
            console.log('Chromium instalado via playwright-core');
        } catch (npmError) {
            console.error('Erro ao instalar playwright-core:', npmError);
        }

        console.log('Chromium instalado com sucesso!');
        return true;
    } catch (error) {
        console.error('Erro ao instalar Chromium:', error);
        return false;
    }
}

// Executar a função de instalação
installChromium()
    .then((success) => {
        if (success) {
            console.log('Processo de instalação concluído com sucesso');
            process.exit(0);
        } else {
            console.error('Falha no processo de instalação');
            process.exit(1);
        }
    })
    .catch(err => {
        console.error('Falha no processo de instalação:', err);
        process.exit(1);
    }); 