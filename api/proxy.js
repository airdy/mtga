function launchVideo(proxiedM3u8Url, base64Title) {
        const decodedTitle = decodeURIComponent(escape(atob(base64Title)));
        const playerSection = document.getElementById('playerSection');
        const video = document.getElementById('videoPlayer');
        document.getElementById('currentPlayerTitle').innerText = decodedTitle;

        playerSection.style.display = 'block';
        playerSection.scrollIntoView({ behavior: 'smooth' });

        // Якщо HLS вже був запущений — знищуємо його перед новим стартом
        if (hlsInstance) {
            hlsInstance.destroy();
        }

        // Hls.js тепер працює з потоком, який віддає наш proxy.js
        if (Hls.isSupported()) {
            hlsInstance = new Hls({
                // Додаємо конфігурацію для того, щоб HLS проксіював запити фрагментів
                xhrSetup: function(xhr, url) {
                    // Якщо шлях відносний, додаємо наш API префікс
                    if (url.startsWith('/')) return;
                }
            });
            
            hlsInstance.loadSource(proxiedM3u8Url);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => console.log("Автоплей заблоковано браузером"));
            });

            hlsInstance.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    console.error("Критична помилка HLS:", data);
                    alert("Помилка відтворення. Можливо, потік потребує авторизації або файл видалено.");
                }
            });
        } 
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = proxiedM3u8Url;
            video.addEventListener('loadedmetadata', function() {
                video.play();
            });
        }
    }