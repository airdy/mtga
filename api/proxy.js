// api/proxy.js
export default async function handler(req, res) {
    const { url, vodId } = req.query;
    const targetUrl = vodId 
        ? `https://vod-secure.twitch.tv/${vodId}/chunked/index-dvr.m3u8`
        : url;

    if (!targetUrl) return res.status(400).send('URL required');

    try {
        const response = await fetch(targetUrl, {
            headers: { 
                'Origin': 'https://www.twitch.tv', 
                'Referer': 'https://www.twitch.tv/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) return res.status(502).send('Bad Gateway');

        // Пересилаємо заголовки Twitch назад клієнту
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl');
        
        // Використовуємо передачу потоку замість буфера
        const body = await response.body;
        body.pipe(res);
    } catch (err) {
        res.status(500).send(err.message);
    }
}