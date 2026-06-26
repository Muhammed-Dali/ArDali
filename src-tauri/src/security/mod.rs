pub mod keygen;
pub mod validator;

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

// Resmi public key: private key repoya eklenmez, sadece eklenti imzalamada kullanilir.
const ARDALI_PUBLIC_KEY: &str = "6d798ced13fe5794fd9fbd6b4f9c5a93fc29651170bc1a16d56728c00507de84";

// Guvenilir eklenti listesi. Resmi registry akisi hazir olana kadar binary icinden korunur.
const TRUSTED_PLUGINS: &[&str] = &["ad-blocker", "downloader", "shazam"];

pub struct SecurityManager {
    verifying_key: VerifyingKey,
    trusted_ids: HashSet<String>,
}

impl SecurityManager {
    pub fn new() -> Result<Self, String> {
        let key_bytes = hex::decode(ARDALI_PUBLIC_KEY).map_err(|e| e.to_string())?;
        let key_array: [u8; 32] = key_bytes
            .try_into()
            .map_err(|_| "Invalid key length".to_string())?;
        let verifying_key = VerifyingKey::from_bytes(&key_array).map_err(|e| e.to_string())?;

        let trusted_ids = TRUSTED_PLUGINS.iter().map(|s| s.to_string()).collect();

        Ok(Self {
            verifying_key,
            trusted_ids,
        })
    }

    pub fn is_whitelisted(&self, plugin_id: &str) -> bool {
        self.trusted_ids.contains(plugin_id)
    }

    pub fn verify_signature(&self, content: &[u8], signature_hex: &str) -> Result<(), String> {
        let sig_bytes =
            hex::decode(signature_hex).map_err(|e| format!("Invalid signature hex: {}", e))?;
        let sig_array: [u8; 64] = sig_bytes
            .try_into()
            .map_err(|_| "Invalid signature length".to_string())?;
        let signature = Signature::from_bytes(&sig_array);

        self.verifying_key
            .verify(content, &signature)
            .map_err(|_| "Signature verification failed".to_string())
    }

    pub fn verify_hash(content: &[u8], expected_hash: &str) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(content);
        let result = hex::encode(hasher.finalize());
        result == expected_hash
    }

    pub fn validate_permissions(permissions: &[String]) -> Result<(), String> {
        let allowed = [
            "webview_inject",
            "network_filter",
            "audio_access",
            "download_access",
            "microphone",
            "notifications",
            "dom",
            "style",
            "storage",
        ];

        for perm in permissions {
            if !allowed.contains(&perm.as_str()) {
                return Err(format!("Izin verilmeyen permission: {}", perm));
            }
        }

        Ok(())
    }
}
