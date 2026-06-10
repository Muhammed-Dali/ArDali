import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const groups = {
  frontend: ["dist"],
  release: [
    "src-tauri/target/release",
    "src-tauri/target/bundle",
    "src-tauri/gen",
    "build-visualizer-ardali",
    "build-visualizer",
  ],
  visualizerCache: ["build-visualizer-ardali", "build-visualizer"],
  rustCache: ["src-tauri/target", "src-tauri/gen"],
};

const args = new Set(process.argv.slice(2));
const paths = args.has("--frontend")
  ? groups.frontend
  : args.has("--release")
    ? [...groups.frontend, ...groups.release]
    : args.has("--visualizer-cache")
      ? groups.visualizerCache
    : args.has("--rust-cache")
      ? groups.rustCache
      : args.has("--all")
        ? [...groups.frontend, ...groups.rustCache]
        : [...groups.frontend, ...groups.release];

for (const path of paths) {
  await rm(resolve(path), { recursive: true, force: true });
  console.log(`Temizlendi: ${path}`);
}
