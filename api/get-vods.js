// api/get-vods.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Розумний парсер лінків
function extractVodUrl(thumb) {
    if (!thumb) return null;
    // Патерн 1 (Є підпапка cf_vods)
    const match1 = thumb.match(/cf_vods\/([^\/]+)\/([^\/]+)\/thumb/);
    if (match1) return `https://${match1[1]}.cloudfront.net/${match1[2]}/chunked/index-dvr.m3u8`;
    
    // Патерн 2 (Прямий лінк)
    const match2 = thumb.match(/([^\/]+)\/thumb\//);
    if (match2) return `https://d2v02itv0y9u9t.cloudfront.net/${match2[1]}/chunked/index-dvr.m3u8`;
    
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username, cursor } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(200).json({ vods: [], nextCursor: null });

    try {
        const searchName = username.toLowerCase();
        const dbKey = `intercepted_vods:${searchName}`;
        const interceptedVods = await redis.get(dbKey) || [];

        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${searchName}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        
        let twitchVods = [];
        let nextCursor = null;

        if (userData.data && userData.data.length > 0) {
            const userId = userData.data[0].id;
            let twitchApiUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=all&first=10`;
            if (cursor) twitchApiUrl += `&after=${cursor}`;

            const videosResponse = await fetch(twitchApiUrl, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
            });
            const videosData = await videosResponse.json();
            
            if (videosData.pagination) nextCursor = videosData.pagination.cursor;

            if (videosData.data) {
                for (const video of videosData.data) {
                    const finalM3u8 = extractVodUrl(video.thumbnail_url);
                    if (finalM3u8) {
                        twitchVods.push({
                            id: video.id,
                            title: video.title,
                            duration: video.duration,
                            created_at: video.created_at,
                            thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                            m3u8: finalM3u8
                        });
                    }
                }
            }
        }

        const combinedVods = [...twitchVods];
        
        interceptedVods.forEach(saved => {
            if (!combinedVods.some(v => v.id === saved.id)) {
                saved.title = `[МОНІТОРИНГ] ${saved.title}`;
                combinedVods.push(saved);
            }
        });

        combinedVods.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return res.status(200).json({
            vods: combinedVods,
            nextCursor: nextCursor
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}