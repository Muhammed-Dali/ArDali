use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url};

#[cfg(target_os = "linux")]
use gtk::prelude::*;
#[cfg(target_os = "linux")]
use javascriptcore::ValueExt;
#[cfg(target_os = "linux")]
use std::os::unix::fs::PermissionsExt;
#[cfg(target_os = "linux")]
use std::{cell::RefCell, fs, fs::OpenOptions, sync::mpsc, time::Duration};
#[cfg(target_os = "linux")]
use webkit2gtk::{
    CookieManagerExt, CookiePersistentStorage, LoadEvent, SettingsExt, WebContext, WebViewExt,
    WebsiteDataManager, WebsiteDataManagerExt, WebsiteDataManagerExtManual, WebsiteDataTypes,
};

// ── Windows imports ──────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
use std::sync::{Arc, Mutex};
#[cfg(target_os = "windows")]
use tauri::WebviewWindowBuilder;

// ── Windows global state ─────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
static WIN_WEBVIEW: std::sync::OnceLock<Mutex<Option<tauri::WebviewWindow>>> =
    std::sync::OnceLock::new();

#[cfg(target_os = "windows")]
fn win_webview_state() -> &'static Mutex<Option<tauri::WebviewWindow>> {
    WIN_WEBVIEW.get_or_init(|| Mutex::new(None))
}

// ── Linux GTK state ──────────────────────────────────────────────────────────
#[cfg(target_os = "linux")]
struct GtkWebState {
    overlay: gtk::Overlay,
    webviews: std::collections::HashMap<String, webkit2gtk::WebView>,
    active_label: Option<String>,
    resize_grip: Option<gtk::EventBox>,
    private_mode: bool,
}

#[cfg(target_os = "linux")]
thread_local! {
    static GTK_WEB_STATE: RefCell<Option<GtkWebState>> = RefCell::new(None);
}

#[cfg(target_os = "linux")]
fn web_silent_retry_html() -> &'static str {
    r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: dark;
      background: #030405;
    }
    body {
      min-height: 100vh;
      margin: 0;
      background:
        radial-gradient(circle at 18% 10%, rgba(0, 200, 255, 0.08), transparent 24rem),
        linear-gradient(135deg, #030405, #071013 55%, #030405);
    }
  </style>
</head>
<body></body>
</html>"#
}

#[cfg(target_os = "linux")]
fn web_profile_paths(app: &AppHandle) -> Result<(String, String, String), String> {
    let profile_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ardali-web-profile");
    let data_dir = profile_dir.join("data");
    let cache_dir = profile_dir.join("cache");
    let cookie_file = profile_dir.join("cookies.sqlite");

    fs::create_dir_all(&profile_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;

    fs::set_permissions(&profile_dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    fs::set_permissions(&cache_dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&cookie_file)
        .map_err(|error| error.to_string())?;
    fs::set_permissions(&cookie_file, fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())?;

    Ok((
        data_dir.to_string_lossy().to_string(),
        cache_dir.to_string_lossy().to_string(),
        cookie_file.to_string_lossy().to_string(),
    ))
}

fn parse_platform_url(platform_url: &str) -> Result<Url, String> {
    platform_url
        .parse()
        .map_err(|e| format!("Invalid platform URL: {e}"))
}

#[cfg(target_os = "linux")]
fn is_tiktok_url(url: &str) -> bool {
    url.parse::<Url>()
        .ok()
        .and_then(|url| url.host_str().map(|host| host.to_ascii_lowercase()))
        .map(|host| host == "tiktok.com" || host.ends_with(".tiktok.com"))
        .unwrap_or_else(|| url.to_ascii_lowercase().contains("tiktok.com"))
}

#[cfg(target_os = "linux")]
fn web_user_agent_for_mode(mode: &str, url: &str) -> Option<String> {
    if is_tiktok_url(url) {
        return match mode {
            "mobile" => Some(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 \
                 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
                    .to_string(),
            ),
            _ => Some(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 \
                 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
                    .to_string(),
            ),
        };
    }

    match mode {
        "desktop" => Some(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                .to_string(),
        ),
        "mobile" => Some(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
                .to_string(),
        ),
        _ => None,
    }
}

// Windows user-agent — Chrome tabanlı, DRM uyumlu
#[cfg(target_os = "windows")]
fn win_user_agent_for_mode(mode: &str) -> String {
    match mode {
        "mobile" => "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 \
                     (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            .to_string(),
        _ => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
              (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            .to_string(),
    }
}

#[cfg(target_os = "linux")]
fn apply_web_compat_settings(
    settings: &webkit2gtk::Settings,
    performance: &crate::PerformanceSnapshot,
) {
    settings.set_enable_webaudio(true);
    settings.set_disable_web_security(true);
    settings.set_enable_javascript(true);
    settings.set_enable_javascript_markup(true);
    settings.set_enable_fullscreen(true);
    settings.set_enable_html5_database(true);
    settings.set_enable_html5_local_storage(true);
    settings.set_enable_media(true);
    settings.set_enable_media_capabilities(true);
    settings.set_enable_media_stream(true);
    settings.set_enable_mediasource(true);
    settings.set_enable_encrypted_media(true);
    settings.set_enable_webgl(performance.hardware_acceleration);
    settings.set_enable_accelerated_2d_canvas(performance.hardware_acceleration);
    settings.set_enable_dns_prefetching(true);
    settings.set_enable_page_cache(performance.page_cache);
    settings.set_enable_site_specific_quirks(true);
    settings.set_media_playback_requires_user_gesture(false);
    settings.set_media_playback_allows_inline(true);
    settings.set_enable_write_console_messages_to_stdout(true);
}

// ── Linux: Widevine CDM yolunu WebContext'e ekle ─────────────────────────────
#[cfg(target_os = "linux")]
fn try_set_widevine_path(ctx: &WebContext) {
    // Yaygın Widevine CDM konumları — önce Chrome, sonra Chromium, sonra sistemdeki
    let candidates = [
        "/opt/google/chrome/WidevineCdm/_platform_specific/linux_x64/libwidevinecdm.so",
        "/usr/lib/chromium/libwidevinecdm.so",
        "/usr/lib/chromium-browser/libwidevinecdm.so",
        "/usr/lib64/chromium/libwidevinecdm.so",
        "/snap/chromium/current/usr/lib/chromium-browser/libwidevinecdm.so",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            // webkit2gtk 4.1 API
            #[cfg(feature = "webkit2gtk-4_1")]
            {
                use webkit2gtk::WebContextExt;
                ctx.set_web_extensions_directory(
                    std::path::Path::new(path)
                        .parent()
                        .and_then(|p| p.to_str())
                        .unwrap_or("/usr/lib/chromium"),
                );
            }
            eprintln!("[widevine] CDM bulundu: {path}");
            return;
        }
    }
    eprintln!("[widevine] CDM bulunamadi — DRM icerigi calismayabilir");
}

fn webview_bounds(
    window: &tauri::Window,
    sidebar_width: u32,
    toolbar_height: u32,
) -> Result<tauri::Rect, String> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let inner_size = window.inner_size().map_err(|e| e.to_string())?;
    let width = (inner_size.width as f64 / scale) as u32;
    let height = (inner_size.height as f64 / scale) as u32;

    Ok(tauri::Rect {
        position: LogicalPosition::new(sidebar_width as f64, toolbar_height as f64).into(),
        size: LogicalSize::new(
            width.saturating_sub(sidebar_width) as f64,
            height.saturating_sub(toolbar_height) as f64,
        )
        .into(),
    })
}

#[cfg(target_os = "linux")]
fn run_on_main_window<F>(window: tauri::Window, f: F) -> Result<(), String>
where
    F: FnOnce(&tauri::Window) -> Result<(), String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let window_for_thread = window.clone();

    window
        .run_on_main_thread(move || {
            let _ = tx.send(f(&window_for_thread));
        })
        .map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())?
}

#[cfg(target_os = "linux")]
fn run_web_javascript_string(
    app: &AppHandle,
    label: String,
    script: String,
) -> Result<String, String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let (tx, rx) = mpsc::channel();

    window
        .run_on_main_thread(move || {
            GTK_WEB_STATE.with(|state| {
                let Some(webview) = state
                    .borrow()
                    .as_ref()
                    .and_then(|state| state.webviews.get(&label).cloned())
                else {
                    let _ = tx.send(Err("GTK webview is not available".to_string()));
                    return;
                };

                #[allow(deprecated)]
                webview.run_javascript(
                    &script,
                    webkit2gtk::gio::Cancellable::NONE,
                    move |result| {
                        let message = match result {
                            Ok(result) => result
                                .js_value()
                                .map(|value| value.to_str().to_string())
                                .ok_or_else(|| "JavaScript sonucu bos".to_string()),
                            Err(error) => Err(error.to_string()),
                        };
                        let _ = tx.send(message);
                    },
                );
            });
        })
        .map_err(|error| error.to_string())?;

    rx.recv_timeout(Duration::from_millis(900))
        .map_err(|error| error.to_string())?
}

#[cfg(target_os = "linux")]
fn create_web_resize_grip() -> gtk::EventBox {
    let grip = gtk::EventBox::new();
    grip.set_halign(gtk::Align::End);
    grip.set_valign(gtk::Align::End);
    grip.set_size_request(22, 22);
    grip.add_events(
        gtk::gdk::EventMask::BUTTON_PRESS_MASK
            | gtk::gdk::EventMask::ENTER_NOTIFY_MASK
            | gtk::gdk::EventMask::LEAVE_NOTIFY_MASK,
    );

    let drawing = gtk::DrawingArea::new();
    drawing.set_size_request(22, 22);
    drawing.connect_draw(|_, cr| {
        cr.set_line_width(1.35);
        cr.set_source_rgba(0.06, 0.88, 1.0, 0.9);
        for offset in [6.0, 11.0, 16.0] {
            cr.move_to(20.0 - offset, 20.0);
            cr.line_to(20.0, 20.0 - offset);
            let _ = cr.stroke();
        }
        glib::Propagation::Proceed
    });
    grip.add(&drawing);

    grip.connect_enter_notify_event(|widget, _| {
        if let (Some(window), Some(display)) = (widget.window(), gtk::gdk::Display::default()) {
            let cursor = gtk::gdk::Cursor::from_name(&display, "se-resize")
                .or_else(|| gtk::gdk::Cursor::from_name(&display, "nwse-resize"));
            window.set_cursor(cursor.as_ref());
        }
        glib::Propagation::Proceed
    });

    grip.connect_leave_notify_event(|widget, _| {
        if let Some(window) = widget.window() {
            window.set_cursor(None);
        }
        glib::Propagation::Proceed
    });

    grip.connect_button_press_event(|widget, event| {
        if event.button() == 1 {
            if let Some(window) = widget
                .toplevel()
                .and_then(|widget| widget.downcast::<gtk::Window>().ok())
            {
                let (root_x, root_y) = event.root();
                window.begin_resize_drag(
                    gtk::gdk::WindowEdge::SouthEast,
                    event.button() as i32,
                    root_x.round() as i32,
                    root_y.round() as i32,
                    event.time(),
                );
                return glib::Propagation::Stop;
            }
        }

        glib::Propagation::Proceed
    });

    grip
}

#[cfg(target_os = "linux")]
fn install_or_update_gtk_webview(
    app: &AppHandle,
    url: String,
    private_mode: bool,
    user_agent_mode: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let app_for_events = app.clone();
    let profile_paths = if private_mode {
        None
    } else {
        Some(web_profile_paths(app)?)
    };

    run_on_main_window(window, move |window| {
        let x = x.round() as i32;
        let y = y.round() as i32;
        let width = width.max(1.0).round() as i32;
        let height = height.max(1.0).round() as i32;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;

        GTK_WEB_STATE.with(|state| {
            let mut state = state.borrow_mut();

            if state.is_none() {
                let main_widget = vbox
                    .children()
                    .first()
                    .cloned()
                    .ok_or_else(|| "Main GTK webview widget not found".to_string())?;

                vbox.remove(&main_widget);

                let overlay = gtk::Overlay::new();
                overlay.set_hexpand(true);
                overlay.set_vexpand(true);
                overlay.add(&main_widget);

                vbox.pack_start(&overlay, true, true, 0);
                overlay.show_all();

                *state = Some(GtkWebState {
                    overlay,
                    webviews: std::collections::HashMap::new(),
                    active_label: Some("main".to_string()),
                    resize_grip: None,
                    private_mode,
                });
            }

            let state = state
                .as_mut()
                .ok_or_else(|| "GTK web state not initialized".to_string())?;

            if state.private_mode != private_mode {
                if let Some(webview) = state.webviews.remove("main") {
                    webview.stop_loading();
                    webview.load_uri("about:blank");
                    state.overlay.remove(&webview);
                }
                state.private_mode = private_mode;
            }

            let created_webview = !state.webviews.contains_key("main");

            if created_webview {
                let web_context = if let Some((data_dir, cache_dir, cookie_file)) = profile_paths {
                    let data_manager = WebsiteDataManager::builder()
                        .base_data_directory(data_dir)
                        .base_cache_directory(cache_dir)
                        .build();
                    if let Some(cookie_manager) = data_manager.cookie_manager() {
                        cookie_manager
                            .set_persistent_storage(&cookie_file, CookiePersistentStorage::Sqlite);
                    }
                    let ctx = WebContext::with_website_data_manager(&data_manager);
                    try_set_widevine_path(&ctx);
                    ctx
                } else {
                    let ctx = WebContext::new_ephemeral();
                    try_set_widevine_path(&ctx);
                    ctx
                };
                let webview = webkit2gtk::WebView::with_context(&web_context);

                let app_handle_for_lib = app_for_events.clone();
                let performance = crate::load_library(app_handle_for_lib)
                    .map(|lib| lib.performance.unwrap_or_default())
                    .unwrap_or_default();

                if let Some(settings) = WebViewExt::settings(&webview) {
                    apply_web_compat_settings(&settings, &performance);
                }
                webview.set_halign(gtk::Align::Start);
                webview.set_valign(gtk::Align::Start);
                webview.add_events(
                    gtk::gdk::EventMask::POINTER_MOTION_MASK
                        | gtk::gdk::EventMask::BUTTON_PRESS_MASK,
                );

                let app_for_motion = app_for_events.clone();
                webview.connect_motion_notify_event(move |_, _| {
                    let _ = app_for_motion.emit("webview-pointer-motion", ());
                    glib::Propagation::Proceed
                });

                let app_for_press = app_for_events.clone();
                webview.connect_button_press_event(move |_, _| {
                    let _ = app_for_press.emit("webview-pointer-motion", ());
                    glib::Propagation::Proceed
                });

                let app_for_load_failed = app_for_events.clone();
                webview.connect_load_failed(move |webview, _, failing_uri, error| {
                    let failing_uri = failing_uri.to_string();
                    let original_error_message = error.message().to_string();
                    let error_message = original_error_message.to_lowercase();

                    if error_message.contains("cancel") || error_message.contains("iptal") {
                        return true;
                    }

                    let _ = app_for_load_failed.emit(
                        "webview-load-failed",
                        format!("{failing_uri}: {original_error_message}"),
                    );

                    webview.load_html(web_silent_retry_html(), Some("about:blank"));

                    let webview_for_retry = webview.clone();
                    let retry_uri = failing_uri.clone();
                    gtk::glib::timeout_add_local_once(
                        std::time::Duration::from_millis(700),
                        move || {
                            webview_for_retry.load_uri(&retry_uri);
                        },
                    );

                    let webview_for_late_retry = webview.clone();
                    let late_retry_uri = failing_uri.clone();
                    gtk::glib::timeout_add_local_once(
                        std::time::Duration::from_millis(1800),
                        move || {
                            webview_for_late_retry.load_uri(&late_retry_uri);
                        },
                    );

                    let webview_for_final_retry = webview.clone();
                    gtk::glib::timeout_add_local_once(
                        std::time::Duration::from_millis(3600),
                        move || {
                            webview_for_final_retry.load_uri(&failing_uri);
                        },
                    );

                    true
                });

                let app_for_load_finished = app_for_events.clone();
                webview.connect_load_changed(move |webview, event| {
                    if event == LoadEvent::Started {
                        let _ = app_for_load_finished.emit(
                            "tab_loading",
                            serde_json::json!({
                                "id": "main",
                                "loading": true,
                            }),
                        );
                        return;
                    }
                    if event == LoadEvent::Finished {
                        let uri = webview.uri().unwrap_or_default().to_string();
                        let _ = app_for_load_finished.emit(
                            "tab_loading",
                            serde_json::json!({
                                "id": "main",
                                "loading": false,
                            }),
                        );
                        let _ = app_for_load_finished.emit("webview-load-finished", uri);
                    }
                });

                let app_for_title = app_for_events.clone();
                webview.connect_notify_local(Some("title"), move |webview, _| {
                    let uri = webview.uri().unwrap_or_default().to_string();
                    let title = webview
                        .title()
                        .unwrap_or_else(|| "Yeni Sekme".into())
                        .to_string();
                    let _ = app_for_title.emit(
                        "tab_updated",
                        serde_json::json!({
                            "id": "main",
                            "title": title,
                            "url": uri,
                        }),
                    );
                });

                let app_for_uri = app_for_events.clone();
                webview.connect_notify_local(Some("uri"), move |webview, _| {
                    let uri = webview.uri().unwrap_or_default().to_string();
                    let title = webview
                        .title()
                        .unwrap_or_else(|| "Yeni Sekme".into())
                        .to_string();
                    let _ = app_for_uri.emit(
                        "tab_updated",
                        serde_json::json!({
                            "id": "main",
                            "title": title,
                            "url": uri,
                        }),
                    );
                });

                let app_for_enter_fullscreen = app_for_events.clone();
                webview.connect_enter_fullscreen(move |_| {
                    let _ = app_for_enter_fullscreen.emit("webview-fullscreen-change", true);
                    false
                });

                let app_for_leave_fullscreen = app_for_events.clone();
                webview.connect_leave_fullscreen(move |_| {
                    let _ = app_for_leave_fullscreen.emit("webview-fullscreen-change", false);
                    false
                });

                state.overlay.add_overlay(&webview);
                state.webviews.insert("main".to_string(), webview);
            }

            if state.resize_grip.is_none() {
                let resize_grip = create_web_resize_grip();
                state.overlay.add_overlay(&resize_grip);
                state.overlay.set_overlay_pass_through(&resize_grip, false);
                resize_grip.show_all();
                state.resize_grip = Some(resize_grip);
            }

            let webview = state
                .webviews
                .get("main")
                .ok_or_else(|| "GTK webview not initialized".to_string())?;
            let is_tiktok_page = is_tiktok_url(&url);

            if let Some(settings) = WebViewExt::settings(webview) {
                settings.set_user_agent(web_user_agent_for_mode(&user_agent_mode, &url).as_deref());
            }

            webview.set_margin_start(x);
            webview.set_margin_top(y);
            webview.set_size_request(width, height);
            webview.show_all();
            if let Some(resize_grip) = state.resize_grip.as_ref() {
                resize_grip.set_margin_end(5);
                resize_grip.set_margin_bottom(5);
                resize_grip.show_all();
            }
            webview.grab_focus();

            let current_uri = webview.uri().map(|uri| uri.to_string()).unwrap_or_default();
            let should_load = current_uri != url;
            if should_load {
                let webview_for_load = webview.clone();
                let url_for_load = url.clone();
                gtk::glib::idle_add_local_once(move || {
                    webview_for_load.load_uri(&url_for_load);
                    webview_for_load.grab_focus();
                });
            }

            if created_webview && !is_tiktok_page {
                let webview_for_retry = webview.clone();
                let url_for_retry = url.clone();
                gtk::glib::timeout_add_local_once(
                    std::time::Duration::from_millis(350),
                    move || {
                        webview_for_retry.load_uri(&url_for_retry);
                        webview_for_retry.grab_focus();
                    },
                );

                let webview_for_late_retry = webview.clone();
                gtk::glib::timeout_add_local_once(
                    std::time::Duration::from_millis(1200),
                    move || {
                        webview_for_late_retry.load_uri(&url);
                        webview_for_late_retry.grab_focus();
                    },
                );
            } else if !created_webview && !is_tiktok_page && should_load {
                let webview_for_refresh = webview.clone();
                gtk::glib::timeout_add_local_once(
                    std::time::Duration::from_millis(120),
                    move || {
                        webview_for_refresh.load_uri(&url);
                        webview_for_refresh.grab_focus();
                    },
                );
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn update_gtk_webview_bounds(
    app: &AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow().as_ref() {
                if let Some(webview) = state.webviews.get(&label) {
                    webview.set_margin_start(x.round() as i32);
                    webview.set_margin_top(y.round() as i32);
                    webview.set_size_request(
                        width.max(1.0).round() as i32,
                        height.max(1.0).round() as i32,
                    );
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn destroy_gtk_webview(app: &AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow_mut().as_mut() {
                if let Some(webview) = state.webviews.remove(&label) {
                    webview.stop_loading();
                    webview.load_uri("about:blank");
                    state.overlay.remove(&webview);
                }
                if state.webviews.is_empty() {
                    if let Some(resize_grip) = state.resize_grip.take() {
                        state.overlay.remove(&resize_grip);
                    }
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn destroy_all_gtk_webviews(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow_mut().as_mut() {
                let webviews = std::mem::take(&mut state.webviews);
                for (_, webview) in webviews {
                    webview.stop_loading();
                    webview.load_uri("about:blank");
                    state.overlay.remove(&webview);
                }
                state.active_label = None;
                if let Some(resize_grip) = state.resize_grip.take() {
                    state.overlay.remove(&resize_grip);
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn park_gtk_webview(app: &AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow().as_ref() {
                if let Some(webview) = state.webviews.get(&label) {
                    webview.hide();
                }
                if let Some(resize_grip) = state.resize_grip.as_ref() {
                    resize_grip.hide();
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn navigate_gtk_web_history(app: &AppHandle, label: String, direction: &str) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let direction = direction.to_string();

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow().as_ref() {
                if let Some(webview) = state.webviews.get(&label) {
                    match direction.as_str() {
                        "back" if webview.can_go_back() => webview.go_back(),
                        "forward" if webview.can_go_forward() => webview.go_forward(),
                        _ => {}
                    }
                    webview.grab_focus();
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn reload_gtk_webview(app: &AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow().as_ref() {
                if let Some(webview) = state.webviews.get(&label) {
                    webview.reload();
                    webview.grab_focus();
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn web_data_types_for_target(target: &str) -> WebsiteDataTypes {
    match target {
        "cache" => {
            WebsiteDataTypes::MEMORY_CACHE
                | WebsiteDataTypes::DISK_CACHE
                | WebsiteDataTypes::OFFLINE_APPLICATION_CACHE
        }
        "cookies" => WebsiteDataTypes::COOKIES,
        "site-data" => {
            WebsiteDataTypes::SESSION_STORAGE
                | WebsiteDataTypes::LOCAL_STORAGE
                | WebsiteDataTypes::INDEXEDDB_DATABASES
                | WebsiteDataTypes::WEBSQL_DATABASES
                | WebsiteDataTypes::DOM_CACHE
                | WebsiteDataTypes::SERVICE_WORKER_REGISTRATIONS
        }
        _ => WebsiteDataTypes::ALL,
    }
}

#[cfg(target_os = "linux")]
fn clear_gtk_web_data(app: &AppHandle, label: String, target: String) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let (data_dir, cache_dir, cookie_file) = web_profile_paths(app)?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            let manager = state
                .borrow()
                .as_ref()
                .and_then(|state| state.webviews.get(&label))
                .and_then(WebViewExt::website_data_manager)
                .unwrap_or_else(|| {
                    let data_manager = WebsiteDataManager::builder()
                        .base_data_directory(data_dir)
                        .base_cache_directory(cache_dir)
                        .build();
                    if let Some(cookie_manager) = data_manager.cookie_manager() {
                        cookie_manager
                            .set_persistent_storage(&cookie_file, CookiePersistentStorage::Sqlite);
                    }
                    data_manager
                });
            manager.clear(
                web_data_types_for_target(&target),
                glib::TimeSpan::from_seconds(0),
                webkit2gtk::gio::Cancellable::NONE,
                |_| {},
            );

            Ok(())
        })
    })
}

// ── Windows: WebviewWindow yönetimi ─────────────────────────────────────────

#[cfg(target_os = "windows")]
fn install_or_update_win_webview(
    app: &AppHandle,
    url: String,
    _private_mode: bool,
    user_agent_mode: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let state = win_webview_state();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let user_agent = win_user_agent_for_mode(&user_agent_mode);

    if let Some(existing) = guard.as_ref() {
        // Varsa konumunu güncelle ve URL'i değiştir
        existing
            .set_position(tauri::LogicalPosition::new(x, y).into())
            .map_err(|e| e.to_string())?;
        existing
            .set_size(tauri::LogicalSize::new(width.max(1.0), height.max(1.0)).into())
            .map_err(|e| e.to_string())?;
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;

        // JS ile URL değiştir
        let navigate_script = format!("window.location.href = {};", serde_json::json!(url));
        let _ = existing.eval(&navigate_script);
        return Ok(());
    }

    // Ana pencereyi bul — WebviewWindow ona göre konumlanacak
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let main_pos = main_window.outer_position().map_err(|e| e.to_string())?;
    let scale = main_window.scale_factor().unwrap_or(1.0);
    let main_x = main_pos.x as f64 / scale;
    let main_y = main_pos.y as f64 / scale;

    let abs_x = main_x + x;
    let abs_y = main_y + y;

    let webview_window = WebviewWindowBuilder::new(
        app,
        "ardali-web-platform",
        tauri::WebviewUrl::External(
            url.parse::<tauri::Url>()
                .map_err(|e| format!("URL parse hatasi: {e}"))?,
        ),
    )
    .title("ArDali Web")
    .decorations(false)
    .resizable(true)
    .position(abs_x, abs_y)
    .inner_size(width.max(1.0), height.max(1.0))
    .user_agent(&user_agent)
    .build()
    .map_err(|e| e.to_string())?;

    webview_window.show().map_err(|e| e.to_string())?;
    webview_window.set_focus().map_err(|e| e.to_string())?;

    *guard = Some(webview_window);
    Ok(())
}

#[cfg(target_os = "windows")]
fn update_win_webview_bounds(
    app: &AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let main_pos = main_window.outer_position().map_err(|e| e.to_string())?;
    let scale = main_window.scale_factor().unwrap_or(1.0);
    let main_x = main_pos.x as f64 / scale;
    let main_y = main_pos.y as f64 / scale;

    let state = win_webview_state();
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.as_ref() {
        webview
            .set_position(tauri::LogicalPosition::new(main_x + x, main_y + y).into())
            .map_err(|e| e.to_string())?;
        webview
            .set_size(tauri::LogicalSize::new(width.max(1.0), height.max(1.0)).into())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn destroy_win_webview(_app: &AppHandle) -> Result<(), String> {
    let state = win_webview_state();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.take() {
        let _ = webview.close();
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn park_win_webview(_app: &AppHandle) -> Result<(), String> {
    let state = win_webview_state();
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.as_ref() {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn navigate_win_web_history(_app: &AppHandle, direction: &str) -> Result<(), String> {
    let state = win_webview_state();
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.as_ref() {
        let script = match direction {
            "back" => "history.back();",
            "forward" => "history.forward();",
            _ => return Ok(()),
        };
        webview.eval(script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn reload_win_webview(_app: &AppHandle) -> Result<(), String> {
    let state = win_webview_state();
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.as_ref() {
        webview.eval("location.reload();").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn run_win_javascript(_app: &AppHandle, script: String) -> Result<String, String> {
    let state = win_webview_state();
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.as_ref() {
        webview.eval(&script).map_err(|e| e.to_string())?;
        Ok("ok".to_string())
    } else {
        Err("Windows webview mevcut degil".to_string())
    }
}

#[cfg(target_os = "windows")]
fn clear_win_web_data(_app: &AppHandle, _target: String) -> Result<(), String> {
    // WebView2 veri temizleme — şimdilik webview'ı yeniden oluşturarak temizle
    let state = win_webview_state();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(webview) = guard.as_ref() {
        // Çerezleri ve localStorage'ı JS ile temizle
        let _ = webview.eval(
            r#"
            try { localStorage.clear(); } catch(_) {}
            try { sessionStorage.clear(); } catch(_) {}
            "#,
        );
    }
    Ok(())
}

// ── Tauri komutları ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_web_platform(
    app: AppHandle,
    platform_url: String,
    private_mode: bool,
    user_agent_mode: Option<String>,
    sidebar_width: u32,
    toolbar_height: u32,
) -> Result<(), String> {
    parse_platform_url(&platform_url)?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let bounds = webview_bounds(&window, sidebar_width, toolbar_height)?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let position = bounds.position.to_logical::<f64>(scale);
    let size = bounds.size.to_logical::<f64>(scale);

    #[cfg(target_os = "linux")]
    {
        install_or_update_gtk_webview(
            &app,
            platform_url,
            private_mode,
            user_agent_mode.unwrap_or_else(|| "desktop".to_string()),
            position.x,
            position.y,
            size.width,
            size.height,
        )
    }

    #[cfg(target_os = "windows")]
    {
        install_or_update_win_webview(
            &app,
            platform_url,
            private_mode,
            user_agent_mode.unwrap_or_else(|| "desktop".to_string()),
            position.x,
            position.y,
            size.width,
            size.height,
        )
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn open_web_platform_in_rect(
    app: AppHandle,
    platform_url: String,
    private_mode: bool,
    user_agent_mode: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    parse_platform_url(&platform_url)?;

    #[cfg(target_os = "linux")]
    {
        install_or_update_gtk_webview(
            &app,
            platform_url,
            private_mode,
            user_agent_mode.unwrap_or_else(|| "desktop".to_string()),
            x,
            y,
            width,
            height,
        )
    }

    #[cfg(target_os = "windows")]
    {
        install_or_update_win_webview(
            &app,
            platform_url,
            private_mode,
            user_agent_mode.unwrap_or_else(|| "desktop".to_string()),
            x,
            y,
            width,
            height,
        )
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn get_current_webview_url(app: AppHandle, label: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        use std::sync::mpsc;
        use tauri::Manager;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "No main window".to_string())?;
        let (tx, rx) = mpsc::channel();
        window
            .run_on_main_thread(move || {
                GTK_WEB_STATE.with(|state| {
                    if let Some(webview) = state
                        .borrow()
                        .as_ref()
                        .and_then(|s| s.webviews.get(&label).cloned())
                    {
                        use webkit2gtk::WebViewExt;
                        let uri = webview.uri().map(|g| g.to_string()).unwrap_or_default();
                        let _ = tx.send(Ok(uri));
                    } else {
                        let _ = tx.send(Err("GTK webview not found".to_string()));
                    }
                });
            })
            .map_err(|e| e.to_string())?;

        rx.recv()
            .unwrap_or_else(|_| Err("Channel error".to_string()))
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(webview) = win_webview_lock().lock().unwrap().as_ref() {
            Ok(webview.url().unwrap().to_string())
        } else {
            Err("Windows webview not found".to_string())
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Not implemented".to_string())
    }
}

#[tauri::command]
pub async fn get_active_web_content_url(app: AppHandle, label: String) -> Result<String, String> {
    let script = r#"
(() => {
  const result = { ok: false, url: "", reason: "not-found" };
  const currentUrl = String(location.href || "");
  const host = String(location.hostname || "").toLowerCase();
  const isTikTok = /(^|\.)tiktok\.com$/.test(host);
  const isTikTokVideoUrl = (value) => {
    try {
      const url = new URL(String(value || ""), location.href);
      const nextHost = String(url.hostname || "").toLowerCase();
      if (!/(^|\.)tiktok\.com$/.test(nextHost)) return false;
      return /\/@[^/]+\/video\/\d+/.test(url.pathname) || /\/video\/\d+/.test(url.pathname) || /^\/t\//.test(url.pathname);
    } catch (_) {
      return false;
    }
  };
  const normalizeUrl = (value) => {
    try {
      const url = new URL(String(value || ""), location.href);
      url.hash = "";
      return url.toString();
    } catch (_) {
      return "";
    }
  };
  const isTikTokFeedUrl = (value) => {
    try {
      const url = new URL(String(value || ""), location.href);
      const path = String(url.pathname || "").replace(/\/+$/g, "");
      return /(^|\.)tiktok\.com$/.test(String(url.hostname || "").toLowerCase()) &&
        (path === "" || path === "/foryou" || path === "/following" || /^\/[a-z]{2}(?:-[A-Z]{2})?$/.test(path));
    } catch (_) {
      return false;
    }
  };
  if (!isTikTok) {
    result.ok = Boolean(currentUrl);
    result.url = currentUrl;
    result.reason = "current-page";
    return JSON.stringify(result);
  }

  if (isTikTokVideoUrl(currentUrl)) {
    result.ok = true;
    result.url = normalizeUrl(currentUrl);
    result.reason = "current-video-url";
    return JSON.stringify(result);
  }

  const viewportCenterX = innerWidth / 2;
  const viewportCenterY = innerHeight / 2;
  const rectScore = (rect) => {
    if (!rect || rect.width < 20 || rect.height < 20) return -Infinity;
    const visibleX = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const visibleY = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    const visibleArea = visibleX * visibleY;
    if (visibleArea <= 0) return -Infinity;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(centerX - viewportCenterX, centerY - viewportCenterY);
    return visibleArea - distance * 420;
  };

  const videos = Array.from(document.querySelectorAll("video"));
  const centerElement = document.elementFromPoint(viewportCenterX, viewportCenterY);
  const activeVideo = videos
    .map((video) => {
      const rect = video.getBoundingClientRect();
      let score = rectScore(rect);
      const containsCenter = rect.left <= viewportCenterX && rect.right >= viewportCenterX &&
        rect.top <= viewportCenterY && rect.bottom >= viewportCenterY;
      if (containsCenter) score += 2500000;
      if (centerElement && (video === centerElement || video.contains(centerElement) || centerElement.contains(video))) score += 1800000;
      if (!video.paused) score += 120000;
      if (video.currentTime > 0) score += 80000;
      if (video.readyState >= 2) score += 40000;
      return { video, rect, score };
    })
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)[0];

  const activeMediaUrl = activeVideo
    ? normalizeUrl(activeVideo.video.currentSrc || activeVideo.video.src || activeVideo.video.querySelector("source")?.src || "")
    : "";
  const activeContainerText = activeVideo
    ? (() => {
        let node = activeVideo.video;
        let best = { text: "", score: -Infinity };
        for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
          const text = String(node.innerText || node.textContent || "").trim();
          if (!text || text.length > 3500) continue;
          const rect = node.getBoundingClientRect();
          const visibleX = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
          const visibleY = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
          const visibleArea = visibleX * visibleY;
          const fillsScreen = visibleArea > innerWidth * innerHeight * 0.75;
          const usefulText = Math.min(text.length, 900);
          const score = usefulText + Math.max(0, 900 - depth * 120) + Math.min(visibleArea / 800, 900) - (fillsScreen ? 1500 : 0);
          if (score > best.score) best = { text, score };
        }
        return best.text;
      })()
    : "";
  const compactText = (value) => String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ@#._-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const activeTextCompact = compactText(activeContainerText);
  const textMatchesActiveCard = (value) => {
    const candidate = compactText(value);
    if (!candidate || !activeTextCompact) return false;
    if (candidate.length >= 12 && activeTextCompact.includes(candidate.slice(0, 80))) return true;
    if (activeTextCompact.length >= 12 && candidate.includes(activeTextCompact.slice(0, 80))) return true;
    const words = activeTextCompact.split(" ").filter((word) => word.length >= 4 && !/^#/.test(word)).slice(0, 12);
    return words.filter((word) => candidate.includes(word)).length >= Math.min(3, Math.max(1, words.length));
  };
  const activeMediaTokens = (() => {
    try {
      return new URL(activeMediaUrl || "", location.href).pathname
        .split("/")
        .map((part) => part.trim())
        .filter((part) => /^[A-Za-z0-9_-]{12,}$/.test(part))
        .slice(-4);
    } catch (_) {
      return [];
    }
  })();
  const tokenMatches = (value) => {
    const text = String(value || "");
    return activeMediaTokens.length > 0 && activeMediaTokens.some((token) => token && text.includes(token));
  };
  const findDeepValue = (root, keys, depth = 0, seen = new Set()) => {
    if (!root || typeof root !== "object" || seen.has(root) || depth > 5) return "";
    seen.add(root);
    for (const key of keys) {
      const value = root[key];
      if (typeof value === "string" || typeof value === "number") {
        const text = String(value || "").trim();
        if (text) return text;
      }
    }
    for (const value of Object.values(root)) {
      const found = findDeepValue(value, keys, depth + 1, seen);
      if (found) return found;
    }
    return "";
  };
  const normalizeUniqueId = (value) => {
    const text = String(value || "").replace(/^@/, "").trim();
    return /^[A-Za-z0-9._-]{2,32}$/.test(text) && !text.includes("...") ? text : "";
  };
  const readItemIdentity = (value) => {
    if (!value || typeof value !== "object") return null;
    const id = findDeepValue(value, ["awemeId", "aweme_id", "itemId", "item_id", "groupId", "group_id", "videoId", "video_id", "id"]);
    const author = value.author || value.authorInfo || value.author_info || value.authorStats || {};
    const username = normalizeUniqueId(
      author.uniqueId || author.unique_id || value.authorUniqueId || value.author_unique_id ||
        findDeepValue(value, ["uniqueId", "unique_id", "authorUniqueId", "author_unique_id"], 0)
    );
    const description = findDeepValue(value, ["desc", "description", "title", "text", "content"], 0);
    return /^\d{8,30}$/.test(String(id || "")) && username ? { id: String(id), username, description } : null;
  };
  const activeMediaItem = (() => {
    let best = null;
    const consider = (identity, sourceText = "") => {
      if (!identity) return;
      let score = 0;
      if (tokenMatches(sourceText)) score += 800;
      if (textMatchesActiveCard(identity.description || sourceText)) score += 1200;
      if (identity.username && activeTextCompact.includes(identity.username.toLowerCase())) score += 600;
      if (!best || score > best.score) best = { identity, score };
    };
    const roots = [];
    try { if (window.SIGI_STATE) roots.push(window.SIGI_STATE); } catch (_) {}
    try { if (window.__UNIVERSAL_DATA_FOR_REHYDRATION__) roots.push(window.__UNIVERSAL_DATA_FOR_REHYDRATION__); } catch (_) {}
    for (const root of roots) {
      const seen = new Set();
      const stack = [{ value: root, ancestors: [] }];
      while (stack.length) {
        const { value, ancestors } = stack.pop();
        if (value == null) continue;
        if (typeof value === "string") {
          if (tokenMatches(value)) {
            for (const candidate of ancestors) {
              const identity = readItemIdentity(candidate);
              consider(identity, value);
            }
          }
          continue;
        }
        if (typeof value !== "object" || seen.has(value)) continue;
        seen.add(value);
        const directIdentity = readItemIdentity(value);
        if (directIdentity) {
          let sourceText = "";
          try { sourceText = JSON.stringify(value).slice(0, 50000); } catch (_) {}
          if (tokenMatches(sourceText) || textMatchesActiveCard(directIdentity.description || sourceText)) {
            consider(directIdentity, sourceText);
          }
        }
        const nextAncestors = [value, ...ancestors].slice(0, 8);
        for (const child of Object.values(value)) {
          stack.push({ value: child, ancestors: nextAncestors });
        }
        if (seen.size > 12000) break;
      }
    }
    if (best && best.score >= 1000) return best.identity;
    for (const script of Array.from(document.scripts || [])) {
      const text = String(script.textContent || "");
      if (!tokenMatches(text)) continue;
      const token = activeMediaTokens.find((item) => text.includes(item));
      const index = token ? text.indexOf(token) : -1;
      const slice = index >= 0 ? text.slice(Math.max(0, index - 25000), index + 25000) : text.slice(0, 50000);
      const idMatch = slice.match(/["'](?:aweme_id|awemeId|group_id|groupId|item_id|itemId|video_id|videoId|id)["']\s*:\s*["']?(\d{8,30})/i);
      const userMatch = slice.match(/["'](?:uniqueId|unique_id|authorUniqueId|author_unique_id)["']\s*:\s*["']([^"']{2,80})["']/i);
      const descMatch = slice.match(/["'](?:desc|description|title|text)["']\s*:\s*["']([^"']{2,300})["']/i);
      const username = normalizeUniqueId(userMatch && userMatch[1]);
      if (idMatch && username) {
        consider({ id: idMatch[1], username, description: descMatch ? descMatch[1] : "" }, slice);
      }
    }
    return best && best.score >= 1000 ? best.identity : null;
  })();
  const activeUsername = (() => {
    const isCleanUsername = (value) => /^[A-Za-z0-9._-]{2,32}$/.test(String(value || "")) && !String(value || "").includes("...");
    if (activeMediaItem && activeMediaItem.username) return activeMediaItem.username;
    const candidates = [];
    if (activeVideo) {
      let node = activeVideo.video;
      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        candidates.push(...Array.from(node.querySelectorAll("a[href^='/@'], a[href*='tiktok.com/@'], [data-e2e*='user'], [data-e2e*='author']")));
      }
    }
    const fromHref = candidates
      .map((node) => String(node.getAttribute?.("href") || ""))
      .map((href) => {
        try {
          const path = new URL(href, location.href).pathname;
          return path.split("/").find((part) => part.startsWith("@")) || "";
        } catch (_) {
          return "";
        }
      })
      .find(Boolean);
    if (fromHref) return fromHref.replace(/^@/, "");
    const textMatch = activeContainerText.match(/(^|\s)@([A-Za-z0-9._-]{2,32})\b/);
    if (textMatch && isCleanUsername(textMatch[2])) return textMatch[2];
    const firstLine = activeContainerText.split(/\n+/).map((line) => line.trim()).find(isCleanUsername);
    return firstLine || "";
  })();
  const activeVideoId = (() => {
    if (activeMediaItem && activeMediaItem.id) return activeMediaItem.id;
    const findItemIdInDomData = () => {
      const wantedUser = String(activeUsername || "").toLowerCase();
      if (!wantedUser || !activeVideo) return "";
      const seen = new Set();
      const scoreIdentity = (identity, sourceText = "") => {
        if (!identity || !identity.id) return 0;
        let score = 0;
        if (String(identity.username || "").toLowerCase() === wantedUser) score += 1200;
        if (textMatchesActiveCard(identity.description || sourceText)) score += 900;
        if (tokenMatches(sourceText)) score += 500;
        return score;
      };
      const scan = (root) => {
        const stack = [{ value: root, depth: 0 }];
        let best = { id: "", score: 0 };
        while (stack.length) {
          const { value, depth } = stack.pop();
          if (value == null || depth > 7) continue;
          const type = typeof value;
          if (type === "string" || type === "number") continue;
          if (type !== "object" && type !== "function") continue;
          if (seen.has(value)) continue;
          seen.add(value);
          const identity = readItemIdentity(value);
          let sourceText = "";
          try { sourceText = JSON.stringify(value).slice(0, 60000); } catch (_) {}
          if (identity) {
            const score = scoreIdentity(identity, sourceText);
            if (score > best.score) best = { id: identity.id, score };
          }
          if (sourceText && (sourceText.toLowerCase().includes(wantedUser) || textMatchesActiveCard(sourceText))) {
            const patterns = [
              /\/video\/(\d{8,30})/i,
              /["'](?:aweme_id|awemeId|group_id|groupId|item_id|itemId|video_id|videoId)["']\s*[:=]\s*["']?(\d{8,30})/i
            ];
            for (const pattern of patterns) {
              const match = sourceText.match(pattern);
              if (match && best.score < 950) best = { id: match[1], score: 950 };
            }
          }
          let children = [];
          try { children = Object.values(value); } catch (_) {}
          for (const child of children) {
            if (child && (typeof child === "object" || typeof child === "function")) {
              stack.push({ value: child, depth: depth + 1 });
            }
          }
          if (seen.size > 9000) break;
        }
        return best.score >= 1000 ? best.id : "";
      };
      let node = activeVideo.video;
      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        let propertyNames = [];
        try { propertyNames = Object.getOwnPropertyNames(node); } catch (_) {}
        for (const name of propertyNames) {
          if (!/^__(reactProps|reactFiber|reactInternalInstance|reactEventHandlers)\$/.test(name)) continue;
          const id = scan(node[name]);
          if (id) return id;
        }
      }
      return "";
    };
    const fromDomData = findItemIdInDomData();
    if (fromDomData) return fromDomData;
    const findItemIdByAuthor = (root) => {
      const wanted = String(activeUsername || "").toLowerCase();
      if (!wanted || !root || typeof root !== "object") return "";
      const seen = new Set();
      const stack = [root];
      while (stack.length) {
        const item = stack.pop();
        if (!item || typeof item !== "object" || seen.has(item)) continue;
        seen.add(item);
        const author = item.author || item.authorInfo || item.authorStats || {};
        const uniqueId = String(author.uniqueId || author.unique_id || item.authorUniqueId || item.authorIdName || "").toLowerCase();
        const id = String(item.id || item.itemId || item.awemeId || item.aweme_id || item.groupId || item.videoId || "");
        if (id && (uniqueId === wanted || uniqueId.replace(/^@/, "") === wanted)) return id;
        for (const value of Object.values(item)) {
          if (value && typeof value === "object") stack.push(value);
        }
        if (seen.size > 6000) break;
      }
      return "";
    };
    try {
      const fromSigi = findItemIdByAuthor(window.SIGI_STATE);
      if (fromSigi) return fromSigi;
    } catch (_) {}
    try {
      const fromUniversal = findItemIdByAuthor(window.__UNIVERSAL_DATA_FOR_REHYDRATION__);
      if (fromUniversal) return fromUniversal;
    } catch (_) {}
    const haystack = [];
    if (activeVideo) {
      let node = activeVideo.video;
      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        haystack.push(String(node.outerHTML || ""));
      }
    }
    haystack.push(activeMediaUrl);
    haystack.push(activeContainerText);
    const text = haystack.join("\n");
    const patterns = [
      /\/video\/(\d{8,30})/i,
      /["'](?:aweme_id|awemeId|group_id|groupId|item_id|itemId|video_id|videoId)["']\s*[:=]\s*["']?(\d{8,30})/i,
      /"(?:id|itemId)"\s*:\s*"(\d{8,30})"/i,
      /(?:aweme_id|awemeId|group_id|groupId|item_id|itemId|video_id|videoId)=(\d{8,30})/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "";
  })();
  const anchors = Array.from(document.querySelectorAll("a[href]"))
    .map((anchor) => ({ anchor, href: normalizeUrl(anchor.getAttribute("href")) }))
    .filter((item) => isTikTokVideoUrl(item.href));

  const scoreAnchor = ({ anchor }) => {
    const rect = anchor.getBoundingClientRect();
    let score = rectScore(rect);
    if (activeVideo) {
      let node = activeVideo.video;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        if (node === anchor || node.contains(anchor)) score += 1200000;
      }
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const videoCenterX = activeVideo.rect.left + activeVideo.rect.width / 2;
      const videoCenterY = activeVideo.rect.top + activeVideo.rect.height / 2;
      score -= Math.hypot(centerX - videoCenterX, centerY - videoCenterY) * 260;
    }
    const text = String(anchor.textContent || "");
    if (/@/.test(text) || /video/.test(anchor.href)) score += 40000;
    return score;
  };

  if (anchors.length) {
    const best = anchors
      .map((item) => ({ ...item, score: scoreAnchor(item) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.href) {
      result.ok = true;
      result.url = best.href;
      result.reason = activeVideo ? "active-video-anchor" : "visible-video-anchor";
      return JSON.stringify(result);
    }
  }

  if (activeUsername && activeVideoId) {
    result.ok = true;
    result.url = `https://www.tiktok.com/@${activeUsername}/video/${activeVideoId}`;
    result.reason = "active-video-id";
    return JSON.stringify(result);
  }

  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
  if (isTikTokVideoUrl(canonical)) {
    result.ok = true;
    result.url = normalizeUrl(canonical);
    result.reason = "canonical";
    return JSON.stringify(result);
  }

  result.url = isTikTokFeedUrl(currentUrl) ? "" : currentUrl;
  result.reason = "fallback-current";
  return JSON.stringify(result);
})()
"#;

    let response = {
        #[cfg(target_os = "linux")]
        {
            run_web_javascript_string(&app, label, script.to_string())
        }

        #[cfg(target_os = "windows")]
        {
            let _ = label;
            run_win_javascript(&app, script.to_string())
        }

        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        {
            let _ = app;
            let _ = label;
            Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
        }
    }?;

    let parsed: serde_json::Value = serde_json::from_str(&response).map_err(|e| e.to_string())?;
    let url = parsed
        .get("url")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if url.is_empty() {
        Err(parsed
            .get("reason")
            .and_then(|value| value.as_str())
            .unwrap_or("active content URL not found")
            .to_string())
    } else {
        Ok(url)
    }
}

#[tauri::command]
pub async fn hide_web_view(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        destroy_gtk_webview(&app, label.clone())
    }

    #[cfg(target_os = "windows")]
    {
        destroy_win_webview(&app)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn hide_all_web_views(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        destroy_all_gtk_webviews(&app)
    }

    #[cfg(target_os = "windows")]
    {
        destroy_win_webview(&app)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = app;
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn park_web_view(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        park_gtk_webview(&app, label.clone())
    }

    #[cfg(target_os = "windows")]
    {
        park_win_webview(&app)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn navigate_web_history(
    app: AppHandle,
    label: String,
    direction: String,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        navigate_gtk_web_history(&app, label.clone(), &direction)
    }

    #[cfg(target_os = "windows")]
    {
        navigate_win_web_history(&app, &direction)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn reload_web_view(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        reload_gtk_webview(&app, label.clone())
    }

    #[cfg(target_os = "windows")]
    {
        let _ = label;
        reload_win_webview(&app)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = app;
        let _ = label;
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn apply_web_dali_script(
    app: AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let window = app
            .get_window("main")
            .ok_or_else(|| "Main window not found".to_string())?;

        run_on_main_window(window, move |_| {
            GTK_WEB_STATE.with(|state| {
                if let Some(webview) = state
                    .borrow()
                    .as_ref()
                    .and_then(|state| state.webviews.get(&label))
                {
                    #[allow(deprecated)]
                    webview.run_javascript(&script, webkit2gtk::gio::Cancellable::NONE, |result| {
                        if let Err(error) = result {
                            eprintln!("[ArDali DALI WEB ERROR] run_javascript failed: {}", error);
                        }
                    });
                }

                Ok(())
            })
        })
    }

    #[cfg(target_os = "windows")]
    {
        let state = win_webview_state();
        let guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(webview) = guard.as_ref() {
            webview.eval(&script).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = script;
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn web_dali_audio_snapshot(
    app: AppHandle,
    label: String,
    kind: String,
    size: u32,
) -> Result<String, String> {
    let safe_size = size.clamp(1, 4096);
    let function_name = match kind.as_str() {
        "raw-pcm" => "getRawPcmSnapshot",
        "processed-spectrum" => "getSpectrumSnapshot",
        _ => "getRawSpectrumSnapshot",
    };
    let script = format!(
        r#"(() => {{
  try {{
    const root = window.__ARDALI_DALI_WEB__;
    const fn = root && root.{function_name};
    if (typeof fn !== "function") return JSON.stringify({{ ok: false, values: [], error: "web-dali-snapshot-unavailable" }});
    const values = fn({safe_size});
    return JSON.stringify({{ ok: Array.isArray(values), values: Array.isArray(values) ? values : [] }});
  }} catch (error) {{
    return JSON.stringify({{ ok: false, values: [], error: String(error && error.message ? error.message : error) }});
  }}
}})()"#
    );

    #[cfg(target_os = "linux")]
    {
        run_web_javascript_string(&app, label, script)
    }

    #[cfg(target_os = "windows")]
    {
        run_win_javascript(&app, script)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = app;
        let _ = script;
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn clear_web_data(app: AppHandle, label: String, target: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        clear_gtk_web_data(&app, label.clone(), target)
    }

    #[cfg(target_os = "windows")]
    {
        clear_win_web_data(&app, label, target)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn update_webview_bounds(
    app: AppHandle,
    label: String,
    sidebar_width: u32,
    toolbar_height: u32,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let bounds = webview_bounds(&window, sidebar_width, toolbar_height)?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let position = bounds.position.to_logical::<f64>(scale);
    let size = bounds.size.to_logical::<f64>(scale);

    #[cfg(target_os = "linux")]
    {
        update_gtk_webview_bounds(
            &app,
            label.clone(),
            position.x,
            position.y,
            size.width,
            size.height,
        )
    }

    #[cfg(target_os = "windows")]
    {
        update_win_webview_bounds(&app, position.x, position.y, size.width, size.height)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn update_webview_bounds_rect(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        update_gtk_webview_bounds(&app, label.clone(), x, y, width, height)
    }

    #[cfg(target_os = "windows")]
    {
        update_win_webview_bounds(&app, x, y, width, height)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn create_tab(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    let label_clone = label.clone();
    let label_for_event = label.clone();
    let url_clone = url.clone();

    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        use webkit2gtk::{
            CookiePersistentStorage, LoadEvent, WebContext, WebViewExt, WebsiteDataManager,
        };

        let app_for_events = app.clone();

        let profile_paths_res = web_profile_paths(&app);

        app.run_on_main_thread(move || {
            GTK_WEB_STATE.with(|state| {
                let mut state = state.borrow_mut();

                if state.is_none() {
                    let Some(window) = app_for_events.get_window("main") else {
                        return;
                    };
                    let Ok(vbox) = window.default_vbox() else {
                        return;
                    };
                    let Some(main_widget) = vbox.children().first().cloned() else {
                        return;
                    };

                    vbox.remove(&main_widget);

                    let overlay = gtk::Overlay::new();
                    overlay.set_hexpand(true);
                    overlay.set_vexpand(true);
                    overlay.add(&main_widget);

                    vbox.pack_start(&overlay, true, true, 0);
                    overlay.show_all();

                    *state = Some(GtkWebState {
                        overlay,
                        webviews: std::collections::HashMap::new(),
                        active_label: None,
                        resize_grip: None,
                        private_mode: false,
                    });
                }

                if let Some(state_mut) = state.as_mut() {
                    if let Some(existing) = state_mut.webviews.get(&label_clone) {
                        if let Some(settings) = WebViewExt::settings(existing) {
                            settings.set_user_agent(
                                web_user_agent_for_mode("default", &url_clone).as_deref(),
                            );
                        }
                        let current_uri = existing
                            .uri()
                            .map(|uri| uri.to_string())
                            .unwrap_or_default();
                        if current_uri != url_clone {
                            existing.load_uri(&url_clone);
                        }
                        existing.show_all();
                        existing.grab_focus();
                        state_mut.active_label = Some(label_clone.clone());
                        return;
                    }

                    let profile_paths = if state_mut.private_mode {
                        None
                    } else {
                        profile_paths_res.ok()
                    };

                    let web_context =
                        if let Some((data_dir, cache_dir, cookie_file)) = profile_paths {
                            let data_manager = WebsiteDataManager::builder()
                                .base_data_directory(data_dir)
                                .base_cache_directory(cache_dir)
                                .build();
                            if let Some(cookie_manager) = data_manager.cookie_manager() {
                                cookie_manager.set_persistent_storage(
                                    &cookie_file,
                                    CookiePersistentStorage::Sqlite,
                                );
                            }
                            let ctx = WebContext::with_website_data_manager(&data_manager);
                            try_set_widevine_path(&ctx);
                            ctx
                        } else {
                            let ctx = WebContext::new_ephemeral();
                            try_set_widevine_path(&ctx);
                            ctx
                        };

                    let webview = webkit2gtk::WebView::with_context(&web_context);

                    let app_handle_for_lib = app_for_events.clone();
                    let performance = crate::load_library(app_handle_for_lib)
                        .map(|lib| lib.performance.unwrap_or_default())
                        .unwrap_or_default();

                    if let Some(settings) = WebViewExt::settings(&webview) {
                        apply_web_compat_settings(&settings, &performance);
                        settings.set_user_agent(
                            web_user_agent_for_mode("default", &url_clone).as_deref(),
                        );
                    }
                    webview.set_halign(gtk::Align::Start);
                    webview.set_valign(gtk::Align::Start);
                    webview.add_events(
                        gtk::gdk::EventMask::POINTER_MOTION_MASK
                            | gtk::gdk::EventMask::BUTTON_PRESS_MASK,
                    );

                    let app_for_motion = app_for_events.clone();
                    webview.connect_motion_notify_event(move |_, _| {
                        let _ = app_for_motion.emit("webview-pointer-motion", ());
                        glib::Propagation::Proceed
                    });

                    let app_for_press = app_for_events.clone();
                    webview.connect_button_press_event(move |_, _| {
                        let _ = app_for_press.emit("webview-pointer-motion", ());
                        glib::Propagation::Proceed
                    });

                    let app_for_load_finished = app_for_events.clone();
                    webview.connect_load_changed(move |webview, event| {
                        if event == LoadEvent::Started {
                            let _ = app_for_load_finished.emit(
                                "tab_loading",
                                serde_json::json!({
                                    "id": label_for_event,
                                    "loading": true,
                                }),
                            );
                            return;
                        }
                        if event == LoadEvent::Finished {
                            let uri = webview.uri().unwrap_or_default().to_string();
                            let title = webview
                                .title()
                                .unwrap_or_else(|| "Yeni Sekme".into())
                                .to_string();
                            let _ = app_for_load_finished.emit(
                                "tab_loading",
                                serde_json::json!({
                                    "id": label_for_event,
                                    "loading": false,
                                }),
                            );
                            let _ = app_for_load_finished.emit(
                                "tab_updated",
                                serde_json::json!({
                                    "id": label_for_event,
                                    "title": title,
                                    "url": uri,
                                }),
                            );
                            let _ =
                                app_for_load_finished.emit("webview-load-finished", uri.clone());
                        }
                    });

                    let app_for_load_failed = app_for_events.clone();
                    webview.connect_load_failed(move |webview, _, failing_uri, error| {
                        let failing_uri = failing_uri.to_string();
                        let original_error_message = error.message().to_string();
                        let error_message = original_error_message.to_lowercase();

                        if error_message.contains("cancel") || error_message.contains("iptal") {
                            return true;
                        }

                        let _ = app_for_load_failed.emit(
                            "webview-load-failed",
                            format!("{failing_uri}: {original_error_message}"),
                        );

                        webview.load_html(web_silent_retry_html(), Some("about:blank"));

                        let webview_for_retry = webview.clone();
                        let retry_uri = failing_uri.clone();
                        gtk::glib::timeout_add_local_once(
                            std::time::Duration::from_millis(700),
                            move || {
                                webview_for_retry.load_uri(&retry_uri);
                            },
                        );

                        true
                    });
                    let app_for_title = app_for_events.clone();
                    let label_for_title = label_clone.clone();
                    webview.connect_notify_local(Some("title"), move |webview, _| {
                        let uri = webview.uri().unwrap_or_default().to_string();
                        let title = webview
                            .title()
                            .unwrap_or_else(|| "Yeni Sekme".into())
                            .to_string();
                        let _ = app_for_title.emit(
                            "tab_updated",
                            serde_json::json!({
                                "id": label_for_title,
                                "title": title,
                                "url": uri,
                            }),
                        );
                    });

                    let app_for_uri = app_for_events.clone();
                    let label_for_uri = label_clone.clone();
                    webview.connect_notify_local(Some("uri"), move |webview, _| {
                        let uri = webview.uri().unwrap_or_default().to_string();
                        let title = webview
                            .title()
                            .unwrap_or_else(|| "Yeni Sekme".into())
                            .to_string();
                        let _ = app_for_uri.emit(
                            "tab_updated",
                            serde_json::json!({
                                "id": label_for_uri,
                                "title": title,
                                "url": uri,
                            }),
                        );
                    });

                    let app_for_enter_fullscreen = app_for_events.clone();
                    webview.connect_enter_fullscreen(move |_| {
                        let _ = app_for_enter_fullscreen.emit("webview-fullscreen-change", true);
                        false
                    });

                    let app_for_leave_fullscreen = app_for_events.clone();
                    webview.connect_leave_fullscreen(move |_| {
                        let _ = app_for_leave_fullscreen.emit("webview-fullscreen-change", false);
                        false
                    });

                    if is_tiktok_url(&url_clone) {
                        let webview_for_load = webview.clone();
                        let url_for_load = url_clone.clone();
                        gtk::glib::idle_add_local_once(move || {
                            webview_for_load.load_uri(&url_for_load);
                            webview_for_load.grab_focus();
                        });
                    } else {
                        webview.load_uri(&url_clone);
                    }
                    state_mut.overlay.add_overlay(&webview);
                    webview.show_all();

                    state_mut.webviews.insert(label_clone.clone(), webview);
                }
            });
        })
        .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        // TODO: Windows support
    }

    Ok(())
}

#[tauri::command]
pub async fn switch_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        app.run_on_main_thread(move || {
            GTK_WEB_STATE.with(|state| {
                if let Some(state_mut) = state.borrow_mut().as_mut() {
                    for (win_label, webview) in &state_mut.webviews {
                        if win_label == &label {
                            webview.show_all();
                            webview.grab_focus();
                        } else {
                            webview.hide();
                        }
                    }
                    state_mut.active_label = Some(label);
                }
            });
        })
        .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        // TODO: Windows support
    }
    Ok(())
}

#[tauri::command]
pub async fn close_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        destroy_gtk_webview(&app, label.clone())?;
    }

    #[cfg(target_os = "windows")]
    {
        // TODO
    }
    Ok(())
}
#[tauri::command]
pub async fn navigate_tab(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use tauri::Manager;
        let window = app.get_window("main").ok_or("Main window not found")?;
        run_on_main_window(window, move |_| {
            GTK_WEB_STATE.with(|state| {
                if let Some(state) = state.borrow_mut().as_mut() {
                    if let Some(webview) = state.webviews.get(&label) {
                        if let Some(settings) = WebViewExt::settings(webview) {
                            settings.set_user_agent(
                                web_user_agent_for_mode("default", &url).as_deref(),
                            );
                        }
                        let current_uri =
                            webview.uri().map(|uri| uri.to_string()).unwrap_or_default();
                        if current_uri != url {
                            webview.load_uri(&url);
                        }
                        webview.show_all();
                        webview.grab_focus();
                        state.active_label = Some(label.clone());
                    }
                }
                Ok(())
            })
        })
        .map_err(|e| e.to_string())?
    }

    #[cfg(target_os = "windows")]
    {
        // TODO: Windows support
    }

    Ok(())
}
