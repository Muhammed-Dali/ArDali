import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
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

function copyProjectMLibrary(filePath, copied) {
  const fileName = path.basename(filePath);
  if (!/projectm/i.test(fileName) || !/\.so(?:\.|$)/.test(fileName)) return;
  if (!existsSync(filePath) || copied.has(fileName)) return;

  const target = path.join(outDir, fileName);
  copyFileSync(filePath, target);
  copied.add(fileName);
  console.log(`ProjectM kutuphanesi eklendi: ${target}`);
}

function copyProjectMLibraries() {
  if (platform !== "linux") return;

  const copied = new Set();
  const ldd = spawnSync("ldd", [builtExe], { encoding: "utf8" });
  if (ldd.status === 0) {
    for (const line of ldd.stdout.split("\n")) {
      const match = line.match(/=>\s+(\/\S+)/) || line.match(/^\s*(\/\S+)/);
      if (match) copyProjectMLibrary(match[1], copied);
    }
  }

  for (const dir of (process.env.LD_LIBRARY_PATH || "").split(":").filter(Boolean)) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const source = path.join(dir, entry);
      if (statSync(source).isFile()) copyProjectMLibrary(source, copied);
    }
  }

  if (copied.size === 0) {
    console.warn("ProjectM kutuphanesi bulunamadi; sistem paketinde visualizer acilmayabilir.");
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
copyProjectMLibraries();
console.log(`ProjectM gorsellestirici hazir: ${copiedExe}`);
