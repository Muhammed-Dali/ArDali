use std::fs;
use std::path::{PathBuf};
use tauri::{AppHandle, Manager, Emitter};
use serde::{Deserialize, Serialize};
use tokio::process::Command as TokioCommand;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::{Command, Stdio};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloaderSettings {
    pub default_folder: Option<String>,
    pub download_dir: Option<String>,
    pub max_quality: Option<String>,
    pub audio_only: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloaderHistoryItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub file_path: String,
    pub status: String,
}

fn get_bin_dir(app: &AppHandle) -> PathBuf {
    let local_data_dir = app.path().app_local_data_dir().unwrap_or_else(|_| PathBuf::from(".ardali"));
    let bin_dir = local_data_dir.join("bin");
    if !bin_dir.exists() {
        let _ = fs::create_dir_all(&bin_dir);
    }
    bin_dir
}

fn get_local_ytdlp_path(app: &AppHandle) -> PathBuf {
    #[cfg(target_os = "windows")]
    let exe_name = "yt-dlp.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "yt-dlp";

    get_bin_dir(app).join(exe_name)
}

fn get_ytdlp_path(app: &AppHandle) -> PathBuf {
    // 1. Önce sistemde yt-dlp var mı diye kontrol et (Kullanıcının pacman/yay ile kurduğu)
    if let Ok(output) = Command::new("yt-dlp").arg("--version").output() {
        if output.status.success() {
            // Sistemdeki çalışıyor, sistemdekini kullan
            return PathBuf::from("yt-dlp");
        }
    }
    
    // 2. Sistemde yoksa, yerel uygulama klasörüne bak
    get_local_ytdlp_path(app)
}

#[tauri::command]
pub async fn resolve_ytdlp_binary(app: AppHandle) -> Result<String, String> {
    Ok(get_ytdlp_path(&app).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn resolve_ffmpeg_binary(_app: AppHandle) -> Result<String, String> {
    Ok("system".to_string())
}

#[tauri::command]
pub async fn ensure_ytdlp_binary(app: AppHandle) -> Result<String, String> {
    // Eğer sistemde kuruluysa indirmeye gerek yok
    if let Ok(output) = Command::new("yt-dlp").arg("--version").output() {
        if output.status.success() {
            println!("Sistem yt-dlp bulundu, indirme atlanıyor.");
            return Ok("yt-dlp".to_string());
        }
    }

    let local_path = get_local_ytdlp_path(&app);

    if local_path.exists() {
        println!("Yerel yt-dlp bulundu at {:?}", local_path);
        return Ok(local_path.to_string_lossy().to_string());
    }

    println!("yt-dlp not found in local app data. Downloading...");

    #[cfg(target_os = "windows")]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    #[cfg(target_os = "linux")]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
    #[cfg(target_os = "macos")]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";

    let client = reqwest::Client::new();
    let response = client.get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download yt-dlp: {}", e))?;

    let total_size = response.content_length().unwrap_or(30_000_000) as f64;
    let mut file = std::fs::File::create(&local_path)
        .map_err(|e| format!("Failed to create local yt-dlp file: {}", e))?;
    let mut downloaded = 0f64;
    
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Failed to read response chunk: {}", e))?;
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| format!("Failed to save yt-dlp chunk: {}", e))?;
        downloaded += chunk.len() as f64;
        let percent = (downloaded / total_size) * 100.0;
        let _ = app.emit("dependency-progress", percent);
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&local_path).unwrap().permissions();
        perms.set_mode(0o755);
        let _ = fs::set_permissions(&local_path, perms);
    }

    Ok(local_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn ensure_ffmpeg_binary(_app: AppHandle) -> Result<String, String> {
    Ok("system".to_string())
}

#[tauri::command]
pub async fn check_ytdlp_binary(app: AppHandle) -> Result<bool, String> {
    // Önce sistemde yt-dlp var mı kontrol et
    if let Ok(output) = Command::new("yt-dlp").arg("--version").output() {
        if output.status.success() {
            return Ok(true);
        }
    }
    // Sonra yerel klasörde bak
    let bin_dir = get_bin_dir(&app);
    let local_path = bin_dir.join(if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" });
    Ok(local_path.exists())
}

#[tauri::command]
pub async fn run_ytdlp_json(app: AppHandle, url: String) -> Result<serde_json::Value, String> {
    let ytdlp_path = get_ytdlp_path(&app);
    if !ytdlp_path.exists() {
        return Err("yt-dlp binary not found. Please wait for dependencies to download.".into());
    }

    let output = Command::new(&ytdlp_path)
        .arg("-J")
        .arg(&url)
        .output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", err_str));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(parsed)
}

#[derive(Deserialize)]
pub struct DownloadPayload {
    pub url: Option<String>,
    pub mode: Option<String>,
    pub video_format_id: Option<String>,
    pub audio_for_video_format_id: Option<String>,
    pub audio_format_id: Option<String>,
    pub extract_format: Option<String>,
    pub audio_quality: Option<String>,
    pub subtitles: Option<bool>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub custom_args: Option<String>,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub download_dir: Option<String>,
    pub close_on_finish: Option<bool>,
}

#[tauri::command]
pub async fn start_download(app: AppHandle, payload: DownloadPayload) -> Result<serde_json::Value, String> {
    let url = payload.url.as_deref().unwrap_or("").to_string();
    if url.is_empty() {
        return Err("URL boş olamaz".into());
    }

    let ytdlp_path = get_ytdlp_path(&app);

    // İndirme dizini: önce ayarlardan, yoksa ~/Downloads
    let download_dir = if let Some(d) = &payload.download_dir {
        if !d.is_empty() { d.clone() } else {
            app.path().download_dir().unwrap_or_else(|_| PathBuf::from(".")).to_string_lossy().to_string()
        }
    } else {
        app.path().download_dir().unwrap_or_else(|_| PathBuf::from(".")).to_string_lossy().to_string()
    };

    let mode = payload.mode.clone().unwrap_or_else(|| "video".to_string());
    let mut args: Vec<String> = vec![];

    // Çıktı şablonu
    args.push("-o".into());
    args.push(format!("{}/%(title)s.%(ext)s", download_dir));

    // Format seçimi
    match mode.as_str() {
        "audio" | "extract" => {
            let audio_fmt = payload.extract_format.as_deref().unwrap_or("mp3");
            args.push("-x".into());
            args.push("--audio-format".into());
            args.push(audio_fmt.to_lowercase());
            if let Some(q) = &payload.audio_quality {
                if !q.is_empty() && q != "best" {
                    args.push("--audio-quality".into());
                    args.push(q.clone());
                }
            }
        }
        _ => {
            // Video modu: format id ile indir
            let vid_id = payload.video_format_id.as_deref().unwrap_or("");
            let aud_id = payload.audio_for_video_format_id.as_deref().unwrap_or("");
            if !vid_id.is_empty() && vid_id != "best" && vid_id != "none" {
                if !aud_id.is_empty() && aud_id != "none" {
                    args.push("-f".into());
                    args.push(format!("{}+{}", vid_id, aud_id));
                } else {
                    args.push("-f".into());
                    args.push(vid_id.to_string());
                }
            } else {
                args.push("-f".into());
                args.push("bestvideo+bestaudio/best".into());
            }
            args.push("--merge-output-format".into());
            args.push("mp4".into());
        }
    }

    // Altyazı
    if payload.subtitles.unwrap_or(false) {
        args.push("--write-subs".into());
        args.push("--sub-langs".into());
        args.push("all".into());
    }

    // Özel argümanlar
    if let Some(custom) = &payload.custom_args {
        for part in custom.split_whitespace() {
            args.push(part.to_string());
        }
    }

    // Kapak resmi ve metadata ekle, progress için newline
    args.push("--embed-thumbnail".into());
    args.push("--embed-metadata".into());
    args.push("--convert-thumbnails".into());
    args.push("jpg".into());
    args.push("--newline".into());

    args.push(url.clone());

    println!("[ArDali İndir] yt-dlp {:?}", args);

    // Arka planda çalıştır, anında başarı döndür
    let app_clone = app.clone();
    let job_id = format!("job_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let job_id_clone = job_id.clone();
    let ytdlp_clone = ytdlp_path.clone();
    use tokio::process::Command as TokioCommand;
    use std::process::Stdio;
    use tokio::io::{BufReader, AsyncBufReadExt};

    let payload_title = payload.title.clone().unwrap_or_default();
    let payload_thumbnail = payload.thumbnail.clone().unwrap_or_default();
    let close_on_finish = payload.close_on_finish.unwrap_or(false);

    tokio::spawn(async move {
        let _ = app_clone.emit("downloader-job", serde_json::json!({
            "id": job_id_clone,
            "state": "running",
            "url": url,
            "title": payload_title,
            "thumbnail": payload_thumbnail,
            "percent": 0,
            "mode": mode.clone()
        }));

        let mut child = match TokioCommand::new(&ytdlp_clone)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn() {
                Ok(c) => c,
                Err(e) => {
                    let _ = app_clone.emit("downloader-job", serde_json::json!({
                        "id": job_id_clone,
                        "state": "error",
                        "message": format!("İşlem başlatılamadı: {}", e),
                        "url": url,
                        "title": payload_title,
                        "thumbnail": payload_thumbnail,
                        "mode": mode.clone()
                    }));
                    return;
                }
            };

        if let Some(stdout) = child.stdout.take() {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if line.starts_with("[download]") && line.contains("%") {
                    if let Some(percent_str) = line.split('%').next().and_then(|s| s.split_whitespace().last()) {
                        let clean_percent: String = percent_str.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
                        if let Ok(percent) = clean_percent.parse::<f64>() {
                            let _ = app_clone.emit("downloader-job", serde_json::json!({
                                "id": job_id_clone,
                                "state": "running",
                                "url": url,
                                "title": payload_title,
                                "thumbnail": payload_thumbnail,
                                "percent": percent,
                                "mode": mode.clone()
                            }));
                        }
                    }
                }
            }
        }

        let status = child.wait().await.unwrap_or_else(|_| std::process::ExitStatus::default());

        if status.success() {
            let _ = app_clone.emit("downloader-job", serde_json::json!({
                "id": job_id_clone,
                "state": "done",
                "percent": 100,
                "url": url,
                "title": payload_title,
                "thumbnail": payload_thumbnail,
                "closeOnFinish": close_on_finish,
                "mode": mode.clone()
            }));
        } else {
            let _ = app_clone.emit("downloader-job", serde_json::json!({
                "id": job_id_clone,
                "state": "error",
                "message": "İndirme başarısız oldu",
                "url": url,
                "title": payload_title,
                "thumbnail": payload_thumbnail,
                "mode": mode
            }));
        }
    });

    Ok(serde_json::json!({
        "success": true,
        "jobId": job_id
    }))
}

#[tauri::command]
pub async fn get_downloader_history() -> Result<Vec<DownloaderHistoryItem>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn clear_downloader_history() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn save_downloader_history_item(_item: DownloaderHistoryItem) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_default_download_dir(app: AppHandle) -> Result<String, String> {
    Ok(app.path().download_dir().unwrap_or_else(|_| PathBuf::from(".")).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_downloader_settings(app: AppHandle) -> Result<DownloaderSettings, String> {
    let settings_path = app.path().app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".ardali"))
        .join("downloader_settings.json");

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Ayarlar okunamadı: {}", e))?;
        let s: DownloaderSettings = serde_json::from_str(&content)
            .unwrap_or(DownloaderSettings { default_folder: None, download_dir: None, max_quality: None, audio_only: Some(false) });
        return Ok(s);
    }

    Ok(DownloaderSettings {
        default_folder: None,
        download_dir: None,
        max_quality: None,
        audio_only: Some(false),
    })
}

#[tauri::command]
pub async fn save_downloader_settings(app: AppHandle, settings: DownloaderSettings) -> Result<(), String> {
    let data_dir = app.path().app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".ardali"));
    let _ = fs::create_dir_all(&data_dir);
    let settings_path = data_dir.join("downloader_settings.json");
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Ayarlar kaydedilemedi: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Ayarlar dosyaya yazılamadı: {}", e))?;
    Ok(())
}
