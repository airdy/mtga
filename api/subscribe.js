// api/subscribe.js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET') {
        const monitoredUsers = await redis.get('monitored_channels_list') || [];
        return res.status(200).json({ channels: monitoredUsers });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Нікнейм обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
    const WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET;
    
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const callbackUrl = `${protocol}://${host}/api/twitch-webhook`;

    try {
        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${username.toLowerCase()}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) return res.status(404).json({ error: 'Стрімера не знайдено в Twitch' });
        
        const userId = userData.data[0].id;
        const correctLogin = userData.data[0].login;

        const subscribeResponse = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: "stream.online",
                version: "1",
                condition: { broadcaster_user_id: userId },
                transport: {
                    method: "webhook",
                    callback: callbackUrl,
                    secret: WEBHOOK_SECRET
                }
            })
        });

        const subscribeData = await subscribeResponse.json();

        if (subscribeResponse.status !== 202 && subscribeData.error) {
            return res.status(400).json({ error: subscribeData.message });
        }

        const currentList = await redis.get('monitored_channels_list') || [];
        if (!currentList.includes(correctLogin)) {
            currentList.push(correctLogin);
            await redis.set('monitored_channels_list', currentList);
        }

        return res.status(200).json({ success: true, message: `Моніторинг для ${correctLogin} успішно активовано!` });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}