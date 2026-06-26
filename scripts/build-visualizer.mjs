import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rustDir = path.join(root, "dali-visualizer");
const targetDir = path.join(root, "native-dist", "linux");

console.log("Rust Dali-Visualizer Derleniyor...");

try {
  // Cargo ile derleme işlemi
  execSync("cargo build --release", { cwd: rustDir, stdio: "inherit" });
  
  // Derlenen dosyayı native-dist/linux klasörüne taşı
  const binPath = path.join(rustDir, "target", "release", "dali-visualizer");
  const destPath = path.join(targetDir, "ardali-projectm-visualizer");
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  fs.copyFileSync(binPath, destPath);
  // Çalıştırılabilir izinleri ver
  fs.chmodSync(destPath, 0o755);
  
  console.log("Dali-Visualizer başarıyla derlendi ve kopyalandı:", destPath);
} catch (error) {
  console.error("Dali-Visualizer derlenirken hata oluştu:", error);
  process.exit(1);
}
