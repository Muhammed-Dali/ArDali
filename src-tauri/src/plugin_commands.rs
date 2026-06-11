use crate::security::validator::{PluginManifest, PluginValidator};
use std::path::{Component, Path, PathBuf};

const PLUGIN_REPOSITORY_RAW_BASE: &str =
    "https://raw.githubusercontent.com/Muhammed-Dali/ArDali-plugins/main/plugins";

fn ensure_safe_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty()
        || !plugin_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("Gecersiz eklenti kimligi".to_string());
    }

    Ok(())
}

fn ensure_safe_relative_entry(entry: &str) -> Result<PathBuf, String> {
    let path = Path::new(entry);
    if path.is_absolute() {
        return Err("Eklenti entry mutlak dosya yolu olamaz".to_string());
    }

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Eklenti entry guvensiz yol bileseni iceriyor".to_string()),
        }
    }

    Ok(path.to_path_buf())
}

async fn fetch_text(url: &str) -> Result<String, String> {
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Indirme basarisiz: {} ({})", url, response.status()));
    }

    response.text().await.map_err(|e| e.to_string())
}

async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Indirme basarisiz: {} ({})", url, response.status()));
    }

    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_plugin(plugin_id: String) -> Result<(), String> {
    ensure_safe_plugin_id(&plugin_id)?;

    let validator = PluginValidator::new()?;

    let manifest_url = format!(
        "{}/{}/manifest.json",
        PLUGIN_REPOSITORY_RAW_BASE, plugin_id
    );
    let manifest_json = fetch_text(&manifest_url).await?;
    let manifest: PluginManifest =
        serde_json::from_str(&manifest_json).map_err(|e| e.to_string())?;

    if manifest.id != plugin_id {
        return Err(format!(
            "Manifest id eslesmiyor: beklenen {}, gelen {}",
            plugin_id, manifest.id
        ));
    }

    let safe_entry = ensure_safe_relative_entry(&manifest.entry)?;
    let content_url = format!(
        "{}/{}/{}",
        PLUGIN_REPOSITORY_RAW_BASE, plugin_id, manifest.entry
    );
    let content = fetch_bytes(&content_url).await?;

    validator.validate(&manifest, &content)?;

    let plugin_dir = dirs::config_dir()
        .ok_or_else(|| "Config dizini bulunamadi".to_string())?
        .join("ardali/plugins")
        .join(&plugin_id);
    std::fs::create_dir_all(&plugin_dir).map_err(|e| e.to_string())?;
    std::fs::write(plugin_dir.join(safe_entry), &content).map_err(|e| e.to_string())?;

    Ok(())
}
