// api/proxy.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    const { url } = req.query;
    if (!url) return res.status(400).send('url parameter missing');

    try {
        const response = await fetch(url);
        if (!response.ok) return res.status(response.status).send('Error loading stream file from CDN');
        
        const text = await response.text();
        
        // Перетворюємо відносні шляхи всередині файлу .m3u8 на абсолютні лінки до CDN твіча
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const rewrittenText = text.split('\n').map(line => {
            if (line.trim() && !line.startsWith('#') && !line.startsWith('http')) {
                return baseUrl + line;
            }
            return line;
        }).join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.status(200).send(rewrittenText);
    } catch (err) {
        return res.status(500).send('Proxy error: ' + err.message);
    }
}