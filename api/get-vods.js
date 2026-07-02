// api/get-vods.js (ТИМЧАСОВИЙ ТЕСТОВИЙ ВАРІАНТ)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'Нікнейм стрімера обовʼязковий' });
    }

    // Імітуємо затримку мережі в 1 секунду для реалістичності
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Повертаємо жорстко прописані дані (Mock-data) незалежно від того, що ввів користувач
    return res.status(200).json({
        vods: [
            {
                id: "123456789",
                title: `Тестовий запис стріму для користувача [${username}]`,
                duration: "2h 15m 30s",
                created_at: new Date().toISOString(),
                // Стандартна картинка-заглушка
                thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=320&h=180&fit=crop",
                // Пряме робоче посилання, яке ви надали
                m3u8: "https://dgeft87wbj63p.cloudfront.net/2f7634e7a0361996b3f8_kisulkaa__316404218068_1782927372/chunked/index-dvr.m3u8"
            }
        ]
    });
}