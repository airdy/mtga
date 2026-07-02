// api/get-vods.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function extractVodUrl(thumb) {
    if (!thumb) return null;
    const match1 = thumb.match(/cf_vods\/([^\/]+)\/([^\/]+)\/thumb/);
    if (match1) return `https://${match1[1]}.cloudfront.net/${match1[2]}/chunked/index-dvr.m3u8`;
    const match2 = thumb.match(/([^\/]+)\/thumb\//);
    if (match2) return `https://d2v02itv0y9u9t.cloudfront.net/${match2[1]}/chunked/index-dvr.m3u8`;
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    try {
        // 1. Отримуємо токен
        const auth = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const authData = await auth.json();
        const token = authData.access_token;

        // 2. Шукаємо користувача
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username.toLowerCase()}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        
        if (!userData.data || userData.data.length === 0) {
            return res.status(200).json({ error: "Користувача не знайдено", debug: userData });
        }

        const userId = userData.data[0].id;

        // 3. Запит відео
        const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=20`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const videoData = await videoRes.json();
        
        // 4. Redis перевірка
        const intercepted = await redis.get(`intercepted_vods:${username.toLowerCase()}`) || [];

        // Формуємо відповідь
        const twitchVods = (videoData.data || []).map(v => ({
            id: v.id,
            title: v.title,
            duration: v.duration,
            created_at: v.created_at,
            thumbnail: v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
            m3u8: extractVodUrl(v.thumbnail_url)
        })).filter(v => v.m3u8 !== null);

        const allVods = [...twitchVods, ...intercepted];
        
        // Якщо все ще порожньо, віддаємо дебаг-інфо
        if (allVods.length === 0) {
            return res.status(200).json({ 
                vods: [], 
                message: "Відео не знайдено",
                debug: { 
                    twitch_found_count: videoData.data ? videoData.data.length : 0,
                    redis_found_count: intercepted.length,
                    user_id: userId
                }
            });
        }

        return res.status(200).json({ vods: allVods });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}