// api/get-vods.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Універсальний парсер: витягує ID з будь-якого формату thumbnail_url
function extractVodUrl(thumb) {
    if (!thumb) return null;
    
    // Новий регулярний вираз, який ловить ID відео незалежно від структури CDN
    // Шукає ID перед /thumb/ або після cf_vods/
    const match = thumb.match(/\/([0-9]+)_/);
    if (match && match[1]) {
        return `https://d2v02itv0y9u9t.cloudfront.net/${match[1]}/chunked/index-dvr.m3u8`;
    }
    
    // Резервний варіант, якщо URL містить ID безпосередньо
    const matchAlt = thumb.match(/videos\/([0-9]+)-/);
    if (matchAlt && matchAlt[1]) {
        return `https://d2v02itv0y9u9t.cloudfront.net/${matchAlt[1]}/chunked/index-dvr.m3u8`;
    }
    
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    try {
        const auth = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const authData = await auth.json();
        const token = authData.access_token;

        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username.toLowerCase()}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        
        if (!userData.data || userData.data.length === 0) {
            return res.status(200).json({ error: "Користувача не знайдено" });
        }

        const userId = userData.data[0].id;

        const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=20`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const videoData = await videoRes.json();
        
        const intercepted = await redis.get(`intercepted_vods:${username.toLowerCase()}`) || [];

        // Перетворюємо дані Twitch
        const twitchVods = (videoData.data || []).map(v => {
            const m3u8 = extractVodUrl(v.thumbnail_url);
            return {
                id: v.id,
                title: v.title,
                duration: v.duration,
                created_at: v.created_at,
                thumbnail: v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                m3u8: m3u8
            };
        });

        // ПРИБРАВ ФІЛЬТР, ЩОБ БАЧИТИ, ЯКЩО M3U8 ПУСТИЙ (можна буде додати пізніше)
        const allVods = [...twitchVods, ...intercepted];
        
        return res.status(200).json({ vods: allVods });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}