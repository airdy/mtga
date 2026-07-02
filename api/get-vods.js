// api/get-vods.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Функція формує посилання, що веде на наш проксі
function getProxyUrl(videoId) {
    return `/api/proxy?vodId=${videoId}`;
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
            return res.status(200).json({ vods: [] });
        }

        const userId = userData.data[0].id;

        const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=20`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const videoData = await videoRes.json();
        
        const intercepted = await redis.get(`intercepted_vods:${username.toLowerCase()}`) || [];

        const twitchVods = (videoData.data || []).map(v => {
            const match = v.thumbnail_url.match(/\/([0-9]+)_/);
            const videoId = match ? match[1] : v.id;
            return {
                id: v.id,
                title: v.title,
                duration: v.duration,
                created_at: v.created_at,
                thumbnail: v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                m3u8: getProxyUrl(videoId) // Направляємо на наш проксі
            };
        });

        return res.status(200).json({ vods: [...twitchVods, ...intercepted] });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}