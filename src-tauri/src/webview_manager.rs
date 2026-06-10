use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url};

#[cfg(target_os = "linux")]
use gtk::prelude::*;
#[cfg(target_os = "linux")]
use std::{cell::RefCell, fs, fs::OpenOptions, sync::mpsc};
#[cfg(target_os = "linux")]
use std::os::unix::fs::PermissionsExt;
#[cfg(target_os = "linux")]
use webkit2gtk::{
    CookieManagerExt, CookiePersistentStorage, LoadEvent, SettingsExt, WebContext, WebViewExt,
    WebsiteDataManager, WebsiteDataManagerExt, WebsiteDataManagerExtManual, WebsiteDataTypes,
};

#[cfg(target_os = "linux")]
struct GtkWebState {
    overlay: gtk::Overlay,
    webview: Option<webkit2gtk::WebView>,
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
fn install_or_update_gtk_webview(
    app: &AppHandle,
    url: String,
    private_mode: bool,
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
                    WebContext::with_website_data_manager(&data_manager)
                } else {
                    WebContext::new_ephemeral()
                };
                let webview = webkit2gtk::WebView::with_context(&web_context);
                if let Some(settings) = WebViewExt::settings(&webview) {
                    settings.set_enable_fullscreen(true);
                    settings.set_enable_write_console_messages_to_stdout(true);
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

                webview.connect_load_failed(move |webview, _, failing_uri, error| {
                    let failing_uri = failing_uri.to_string();
                    let error_message = error.message().to_string().to_lowercase();

                    if error_message.contains("cancel") || error_message.contains("iptal") {
                        return true;
                    }

                    webview.load_html(web_silent_retry_html(), Some("about:blank"));

                    let webview_for_retry = webview.clone();
                    let retry_uri = failing_uri.clone();
                    gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(700), move || {
                        webview_for_retry.load_uri(&retry_uri);
                    });

                    let webview_for_late_retry = webview.clone();
                    let late_retry_uri = failing_uri.clone();
                    gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(1800), move || {
                        webview_for_late_retry.load_uri(&late_retry_uri);
                    });

                    let webview_for_final_retry = webview.clone();
                    gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(3600), move || {
                        webview_for_final_retry.load_uri(&failing_uri);
                    });

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

            let webview = state
                .webview
                .as_ref()
                .ok_or_else(|| "GTK webview not initialized".to_string())?;

            webview.set_margin_start(x);
            webview.set_margin_top(y);
            webview.set_size_request(width, height);
            webview.show_all();
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
                gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(350), move || {
                    webview_for_retry.load_uri(&url_for_retry);
                    webview_for_retry.grab_focus();
                });

                let webview_for_late_retry = webview.clone();
                gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(1200), move || {
                    webview_for_late_retry.load_uri(&url);
                    webview_for_late_retry.grab_focus();
                });
            } else {
                let webview_for_refresh = webview.clone();
                gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(120), move || {
                    webview_for_refresh.load_uri(&url);
                    webview_for_refresh.grab_focus();
                });
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
        "cache" => WebsiteDataTypes::MEMORY_CACHE
            | WebsiteDataTypes::DISK_CACHE
            | WebsiteDataTypes::OFFLINE_APPLICATION_CACHE,
        "cookies" => WebsiteDataTypes::COOKIES,
        "site-data" => WebsiteDataTypes::SESSION_STORAGE
            | WebsiteDataTypes::LOCAL_STORAGE
            | WebsiteDataTypes::INDEXEDDB_DATABASES
            | WebsiteDataTypes::WEBSQL_DATABASES
            | WebsiteDataTypes::DOM_CACHE
            | WebsiteDataTypes::SERVICE_WORKER_REGISTRATIONS,
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


#[tauri::command]
pub async fn open_web_platform(
    app: AppHandle,
    platform_url: String,
    private_mode: bool,
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
            position.x,
            position.y,
            size.width,
            size.height,
        )
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
    }
}

#[tauri::command]
pub async fn open_web_platform_in_rect(
    app: AppHandle,
    platform_url: String,
    private_mode: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    parse_platform_url(&platform_url)?;

    #[cfg(target_os = "linux")]
    {
        install_or_update_gtk_webview(&app, platform_url, private_mode, x, y, width, height)
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
    }
}

#[tauri::command]
pub async fn hide_web_view(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        destroy_gtk_webview(&app)
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
    }
}

#[tauri::command]
pub async fn park_web_view(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        park_gtk_webview(&app)
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
    }
}

#[tauri::command]
pub async fn navigate_web_history(app: AppHandle, direction: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        navigate_gtk_web_history(&app, &direction)
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
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
                if let Some(webview) = state.borrow().as_ref().and_then(|state| state.webview.as_ref()) {
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

    #[cfg(not(target_os = "linux"))]
    {
        let _ = script;
        Err("Embedded web view is currently implemented for Linux only".to_string())
    }
}

#[tauri::command]
pub async fn clear_web_data(app: AppHandle, target: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        clear_gtk_web_data(&app, target)
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
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

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
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

    #[cfg(not(target_os = "linux"))]
    {
        Err("Embedded web view is currently implemented for Linux only".to_string())
    }
}
