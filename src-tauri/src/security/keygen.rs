use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;

#[allow(dead_code)]
pub fn generate_keypair() {
    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    let verifying_key = VerifyingKey::from(&signing_key);

    // Private key: sadece imzalama icin kullanilir, repoya eklenmemeli.
    let private_bytes = hex::encode(signing_key.to_bytes());

    // Public key: uygulama icine gomulur.
    let public_bytes = hex::encode(verifying_key.to_bytes());

    println!("Private key: {}", private_bytes);
    println!("Public key: {}", public_bytes);
}
