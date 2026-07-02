// api/get-vods.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username, cursor } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(200).json({ vods: [], nextCursor: null });
    }

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
                    const thumb = video.thumbnail_url;
                    let finalM3u8 = null;

                    if (thumb && thumb.includes('cf_vods/')) {
                        const parts = thumb.split('cf_vods/')[1].split('/thumb/')[0].split('/');
                        if (parts.length >= 2) {
                            finalM3u8 = `https://${parts[0]}.cloudfront.net/${parts.slice(1).join('/')}/chunked/index-dvr.m3u8`;
                        }
                    } else if (thumb && thumb.includes('vod-secure.twitch.tv/')) {
                        const streamId = thumb.split('vod-secure.twitch.tv/')[1].split('/thumb/')[0];
                        finalM3u8 = `https://d2v02itv0y9u9t.cloudfront.net/${streamId}/chunked/index-dvr.m3u8`;
                    }

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
                saved.title = `[ВРЯТОВАНО] ${saved.title}`;
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