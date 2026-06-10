import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const presetRoot = path.join(rootDir, "public", "eq-presets");
const autoeqDir = path.join(presetRoot, "autoeq");
const ardaliFile = path.join(presetRoot, "ardali", "eq_presets.json");
const outputFile = path.join(presetRoot, "index.json");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function normalizeBands(bands) {
  return Array.from({ length: 32 }, (_, index) => clamp(Number(bands?.[index] ?? 0), -12, 12));
}

function bandsFromPoints(points) {
  const ordered = [...(points ?? [])]
    .map((point) => ({ i: clamp(Number(point.i ?? 0), 0, 31), v: clamp(Number(point.v ?? 0), -12, 12) }))
    .sort((a, b) => a.i - b.i);

  if (!ordered.length) return normalizeBands([]);

  return Array.from({ length: 32 }, (_, index) => {
    const left = [...ordered].reverse().find((point) => point.i <= index) ?? ordered[0];
    const right = ordered.find((point) => point.i >= index) ?? ordered[ordered.length - 1];
    if (left.i === right.i) return left.v;
    const ratio = (index - left.i) / (right.i - left.i);
    return clamp(left.v + (right.v - left.v) * ratio, -12, 12);
  });
}

function groupsForPreset({ name = "", filename = "", description = "", bands = [] }) {
  const text = `${name} ${filename} ${description}`.toLocaleLowerCase("tr");
  const groups = new Set();
  const low = bands.slice(0, 8).reduce((sum, value) => sum + value, 0) / 8;
  const mid = bands.slice(10, 22).reduce((sum, value) => sum + value, 0) / 12;
  const high = bands.slice(24).reduce((sum, value) => sum + value, 0) / 8;
  const maxAbs = Math.max(...bands.map((value) => Math.abs(value)), 0);

  if (maxAbs < 0.75 || /flat|neutral|reference|düz|duz/.test(text)) groups.add("flat");
  if (low - mid > 2 || /bass|sub|low|bas/.test(text)) groups.add("bass");
  if (high - mid > 2 || /treble|bright|tiz|air/.test(text)) groups.add("treble");
  if (/vocal|voice|speech|vokal/.test(text)) groups.add("vocal");
  if (/jazz|caz/.test(text)) groups.add("jazz");
  if (/classical|orchestra|klasik/.test(text)) groups.add("classical");
  if (/electro|edm|dance|techno|elektronik/.test(text)) groups.add("electronic");
  if (/pop/.test(text)) groups.add("pop");
  if (/rock|metal|guitar/.test(text)) groups.add("rock");
  if ((low > mid + 1.5 && high > mid + 1.5) || /v-shape|vshape|v shape/.test(text)) groups.add("vshape");
  if (!groups.size) groups.add("other");
  return [...groups];
}

function descriptionForPreset(raw, fallback = "") {
  const value = String(raw.description ?? fallback ?? "").trim();
  return value || String(raw.category ?? "AutoEQ").trim() || "AutoEQ";
}

await mkdir(presetRoot, { recursive: true });

const ardaliRaw = JSON.parse(await readFile(ardaliFile, "utf8"));
const ardaliPresets = (ardaliRaw.presets ?? []).map((preset) => {
  const bands = normalizeBands(preset.bands ?? bandsFromPoints(preset.points));
  return {
    id: String(preset.id ?? preset.name),
    filename: String(preset.id ?? preset.name),
    source: "ardali",
    name: String(preset.name ?? preset.id),
    description: descriptionForPreset(preset),
    bands,
    groups: groupsForPreset({ ...preset, bands, filename: String(preset.id ?? "") }),
    previewType: "wheel",
  };
});

const autoeqFiles = (await readdir(autoeqDir)).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b));
const autoeqPresets = [];

for (const file of autoeqFiles) {
  const raw = JSON.parse(await readFile(path.join(autoeqDir, file), "utf8"));
  const bands = normalizeBands(raw.bands);
  const name = String(raw.name ?? file.replace(/\.json$/i, ""));
  const description = descriptionForPreset(raw, raw.category);
  autoeqPresets.push({
    id: `autoeq:${file}`,
    filename: file,
    source: "autoeq",
    name,
    description,
    bands,
    groups: groupsForPreset({ name, filename: file, description, bands }),
    previewType: "curve",
  });
}

const flatPreset = {
  id: "__flat__",
  filename: "__flat__",
  source: "ardali",
  name: "ArDali Duz",
  description: "Referans dinleme icin duz profil",
  bands: normalizeBands([]),
  groups: ["flat"],
  previewType: "curve",
};

const presets = [...ardaliPresets, flatPreset, ...autoeqPresets];
await writeFile(
  outputFile,
  `${JSON.stringify({ version: 1, total: presets.length, generatedAt: new Date().toISOString(), presets })}\n`,
);

console.log(`EQ preset catalog written: ${presets.length} presets -> ${path.relative(rootDir, outputFile)}`);
