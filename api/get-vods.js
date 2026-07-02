// api/get-vods.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username, cursor } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });
    }

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    // === ТИМЧАСОВИЙ МОК-РЕЖИМ (Якщо ключі ще не налаштовані у Vercel) ===
    if (!CLIENT_ID || !CLIENT_SECRET) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const isSecondPage = cursor === 'mock_page_2';
        const stableTestHls = "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8";

        const mockVods = isSecondPage ? [
            {
                id: "mock_old_1",
                title: `[Архівний Хайлайт] Старе відео ${username} (Сторінка 2)`,
                duration: "1h 45m",
                created_at: new Date(Date.now() - 172800000).toISOString(),
                thumbnail: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=320&h=180&fit=crop",
                m3u8: stableTestHls
            }
        ] : Array.from({ length: 10 }).map((_, i) => ({
            id: `mock_stream_${i}`,
            title: `Трансляція #${i + 1} стрімера ${username} (Сторінка 1)`,
            duration: "2h 30m",
            created_at: new Date(Date.now() - i * 86400000).toISOString(),
            thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=320&h=180&fit=crop",
            m3u8: stableTestHls
        }));

        return res.status(200).json({
            vods: mockVods,
            nextCursor: isSecondPage ? null : 'mock_page_2'
        });
    }

    // === РЕАЛЬНИЙ РЕЖИМ (Робота з Twitch API) ===
    try {
        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) return res.status(404).json({ error: 'Користувача не знайдено.' });
        const userId = userData.data[0].id;

        // ВИПРАВЛЕННЯ: Змінено type=archive на type=all (шукає стріми, хайлайти, завантаження)
        // Збільшено порцію (first=20)
        let twitchApiUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=all&first=20`;
        if (cursor) twitchApiUrl += `&after=${cursor}`;

        const videosResponse = await fetch(twitchApiUrl, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const videosData = await videosResponse.json();

        const processedVods = [];
        for (const video of videosData.data) {
            let m3u8Url = '';
            const thumbUrl = video.thumbnail_url;

            if (thumbUrl && thumbUrl.includes('cf_vods')) {
                // КРИТИЧНЕ ВИПРАВЛЕННЯ: Тепер регулярка забирає ВСІ підпапки між cf_vods/ та /thumb/
                const match = thumbUrl.match(/cf_vods\/(.+?)\/thumb/);
                if (match && match[1]) {
                    m3u8Url = `https://vod-secure.twitch.tv/cf_vods/${match[1]}/chunked/index-dvr.m3u8`;
                }
            }

            if (!m3u8Url) continue; // Пропускаємо, якщо посилання не збіглося

            processedVods.push({
                id: video.id,
                title: video.title,
                duration: video.duration,
                created_at: video.created_at,
                thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                m3u8: m3u8Url // Віддаємо ПРЯМЕ посилання на CDN
            });
        }

        return res.status(200).json({
            vods: processedVods,
            nextCursor: videosData.pagination ? videosData.pagination.cursor : null
        });

    } catch (error) {
        return res.status(500).json({ error: 'Помилка сервера: ' + error.message });
    }
}