import fs from 'fs';
import https from 'https';
import path from 'path';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 6.1; rv:2.0.1) Gecko/20100101 Firefox/4.0.1';
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700';

https.get(CSS_URL, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
    let css = '';
    res.on('data', chunk => css += chunk);
    res.on('end', () => {
        const urls = css.match(/url\((https:\/\/[^)]+)\)/g)?.map(u => u.slice(4, -1)) || [];
        console.log('Found TTF URLs:', urls.length);

        let fileIndex = 1;
        urls.forEach(url => {
            if (!url.endsWith('.ttf')) console.log('Warning: Not a TTF', url);

            // We need to guess the weight from the CSS block. To be safe, let's just use the direct known WOFF links from pdf-fonts.ts
            // Actually, let's find a reliable TTF repo URL:
            // https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-Regular.ttf
        });
    });
});
