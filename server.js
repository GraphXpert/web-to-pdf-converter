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

// Modifica la funzione di conversione nel server.js
app.post('/convert', async (req, res) => {
    try {
        const { targetUrl } = req.body;
        if (!targetUrl) {
            return res.status(400).json({ error: 'URL richiesto' });
        }

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

        await page.goto(targetUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000
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

        await browser.close();

        // Invia il PDF direttamente al browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=converted_${Date.now()}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Errore durante la conversione: ' + error.message });
    }
});

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