fn main() {
    println!("cargo:rustc-link-search=native=../native-dist/linux");
    
    // GitHub Actions veya CI ortamı için ek arama yolları
    if let Ok(prefix) = std::env::var("PROJECTM_PREFIX") {
        println!("cargo:rustc-link-search=native={}/lib", prefix);
        println!("cargo:rustc-link-search=native={}/lib/x86_64-linux-gnu", prefix);
    }

    println!("cargo:rustc-link-lib=dylib=projectM-4");
    println!("cargo:rustc-env=LD_LIBRARY_PATH=../native-dist/linux");
}
