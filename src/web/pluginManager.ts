import { invoke } from "@tauri-apps/api/core";

export type ArdaliPluginPermission = "dom" | "style" | "storage";

export type ArdaliPluginManifest = {
  id: string;
  name: string;
  version: string;
  author: string;
  official: boolean;
  category: string;
  description: string;
  type: "userscript";
  entry: string;
  matches: string[];
  permissions: ArdaliPluginPermission[];
  defaultEnabled: boolean;
};

type ArdaliStoreCatalog = {
  schema: number;
  updatedAt: string;
  extensions: ArdaliPluginManifest[];
};

export type ArdaliInstalledPlugin = {
  installed: boolean;
  enabled: boolean;
};

export type ArdaliPluginState = Record<string, ArdaliInstalledPlugin>;

export type ArdaliStoreItem = ArdaliPluginManifest & ArdaliInstalledPlugin;

export const ARDALI_STORE_PLATFORM_ID = "ardali-store";
export const ARDALI_STORE_STORAGE_KEY = "ardali-store-installed";

const catalogUrl = "/ardali-store/catalog.json";
const allowedPermissions = new Set<ArdaliPluginPermission>(["dom", "style", "storage"]);

function readPluginState(): ArdaliPluginState {
  try {
    const raw = JSON.parse(localStorage.getItem(ARDALI_STORE_STORAGE_KEY) || "{}") as ArdaliPluginState;
    if (!raw || typeof raw !== "object") return {};
    return raw;
  } catch {
    return {};
  }
}

function writePluginState(state: ArdaliPluginState) {
  localStorage.setItem(ARDALI_STORE_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("ardali-store-updated", { detail: state }));
}

function normalizeCatalog(catalog: ArdaliStoreCatalog): ArdaliPluginManifest[] {
  if (!catalog || catalog.schema !== 1 || !Array.isArray(catalog.extensions)) return [];
  return catalog.extensions.filter((plugin) => {
    if (!plugin.official || plugin.type !== "userscript") return false;
    if (!plugin.id || !plugin.entry.startsWith("/ardali-store/extensions/")) return false;
    if (!Array.isArray(plugin.matches) || !plugin.matches.length) return false;
    return plugin.permissions.every((permission) => allowedPermissions.has(permission));
  });
}

export async function loadArdaliStoreCatalog(): Promise<ArdaliPluginManifest[]> {
  const response = await fetch(catalogUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`ArDali magaza katalogu okunamadi (${response.status})`);
  return normalizeCatalog((await response.json()) as ArdaliStoreCatalog);
}

export async function loadArdaliStoreItems(): Promise<ArdaliStoreItem[]> {
  const [catalog, state] = await Promise.all([loadArdaliStoreCatalog(), Promise.resolve(readPluginState())]);
  return catalog.map((plugin) => {
    const saved = state[plugin.id];
    return {
      ...plugin,
      installed: saved?.installed ?? false,
      enabled: saved?.enabled ?? (plugin.defaultEnabled && (saved?.installed ?? false)),
    };
  });
}

export async function setPluginInstalled(pluginId: string, installed: boolean) {
  if (installed) {
    await invoke("install_plugin", { pluginId });
  }

  const state = readPluginState();
  state[pluginId] = {
    installed,
    enabled: installed ? (state[pluginId]?.enabled ?? true) : false,
  };
  writePluginState(state);
}

export function setPluginEnabled(pluginId: string, enabled: boolean) {
  const state = readPluginState();
  const current = state[pluginId] ?? { installed: false, enabled: false };
  state[pluginId] = {
    installed: current.installed,
    enabled: current.installed ? enabled : false,
  };
  writePluginState(state);
}

function matchUrl(pattern: string, url: string) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(url);
}

function pluginMatchesUrl(plugin: ArdaliPluginManifest, url: string) {
  return plugin.matches.some((pattern) => matchUrl(pattern, url));
}

function pluginInjectionScript(plugins: Array<{ manifest: ArdaliPluginManifest; source: string }>) {
  const blocks = plugins.map((plugin) => {
    const key = `${plugin.manifest.id}@${plugin.manifest.version}`;
    const api = {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      permissions: plugin.manifest.permissions,
    };
    return `
  try {
    const ArDaliPluginAPI = Object.freeze({
      ...${JSON.stringify(api)},
      storage: Object.freeze({
        get: (name) => {
          try { return localStorage.getItem("__ardali_plugin_${plugin.manifest.id}_" + String(name)); } catch (_) { return null; }
        },
        set: (name, value) => {
          if (!${JSON.stringify(plugin.manifest.permissions)}.includes("storage")) return false;
          try {
            localStorage.setItem("__ardali_plugin_${plugin.manifest.id}_" + String(name), String(value));
            return true;
          } catch (_) {
            return false;
          }
        }
      })
    });
    const invoke = undefined;
    const __TAURI__ = undefined;
    const require = undefined;
    const process = undefined;
    ${plugin.source}
    installed[${JSON.stringify(key)}] = { ok: true, at: Date.now() };
  } catch (error) {
    installed[${JSON.stringify(key)}] = { ok: false, error: String(error && error.message ? error.message : error), at: Date.now() };
    try { console.error("[ArDali Plugin]", ${JSON.stringify(plugin.manifest.id)}, error); } catch (_) {}
  }`;
  }).join("\n");

  return `
(() => {
  const installed = window.__ARDALI_OFFICIAL_PLUGINS__ || {};
  window.__ARDALI_OFFICIAL_PLUGINS__ = installed;
${blocks}
  return { ok: true, count: ${plugins.length} };
})();
`;
}

export async function applyOfficialPluginsForUrl(url: string) {
  if (!url || url === ARDALI_STORE_PLATFORM_ID) return;
  const [catalog, state] = await Promise.all([loadArdaliStoreCatalog(), Promise.resolve(readPluginState())]);
  const active = catalog.filter((plugin) => {
    const saved = state[plugin.id];
    return saved?.installed && saved.enabled && pluginMatchesUrl(plugin, url);
  });
  if (!active.length) return;

  const plugins = await Promise.all(
    active.map(async (manifest) => {
      const response = await fetch(manifest.entry, { cache: "no-store" });
      if (!response.ok) throw new Error(`${manifest.name} okunamadi (${response.status})`);
      return { manifest, source: await response.text() };
    }),
  );

  await invoke("apply_web_dali_script", { script: pluginInjectionScript(plugins) });
}
