// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const url = require('url');
const fs = require('fs').promises;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();

// Configurazione della sicurezza
app.use(helmet({
    contentSecurityPolicy: false  // Disabilitato per permettere il caricamento di risorse esterne
}));

// Configurazione del rate limiting
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 ora
    max: 100, // limite di 100 richieste per IP
    message: 'Troppe richieste da questo IP, riprova tra un\'ora'
});

app.use('/convert', limiter);  // Applica il rate limiting solo alle conversioni
app.use(express.json());
app.use(express.static('public'));

// Funzione per ottenere tutti i link da una pagina
async function getAllPageLinks(page, baseUrl) {
    const links = await page.evaluate((baseUrl) => {
        const anchors = document.querySelectorAll('a');
        return Array.from(anchors)
            .map(anchor => {
                let href = anchor.href;
                if (href.startsWith('/')) {
                    href = new URL(href, baseUrl).href;
                }
                return href;
            })
            .filter(href => 
                href.startsWith(baseUrl) && 
                !href.includes('#') && 
                !href.match(/\.(jpg|jpeg|png|gif|pdf|zip)$/i)
            );
    }, baseUrl);
    return [...new Set(links)];
}

app.post('/convert', async (req, res) => {
    try {
        const { targetUrl } = req.body;
        if (!targetUrl) {
            return res.status(400).json({ error: 'URL richiesto' });
        }

        // Configura Puppeteer per funzionare su Render.com
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const visitedUrls = new Set();
        const pdfs = [];
        const baseUrl = new URL(targetUrl).origin;

        async function processPage(pageUrl) {
            if (visitedUrls.has(pageUrl)) return;
            visitedUrls.add(pageUrl);

            try {
                await page.goto(pageUrl, { 
                    waitUntil: 'networkidle0',
                    timeout: 30000  // 30 secondi timeout
                });
                
                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: {
                        top: '20px',
                        right: '20px',
                        bottom: '20px',
                        left: '20px'
                    }
                });

                const filename = pageUrl
                    .replace(baseUrl, '')
                    .replace(/[^a-zA-Z0-9]/g, '_')
                    .replace(/_+/g, '_')
                    .slice(0, 50) + '.pdf';

                pdfs.push({
                    filename,
                    buffer: pdfBuffer
                });

                const links = await getAllPageLinks(page, baseUrl);
                for (const link of links) {
                    if (pdfs.length < 20) {  // Limite di 20 pagine per conversione
                        await processPage(link);
                    }
                }
            } catch (error) {
                console.error(`Error processing ${pageUrl}:`, error);
            }
        }

        await processPage(targetUrl);
        await browser.close();

        const timestamp = Date.now();
        const dirPath = path.join(__dirname, 'downloads', `site_${timestamp}`);
        await fs.mkdir(dirPath, { recursive: true });

        for (const pdf of pdfs) {
            await fs.writeFile(path.join(dirPath, pdf.filename), pdf.buffer);
        }

        res.json({
            success: true,
            message: 'Conversione completata',
            outputDir: dirPath,
            fileCount: pdfs.length
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Errore durante la conversione' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in esecuzione sulla porta ${PORT}`);
});