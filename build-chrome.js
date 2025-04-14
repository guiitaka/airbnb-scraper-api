const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const DOWNLOAD_TIMEOUT = 120000; // 2 minutos
const streamPipeline = promisify(pipeline);

// Verificar se já existe o Chrome no diretório para acelerar o processo
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), '.chrome');
const CHROME_PATH = path.join(STORAGE_DIR, 'chrome-linux64', 'chrome');

// Se o Chrome já existe, podemos pular o download
if (fs.existsSync(CHROME_PATH)) {
    console.log('✅ Chrome já existe em:', CHROME_PATH);
    console.log('Definindo permissões...');
    try {
        execSync(`chmod +x "${CHROME_PATH}"`);
        console.log('Permissões definidas com sucesso');
    } catch (e) {
        console.log('Aviso: Não foi possível definir permissões:', e.message);
    }

    // Definir variáveis de ambiente
    process.env.CHROME_BIN = CHROME_PATH;
    process.env.PUPPETEER_EXECUTABLE_PATH = CHROME_PATH;

    // Escrever path em um arquivo para uso posterior
    fs.writeFileSync('.chrome-path', CHROME_PATH);
    console.log('Caminho do Chrome salvo em .chrome-path');

    // Instalar dependências do projeto
    console.log('Instalando dependências do projeto...');
    execSync('npm install', { stdio: 'inherit' });

    console.log('Build concluído com sucesso! (Chrome já existente)');
    process.exit(0);
}

async function downloadFileWithTimeout(url, destination, timeout) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url} to ${destination}...`);

        const request = https.get(url, response => {
            if (response.statusCode !== 200) {
                fs.unlinkSync(destination);
                reject(new Error(`Download failed with status code: ${response.statusCode}`));
                return;
            }

            const writer = fs.createWriteStream(destination);
            let downloadedBytes = 0;

            response.on('data', chunk => {
                downloadedBytes += chunk.length;
                process.stdout.write(`Downloaded: ${Math.round(downloadedBytes / 1024 / 1024)}MB\r`);
            });

            response.pipe(writer);

            writer.on('finish', () => {
                writer.close();
                console.log(`\nDownload completed: ${Math.round(downloadedBytes / 1024 / 1024)}MB total`);
                resolve();
            });

            writer.on('error', err => {
                fs.unlinkSync(destination);
                reject(err);
            });
        });

        // Set timeout
        const timeoutId = setTimeout(() => {
            request.abort();
            fs.unlinkSync(destination);
            reject(new Error(`Download timed out after ${timeout / 1000} seconds`));
        }, timeout);

        request.on('error', err => {
            clearTimeout(timeoutId);
            fs.unlinkSync(destination);
            reject(err);
        });

        request.on('close', () => {
            clearTimeout(timeoutId);
        });
    });
}

async function main() {
    try {
        console.log('Starting Chrome installation...');

        // Criar diretório de armazenamento
        if (!fs.existsSync(STORAGE_DIR)) {
            console.log(`Creating directory: ${STORAGE_DIR}`);
            fs.mkdirSync(STORAGE_DIR, { recursive: true });
        }

        // URL do Chrome para Linux
        const chromeUrl = 'https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/120.0.6099.71/linux64/chrome-linux64.zip';
        const zipPath = path.join(STORAGE_DIR, 'chrome.zip');

        // Baixar o Chrome - com timeout
        try {
            console.log('⏱️ Downloading Chrome with 2 minute timeout...');
            await downloadFileWithTimeout(chromeUrl, zipPath, DOWNLOAD_TIMEOUT);
        } catch (downloadError) {
            console.error('❌ Error downloading Chrome:', downloadError.message);
            console.log('☕ Continuing build without Chrome - will use system Chrome if available');

            // Instalar dependências do projeto mesmo sem o Chrome
            console.log('📦 Installing project dependencies...');
            execSync('npm install', { stdio: 'inherit' });

            console.log('✅ Build completed (but without local Chrome)');
            process.exit(0);
        }

        // Extrair o arquivo
        console.log('📂 Extracting Chrome...');
        execSync(`unzip -q -o ${zipPath} -d ${STORAGE_DIR}`, { stdio: 'inherit' });

        // Remover o arquivo zip para economizar espaço
        console.log('🧹 Cleaning up...');
        fs.unlinkSync(zipPath);

        // Verificar se a extração foi bem-sucedida
        if (fs.existsSync(CHROME_PATH)) {
            console.log(`✅ Chrome binary found at: ${CHROME_PATH}`);

            // Tornar o binário executável
            execSync(`chmod +x "${CHROME_PATH}"`);
            console.log('Permissões definidas no binário do Chrome');

            // Definir variáveis de ambiente
            process.env.CHROME_BIN = CHROME_PATH;
            process.env.PUPPETEER_EXECUTABLE_PATH = CHROME_PATH;

            // Escrever path em um arquivo para uso posterior
            fs.writeFileSync('.chrome-path', CHROME_PATH);
            console.log('Caminho do Chrome salvo em .chrome-path');
        } else {
            console.error('⚠️ Chrome binary not found after extraction. Will use system Chrome if available.');
        }

        // Instalar dependências do projeto
        console.log('📦 Installing project dependencies...');
        execSync('npm install', { stdio: 'inherit' });

        console.log('✅ Build completed successfully!');
    } catch (error) {
        console.error('❌ Build failed:', error.message);

        // Mesmo em caso de erro, tentar instalar as dependências
        try {
            console.log('📦 Trying to install dependencies despite error...');
            execSync('npm install', { stdio: 'inherit' });
            console.log('Dependencies installed successfully');
        } catch (npmError) {
            console.error('❌ Failed to install dependencies:', npmError.message);
        }

        process.exit(1);
    }
}

main(); 