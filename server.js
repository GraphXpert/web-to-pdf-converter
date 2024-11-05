// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();

// Configurazione della sicurezza
app.use(helmet({
    contentSecurityPolicy: false
}));

// Configurazione CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Configurazione del rate limiting
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: 'Troppe richieste da questo IP, riprova tra un\'ora'
});

app.use('/convert', limiter);
app.use(express.json());
app.use(express.static('public'));

app.post('/convert', async (req, res) => {
    let browser = null;
    try {
        const { targetUrl } = req.body;
        if (!targetUrl) {
            return res.status(400).json({ error: 'URL richiesto' });
        }

        console.log('Iniziando la conversione per:', targetUrl);

        // Configurazione specifica per Render.com
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ],
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Aumenta il timeout e aggiungi gestione errori per il caricamento della pagina
        await page.goto(targetUrl, { 
            waitUntil: 'networkidle0',
            timeout: 60000 // Aumentato a 60 secondi
        });

        // Estrai il titolo della pagina per il nome del file
        const pageTitle = await page.title();
        const sanitizedTitle = pageTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

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

        // Imposta gli header per forzare il download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}_${Date.now()}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Invia il PDF
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Errore dettagliato:', error);
        res.status(500).json({ 
            error: 'Errore durante la conversione', 
            details: error.message 
        });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error('Errore nella chiusura del browser:', error);
            }
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in esecuzione sulla porta ${PORT}`);
});