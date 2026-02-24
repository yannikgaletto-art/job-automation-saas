import fs from 'fs';
import https from 'https';
import path from 'path';

const fonts = [
    { name: 'Inter-Regular.ttf', url: 'https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZs&skey=c491285d6722e4fa&v=v20' },
    { name: 'Inter-SemiBold.ttf', url: 'https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZs&skey=c491285d6722e4fa&v=v20' },
    { name: 'Inter-Bold.ttf', url: 'https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZs&skey=c491285d6722e4fa&v=v20' }
];

fonts.forEach(f => {
    const dest = path.join(process.cwd(), 'public', 'fonts', f.name);
    const file = fs.createWriteStream(dest);
    https.get(f.url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log(`Downloaded ${f.name} successfully! Size: ${fs.statSync(dest).size} bytes`);
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => { });
        console.error(`Error downloading ${f.name}:`, err.message);
    });
});
