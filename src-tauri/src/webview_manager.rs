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
    webview: Option<webkit2gtk::WebView>,
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
fn web_user_agent_for_mode(mode: &str) -> Option<String> {
    match mode {
        "desktop" => Some(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
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
fn apply_web_compat_settings(settings: &webkit2gtk::Settings) {
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
    settings.set_enable_webgl(true);
    settings.set_enable_accelerated_2d_canvas(true);
    settings.set_enable_dns_prefetching(true);
    settings.set_enable_page_cache(true);
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
fn run_web_javascript_string(app: &AppHandle, script: String) -> Result<String, String> {
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
                    .and_then(|state| state.webview.clone())
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
                    webview: None,
                    resize_grip: None,
                    private_mode,
                });
            }

            let state = state
                .as_mut()
                .ok_or_else(|| "GTK web state not initialized".to_string())?;

            if state.private_mode != private_mode {
                if let Some(webview) = state.webview.take() {
                    webview.stop_loading();
                    webview.load_uri("about:blank");
                    state.overlay.remove(&webview);
                }
                state.private_mode = private_mode;
            }

            let created_webview = state.webview.is_none();

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
                if let Some(settings) = WebViewExt::settings(&webview) {
                    apply_web_compat_settings(&settings);
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
                    if event != LoadEvent::Finished {
                        return;
                    }
                    let uri = webview.uri().unwrap_or_default().to_string();
                    let _ = app_for_load_finished.emit("webview-load-finished", uri);
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
                state.webview = Some(webview);
            }

            if state.resize_grip.is_none() {
                let resize_grip = create_web_resize_grip();
                state.overlay.add_overlay(&resize_grip);
                state.overlay.set_overlay_pass_through(&resize_grip, false);
                resize_grip.show_all();
                state.resize_grip = Some(resize_grip);
            }

            let webview = state
                .webview
                .as_ref()
                .ok_or_else(|| "GTK webview not initialized".to_string())?;

            if let Some(settings) = WebViewExt::settings(webview) {
                settings.set_user_agent(web_user_agent_for_mode(&user_agent_mode).as_deref());
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

            let webview_for_load = webview.clone();
            let url_for_load = url.clone();
            gtk::glib::idle_add_local_once(move || {
                webview_for_load.load_uri(&url_for_load);
                webview_for_load.grab_focus();
            });

            if created_webview {
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
            } else {
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
                if let Some(webview) = state.webview.as_ref() {
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
fn destroy_gtk_webview(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow_mut().as_mut() {
                if let Some(webview) = state.webview.take() {
                    webview.stop_loading();
                    webview.load_uri("about:blank");
                    state.overlay.remove(&webview);
                }
                if let Some(resize_grip) = state.resize_grip.take() {
                    state.overlay.remove(&resize_grip);
                }
            }

            Ok(())
        })
    })
}

#[cfg(target_os = "linux")]
fn park_gtk_webview(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow().as_ref() {
                if let Some(webview) = state.webview.as_ref() {
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
fn navigate_gtk_web_history(app: &AppHandle, direction: &str) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let direction = direction.to_string();

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            if let Some(state) = state.borrow().as_ref() {
                if let Some(webview) = state.webview.as_ref() {
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
fn clear_gtk_web_data(app: &AppHandle, target: String) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let (data_dir, cache_dir, cookie_file) = web_profile_paths(app)?;

    run_on_main_window(window, move |_| {
        GTK_WEB_STATE.with(|state| {
            let manager = state
                .borrow()
                .as_ref()
                .and_then(|state| state.webview.as_ref())
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
    let main_pos = main_window
        .outer_position()
        .map_err(|e| e.to_string())?;
    let scale = main_window.scale_factor().unwrap_or(1.0);
    let main_x = main_pos.x as f64 / scale;
    let main_y = main_pos.y as f64 / scale;

    let abs_x = main_x + x;
    let abs_y = main_y + y;

    let webview_window = WebviewWindowBuilder::new(
        app,
        "ardali-web-platform",
        tauri::WebviewUrl::External(url.parse::<tauri::Url>().map_err(|e| format!("URL parse hatasi: {e}"))?),
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
    let main_pos = main_window
        .outer_position()
        .map_err(|e| e.to_string())?;
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
pub async fn hide_web_view(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        destroy_gtk_webview(&app)
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
pub async fn park_web_view(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        park_gtk_webview(&app)
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
pub async fn navigate_web_history(app: AppHandle, direction: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        navigate_gtk_web_history(&app, &direction)
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
pub async fn apply_web_dali_script(app: AppHandle, script: String) -> Result<(), String> {
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
                    .and_then(|state| state.webview.as_ref())
                {
                    #[allow(deprecated)]
                    webview.run_javascript(&script, webkit2gtk::gio::Cancellable::NONE, |result| {
                        if let Err(error) = result {
                            eprintln!("[ArDali DALI WEB ERROR] run_javascript failed: {}", error);
                        }
                    });
                } else {
                    eprintln!("[ArDali DALI WEB ERROR] webview is not available");
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
        run_web_javascript_string(&app, script)
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
pub async fn clear_web_data(app: AppHandle, target: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        clear_gtk_web_data(&app, target)
    }

    #[cfg(target_os = "windows")]
    {
        clear_win_web_data(&app, target)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Embedded web view is currently implemented for Linux and Windows only".to_string())
    }
}

#[tauri::command]
pub async fn update_webview_bounds(
    app: AppHandle,
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
        update_gtk_webview_bounds(&app, position.x, position.y, size.width, size.height)
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
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        update_gtk_webview_bounds(&app, x, y, width, height)
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