// api/get-vods.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });
    }

    // БЕРЕМО КЛЮЧІ ЗІ ЗМІННИХ ОТОЧЕННЯ VERCEL
    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    // Перевірка, чи не забули налаштувати змінні
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(500).json({ 
            error: 'Помилка конфігурації: Змінні TWITCH_CLIENT_ID або TWITCH_CLIENT_SECRET не задані у Vercel.' 
        });
    }

    try {
        // Крок 1: Отримуємо токен доступу
        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, {
            method: 'POST'
        });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            return res.status(500).json({ error: 'Не вдалося отримати токен авторизації Twitch.' });
        }

        // Крок 2: Отримуємо ID користувача
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const userData = await userResponse.json();
        
        if (!userData.data || userData.data.length === 0) {
            return res.status(404).json({ error: 'Користувача з таким нікнеймом не знайдено.' });
        }
        const userId = userData.data[0].id;

        // Крок 3: Запитуємо VODs
        const videosResponse = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=20`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const videosData = await videosResponse.json();

        // Крок 4: Парсимо посилання
        const processedVods = videosData.data.map(video => {
            let m3u8Url = '';
            const thumbUrl = video.thumbnail_url;

            if (thumbUrl && thumbUrl.includes('cf_vods')) {
                const match = thumbUrl.match(/cf_vods\/([^\/]+\/[^\/]+)\/thumb/);
                if (match && match[1]) {
                    const folderPath = match[1];
                    m3u8Url = `https://vod-secure.twitch.tv/${folderPath}/chunked/index-dvr.m3u8`;
                }
            }

            if (!m3u8Url && video.id) {
                m3u8Url = `https://production.vod.video.gql.twitch.tv/vods/${video.id}/chunked/index-dvr.m3u8`;
            }

            return {
                id: video.id,
                title: video.title,
                duration: video.duration,
                created_at: video.created_at,
                thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                m3u8: m3u8Url
            };
        });

        return res.status(200).json({ vods: processedVods });

    } catch (error) {
        return res.status(500).json({ error: 'Помилка сервера: ' + error.message });
    }
}