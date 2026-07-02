// api/get-vods.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username, cursor } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    // Якщо ключів немає — віддаємо демо
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(200).json({
            vods: [{
                id: "mock",
                title: "Демо-потік (Перевірте змінні оточення)",
                duration: "1h 00m",
                created_at: new Date().toISOString(),
                thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=320&h=180&fit=crop",
                m3u8: `/api/proxy?url=${encodeURIComponent("https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8")}`
            }],
            nextCursor: null
        });
    }

    try {
        // Авторизація в Twitch API
        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Отримуємо ID користувача
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) return res.status(404).json({ error: 'Стрімера не знайдено.' });
        const userId = userData.data[0].id;

        // Запитуємо список відео через офіційний Helix
        let twitchApiUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=all&first=10`;
        if (cursor) twitchApiUrl += `&after=${cursor}`;

        const videosResponse = await fetch(twitchApiUrl, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const videosData = await videosResponse.json();

        const processedVods = [];
        
        if (videosData.data) {
            for (const video of videosData.data) {
                const thumb = video.thumbnail_url;
                let finalM3u8 = "";

                // Якщо у відео є стандартне прев'ю, дістаємо з нього CDN-шлях
                if (thumb && thumb.includes('cf_vods/')) {
                    const segment = thumb.split('cf_vods/')[1].split('/thumb/')[0];
                    const rawUsherUrl = `https://vod-secure.twitch.tv/cf_vods/${segment}/chunked/index-dvr.m3u8`;
                    finalM3u8 = `/api/proxy?url=${encodeURIComponent(rawUsherUrl)}`;
                } else {
                    // Пропускаємо відео, якщо воно ще генерується Twitch-ем і немає картинки
                    continue; 
                }

                processedVods.push({
                    id: video.id,
                    title: video.title,
                    duration: video.duration,
                    created_at: video.created_at,
                    thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                    m3u8: finalM3u8
                });
            }
        }

        return res.status(200).json({
            vods: processedVods,
            nextCursor: videosData.pagination ? videosData.pagination.cursor : null
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}