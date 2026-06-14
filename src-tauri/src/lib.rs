#[cfg(target_os = "linux")]
use dbus::{
    blocking::Connection as DbusConnection,
    channel::MatchingReceiver,
    message::{MatchRule, Message},
    MessageType,
};
use mpris_player::{Metadata, MprisPlayer, OrgMprisMediaPlayer2Player, PlaybackStatus};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    panic::{catch_unwind, AssertUnwindSafe},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, IconMenuItem, Menu, MenuItem, PredefinedMenuItem},
    path::BaseDirectory,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime, UserAttentionType, WindowEvent,
};

mod native_audio;
mod plugin_commands;
mod security;
mod webview_manager;
mod downloader;

pub use security::validator::PluginValidator;

static PROJECTM_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static MEDIA_SERVER_STARTED: OnceLock<()> = OnceLock::new();
static MPRIS_BRIDGE: OnceLock<Mutex<Option<mpsc::Sender<MprisCommand>>>> = OnceLock::new();
static APP_QUITTING: AtomicBool = AtomicBool::new(false);
static TRAY_READY: AtomicBool = AtomicBool::new(false);
const MEDIA_SERVER_ADDR: &str = "127.0.0.1:1421";
const VISUALIZER_ICON_BMP: &[u8] = include_bytes!("../icons/ardali_256.bmp");

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibrarySnapshot {
    #[serde(default)]
    music: Vec<LibraryItem>,
    #[serde(default)]
    videos: Vec<LibraryItem>,
    #[serde(default)]
    playback: PlaybackSnapshot,
    #[serde(default)]
    effects: Option<EffectsSnapshot>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryItem {
    path: String,
    title: String,
    #[serde(default)]
    duration: f64,
    #[serde(default)]
    last_position: f64,
    #[serde(default)]
    cover_data_url: Option<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackSnapshot {
    #[serde(default)]
    current_page: String,
    #[serde(default)]
    active_web_platform_id: String,
    #[serde(default)]
    selected_music_path: Option<String>,
    #[serde(default)]
    selected_video_path: Option<String>,
    #[serde(default)]
    music_position: f64,
    #[serde(default)]
    video_position: f64,
    #[serde(default)]
    volume: f64,
    #[serde(default)]
    music_view_mode: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EffectsSnapshot {
    #[serde(default)]
    effects_open: Option<bool>,
    #[serde(default)]
    effects_enabled: Option<bool>,
    #[serde(default)]
    eq_preset: Option<String>,
    #[serde(default)]
    eq_gains: Vec<f64>,
    #[serde(default)]
    dsp_settings: DspSettingsSnapshot,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DspSettingsSnapshot {
    #[serde(default)]
    preamp_db: Option<f64>,
    #[serde(default)]
    output_device: Option<String>,
    #[serde(default)]
    sample_rate: Option<String>,
    #[serde(default)]
    bass_boost: Option<f64>,
    #[serde(default)]
    mid_gain: Option<f64>,
    #[serde(default)]
    treble_gain: Option<f64>,
    #[serde(default)]
    stereo_width: Option<f64>,
    #[serde(default)]
    stereo_widener_enabled: Option<bool>,
    #[serde(default)]
    stereo_widener_center_level: Option<f64>,
    #[serde(default)]
    stereo_widener_side_level: Option<f64>,
    #[serde(default)]
    stereo_widener_bass_to_mono: Option<f64>,
    #[serde(default)]
    balance: Option<f64>,
    #[serde(default)]
    compressor: Option<f64>,
    #[serde(default)]
    limiter: Option<f64>,
    #[serde(default)]
    auto_gain_enabled: Option<bool>,
    #[serde(default)]
    auto_gain_target_level: Option<f64>,
    #[serde(default)]
    auto_gain_max_gain: Option<f64>,
    #[serde(default)]
    auto_gain_speed: Option<String>,
    #[serde(default)]
    limiter_lookahead: Option<f64>,
    #[serde(default)]
    limiter_gain_db: Option<f64>,
    #[serde(default)]
    true_peak_enabled: Option<bool>,
    #[serde(default)]
    true_peak_ceiling: Option<f64>,
    #[serde(default)]
    true_peak_release: Option<f64>,
    #[serde(default)]
    true_peak_lookahead: Option<f64>,
    #[serde(default)]
    true_peak_drive: Option<f64>,
    #[serde(default)]
    true_peak_oversampling: Option<f64>,
    #[serde(default)]
    exciter_enabled: Option<bool>,
    #[serde(default)]
    exciter_frequency: Option<f64>,
    #[serde(default)]
    exciter_amount: Option<f64>,
    #[serde(default)]
    exciter_mix: Option<f64>,
    #[serde(default)]
    exciter_harmonics: Option<String>,
    #[serde(default)]
    deesser_enabled: Option<bool>,
    #[serde(default)]
    deesser_frequency: Option<f64>,
    #[serde(default)]
    deesser_threshold: Option<f64>,
    #[serde(default)]
    deesser_ratio: Option<f64>,
    #[serde(default)]
    deesser_range: Option<f64>,
    #[serde(default)]
    noise_gate_enabled: Option<bool>,
    #[serde(default)]
    noise_gate_threshold: Option<f64>,
    #[serde(default)]
    noise_gate_attack: Option<f64>,
    #[serde(default)]
    noise_gate_hold: Option<f64>,
    #[serde(default)]
    noise_gate_release: Option<f64>,
    #[serde(default)]
    noise_gate_range: Option<f64>,
    #[serde(default)]
    echo_enabled: Option<bool>,
    #[serde(default)]
    echo_delay: Option<f64>,
    #[serde(default)]
    echo_feedback: Option<f64>,
    #[serde(default)]
    echo_mix: Option<f64>,
    #[serde(default)]
    echo_high_cut: Option<f64>,
    #[serde(default)]
    echo_soft_mode: Option<bool>,
    #[serde(default)]
    reverb: Option<f64>,
    #[serde(default)]
    conv_reverb_enabled: Option<bool>,
    #[serde(default)]
    conv_reverb_mix: Option<f64>,
    #[serde(default)]
    conv_reverb_predelay: Option<f64>,
    #[serde(default)]
    conv_reverb_preset: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MprisMetadataPayload {
    track_id: String,
    title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    album: String,
    #[serde(default)]
    album_art: String,
    #[serde(default)]
    duration: f64,
    #[serde(default)]
    position: f64,
    #[serde(default)]
    is_playing: bool,
    #[serde(default = "default_true")]
    can_go_next: bool,
    #[serde(default = "default_true")]
    can_go_previous: bool,
    #[serde(default = "default_true")]
    can_seek: bool,
    #[serde(default)]
    media_type: String,
    #[serde(default)]
    url: String,
    #[serde(default = "default_volume")]
    volume: f64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MprisPositionPayload {
    #[serde(default)]
    position: f64,
    #[serde(default)]
    is_playing: bool,
    #[serde(default = "default_volume")]
    volume: f64,
    #[serde(default)]
    seeked: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAudioOutputState {
    success: bool,
    current_output_name: String,
    current_output_id: String,
    is_headphones: bool,
    message: String,
}

enum MprisCommand {
    Update(MprisMetadataPayload),
    Position(MprisPositionPayload),
}

fn default_true() -> bool {
    true
}

fn default_volume() -> f64 {
    1.0
}

fn custom_mpris_enabled() -> bool {
    std::env::var("ARDALI_CUSTOM_MPRIS")
        .map(|value| {
            !matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "no"
            )
        })
        .unwrap_or(true)
}

#[tauri::command]
fn app_ready() -> &'static str {
    "ArDali WebMedia Tauri hazir"
}

#[tauri::command]
fn is_custom_mpris_enabled() -> bool {
    custom_mpris_enabled()
}

#[tauri::command]
fn native_audio_init() -> Result<(), String> {
    native_audio::init()
}

#[tauri::command]
fn native_audio_state() -> native_audio::NativeAudioState {
    native_audio::state()
}

#[tauri::command]
fn native_audio_load(path: String) -> Result<f64, String> {
    native_audio::load_file(path)
}

#[tauri::command]
fn native_audio_play() -> Result<(), String> {
    native_audio::play()
}

#[tauri::command]
fn native_audio_pause() -> Result<(), String> {
    native_audio::pause()
}

#[tauri::command]
fn native_audio_stop() -> Result<(), String> {
    native_audio::stop()
}

#[tauri::command]
fn native_audio_seek(position: f64) -> Result<(), String> {
    native_audio::seek(position)
}

#[tauri::command]
fn native_audio_set_volume(volume: f32, muted: bool) -> Result<(), String> {
    native_audio::set_volume(volume, muted)
}

#[tauri::command]
fn native_audio_apply_effects(payload: native_audio::NativeEffectsPayload) -> Result<(), String> {
    native_audio::apply_effects(payload)
}

#[tauri::command]
fn native_audio_spectrum(bands: usize) -> Vec<f32> {
    native_audio::spectrum(bands)
}

#[tauri::command]
fn native_audio_spectrum_pair(bands: usize) -> native_audio::NativeSpectrumPair {
    native_audio::spectrum_pair(bands)
}

#[tauri::command]
fn feed_projectm_native_audio(count_per_channel: usize) -> Result<bool, String> {
    let samples = native_audio::projectm_pcm_stereo(count_per_channel);
    feed_projectm_pcm(2, (samples.len() / 2) as u32, samples)
}

fn text_looks_like_headphones(value: &str) -> bool {
    let text = value.to_ascii_lowercase();
    text.contains("headphone")
        || text.contains("headset")
        || text.contains("earbud")
        || text.contains("airpods")
        || text.contains("buds")
        || text.contains("kulakl")
        || text.contains("analog-output-headphones")
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

#[tauri::command]
fn native_audio_output_state() -> NativeAudioOutputState {
    #[cfg(target_os = "linux")]
    {
        let info = command_output("pactl", &["info"]).unwrap_or_default();
        let default_sink = info
            .lines()
            .find_map(|line| line.strip_prefix("Default Sink:"))
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        let default_source = info
            .lines()
            .find_map(|line| line.strip_prefix("Default Source:"))
            .map(str::trim)
            .unwrap_or("")
            .to_string();

        let sinks = command_output("pactl", &["list", "sinks"]).unwrap_or_default();
        let mut selected_block = String::new();
        if !default_sink.is_empty() {
            for block in sinks.split("\nSink #") {
                if block.contains(&format!("Name: {default_sink}")) {
                    selected_block = block.to_string();
                    break;
                }
            }
        }
        if selected_block.is_empty() {
            selected_block = sinks.split("\nSink #").next().unwrap_or("").to_string();
        }

        let description = selected_block
            .lines()
            .find_map(|line| line.trim().strip_prefix("Description:"))
            .map(str::trim)
            .unwrap_or("");
        let active_port = selected_block
            .lines()
            .find_map(|line| line.trim().strip_prefix("Active Port:"))
            .map(str::trim)
            .unwrap_or("");
        let device_text = format!("{default_sink} {default_source} {description} {active_port}");
        let haystack = format!("{device_text} {selected_block}");
        let is_usb_audio = haystack.contains("device.bus = \"usb\"")
            || haystack.contains("snd_usb_audio")
            || default_sink.contains(".usb-")
            || default_sink.contains("_USB_");
        let has_related_usb_input = !default_source.is_empty()
            && (default_source.contains(".usb-")
                || default_source.contains("_USB_")
                || default_source.contains("mono-fallback"))
            && (default_sink.contains(".usb-") || default_sink.contains("_USB_"));
        let active_port_is_headphones = text_looks_like_headphones(active_port);
        let device_name_says_headphones = text_looks_like_headphones(&device_text)
            && !active_port.contains("speaker")
            && !active_port.contains("lineout");
        let is_headphones = active_port_is_headphones
            || device_name_says_headphones
            || (is_usb_audio
                && has_related_usb_input
                && !haystack.to_ascii_lowercase().contains("hdmi")
                && !haystack.to_ascii_lowercase().contains("iec958"));
        let name = if description.is_empty() {
            default_sink.clone()
        } else {
            description.to_string()
        };

        return NativeAudioOutputState {
            success: !default_sink.is_empty() || !name.is_empty(),
            current_output_name: if name.is_empty() {
                "Bilinmeyen cikis".to_string()
            } else {
                name
            },
            current_output_id: default_sink,
            is_headphones,
            message: if is_headphones {
                "Kulaklik algilandi".to_string()
            } else {
                "Hoparlor/line cikisi algilandi".to_string()
            },
        };
    }

    #[allow(unreachable_code)]
    NativeAudioOutputState {
        success: false,
        current_output_name: "Bilinmeyen cikis".to_string(),
        current_output_id: String::new(),
        is_headphones: false,
        message: "Cikis bilgisi okunamadi".to_string(),
    }
}

fn library_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("ardali-library.json"))
}

#[tauri::command]
fn load_library(app: tauri::AppHandle) -> Result<LibrarySnapshot, String> {
    let path = library_path(&app)?;
    if !path.exists() {
        return Ok(LibrarySnapshot::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_library(app: tauri::AppHandle, library: LibrarySnapshot) -> Result<(), String> {
    let path = library_path(&app)?;
    let content = serde_json::to_string_pretty(&library).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

#[tauri::command]
fn log_frontend_error(source: String, message: String) {
    eprintln!("[frontend:{source}] {message}");
}

fn synchsafe_to_usize(bytes: &[u8]) -> usize {
    bytes
        .iter()
        .fold(0usize, |size, byte| (size << 7) | usize::from(byte & 0x7f))
}

fn remove_id3_unsynchronisation(bytes: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        let byte = bytes[index];
        output.push(byte);
        if byte == 0xff && bytes.get(index + 1) == Some(&0x00) {
            index += 2;
        } else {
            index += 1;
        }
    }
    output
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

fn base64_value(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut quartet = [0u8; 4];
    let mut count = 0usize;
    let mut padding = 0usize;

    for byte in input.bytes().filter(|byte| !byte.is_ascii_whitespace()) {
        if byte == b'=' {
            quartet[count] = 0;
            count += 1;
            padding += 1;
        } else if let Some(value) = base64_value(byte) {
            if padding > 0 {
                return None;
            }
            quartet[count] = value;
            count += 1;
        } else {
            return None;
        }

        if count == 4 {
            output.push((quartet[0] << 2) | (quartet[1] >> 4));
            if padding < 2 {
                output.push((quartet[1] << 4) | (quartet[2] >> 2));
            }
            if padding == 0 {
                output.push((quartet[2] << 6) | quartet[3]);
            }
            count = 0;
            padding = 0;
        }
    }

    if count == 0 {
        Some(output)
    } else {
        None
    }
}

fn safe_cache_id(value: &str) -> String {
    let mut id = String::with_capacity(value.len().max(1));
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            id.push(ch);
        } else {
            id.push('_');
        }
    }
    if id.is_empty() {
        id.push('0');
    }
    id
}

#[tauri::command]
fn cache_media_art(track_id: String, data_url: String) -> Result<Option<String>, String> {
    let Some((header, payload)) = data_url.split_once(',') else {
        return Ok(None);
    };
    if !header.starts_with("data:image/") || !header.contains(";base64") {
        return Ok(None);
    }

    let mime = header
        .strip_prefix("data:")
        .and_then(|value| value.split_once(';').map(|(mime, _)| mime))
        .unwrap_or("image/jpeg");
    let extension = match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "jpg",
    };
    let Some(bytes) = base64_decode(payload) else {
        return Ok(None);
    };
    if bytes.is_empty() || bytes.len() > 2_500_000 {
        return Ok(None);
    }

    let dir = std::env::temp_dir().join("ardali-webmedia-art");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(format!("{}.{}", safe_cache_id(&track_id), extension));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

fn find_apic_payload(bytes: &[u8]) -> Option<(String, Vec<u8>)> {
    let header = bytes.get(0..10)?;
    if header.get(0..3)? != b"ID3" {
        return None;
    }
    let major = *header.get(3)?;
    let flags = *header.get(5)?;
    let tag_size = synchsafe_to_usize(header.get(6..10)?);
    let tag_end = (10 + tag_size).min(bytes.len());
    let mut tag = bytes.get(10..tag_end)?.to_vec();
    if flags & 0x80 != 0 {
        tag = remove_id3_unsynchronisation(&tag);
    }
    let mut offset = 0usize;
    if flags & 0x40 != 0 && tag.len() >= 4 {
        let extended_size = if major == 4 {
            synchsafe_to_usize(tag.get(0..4)?)
        } else {
            u32::from_be_bytes(tag.get(0..4)?.try_into().ok()?) as usize + 4
        };
        offset = extended_size.min(tag.len());
    }

    while offset + 10 <= tag.len() {
        let frame_header = tag.get(offset..offset + 10)?;
        let frame_id = frame_header.get(0..4)?;
        if frame_id.iter().all(|byte| *byte == 0) {
            break;
        }
        let frame_size = if major == 4 {
            synchsafe_to_usize(frame_header.get(4..8)?)
        } else {
            let size = frame_header.get(4..8)?.try_into().ok()?;
            u32::from_be_bytes(size) as usize
        };
        let data_start = offset + 10;
        let data_end = (data_start + frame_size).min(tag.len());
        if data_end <= data_start {
            break;
        }
        if frame_id == b"APIC".as_slice() {
            let frame = tag.get(data_start..data_end)?;
            if frame.len() < 5 {
                return None;
            }
            let encoding = *frame.first()?;
            let mime_tail = frame.get(1..)?;
            let mime_end = mime_tail.iter().position(|byte| *byte == 0)? + 1;
            let mime = String::from_utf8_lossy(frame.get(1..mime_end)?).to_string();
            let picture_type_at = mime_end + 1;
            let desc_start = picture_type_at + 1;
            if desc_start >= frame.len() {
                return None;
            }
            let image_start = if encoding == 1 || encoding == 2 {
                frame
                    .get(desc_start..)?
                    .windows(2)
                    .position(|pair| pair == [0, 0])
                    .map(|pos| desc_start + pos + 2)?
            } else {
                frame
                    .get(desc_start..)?
                    .iter()
                    .position(|byte| *byte == 0)
                    .map(|pos| desc_start + pos + 1)?
            };
            let image_start = find_image_signature(frame).unwrap_or(image_start);
            if let Some(image) = frame.get(image_start..) {
                return Some((normalize_image_mime(mime, image), image.to_vec()));
            }
        }
        offset = data_end;
    }
    None
}

fn find_id3v22_pic_payload(bytes: &[u8]) -> Option<(String, Vec<u8>)> {
    let header = bytes.get(0..10)?;
    if header.get(0..3)? != b"ID3" || *header.get(3)? != 2 {
        return None;
    }
    let tag_size = synchsafe_to_usize(header.get(6..10)?);
    let tag_end = (10 + tag_size).min(bytes.len());
    let mut offset = 10usize;
    while offset + 6 <= tag_end {
        let frame_id = bytes.get(offset..offset + 3)?;
        if frame_id.iter().all(|byte| *byte == 0) {
            break;
        }
        let frame_size = ((usize::from(*bytes.get(offset + 3)?)) << 16)
            | ((usize::from(*bytes.get(offset + 4)?)) << 8)
            | usize::from(*bytes.get(offset + 5)?);
        let data_start = offset + 6;
        let data_end = (data_start + frame_size).min(tag_end);
        if frame_id == b"PIC".as_slice() {
            let frame = bytes.get(data_start..data_end)?;
            if frame.len() < 6 {
                return None;
            }
            let encoding = *frame.first()?;
            let format = String::from_utf8_lossy(frame.get(1..4)?).to_ascii_lowercase();
            let mime = if format.contains("png") {
                "image/png"
            } else {
                "image/jpeg"
            }
            .to_string();
            let desc_start = 5usize;
            let image_start = if encoding == 1 || encoding == 2 {
                frame
                    .get(desc_start..)?
                    .windows(2)
                    .position(|pair| pair == [0, 0])
                    .map(|pos| desc_start + pos + 2)?
            } else {
                frame
                    .get(desc_start..)?
                    .iter()
                    .position(|byte| *byte == 0)
                    .map(|pos| desc_start + pos + 1)?
            };
            let image_start = find_image_signature(frame).unwrap_or(image_start);
            let image = frame.get(image_start..)?.to_vec();
            return Some((normalize_image_mime(mime, &image), image));
        }
        offset = data_end;
    }
    None
}

fn read_be_u32(bytes: &[u8]) -> Option<u32> {
    Some(u32::from_be_bytes(bytes.get(0..4)?.try_into().ok()?))
}

fn read_be_u64(bytes: &[u8]) -> Option<u64> {
    Some(u64::from_be_bytes(bytes.get(0..8)?.try_into().ok()?))
}

fn normalize_image_mime(mime: String, image: &[u8]) -> String {
    let lowered = mime.trim().to_ascii_lowercase();
    if lowered == "image/jpg" || lowered == "jpg" || lowered == "jpeg" {
        return "image/jpeg".to_string();
    }
    if lowered == "png" {
        return "image/png".to_string();
    }
    if lowered == "webp" {
        return "image/webp".to_string();
    }
    if lowered == "gif" {
        return "image/gif".to_string();
    }
    if lowered.starts_with("image/") {
        return lowered;
    }
    if image.starts_with(&[0xff, 0xd8, 0xff]) {
        return "image/jpeg".to_string();
    }
    if image.starts_with(b"\x89PNG\r\n\x1a\n") {
        return "image/png".to_string();
    }
    if image.starts_with(b"RIFF") && image.get(8..12) == Some(b"WEBP") {
        return "image/webp".to_string();
    }
    if image.starts_with(b"GIF87a") || image.starts_with(b"GIF89a") {
        return "image/gif".to_string();
    }
    "image/jpeg".to_string()
}

fn find_image_signature(bytes: &[u8]) -> Option<usize> {
    let mut best: Option<usize> = None;
    for signature in [
        b"\xff\xd8\xff".as_slice(),
        b"\x89PNG\r\n\x1a\n".as_slice(),
        b"GIF87a".as_slice(),
        b"GIF89a".as_slice(),
        b"RIFF".as_slice(),
    ] {
        if let Some(pos) = bytes
            .windows(signature.len())
            .position(|window| window == signature)
        {
            best = Some(best.map_or(pos, |current| current.min(pos)));
        }
    }
    best
}

fn find_mp4_covr_payload(bytes: &[u8]) -> Option<(String, Vec<u8>)> {
    fn walk(bytes: &[u8], start: usize, end: usize, depth: usize) -> Option<(String, Vec<u8>)> {
        if depth > 8 {
            return None;
        }
        let mut offset = start;
        while offset + 8 <= end && offset + 8 <= bytes.len() {
            let size32 = read_be_u32(bytes.get(offset..offset + 4)?)? as usize;
            let atom_type = bytes.get(offset + 4..offset + 8)?;
            let (header_size, atom_size) = if size32 == 1 {
                let size64 = read_be_u64(bytes.get(offset + 8..offset + 16)?)? as usize;
                (16usize, size64)
            } else if size32 == 0 {
                (8usize, end.saturating_sub(offset))
            } else {
                (8usize, size32)
            };
            if atom_size < header_size
                || offset + atom_size > end
                || offset + atom_size > bytes.len()
            {
                break;
            }
            let data_start = offset + header_size;
            let data_end = offset + atom_size;
            if atom_type == b"covr".as_slice() {
                let mut inner = data_start;
                while inner + 16 <= data_end {
                    let inner_size = read_be_u32(bytes.get(inner..inner + 4)?)? as usize;
                    let inner_type = bytes.get(inner + 4..inner + 8)?;
                    if inner_size < 16 || inner + inner_size > data_end {
                        break;
                    }
                    if inner_type == b"data".as_slice() {
                        let kind = read_be_u32(bytes.get(inner + 8..inner + 12)?)? & 0xff;
                        let mime = if kind == 14 {
                            "image/png"
                        } else {
                            "image/jpeg"
                        }
                        .to_string();
                        let image = bytes.get(inner + 16..inner + inner_size)?.to_vec();
                        return Some((normalize_image_mime(mime, &image), image));
                    }
                    inner += inner_size;
                }
            }
            if matches!(
                atom_type,
                b"moov" | b"udta" | b"meta" | b"ilst" | b"trak" | b"mdia" | b"minf" | b"stbl"
            ) {
                let child_start = if atom_type == b"meta".as_slice() {
                    (data_start + 4).min(data_end)
                } else {
                    data_start
                };
                if let Some(found) = walk(bytes, child_start, data_end, depth + 1) {
                    return Some(found);
                }
            }
            offset += atom_size;
        }
        None
    }
    walk(bytes, 0, bytes.len(), 0)
}

fn find_flac_picture_payload(bytes: &[u8]) -> Option<(String, Vec<u8>)> {
    if bytes.get(0..4)? != b"fLaC" {
        return None;
    }
    let mut offset = 4usize;
    while offset + 4 <= bytes.len() {
        let header = *bytes.get(offset)?;
        let block_type = header & 0x7f;
        let is_last = header & 0x80 != 0;
        let size = ((usize::from(*bytes.get(offset + 1)?)) << 16)
            | ((usize::from(*bytes.get(offset + 2)?)) << 8)
            | usize::from(*bytes.get(offset + 3)?);
        offset += 4;
        let block = bytes.get(offset..offset + size)?;
        if block_type == 6 {
            let mut cursor = 0usize;
            let _picture_type = read_be_u32(block.get(cursor..cursor + 4)?)?;
            cursor += 4;
            let mime_len = read_be_u32(block.get(cursor..cursor + 4)?)? as usize;
            cursor += 4;
            let mime = String::from_utf8_lossy(block.get(cursor..cursor + mime_len)?).to_string();
            cursor += mime_len;
            let desc_len = read_be_u32(block.get(cursor..cursor + 4)?)? as usize;
            cursor += 4 + desc_len;
            cursor += 16; // width, height, color depth, indexed color count
            let data_len = read_be_u32(block.get(cursor..cursor + 4)?)? as usize;
            cursor += 4;
            let image = block.get(cursor..cursor + data_len)?.to_vec();
            return Some((normalize_image_mime(mime, &image), image));
        }
        offset += size;
        if is_last {
            break;
        }
    }
    None
}

fn image_mime_from_path(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

fn find_sidecar_cover_payload(path: &Path) -> Option<(String, Vec<u8>)> {
    let parent = path.parent()?;
    let stem = path.file_stem()?.to_string_lossy();
    let mut candidates = Vec::new();
    for extension in ["jpg", "jpeg", "png", "webp", "gif"] {
        candidates.push(parent.join(format!("{stem}.{extension}")));
    }
    for name in ["cover", "folder", "front", "album", "artwork"] {
        for extension in ["jpg", "jpeg", "png", "webp", "gif"] {
            candidates.push(parent.join(format!("{name}.{extension}")));
        }
    }

    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let Some(mime) = image_mime_from_path(&candidate) else {
            continue;
        };
        let Ok(metadata) = fs::metadata(&candidate) else {
            continue;
        };
        if metadata.len() == 0 || metadata.len() > 8_000_000 {
            continue;
        }
        if let Ok(image) = fs::read(&candidate) {
            if !image.is_empty() {
                return Some((mime.to_string(), image));
            }
        }
    }
    None
}

#[tauri::command]
fn extract_cover_art(path: String) -> Result<Option<String>, String> {
    let media_path = PathBuf::from(path);
    let bytes = fs::read(&media_path).map_err(|error| error.to_string())?;
    let Some((mime, image)) = find_apic_payload(&bytes)
        .or_else(|| find_id3v22_pic_payload(&bytes))
        .or_else(|| find_flac_picture_payload(&bytes))
        .or_else(|| find_mp4_covr_payload(&bytes))
        .or_else(|| find_sidecar_cover_payload(&media_path))
    else {
        return Ok(None);
    };
    if image.is_empty() || image.len() > 8_000_000 {
        return Ok(None);
    }
    let safe_mime = normalize_image_mime(mime, &image);
    Ok(Some(format!(
        "data:{};base64,{}",
        safe_mime,
        base64_encode(&image)
    )))
}

fn first_existing_path(paths: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    paths.into_iter().find(|path| path.exists())
}

fn project_root_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir);
    }
    roots
}

fn visualizer_exe_name() -> &'static str {
    if cfg!(windows) {
        "ardali-projectm-visualizer.exe"
    } else {
        "ardali-projectm-visualizer"
    }
}

fn visualizer_platform_dir() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn find_visualizer_executable(app: &tauri::AppHandle) -> Option<PathBuf> {
    let exe_name = visualizer_exe_name();
    let mut candidates = Vec::new();
    if let Ok(path) = app.path().resolve(exe_name, BaseDirectory::Resource) {
        candidates.push(path);
    }
    if let Ok(path) = app.path().resolve(
        Path::new("native-dist")
            .join(visualizer_platform_dir())
            .join(exe_name),
        BaseDirectory::Resource,
    ) {
        candidates.push(path);
    }
    if let Ok(path) = app.path().resolve(
        Path::new("native-dist").join(exe_name),
        BaseDirectory::Resource,
    ) {
        candidates.push(path);
    }
    for root in project_root_candidates(app) {
        candidates.push(root.join(exe_name));
        candidates.push(
            root.join("_up_")
                .join("native-dist")
                .join(visualizer_platform_dir())
                .join(exe_name),
        );
        candidates.push(
            root.join("native-dist")
                .join(visualizer_platform_dir())
                .join(exe_name),
        );
        candidates.push(root.join("native-dist").join(exe_name));
        candidates.push(root.join("build-visualizer-ardali").join(exe_name));
        candidates.push(root.join("build-visualizer").join(exe_name));
    }
    if let Some(appdir) = std::env::var_os("APPDIR") {
        let appdir = PathBuf::from(appdir);
        candidates.push(
            appdir
                .join("usr")
                .join("lib")
                .join("ArDali WebMedia")
                .join("_up_")
                .join("native-dist")
                .join(visualizer_platform_dir())
                .join(exe_name),
        );
        candidates.push(appdir.join("usr").join("lib").join(exe_name));
        candidates.push(appdir.join("usr").join("bin").join(exe_name));
    }
    first_existing_path(candidates)
}

fn find_visualizer_presets(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = app
        .path()
        .resolve("visualizer-presets", BaseDirectory::Resource)
    {
        candidates.push(path);
    }
    if let Ok(path) = app.path().resolve(
        Path::new("public").join("visualizer-presets"),
        BaseDirectory::Resource,
    ) {
        candidates.push(path);
    }
    for root in project_root_candidates(app) {
        candidates.push(
            root.join("_up_")
                .join("public")
                .join("visualizer-presets"),
        );
        candidates.push(root.join("public").join("visualizer-presets"));
        candidates.push(root.join("visualizer-presets"));
        candidates.push(root.join("third_party").join("projectm").join("presets"));
    }
    if let Some(appdir) = std::env::var_os("APPDIR") {
        candidates.push(
            PathBuf::from(appdir)
                .join("usr")
                .join("lib")
                .join("ArDali WebMedia")
                .join("_up_")
                .join("public")
                .join("visualizer-presets"),
        );
    }
    first_existing_path(candidates)
}

#[cfg(target_os = "linux")]
fn configure_packaged_webkit_runtime() {
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    if std::env::var_os("WEBKIT_DISABLE_SANDBOX").is_none() {
        std::env::set_var("WEBKIT_DISABLE_SANDBOX", "1");
    }
    if std::env::var_os("GST_PLUGIN_SYSTEM_PATH_1_0").is_none() {
        std::env::set_var(
            "GST_PLUGIN_SYSTEM_PATH_1_0",
            "/usr/lib/gstreamer-1.0:/usr/lib64/gstreamer-1.0:/usr/lib/x86_64-linux-gnu/gstreamer-1.0",
        );
    }
    if std::env::var_os("GST_PLUGIN_PATH_1_0").is_none() {
        std::env::set_var(
            "GST_PLUGIN_PATH_1_0",
            "/usr/lib/gstreamer-1.0:/usr/lib64/gstreamer-1.0:/usr/lib/x86_64-linux-gnu/gstreamer-1.0",
        );
    }
}

fn app_language_to_locale(language: Option<&str>) -> &'static str {
    match language.unwrap_or("tr-TR") {
        "ar-SA" => "ar_SA.UTF-8",
        "en-US" => "en_US.UTF-8",
        "es-ES" => "es_ES.UTF-8",
        _ => "tr_TR.UTF-8",
    }
}

#[cfg(target_os = "linux")]
fn prepare_visualizer_executable(app: &tauri::AppHandle, exe: &Path) -> Result<PathBuf, String> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = fs::metadata(exe)
        .map_err(|error| format!("ProjectM binary okunamadi: {} ({error})", exe.display()))?;
    if metadata.permissions().mode() & 0o111 != 0 {
        return Ok(exe.to_path_buf());
    }

    let runtime_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("native-tools")
        .join(visualizer_platform_dir());
    fs::create_dir_all(&runtime_dir).map_err(|error| {
        format!(
            "ProjectM runtime klasoru olusturulamadi: {} ({error})",
            runtime_dir.display()
        )
    })?;

    let runtime_exe = runtime_dir.join(visualizer_exe_name());
    fs::copy(exe, &runtime_exe).map_err(|error| {
        format!(
            "ProjectM binary kopyalanamadi: {} -> {} ({error})",
            exe.display(),
            runtime_exe.display()
        )
    })?;

    if let Some(source_dir) = exe.parent() {
        for entry in fs::read_dir(source_dir).map_err(|error| {
            format!(
                "ProjectM runtime klasoru okunamadi: {} ({error})",
                source_dir.display()
            )
        })? {
            let entry = entry.map_err(|error| error.to_string())?;
            let source = entry.path();
            let Some(name) = source.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if !name.to_ascii_lowercase().contains("projectm") || !name.contains(".so") {
                continue;
            }
            let target = runtime_dir.join(name);
            fs::copy(&source, &target).map_err(|error| {
                format!(
                    "ProjectM kutuphanesi kopyalanamadi: {} -> {} ({error})",
                    source.display(),
                    target.display()
                )
            })?;
        }
    }

    let mut permissions = fs::metadata(&runtime_exe)
        .map_err(|error| {
            format!(
                "ProjectM kopyasi okunamadi: {} ({error})",
                runtime_exe.display()
            )
        })?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&runtime_exe, permissions).map_err(|error| {
        format!(
            "ProjectM calistirma izni verilemedi: {} ({error})",
            runtime_exe.display()
        )
    })?;

    Ok(runtime_exe)
}

fn projectm_log_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .ok()
        .map(|dir| dir.join("projectm-visualizer.log"))
}

fn visualizer_icon_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("native-tools");
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    let icon = dir.join("ardali-visualizer-icon.bmp");
    match fs::write(&icon, VISUALIZER_ICON_BMP) {
        Ok(_) => Some(icon),
        Err(_) if icon.exists() => Some(icon),
        Err(_) => None,
    }
}

#[tauri::command]
fn start_projectm_visualizer(
    app: tauri::AppHandle,
    language: Option<String>,
    theme: Option<String>,
) -> Result<String, String> {
    let mut process = PROJECTM_PROCESS.lock().map_err(|error| error.to_string())?;
    if let Some(child) = process.as_mut() {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            return Ok("ProjectM zaten calisiyor".to_string());
        }
    }

    let mut exe = find_visualizer_executable(&app).ok_or_else(|| {
        "ProjectM binary bulunamadi. Once `npm run visualizer:build` calistirin.".to_string()
    })?;
    #[cfg(target_os = "linux")]
    {
        exe = prepare_visualizer_executable(&app, &exe)?;
    }
    let presets = find_visualizer_presets(&app)
        .ok_or_else(|| "ProjectM milk preset klasoru bulunamadi.".to_string())?;
    let working_dir = exe.parent().unwrap_or_else(|| Path::new("."));

    let mut command = Command::new(&exe);
    command
        .arg("--presets")
        .arg(&presets)
        .env("PROJECTM_PRESETS_PATH", &presets)
        .env("ARDALI_VIS_MAIN_W", "900")
        .env("ARDALI_VIS_MAIN_H", "650")
        .env("ARDALI_VIS_TEXTURE_QUALITY", "q2048")
        .env("ARDALI_VIS_CLARITY_MODE", "sharp")
        .env("ARDALI_LANG", app_language_to_locale(language.as_deref()))
        .env("ARDALI_UI_THEME", theme.as_deref().unwrap_or("black"))
        .env("ARDALI_VIS_WMCLASS", "com.ardali.mediaplayer")
        .env("ARDALI_VIS_DESKTOP_ENTRY", "com.ardali.mediaplayer")
        .current_dir(working_dir)
        .stdin(Stdio::piped());

    if let Some(icon) = visualizer_icon_file(&app) {
        command.env("ARDALI_VISUALIZER_ICON", icon);
    }

    #[cfg(target_os = "linux")]
    {
        let mut library_path = working_dir.as_os_str().to_os_string();
        if let Some(existing) = std::env::var_os("LD_LIBRARY_PATH") {
            library_path.push(":");
            library_path.push(existing);
        }
        command.env("LD_LIBRARY_PATH", library_path);

        if let Some(driver) = std::env::var("ARDALI_VIS_SDL_DRIVER")
            .ok()
            .filter(|value| !value.trim().is_empty())
        {
            command.env("SDL_VIDEODRIVER", driver);
        }
    }

    let log_file = projectm_log_file(&app);
    if cfg!(debug_assertions) {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    } else if let Some(path) = &log_file {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match fs::OpenOptions::new().create(true).append(true).open(path) {
            Ok(file) => match file.try_clone() {
                Ok(stdout) => {
                    command.stdout(Stdio::from(stdout)).stderr(Stdio::from(file));
                }
                Err(_) => {
                    command.stdout(Stdio::null()).stderr(Stdio::null());
                }
            },
            Err(_) => {
                command.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }

    let mut child = command.spawn().map_err(|error| {
        format!(
            "ProjectM baslatilamadi: {} | presets: {} | hata: {error}",
            exe.display(),
            presets.display()
        )
    })?;

    thread::sleep(Duration::from_millis(350));
    if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
        let log_hint = log_file
            .as_ref()
            .map(|path| format!(" | log: {}", path.display()))
            .unwrap_or_default();
        return Err(format!(
            "ProjectM hemen kapandi: {status} | binary: {}{log_hint}",
            exe.display()
        ));
    }

    *process = Some(child);
    Ok(format!("ProjectM baslatildi: {}", exe.display()))
}

#[tauri::command]
fn feed_projectm_pcm(
    channels: u32,
    count_per_channel: u32,
    samples: Vec<f32>,
) -> Result<bool, String> {
    if channels != 1 && channels != 2 {
        return Err("Gecersiz kanal sayisi".to_string());
    }
    if count_per_channel == 0 || count_per_channel > 65_536 {
        return Err("Gecersiz PCM ornek sayisi".to_string());
    }
    if samples.len() != channels as usize * count_per_channel as usize {
        return Err("PCM paket boyutu kanal/ornek bilgisiyle uyusmuyor".to_string());
    }

    let mut process = PROJECTM_PROCESS.lock().map_err(|error| error.to_string())?;
    let Some(child) = process.as_mut() else {
        return Ok(false);
    };
    if child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        *process = None;
        return Ok(false);
    }
    let Some(stdin) = child.stdin.as_mut() else {
        return Ok(false);
    };

    let mut packet = Vec::with_capacity(8 + samples.len() * std::mem::size_of::<f32>());
    packet.extend_from_slice(&channels.to_le_bytes());
    packet.extend_from_slice(&count_per_channel.to_le_bytes());
    for sample in samples {
        packet.extend_from_slice(&sample.clamp(-1.0, 1.0).to_le_bytes());
    }
    stdin
        .write_all(&packet)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn stop_projectm_visualizer() -> Result<(), String> {
    let mut process = PROJECTM_PROCESS.lock().map_err(|error| error.to_string())?;
    if let Some(child) = process.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *process = None;
    Ok(())
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    app.restart();
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Ana pencere bulunamadi".to_string())?;
    hide_main_window_to_tray(&window);
    Ok(())
}

fn configure_media_backend() {
    // Let WebKit/GStreamer choose the most stable sink for the host.
    // Forcing pipewiresink can crash on some WebKitGTK + PipeWire builds
    // during the first media playback.
}

fn percent_decode(input: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.as_bytes().iter().copied();
    while let Some(byte) = chars.next() {
        if byte == b'%' {
            let high = chars.next()?;
            let low = chars.next()?;
            let hex = [high, low];
            let text = std::str::from_utf8(&hex).ok()?;
            bytes.push(u8::from_str_radix(text, 16).ok()?);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).ok()
}

fn media_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "avi" => "video/x-msvideo",
        "m4v" | "mov" | "mp4" => "video/mp4",
        "mkv" => "video/x-matroska",
        "ogv" => "video/ogg",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

fn parse_range(header: Option<&str>, size: u64) -> Option<(u64, u64)> {
    let value = header?.trim().strip_prefix("bytes=")?;
    let (start, end) = value.split_once('-')?;
    if start.is_empty() {
        let suffix_length = end.parse::<u64>().ok()?.min(size);
        if suffix_length == 0 {
            return None;
        }
        return Some((size - suffix_length, size - 1));
    }
    let start = start.parse::<u64>().ok()?;
    let end = if end.trim().is_empty() {
        size.saturating_sub(1)
    } else {
        end.parse::<u64>().ok()?.min(size.saturating_sub(1))
    };
    if start <= end && start < size {
        Some((start, end))
    } else {
        None
    }
}

fn write_http_error(stream: &mut TcpStream, status: &str) {
    let body = status.as_bytes();
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(body);
}

fn handle_media_request(mut stream: TcpStream) {
    let mut buffer = [0u8; 8192];
    let Ok(read) = stream.read(&mut buffer) else {
        return;
    };
    let request = String::from_utf8_lossy(&buffer[..read]);
    let mut lines = request.lines();
    let Some(request_line) = lines.next() else {
        write_http_error(&mut stream, "400 Bad Request");
        return;
    };
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default();
    let target = request_parts.next().unwrap_or_default();
    if method != "GET" && method != "HEAD" {
        write_http_error(&mut stream, "405 Method Not Allowed");
        return;
    }
    let Some(encoded_path) = target.strip_prefix("/media?path=") else {
        write_http_error(&mut stream, "404 Not Found");
        return;
    };
    let Some(path_text) = percent_decode(encoded_path) else {
        write_http_error(&mut stream, "400 Bad Request");
        return;
    };
    let path = PathBuf::from(path_text);
    let Ok(mut file) = fs::File::open(&path) else {
        write_http_error(&mut stream, "404 Not Found");
        return;
    };
    let Ok(metadata) = file.metadata() else {
        write_http_error(&mut stream, "404 Not Found");
        return;
    };
    let size = metadata.len();
    if size == 0 {
        write_http_error(&mut stream, "416 Range Not Satisfiable");
        return;
    }

    let range_header = lines.find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("range") {
            Some(value)
        } else {
            None
        }
    });
    let content_type = media_content_type(&path);
    let Some(range) = (if range_header.is_some() {
        parse_range(range_header, size)
    } else {
        Some((0, size - 1))
    }) else {
        let _ = write!(
            stream,
            "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{size}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        );
        return;
    };
    let partial = range_header.is_some();
    let (start, end) = range;
    let content_length = end - start + 1;
    let status = if partial {
        "206 Partial Content"
    } else {
        "200 OK"
    };
    let content_range = if partial {
        format!("Content-Range: bytes {start}-{end}/{size}\r\n")
    } else {
        String::new()
    };

    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nAccept-Ranges: bytes\r\n{content_range}Content-Length: {content_length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
    );
    if method == "HEAD" {
        return;
    }
    if file.seek(SeekFrom::Start(start)).is_ok() {
        let mut limited = file.take(content_length);
        let _ = std::io::copy(&mut limited, &mut stream);
    }
}

fn start_local_media_server() {
    let _ = MEDIA_SERVER_STARTED.get_or_init(|| {
        thread::spawn(|| {
            let Ok(listener) = TcpListener::bind(MEDIA_SERVER_ADDR) else {
                eprintln!("[media-server] {MEDIA_SERVER_ADDR} dinlenemedi");
                return;
            };
            for stream in listener.incoming().flatten() {
                thread::spawn(|| handle_media_request(stream));
            }
        });
    });
}

fn safe_mpris_track_path(track_id: &str) -> String {
    let mut id = String::with_capacity(track_id.len().max(1));
    for ch in track_id.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            id.push(ch);
        } else {
            id.push('_');
        }
    }
    if id.is_empty() {
        id.push('0');
    }
    format!("/org/mpris/MediaPlayer2/track/{id}")
}

fn apply_mpris_metadata(player: &MprisPlayer, payload: MprisMetadataPayload) {
    let duration_us = (payload.duration.max(0.0) * 1_000_000.0).round() as i64;
    let position_us = (payload.position.max(0.0) * 1_000_000.0).round() as i64;
    let title = payload.title.trim();
    let artist = payload.artist.trim();
    let album = payload.album.trim();
    let album_art = payload.album_art.trim();
    let url = payload.url.trim();

    let mut metadata = Metadata::new();
    metadata.track_id = Some(safe_mpris_track_path(&payload.track_id));
    metadata.length = Some(duration_us);
    metadata.title = Some(if title.is_empty() {
        "ArDali".to_string()
    } else {
        title.to_string()
    });
    metadata.artist = Some(vec![if artist.is_empty() {
        "ArDali WebMedia".to_string()
    } else {
        artist.to_string()
    }]);
    if !album.is_empty() {
        metadata.album = Some(album.to_string());
    }
    if !album_art.is_empty() {
        metadata.art_url = Some(album_art.to_string());
    }
    if !payload.media_type.trim().is_empty() {
        metadata.genre = Some(vec![payload.media_type]);
    }
    if !url.is_empty() {
        metadata.url = Some(url.to_string());
    }

    player.set_minimum_rate(1.0);
    player.set_maximum_rate(1.0);
    player.set_can_seek(payload.can_seek);
    player.set_can_go_next(payload.can_go_next);
    player.set_can_go_previous(payload.can_go_previous);
    player.set_can_control(true);
    player.set_can_play(true);
    player.set_can_pause(true);
    let _ = player.set_rate(1.0);
    let _ = player.set_volume(payload.volume.clamp(0.0, 1.0));
    player.set_position(position_us);
    player.set_metadata(metadata);
    player.set_playback_status(if payload.is_playing {
        PlaybackStatus::Playing
    } else {
        PlaybackStatus::Paused
    });
}

fn apply_mpris_position(
    player: &MprisPlayer,
    payload: MprisPositionPayload,
    last_playing: &mut Option<bool>,
    last_volume: &mut Option<f64>,
) {
    let position_us = (payload.position.max(0.0) * 1_000_000.0).round() as i64;
    player.set_position(position_us);
    if payload.seeked {
        player.emit_seeked(position_us);
    }

    if last_playing.map_or(true, |value| value != payload.is_playing) {
        player.set_playback_status(if payload.is_playing {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        });
        *last_playing = Some(payload.is_playing);
    }

    let volume = payload.volume.clamp(0.0, 1.0);
    if last_volume.map_or(true, |value| (value - volume).abs() > 0.005) {
        let _ = player.set_volume(volume);
        *last_volume = Some(volume);
    }
}

fn start_mpris_bridge(app: tauri::AppHandle) {
    if !custom_mpris_enabled() {
        eprintln!("[mpris] WebKit MPRIS kaynagi kullaniliyor");
        return;
    }

    if std::env::var("ARDALI_DISABLE_MPRIS")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        })
        .unwrap_or(false)
    {
        eprintln!("[mpris] ARDALI_DISABLE_MPRIS nedeniyle kapali");
        return;
    }

    let bridge = MPRIS_BRIDGE.get_or_init(|| Mutex::new(None));
    let mut guard = match bridge.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    if guard.is_some() {
        return;
    }

    let (tx, rx) = mpsc::channel::<MprisCommand>();
    *guard = Some(tx);
    drop(guard);

    thread::spawn(move || {
        let flatpak_app_id = std::env::var("FLATPAK_ID")
            .or_else(|_| std::env::var("APP_ID"))
            .unwrap_or_default();
        let desktop_entry = if flatpak_app_id.trim().is_empty() {
            "com.ardali.mediaplayer".to_string()
        } else {
            flatpak_app_id.trim().to_string()
        };

        let player = MprisPlayer::new("ardali".to_string(), "ArDali".to_string(), desktop_entry);
        player.set_supported_uri_schemes(vec![
            "file".to_string(),
            "http".to_string(),
            "https".to_string(),
        ]);
        player.set_supported_mime_types(vec![
            "audio/mpeg".to_string(),
            "audio/flac".to_string(),
            "audio/x-wav".to_string(),
            "audio/ogg".to_string(),
            "audio/mp4".to_string(),
            "video/mp4".to_string(),
            "video/x-matroska".to_string(),
            "video/webm".to_string(),
            "video/x-msvideo".to_string(),
            "application/ogg".to_string(),
        ]);
        player.set_can_quit(true);
        player.set_can_raise(true);
        player.set_can_seek(true);
        player.set_can_control(true);
        player.set_can_play(true);
        player.set_can_pause(true);
        player.set_can_go_next(true);
        player.set_can_go_previous(true);
        let _ = player.set_rate(1.0);
        player.set_minimum_rate(1.0);
        player.set_maximum_rate(1.0);

        let app_for_play = app.clone();
        player.connect_play(move || {
            let _ = app_for_play.emit("mpris-control", "play");
        });
        let app_for_pause = app.clone();
        player.connect_pause(move || {
            let _ = app_for_pause.emit("mpris-control", "pause");
        });
        let app_for_toggle = app.clone();
        player.connect_play_pause(move || {
            let _ = app_for_toggle.emit("mpris-control", "play-pause");
        });
        let app_for_stop = app.clone();
        player.connect_stop(move || {
            let _ = app_for_stop.emit("mpris-control", "stop");
        });
        let app_for_next = app.clone();
        player.connect_next(move || {
            let _ = app_for_next.emit("mpris-control", "next");
        });
        let app_for_previous = app.clone();
        player.connect_previous(move || {
            let _ = app_for_previous.emit("mpris-control", "previous");
        });
        let app_for_seek = app.clone();
        player.connect_seek(move |offset| {
            let _ = app_for_seek.emit("mpris-seek", offset);
        });
        let app_for_position = app.clone();
        player.connect_position(move |position| {
            let _ = app_for_position.emit("mpris-position", position);
        });
        let app_for_raise = app.clone();
        player.connect_raise(move || {
            if let Some(window) = app_for_raise.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        });
        let app_for_quit = app.clone();
        player.connect_quit(move || {
            app_for_quit.exit(0);
        });

        eprintln!("[mpris] ArDali MPRIS servisi baslatildi");
        let mut last_playing = None;
        let mut last_volume = None;
        loop {
            for command in rx.try_iter() {
                match command {
                    MprisCommand::Update(payload) => {
                        last_playing = Some(payload.is_playing);
                        last_volume = Some(payload.volume.clamp(0.0, 1.0));
                        apply_mpris_metadata(&player, payload);
                    }
                    MprisCommand::Position(payload) => {
                        apply_mpris_position(&player, payload, &mut last_playing, &mut last_volume)
                    }
                }
            }
            player.process_events();
            thread::sleep(Duration::from_millis(60));
        }
    });
}

#[tauri::command]
fn update_mpris_metadata(payload: MprisMetadataPayload) -> Result<(), String> {
    let bridge = MPRIS_BRIDGE
        .get()
        .ok_or_else(|| "MPRIS servisi hazir degil".to_string())?;
    let guard = bridge
        .lock()
        .map_err(|_| "MPRIS kilidi alinamadi".to_string())?;
    let sender = guard
        .as_ref()
        .ok_or_else(|| "MPRIS servisi kapali".to_string())?;
    sender
        .send(MprisCommand::Update(payload))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_mpris_position(payload: MprisPositionPayload) -> Result<(), String> {
    let bridge = MPRIS_BRIDGE
        .get()
        .ok_or_else(|| "MPRIS servisi hazir degil".to_string())?;
    let guard = bridge
        .lock()
        .map_err(|_| "MPRIS kilidi alinamadi".to_string())?;
    let sender = guard
        .as_ref()
        .ok_or_else(|| "MPRIS servisi kapali".to_string())?;
    sender
        .send(MprisCommand::Position(payload))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "linux")]
fn refresh_webkit_mpris_owners(connection: &DbusConnection) -> Vec<String> {
    let proxy = connection.with_proxy(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        Duration::from_millis(500),
    );
    let Ok((names,)) =
        proxy.method_call::<(Vec<String>,), _, _, _>("org.freedesktop.DBus", "ListNames", ())
    else {
        return Vec::new();
    };

    names
        .into_iter()
        .filter(|name| name.starts_with("org.mpris.MediaPlayer2.org.webkit."))
        .filter_map(|name| {
            proxy
                .method_call::<(String,), _, _, _>(
                    "org.freedesktop.DBus",
                    "GetNameOwner",
                    (name.as_str(),),
                )
                .ok()
                .map(|(owner,)| owner)
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn is_webkit_mpris_destination(message: &Message, owners: &Arc<Mutex<Vec<String>>>) -> bool {
    let destination = message
        .destination()
        .map(|value| value.to_string())
        .unwrap_or_default();
    if destination.starts_with("org.mpris.MediaPlayer2.org.webkit.") {
        return true;
    }

    owners
        .lock()
        .map(|owners| owners.iter().any(|owner| owner == &destination))
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn webkit_mpris_set_position(message: &Message, owners: &Arc<Mutex<Vec<String>>>) -> Option<i64> {
    if message.msg_type() != MessageType::MethodCall {
        return None;
    }
    if message.path().map(|value| value.to_string()).as_deref() != Some("/org/mpris/MediaPlayer2") {
        return None;
    }
    if message
        .interface()
        .map(|value| value.to_string())
        .as_deref()
        != Some("org.mpris.MediaPlayer2.Player")
    {
        return None;
    }
    if message.member().map(|value| value.to_string()).as_deref() != Some("SetPosition") {
        return None;
    }
    if !is_webkit_mpris_destination(message, owners) {
        return None;
    }

    message
        .read2::<dbus::Path<'_>, i64>()
        .ok()
        .map(|(_, position)| position)
}

#[cfg(target_os = "linux")]
fn start_webkit_mpris_seek_bridge(app: tauri::AppHandle) {
    thread::spawn(move || {
        let Ok(connection) = DbusConnection::new_session() else {
            eprintln!("[mpris] WebKit seek dinleyicisi DBus'a baglanamadi");
            return;
        };

        let webkit_owners = Arc::new(Mutex::new(Vec::<String>::new()));
        if let Ok(mut owners) = webkit_owners.lock() {
            *owners = refresh_webkit_mpris_owners(&connection);
        }
        let owners_for_refresh = Arc::clone(&webkit_owners);
        thread::spawn(move || {
            let Ok(owner_connection) = DbusConnection::new_session() else {
                return;
            };
            loop {
                if let Ok(mut owners) = owners_for_refresh.lock() {
                    *owners = refresh_webkit_mpris_owners(&owner_connection);
                }
                thread::sleep(Duration::from_secs(2));
            }
        });

        let owners_for_signal = Arc::clone(&webkit_owners);
        let app_for_signal = app.clone();
        let rule = MatchRule::new()
            .with_type(MessageType::Signal)
            .with_path("/org/mpris/MediaPlayer2")
            .with_interface("org.mpris.MediaPlayer2.Player")
            .with_member("Seeked");

        if connection
            .add_match(rule, move |(position,): (i64,), _, message| {
                let sender = message
                    .sender()
                    .map(|value| value.to_string())
                    .unwrap_or_default();
                let is_webkit = owners_for_signal
                    .lock()
                    .map(|owners| owners.iter().any(|owner| owner == &sender))
                    .unwrap_or(false);
                if is_webkit {
                    let _ = app_for_signal.emit("mpris-position", position);
                }
                true
            })
            .is_err()
        {
            eprintln!("[mpris] WebKit Seeked sinyal dinleyicisi baslatilamadi");
        }

        let method_rule = MatchRule::new()
            .with_type(MessageType::MethodCall)
            .with_path("/org/mpris/MediaPlayer2")
            .with_interface("org.mpris.MediaPlayer2.Player")
            .with_member("SetPosition");
        let proxy = connection.with_proxy(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            Duration::from_millis(5000),
        );
        let monitor_result: Result<(), dbus::Error> = proxy.method_call(
            "org.freedesktop.DBus.Monitoring",
            "BecomeMonitor",
            (vec![method_rule.match_str()], 0u32),
        );

        let owners_for_method = Arc::clone(&webkit_owners);
        let app_for_method = app.clone();
        match monitor_result {
            Ok(_) => {
                connection.start_receive(
                    method_rule,
                    Box::new(move |message, _| {
                        if let Some(position) =
                            webkit_mpris_set_position(&message, &owners_for_method)
                        {
                            let _ = app_for_method.emit("mpris-position", position);
                        }
                        true
                    }),
                );
            }
            Err(error) => {
                eprintln!(
                    "[mpris] WebKit SetPosition monitoru baslatilamadi, eavesdrop deneniyor: {error}"
                );
                let eavesdrop_rule = method_rule.with_eavesdrop();
                let owners_for_method = Arc::clone(&webkit_owners);
                let app_for_method = app.clone();
                if connection
                    .add_match(eavesdrop_rule, move |_: (), _, message| {
                        if let Some(position) =
                            webkit_mpris_set_position(message, &owners_for_method)
                        {
                            let _ = app_for_method.emit("mpris-position", position);
                        }
                        true
                    })
                    .is_err()
                {
                    eprintln!("[mpris] WebKit SetPosition eavesdrop dinleyicisi baslatilamadi");
                }
            }
        }

        loop {
            let _ = connection.process(Duration::from_millis(250));
        }
    });
}

#[cfg(not(target_os = "linux"))]
fn start_webkit_mpris_seek_bridge(_app: tauri::AppHandle) {}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(UserAttentionType::Informational));

        #[cfg(target_os = "linux")]
        {
            let _ = window.set_always_on_top(true);
            let focused_window = window.clone();
            tauri::async_runtime::spawn(async move {
                thread::sleep(Duration::from_millis(120));
                let _ = focused_window.set_focus();
                let _ = focused_window.set_always_on_top(false);
            });
        }
    }
}

fn hide_main_window_to_tray(window: &tauri::Window) {
    if let Err(error) = window.hide() {
        eprintln!("[window] Ana pencere gizlenemedi: {error}");
    }

    let delayed_window = window.clone();
    tauri::async_runtime::spawn(async move {
        thread::sleep(Duration::from_millis(80));
        if let Err(error) = delayed_window.hide() {
            eprintln!("[window] Ana pencere gecikmeli gizlenemedi: {error}");
        }
    });
}

fn emit_media_control(app: &tauri::AppHandle, action: &str) {
    let _ = app.emit("mpris-control", action);
}

struct TrayLabels {
    show: &'static str,
    previous: &'static str,
    play_pause: &'static str,
    stop: &'static str,
    stop_after_current: &'static str,
    next: &'static str,
    mute: &'static str,
    like: &'static str,
    exit: &'static str,
}

fn normalize_app_language(language: &str) -> &'static str {
    let lower = language.trim().to_ascii_lowercase();
    if lower.starts_with("ar") {
        "ar-SA"
    } else if lower.starts_with("es") {
        "es-ES"
    } else if lower.starts_with("tr") {
        "tr-TR"
    } else {
        "en-US"
    }
}

fn system_app_language() -> &'static str {
    let language = std::env::var("LANGUAGE")
        .ok()
        .or_else(|| std::env::var("LC_ALL").ok())
        .or_else(|| std::env::var("LC_MESSAGES").ok())
        .or_else(|| std::env::var("LANG").ok())
        .unwrap_or_default();
    normalize_app_language(&language)
}

fn tray_labels(language: &str) -> TrayLabels {
    match normalize_app_language(language) {
        "ar-SA" => TrayLabels {
            show: "إظهار",
            previous: "◀  المقطع السابق",
            play_pause: "▶  تشغيل / إيقاف مؤقت",
            stop: "■  إيقاف",
            stop_after_current: "⏱  إيقاف بعد هذا المقطع",
            next: "▶  المقطع التالي",
            mute: "🔇  كتم / إلغاء الكتم",
            like: "❤️  إعجاب",
            exit: "⏻  خروج",
        },
        "es-ES" => TrayLabels {
            show: "Mostrar",
            previous: "◀  Pista anterior",
            play_pause: "▶  Reproducir / Pausar",
            stop: "■  Detener",
            stop_after_current: "⏱  Detener despues de esta pista",
            next: "▶  Pista siguiente",
            mute: "🔇  Silenciar / activar sonido",
            like: "❤️  Me gusta",
            exit: "⏻  Salir",
        },
        "en-US" => TrayLabels {
            show: "Show",
            previous: "◀  Previous track",
            play_pause: "▶  Play / Pause",
            stop: "■  Stop",
            stop_after_current: "⏱  Stop after current track",
            next: "▶  Next track",
            mute: "🔇  Mute / Unmute",
            like: "❤️  Like",
            exit: "⏻  Quit",
        },
        _ => TrayLabels {
            show: "Göster",
            previous: "◀  Önceki parça",
            play_pause: "▶  Oynat / Duraklat",
            stop: "■  Durdur",
            stop_after_current: "⏱  Bu parçadan sonra durdur",
            next: "▶  Sonraki parça",
            mute: "🔇  Sessiz / Sesi aç",
            like: "❤️  Beğen",
            exit: "⏻  Çıkış",
        },
    }
}

fn create_tray_menu<M, R>(manager: &M, language: &str) -> tauri::Result<Menu<R>>
where
    M: Manager<R>,
    R: Runtime,
{
    let labels = tray_labels(language);
    let previous = MenuItem::with_id(
        manager,
        "tray_previous",
        labels.previous,
        true,
        None::<&str>,
    )?;
    let play_pause = MenuItem::with_id(
        manager,
        "tray_play_pause",
        labels.play_pause,
        true,
        None::<&str>,
    )?;
    let stop = MenuItem::with_id(manager, "tray_stop", labels.stop, true, None::<&str>)?;
    let stop_after_current = CheckMenuItem::with_id(
        manager,
        "tray_stop_after_current",
        labels.stop_after_current,
        true,
        false,
        None::<&str>,
    )?;
    let next = MenuItem::with_id(manager, "tray_next", labels.next, true, None::<&str>)?;
    let mute = MenuItem::with_id(manager, "tray_mute", labels.mute, true, None::<&str>)?;
    let like = MenuItem::with_id(manager, "tray_like", labels.like, true, None::<&str>)?;
    let show_icon = Image::from_bytes(include_bytes!("../icons/ardali_256.png"))?;
    let show = IconMenuItem::with_id(
        manager,
        "tray_show",
        labels.show,
        true,
        Some(show_icon),
        None::<&str>,
    )?;
    let exit = MenuItem::with_id(manager, "tray_exit", labels.exit, true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(manager)?;
    let separator_two = PredefinedMenuItem::separator(manager)?;

    Menu::with_items(
        manager,
        &[
            &show,
            &separator_two,
            &previous,
            &play_pause,
            &stop,
            &stop_after_current,
            &next,
            &separator_one,
            &mute,
            &like,
            &exit,
        ],
    )
}

#[tauri::command]
fn update_tray_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let menu = create_tray_menu(&app, &language).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn create_tray(app: &tauri::App) {
    let default_panic_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let tray_result = catch_unwind(AssertUnwindSafe(|| create_tray_inner(app)));
    std::panic::set_hook(default_panic_hook);

    match tray_result {
        Ok(Ok(())) => {
            TRAY_READY.store(true, Ordering::SeqCst);
        }
        Ok(Err(error)) => {
            eprintln!("[tray] Sistem tepsisi baslatilamadi: {error}");
        }
        Err(_) => {
            eprintln!(
                "[tray] Sistem tepsisi baslatilamadi: Linux appindicator kutuphanesi bulunamadi"
            );
        }
    }
}

fn create_tray_inner(app: &tauri::App) -> tauri::Result<()> {
    let menu = create_tray_menu(app, system_app_language())?;
    let icon = Image::from_bytes(include_bytes!("../icons/ardali_256.png"))?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("ArDali WebMedia")
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_previous" => emit_media_control(app, "previous"),
            "tray_play_pause" => emit_media_control(app, "play-pause"),
            "tray_stop" => emit_media_control(app, "stop"),
            "tray_stop_after_current" => emit_media_control(app, "stop-after-current"),
            "tray_next" => emit_media_control(app, "next"),
            "tray_mute" => emit_media_control(app, "toggle-mute"),
            "tray_like" => emit_media_control(app, "like"),
            "tray_show" => show_main_window(app),
            "tray_exit" => {
                APP_QUITTING.store(true, Ordering::SeqCst);
                emit_media_control(app, "stop");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_main_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_packaged_webkit_runtime();
    configure_media_backend();
    start_local_media_server();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            start_mpris_bridge(app.handle().clone());
            start_webkit_mpris_seek_bridge(app.handle().clone());
            create_tray(app);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main"
                    && TRAY_READY.load(Ordering::SeqCst)
                    && !APP_QUITTING.load(Ordering::SeqCst)
                {
                    api.prevent_close();
                    hide_main_window_to_tray(window);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_ready,
            is_custom_mpris_enabled,
            native_audio_init,
            native_audio_state,
            native_audio_load,
            native_audio_play,
            native_audio_pause,
            native_audio_stop,
            native_audio_seek,
            native_audio_set_volume,
            native_audio_apply_effects,
            native_audio_spectrum,
            native_audio_spectrum_pair,
            feed_projectm_native_audio,
            native_audio_output_state,
            load_library,
            save_library,
            path_exists,
            log_frontend_error,
            update_mpris_metadata,
            update_mpris_position,
            extract_cover_art,
            cache_media_art,
            restart_app,
            hide_main_window,
            update_tray_language,
            start_projectm_visualizer,
            feed_projectm_pcm,
            stop_projectm_visualizer,
            webview_manager::open_web_platform,
            webview_manager::open_web_platform_in_rect,
            webview_manager::hide_web_view,
            webview_manager::park_web_view,
            webview_manager::navigate_web_history,
            webview_manager::apply_web_dali_script,
            webview_manager::web_dali_audio_snapshot,
            webview_manager::clear_web_data,
            webview_manager::update_webview_bounds,
            webview_manager::update_webview_bounds_rect,
            webview_manager::get_current_webview_url,
            plugin_commands::install_plugin,
            downloader::resolve_ytdlp_binary,
            downloader::resolve_ffmpeg_binary,
            downloader::ensure_ytdlp_binary,
            downloader::ensure_ffmpeg_binary,
            downloader::check_ytdlp_binary,
            downloader::get_downloader_settings,
            downloader::save_downloader_settings,
            downloader::run_ytdlp_json,
            downloader::start_download,
            downloader::get_downloader_history,
            downloader::clear_downloader_history,
            downloader::save_downloader_history_item,
            downloader::get_default_download_dir
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulamasi calistirilamadi");
}
