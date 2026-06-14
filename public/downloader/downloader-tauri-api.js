// ──────────────────────────────────────────────
// yt-dlp JSON → renderInfo formatına dönüştürme
// (eski ArDali-WebMedia'dan alındı)
// ──────────────────────────────────────────────
function summarizeFormats(formats = [], metadata = {}, pageUrl = '') {
    const videoFormats = [];
    const audioFormats = [];
    const seenVideo = new Set();
    const seenAudio = new Set();

    for (const format of formats) {
        const id = String(format.format_id || '').trim();
        if (!id) continue;
        const extRaw = String(format.ext || '').trim();
        const ext = extRaw.toLowerCase();
        const height = Number(format.height || 0);
        const fps = Number(format.fps || 0);
        const vcodec = String(format.vcodec || 'none');
        const acodec = String(format.acodec || 'none');
        const abr = Number(format.abr || format.tbr || 0);
        const filesize = Number(format.filesize || format.filesize_approx || 0);
        const sizeText = filesize > 0 ? `${(filesize / 1024 / 1024).toFixed(2)} MB` : '—';

        if (vcodec !== 'none' && !seenVideo.has(id)) {
            seenVideo.add(id);
            videoFormats.push({
                id,
                height,
                ext,
                vcodec,
                acodec,
                filesize,
                label: `${height > 0 ? `${height}p${fps ? `${fps}` : ''}` : 'Video'} | ${ext || 'video'} | ${sizeText}`
            });
        }

        if (acodec !== 'none' && vcodec === 'none' && !seenAudio.has(id)) {
            const quality = abr >= 160 ? 'high' : abr >= 96 ? 'medium' : 'low';
            seenAudio.add(id);
            audioFormats.push({
                id,
                abr,
                ext,
                acodec,
                filesize,
                label: `${quality} | ${ext || 'audio'} | ${sizeText}`
            });
        }
    }

    videoFormats.sort((a, b) => b.height - a.height);
    audioFormats.sort((a, b) => b.abr - a.abr);

    // Hiç video formatı bulunamazsa "best" kullan
    if (!videoFormats.length) {
        const ext = String(metadata.ext || 'mp4').toLowerCase();
        const filesize = Number(metadata.filesize || metadata.filesize_approx || 0);
        const sizeText = filesize > 0 ? `${(filesize / 1024 / 1024).toFixed(2)} MB` : '—';
        videoFormats.push({
            id: 'best',
            height: Number(metadata.height || 0) || 0,
            ext,
            vcodec: 'video',
            acodec: 'audio',
            filesize,
            label: `Video | ${ext || 'video'} | ${sizeText}`
        });
    }

    return { videoFormats, audioFormats };
}

function formatDuration(seconds) {
    const total = Number(seconds || 0);
    if (!Number.isFinite(total) || total <= 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

function processYtdlpMetadata(metadata = {}, pageUrl = '') {
    const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
    const { videoFormats, audioFormats } = summarizeFormats(formats, metadata, pageUrl);
    const duration = formatDuration(metadata.duration);
    let thumbnail = String(metadata.thumbnail || '');
    if (!thumbnail && Array.isArray(metadata.thumbnails) && metadata.thumbnails.length > 0) {
        thumbnail = metadata.thumbnails[metadata.thumbnails.length - 1].url || '';
    }
    
    return {
        url: String(metadata.webpage_url || metadata.original_url || pageUrl || ''),
        id: String(metadata.id || ''),
        title: String(metadata.title || ''),
        thumbnail,
        extractor: String(metadata.extractor_key || metadata.extractor || ''),
        durationText: duration,
        videoFormats,
        audioFormats
    };
}

window.ardali = window.ardali || {};

window.ardali.downloader = {
    getDependencyStatus: async () => {
        try {
            const hasYtdlp = await window.__TAURI__.core.invoke('check_ytdlp_binary');
            return { 
                ytdlp: { installed: hasYtdlp }, 
                ffmpeg: { installed: true } 
            };
        } catch(e) {
            return { ytdlp: { installed: false }, ffmpeg: { installed: true } };
        }
    },
    ensureDependencies: async () => {
        try {
            await window.__TAURI__.core.invoke('ensure_ytdlp_binary');
            await window.__TAURI__.core.invoke('ensure_ffmpeg_binary');
            return { 
                success: true, 
                status: { 
                    ytdlp: { installed: true }, 
                    ffmpeg: { installed: true } 
                } 
            };
        } catch (e) {
            console.error("Dependency error:", e);
            return { success: false, error: String(e) };
        }
    },
    getFileThumbnail: async (path) => { return null; },
    startCompression: async (payload) => { throw new Error("Sıkıştırıcı henüz Rust backend'e aktarılmadı."); },
    cancelCompression: async (id) => {},
    cancel: async (id) => {},
    showFile: async (path) => {},
    getInfo: async (url) => {
        try {
            const data = await window.__TAURI__.core.invoke('run_ytdlp_json', { url });
            // Ham yt-dlp JSON'unu renderInfo'nun beklediği formata dönüştür
            return { success: true, info: processYtdlpMetadata(data, url) };
        } catch (e) {
            console.error("YtDlp Error:", e);
            return { success: false, error: String(e) };
        }
    },
    start: async (payload) => {
        try {
            // camelCase -> snake_case dönüşümü (Rust beklentisi)
            const result = await window.__TAURI__.core.invoke('start_download', {
                payload: {
                    url: payload.url || '',
                    title: payload.title || '',
                    thumbnail: payload.thumbnail || '',
                    mode: payload.mode || 'video',
                    video_format_id: payload.videoFormatId || '',
                    audio_for_video_format_id: payload.audioForVideoFormatId || '',
                    audio_format_id: payload.audioFormatId || '',
                    extract_format: payload.extractFormat || 'mp3',
                    audio_quality: payload.audioQuality || 'best',
                    subtitles: payload.subtitles || false,
                    start_time: payload.startTime || '',
                    end_time: payload.endTime || '',
                    custom_args: payload.customArgs || '',
                    title: payload.title || '',
                    download_dir: payload.downloadDir || ''
                }
            });
            return result;
        } catch (e) {
            console.error('start_download error:', e);
            return { success: false, error: String(e) };
        }
    },
    removeHistoryItem: async (id) => {},
    getHistory: async () => {
        try {
            return await window.__TAURI__.core.invoke('get_downloader_history');
        } catch (e) { return []; }
    },
    getSettings: async () => {
        try {
            return await window.__TAURI__.core.invoke('get_downloader_settings');
        } catch (e) { return {}; }
    },
    saveSettings: async (settings) => {
        try {
            const current = await window.__TAURI__.core.invoke('get_downloader_settings');
            const next = { ...current, ...settings };
            return await window.__TAURI__.core.invoke('save_downloader_settings', { settings: next });
        } catch (e) { return {}; }
    },
    readClipboard: async () => {
        try {
            return await navigator.clipboard.readText();
        } catch (e) {
            return '';
        }
    },
    chooseFolder: async () => {
        if (!window.__TAURI__.dialog) {
            console.error("Tauri dialog plugin not loaded");
            return null;
        }
        const result = await window.__TAURI__.dialog.open({ directory: true });
        return result;
    },
    chooseConfigFile: async () => { return null; },
    exportHistory: async (type) => { return false; },
    clearHistory: async () => {
        await window.__TAURI__.core.invoke('clear_downloader_history');
    },
    chooseOutputFolder: async () => {
        return window.__TAURI__?.dialog ? await window.__TAURI__.dialog.open({ directory: true }) : null;
    },
    onJobUpdate: (cb) => {
        if (window.__TAURI__?.event) {
            window.__TAURI__.event.listen('downloader-job', (e) => cb(e.payload));
        }
    },
    onLoadUrl: (cb) => {
        // Read URL from querystring when the window opens
        const urlParams = new URLSearchParams(window.location.search);
        const autoUrl = urlParams.get('url');
        if (autoUrl) {
            // Delay slightly to ensure UI is ready
            setTimeout(() => {
                cb({ url: autoUrl });
            }, 500);
        }
    }
};

window.ardali.electronAPI = {
    closeWindow: async () => {
        try {
            if (window.__TAURI__?.window) {
                await window.__TAURI__.window.getCurrentWindow().close();
            } else if (window.__TAURI__?.webviewWindow) {
                await window.__TAURI__.webviewWindow.getCurrentWebviewWindow().close();
            } else {
                window.close();
            }
        } catch(e) { console.error(e); }
    },
    minimizeWindow: async () => {
        try {
            if (window.__TAURI__?.window) {
                await window.__TAURI__.window.getCurrentWindow().minimize();
            } else if (window.__TAURI__?.webviewWindow) {
                await window.__TAURI__.webviewWindow.getCurrentWebviewWindow().minimize();
            }
        } catch(e) { console.error(e); }
    },
    maximizeWindow: async () => {
        try {
            let win = null;
            if (window.__TAURI__?.window) win = window.__TAURI__.window.getCurrentWindow();
            else if (window.__TAURI__?.webviewWindow) win = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
            
            if (win) {
                const isMax = await win.isMaximized();
                if (isMax) await win.unmaximize();
                else await win.maximize();
            }
        } catch(e) { console.error(e); }
    }
};

if (window.__TAURI__?.event) {
    window.__TAURI__.event.listen('downloader-dependency', (e) => {
        const textEl = document.getElementById('dependencyProgressText');
        if (textEl && e.payload) {
            textEl.textContent = `${e.payload.message} (${Math.round(e.payload.percent)}%)`;
        }
    });
}

// Enable dragging for elements with data-tauri-drag-region
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-tauri-drag-region]').forEach(el => {
        el.addEventListener('mousedown', async (e) => {
            if (e.buttons === 1 && e.detail === 1) {
                try {
                    if (window.__TAURI__?.window) {
                        await window.__TAURI__.window.getCurrentWindow().startDragging();
                    } else if (window.__TAURI__?.webviewWindow) {
                        await window.__TAURI__.webviewWindow.getCurrentWebviewWindow().startDragging();
                    }
                } catch (err) {
                    console.error("Drag error:", err);
                }
            }
        });
    });
});
