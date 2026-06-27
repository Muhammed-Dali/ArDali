import { emit } from "@tauri-apps/api/event";

export type WebAnimationMode = "compact" | "dock";
export type WebMotionPreset = "calm" | "balanced" | "fast";
export type WebUserAgentMode = "desktop" | "mobile" | "default";
export type SearchEngine = "google" | "duckduckgo" | "brave" | "bing";
export type WebAutoplayPolicy = "allow" | "gesture" | "block";
export type AppLanguage = "tr-TR" | "ar-SA" | "en-US" | "es-ES";
export type StartupPage = "music" | "video" | "gallery" | "web";
export type AppTheme =
  | "aur-renk-efektleri"
  | "performance-balanced"
  | "performance-lite"
  | "ardali"
  | "dark"
  | "black"
  | "light"
  | "frappe"
  | "onedark"
  | "matrix"
  | "latte"
  | "solarized-dark"
  | "neon-night"
  | "retro-amber"
  | "deep-ocean"
  | "forest-mint";
const WEB_SETTINGS_SCHEMA_VERSION = 8;

export type WebSettings = {
  schemaVersion: number;
  enabled: boolean;
  persistentSession: boolean;
  privateMode: boolean;
  language: AppLanguage;
  theme: AppTheme;
  followSystemTheme: boolean;
  rememberLastSection: boolean;
  startupPage: StartupPage;
  playbackRestoreLastTrack: boolean;
  playbackAutoplayLastTrack: boolean;
  playbackResumePosition: boolean;
  playbackFadeOnPause: boolean;
  playbackFadeOnStop: boolean;
  playbackFadeDurationMs: number;
  playbackCrossfadeManual: boolean;
  playbackCrossfadeAuto: boolean;
  playbackCrossfadeMs: number;
  defaultPlatformId: string;
  searchEngine: SearchEngine;
  rememberLastPlatform: boolean;
  restoreLastSession: boolean;
  suspendWhenInactive: boolean;
  startupDelayMs: number;
  animationMode: WebAnimationMode;
  motionPreset: WebMotionPreset;
  lowPowerMode: boolean;
  autoHideChrome: boolean;
  chromeAutoHideDelayMs: number;
  clearCacheOnQuit: boolean;
  clearCookiesOnQuit: boolean;
  clearSiteDataOnQuit: boolean;
  clearHistoryOnQuit: boolean;
  preferHttps: boolean;
  reduceWebRtcIpLeaks: boolean;
  backgroundThrottle: boolean;
  autoRecover: boolean;
  allowCamera: boolean;
  allowMicrophone: boolean;
  allowLocation: boolean;
  allowNotifications: boolean;
  allowPopups: boolean;
  userAgentMode: WebUserAgentMode;
  autoplayPolicy: WebAutoplayPolicy;
  askDownloadLocation: boolean;
  reduceReferrers: boolean;
  stripTrackingParams: boolean;
  blockThirdPartyCookies: boolean;
};

export const WEB_SETTINGS_STORAGE_KEY = "ardali-web-settings";
export const WEB_SETTINGS_EVENT = "web-settings-updated";

export function detectSystemLanguage(): AppLanguage {
  const languages =
    typeof navigator === "undefined"
      ? []
      : [navigator.language, ...(Array.isArray(navigator.languages) ? navigator.languages : [])];
  const normalized = languages.map((language) => String(language || "").toLowerCase());
  if (normalized.some((language) => language.startsWith("ar"))) return "ar-SA";
  if (normalized.some((language) => language.startsWith("es"))) return "es-ES";
  if (normalized.some((language) => language.startsWith("tr"))) return "tr-TR";
  return "en-US";
}

export const defaultWebSettings: WebSettings = {
  schemaVersion: WEB_SETTINGS_SCHEMA_VERSION,
  enabled: true,
  persistentSession: true,
  privateMode: false,
  language: detectSystemLanguage(),
  theme: "black",
  followSystemTheme: false,
  rememberLastSection: true,
  startupPage: "music",
  playbackRestoreLastTrack: true,
  playbackAutoplayLastTrack: false,
  playbackResumePosition: true,
  playbackFadeOnPause: false,
  playbackFadeOnStop: true,
  playbackFadeDurationMs: 700,
  playbackCrossfadeManual: true,
  playbackCrossfadeAuto: true,
  playbackCrossfadeMs: 2000,
  defaultPlatformId: "search",
  searchEngine: "duckduckgo",
  rememberLastPlatform: true,
  restoreLastSession: true,
  suspendWhenInactive: true,
  startupDelayMs: 700,
  animationMode: "compact",
  motionPreset: "balanced",
  lowPowerMode: false,
  autoHideChrome: true,
  chromeAutoHideDelayMs: 2600,
  clearCacheOnQuit: true,
  clearCookiesOnQuit: false,
  clearSiteDataOnQuit: false,
  clearHistoryOnQuit: false,
  preferHttps: true,
  reduceWebRtcIpLeaks: true,
  backgroundThrottle: true,
  autoRecover: true,
  allowCamera: false,
  allowMicrophone: false,
  allowLocation: false,
  allowNotifications: false,
  allowPopups: true,
  userAgentMode: "default",
  autoplayPolicy: "allow",
  askDownloadLocation: true,
  reduceReferrers: true,
  stripTrackingParams: true,
  blockThirdPartyCookies: false,
};

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeWebSettings(value: Partial<WebSettings> | null | undefined): WebSettings {
  const raw = value && typeof value === "object" ? value : {};
  const schemaVersion = Number(raw.schemaVersion) || 0;

  return {
    schemaVersion: WEB_SETTINGS_SCHEMA_VERSION,
    enabled: bool(raw.enabled, defaultWebSettings.enabled),
    persistentSession: bool(raw.persistentSession, defaultWebSettings.persistentSession),
    privateMode: bool(raw.privateMode, defaultWebSettings.privateMode),
    language: oneOf(raw.language, ["tr-TR", "ar-SA", "en-US", "es-ES"] as const, defaultWebSettings.language),
    theme: oneOf(
      raw.theme,
      [
        "aur-renk-efektleri",
        "performance-balanced",
        "performance-lite",
        "ardali",
        "dark",
        "black",
        "light",
        "frappe",
        "onedark",
        "matrix",
        "latte",
        "solarized-dark",
        "neon-night",
        "retro-amber",
        "deep-ocean",
        "forest-mint",
      ] as const,
      defaultWebSettings.theme,
    ),
    followSystemTheme: bool(raw.followSystemTheme, defaultWebSettings.followSystemTheme),
    rememberLastSection: bool(raw.rememberLastSection, defaultWebSettings.rememberLastSection),
    startupPage: oneOf(raw.startupPage, ["music", "video", "gallery", "web"] as const, defaultWebSettings.startupPage),
    playbackRestoreLastTrack: bool(raw.playbackRestoreLastTrack, defaultWebSettings.playbackRestoreLastTrack),
    playbackAutoplayLastTrack: bool(raw.playbackAutoplayLastTrack, defaultWebSettings.playbackAutoplayLastTrack),
    playbackResumePosition: bool(raw.playbackResumePosition, defaultWebSettings.playbackResumePosition),
    playbackFadeOnPause: bool(raw.playbackFadeOnPause, defaultWebSettings.playbackFadeOnPause),
    playbackFadeOnStop: bool(raw.playbackFadeOnStop, defaultWebSettings.playbackFadeOnStop),
    playbackFadeDurationMs: numberInRange(raw.playbackFadeDurationMs, defaultWebSettings.playbackFadeDurationMs, 0, 5000),
    playbackCrossfadeManual: bool(raw.playbackCrossfadeManual, defaultWebSettings.playbackCrossfadeManual),
    playbackCrossfadeAuto: bool(raw.playbackCrossfadeAuto, defaultWebSettings.playbackCrossfadeAuto),
    playbackCrossfadeMs: numberInRange(raw.playbackCrossfadeMs, defaultWebSettings.playbackCrossfadeMs, 0, 15000),
    searchEngine: oneOf(raw.searchEngine, ["google", "duckduckgo", "brave", "bing"] as const, defaultWebSettings.searchEngine),
    defaultPlatformId: typeof raw.defaultPlatformId === "string" && raw.defaultPlatformId.trim() ? raw.defaultPlatformId : defaultWebSettings.defaultPlatformId,
    rememberLastPlatform: bool(raw.rememberLastPlatform, defaultWebSettings.rememberLastPlatform),
    restoreLastSession: bool(raw.restoreLastSession, defaultWebSettings.restoreLastSession),
    suspendWhenInactive:
      schemaVersion >= 4 || schemaVersion === 2
        ? bool(raw.suspendWhenInactive, defaultWebSettings.suspendWhenInactive)
        : defaultWebSettings.suspendWhenInactive,
    startupDelayMs:
      schemaVersion >= 3
        ? numberInRange(raw.startupDelayMs, defaultWebSettings.startupDelayMs, 0, 5000)
        : defaultWebSettings.startupDelayMs,
    animationMode: oneOf(raw.animationMode, ["compact", "dock"] as const, defaultWebSettings.animationMode),
    motionPreset: oneOf(raw.motionPreset, ["calm", "balanced", "fast"] as const, defaultWebSettings.motionPreset),
    lowPowerMode: bool(raw.lowPowerMode, defaultWebSettings.lowPowerMode),
    autoHideChrome: bool(raw.autoHideChrome, defaultWebSettings.autoHideChrome),
    chromeAutoHideDelayMs: numberInRange(raw.chromeAutoHideDelayMs, defaultWebSettings.chromeAutoHideDelayMs, 800, 8000),
    clearCacheOnQuit: bool(raw.clearCacheOnQuit, defaultWebSettings.clearCacheOnQuit),
    clearCookiesOnQuit: bool(raw.clearCookiesOnQuit, defaultWebSettings.clearCookiesOnQuit),
    clearSiteDataOnQuit: bool(raw.clearSiteDataOnQuit, defaultWebSettings.clearSiteDataOnQuit),
    clearHistoryOnQuit: bool(raw.clearHistoryOnQuit, defaultWebSettings.clearHistoryOnQuit),
    preferHttps: bool(raw.preferHttps, defaultWebSettings.preferHttps),
    reduceWebRtcIpLeaks: bool(raw.reduceWebRtcIpLeaks, defaultWebSettings.reduceWebRtcIpLeaks),
    backgroundThrottle: bool(raw.backgroundThrottle, defaultWebSettings.backgroundThrottle),
    autoRecover: bool(raw.autoRecover, defaultWebSettings.autoRecover),
    allowCamera: bool(raw.allowCamera, defaultWebSettings.allowCamera),
    allowMicrophone: bool(raw.allowMicrophone, defaultWebSettings.allowMicrophone),
    allowLocation: bool(raw.allowLocation, defaultWebSettings.allowLocation),
    allowNotifications: bool(raw.allowNotifications, defaultWebSettings.allowNotifications),
    allowPopups: bool(raw.allowPopups, defaultWebSettings.allowPopups),
    userAgentMode: oneOf(raw.userAgentMode, ["desktop", "mobile", "default"] as const, defaultWebSettings.userAgentMode),
    autoplayPolicy: oneOf(raw.autoplayPolicy, ["allow", "gesture", "block"] as const, defaultWebSettings.autoplayPolicy),
    askDownloadLocation: bool(raw.askDownloadLocation, defaultWebSettings.askDownloadLocation),
    reduceReferrers: bool(raw.reduceReferrers, defaultWebSettings.reduceReferrers),
    stripTrackingParams: bool(raw.stripTrackingParams, defaultWebSettings.stripTrackingParams),
    blockThirdPartyCookies: bool(raw.blockThirdPartyCookies, defaultWebSettings.blockThirdPartyCookies),
  };
}

export function loadWebSettings(): WebSettings {
  try {
    return normalizeWebSettings(JSON.parse(localStorage.getItem(WEB_SETTINGS_STORAGE_KEY) || "null"));
  } catch {
    return defaultWebSettings;
  }
}

export function saveWebSettings(settings: Partial<WebSettings>) {
  const next = normalizeWebSettings(settings);
  localStorage.setItem(WEB_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<WebSettings>(WEB_SETTINGS_EVENT, { detail: next }));
  if ("__TAURI_INTERNALS__" in window) void emit(WEB_SETTINGS_EVENT, next).catch(() => undefined);
  return next;
}

export function resetWebSettings() {
  return saveWebSettings(defaultWebSettings);
}
