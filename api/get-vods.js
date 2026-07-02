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
    res.setHeader('Content-Type', 'application/json');

    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(200).json({ vods: [], nextCursor: null });

    try {
        const searchName = username.toLowerCase();
        
        // 1. Отримуємо токен
        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 2. Шукаємо користувача
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${searchName}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        
        let twitchVods = [];
        if (userData.data && userData.data.length > 0) {
            const userId = userData.data[0].id;
            
            // 3. Запит до відео без жорсткого фільтра type=all (стандартний запит)
            const videosResponse = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=20`, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
            });
            const videosData = await videosResponse.json();
            
            if (videosData.data) {
                twitchVods = videosData.data.map(video => ({
                    id: video.id,
                    title: video.title,
                    duration: video.duration,
                    created_at: video.created_at,
                    thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                    m3u8: extractVodUrl(video.thumbnail_url)
                })).filter(v => v.m3u8 !== null);
            }
        }

        // 4. Додаємо дані з моніторингу (Redis)
        const dbKey = `intercepted_vods:${searchName}`;
        const interceptedVods = await redis.get(dbKey) || [];
        
        // Об'єднуємо, прибираючи дублікати за ID
        const vodMap = new Map();
        [...twitchVods, ...interceptedVods].forEach(v => {
            if (!vodMap.has(v.id)) vodMap.set(v.id, v);
        });

        const combinedVods = Array.from(vodMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return res.status(200).json({ vods: combinedVods });

    } catch (error) {
        console.error("Помилка пошуку:", error);
        return res.status(500).json({ error: error.message });
    }
}