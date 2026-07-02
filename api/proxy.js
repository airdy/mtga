// api/proxy.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    const { url } = req.query;
    if (!url) return res.status(400).send('Параметр url обовʼязковий');

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return res.status(response.status).send(`Помилка CDN Twitch: ${response.statusText}`);
        }
        
        const text = await response.text();
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        
        // Нормалізуємо переноси рядків і ПОВНІСТЮ видаляємо приховані символи \r
        const cleanText = text.replace(/\r/g, '');
        
        const rewrittenText = cleanText.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('http')) {
                return baseUrl + trimmed;
            }
            return trimmed;
        }).join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.status(200).send(rewrittenText);
    } catch (err) {
        return res.status(500).send('Помилка проксі-сервера: ' + err.message);
    }
}