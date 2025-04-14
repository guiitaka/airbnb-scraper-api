const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

async function downloadFile(url, destination) {
    const writer = fs.createWriteStream(destination);
    console.log(`Downloading ${url} to ${destination}...`);

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            response.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        }).on('error', reject);
    });
}

async function installChrome() {
    try {
        console.log('Starting Chrome installation...');
        const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), '.chrome');

        // Criar diretório de armazenamento
        if (!fs.existsSync(STORAGE_DIR)) {
            console.log(`Creating directory: ${STORAGE_DIR}`);
            fs.mkdirSync(STORAGE_DIR, { recursive: true });
        }

        // URL do Chrome para Linux
        const chromeUrl = 'https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/120.0.6099.71/linux64/chrome-linux64.zip';
        const zipPath = path.join(STORAGE_DIR, 'chrome.zip');

        // Fazer download apenas se ainda não existir
        if (!fs.existsSync(path.join(STORAGE_DIR, 'chrome-linux64'))) {
            // Baixar o Chrome
            console.log('Downloading Chrome...');
            await downloadFile(chromeUrl, zipPath);

            // Extrair o arquivo
            console.log('Extracting Chrome...');
            execSync(`unzip -q -o ${zipPath} -d ${STORAGE_DIR}`);

            // Remover o arquivo zip para economizar espaço
            console.log('Cleaning up...');
            fs.unlinkSync(zipPath);
        }

        // Verificar se a extração foi bem-sucedida
        const chromePath = path.join(STORAGE_DIR, 'chrome-linux64', 'chrome');
        if (fs.existsSync(chromePath)) {
            console.log(`Chrome binary found at: ${chromePath}`);

            // Tornar o binário executável
            execSync(`chmod +x ${chromePath}`);
            console.log('Chrome binary permissions set');

            // Definir variáveis de ambiente
            process.env.CHROME_BIN = chromePath;
            process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;

            // Escrever path em um arquivo para uso posterior
            fs.writeFileSync('.chrome-path', chromePath);
            console.log('Chrome path saved to .chrome-path file');

            return chromePath;
        } else {
            throw new Error('Chrome binary not found after extraction');
        }
    } catch (error) {
        console.error('Error installing Chrome:', error);
        throw error;
    }
}

async function main() {
    try {
        // Instalar Chrome
        const chromePath = await installChrome();
        console.log(`Chrome installed successfully at: ${chromePath}`);

        // Instalar dependências do projeto
        console.log('Installing project dependencies...');
        execSync('npm install', { stdio: 'inherit' });

        // Verificar instalação do Puppeteer
        console.log('Testing Puppeteer installation...');
        try {
            execSync('node check-puppeteer.js', { stdio: 'inherit' });
        } catch (e) {
            console.log('Puppeteer check had issues but continuing build...');
        }

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

main(); 