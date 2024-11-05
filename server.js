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
    windowMs: 60 * 60 * 1000, // 1 ora
    max: 100, // limite di 100 richieste per IP
    message: 'Troppe richieste da questo IP, riprova tra un\'ora'
});

app.use('/convert', limiter);
app.use(express.json());
app.use(express.static('public'));

app.post('/convert', async (req, res) => {
    try {
        const { targetUrl } = req.body;
        if (!targetUrl) {
            return res.status(400).json({ error: 'URL richiesto' });
        }

        console.log('Iniziando la conversione per:', targetUrl);

        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ],
            headless: true
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        console.log('Browser avviato, navigazione alla pagina...');

        await page.goto(targetUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        console.log('Pagina caricata, generazione PDF...');

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

        await browser.close();
        console.log('PDF generato con successo');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=converted_${Date.now()}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Errore dettagliato:', error);
        res.status(500).json({ 
            error: 'Errore durante la conversione', 
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in esecuzione sulla porta ${PORT}`);
});