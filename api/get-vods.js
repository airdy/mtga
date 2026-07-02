// api/get-vods.js

// Функція для отримання офіційної сигнатури та токена доступу до VOD
async function getTwitchVodTokenSig(vodId) {
    const gqlQuery = [{
        operationName: "PlaybackAccessToken",
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: "0828119ded1c13477966434e7d6377420a6230117a41c5a21fa9050bc19b8ed1"
            }
        },
        variables: {
            isLive: false,
            login: "",
            isVod: true,
            vodID: vodId,
            playerType: "embed"
        }
    }];

    try {
        const response = await fetch("https://gql.twitch.tv/gql", {
            method: "POST",
            headers: {
                "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko", // Загальнодоступний веб-ключ Twitch
                "Content-Type": "application/json"
            },
            body: JSON.stringify(gqlQuery)
        });
        const json = await response.json();
        const tokenData = json[0]?.data?.videoPlaybackAccessToken;
        if (!tokenData) return null;
        return {
            token: tokenData.value,
            sig: tokenData.signature
        };
    } catch (e) {
        return null;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username, cursor } = req.query;
    if (!username) return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(200).json({
            vods: [{
                id: "mock",
                title: "Демо-потік (Перевірте налаштування оточення)",
                duration: "1h 00m",
                created_at: new Date().toISOString(),
                thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=320&h=180&fit=crop",
                m3u8: `/api/proxy?url=${encodeURIComponent("https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8")}`
            }],
            nextCursor: null
        });
    }

    try {
        const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) return res.status(404).json({ error: 'Стрімера не знайдено.' });
        const userId = userData.data[0].id;

        let twitchApiUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=all&first=10`;
        if (cursor) twitchApiUrl += `&after=${cursor}`;

        const videosResponse = await fetch(twitchApiUrl, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
        });
        const videosData = await videosResponse.json();

        const processedVods = [];
        for (const video of videosData.data) {
            // Отримуємо офіційні підписи для кожного відео індивідуально
            const tokenSig = await getTwitchVodTokenSig(video.id);
            
            if (tokenSig) {
                const usherUrl = `https://usher.ttvnw.net/vod/${video.id}.m3u8?sig=${tokenSig.sig}&token=${encodeURIComponent(tokenSig.token)}&allow_source=true&player_type=embed`;
                
                processedVods.push({
                    id: video.id,
                    title: video.title,
                    duration: video.duration,
                    created_at: video.created_at,
                    thumbnail: video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                    m3u8: `/api/proxy?url=${encodeURIComponent(usherUrl)}`
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