fn main() {
    #[cfg(target_os = "linux")]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        println!("cargo:rustc-link-search=native={manifest_dir}/vendor/bass/linux");
        println!("cargo:rustc-link-lib=dylib=bass");
        println!("cargo:rustc-link-arg=-Wl,-rpath,{manifest_dir}/vendor/bass/linux");
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/../lib/ardali-webmedia/_up_/native-dist/linux");
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/../lib/ArDali WebMedia/_up_/native-dist/linux");
        println!("cargo:rerun-if-changed=native/ardali_dsp.cpp");

        cc::Build::new()
            .cpp(true)
            .file("native/ardali_dsp.cpp")
            .flag_if_supported("-std=c++17")
            .compile("ardali_dsp");
    }

    tauri_build::build()
}
