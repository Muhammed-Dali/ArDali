import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const sourceDir = path.join(root, "visualizer");
const buildDir = path.join(root, "build-visualizer-ardali");
const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
const exeName = process.platform === "win32" ? "ardali-projectm-visualizer.exe" : "ardali-projectm-visualizer";
const outDir = path.join(root, "native-dist", platform);
const builtExe = path.join(buildDir, exeName);
const copiedExe = path.join(outDir, exeName);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!existsSync(path.join(sourceDir, "CMakeLists.txt"))) {
  console.error("visualizer/CMakeLists.txt bulunamadi.");
  process.exit(1);
}

run("cmake", ["-S", sourceDir, "-B", buildDir, "-DCMAKE_BUILD_TYPE=Release"]);
run("cmake", ["--build", buildDir, "--config", "Release", "--parallel"]);

if (!existsSync(builtExe)) {
  console.error(`Derleme cikti dosyasi bulunamadi: ${builtExe}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(builtExe, copiedExe);
console.log(`ProjectM gorsellestirici hazir: ${copiedExe}`);
