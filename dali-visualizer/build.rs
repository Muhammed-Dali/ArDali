fn main() {
    println!("cargo:rustc-link-search=native=../native-dist/linux");
    println!("cargo:rustc-link-lib=dylib=projectM-4");
    println!("cargo:rustc-env=LD_LIBRARY_PATH=../native-dist/linux");
}
