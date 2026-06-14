use egui::{Color32, Context, RichText, ScrollArea, Vec2, Stroke, Rounding, Pos2, Rect};
use std::collections::HashSet;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::thread;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use std::fs;

mod projectm;
use projectm::{ProjectM, ProjectMChannels};

// Yapılandırma verilerini kaydetmek için
#[derive(Serialize, Deserialize, Default)]
struct VisualizerConfig {
    checked_presets: Vec<String>,
    transition_delay: u32,
    last_preview: Option<String>,
    #[serde(default)]
    fps: u32,
    #[serde(default)]
    quality: u32,
    #[serde(default)]
    mesh_w: u32,
    #[serde(default)]
    mesh_h: u32,
}

// PCM verisini saklamak için güvenli bir yapı
struct PcmData {
    samples: Vec<f32>,
    channels: u32,
    count: u32,
}

struct VisualizerApp {
    pm: Arc<Mutex<Option<ProjectM>>>,
    pcm_buffer: Arc<Mutex<Option<PcmData>>>,
    show_preset_window: bool,
    needs_scroll: bool, // Pencere açıldığında hedefe kaydırmak için bayrak
    search_query: String,
    transition_delay: String,
    presets: Vec<PathBuf>,
    preview_preset: Option<usize>, // Şu an oynatılan
    checked_presets: HashSet<usize>, // Tik atılanlar (seçilenler)
    last_transition_time: std::time::Instant,
    last_frame_time: std::time::Instant,
    fps: u32,
    quality: u32,
    mesh_w: u32,
    mesh_h: u32,
}

impl VisualizerApp {
    fn new(pcm_buffer: Arc<Mutex<Option<PcmData>>>) -> Self {
        let mut app = Self {
            pm: Arc::new(Mutex::new(None)),
            pcm_buffer,
            show_preset_window: false,
            needs_scroll: false,
            search_query: String::new(),
            transition_delay: "15".to_string(),
            presets: Vec::new(),
            preview_preset: None,
            checked_presets: HashSet::new(),
            last_transition_time: std::time::Instant::now(),
            last_frame_time: std::time::Instant::now(),
            fps: 60,
            quality: 1024,
            mesh_w: 128,
            mesh_h: 96,
        };
        app.load_presets_from_disk();
        app.load_config();
        app
    }

    fn config_path() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home/muhammetdali".to_string());
        let mut path = PathBuf::from(home);
        path.push(".config");
        path.push("ardali-webmedia");
        if !path.exists() {
            let _ = fs::create_dir_all(&path);
        }
        path.push("visualizer_config.json");
        path
    }

    fn load_config(&mut self) {
        if let Ok(data) = fs::read_to_string(Self::config_path()) {
            if let Ok(config) = serde_json::from_str::<VisualizerConfig>(&data) {
                self.transition_delay = config.transition_delay.to_string();
                
                self.checked_presets.clear();
                for (i, path) in self.presets.iter().enumerate() {
                    let name = Self::get_preset_name(path);
                    if config.checked_presets.contains(&name) {
                        self.checked_presets.insert(i);
                    }
                    if Some(&name) == config.last_preview.as_ref() {
                        self.preview_preset = Some(i);
                    }
                }
                
                self.fps = if config.fps > 0 { config.fps } else { 60 };
                self.quality = if config.quality > 0 { config.quality } else { 1024 };
                self.mesh_w = if config.mesh_w > 0 { config.mesh_w } else { 128 };
                self.mesh_h = if config.mesh_h > 0 { config.mesh_h } else { 96 };
            }
        }
    }

    fn save_config(&self) {
        let mut config = VisualizerConfig {
            transition_delay: self.transition_delay.parse().unwrap_or(15),
            checked_presets: Vec::new(),
            last_preview: None,
            fps: self.fps,
            quality: self.quality,
            mesh_w: self.mesh_w,
            mesh_h: self.mesh_h,
        };
        
        for &idx in &self.checked_presets {
            if let Some(path) = self.presets.get(idx) {
                config.checked_presets.push(Self::get_preset_name(path));
            }
        }
        
        if let Some(idx) = self.preview_preset {
            if let Some(path) = self.presets.get(idx) {
                config.last_preview = Some(Self::get_preset_name(path));
            }
        }
        
        if let Ok(data) = serde_json::to_string_pretty(&config) {
            let _ = fs::write(Self::config_path(), data);
        }
    }

    fn load_presets_from_disk(&mut self) {
        let dev_path = Path::new("/home/muhammetdali/ArDli/public/visualizer-presets");
        if dev_path.exists() && dev_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(dev_path) {
                let mut files = Vec::new();
                for entry in entries.filter_map(Result::ok) {
                    let path = entry.path();
                    if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("milk") {
                        files.push(path);
                    }
                }
                files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
                self.presets = files;
                if !self.presets.is_empty() {
                    self.preview_preset = Some(0);
                    for i in 0..10.min(self.presets.len()) {
                        self.checked_presets.insert(i);
                    }
                }
            }
        }
    }

    fn get_preset_name(path: &Path) -> String {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Bilinmeyen Preset")
            .to_string()
    }

    fn render_main_window(&mut self, ctx: &Context) {
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(Color32::BLACK)) 
            .show(ctx, |ui| {
                let rect = ctx.screen_rect();
                
                let mut current_fps = self.fps;
                let mut current_mesh_w = self.mesh_w;
                let mut current_mesh_h = self.mesh_h;
                
                let pm_clone = self.pm.clone();
                let cb = egui_glow::CallbackFn::new(move |info, _painter| {
                    if let Ok(mut pm_lock) = pm_clone.try_lock() {
                        if let Some(pm) = pm_lock.as_mut() {
                            let w = info.viewport.width() as u32;
                            let h = info.viewport.height() as u32;
                            if pm.last_w != w || pm.last_h != h {
                                pm.set_window_size(w, h);
                                pm.last_w = w;
                                pm.last_h = h;
                            }
                            pm.set_fps(current_fps);
                            pm.set_mesh_size(current_mesh_w, current_mesh_h);
                            pm.render_frame();
                        }
                    }
                });

                ui.painter().add(egui::PaintCallback {
                    rect,
                    callback: std::sync::Arc::new(cb),
                });

                let response = ui.allocate_response(rect.size(), egui::Sense::click());
                
                if response.double_clicked() {
                    let is_fullscreen = ui.input(|i| i.viewport().fullscreen.unwrap_or(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(!is_fullscreen));
                }

                response.context_menu(|ui| {
                    ui.visuals_mut().widgets.noninteractive.bg_fill = Color32::TRANSPARENT;
                    ui.visuals_mut().widgets.hovered.bg_fill = Color32::from_rgba_unmultiplied(0, 150, 200, 60);

                    ui.label(RichText::new("Görüntü").color(Color32::GRAY));
                    
                    let is_fullscreen = ui.input(|i| i.viewport().fullscreen.unwrap_or(false));
                    let fs_text = if is_fullscreen { "Tam ekrandan çık" } else { "Tam ekran göster/gizle" };
                    ui.horizontal(|ui| {
                        if ui.button(fs_text).clicked() {
                            ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(!is_fullscreen));
                            ui.close_menu();
                        }
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(RichText::new("F").color(Color32::GRAY));
                        });
                    });
                    
                    ui.menu_button("Kare oranı", |ui| {
                        if ui.radio_value(&mut self.fps, 15, "Düşük (15 fps)").clicked() { self.save_config(); ui.close_menu(); }
                        if ui.radio_value(&mut self.fps, 25, "Orta (25 fps)").clicked() { self.save_config(); ui.close_menu(); }
                        if ui.radio_value(&mut self.fps, 35, "Yüksek (35 fps)").clicked() { self.save_config(); ui.close_menu(); }
                        if ui.radio_value(&mut self.fps, 60, "Süper yüksek (60 fps)").clicked() { self.save_config(); ui.close_menu(); }
                    });
                    
                    ui.label(RichText::new("İşleme").color(Color32::GRAY));
                    
                    ui.menu_button("Kalite", |ui| {
                        if ui.radio_value(&mut self.quality, 256, "Düşük (256x256)").clicked() { self.save_config(); ui.close_menu(); }
                        if ui.radio_value(&mut self.quality, 512, "Orta (512x512)").clicked() { self.save_config(); ui.close_menu(); }
                        if ui.radio_value(&mut self.quality, 1024, "Yüksek (1024x1024)").clicked() { self.save_config(); ui.close_menu(); }
                        if ui.radio_value(&mut self.quality, 2048, "Süper yüksek (2048x2048)").clicked() { self.save_config(); ui.close_menu(); }
                    });
                    
                    ui.menu_button("Netlik", |ui| {
                        let mut current_mesh = self.mesh_w;
                        if ui.radio_value(&mut current_mesh, 32, "Yumuşak").clicked() {
                            self.mesh_w = 32; self.mesh_h = 24; self.save_config(); ui.close_menu();
                        }
                        if ui.radio_value(&mut current_mesh, 64, "Dengeli").clicked() {
                            self.mesh_w = 64; self.mesh_h = 48; self.save_config(); ui.close_menu();
                        }
                        if ui.radio_value(&mut current_mesh, 96, "Keskin").clicked() {
                            self.mesh_w = 96; self.mesh_h = 72; self.save_config(); ui.close_menu();
                        }
                        if ui.radio_value(&mut current_mesh, 128, "Keskin+").clicked() {
                            self.mesh_w = 128; self.mesh_h = 96; self.save_config(); ui.close_menu();
                        }
                    });
                    
                    ui.separator();
                    ui.label(RichText::new("Presetler").color(Color32::GRAY));
                    if ui.button(RichText::new("Görselleştirmeleri seç...").color(Color32::from_rgb(0, 200, 255))).clicked() {
                        self.show_preset_window = true;
                        self.needs_scroll = true; // Açıldığında seçili olana kaydır
                        ui.close_menu();
                    }
                    
                    ui.separator();
                    if ui.button(RichText::new("Görselleştirmeyi kapat").color(Color32::RED)).clicked() {
                        self.save_config(); // Kapatırken kaydet
                        std::process::exit(0);
                    }
                });
            });
    }

    fn draw_custom_checkbox(ui: &mut egui::Ui, checked: &mut bool) -> egui::Response {
        let (rect, mut response) = ui.allocate_exact_size(Vec2::new(18.0, 18.0), egui::Sense::click());
        
        if response.clicked() {
            *checked = !*checked;
            response.mark_changed();
        }

        let painter = ui.painter();
        let center = rect.center();
        let radius = 8.0;

        if *checked {
            painter.circle_filled(center, radius, Color32::from_rgb(0, 200, 255));
            painter.line_segment(
                [
                    center + Vec2::new(-3.0, 0.0),
                    center + Vec2::new(-1.0, 3.0),
                ],
                Stroke::new(2.0, Color32::BLACK),
            );
            painter.line_segment(
                [
                    center + Vec2::new(-1.0, 3.0),
                    center + Vec2::new(3.0, -3.0),
                ],
                Stroke::new(2.0, Color32::BLACK),
            );
        } else {
            painter.circle_stroke(center, radius, Stroke::new(1.5, Color32::GRAY));
        }

        response
    }

    fn draw_icon_badge(ui: &mut egui::Ui, text: &str, is_previewed: bool) {
        let (rect, _) = ui.allocate_exact_size(Vec2::new(24.0, 24.0), egui::Sense::hover());
        let painter = ui.painter();
        
        let bg_color = if is_previewed { 
            Color32::from_rgb(0, 150, 200) 
        } else { 
            Color32::from_rgb(50, 60, 80) 
        };
        
        painter.rect_filled(rect, Rounding::same(6.0), bg_color);
        painter.rect_filled(
            Rect::from_min_max(rect.min, Pos2::new(rect.max.x, rect.center().y)),
            Rounding { nw: 6.0, ne: 6.0, sw: 0.0, se: 0.0 },
            Color32::from_white_alpha(30)
        );
        painter.rect_stroke(rect, Rounding::same(6.0), Stroke::new(1.0, Color32::from_white_alpha(50)));

        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            text,
            egui::FontId::proportional(12.0),
            Color32::WHITE,
        );
    }

    fn render_preset_window(&mut self, ui: &mut egui::Ui) {
        ui.style_mut().interaction.selectable_labels = false;
        
        let header_rect = Rect::from_min_size(ui.min_rect().min, Vec2::new(ui.available_width(), 80.0));
        ui.painter().circle_filled(
            header_rect.max - Vec2::new(50.0, 20.0),
            40.0,
            Color32::from_rgba_unmultiplied(20, 30, 40, 200)
        );

        ui.label(RichText::new("Görsel atmosferi küratör gibi seçin").size(14.0).color(Color32::LIGHT_GRAY));
        ui.add_space(2.0);
        ui.horizontal(|ui| {
            ui.label(RichText::new(format!("Preset dizini: {}", self.presets.len())).size(13.0).color(Color32::from_rgb(0, 180, 255)));
            ui.label(RichText::new("|").size(13.0).color(Color32::GRAY));
            ui.label(RichText::new(format!("Etkin: {}", self.checked_presets.len())).size(13.0).color(Color32::from_rgb(0, 255, 120)));
        });
        
        ui.add_space(8.0);
        
        ui.horizontal(|ui| {
            ui.add_sized([200.0, 24.0], egui::TextEdit::singleline(&mut self.search_query).hint_text("Preset ara..."));
            
            ui.add_space(20.0);
            
            // Layout düzeltmesi: Dış kapsayıcı sağa yaslar, iç kapsayıcı elemanları soldan sağa dizer!
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("Geçiş gecikmesi:").size(13.0));
                    if ui.button("◀").clicked() {
                        if let Ok(mut val) = self.transition_delay.parse::<u32>() {
                            if val > 1 { val -= 1; }
                            self.transition_delay = val.to_string();
                        }
                    }
                    
                    ui.add_sized([35.0, 20.0], 
                        egui::TextEdit::singleline(&mut self.transition_delay)
                            .frame(false)
                            .horizontal_align(egui::Align::Center)
                            .font(egui::TextStyle::Body)
                    );
                    
                    ui.label("s");
                    if ui.button("▶").clicked() {
                        if let Ok(mut val) = self.transition_delay.parse::<u32>() {
                            val += 1;
                            self.transition_delay = val.to_string();
                        } else {
                            self.transition_delay = "15".to_string();
                        }
                    }
                });
            });
        });
        
        ui.add_space(10.0);
        ui.label(RichText::new("Preset galerisi").size(14.0).color(Color32::GRAY));
        ui.add_space(2.0);
        
        // Hedef kaydırma (scroll) satırını belirle
        let target_scroll_index = self.preview_preset.or_else(|| {
            let mut checked: Vec<usize> = self.checked_presets.iter().cloned().collect();
            checked.sort();
            checked.first().cloned()
        });

        // Üst kısım ile alt butonlar arasında esnek listeyi oluştur
        ScrollArea::vertical()
            .max_height(ui.available_height() - 60.0) // Alttaki buton barına kesin yer bırakır
            .auto_shrink([false; 2])
            .show(ui, |ui| {
            ui.spacing_mut().item_spacing = Vec2::new(0.0, 4.0);
            
            for (i, preset_path) in self.presets.iter().enumerate() {
                let preset_name = Self::get_preset_name(preset_path);
                
                if !self.search_query.is_empty() && !preset_name.to_lowercase().contains(&self.search_query.to_lowercase()) {
                    continue;
                }

                let is_previewed = self.preview_preset == Some(i);
                let is_checked = self.checked_presets.contains(&i);
                
                let bg_color = if is_previewed {
                    Color32::from_rgba_unmultiplied(0, 100, 150, 40)
                } else {
                    Color32::TRANSPARENT
                };

                let stroke_color = if is_previewed {
                    Color32::from_rgb(0, 200, 255)
                } else {
                    Color32::from_gray(50)
                };

                let frame = egui::Frame::none()
                    .fill(bg_color)
                    .stroke(Stroke::new(1.0, stroke_color))
                    .rounding(Rounding::same(8.0))
                    .inner_margin(egui::Margin::symmetric(10.0, 6.0));
                
                let row_frame_resp = frame.show(ui, |ui| {
                    ui.horizontal(|ui| {
                        let mut check_val = is_checked;
                        if Self::draw_custom_checkbox(ui, &mut check_val).changed() {
                            if check_val {
                                self.checked_presets.insert(i);
                            } else {
                                self.checked_presets.remove(&i);
                            }
                        }

                        ui.add_space(8.0);
                        
                        let row_resp = ui.allocate_response(
                            Vec2::new(ui.available_width(), 24.0),
                            egui::Sense::click()
                        );
                        
                        if row_resp.hovered() {
                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                        }
                        
                        if row_resp.clicked() {
                            self.preview_preset = Some(i);
                            self.last_transition_time = std::time::Instant::now();
                            if let Ok(mut pm_lock) = self.pm.try_lock() {
                                if let Some(pm) = pm_lock.as_mut() {
                                    if let Some(path_str) = preset_path.to_str() {
                                        pm.load_preset_file(path_str, true);
                                    }
                                }
                            }
                        }

                        ui.allocate_ui_at_rect(row_resp.rect, |ui| {
                            ui.horizontal(|ui| {
                                let icon_text = if preset_name.starts_with("$$$") {
                                    "RM"
                                } else if preset_name.starts_with(|c: char| c.is_digit(10)) {
                                    preset_name.chars().next().map(|c| c.to_string()).unwrap_or_else(|| "0".to_string()).leak()
                                } else {
                                    preset_name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_else(|| "?".to_string()).leak()
                                };
                                Self::draw_icon_badge(ui, icon_text, is_previewed);
                                
                                ui.add_space(10.0);

                                let text_color = if is_previewed { Color32::WHITE } else { Color32::LIGHT_GRAY };
                                let (text_rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width() - 30.0, 24.0), egui::Sense::hover());
                                ui.painter().text(
                                    text_rect.left_center(),
                                    egui::Align2::LEFT_CENTER,
                                    format!("{}. {}", i + 1, preset_name),
                                    egui::FontId::proportional(14.0),
                                    text_color
                                );

                                let dot_color = if is_previewed { Color32::from_rgb(0, 255, 120) } else { Color32::from_gray(80) };
                                let (dot_rect, _) = ui.allocate_exact_size(Vec2::new(12.0, 12.0), egui::Sense::hover());
                                ui.painter().circle_filled(dot_rect.center(), 4.0, dot_color);
                            });
                        });
                    });
                });

                // Eğer pencere yeni açıldıysa ve bu satır hedefse ona kaydır
                if self.needs_scroll && Some(i) == target_scroll_index {
                    row_frame_resp.response.scroll_to_me(Some(egui::Align::Center));
                    self.needs_scroll = false;
                }
            }
        });
        
        ui.add_space(5.0);
        
        // Yeni tasarlanmış, estetik ve derli toplu alt panel (Toolbar tarzı)
        let bottom_rect = Rect::from_min_size(ui.next_widget_position(), Vec2::new(ui.available_width(), 50.0));
        ui.painter().rect_filled(
            bottom_rect,
            Rounding::same(6.0),
            Color32::from_rgba_unmultiplied(15, 20, 25, 180) // Yarı şeffaf koyu arkaplan
        );
        ui.painter().rect_stroke(
            bottom_rect,
            Rounding::same(6.0),
            Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 10))
        );

        ui.allocate_ui_at_rect(bottom_rect.shrink(10.0), |ui| {
            ui.horizontal(|ui| {
                if ui.add(egui::Button::new(RichText::new("Tümünü seç").size(13.0)).fill(Color32::from_rgb(30, 40, 50)).rounding(4.0)).clicked() {
                    for i in 0..self.presets.len() {
                        self.checked_presets.insert(i);
                    }
                }
                
                ui.add_space(5.0);
                
                if ui.add(egui::Button::new(RichText::new("Tümünü temizle").size(13.0)).fill(Color32::from_rgb(30, 40, 50)).rounding(4.0)).clicked() {
                    self.checked_presets.clear();
                }
                
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let ok_btn = egui::Button::new(RichText::new("Tamam").color(Color32::WHITE).size(15.0).strong())
                        .fill(Color32::from_rgb(0, 160, 210))
                        .rounding(16.0)
                        .min_size(Vec2::new(90.0, 32.0));
                    
                    if ui.add(ok_btn).clicked() {
                        self.save_config(); // Config'i JSON'a kaydet
                        self.show_preset_window = false;
                    }
                });
            });
        });
    }
}

impl eframe::App for VisualizerApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let desired_fps = self.fps as f64;
        let frame_time = std::time::Duration::from_secs_f64(1.0 / desired_fps);
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(self.last_frame_time);
        if elapsed < frame_time {
            std::thread::sleep(frame_time - elapsed);
        }
        self.last_frame_time = std::time::Instant::now();

        let mut visuals = egui::Visuals::dark();
        visuals.window_fill = Color32::from_rgba_unmultiplied(10, 15, 25, 255);
        ctx.set_visuals(visuals);

        if let Ok(delay) = self.transition_delay.parse::<u32>() {
            if delay > 0 && !self.checked_presets.is_empty() {
                if self.last_transition_time.elapsed().as_secs() >= delay as u64 {
                    self.last_transition_time = std::time::Instant::now();
                    
                    let mut checked_sorted: Vec<usize> = self.checked_presets.iter().cloned().collect();
                    checked_sorted.sort();
                    
                    let current_index = self.preview_preset.unwrap_or(0);
                    let next_checked = checked_sorted.iter().find(|&&p| p > current_index)
                                                     .unwrap_or(&checked_sorted[0]);
                                                     
                    self.preview_preset = Some(*next_checked);
                    
                    if let Ok(mut pm_lock) = self.pm.try_lock() {
                        if let Some(pm) = pm_lock.as_mut() {
                            if let Some(path_str) = self.presets[*next_checked].to_str() {
                                pm.load_preset_file(path_str, true);
                            }
                        }
                    }
                }
            }
        }

        if let Ok(mut pm_lock) = self.pm.try_lock() {
            if pm_lock.is_none() {
                let mut pm = ProjectM::new();
                pm.set_fps(self.fps);
                
                if let Some(path_str) = self.preview_preset.and_then(|idx| self.presets.get(idx)).and_then(|p| p.to_str()) {
                    pm.load_preset_file(path_str, true);
                } else if !self.presets.is_empty() {
                    if let Some(path_str) = self.presets[0].to_str() {
                        pm.load_preset_file(path_str, true);
                    }
                }
                
                *pm_lock = Some(pm);
            }

            if let Some(pm) = pm_lock.as_mut() {
                if let Ok(mut buffer_lock) = self.pcm_buffer.try_lock() {
                    if let Some(pcm) = buffer_lock.take() {
                        let channels = if pcm.channels == 2 { ProjectMChannels::Stereo } else { ProjectMChannels::Mono };
                        unsafe {
                            projectm::projectm_pcm_add_float(pm.handle, pcm.samples.as_ptr(), pcm.count, channels);
                        }
                    }
                }
            }
        }

        self.render_main_window(ctx);

        if self.show_preset_window {
            let preset_window_id = egui::ViewportId::from_hash_of("preset_window");
            
            let icon_paths = [
        "icons/ardali_256.png",
        "../src-tauri/icons/ardali_256.png",
        "src-tauri/icons/ardali_256.png",
                "icons/ardali_256.png",
                "../src-tauri/icons/ardali_256.png",
                "src-tauri/icons/ardali_256.png",
                "/home/muhammetdali/ArDli/src-tauri/icons/ardali_256.png",
            ];
            
            let mut icon_data = None;
            for path in icon_paths {
                if let Ok(buffer) = fs::read(Path::new(path)) {
                    if let Ok(image) = image::load_from_memory(&buffer) {
                        let rgba = image.to_rgba8();
                        let (width, height) = rgba.dimensions();
                        icon_data = Some(Arc::new(egui::IconData {
                            rgba: rgba.into_raw(),
                            width,
                            height,
                        }));
                        break;
                    }
                }
            }

            let mut builder = egui::ViewportBuilder::default()
                .with_app_id("ardali-webmedia")
                .with_title("ArDali Görseller")
                .with_inner_size([700.0, 600.0]);
                
            if let Some(icon) = icon_data {
                builder = builder.with_icon(icon);
            }

            ctx.show_viewport_immediate(
                preset_window_id,
                builder,
                |ctx, _class| {
                    let mut visuals = egui::Visuals::dark();
                    visuals.panel_fill = Color32::from_rgba_unmultiplied(15, 20, 30, 255);
                    ctx.set_visuals(visuals);
                    
                    if ctx.input(|i| i.viewport().close_requested()) {
                        self.save_config(); // Pencere "X" ile kapanırsa da kaydet
                        self.show_preset_window = false;
                    }
                    
                    egui::CentralPanel::default().show(ctx, |ui| {
                        self.render_preset_window(ui);
                    });
                }
            );
        }

        let desired_fps = self.fps as f64;
        ctx.request_repaint_after(std::time::Duration::from_secs_f64(1.0 / desired_fps));
    }
}

fn stdin_reader_thread(pcm_buffer: Arc<Mutex<Option<PcmData>>>) {
    let mut stdin = std::io::stdin();
    let mut header = [0u8; 8];
    
    loop {
        if stdin.read_exact(&mut header).is_err() {
            break;
        }
        
        let channels = u32::from_le_bytes(header[0..4].try_into().unwrap());
        let count = u32::from_le_bytes(header[4..8].try_into().unwrap());
        
        if channels > 2 || count > 65_536 {
            eprintln!("Invalid audio header received: {} channels, {} count. Stopping audio thread.", channels, count);
            break;
        }
        if channels == 0 || count == 0 {
            continue;
        }
        
        let total_samples = (channels * count) as usize;
        let mut sample_bytes = vec![0u8; total_samples * 4];
        
        if stdin.read_exact(&mut sample_bytes).is_err() {
            break;
        }
        
        let mut samples = Vec::with_capacity(total_samples);
        for i in 0..total_samples {
            let start = i * 4;
            let val = f32::from_le_bytes(sample_bytes[start..start + 4].try_into().unwrap());
            samples.push(val);
        }
        
        if let Ok(mut buffer) = pcm_buffer.lock() {
            *buffer = Some(PcmData {
                samples,
                channels,
                count,
            });
        }
    }
}

fn main() -> Result<(), eframe::Error> {
    println!("Dali Visualizer Başlıyor...");
    
    let pcm_buffer = Arc::new(Mutex::new(None));
    
    let pcm_buffer_clone = pcm_buffer.clone();
    thread::spawn(move || {
        stdin_reader_thread(pcm_buffer_clone);
    });

    let icon_data = match image::open("/home/muhammetdali/ArDli/src-tauri/icons/ardali_256.png") {
        Ok(img) => {
            let rgba = img.into_rgba8();
            let (width, height) = rgba.dimensions();
            Some(Arc::new(egui::IconData {
                rgba: rgba.into_raw(),
                width,
                height,
            }))
        }
        Err(_) => None,
    };

    let mut options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_app_id("ardali-webmedia")
            .with_inner_size([800.0, 600.0])
            .with_title("ArDali Görselleştirici")
            .with_decorations(true)
            .with_transparent(false),
        ..Default::default()
    };
    
    if let Some(icon) = icon_data {
        options.viewport = options.viewport.with_icon(icon);
    }
    
    eframe::run_native(
        "ArDali Görselleştirici",
        options,
        Box::new(|_cc| Box::new(VisualizerApp::new(pcm_buffer)) as Box<dyn eframe::App>),
    )
}
