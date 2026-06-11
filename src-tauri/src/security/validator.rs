use crate::security::SecurityManager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub plugin_type: String,
    pub entry: String,
    pub permissions: Vec<String>,
    pub trusted: bool,
    pub signature: String,
    pub hash: String,
    pub targets: Vec<String>,
}

pub struct PluginValidator {
    security: SecurityManager,
}

impl PluginValidator {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            security: SecurityManager::new()?,
        })
    }

    pub fn validate(&self, manifest: &PluginManifest, content: &[u8]) -> Result<(), String> {
        if !self.security.is_whitelisted(&manifest.id) {
            return Err(format!(
                "Eklenti guvenilir listede degil: {}",
                manifest.id
            ));
        }

        if !manifest.trusted {
            return Err("Eklenti guvenilir olarak isaretlenmemis".to_string());
        }

        if !SecurityManager::verify_hash(content, &manifest.hash) {
            return Err("Dosya hash dogrulamasi basarisiz".to_string());
        }

        self.security
            .verify_signature(content, &manifest.signature)?;

        SecurityManager::validate_permissions(&manifest.permissions)?;

        Ok(())
    }
}
