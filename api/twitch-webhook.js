// api/twitch-webhook.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end();
    }

    const messageType = req.headers['twitch-eventsub-message-type'];

    if (messageType === 'webhook_callback_verification') {
        const { challenge } = req.body;
        return res.status(200).send(challenge);
    }

    if (messageType === 'notification') {
        const { event } = req.body;
        const broadcasterId = event.broadcaster_user_id;
        const username = event.broadcaster_user_login.toLowerCase();

        const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

        try {
            const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
            const tokenData = await tokenResponse.json();
            const accessToken = tokenData.access_token;

            // Очікуємо 5 секунд, щоб Twitch встиг згенерувати файли маніфесту на CDN
            await new Promise(resolve => setTimeout(resolve, 5000));

            const videosResponse = await fetch(`https://api.twitch.tv/helix/videos?user_id=${broadcasterId}&type=archive&first=1`, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
            });
            const videosData = await videosResponse.json();

            if (videosData.data && videosData.data.length > 0) {
                const video = videosData.data[0];
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
                    const dbKey = `intercepted_vods:${username}`;
                    const savedVods = await redis.get(dbKey) || [];

                    if (!savedVods.some(v => v.id === video.id)) {
                        savedVods.unshift({
                            id: video.id,
                            title: video.title,
                            duration: video.duration || "У ефірі...",
                            created_at: video.created_at,
                            thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                            m3u8: finalM3u8,
                            intercepted: true
                        });

                        if (savedVods.length > 30) savedVods.pop();
                        await redis.set(dbKey, savedVods);
                    }
                }
            }
        } catch (err) {
            console.error("Помилка всередині вебхука:", err);
        }

        return res.status(200).end();
    }

    return res.status(200).end();
}