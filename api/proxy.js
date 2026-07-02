// api/proxy.js

// Вмикаємо Vercel Edge Runtime (Без лімітів на розмір переданих відеофайлів)
export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Параметр url обовʼязковий', { status: 400 });
    }

    try {
        const response = await fetch(targetUrl);
        
        if (!response.ok) {
            return new Response(`Помилка CDN Twitch: ${response.statusText}`, { status: response.status });
        }

        // Якщо плеєр просить сам шматок відео (.ts) — віддаємо його прямо з дозволом CORS!
        if (targetUrl.includes('.ts') || targetUrl.includes('.mp4')) {
            const headers = new Headers(response.headers);
            headers.set('Access-Control-Allow-Origin', '*');
            return new Response(response.body, {
                status: response.status,
                headers: headers
            });
        }

        // Якщо це текстовий маніфест — читаємо і змінюємо посилання
        const text = await response.text();
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        const cleanText = text.replace(/\r/g, '');
        
        const rewrittenText = cleanText.split('\n').map(line => {
            const trimmed = line.trim();
            // Загортаємо кожен .ts файл назад у наш проксі
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('http')) {
                const absoluteUrl = baseUrl + trimmed;
                return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
            }
            return trimmed;
        }).join('\n');

        const headers = new Headers();
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');

        return new Response(rewrittenText, {
            status: 200,
            headers: headers
        });
    } catch (err) {
        return new Response(`Помилка проксі: ${err.message}`, { status: 500 });
    }
}