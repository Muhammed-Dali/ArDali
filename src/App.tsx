import {
  Album,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Film,
  FolderPlus,
  Globe2,
  Grid2X2,
  Image,
  Keyboard,
  ListMusic,
  Maximize2,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  Rewind,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ChangeEvent, memo, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject, UIEvent as ReactUIEvent, useCallback, useEffect, useMemo, useRef, useState, WheelEvent as ReactWheelEvent } from "react";
import { flushSync } from "react-dom";
import { applyWebDaliEffects, clearWebData, getWebDaliRawPcm, getWebDaliRawSpectrum, hideWeb, navigateWebHistory, onWindowResize, openPlatform, parkWeb, platforms, setWebChromeVisibility, type WebDaliPayload, type WebPlatform } from "./web/webManager";
import {
  applyOfficialPluginsForUrl,
  ARDALI_STORE_PLATFORM_ID,
  loadArdaliStoreItems,
  setPluginEnabled,
  setPluginInstalled,
  type ArdaliStoreItem,
} from "./web/pluginManager";
import { defaultWebSettings, loadWebSettings, resetWebSettings, saveWebSettings, WEB_SETTINGS_EVENT, type AppLanguage, type AppTheme, type StartupPage, type WebSettings } from "./web/webSettings";

type PageId =
  | "files"
  | "video"
  | "music"
  | "gallery"
  | "web"
  | "settings";

type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  length: string;
  duration: number;
  lastPosition: number;
  tag: string;
  color: string;
  coverDataUrl?: string;
  fileName: string;
  path?: string;
  url: string;
};

type VideoItem = {
  id: string;
  title: string;
  meta: string;
  duration: number;
  lastPosition: number;
  color: string;
  thumbnailDataUrl?: string;
  fileName: string;
  path?: string;
  url: string;
};

type VideoQuality = "auto" | "1080p" | "720p" | "480p" | "360p";

type LibraryItemSnapshot = {
  path: string;
  title: string;
  duration?: number;
  lastPosition?: number;
  coverDataUrl?: string;
};

type PlaybackSnapshot = {
  currentPage?: PageId;
  activeWebPlatformId?: string;
  selectedMusicPath?: string;
  selectedVideoPath?: string;
  musicPosition?: number;
  videoPosition?: number;
  volume?: number;
  musicViewMode?: MusicViewMode;
};

type EffectsSnapshot = {
  effectsOpen?: boolean;
  effectsEnabled?: boolean;
  eqPreset?: string;
  eqGains?: number[];
  dspSettings?: Partial<DspSettings>;
};

type LibrarySnapshot = {
  music: LibraryItemSnapshot[];
  videos: LibraryItemSnapshot[];
  playback?: PlaybackSnapshot;
  effects?: EffectsSnapshot;
};

type VisualizerAnalyzerId =
  | "ardali"
  | "sfx_effects"
  | "ardali_center_turbine"
  | "ardali_center_turbine_lines"
  | "ardali_center_peak"
  | "ardali_center_peak_lines"
  | "turbine"
  | "nyanalyzer"
  | "none";

type VisualizerSettingsState = {
  analyzer: VisualizerAnalyzerId;
  framerate: 20 | 25 | 30 | 60;
  sharpness: 0 | 1 | 2 | 3;
  psychedelic: boolean;
  glow: boolean;
  reflection: boolean;
};

type AudioGraph = {
  context: AudioContext;
  analyser: AnalyserNode;
  rawAnalyser: AnalyserNode;
  bassFilter: BiquadFilterNode;
  midFilter: BiquadFilterNode;
  trebleFilter: BiquadFilterNode;
  peqFilters: BiquadFilterNode[];
  exciterDryGain: GainNode;
  exciterHighpass: BiquadFilterNode;
  exciterDrive: GainNode;
  exciterShaper: WaveShaperNode;
  exciterTone: BiquadFilterNode;
  exciterWetGain: GainNode;
  exciterCurveKey: string;
  deesserFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  autoGain: GainNode;
  limiterInputGain: GainNode;
  dryGain: GainNode;
  filters: BiquadFilterNode[];
  limiter: DynamicsCompressorNode;
  stereoPanner: StereoPannerNode;
  reverb: ConvolverNode;
  toneGain: GainNode;
  wetGain: GainNode;
  truePeakDrive: GainNode;
  truePeakLimiter: DynamicsCompressorNode;
  gain: GainNode;
};

type ProjectMPcmPayload = {
  channels: number;
  countPerChannel: number;
  samples: number[];
};

type MprisMetadataPayload = {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number;
  position: number;
  isPlaying: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  canSeek: boolean;
  mediaType: string;
  url: string;
  volume: number;
};

type MprisPositionPayload = {
  position: number;
  isPlaying: boolean;
  volume: number;
  seeked?: boolean;
};

type NativeAudioState = {
  available: boolean;
  initialized: boolean;
  loaded: boolean;
  playing: boolean;
  position: number;
  duration: number;
};

type NativeAudioOutputState = {
  success: boolean;
  currentOutputName: string;
  currentOutputId: string;
  isHeadphones: boolean;
  message: string;
};

type NativeSpectrumPair = {
  processed: number[];
  raw: number[];
};

type DspSettings = {
  preampDb?: number;
  outputDevice?: string;
  sampleRate?: string;
  bassBoost: number;
  bassFrequency: number;
  bassMix: number;
  bassBoostEnabled: boolean;
  midGain: number;
  trebleGain: number;
  stereoWidth: number;
  stereoWidenerEnabled?: boolean;
  stereoWidenerCenterLevel?: number;
  stereoWidenerSideLevel?: number;
  stereoWidenerBassToMono?: number;
  balance: number;
  compressor: number;
  limiter: number;
  reverb: number;
  reverbEnabled?: boolean;
  reverbRoomSize?: number;
  reverbWetDry?: number;
  reverbHfRatio?: number;
  reverbInputGain?: number;
  convReverbEnabled?: boolean;
  convReverbMix?: number;
  convReverbPredelay?: number;
  convReverbPreset?: string;
  compressorEnabled?: boolean;
  compressorThreshold?: number;
  compressorRatio?: number;
  compressorAttack?: number;
  compressorRelease?: number;
  compressorMakeupGain?: number;
  autoGainEnabled?: boolean;
  autoGainTargetLevel?: number;
  autoGainMaxGain?: number;
  autoGainSpeed?: string;
  limiterEnabled?: boolean;
  limiterCeiling?: number;
  limiterRelease?: number;
  limiterLookahead?: number;
  limiterGainDb?: number;
  truePeakEnabled?: boolean;
  truePeakCeiling?: number;
  truePeakRelease?: number;
  truePeakLookahead?: number;
  truePeakDrive?: number;
  truePeakOversampling?: number;
  truePeakStereoLink?: boolean;
  exciterEnabled?: boolean;
  exciterFrequency?: number;
  exciterAmount?: number;
  exciterMix?: number;
  exciterHarmonics?: string;
  deesserEnabled?: boolean;
  deesserFrequency?: number;
  deesserThreshold?: number;
  deesserRatio?: number;
  deesserRange?: number;
  echoEnabled?: boolean;
  echoDelay?: number;
  echoFeedback?: number;
  echoMix?: number;
  echoHighCut?: number;
  echoSoftMode?: boolean;
  noiseGateEnabled?: boolean;
  noiseGateThreshold?: number;
  noiseGateAttack?: number;
  noiseGateHold?: number;
  noiseGateRelease?: number;
  noiseGateRange?: number;
  peqEnabled?: boolean;
  peqBands?: Array<{ freq: number; gain: number; q: number }>;
  crossfeedEnabled?: boolean;
  crossfeedLevel?: number;
  crossfeedDelay?: number;
  crossfeedLowCut?: number;
  crossfeedHighCut?: number;
  bassMonoEnabled?: boolean;
  bassMonoCutoff?: number;
  bassMonoSlope?: number;
  bassMonoWidth?: number;
  dynamicEqEnabled?: boolean;
  dynamicEqFrequency?: number;
  dynamicEqQ?: number;
  dynamicEqThreshold?: number;
  dynamicEqGain?: number;
  dynamicEqRange?: number;
  dynamicEqAttack?: number;
  dynamicEqRelease?: number;
  bitDitherEnabled?: boolean;
  bitDepth?: number;
  dither?: number;
  shaping?: number;
  downsample?: number;
  bitDitherMix?: number;
  bitDitherOutputDb?: number;
  tapeSaturationEnabled?: boolean;
  tapeDriveDb?: number;
  tapeMix?: number;
  tapeTone?: number;
  tapeOutputDb?: number;
  tapeMode?: number;
  tapeHiss?: number;
  surroundEnabled?: boolean;
  surroundCenterLevel?: number;
  surroundSideLevel?: number;
  surroundLfeLevel?: number;
  surroundCrossover?: number;
  surroundDelay?: number;
  surroundMix?: number;
};

type SfxBroadcastState = {
  scope?: "music" | "web" | "video";
  effectsEnabled: boolean;
  eqPreset: EqPresetId;
  eqPresetLabel?: string;
  eqGains: number[];
  dspSettings: DspSettings;
};

type SfxEffectId =
  | "audiophile"
  | "eq32"
  | "reverb"
  | "compressor"
  | "limiter"
  | "bassboost"
  | "autogain"
  | "truepeak"
  | "peq"
  | "dynamiceq"
  | "exciter"
  | "deesser"
  | "noisegate"
  | "stereowidener"
  | "echo"
  | "softecho"
  | "convreverb"
  | "crossfeed"
  | "surround"
  | "bassmono"
  | "tapesat"
  | "bitdither";

type SfxParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  value: number;
};

type SfxOption = { key: string; label: string; value: string; options: string[] };

type SfxPanelDefinition = {
  id: SfxEffectId;
  title: string;
  description: string;
  enabled?: boolean;
  params: SfxParam[];
  options?: SfxOption[];
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const railItems: Array<{ id: PageId; labelKey: string; icon: typeof Video }> = [
  { id: "video", labelKey: "rail.video", icon: Video },
  { id: "music", labelKey: "rail.music", icon: Music2 },
  { id: "gallery", labelKey: "rail.gallery", icon: Image },
  { id: "web", labelKey: "rail.web", icon: Globe2 },
];

type MusicViewMode = "list" | "compact" | "comfortable" | "cards";

const musicViewModes: Array<{ id: MusicViewMode; label: string }> = [
  { id: "list", label: "Liste" },
  { id: "compact", label: "Kompakt" },
  { id: "comfortable", label: "Rahat" },
  { id: "cards", label: "Kart" },
];

function isMusicViewMode(value: unknown): value is MusicViewMode {
  return value === "list" || value === "compact" || value === "comfortable" || value === "cards";
}

const frequencies = [
  "20",
  "25",
  "31",
  "40",
  "50",
  "63",
  "80",
  "100",
  "125",
  "160",
  "200",
  "250",
  "315",
  "400",
  "500",
  "630",
  "800",
  "1k",
  "1.25k",
  "1.6k",
  "2k",
  "2.5k",
  "3.15k",
  "4k",
  "5k",
  "6.3k",
  "8k",
  "10k",
  "12.5k",
  "16k",
  "18k",
  "20k",
];

const eqFrequencies = [
  20, 25, 31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000,
  2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 18000, 20000,
];

const effectItems = [
  "Ses Cikisi (Odyofil)",
  "Ekolayci (32-Bantli)",
  "Reverb (BASS FX)",
  "Dinamik Kompresor",
  "Limiter",
  "Bas Guclendirici",
  "Auto Gain / Normalize",
  "True Peak Limiter + Meter",
];

const coverColors = ["#28d7ff", "#ff5d7d", "#ffc857", "#8ee86f", "#8aa6ff", "#e674ff"];
const browserLibraryStorageKey = "ardali_webmedia_library";
const soundEffectsStorageKey = "ardali_webmedia_sound_effects_window";
const soundEffectsCrossfeedAutoKey = "ardali_webmedia_crossfeed_auto_headphones";
const visualizerStorageKey = "ardali_visualizer";
const soundEffectsChannelName = "ardali-sound-effects-sync";

const flatEq = Array.from({ length: eqFrequencies.length }, () => 0);

const eqPresets = {
  flat: {
    label: "Duz (Flat)",
    gains: flatEq,
  },
  bass: {
    label: "Bass Guclu",
    gains: [7, 7, 6, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  },
  rock: {
    label: "Rock",
    gains: [4, 4, 3, 3, 2, 1, 0, -1, -2, -2, -1, 0, 1, 2, 3, 3, 3, 2, 2, 1, 1, 2, 3, 4, 4, 4, 3, 3, 2, 2, 2, 2],
  },
  vocal: {
    label: "Vokal",
    gains: [-2, -2, -2, -1, -1, 0, 0, 1, 2, 2, 3, 3, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, -1, -1, -1, -2, -2, -2, -2, -2],
  },
  cinema: {
    label: "Sinema",
    gains: [5, 5, 5, 4, 4, 3, 2, 1, 0, -1, -1, -1, 0, 1, 2, 2, 2, 1, 1, 0, 0, 1, 2, 3, 4, 4, 5, 5, 4, 4, 3, 3],
  },
  sonyXm4Relaxed: {
    label: "Sony WF-1000XM4 (Relaxed preset)",
    gains: [-3, -1, 1.2, 3.1, 3.8, 2.3, -2.2, -7.3, -12, -12, -12, -12, -12, -12, -12, -11.2, -9, -7.6, -7, -6.6, -5.4, -4.4, -3.8, -2.7, -1.4, -0.3, 0.3, 0.3, -0.3, -1.3, -2.6, -3.7],
  },
} satisfies Record<string, { label: string; gains: number[] }>;

type EqPresetId = keyof typeof eqPresets;

const defaultDspSettings: DspSettings = {
  preampDb: 0,
  outputDevice: "default",
  sampleRate: "auto",
  bassBoost: 0,
  bassFrequency: 80,
  bassMix: 100,
  bassBoostEnabled: false,
  midGain: 0,
  trebleGain: 0,
  stereoWidth: 100,
  stereoWidenerEnabled: false,
  stereoWidenerCenterLevel: 0,
  stereoWidenerSideLevel: 0,
  stereoWidenerBassToMono: 200,
  balance: 0,
  compressor: 0,
  limiter: 0,
  autoGainEnabled: false,
  autoGainTargetLevel: -14,
  autoGainMaxGain: 12,
  autoGainSpeed: "medium",
  limiterLookahead: 5,
  limiterGainDb: 0,
  truePeakEnabled: false,
  truePeakCeiling: -0.1,
  truePeakRelease: 50,
  truePeakLookahead: 5,
  truePeakDrive: 0,
  truePeakOversampling: 4,
  truePeakStereoLink: true,
  exciterEnabled: false,
  exciterFrequency: 3000,
  exciterAmount: 50,
  exciterMix: 30,
  exciterHarmonics: "odd",
  deesserEnabled: false,
  deesserFrequency: 7000,
  deesserThreshold: -30,
  deesserRatio: 4,
  deesserRange: -12,
  noiseGateEnabled: false,
  noiseGateThreshold: -40,
  noiseGateAttack: 5,
  noiseGateHold: 100,
  noiseGateRelease: 150,
  noiseGateRange: -80,
  echoEnabled: false,
  echoDelay: 250,
  echoFeedback: 40,
  echoMix: 30,
  echoHighCut: 8000,
  echoSoftMode: false,
  reverb: 0,
  convReverbEnabled: false,
  convReverbMix: 30,
  convReverbPredelay: 20,
  convReverbPreset: "hall",
  bitDitherEnabled: false,
  bitDepth: 16,
  dither: 2,
  shaping: 0,
  downsample: 1,
  bitDitherMix: 100,
  bitDitherOutputDb: 0,
  tapeSaturationEnabled: false,
  tapeDriveDb: 6,
  tapeMix: 50,
  tapeTone: 50,
  tapeOutputDb: -1,
  tapeMode: 0,
  tapeHiss: 0,
  surroundEnabled: false,
  surroundCenterLevel: 0,
  surroundSideLevel: 0,
  surroundLfeLevel: 0,
  surroundCrossover: 110,
  surroundDelay: 8,
  surroundMix: 75,
};

const sfxPanelPresets: Partial<
  Record<SfxEffectId, Array<{ id: string; label: string; values: Record<string, number | string | boolean> }>>
> = {
  reverb: [
    { id: "smallRoom", label: "Kucuk Oda", values: { roomSize: 500, damping: 0.8, wetDry: -15, hfRatio: 0.5, inputGain: 0 } },
    { id: "largeRoom", label: "Buyuk Oda", values: { roomSize: 1500, damping: 0.5, wetDry: -10, hfRatio: 0.7, inputGain: 0 } },
    { id: "concertHall", label: "Konser Salonu", values: { roomSize: 2500, damping: 0.3, wetDry: -8, hfRatio: 0.8, inputGain: 0 } },
    { id: "cathedral", label: "Katedral", values: { roomSize: 3000, damping: 0.2, wetDry: -6, hfRatio: 0.9, inputGain: 0 } },
    { id: "studioPlate", label: "Studio Plate", values: { roomSize: 900, damping: 0.62, wetDry: -12, hfRatio: 0.75, inputGain: 0 } },
    { id: "arena", label: "Arena", values: { roomSize: 2800, damping: 0.28, wetDry: -7, hfRatio: 0.84, inputGain: 1 } },
    { id: "vocalRoom", label: "Vocal Room", values: { roomSize: 720, damping: 0.68, wetDry: -13, hfRatio: 0.72, inputGain: 0.5 } },
    { id: "ambientWash", label: "Ambient Wash", values: { roomSize: 2200, damping: 0.38, wetDry: -9, hfRatio: 0.86, inputGain: -0.5 } },
    { id: "slapback", label: "Slapback", values: { roomSize: 280, damping: 0.78, wetDry: -18, hfRatio: 0.55, inputGain: 0 } },
    { id: "dreamVox", label: "Dream Vox", values: { roomSize: 1400, damping: 0.46, wetDry: -11, hfRatio: 0.88, inputGain: 0.8 } },
  ],
  compressor: [
    { id: "gentle", label: "Yumusak", values: { threshold: -18, ratio: 2.2, attack: 18, release: 180, makeupGain: 1.5, knee: 5 } },
    { id: "vocal", label: "Vokal", values: { threshold: -24, ratio: 3.2, attack: 8, release: 120, makeupGain: 3, knee: 4 } },
    { id: "night", label: "Gece", values: { threshold: -30, ratio: 4.8, attack: 12, release: 260, makeupGain: 2, knee: 6 } },
    { id: "punch", label: "Guclu", values: { threshold: -16, ratio: 5.5, attack: 4, release: 90, makeupGain: 2.5, knee: 2 } },
    { id: "broadcast", label: "Yayin", values: { threshold: -22, ratio: 6, attack: 3, release: 160, makeupGain: 4, knee: 3 } },
  ],
  limiter: [
    { id: "transparent", label: "Seffaf", values: { ceiling: -1, release: 180, lookahead: 5, gain: 0 } },
    { id: "loud", label: "Yuksek", values: { ceiling: -0.5, release: 90, lookahead: 7, gain: 4 } },
    { id: "streaming", label: "Streaming", values: { ceiling: -1, release: 130, lookahead: 6, gain: 2 } },
    { id: "night", label: "Gece", values: { ceiling: -2, release: 240, lookahead: 8, gain: -1 } },
    { id: "safe", label: "Guvenli", values: { ceiling: -3, release: 180, lookahead: 10, gain: 0 } },
  ],
  bassboost: [{ id: "deep", label: "Deep", values: { frequency: 68, gain: 17.5, harmonics: 14, width: 1.2, mix: 82 } }],
  autogain: [
    { id: "balanced", label: "Balanced", values: { targetLevel: -15, maxGain: 10, speed: "medium" } },
    { id: "night", label: "Night", values: { targetLevel: -20, maxGain: 16, speed: "slow" } },
    { id: "loud", label: "Loud", values: { targetLevel: -12, maxGain: 8, speed: "fast" } },
    { id: "speech", label: "Speech", values: { targetLevel: -14, maxGain: 14, speed: "medium" } },
  ],
  truepeak: [
    { id: "soft", label: "Soft", values: { ceiling: -1.5, release: 120, lookahead: 10, drive: 0.5, oversampling: 4 } },
    { id: "balanced", label: "Balanced", values: { ceiling: -1, release: 70, lookahead: 8, drive: 2, oversampling: 4 } },
    { id: "loud", label: "Loud", values: { ceiling: -1, release: 35, lookahead: 6, drive: 4.5, oversampling: 8 } },
    { id: "spotify", label: "Spotify", values: { ceiling: -1, release: 50, lookahead: 5, drive: 2.5, oversampling: 4 } },
    { id: "youtube", label: "YouTube", values: { ceiling: -1, release: 60, lookahead: 8, drive: 3, oversampling: 4 } },
    { id: "cd", label: "CD Master", values: { ceiling: -0.1, release: 40, lookahead: 10, drive: 1, oversampling: 8 } },
    { id: "broadcast", label: "Broadcast", values: { ceiling: -2, release: 100, lookahead: 12, drive: 4, oversampling: 4 } },
  ],
  peq: [
    { id: "balanced", label: "Balanced", values: { band1Freq: 60, band1Gain: 1.5, band1Q: 0.9, band2Freq: 150, band2Gain: 0.8, band2Q: 1, band3Freq: 400, band3Gain: -0.8, band3Q: 1, band4Freq: 1500, band4Gain: 0.6, band4Q: 1, band5Freq: 5000, band5Gain: 1.4, band5Q: 0.9, band6Freq: 12000, band6Gain: 1.2, band6Q: 0.8 } },
    { id: "bass", label: "Bass", values: { band1Freq: 48, band1Gain: 7.4, band1Q: 0.68, band2Freq: 82, band2Gain: 5.6, band2Q: 0.82, band3Freq: 230, band3Gain: -3.2, band3Q: 1.35, band4Freq: 950, band4Gain: -1.6, band4Q: 1.02, band5Freq: 3200, band5Gain: 0.4, band5Q: 0.95, band6Freq: 9000, band6Gain: 0, band6Q: 0.8 } },
    { id: "vocal", label: "Vocal", values: { band1Freq: 75, band1Gain: -1, band1Q: 0.9, band2Freq: 180, band2Gain: -0.8, band2Q: 1, band3Freq: 420, band3Gain: -1.6, band3Q: 1.1, band4Freq: 2500, band4Gain: 2.8, band4Q: 1.2, band5Freq: 5200, band5Gain: 2, band5Q: 1.1, band6Freq: 12000, band6Gain: 1.4, band6Q: 0.85 } },
    { id: "clarity", label: "Clarity", values: { band1Freq: 70, band1Gain: -1.2, band1Q: 1, band2Freq: 200, band2Gain: -1.5, band2Q: 1.1, band3Freq: 600, band3Gain: -0.8, band3Q: 1.1, band4Freq: 1800, band4Gain: 1.5, band4Q: 1.1, band5Freq: 6500, band5Gain: 2.8, band5Q: 1, band6Freq: 13500, band6Gain: 2.2, band6Q: 0.9 } },
    { id: "warm", label: "Warm", values: { band1Freq: 70, band1Gain: 2.2, band1Q: 0.85, band2Freq: 180, band2Gain: 1.3, band2Q: 1, band3Freq: 450, band3Gain: 0.5, band3Q: 1, band4Freq: 2000, band4Gain: -0.8, band4Q: 1, band5Freq: 5500, band5Gain: -0.9, band5Q: 1, band6Freq: 11000, band6Gain: -0.4, band6Q: 0.8 } },
    { id: "air", label: "Air", values: { band1Freq: 60, band1Gain: -0.6, band1Q: 0.9, band2Freq: 160, band2Gain: -0.4, band2Q: 1, band3Freq: 500, band3Gain: -0.6, band3Q: 1, band4Freq: 2200, band4Gain: 0.9, band4Q: 1, band5Freq: 7000, band5Gain: 1.9, band5Q: 1, band6Freq: 14500, band6Gain: 3.4, band6Q: 0.7 } },
  ],
  dynamiceq: [
    { id: "deharsh", label: "De-harsh", values: { frequency: 4000, q: 2, threshold: -40, gain: -8, range: 12, attack: 5, release: 120 } },
    { id: "demud", label: "De-mud", values: { frequency: 300, q: 1.5, threshold: -35, gain: -6, range: 12, attack: 10, release: 150 } },
    { id: "vocal", label: "Vocal", values: { frequency: 2500, q: 2.5, threshold: -45, gain: 6, range: 10, attack: 3, release: 100 } },
    { id: "deesser", label: "De-esser", values: { frequency: 7000, q: 3, threshold: -40, gain: -10, range: 15, attack: 1, release: 80 } },
    { id: "basstighten", label: "Bass Tighten", values: { frequency: 80, q: 2.5, threshold: -35, gain: -8, range: 12, attack: 10, release: 200 } },
    { id: "air", label: "Air", values: { frequency: 12000, q: 0.7, threshold: -45, gain: 6, range: 10, attack: 5, release: 100 } },
    { id: "drumsnap", label: "Drum Snap", values: { frequency: 5000, q: 2, threshold: -40, gain: 8, range: 12, attack: 1, release: 50 } },
    { id: "warmth", label: "Warmth", values: { frequency: 250, q: 1.2, threshold: -42, gain: 5, range: 10, attack: 15, release: 150 } },
  ],
  exciter: [
    { id: "oddair", label: "Odd Air", values: { frequency: 3200, amount: 65, harmonics: "odd", mix: 45 } },
    { id: "smoothair", label: "Smooth Air", values: { frequency: 2900, amount: 52, harmonics: "odd", mix: 40 } },
    { id: "brightair", label: "Bright Air", values: { frequency: 3600, amount: 58, harmonics: "odd", mix: 48 } },
    { id: "softair", label: "Soft Air", values: { frequency: 2500, amount: 36, harmonics: "odd", mix: 30 } },
  ],
  deesser: [
    { id: "smooth", label: "Smooth", values: { frequency: 7200, threshold: -36, ratio: 6, range: -14 } },
    { id: "demo", label: "Demo", values: { frequency: 8400, threshold: -48, ratio: 9, range: -24 } },
  ],
  noisegate: [
    { id: "stable", label: "Stable", values: { threshold: -44, attack: 12, hold: 160, release: 260, range: -42 } },
    { id: "demo", label: "Demo", values: { threshold: -32, attack: 1, hold: 20, release: 700, range: -96 } },
  ],
  stereowidener: [
    { id: "balanced", label: "Balanced", values: { width: 124, centerLevel: 1, sideLevel: 1.8, bassToMono: 180 } },
    { id: "wide", label: "Wide", values: { width: 156, centerLevel: -1.2, sideLevel: 3.4, bassToMono: 220 } },
    { id: "focus", label: "Focus", values: { width: 110, centerLevel: 2.2, sideLevel: 0.6, bassToMono: 160 } },
  ],
  echo: [
    { id: "clean", label: "Clean", values: { delay: 210, feedback: 22, wetDry: 24, highCut: 7800 } },
    { id: "vocal", label: "Vocal", values: { delay: 140, feedback: 28, wetDry: 20, highCut: 9500 } },
    { id: "space", label: "Space", values: { delay: 360, feedback: 36, wetDry: 34, highCut: 6200 } },
  ],
  softecho: [
    { id: "canyon", label: "Canyon", values: { delay: 520, feedback: 8, wetMix: 28, highCut: 4200 } },
    { id: "cave", label: "Cave", values: { delay: 460, feedback: 18, wetMix: 26, highCut: 3800 } },
    { id: "room", label: "Room", values: { delay: 190, feedback: 12, wetMix: 18, highCut: 6200 } },
    { id: "studio", label: "Studio", values: { delay: 140, feedback: 10, wetMix: 14, highCut: 9200 } },
    { id: "puresoft", label: "Pure Soft", values: { delay: 340, feedback: 14, wetMix: 24, highCut: 4600 } },
    { id: "natural", label: "Natural", values: { delay: 220, feedback: 22, wetMix: 24, highCut: 7000 } },
    { id: "wide", label: "Wide", values: { delay: 310, feedback: 24, wetMix: 20, highCut: 7600 } },
    { id: "cinema", label: "Cinema", values: { delay: 420, feedback: 34, wetMix: 24, highCut: 6000 } },
  ],
  crossfeed: [
    { id: "natural", label: "Dogal", values: { level: 30, delay: 0.3, lowCut: 700, highCut: 4000 } },
    { id: "mild", label: "Yumusak", values: { level: 20, delay: 0.2, lowCut: 800, highCut: 5000 } },
    { id: "strong", label: "Guclu", values: { level: 50, delay: 0.5, lowCut: 600, highCut: 3500 } },
    { id: "wide", label: "Genis", values: { level: 60, delay: 0.7, lowCut: 500, highCut: 3000 } },
    { id: "custom", label: "Ozel", values: {} },
  ],
  surround: [
    { id: "cinema", label: "Cinema", values: { center: 2, surround: 5, lfe: 4, crossover: 110, delay: 12, mix: 82 } },
    { id: "wide", label: "Wide", values: { center: -1, surround: 7, lfe: 1.5, crossover: 120, delay: 18, mix: 78 } },
    { id: "music", label: "Music", values: { center: 1, surround: 3, lfe: 2, crossover: 95, delay: 8, mix: 62 } },
    { id: "night", label: "Night", values: { center: 3, surround: 1.5, lfe: -2, crossover: 85, delay: 6, mix: 58 } },
    { id: "demo", label: "Demo", values: { center: 6, surround: 10, lfe: 8, crossover: 160, delay: 24, mix: 100 } },
  ],
  bassmono: [
    { id: "vinyl", label: "Vinyl", values: { cutoff: 150, slope: 24, stereoWidth: 100 } },
    { id: "club", label: "Club", values: { cutoff: 120, slope: 24, stereoWidth: 120 } },
    { id: "mastering", label: "Mastering", values: { cutoff: 80, slope: 48, stereoWidth: 100 } },
    { id: "dj", label: "DJ", values: { cutoff: 100, slope: 24, stereoWidth: 110 } },
    { id: "sub", label: "Sub", values: { cutoff: 60, slope: 48, stereoWidth: 150 } },
  ],
  tapesat: [
    { id: "subtle", label: "Subtle", values: { driveDb: 4, mix: 35, tone: 45, outputDb: 0, mode: "Warm", hiss: 0 } },
    { id: "lofi", label: "Lo-fi", values: { driveDb: 8, mix: 45, tone: 35, outputDb: -3, mode: "Hot", hiss: 6 } },
    { id: "glue", label: "Glue", values: { driveDb: 6, mix: 40, tone: 55, outputDb: -1, mode: "Tape", hiss: 0 } },
    { id: "crisp", label: "Crisp", values: { driveDb: 5, mix: 35, tone: 70, outputDb: 0, mode: "Tape", hiss: 0 } },
  ],
  bitdither: [
    { id: "cd16", label: "CD 16", values: { bitDepth: 16, dither: 2, shaping: 1, downsample: 1, mix: 100, outputDb: 0 } },
    { id: "retro12", label: "Retro 12", values: { bitDepth: 12, dither: 2, shaping: 0, downsample: 2, mix: 100, outputDb: -1 } },
    { id: "game8", label: "Game 8", values: { bitDepth: 8, dither: 1, shaping: 0, downsample: 8, mix: 100, outputDb: -2 } },
    { id: "vinyl", label: "Vinyl", values: { bitDepth: 12, dither: 2, shaping: 0, downsample: 4, mix: 70, outputDb: 0 } },
    { id: "hardcrush", label: "Hard Crush", values: { bitDepth: 6, dither: 0, shaping: 0, downsample: 8, mix: 100, outputDb: -4 } },
    { id: "crunch", label: "Crunch", values: { bitDepth: 4, dither: 0, shaping: 0, downsample: 16, mix: 100, outputDb: -6 } },
    { id: "podcast", label: "Podcast", values: { bitDepth: 16, dither: 2, shaping: 1, downsample: 1, mix: 65, outputDb: 1 } },
    { id: "radio", label: "Radio", values: { bitDepth: 10, dither: 1, shaping: 0, downsample: 4, mix: 85, outputDb: -1.5 } },
  ],
};

const graphicEqQ = 4.318;

const sfxSidebarGroups: Array<Array<{ id: SfxEffectId; label: string }>> = [
  [{ id: "audiophile", label: "Ses Cikisi (Odyofil)" }],
  [
    { id: "eq32", label: "Ekolayci (32-Bantli)" },
    { id: "reverb", label: "Reverb (BASS FX)" },
    { id: "compressor", label: "Dinamik Kompresor" },
    { id: "limiter", label: "Limiter" },
    { id: "bassboost", label: "Bas Guclendirici" },
    { id: "autogain", label: "Auto Gain / Normalize" },
    { id: "truepeak", label: "True Peak Limiter + Meter" },
  ],
  [
    { id: "peq", label: "Parametrik EQ (PEQ)" },
    { id: "dynamiceq", label: "Dynamic EQ" },
    { id: "exciter", label: "Netlestirici (Exciter)" },
    { id: "deesser", label: "De-esser" },
    { id: "noisegate", label: "Akilli Noise Gate" },
  ],
  [
    { id: "stereowidener", label: "Stereo Widener v2" },
    { id: "echo", label: "Echo (Yanki)" },
    { id: "softecho", label: "Saf Echo (Soft)" },
    { id: "convreverb", label: "Konvolusyon Reverb (IR)" },
    { id: "crossfeed", label: "Crossfeed (Kulaklik)" },
    { id: "surround", label: "Surround (5.1/7.1)" },
  ],
  [
    { id: "bassmono", label: "Bass Mono" },
    { id: "tapesat", label: "Tape Saturation" },
    { id: "bitdither", label: "Bit-depth / Dither" },
  ],
];

const sfxPanelDefaults: Record<SfxEffectId, SfxPanelDefinition> = {
  audiophile: {
    id: "audiophile",
    title: "Ses Cikisi (Odyofil)",
    description: "Sistem mikseri, cikis cihazi, sample rate ve preamp davranisini yonetir.",
    params: [{ key: "preamp", label: "Ana Kazanc", min: -24, max: 24, step: 0.5, value: 0, unit: " dB" }],
    options: [
      { key: "outputDevice", label: "Cikis Cihazi", value: "default", options: ["default", "alsa direct", "wasapi exclusive"] },
      { key: "sampleRate", label: "Sample Rate", value: "auto", options: ["auto", "44100", "48000", "96000", "192000"] },
    ],
  },
  eq32: {
    id: "eq32",
    title: "32-Bantli Profesyonel Ekolayzir",
    description: "Hassas frekans kontrolu, ton tekerlekleri, stereo genislik ve balans.",
    params: [
      { key: "bass", label: "Bass", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "mid", label: "Mid", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "treble", label: "Treble", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "stereoExpander", label: "Stereo", min: 0, max: 200, step: 1, value: 100, unit: "%" },
      { key: "balance", label: "Balance", min: -100, max: 100, step: 1, value: 0 },
    ],
    options: [{ key: "acousticSpace", label: "Akustik Alan", value: "off", options: ["off", "small", "medium", "large", "hall"] }],
  },
  reverb: {
    id: "reverb",
    title: "Reverb (BASS FX)",
    description: "Oda boyutu, damping, islak/kuru oran ve giris kazanci.",
    enabled: false,
    params: [
      { key: "roomSize", label: "Room Size", min: 0, max: 3000, step: 10, value: 1000, unit: " ms" },
      { key: "damping", label: "Damping", min: 0, max: 1, step: 0.01, value: 0.5 },
      { key: "wetDry", label: "Wet/Dry", min: -60, max: 0, step: 0.5, value: -10, unit: " dB" },
      { key: "hfRatio", label: "HF Ratio", min: 0, max: 1, step: 0.01, value: 0.7 },
      { key: "inputGain", label: "Input Gain", min: -24, max: 24, step: 0.5, value: 0, unit: " dB" },
    ],
  },
  compressor: {
    id: "compressor",
    title: "Dinamik Kompresor",
    description: "Threshold, ratio, attack, release, makeup gain ve knee ayarlari.",
    enabled: false,
    params: [
      { key: "threshold", label: "Threshold", min: -60, max: 0, step: 0.5, value: -20, unit: " dB" },
      { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, value: 4, unit: ":1" },
      { key: "attack", label: "Attack", min: 1, max: 200, step: 1, value: 10, unit: " ms" },
      { key: "release", label: "Release", min: 10, max: 1000, step: 5, value: 100, unit: " ms" },
      { key: "makeupGain", label: "Makeup", min: -12, max: 24, step: 0.5, value: 0, unit: " dB" },
      { key: "knee", label: "Knee", min: 0, max: 24, step: 0.5, value: 3, unit: " dB" },
    ],
  },
  limiter: {
    id: "limiter",
    title: "Limiter",
    description: "Tepe kontrolu, lookahead ve cikis tavan seviyesi.",
    enabled: false,
    params: [
      { key: "ceiling", label: "Ceiling", min: -12, max: 0, step: 0.1, value: -0.3, unit: " dB" },
      { key: "release", label: "Release", min: 5, max: 500, step: 5, value: 50, unit: " ms" },
      { key: "lookahead", label: "Lookahead", min: 0, max: 20, step: 0.5, value: 5, unit: " ms" },
      { key: "gain", label: "Gain", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
    ],
  },
  bassboost: {
    id: "bassboost",
    title: "Bas Guclendirici",
    description: "Alt frekans agirligi, harmonik miktari, genislik ve miks.",
    enabled: false,
    params: [
      { key: "frequency", label: "Frekans", min: 35, max: 220, step: 1, value: 80, unit: " Hz" },
      { key: "gain", label: "Gain", min: 0, max: 18, step: 0.5, value: 6, unit: " dB" },
      { key: "harmonics", label: "Harmonics", min: 0, max: 100, step: 1, value: 50, unit: "%" },
      { key: "width", label: "Width", min: 0.2, max: 3, step: 0.05, value: 1.5 },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, value: 50, unit: "%" },
    ],
  },
  autogain: {
    id: "autogain",
    title: "Auto Gain / Normalize",
    description: "Hedef loudness, maksimum kazanc ve tepki hizi.",
    enabled: false,
    params: [
      { key: "targetLevel", label: "Target", min: -24, max: -6, step: 0.5, value: -14, unit: " LUFS" },
      { key: "maxGain", label: "Max Gain", min: 0, max: 24, step: 0.5, value: 12, unit: " dB" },
    ],
    options: [{ key: "speed", label: "Hiz", value: "medium", options: ["slow", "medium", "fast"] }],
  },
  truepeak: {
    id: "truepeak",
    title: "True Peak Limiter + Meter",
    description: "Oversampling, drive, ceiling ve kanal baglama.",
    enabled: false,
    params: [
      { key: "ceiling", label: "Ceiling", min: -6, max: 0, step: 0.1, value: -0.1, unit: " dBTP" },
      { key: "release", label: "Release", min: 5, max: 500, step: 5, value: 50, unit: " ms" },
      { key: "lookahead", label: "Lookahead", min: 0, max: 20, step: 0.5, value: 5, unit: " ms" },
      { key: "drive", label: "Drive", min: 0, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "oversampling", label: "Oversampling", min: 1, max: 8, step: 1, value: 4, unit: "x" },
    ],
    options: [{ key: "stereoLink", label: "Stereo Link", value: "on", options: ["on", "off"] }],
  },
  peq: {
    id: "peq",
    title: "Parametrik EQ (PEQ)",
    description: "Alti bant parametrik frekans, Q ve gain kontrolu.",
    enabled: false,
    params: [
      { key: "band1Freq", label: "Band 1 Freq", min: 20, max: 200, step: 1, value: 60, unit: " Hz" },
      { key: "band1Gain", label: "Band 1 Gain", min: -15, max: 15, step: 0.5, value: 0, unit: " dB" },
      { key: "band1Q", label: "Band 1 Q", min: 0.1, max: 10, step: 0.1, value: 1 },
      { key: "band2Freq", label: "Band 2 Freq", min: 50, max: 500, step: 1, value: 150, unit: " Hz" },
      { key: "band2Gain", label: "Band 2 Gain", min: -15, max: 15, step: 0.5, value: 0, unit: " dB" },
      { key: "band2Q", label: "Band 2 Q", min: 0.1, max: 10, step: 0.1, value: 1 },
      { key: "band3Freq", label: "Band 3 Freq", min: 200, max: 2000, step: 5, value: 400, unit: " Hz" },
      { key: "band3Gain", label: "Band 3 Gain", min: -15, max: 15, step: 0.5, value: 0, unit: " dB" },
      { key: "band3Q", label: "Band 3 Q", min: 0.1, max: 10, step: 0.1, value: 1 },
      { key: "band4Freq", label: "Band 4 Freq", min: 500, max: 5000, step: 10, value: 1500, unit: " Hz" },
      { key: "band4Gain", label: "Band 4 Gain", min: -15, max: 15, step: 0.5, value: 0, unit: " dB" },
      { key: "band4Q", label: "Band 4 Q", min: 0.1, max: 10, step: 0.1, value: 1 },
      { key: "band5Freq", label: "Band 5 Freq", min: 2000, max: 10000, step: 10, value: 5000, unit: " Hz" },
      { key: "band5Gain", label: "Band 5 Gain", min: -15, max: 15, step: 0.5, value: 0, unit: " dB" },
      { key: "band5Q", label: "Band 5 Q", min: 0.1, max: 10, step: 0.1, value: 1 },
      { key: "band6Freq", label: "Band 6 Freq", min: 5000, max: 20000, step: 10, value: 12000, unit: " Hz" },
      { key: "band6Gain", label: "Band 6 Gain", min: -15, max: 15, step: 0.5, value: 0, unit: " dB" },
      { key: "band6Q", label: "Band 6 Q", min: 0.1, max: 10, step: 0.1, value: 1 },
    ],
  },
  dynamiceq: {
    id: "dynamiceq",
    title: "Dynamic EQ",
    description: "Esik kontrollu dinamik frekans azaltma/artirma.",
    enabled: false,
    params: [
      { key: "frequency", label: "Frekans", min: 80, max: 12000, step: 10, value: 3500, unit: " Hz" },
      { key: "q", label: "Q", min: 0.2, max: 10, step: 0.1, value: 2 },
      { key: "threshold", label: "Threshold", min: -80, max: 0, step: 0.5, value: -40, unit: " dB" },
      { key: "gain", label: "Gain", min: -18, max: 18, step: 0.5, value: -6, unit: " dB" },
      { key: "range", label: "Range", min: 0, max: 24, step: 0.5, value: 12, unit: " dB" },
      { key: "attack", label: "Attack", min: 1, max: 100, step: 1, value: 5, unit: " ms" },
      { key: "release", label: "Release", min: 10, max: 500, step: 5, value: 120, unit: " ms" },
    ],
  },
  exciter: {
    id: "exciter",
    title: "Netlestirici (Exciter)",
    description: "Ust harmonikler ve parlaklik miks kontrolu.",
    enabled: false,
    params: [
      { key: "frequency", label: "Frekans", min: 1000, max: 12000, step: 50, value: 3000, unit: " Hz" },
      { key: "amount", label: "Amount", min: 0, max: 100, step: 1, value: 50, unit: "%" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, value: 30, unit: "%" },
    ],
    options: [{ key: "harmonics", label: "Harmonics", value: "odd", options: ["odd", "even", "mixed"] }],
  },
  deesser: {
    id: "deesser",
    title: "De-esser",
    description: "Sert sibilanslari yumusatmak icin frekans ve threshold.",
    enabled: false,
    params: [
      { key: "frequency", label: "Frekans", min: 3000, max: 12000, step: 50, value: 7000, unit: " Hz" },
      { key: "threshold", label: "Threshold", min: -60, max: 0, step: 0.5, value: -30, unit: " dB" },
      { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, value: 4, unit: ":1" },
      { key: "range", label: "Range", min: -24, max: 0, step: 0.5, value: -12, unit: " dB" },
    ],
  },
  noisegate: {
    id: "noisegate",
    title: "Akilli Noise Gate",
    description: "Arka plan gurultusunu esik, hold ve release ile azaltir.",
    enabled: false,
    params: [
      { key: "threshold", label: "Threshold", min: -90, max: 0, step: 0.5, value: -40, unit: " dB" },
      { key: "attack", label: "Attack", min: 1, max: 100, step: 1, value: 5, unit: " ms" },
      { key: "hold", label: "Hold", min: 0, max: 500, step: 5, value: 100, unit: " ms" },
      { key: "release", label: "Release", min: 10, max: 1000, step: 5, value: 150, unit: " ms" },
      { key: "range", label: "Range", min: -100, max: 0, step: 1, value: -80, unit: " dB" },
    ],
  },
  stereowidener: {
    id: "stereowidener",
    title: "Stereo Widener v2",
    description: "Merkez/yan seviye, bass mono ve stereo genislik.",
    enabled: false,
    params: [
      { key: "width", label: "Width", min: 0, max: 220, step: 1, value: 100, unit: "%" },
      { key: "centerLevel", label: "Center", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "sideLevel", label: "Side", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "bassToMono", label: "Bass Mono", min: 40, max: 400, step: 5, value: 200, unit: " Hz" },
    ],
  },
  echo: {
    id: "echo",
    title: "Echo (Yanki)",
    description: "Delay, feedback, wet/dry ve high-cut kontrolu.",
    enabled: false,
    params: [
      { key: "delay", label: "Delay", min: 40, max: 1600, step: 5, value: 250, unit: " ms" },
      { key: "feedback", label: "Feedback", min: 0, max: 95, step: 1, value: 40, unit: "%" },
      { key: "wetDry", label: "Wet/Dry", min: 0, max: 100, step: 1, value: 30, unit: "%" },
      { key: "highCut", label: "High Cut", min: 800, max: 18000, step: 100, value: 8000, unit: " Hz" },
    ],
  },
  softecho: {
    id: "softecho",
    title: "Saf Echo (Soft)",
    description: "Daha yumusak atmosferik echo ayarlari.",
    enabled: false,
    params: [
      { key: "delay", label: "Delay", min: 80, max: 1800, step: 5, value: 520, unit: " ms" },
      { key: "feedback", label: "Feedback", min: 0, max: 60, step: 1, value: 8, unit: "%" },
      { key: "wetMix", label: "Wet Mix", min: 0, max: 100, step: 1, value: 28, unit: "%" },
      { key: "highCut", label: "High Cut", min: 800, max: 12000, step: 100, value: 4200, unit: " Hz" },
    ],
  },
  convreverb: {
    id: "convreverb",
    title: "Konvolusyon Reverb (IR)",
    description: "Impuls yanitli mekan hissi, predelay ve mix.",
    enabled: false,
    params: [
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, value: 30, unit: "%" },
      { key: "predelay", label: "Predelay", min: 0, max: 120, step: 1, value: 20, unit: " ms" },
    ],
    options: [{ key: "preset", label: "IR Preset", value: "hall", options: ["hall", "room", "plate", "cathedral"] }],
  },
  crossfeed: {
    id: "crossfeed",
    title: "Crossfeed (Kulaklik)",
    description: "Kulaklikta daha dogal stereo sahne icin kanal sızıntisi.",
    enabled: false,
    params: [
      { key: "level", label: "Level", min: 0, max: 100, step: 1, value: 30, unit: "%" },
      { key: "delay", label: "Delay", min: 0, max: 1.5, step: 0.05, value: 0.3, unit: " ms" },
      { key: "lowCut", label: "Low Cut", min: 80, max: 1600, step: 10, value: 700, unit: " Hz" },
      { key: "highCut", label: "High Cut", min: 1000, max: 9000, step: 50, value: 4000, unit: " Hz" },
      { key: "abSpeedMs", label: "A/B Speed", min: 200, max: 3000, step: 50, value: 1000, unit: " ms" },
    ],
  },
  surround: {
    id: "surround",
    title: "Surround (5.1/7.1)",
    description: "Merkez, surround, LFE, crossover, delay ve mix ayarlari.",
    enabled: false,
    params: [
      { key: "center", label: "Center", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "surround", label: "Surround", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "lfe", label: "LFE", min: -12, max: 12, step: 0.5, value: 0, unit: " dB" },
      { key: "crossover", label: "Crossover", min: 40, max: 220, step: 5, value: 110, unit: " Hz" },
      { key: "delay", label: "Delay", min: 0, max: 30, step: 1, value: 8, unit: " ms" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, value: 75, unit: "%" },
    ],
  },
  bassmono: {
    id: "bassmono",
    title: "Bass Mono",
    description: "Alt frekansi mono yaparak merkezde sabit tutar.",
    enabled: false,
    params: [
      { key: "cutoff", label: "Cutoff", min: 40, max: 300, step: 5, value: 120, unit: " Hz" },
      { key: "slope", label: "Slope", min: 6, max: 48, step: 6, value: 24, unit: " dB/oct" },
      { key: "stereoWidth", label: "Stereo Width", min: 0, max: 200, step: 1, value: 100, unit: "%" },
    ],
  },
  tapesat: {
    id: "tapesat",
    title: "Tape Saturation",
    description: "Analog bant doygunlugu, ton, hiss ve cikis seviyesi.",
    enabled: false,
    params: [
      { key: "driveDb", label: "Drive", min: 0, max: 24, step: 0.5, value: 6, unit: " dB" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, value: 50, unit: "%" },
      { key: "tone", label: "Tone", min: 0, max: 100, step: 1, value: 50, unit: "%" },
      { key: "outputDb", label: "Output", min: -12, max: 6, step: 0.5, value: -1, unit: " dB" },
      { key: "hiss", label: "Hiss", min: 0, max: 20, step: 1, value: 0, unit: "%" },
    ],
    options: [{ key: "mode", label: "Mode", value: "Tape", options: ["Tape", "Warm", "Hot"] }],
  },
  bitdither: {
    id: "bitdither",
    title: "Bit-depth / Dither",
    description: "Bit derinligi, dither, noise shaping ve downsample.",
    enabled: false,
    params: [
      { key: "bitDepth", label: "Bit Depth", min: 4, max: 24, step: 1, value: 16, unit: " bit" },
      { key: "dither", label: "Dither", min: 0, max: 2, step: 1, value: 2 },
      { key: "shaping", label: "Shaping", min: 0, max: 1, step: 1, value: 0 },
      { key: "downsample", label: "Downsample", min: 1, max: 16, step: 1, value: 1, unit: "x" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, value: 100, unit: "%" },
      { key: "outputDb", label: "Output", min: -12, max: 6, step: 0.5, value: 0, unit: " dB" },
    ],
  },
};

const eqAcousticSpacePresets: Record<string, Record<string, number>> = {
  off: { bass: 0, mid: 0, treble: 0, stereoExpander: 100 },
  small: { bass: -2, mid: 1.5, treble: 1, stereoExpander: 78 },
  medium: { bass: 1.5, mid: 0, treble: 0.5, stereoExpander: 108 },
  large: { bass: 3, mid: -1, treble: 1.5, stereoExpander: 135 },
  hall: { bass: 4, mid: -2, treble: 3, stereoExpander: 165 },
};

function isEqPresetId(value: unknown): value is EqPresetId {
  return typeof value === "string" && value in eqPresets;
}

function getSoundEffectsWindowTitle(scope: string, language: AppLanguage = "tr-TR") {
  return formatLabel(tr(language, "sfx.windowTitle"), { scope: tr(language, `sfx.scope.${normalizeSfxScope(scope)}`) });
}

function isSoundEffectsView() {
  return new URLSearchParams(window.location.search).get("view") === "sound-effects";
}

function isVisualizerView() {
  return new URLSearchParams(window.location.search).get("view") === "projectm";
}

function isEqPresetsView() {
  return new URLSearchParams(window.location.search).get("view") === "eq-presets";
}

function isSettingsView() {
  return new URLSearchParams(window.location.search).get("view") === "settings";
}

function normalizeSfxScope(value: unknown): "music" | "web" | "video" {
  return value === "web" || value === "video" || value === "music" ? value : "music";
}

function scopedSoundEffectsStorageKey(scope: "music" | "web" | "video") {
  return scope === "music" ? soundEffectsStorageKey : `${soundEffectsStorageKey}_${scope}`;
}

function cloneSfxDefinitions() {
  return Object.fromEntries(
    Object.entries(sfxPanelDefaults).map(([id, panel]) => [
      id,
      {
        ...panel,
        params: panel.params.map((param) => ({ ...param })),
        options: panel.options?.map((option) => ({ ...option, options: [...option.options] })),
      },
    ]),
  ) as Record<SfxEffectId, SfxPanelDefinition>;
}

function loadSoundEffectsState(scope: "music" | "web" | "video" = "music") {
  try {
    const saved = JSON.parse(localStorage.getItem(scopedSoundEffectsStorageKey(scope)) || "{}") as {
      masterEnabled?: boolean;
      currentEffect?: SfxEffectId;
      panels?: Partial<Record<SfxEffectId, SfxPanelDefinition>>;
      broadcast?: Partial<SfxBroadcastState>;
    };
    const panels = cloneSfxDefinitions();
    Object.entries(saved.panels || {}).forEach(([id, savedPanel]) => {
      if (!savedPanel || !(id in panels)) return;
      const panelId = id as SfxEffectId;
      panels[panelId] = {
        ...panels[panelId],
        enabled: typeof savedPanel.enabled === "boolean" ? savedPanel.enabled : panels[panelId].enabled,
        params: panels[panelId].params.map((param) => {
          const savedParam = savedPanel.params?.find((item) => item.key === param.key);
          if (typeof savedParam?.value !== "number") return param;
          const clamped = Math.max(param.min, Math.min(param.max, savedParam.value));
          const stepped = Number((Math.round(clamped / param.step) * param.step).toFixed(3));
          return { ...param, value: stepped };
        }),
        options: panels[panelId].options?.map((option) => {
          const savedOption = savedPanel.options?.find((item) => item.key === option.key);
          return savedOption?.value ? { ...option, value: savedOption.value } : option;
        }),
      };
    });

    return {
      masterEnabled: typeof saved.masterEnabled === "boolean" ? saved.masterEnabled : true,
      currentEffect: saved.currentEffect && saved.currentEffect in panels ? saved.currentEffect : ("eq32" as SfxEffectId),
      panels,
      broadcast: saved.broadcast ? { ...saved.broadcast, scope } : undefined,
    };
  } catch {
    return {
      masterEnabled: true,
      currentEffect: "eq32" as SfxEffectId,
      panels: cloneSfxDefinitions(),
      broadcast: undefined,
    };
  }
}

function getPanelParam(panel: SfxPanelDefinition, key: string) {
  return panel.params.find((param) => param.key === key)?.value ?? 0;
}

function getPanelOption(panel: SfxPanelDefinition, key: string) {
  return panel.options?.find((option) => option.key === key)?.value ?? "";
}

function tapeModeValue(panel: SfxPanelDefinition) {
  const mode = getPanelOption(panel, "mode").toLowerCase();
  if (mode === "warm") return 1;
  if (mode === "hot") return 2;
  return 0;
}

function panelPeqBands(panel: SfxPanelDefinition) {
  return Array.from({ length: 6 }, (_, index) => {
    const band = index + 1;
    return {
      freq: getPanelParam(panel, `band${band}Freq`),
      gain: getPanelParam(panel, `band${band}Gain`),
      q: getPanelParam(panel, `band${band}Q`),
    };
  });
}

function dbToLinear(db: number) {
  return Math.pow(10, db / 20);
}

function makeExciterCurve(mode: string, amountPercent: number) {
  const amount = Math.max(0, Math.min(100, Number(amountPercent) || 0));
  const norm = amount / 100;
  const n = 1024;
  const curve = new Float32Array(n);
  const drive = 1 + norm * 5;
  const curveMode = ["odd", "even", "mixed", "tape", "tube"].includes(mode) ? mode : "odd";
  for (let index = 0; index < n; index += 1) {
    const x = (index * 2) / (n - 1) - 1;
    const odd = Math.tanh(drive * x) / Math.tanh(drive);
    const evenShape = (x * (1 - (0.12 + norm * 0.5))) + (x * x * Math.sign(x) * (0.12 + norm * 0.5));
    const tape = (Math.tanh((1 + norm * 2.8) * x) / Math.tanh(1 + norm * 2.8)) * 0.68 + (x / (1 + Math.abs(x) * (0.25 + norm * 0.6))) * 0.32;
    const tube = Math.tanh((1 + norm * 4.2) * x) / Math.tanh(1 + norm * 4.2);
    const shaped = curveMode === "even" ? evenShape : curveMode === "mixed" ? odd * 0.65 + evenShape * 0.35 : curveMode === "tape" ? tape : curveMode === "tube" ? tube : odd;
    const blend = 0.02 + norm * 0.2;
    curve[index] = x * (1 - blend) + shaped * blend;
  }
  return curve;
}

function updateExciterGraph(graph: AudioGraph, settings: DspSettings, active: boolean, immediate = false) {
  const now = graph.context.currentTime;
  const enabled = active && settings.exciterEnabled === true;
  const frequency = Math.max(1000, Math.min(12000, Number(settings.exciterFrequency) || 3000));
  const amount = Math.max(0, Math.min(100, Number(settings.exciterAmount) || 0));
  const mix = Math.max(0, Math.min(100, Number(settings.exciterMix) || 0)) / 100;
  const mode = String(settings.exciterHarmonics || "odd").toLowerCase();
  const drive = enabled ? 1 + (amount / 100) * 2 : 1;
  const dryGain = enabled ? Math.max(0.55, 1 - mix * 0.7) : 1;
  const wetGain = enabled ? Math.min(0.7, mix * 0.85) : 0;
  const toneFrequency = enabled ? Math.max(2200, Math.min(14000, frequency * 1.9)) : 12000;
  if (immediate) {
    graph.exciterHighpass.frequency.setValueAtTime(frequency, now);
    graph.exciterDrive.gain.setValueAtTime(drive, now);
    graph.exciterTone.frequency.setValueAtTime(toneFrequency, now);
    graph.exciterDryGain.gain.setValueAtTime(dryGain, now);
    graph.exciterWetGain.gain.setValueAtTime(wetGain, now);
  } else {
    graph.exciterHighpass.frequency.setTargetAtTime(frequency, now, 0.025);
    graph.exciterDrive.gain.setTargetAtTime(drive, now, 0.02);
    graph.exciterTone.frequency.setTargetAtTime(toneFrequency, now, 0.025);
    graph.exciterDryGain.gain.setTargetAtTime(dryGain, now, 0.025);
    graph.exciterWetGain.gain.setTargetAtTime(wetGain, now, 0.025);
  }
  const curveAmount = enabled ? amount : 0;
  const curveKey = `${mode}:${curveAmount.toFixed(1)}`;
  if (graph.exciterCurveKey !== curveKey) {
    graph.exciterShaper.curve = makeExciterCurve(mode, curveAmount);
    graph.exciterCurveKey = curveKey;
  }
}

function updateDeesserGraph(graph: AudioGraph, settings: DspSettings, active: boolean, immediate = false) {
  const now = graph.context.currentTime;
  const enabled = active && settings.deesserEnabled === true;
  const frequency = Math.max(2000, Math.min(12000, Number(settings.deesserFrequency) || 7000));
  const threshold = Math.max(-60, Math.min(0, Number(settings.deesserThreshold) || -30));
  const ratio = Math.max(1, Math.min(20, Number(settings.deesserRatio) || 4));
  const range = Math.max(-24, Math.min(0, Number(settings.deesserRange) || -12));
  const thresholdStrength = Math.max(0, Math.min(1, (-threshold) / 60));
  const ratioStrength = Math.max(0, Math.min(1, (ratio - 1) / 19));
  const staticReduction = enabled ? range * Math.max(0.18, thresholdStrength * 0.65 + ratioStrength * 0.35) : 0;
  graph.deesserFilter.type = "peaking";
  if (immediate) {
    graph.deesserFilter.frequency.setValueAtTime(frequency, now);
    graph.deesserFilter.Q.setValueAtTime(4.0, now);
    graph.deesserFilter.gain.setValueAtTime(staticReduction, now);
  } else {
    graph.deesserFilter.frequency.setTargetAtTime(frequency, now, 0.025);
    graph.deesserFilter.Q.setTargetAtTime(4.0, now, 0.025);
    graph.deesserFilter.gain.setTargetAtTime(staticReduction, now, 0.025);
  }
}

function outputGainWithPreamp(volume: number, settings: DspSettings) {
  const preampDb = Math.max(-24, Math.min(24, Number(settings.preampDb) || 0));
  return Math.max(0, Math.min(4, volume * dbToLinear(preampDb)));
}

function bassHeadroomDb(eqGains: number[], bassGain: number, bassMix: number) {
  const lowWeights = [1, 0.98, 0.94, 0.88, 0.78, 0.64, 0.48, 0.32];
  const lowEqLift = lowWeights.reduce((sum, weight, index) => {
    return sum + Math.max(0, Number(eqGains[index]) || 0) * weight;
  }, 0) / lowWeights.length;
  const effectiveBass = Math.max(0, Number(bassGain) || 0) * (Math.max(0, Math.min(100, Number(bassMix) || 0)) / 100);
  const trimDb = effectiveBass * 0.18 + lowEqLift * 0.42;
  return Math.max(0, Math.min(3.2, trimDb));
}

function buildBroadcastFromSfx(panels: Record<SfxEffectId, SfxPanelDefinition>, masterEnabled: boolean): SfxBroadcastState {
  return buildBroadcastFromSfxState(panels, masterEnabled, flatEq, "flat");
}

function buildBroadcastFromSfxState(
  panels: Record<SfxEffectId, SfxPanelDefinition>,
  masterEnabled: boolean,
  eqGains: number[],
  eqPreset: EqPresetId,
  eqPresetLabel = eqPresets[eqPreset]?.label,
): SfxBroadcastState {
  const audiophilePanel = panels.audiophile;
  const eqPanel = panels.eq32;
  const reverbPanel = panels.reverb;
  const compressorPanel = panels.compressor;
  const autoGainPanel = panels.autogain;
  const limiterPanel = panels.limiter;
  const truePeakPanel = panels.truepeak;
  const bassPanel = panels.bassboost;
  const widenerPanel = panels.stereowidener;
  const echoPanel = panels.echo;
  const softEchoPanel = panels.softecho;
  const convReverbPanel = panels.convreverb;
  const noiseGatePanel = panels.noisegate;
  const peqPanel = panels.peq;
  const crossfeedPanel = panels.crossfeed;
  const bassMonoPanel = panels.bassmono;
  const dynamicEqPanel = panels.dynamiceq;
  const exciterPanel = panels.exciter;
  const deesserPanel = panels.deesser;
  const bitDitherPanel = panels.bitdither;
  const tapePanel = panels.tapesat;
  const surroundPanel = panels.surround;
  const moduleBassGain = getPanelParam(eqPanel, "bass");
  const bassBoostActive = bassPanel.enabled === true || moduleBassGain > 0.01;
  const bassGain = bassPanel.enabled ? getPanelParam(bassPanel, "gain") : Math.max(0, moduleBassGain);
  const bassMix = bassPanel.enabled ? getPanelParam(bassPanel, "mix") : 72;
  const preampDb = getPanelParam(audiophilePanel, "preamp") - bassHeadroomDb(eqGains, bassGain, bassMix);
  const activeReverbMix = Math.max(
    reverbPanel.enabled ? Math.min(0.55, Math.max(0, (getPanelParam(reverbPanel, "wetDry") + 60) / 120)) : 0,
    echoPanel.enabled ? Math.min(0.48, Math.max(0, getPanelParam(echoPanel, "wetDry") / 210)) : 0,
    softEchoPanel.enabled ? Math.min(0.4, Math.max(0, getPanelParam(softEchoPanel, "wetMix") / 250)) : 0,
  );

  return {
    effectsEnabled: masterEnabled,
    eqPreset,
    eqPresetLabel,
    eqGains: normalizedEqBands(eqGains),
    dspSettings: {
      preampDb,
      outputDevice: getPanelOption(audiophilePanel, "outputDevice") || "default",
      sampleRate: getPanelOption(audiophilePanel, "sampleRate") || "auto",
      bassBoost: bassPanel.enabled ? bassGain : moduleBassGain,
      bassFrequency: bassPanel.enabled ? getPanelParam(bassPanel, "frequency") : 100,
      bassMix,
      bassBoostEnabled: bassBoostActive,
      midGain: getPanelParam(eqPanel, "mid"),
      trebleGain: getPanelParam(eqPanel, "treble"),
      stereoWidth: widenerPanel.enabled ? getPanelParam(widenerPanel, "width") : getPanelParam(eqPanel, "stereoExpander"),
      stereoWidenerEnabled: widenerPanel.enabled === true,
      stereoWidenerCenterLevel: getPanelParam(widenerPanel, "centerLevel"),
      stereoWidenerSideLevel: getPanelParam(widenerPanel, "sideLevel"),
      stereoWidenerBassToMono: getPanelParam(widenerPanel, "bassToMono"),
      balance: getPanelParam(eqPanel, "balance"),
      compressor: compressorPanel.enabled ? Math.min(1, Math.max(0, getPanelParam(compressorPanel, "ratio") / 20)) : 0,
      limiter: limiterPanel.enabled ? getPanelParam(limiterPanel, "ceiling") : 0,
      reverb: activeReverbMix,
      reverbEnabled: reverbPanel.enabled === true,
      reverbRoomSize: getPanelParam(reverbPanel, "roomSize"),
      reverbWetDry: getPanelParam(reverbPanel, "wetDry"),
      reverbHfRatio: getPanelParam(reverbPanel, "hfRatio"),
      reverbInputGain: getPanelParam(reverbPanel, "inputGain"),
      convReverbEnabled: convReverbPanel.enabled === true,
      convReverbMix: getPanelParam(convReverbPanel, "mix"),
      convReverbPredelay: getPanelParam(convReverbPanel, "predelay"),
      convReverbPreset: getPanelOption(convReverbPanel, "preset") || "hall",
      compressorEnabled: compressorPanel.enabled === true,
      compressorThreshold: getPanelParam(compressorPanel, "threshold"),
      compressorRatio: getPanelParam(compressorPanel, "ratio"),
      compressorAttack: getPanelParam(compressorPanel, "attack"),
      compressorRelease: getPanelParam(compressorPanel, "release"),
      compressorMakeupGain: getPanelParam(compressorPanel, "makeupGain"),
      autoGainEnabled: autoGainPanel.enabled === true,
      autoGainTargetLevel: getPanelParam(autoGainPanel, "targetLevel"),
      autoGainMaxGain: getPanelParam(autoGainPanel, "maxGain"),
      autoGainSpeed: getPanelOption(autoGainPanel, "speed") || "medium",
      limiterEnabled: limiterPanel.enabled === true,
      limiterCeiling: getPanelParam(limiterPanel, "ceiling"),
      limiterRelease: getPanelParam(limiterPanel, "release"),
      limiterLookahead: getPanelParam(limiterPanel, "lookahead"),
      limiterGainDb: getPanelParam(limiterPanel, "gain"),
      truePeakEnabled: truePeakPanel.enabled === true,
      truePeakCeiling: getPanelParam(truePeakPanel, "ceiling"),
      truePeakRelease: getPanelParam(truePeakPanel, "release"),
      truePeakLookahead: getPanelParam(truePeakPanel, "lookahead"),
      truePeakDrive: getPanelParam(truePeakPanel, "drive"),
      truePeakOversampling: getPanelParam(truePeakPanel, "oversampling"),
      truePeakStereoLink: getPanelOption(truePeakPanel, "stereoLink") !== "off",
      exciterEnabled: exciterPanel.enabled === true,
      exciterFrequency: getPanelParam(exciterPanel, "frequency"),
      exciterAmount: getPanelParam(exciterPanel, "amount"),
      exciterMix: getPanelParam(exciterPanel, "mix"),
      exciterHarmonics: getPanelOption(exciterPanel, "harmonics") || "odd",
      deesserEnabled: deesserPanel.enabled === true,
      deesserFrequency: getPanelParam(deesserPanel, "frequency"),
      deesserThreshold: getPanelParam(deesserPanel, "threshold"),
      deesserRatio: getPanelParam(deesserPanel, "ratio"),
      deesserRange: getPanelParam(deesserPanel, "range"),
      echoEnabled: echoPanel.enabled === true || softEchoPanel.enabled === true,
      echoDelay: echoPanel.enabled ? getPanelParam(echoPanel, "delay") : getPanelParam(softEchoPanel, "delay"),
      echoFeedback: echoPanel.enabled ? getPanelParam(echoPanel, "feedback") : getPanelParam(softEchoPanel, "feedback"),
      echoMix: echoPanel.enabled ? getPanelParam(echoPanel, "wetDry") : getPanelParam(softEchoPanel, "wetMix"),
      echoHighCut: echoPanel.enabled ? getPanelParam(echoPanel, "highCut") : getPanelParam(softEchoPanel, "highCut"),
      echoSoftMode: softEchoPanel.enabled === true && echoPanel.enabled !== true,
      noiseGateEnabled: noiseGatePanel.enabled === true,
      noiseGateThreshold: getPanelParam(noiseGatePanel, "threshold"),
      noiseGateAttack: getPanelParam(noiseGatePanel, "attack"),
      noiseGateHold: getPanelParam(noiseGatePanel, "hold"),
      noiseGateRelease: getPanelParam(noiseGatePanel, "release"),
      noiseGateRange: getPanelParam(noiseGatePanel, "range"),
      peqEnabled: peqPanel.enabled === true,
      peqBands: panelPeqBands(peqPanel),
      crossfeedEnabled: crossfeedPanel.enabled === true,
      crossfeedLevel: getPanelParam(crossfeedPanel, "level"),
      crossfeedDelay: getPanelParam(crossfeedPanel, "delay"),
      crossfeedLowCut: getPanelParam(crossfeedPanel, "lowCut"),
      crossfeedHighCut: getPanelParam(crossfeedPanel, "highCut"),
      bassMonoEnabled: bassMonoPanel.enabled === true,
      bassMonoCutoff: getPanelParam(bassMonoPanel, "cutoff"),
      bassMonoSlope: getPanelParam(bassMonoPanel, "slope"),
      bassMonoWidth: getPanelParam(bassMonoPanel, "stereoWidth"),
      dynamicEqEnabled: dynamicEqPanel.enabled === true,
      dynamicEqFrequency: getPanelParam(dynamicEqPanel, "frequency"),
      dynamicEqQ: getPanelParam(dynamicEqPanel, "q"),
      dynamicEqThreshold: getPanelParam(dynamicEqPanel, "threshold"),
      dynamicEqGain: getPanelParam(dynamicEqPanel, "gain"),
      dynamicEqRange: getPanelParam(dynamicEqPanel, "range"),
      dynamicEqAttack: getPanelParam(dynamicEqPanel, "attack"),
      dynamicEqRelease: getPanelParam(dynamicEqPanel, "release"),
      bitDitherEnabled: bitDitherPanel.enabled === true,
      bitDepth: getPanelParam(bitDitherPanel, "bitDepth"),
      dither: getPanelParam(bitDitherPanel, "dither"),
      shaping: getPanelParam(bitDitherPanel, "shaping"),
      downsample: getPanelParam(bitDitherPanel, "downsample"),
      bitDitherMix: getPanelParam(bitDitherPanel, "mix"),
      bitDitherOutputDb: getPanelParam(bitDitherPanel, "outputDb"),
      tapeSaturationEnabled: tapePanel.enabled === true,
      tapeDriveDb: getPanelParam(tapePanel, "driveDb"),
      tapeMix: getPanelParam(tapePanel, "mix"),
      tapeTone: getPanelParam(tapePanel, "tone"),
      tapeOutputDb: getPanelParam(tapePanel, "outputDb"),
      tapeMode: tapeModeValue(tapePanel),
      tapeHiss: getPanelParam(tapePanel, "hiss"),
      surroundEnabled: surroundPanel.enabled === true,
      surroundCenterLevel: getPanelParam(surroundPanel, "center"),
      surroundSideLevel: getPanelParam(surroundPanel, "surround"),
      surroundLfeLevel: getPanelParam(surroundPanel, "lfe"),
      surroundCrossover: getPanelParam(surroundPanel, "crossover"),
      surroundDelay: getPanelParam(surroundPanel, "delay"),
      surroundMix: getPanelParam(surroundPanel, "mix"),
    },
  };
}

function loadScopedSfxBroadcast(scope: "music" | "web" | "video"): SfxBroadcastState {
  const state = loadSoundEffectsState(scope);
  return {
    scope,
    effectsEnabled: state.broadcast?.effectsEnabled ?? state.masterEnabled,
    eqPreset: isEqPresetId(state.broadcast?.eqPreset) ? state.broadcast.eqPreset : "flat",
    eqPresetLabel:
      typeof state.broadcast?.eqPresetLabel === "string"
        ? state.broadcast.eqPresetLabel
        : eqPresets[isEqPresetId(state.broadcast?.eqPreset) ? state.broadcast.eqPreset : "flat"]?.label,
    eqGains:
      Array.isArray(state.broadcast?.eqGains) && state.broadcast.eqGains.length === eqFrequencies.length
        ? normalizedEqBands(state.broadcast.eqGains)
        : [...flatEq],
    dspSettings: {
      ...defaultDspSettings,
      ...state.broadcast?.dspSettings,
    },
  };
}

function toWebDaliPayload(snapshot: SfxBroadcastState): WebDaliPayload {
  return {
    effectsEnabled: snapshot.effectsEnabled,
    eqGains: normalizedEqBands(snapshot.eqGains),
    dspSettings: snapshot.dspSettings,
  };
}

function effectiveBassGain(settings: DspSettings) {
  const mix = Math.max(0, Math.min(100, Number(settings.bassMix) || 0)) / 100;
  return (Number(settings.bassBoost) || 0) * mix;
}

function bassOutputTrim(settings: DspSettings) {
  const boost = Math.max(0, effectiveBassGain(settings));
  const trimDb = Math.min(3.2, boost * 0.26);
  return 10 ** (-trimDb / 20);
}

function formatSfxParamValue(param: SfxParam) {
  const value = Number(param.value) || 0;
  if (param.key === "stereoExpander" || param.unit === "%") return `${Math.round(value)}%`;
  if (param.unit?.includes("Hz")) return `${Math.round(value)}${param.unit}`;
  if (param.unit?.includes("ms")) return `${Math.round(value)}${param.unit}`;
  if (param.unit?.includes("dB") || param.key === "bass" || param.key === "mid" || param.key === "treble") return `${value.toFixed(1)} dB`;
  if (param.key === "ratio") return `${value.toFixed(1)}:1`;
  return `${param.step < 1 ? value.toFixed(1) : Math.round(value)}${param.unit || ""}`;
}

function getBalanceText(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "Merkez (0%)";
  return rounded < 0 ? `Sol ${Math.abs(rounded)}%` : `Sag ${rounded}%`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const safe = Math.floor(seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

function titleFromFileName(name: string) {
  return name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim() || "Bilinmeyen sarki";
}

function fallbackCoverDataUrl(title: string, color: string) {
  void title;
  void color;
  return "/icons/app/ardali_256.png";
}

function isFallbackCover(value?: string) {
  return !value || value === "/icons/app/ardali_256.png" || value.startsWith("data:image/svg+xml");
}

function isEmbeddedCover(value?: string) {
  return Boolean(value && !isFallbackCover(value));
}

function trackCover(track: Track) {
  return isFallbackCover(track.coverDataUrl) ? fallbackCoverDataUrl(track.title, track.color) : track.coverDataUrl;
}

function maybeEmbeddedTrackCover(track?: Track) {
  return track && isEmbeddedCover(track.coverDataUrl) ? track.coverDataUrl : undefined;
}

function basename(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function reportClientError(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("ArDali istemci hatasi", { source, error });
  if (isTauriRuntime()) {
    void invoke("log_frontend_error", { source, message }).catch(() => undefined);
  }
}

function prefersBrowserAudioDecoder(track: Track) {
  const name = (track.path || track.fileName || track.url || "").toLowerCase();
  return /\.(m4a|aac|mp4|m4b|m4p)$/i.test(name);
}

function canUseNativeAudioForTrack(track: Track | undefined) {
  return Boolean(track && !prefersBrowserAudioDecoder(track));
}

function mediaErrorMessage(element: HTMLMediaElement | null) {
  const error = element?.error;
  if (!error) return "Bilinmeyen medya hatasi";
  const labels: Record<number, string> = {
    [MediaError.MEDIA_ERR_ABORTED]: "Kullanici/uygulama oynatmayi iptal etti",
    [MediaError.MEDIA_ERR_NETWORK]: "Medya ag/okuma hatasi",
    [MediaError.MEDIA_ERR_DECODE]: "Medya decode edilemedi; codec veya GStreamer eklentisi eksik olabilir",
    [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: "Medya kaynagi desteklenmiyor veya acilamiyor",
  };
  return `${labels[error.code] ?? "Medya hatasi"} (${error.code}) src=${element?.currentSrc || element?.src || "yok"}`;
}

function isPageId(value: unknown): value is PageId {
  return railItems.some((item) => item.id === value);
}

function RailThemeIcon({ name }: { name: string }) {
  return <img className="rail-theme-icon" src={`/icons/sidebar-themes/classic/${name}`} alt="" />;
}

function WebPlatformIcon({ platform }: { platform: WebPlatform }) {
  return (
    <img
      className="web-platform-icon"
      src={`/icons/web-platforms/${platform.icon}`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function revokeMediaUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

type SettingsTabId =
  | "web"
  | "playback"
  | "keyboard"
  | "behavior"
  | "security";

const settingsTabs: Array<{ id: SettingsTabId; labelKey: string; icon: ReactNode }> = [
  { id: "web", labelKey: "settings.tabs.web", icon: <Globe2 size={17} /> },
  { id: "playback", labelKey: "settings.tabs.playback", icon: <Play size={17} /> },
  { id: "keyboard", labelKey: "settings.tabs.keyboard", icon: <Grid2X2 size={17} /> },
  { id: "behavior", labelKey: "settings.tabs.behavior", icon: <SlidersHorizontal size={17} /> },
  { id: "security", labelKey: "settings.tabs.security", icon: <Check size={17} /> },
];

const appLanguages: Array<{
  id: AppLanguage;
  name: string;
  nativeName: string;
  flag: string;
  emoji: string;
}> = [
  { id: "tr-TR", name: "Türkçe", nativeName: "Türkçe", flag: "tr.svg", emoji: "🇹🇷" },
  { id: "en-US", name: "English", nativeName: "English", flag: "us.svg", emoji: "🇺🇸" },
  { id: "ar-SA", name: "العربية", nativeName: "العربية", flag: "sa.svg", emoji: "🇸🇦" },
  { id: "es-ES", name: "Español", nativeName: "Español", flag: "es.svg", emoji: "🇪🇸" },
];

const appThemes: Array<{ id: AppTheme; labelKey: string }> = [
  { id: "aur-renk-efektleri", labelKey: "settings.theme.aur" },
  { id: "performance-balanced", labelKey: "settings.theme.performanceBalanced" },
  { id: "performance-lite", labelKey: "settings.theme.performanceLite" },
  { id: "ardali", labelKey: "settings.theme.ardali" },
  { id: "dark", labelKey: "settings.theme.dark" },
  { id: "black", labelKey: "settings.theme.black" },
  { id: "light", labelKey: "settings.theme.light" },
  { id: "frappe", labelKey: "settings.theme.frappe" },
  { id: "onedark", labelKey: "settings.theme.onedark" },
  { id: "matrix", labelKey: "settings.theme.matrix" },
  { id: "latte", labelKey: "settings.theme.latte" },
  { id: "solarized-dark", labelKey: "settings.theme.solarizedDark" },
  { id: "neon-night", labelKey: "settings.theme.neonNight" },
  { id: "retro-amber", labelKey: "settings.theme.retroAmber" },
  { id: "deep-ocean", labelKey: "settings.theme.deepOcean" },
  { id: "forest-mint", labelKey: "settings.theme.forestMint" },
];

const startupPages: Array<{ id: StartupPage; labelKey: string }> = [
  { id: "music", labelKey: "settings.behavior.startupPageMusic" },
  { id: "video", labelKey: "settings.behavior.startupPageVideo" },
  { id: "gallery", labelKey: "settings.behavior.startupPageGallery" },
  { id: "web", labelKey: "settings.behavior.startupPageWeb" },
];

const keyboardShortcutGroups: Array<{
  titleKey: string;
  items: Array<{ labelKey: string; keys: string[]; icon: ReactNode }>;
}> = [
  {
    titleKey: "settings.keyboard.media",
    items: [
      { labelKey: "settings.keyboard.playPause", keys: ["Space", "Media Play/Pause"], icon: <Play size={16} /> },
      { labelKey: "settings.keyboard.previous", keys: ["Ctrl + Left", "Media Previous"], icon: <SkipBack size={16} /> },
      { labelKey: "settings.keyboard.next", keys: ["Ctrl + Right", "Media Next"], icon: <SkipForward size={16} /> },
      { labelKey: "settings.keyboard.mute", keys: ["M"], icon: <VolumeX size={16} /> },
      { labelKey: "settings.keyboard.seekBack", keys: ["Left"], icon: <Rewind size={16} /> },
      { labelKey: "settings.keyboard.seekForward", keys: ["Right"], icon: <SkipForward size={16} /> },
    ],
  },
  {
    titleKey: "settings.keyboard.sections",
    items: [
      { labelKey: "settings.keyboard.music", keys: ["1"], icon: <Music2 size={16} /> },
      { labelKey: "settings.keyboard.video", keys: ["2"], icon: <Video size={16} /> },
      { labelKey: "settings.keyboard.gallery", keys: ["3"], icon: <Image size={16} /> },
      { labelKey: "settings.keyboard.web", keys: ["4"], icon: <Globe2 size={16} /> },
      { labelKey: "settings.keyboard.settings", keys: ["Ctrl + ,"], icon: <Settings size={16} /> },
    ],
  },
  {
    titleKey: "settings.keyboard.tools",
    items: [
      { labelKey: "settings.keyboard.soundEffects", keys: ["E"], icon: <SlidersHorizontal size={16} /> },
      { labelKey: "settings.keyboard.visualizer", keys: ["V"], icon: <Sparkles size={16} /> },
      { labelKey: "settings.keyboard.fullscreen", keys: ["F"], icon: <Maximize2 size={16} /> },
    ],
  },
];

function getSystemTheme(): AppTheme {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "black";
}

function resolveEffectiveTheme(settings: Pick<WebSettings, "theme" | "followSystemTheme">): AppTheme {
  return settings.followSystemTheme ? getSystemTheme() : settings.theme;
}

function applyDocumentTheme(theme: AppTheme, options: { persist?: boolean } = {}) {
  document.documentElement.dataset.ardaliTheme = theme;
  document.documentElement.setAttribute("theme", theme);
  document.body?.setAttribute("data-ardali-theme", theme);
  if (options.persist === false) return;
  try {
    localStorage.setItem("ardali_ui_theme", theme);
    localStorage.setItem("theme", theme);
  } catch {
    // storage disabled
  }
}

function shouldIgnoreKeyboardShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

const shortcutKeyTranslations: Record<AppLanguage, Record<string, string>> = {
  "tr-TR": {
    Space: "Boşluk",
    Left: "Sol",
    Right: "Sağ",
    "Ctrl + Left": "Ctrl + Sol",
    "Ctrl + Right": "Ctrl + Sağ",
    "Ctrl + ,": "Ctrl + ,",
    "Media Play/Pause": "Medya Oynat/Duraklat",
    "Media Previous": "Medya Önceki",
    "Media Next": "Medya Sonraki",
  },
  "en-US": {
    Space: "Space",
    Left: "Left",
    Right: "Right",
    "Ctrl + Left": "Ctrl + Left",
    "Ctrl + Right": "Ctrl + Right",
    "Ctrl + ,": "Ctrl + ,",
    "Media Play/Pause": "Media Play/Pause",
    "Media Previous": "Media Previous",
    "Media Next": "Media Next",
  },
  "ar-SA": {
    Space: "مسافة",
    Left: "يسار",
    Right: "يمين",
    "Ctrl + Left": "Ctrl + يسار",
    "Ctrl + Right": "Ctrl + يمين",
    "Ctrl + ,": "Ctrl + ,",
    "Media Play/Pause": "تشغيل/إيقاف الوسائط",
    "Media Previous": "الوسائط السابق",
    "Media Next": "الوسائط التالي",
  },
  "es-ES": {
    Space: "Espacio",
    Left: "Izquierda",
    Right: "Derecha",
    "Ctrl + Left": "Ctrl + Izquierda",
    "Ctrl + Right": "Ctrl + Derecha",
    "Ctrl + ,": "Ctrl + ,",
    "Media Play/Pause": "Medio reproducir/pausar",
    "Media Previous": "Medio anterior",
    "Media Next": "Medio siguiente",
  },
};

function shortcutKeyLabel(language: AppLanguage, keyLabel: string) {
  return shortcutKeyTranslations[language]?.[keyLabel] ?? keyLabel;
}

const i18n: Record<AppLanguage, Record<string, string>> = {
  "tr-TR": {
    "app.title": "ArDali WebMedya",
    "common.cancel": "İptal",
    "common.close": "Kapat",
    "common.save": "Kaydet",
    "common.resetDefaults": "Varsayılana döndür",
    "common.yes": "Evet",
    "common.no": "Hayır",
    "window.minimize": "Küçült",
    "window.maximize": "Büyüt",
    "rail.video": "Videolar",
    "rail.music": "Müzik",
    "rail.gallery": "Galeri",
    "rail.web": "Web",
    "rail.listen": "Dinleyerek bul",
    "rail.downloads": "İndirme",
    "rail.soundEffects": "Ses Efektleri",
    "rail.visualizer": "Görselleştirme",
    "rail.settings": "Ayarlar",
    "rail.about": "Hakkında",
    "settings.title": "Tercihler",
    "settings.aria": "Ayar bölümleri",
    "settings.tabs.web": "Web Ayarları",
    "settings.tabs.playback": "Oynat",
    "settings.tabs.keyboard": "Klavye Kısayolları",
    "settings.tabs.listen": "Dinle",
    "settings.tabs.behavior": "Davranış",
    "settings.tabs.security": "Güvenlik",
    "settings.tabs.library": "Medya Kütüphanesi",
    "settings.tabs.gallery": "Galeri",
    "settings.tabs.audio": "Ses Çıkışı",
    "settings.theme.aur": "ArDali Medya Player",
    "settings.theme.performanceBalanced": "Dengeli Akış",
    "settings.theme.performanceLite": "Düşük Donanım Kararlı",
    "settings.theme.ardali": "ArDali",
    "settings.theme.dark": "Karanlık",
    "settings.theme.black": "Siyah",
    "settings.theme.light": "Aydınlık",
    "settings.theme.frappe": "Frappé",
    "settings.theme.onedark": "One Dark",
    "settings.theme.matrix": "Matrix",
    "settings.theme.latte": "Latte",
    "settings.theme.solarizedDark": "Solarized Dark",
    "settings.theme.neonNight": "Neon Night",
    "settings.theme.retroAmber": "Retro Amber",
    "settings.theme.deepOcean": "Derin Okyanus",
    "settings.theme.forestMint": "Orman Nanesi",
    "settings.keyboard.media": "Medya Kısayolları",
    "settings.keyboard.sections": "Ana Bölümler",
    "settings.keyboard.tools": "Araçlar",
    "settings.keyboard.playPause": "Oynat / Duraklat",
    "settings.keyboard.previous": "Önceki parça",
    "settings.keyboard.next": "Sonraki parça",
    "settings.keyboard.mute": "Sesi kapat / aç",
    "settings.keyboard.seekBack": "5 saniye geri",
    "settings.keyboard.seekForward": "5 saniye ileri",
    "settings.keyboard.music": "Müzik",
    "settings.keyboard.video": "Video",
    "settings.keyboard.gallery": "Galeri",
    "settings.keyboard.web": "Web",
    "settings.keyboard.settings": "Ayarlar",
    "settings.keyboard.soundEffects": "Ses Efektleri",
    "settings.keyboard.visualizer": "Görselleştirici",
    "settings.keyboard.fullscreen": "Tam ekran",
    "settings.playback.startupSection": "Başlangıç",
    "settings.playback.restoreLastTrack": "Açılışta son parçayı geri yükle",
    "settings.playback.restoreLastTrackHint": "Uygulama açıldığında en son seçili parçayı hazırlar.",
    "settings.playback.autoplayLastTrack": "Açılışta son parçayı otomatik başlat",
    "settings.playback.autoplayLastTrackHint": "Son parça geri yüklendikten sonra oynatmayı başlatır.",
    "settings.playback.resumePosition": "Son parçayı kaldığı pozisyondan devam ettir",
    "settings.playback.resumePositionHint": "Parçayı baştan değil, kaydedilen zamandan başlatır.",
    "settings.playback.transitionsSection": "Geçişler",
    "settings.playback.fadeOnPause": "Duraklatırken yumuşak geç",
    "settings.playback.fadeOnPauseHint": "Duraklatmada sesi kısa bir fade ile indirir.",
    "settings.playback.fadeOnStop": "Durdururken yumuşak geç",
    "settings.playback.fadeOnStopHint": "Durdurma davranışlarında ani kesilmeyi azaltır.",
    "settings.playback.fadeDuration": "Fade süresi",
    "settings.playback.fadeDurationHint": "Duraklatma/durdurma fade süresi.",
    "settings.playback.crossfadeManual": "Parça değiştirirken çapraz geçiş yap",
    "settings.playback.crossfadeManualHint": "Önceki/sonraki parça geçişlerinde sesi bindirerek yumuşatır.",
    "settings.playback.crossfadeAuto": "Parça bitmeden otomatik çapraz geçiş yap",
    "settings.playback.crossfadeAutoHint": "Parçanın sonuna yaklaşınca sıradaki parçaya yumuşak geçer.",
    "settings.playback.crossfadeDuration": "Çapraz geçiş süresi",
    "settings.playback.crossfadeDurationHint": "Otomatik ve elle geçişlerde kullanılan süre.",
    "settings.behavior.languageSection": "Dil Seçimi",
    "settings.behavior.languageLabel": "Dil",
    "settings.behavior.languageHint": "Dil değişikliği kaydedildikten sonra yeniden başlatma gerekir.",
    "settings.behavior.appearanceSection": "Görünüm",
    "settings.behavior.themeLabel": "Tema",
    "settings.behavior.themeHint": "Uygulama renklerini anında değiştirir.",
    "settings.behavior.followSystemTheme": "Sistem temasını takip et",
    "settings.behavior.followSystemThemeHint": "Açıkken tema sistemin açık/koyu tercihine göre uygulanır.",
    "settings.behavior.startupSection": "Başlangıç Davranışı",
    "settings.behavior.rememberLastSection": "Son açık ana bölümü hatırla",
    "settings.behavior.rememberLastSectionHint": "Uygulama açıldığında kaldığın ana sekmeye döner.",
    "settings.behavior.startupPageLabel": "Varsayılan açılış bölümü",
    "settings.behavior.startupPageHint": "Son bölüm hatırlama kapalıysa uygulama bu bölümle açılır.",
    "settings.behavior.startupPageMusic": "Medya (Ses)",
    "settings.behavior.startupPageVideo": "Video",
    "settings.behavior.startupPageGallery": "Galeri",
    "settings.behavior.startupPageWeb": "Web",
    "settings.behavior.startupPageListen": "Dinle",
    "settings.behavior.restartTitle": "Yeniden başlatma gerekli",
    "settings.behavior.restartMessage": "Dil değişikliğinin uygulanması için uygulamanın yeniden başlatılması gerekiyor. Şimdi yeniden başlatılsın mı?",
    "settings.web.general": "Genel",
    "settings.web.enable": "Web deneyimini etkinleştir",
    "settings.web.defaultPlatform": "Varsayılan platform",
    "settings.web.defaultPlatformHint": "Web sekmesi ilk açıldığında seçilecek platform",
    "settings.web.rememberPlatform": "Son kullanılan web platformunu hatırla",
    "settings.web.restoreSession": "Uygulama web sekmesinde kapandıysa aynı platformla aç",
    "settings.web.suspendInactive": "Web sekmesi pasifken web oturumunu kapat",
    "settings.web.startupDelay": "Web başlangıç yükleme gecikmesi",
    "settings.web.startupDelayHint": "Yavaş sistemlerde ilk WebView açılışını geciktirir",
    "settings.web.delayInstant": "Anında (0 sn)",
    "settings.web.delayShort": "Kısa (0.35 sn)",
    "settings.web.delayBalanced": "Dengeli (0.7 sn)",
    "settings.web.delaySlow": "Yavaş sistem (1.2 sn)",
    "settings.web.appearance": "Görünüm ve Hareket",
    "settings.web.animation": "Web arayüz animasyonu",
    "settings.web.animationHint": "Üst ve yan barın web içeriğiyle davranış biçimi",
    "settings.web.animationCompact": "Kompakt",
    "settings.web.animationDock": "Dock tarzı",
    "settings.web.motion": "Web animasyon hızı",
    "settings.web.motionHint": "Bar gizleme/açılma hareketinin temposu",
    "settings.web.motionCalm": "Sakin",
    "settings.web.motionBalanced": "Dengeli",
    "settings.web.motionFast": "Hızlı",
    "settings.web.autoHide": "İzleme sırasında üst ve yan barı otomatik gizle",
    "settings.web.lowPower": "Web animasyonları düşük sistem modu",
    "settings.web.autoHideDelay": "Otomatik gizleme süresi",
    "settings.web.autoHideDelayHint": "Fare hareketi durduktan sonra bekleme süresi",
    "settings.web.autoRecover": "Açılışta boş kalan web ekranını otomatik yeniden yükle",
    "settings.web.privacy": "Gizlilik ve Veri",
    "settings.web.privacyInfo": "Kalıcı oturum açıkken web girişleri yerel profil klasöründe saklanır. Bu klasör yalnızca mevcut Linux kullanıcısına açık olacak şekilde korunur.",
    "settings.web.persistent": "Kalıcı oturumları koru",
    "settings.web.private": "Gizli web modu",
    "settings.web.clearCacheOnQuit": "Uygulama kapanırken web önbelleğini temizle",
    "settings.web.clearCookiesOnQuit": "Uygulama kapanırken web çerezlerini temizle",
    "settings.web.clearSiteDataOnQuit": "Uygulama kapanırken site verilerini temizle",
    "settings.web.preferHttps": "HTTP adreslerini mümkünse HTTPS olarak aç",
    "settings.web.reduceWebRtc": "WebRTC IP sızıntılarını azalt",
    "settings.web.stripTracking": "Bilinen takip parametrelerini temizle",
    "settings.web.blockThirdParty": "Üçüncü taraf çerezleri engelle",
    "settings.web.clearCache": "Önbelleği temizle",
    "settings.web.clearCookies": "Çerezleri temizle",
    "settings.web.clearSiteData": "Site verilerini temizle",
    "settings.web.clearAll": "Web oturumlarını temizle",
    "settings.web.clearing": "{target} temizleniyor...",
    "settings.web.cleared": "{target} temizlendi.",
    "settings.web.clearFailed": "{target} temizlenemedi.",
    "settings.web.permissions": "İzinler ve Politika",
    "settings.web.userAgent": "Kullanıcı aracısı",
    "settings.web.userAgentHint": "Platformlara bildirilecek web görünümü tipi",
    "settings.web.uaDesktop": "Masaüstü",
    "settings.web.uaMobile": "Mobil",
    "settings.web.uaDefault": "Varsayılan",
    "settings.web.autoplay": "Otomatik oynatma",
    "settings.web.autoplayHint": "Web sitelerinin medya başlatma davranışı",
    "settings.web.autoplayAllow": "İzin ver",
    "settings.web.autoplayGesture": "Kullanıcı etkileşimi iste",
    "settings.web.autoplayBlock": "Engelle",
    "settings.web.allowCamera": "Kamera iznine izin ver",
    "settings.web.allowMicrophone": "Mikrofon iznine izin ver",
    "settings.web.allowLocation": "Konum iznine izin ver",
    "settings.web.allowNotifications": "Bildirim iznine izin ver",
    "settings.web.allowPopups": "Pop-up pencerelerine izin ver",
    "library.title": "KÜTÜPHANE",
    "library.collapseOpen": "Sekmeler şeridini aç",
    "library.collapseHide": "Sekmeler şeridini gizle",
    "library.openVideo": "Video Aç",
    "library.addMusic": "Kütüphaneye ekle",
    "library.videoReady": "{count} video hazır",
    "library.musicReady": "{count} şarkı hazır",
    "library.pickVideo": "Yerel video dosyası seç",
    "library.root": "Kök kütüphane",
    "library.collection": "Koleksiyon",
    "library.nowPlaying": "Şimdi çalan",
    "library.queue": "Kuyruk",
    "library.search": "Kütüphanede ara...",
    "library.savedFolders": "KAYITLI KLASÖRLER",
    "library.localVideo": "Yerel Video",
    "library.localMusic": "Yerel Müzik",
    "library.shown": "Gösterilen: {count}",
    "library.cleanMissing": "Eksik dosyaları temizle",
    "nav.back": "Geri",
    "nav.forward": "İleri",
    "nav.refresh": "Yenile",
    "nav.viewSettings": "Görünüm ayarları",
    "nav.musicViewSettings": "Müzik görünüm ayarları",
    "nav.list": "Liste",
    "nav.compact": "Kompakt",
    "nav.comfortable": "Rahat",
    "nav.card": "Kart",
    "nav.nowPlaying": "Şu An Çalınan: {name}",
    "music.emptyTitle": "Müzik kütüphanesi boş",
    "music.emptyHint": "MP3, FLAC, WAV, OGG, M4A veya OPUS dosyalarını ekleyin.",
    "music.noResultsTitle": "Sonuç bulunamadı",
    "music.noResultsHint": "Arama filtresini değiştirerek kütüphanede tekrar deneyin.",
    "music.playing": "Çalınıyor",
    "video.emptyTitle": "Video kütüphanesi boş",
    "video.emptyHint": "MP4, MKV, WebM, MOV veya AVI dosyalarını ekleyin.",
    "video.noResultsHint": "Arama filtresini değiştirerek video kütüphanesinde tekrar deneyin.",
    "video.back": "Geri",
    "video.fullscreen": "Tam Ekran",
    "video.play": "Videoyu oynat",
    "video.miniPlayer": "Mini oynatıcı",
    "video.restore": "Çalışma alanına al",
    "video.closeMini": "Mini oynatıcıyı kapat",
    "video.position": "Video konumu",
    "video.quality": "Kalite",
    "video.auto": "Otomatik",
    "video.stableVolume": "Sabit ses",
    "video.volumeBoost": "Ses artırma",
    "video.cinematicLight": "Sinematik ışıklandırma",
    "video.captions": "Ek Açıklamalar",
    "video.subtitles": "Altyazılar (1)",
    "video.sleepTimer": "Uyku modu zamanlayıcı",
    "video.closed": "Kapalı",
    "video.open": "Açık",
    "video.speed": "Çalma hızı",
    "video.normal": "Normal",
    "player.position": "Oynatma konumu",
    "player.clear": "Temizle",
    "player.shuffle": "Karıştır",
    "player.previous": "Önceki",
    "player.rewind10": "10sn Geri",
    "player.playPause": "Oynat / Duraklat",
    "player.forward10": "10sn İleri",
    "player.next": "Sonraki",
    "player.repeat": "Tekrarla",
    "player.repeatOne": "Çalan şarkıyı tekrarla",
    "player.unmute": "Sesi aç",
    "player.mute": "Sessiz",
    "player.volume": "Ses seviyesi",
    "common.removeFromLibrary": "Kütüphaneden kaldır",
    "sfx.windowTitle": "Ses Efektleri ({scope}) - ArDali",
    "sfx.scope.music": "Müzik",
    "sfx.scope.video": "Video",
    "sfx.scope.web": "Web",
    "sfx.enableEffects": "Ses Efektlerini Etkinleştir",
    "sfx.lightColor": "Işık Rengi",
    "sfx.light.cyan": "Gök Mavi",
    "sfx.light.rainbow": "Gökkuşağı",
    "sfx.light.blue": "Mavi",
    "sfx.light.purple": "Mor",
    "sfx.light.green": "Yeşil",
    "sfx.light.amber": "Amber",
    "sfx.light.red": "Kırmızı",
    "sfx.light.off": "Kapalı",
    "sfx.status": "DSP: {state} • Kapsam: {scope} • Aktif: {active}",
    "sfx.on": "Açık",
    "sfx.off": "Kapalı",
    "sfx.enabled": "Etkin",
    "sfx.presets": "Hazır Ayarlar",
    "sfx.reset": "Sıfırla",
    "sfx.module": "ArDali Modülü",
    "sfx.resetModule": "Modülü Sıfırla",
    "sfx.balance": "Denge (Sol ↔ Sağ)",
    "sfx.center": "Merkez",
    "sfx.resize": "Pencereyi yeniden boyutlandır",
    "sfx.stereoField": "Stereo Alan Simülasyonu",
    "sfx.dspStatus": "DSP Durumu: {state} | Loaded: {loaded}",
    "sfx.connected": "Bağlı",
    "sfx.waiting": "Bekliyor",
    "sfx.headphonesDetected": "{device} kulaklık olarak algılandı. Crossfeed kullanımı uygundur.",
    "sfx.speakersDetected": "{device} hoparlör/line çıkışı olarak algılandı. Crossfeed genelde gerekli değildir.",
    "sfx.outputUnknown": "Çıkış bilgisi okunamadı. Crossfeed manuel modda kalır.",
    "sfx.crossfeedAuto": "Kulaklık bağlantısına göre crossfeed'i otomatik aç/kapat",
    "sfx.lowHighCut": "Low Cut {low} Hz • High Cut {high} Hz",
    "sfx.truePeakMeters": "Stereo True Peak Ölçerleri",
    "sfx.clipping": "Clipping:",
    "sfx.oversampling": "Oversampling:",
    "sfx.stereoLink": "Stereo Link",
    "sfx.truePeakActive": "Limiter aktif: Clipping {clip}, anlık GR {gr} dB.",
    "sfx.truePeakIdle": "Limiter kapalı: meter ve clipping sayacı beklemede.",
    "sfx.slope": "Eğim",
    "sfx.bassMonoNote": "Cutoff altındaki frekanslar mono merkeze toplanır; üst bant stereo genişliğini korur veya Stereo Width ile genişler.",
    "eqPresets.title": "Hazır Ayarlar",
    "eqPresets.windowTitle": "ArDali Hazır Ayarlar - ArDali Medya Player",
    "eqPresets.search": "Hazır ayar ara...",
    "eqPresets.viewMode": "Görünüm modu",
    "eqPresets.quality": "Tam",
    "eqPresets.balanced": "Dengeli",
    "eqPresets.performance": "Minimum",
    "eqPresets.category": "Kategori",
    "eqPresets.shown": "Gösterilen: {visible} / {total} • Grup: {group}",
    "eqPresets.loadError": "Hazır ayarlar yüklenemedi",
    "eqPresets.hintQuality": "Tam mod: tüm animasyon ve görsel efektler aktif.",
    "eqPresets.hintBalanced": "Dengeli mod: animasyonlar sadeleşir, performans daha stabildir.",
    "eqPresets.hintPerformance": "Minimum mod: en hafif görünüm, animasyon ve efektler minimumdadır.",
  },
  "en-US": {
    "app.title": "ArDali WebMedia",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.save": "Save",
    "common.resetDefaults": "Reset to defaults",
    "common.yes": "Yes",
    "common.no": "No",
    "window.minimize": "Minimize",
    "window.maximize": "Maximize",
    "rail.video": "Videos",
    "rail.music": "Music",
    "rail.gallery": "Gallery",
    "rail.web": "Web",
    "rail.listen": "Listen",
    "rail.downloads": "Downloads",
    "rail.soundEffects": "Sound Effects",
    "rail.visualizer": "Visualizer",
    "rail.settings": "Settings",
    "rail.about": "About",
    "settings.title": "Preferences",
    "settings.aria": "Settings sections",
    "settings.tabs.web": "Web Settings",
    "settings.tabs.playback": "Playback",
    "settings.tabs.keyboard": "Keyboard Shortcuts",
    "settings.tabs.listen": "Listen",
    "settings.tabs.behavior": "Behavior",
    "settings.tabs.security": "Security",
    "settings.tabs.library": "Media Library",
    "settings.tabs.gallery": "Gallery",
    "settings.tabs.audio": "Audio Output",
    "settings.theme.aur": "ArDali Media Player",
    "settings.theme.performanceBalanced": "Balanced Flow",
    "settings.theme.performanceLite": "Low Hardware Stable",
    "settings.theme.ardali": "ArDali",
    "settings.theme.dark": "Dark",
    "settings.theme.black": "Black",
    "settings.theme.light": "Light",
    "settings.theme.frappe": "Frappé",
    "settings.theme.onedark": "One Dark",
    "settings.theme.matrix": "Matrix",
    "settings.theme.latte": "Latte",
    "settings.theme.solarizedDark": "Solarized Dark",
    "settings.theme.neonNight": "Neon Night",
    "settings.theme.retroAmber": "Retro Amber",
    "settings.theme.deepOcean": "Deep Ocean",
    "settings.theme.forestMint": "Forest Mint",
    "settings.keyboard.media": "Media Shortcuts",
    "settings.keyboard.sections": "Main Sections",
    "settings.keyboard.tools": "Tools",
    "settings.keyboard.playPause": "Play / Pause",
    "settings.keyboard.previous": "Previous track",
    "settings.keyboard.next": "Next track",
    "settings.keyboard.mute": "Mute / unmute",
    "settings.keyboard.seekBack": "Back 5 seconds",
    "settings.keyboard.seekForward": "Forward 5 seconds",
    "settings.keyboard.music": "Music",
    "settings.keyboard.video": "Video",
    "settings.keyboard.gallery": "Gallery",
    "settings.keyboard.web": "Web",
    "settings.keyboard.settings": "Settings",
    "settings.keyboard.soundEffects": "Sound Effects",
    "settings.keyboard.visualizer": "Visualizer",
    "settings.keyboard.fullscreen": "Fullscreen",
    "settings.playback.startupSection": "Startup",
    "settings.playback.restoreLastTrack": "Restore last track on startup",
    "settings.playback.restoreLastTrackHint": "Prepares the last selected track when the app opens.",
    "settings.playback.autoplayLastTrack": "Autoplay the last track on startup",
    "settings.playback.autoplayLastTrackHint": "Starts playback after restoring the last track.",
    "settings.playback.resumePosition": "Resume the last track from its saved position",
    "settings.playback.resumePositionHint": "Starts from the saved time instead of the beginning.",
    "settings.playback.transitionsSection": "Transitions",
    "settings.playback.fadeOnPause": "Fade when pausing",
    "settings.playback.fadeOnPauseHint": "Lowers the sound with a short fade before pausing.",
    "settings.playback.fadeOnStop": "Fade when stopping",
    "settings.playback.fadeOnStopHint": "Reduces abrupt cuts during stop actions.",
    "settings.playback.fadeDuration": "Fade duration",
    "settings.playback.fadeDurationHint": "Duration for pause/stop fades.",
    "settings.playback.crossfadeManual": "Crossfade when changing tracks",
    "settings.playback.crossfadeManualHint": "Smooths previous/next track changes.",
    "settings.playback.crossfadeAuto": "Auto-crossfade before a track ends",
    "settings.playback.crossfadeAutoHint": "Moves to the next track smoothly near the end.",
    "settings.playback.crossfadeDuration": "Crossfade duration",
    "settings.playback.crossfadeDurationHint": "Duration used for manual and automatic transitions.",
    "settings.behavior.languageSection": "Language Selection",
    "settings.behavior.languageLabel": "Language",
    "settings.behavior.languageHint": "Changing the language requires restarting after saving.",
    "settings.behavior.appearanceSection": "Appearance",
    "settings.behavior.themeLabel": "Theme",
    "settings.behavior.themeHint": "Changes the application colors instantly.",
    "settings.behavior.followSystemTheme": "Follow system theme",
    "settings.behavior.followSystemThemeHint": "When enabled, the app follows the system light/dark preference.",
    "settings.behavior.startupSection": "Startup Behavior",
    "settings.behavior.rememberLastSection": "Remember last main section",
    "settings.behavior.rememberLastSectionHint": "The app opens on the main section you last used.",
    "settings.behavior.startupPageLabel": "Default startup section",
    "settings.behavior.startupPageHint": "Used when remembering the last section is disabled.",
    "settings.behavior.startupPageMusic": "Media (Audio)",
    "settings.behavior.startupPageVideo": "Video",
    "settings.behavior.startupPageGallery": "Gallery",
    "settings.behavior.startupPageWeb": "Web",
    "settings.behavior.startupPageListen": "Listen",
    "settings.behavior.restartTitle": "Restart required",
    "settings.behavior.restartMessage": "The app must restart to apply the language change. Restart now?",
    "settings.web.general": "General",
    "settings.web.enable": "Enable web experience",
    "settings.web.defaultPlatform": "Default platform",
    "settings.web.defaultPlatformHint": "The platform selected when the Web tab first opens",
    "settings.web.rememberPlatform": "Remember the last used web platform",
    "settings.web.restoreSession": "Restore the same platform if the app closed on the Web tab",
    "settings.web.suspendInactive": "Close the web session while the Web tab is inactive",
    "settings.web.startupDelay": "Web startup loading delay",
    "settings.web.startupDelayHint": "Delays the first WebView startup on slower systems",
    "settings.web.delayInstant": "Instant (0 s)",
    "settings.web.delayShort": "Short (0.35 s)",
    "settings.web.delayBalanced": "Balanced (0.7 s)",
    "settings.web.delaySlow": "Slow system (1.2 s)",
    "settings.web.appearance": "Appearance and Motion",
    "settings.web.animation": "Web interface animation",
    "settings.web.animationHint": "How the top and side bars behave with web content",
    "settings.web.animationCompact": "Compact",
    "settings.web.animationDock": "Dock style",
    "settings.web.motion": "Web animation speed",
    "settings.web.motionHint": "The tempo of hiding/showing the bars",
    "settings.web.motionCalm": "Calm",
    "settings.web.motionBalanced": "Balanced",
    "settings.web.motionFast": "Fast",
    "settings.web.autoHide": "Auto-hide top and side bars while watching",
    "settings.web.lowPower": "Low system mode for web animations",
    "settings.web.autoHideDelay": "Auto-hide delay",
    "settings.web.autoHideDelayHint": "Delay after mouse movement stops",
    "settings.web.autoRecover": "Automatically reload blank web screens on startup",
    "settings.web.privacy": "Privacy and Data",
    "settings.web.privacyInfo": "When persistent sessions are enabled, web logins are stored in the local profile folder. This folder is protected for the current Linux user.",
    "settings.web.persistent": "Keep persistent sessions",
    "settings.web.private": "Private web mode",
    "settings.web.clearCacheOnQuit": "Clear web cache when the app quits",
    "settings.web.clearCookiesOnQuit": "Clear web cookies when the app quits",
    "settings.web.clearSiteDataOnQuit": "Clear site data when the app quits",
    "settings.web.preferHttps": "Open HTTP addresses as HTTPS when possible",
    "settings.web.reduceWebRtc": "Reduce WebRTC IP leaks",
    "settings.web.stripTracking": "Remove known tracking parameters",
    "settings.web.blockThirdParty": "Block third-party cookies",
    "settings.web.clearCache": "Clear cache",
    "settings.web.clearCookies": "Clear cookies",
    "settings.web.clearSiteData": "Clear site data",
    "settings.web.clearAll": "Clear web sessions",
    "settings.web.clearing": "Clearing {target}...",
    "settings.web.cleared": "{target} cleared.",
    "settings.web.clearFailed": "Could not clear {target}.",
    "settings.web.permissions": "Permissions and Policy",
    "settings.web.userAgent": "User agent",
    "settings.web.userAgentHint": "The web view type reported to platforms",
    "settings.web.uaDesktop": "Desktop",
    "settings.web.uaMobile": "Mobile",
    "settings.web.uaDefault": "Default",
    "settings.web.autoplay": "Autoplay",
    "settings.web.autoplayHint": "How websites can start media",
    "settings.web.autoplayAllow": "Allow",
    "settings.web.autoplayGesture": "Require user interaction",
    "settings.web.autoplayBlock": "Block",
    "settings.web.allowCamera": "Allow camera permission",
    "settings.web.allowMicrophone": "Allow microphone permission",
    "settings.web.allowLocation": "Allow location permission",
    "settings.web.allowNotifications": "Allow notifications",
    "settings.web.allowPopups": "Allow pop-up windows",
    "library.title": "LIBRARY",
    "library.collapseOpen": "Show tab rail",
    "library.collapseHide": "Hide tab rail",
    "library.openVideo": "Open Video",
    "library.addMusic": "Add to library",
    "library.videoReady": "{count} videos ready",
    "library.musicReady": "{count} songs ready",
    "library.pickVideo": "Select a local video file",
    "library.root": "Root library",
    "library.collection": "Collection",
    "library.nowPlaying": "Now playing",
    "library.queue": "Queue",
    "library.search": "Search library...",
    "library.savedFolders": "SAVED FOLDERS",
    "library.localVideo": "Local Video",
    "library.localMusic": "Local Music",
    "library.shown": "Shown: {count}",
    "library.cleanMissing": "Clean missing files",
    "nav.back": "Back",
    "nav.forward": "Forward",
    "nav.refresh": "Refresh",
    "nav.viewSettings": "View settings",
    "nav.musicViewSettings": "Music view settings",
    "nav.list": "List",
    "nav.compact": "Compact",
    "nav.comfortable": "Comfortable",
    "nav.card": "Card",
    "nav.nowPlaying": "Now Playing: {name}",
    "music.emptyTitle": "Music library is empty",
    "music.emptyHint": "Add MP3, FLAC, WAV, OGG, M4A or OPUS files.",
    "music.noResultsTitle": "No results found",
    "music.noResultsHint": "Change the search filter and try the library again.",
    "music.playing": "Playing",
    "video.emptyTitle": "Video library is empty",
    "video.emptyHint": "Add MP4, MKV, WebM, MOV or AVI files.",
    "video.noResultsHint": "Change the search filter and try the video library again.",
    "video.back": "Back",
    "video.fullscreen": "Fullscreen",
    "video.play": "Play video",
    "video.miniPlayer": "Mini player",
    "video.restore": "Return to workspace",
    "video.closeMini": "Close mini player",
    "video.position": "Video position",
    "video.quality": "Quality",
    "video.auto": "Auto",
    "video.stableVolume": "Stable volume",
    "video.volumeBoost": "Volume boost",
    "video.cinematicLight": "Cinematic lighting",
    "video.captions": "Captions",
    "video.subtitles": "Subtitles (1)",
    "video.sleepTimer": "Sleep timer",
    "video.closed": "Off",
    "video.open": "On",
    "video.speed": "Playback speed",
    "video.normal": "Normal",
    "player.position": "Playback position",
    "player.clear": "Clear",
    "player.shuffle": "Shuffle",
    "player.previous": "Previous",
    "player.rewind10": "10s back",
    "player.playPause": "Play / Pause",
    "player.forward10": "10s forward",
    "player.next": "Next",
    "player.repeat": "Repeat",
    "player.repeatOne": "Repeat current song",
    "player.unmute": "Unmute",
    "player.mute": "Mute",
    "player.volume": "Volume",
    "common.removeFromLibrary": "Remove from library",
    "sfx.windowTitle": "Sound Effects ({scope}) - ArDali",
    "sfx.scope.music": "Music",
    "sfx.scope.video": "Video",
    "sfx.scope.web": "Web",
    "sfx.enableEffects": "Enable Sound Effects",
    "sfx.lightColor": "Light Color",
    "sfx.light.cyan": "Sky Blue",
    "sfx.light.rainbow": "Rainbow",
    "sfx.light.blue": "Blue",
    "sfx.light.purple": "Purple",
    "sfx.light.green": "Green",
    "sfx.light.amber": "Amber",
    "sfx.light.red": "Red",
    "sfx.light.off": "Off",
    "sfx.status": "DSP: {state} • Scope: {scope} • Active: {active}",
    "sfx.on": "On",
    "sfx.off": "Off",
    "sfx.enabled": "Enabled",
    "sfx.presets": "Presets",
    "sfx.reset": "Reset",
    "sfx.module": "ArDali Module",
    "sfx.resetModule": "Reset Module",
    "sfx.balance": "Balance (Left ↔ Right)",
    "sfx.center": "Center",
    "sfx.resize": "Resize window",
    "sfx.stereoField": "Stereo Field Simulation",
    "sfx.dspStatus": "DSP Status: {state} | Loaded: {loaded}",
    "sfx.connected": "Connected",
    "sfx.waiting": "Waiting",
    "sfx.headphonesDetected": "{device} detected as headphones. Crossfeed is suitable.",
    "sfx.speakersDetected": "{device} detected as speaker/line output. Crossfeed is usually not required.",
    "sfx.outputUnknown": "Output information could not be read. Crossfeed stays in manual mode.",
    "sfx.crossfeedAuto": "Automatically toggle crossfeed for headphone connection",
    "sfx.lowHighCut": "Low Cut {low} Hz • High Cut {high} Hz",
    "sfx.truePeakMeters": "Stereo True Peak Meters",
    "sfx.clipping": "Clipping:",
    "sfx.oversampling": "Oversampling:",
    "sfx.stereoLink": "Stereo Link",
    "sfx.truePeakActive": "Limiter active: Clipping {clip}, current GR {gr} dB.",
    "sfx.truePeakIdle": "Limiter off: meter and clipping counter are waiting.",
    "sfx.slope": "Slope",
    "sfx.bassMonoNote": "Frequencies below cutoff are summed to mono center; the upper band keeps or expands stereo width.",
    "eqPresets.title": "Presets",
    "eqPresets.windowTitle": "ArDali Presets - ArDali Media Player",
    "eqPresets.search": "Search presets...",
    "eqPresets.viewMode": "View mode",
    "eqPresets.quality": "Full",
    "eqPresets.balanced": "Balanced",
    "eqPresets.performance": "Minimum",
    "eqPresets.category": "Category",
    "eqPresets.shown": "Shown: {visible} / {total} • Group: {group}",
    "eqPresets.loadError": "Presets could not be loaded",
    "eqPresets.hintQuality": "Full mode: all animation and visual effects are active.",
    "eqPresets.hintBalanced": "Balanced mode: animations are simplified and performance is more stable.",
    "eqPresets.hintPerformance": "Minimum mode: lightest view with minimal animation and effects.",
  },
  "ar-SA": {
    "app.title": "ArDali WebMedia",
    "common.cancel": "إلغاء",
    "common.close": "إغلاق",
    "common.save": "حفظ",
    "common.resetDefaults": "إعادة الإعدادات الافتراضية",
    "common.yes": "نعم",
    "common.no": "لا",
    "window.minimize": "تصغير",
    "window.maximize": "تكبير",
    "rail.video": "الفيديوهات",
    "rail.music": "الموسيقى",
    "rail.gallery": "المعرض",
    "rail.web": "الويب",
    "rail.listen": "الاستماع",
    "rail.downloads": "التنزيلات",
    "rail.soundEffects": "المؤثرات الصوتية",
    "rail.visualizer": "المؤثرات المرئية",
    "rail.settings": "الإعدادات",
    "rail.about": "حول",
    "settings.title": "التفضيلات",
    "settings.aria": "أقسام الإعدادات",
    "settings.tabs.web": "إعدادات الويب",
    "settings.tabs.playback": "التشغيل",
    "settings.tabs.keyboard": "اختصارات لوحة المفاتيح",
    "settings.tabs.listen": "الاستماع",
    "settings.tabs.behavior": "السلوك",
    "settings.tabs.security": "الأمان",
    "settings.tabs.library": "مكتبة الوسائط",
    "settings.tabs.gallery": "المعرض",
    "settings.tabs.audio": "مخرج الصوت",
    "settings.theme.aur": "مشغل وسائط ArDali",
    "settings.theme.performanceBalanced": "تدفق متوازن",
    "settings.theme.performanceLite": "ثابت للأجهزة الضعيفة",
    "settings.theme.ardali": "ArDali",
    "settings.theme.dark": "داكن",
    "settings.theme.black": "أسود",
    "settings.theme.light": "فاتح",
    "settings.theme.frappe": "فرابيه",
    "settings.theme.onedark": "ون دارك",
    "settings.theme.matrix": "ماتريكس",
    "settings.theme.latte": "لاتيه",
    "settings.theme.solarizedDark": "سولارايزد داكن",
    "settings.theme.neonNight": "ليلة نيون",
    "settings.theme.retroAmber": "عنبر قديم",
    "settings.theme.deepOcean": "محيط عميق",
    "settings.theme.forestMint": "نعناع الغابة",
    "settings.keyboard.media": "اختصارات الوسائط",
    "settings.keyboard.sections": "الأقسام الرئيسية",
    "settings.keyboard.tools": "الأدوات",
    "settings.keyboard.playPause": "تشغيل / إيقاف مؤقت",
    "settings.keyboard.previous": "المقطع السابق",
    "settings.keyboard.next": "المقطع التالي",
    "settings.keyboard.mute": "كتم / تشغيل الصوت",
    "settings.keyboard.seekBack": "رجوع 5 ثوان",
    "settings.keyboard.seekForward": "تقدم 5 ثوان",
    "settings.keyboard.music": "الموسيقى",
    "settings.keyboard.video": "الفيديو",
    "settings.keyboard.gallery": "المعرض",
    "settings.keyboard.web": "الويب",
    "settings.keyboard.settings": "الإعدادات",
    "settings.keyboard.soundEffects": "المؤثرات الصوتية",
    "settings.keyboard.visualizer": "المرئيات",
    "settings.keyboard.fullscreen": "ملء الشاشة",
    "settings.playback.startupSection": "بدء التشغيل",
    "settings.playback.restoreLastTrack": "استعادة آخر مقطع عند البدء",
    "settings.playback.restoreLastTrackHint": "يجهز آخر مقطع محدد عند فتح التطبيق.",
    "settings.playback.autoplayLastTrack": "تشغيل آخر مقطع تلقائيا عند البدء",
    "settings.playback.autoplayLastTrackHint": "يبدأ التشغيل بعد استعادة آخر مقطع.",
    "settings.playback.resumePosition": "متابعة آخر مقطع من موضعه المحفوظ",
    "settings.playback.resumePositionHint": "يبدأ من الوقت المحفوظ بدلا من البداية.",
    "settings.playback.transitionsSection": "الانتقالات",
    "settings.playback.fadeOnPause": "تلاشي الصوت عند الإيقاف المؤقت",
    "settings.playback.fadeOnPauseHint": "يخفض الصوت بتلاشي قصير قبل الإيقاف المؤقت.",
    "settings.playback.fadeOnStop": "تلاشي الصوت عند الإيقاف",
    "settings.playback.fadeOnStopHint": "يقلل القطع المفاجئ عند الإيقاف.",
    "settings.playback.fadeDuration": "مدة التلاشي",
    "settings.playback.fadeDurationHint": "مدة تلاشي الإيقاف المؤقت/الإيقاف.",
    "settings.playback.crossfadeManual": "انتقال متداخل عند تغيير المقاطع",
    "settings.playback.crossfadeManualHint": "يجعل الانتقال إلى السابق/التالي أكثر سلاسة.",
    "settings.playback.crossfadeAuto": "انتقال متداخل تلقائي قبل نهاية المقطع",
    "settings.playback.crossfadeAutoHint": "ينتقل إلى المقطع التالي بسلاسة قرب النهاية.",
    "settings.playback.crossfadeDuration": "مدة الانتقال المتداخل",
    "settings.playback.crossfadeDurationHint": "المدة المستخدمة في الانتقالات اليدوية والتلقائية.",
    "settings.behavior.languageSection": "اختيار اللغة",
    "settings.behavior.languageLabel": "اللغة",
    "settings.behavior.languageHint": "يتطلب تغيير اللغة إعادة تشغيل بعد الحفظ.",
    "settings.behavior.appearanceSection": "المظهر",
    "settings.behavior.themeLabel": "السمة",
    "settings.behavior.themeHint": "يغير ألوان التطبيق مباشرة.",
    "settings.behavior.followSystemTheme": "اتباع سمة النظام",
    "settings.behavior.followSystemThemeHint": "عند التفعيل يتبع التطبيق تفضيل النظام للوضع الفاتح أو الداكن.",
    "settings.behavior.startupSection": "سلوك بدء التشغيل",
    "settings.behavior.rememberLastSection": "تذكر آخر قسم رئيسي",
    "settings.behavior.rememberLastSectionHint": "يفتح التطبيق القسم الرئيسي الذي استخدمته آخر مرة.",
    "settings.behavior.startupPageLabel": "قسم البدء الافتراضي",
    "settings.behavior.startupPageHint": "يستخدم عندما يكون تذكر آخر قسم متوقفا.",
    "settings.behavior.startupPageMusic": "الوسائط (الصوت)",
    "settings.behavior.startupPageVideo": "الفيديو",
    "settings.behavior.startupPageGallery": "المعرض",
    "settings.behavior.startupPageWeb": "الويب",
    "settings.behavior.startupPageListen": "الاستماع",
    "settings.behavior.restartTitle": "إعادة التشغيل مطلوبة",
    "settings.behavior.restartMessage": "يجب إعادة تشغيل التطبيق لتطبيق تغيير اللغة. هل تريد إعادة التشغيل الآن؟",
    "settings.web.general": "عام",
    "settings.web.enable": "تفعيل تجربة الويب",
    "settings.web.defaultPlatform": "المنصة الافتراضية",
    "settings.web.defaultPlatformHint": "المنصة التي يتم اختيارها عند فتح تبويب الويب لأول مرة",
    "settings.web.rememberPlatform": "تذكر آخر منصة ويب مستخدمة",
    "settings.web.restoreSession": "استعادة نفس المنصة إذا أُغلق التطبيق على تبويب الويب",
    "settings.web.suspendInactive": "إغلاق جلسة الويب عندما يكون التبويب غير نشط",
    "settings.web.startupDelay": "تأخير تحميل الويب عند البدء",
    "settings.web.startupDelayHint": "يؤخر تشغيل WebView الأول على الأنظمة البطيئة",
    "settings.web.delayInstant": "فوري (0 ث)",
    "settings.web.delayShort": "قصير (0.35 ث)",
    "settings.web.delayBalanced": "متوازن (0.7 ث)",
    "settings.web.delaySlow": "نظام بطيء (1.2 ث)",
    "settings.web.appearance": "المظهر والحركة",
    "settings.web.animation": "حركة واجهة الويب",
    "settings.web.animationHint": "طريقة تعامل الشريط العلوي والجانبي مع محتوى الويب",
    "settings.web.animationCompact": "مضغوط",
    "settings.web.animationDock": "نمط Dock",
    "settings.web.motion": "سرعة حركة الويب",
    "settings.web.motionHint": "إيقاع إخفاء وإظهار الأشرطة",
    "settings.web.motionCalm": "هادئ",
    "settings.web.motionBalanced": "متوازن",
    "settings.web.motionFast": "سريع",
    "settings.web.autoHide": "إخفاء الشريط العلوي والجانبي تلقائيًا أثناء المشاهدة",
    "settings.web.lowPower": "وضع النظام الضعيف لحركات الويب",
    "settings.web.autoHideDelay": "مدة الإخفاء التلقائي",
    "settings.web.autoHideDelayHint": "الانتظار بعد توقف حركة الفأرة",
    "settings.web.autoRecover": "إعادة تحميل شاشات الويب الفارغة تلقائيًا عند البدء",
    "settings.web.privacy": "الخصوصية والبيانات",
    "settings.web.privacyInfo": "عند تفعيل الجلسات الدائمة تُحفظ تسجيلات دخول الويب في مجلد ملف محلي محمي للمستخدم الحالي.",
    "settings.web.persistent": "الاحتفاظ بالجلسات الدائمة",
    "settings.web.private": "وضع ويب خاص",
    "settings.web.clearCacheOnQuit": "مسح ذاكرة الويب المؤقتة عند إغلاق التطبيق",
    "settings.web.clearCookiesOnQuit": "مسح ملفات تعريف الارتباط عند إغلاق التطبيق",
    "settings.web.clearSiteDataOnQuit": "مسح بيانات المواقع عند إغلاق التطبيق",
    "settings.web.preferHttps": "فتح عناوين HTTP كـ HTTPS عند الإمكان",
    "settings.web.reduceWebRtc": "تقليل تسرب IP عبر WebRTC",
    "settings.web.stripTracking": "إزالة معاملات التتبع المعروفة",
    "settings.web.blockThirdParty": "حظر ملفات تعريف ارتباط الطرف الثالث",
    "settings.web.clearCache": "مسح الذاكرة المؤقتة",
    "settings.web.clearCookies": "مسح ملفات الارتباط",
    "settings.web.clearSiteData": "مسح بيانات المواقع",
    "settings.web.clearAll": "مسح جلسات الويب",
    "settings.web.clearing": "جار مسح {target}...",
    "settings.web.cleared": "تم مسح {target}.",
    "settings.web.clearFailed": "تعذر مسح {target}.",
    "settings.web.permissions": "الأذونات والسياسة",
    "settings.web.userAgent": "وكيل المستخدم",
    "settings.web.userAgentHint": "نوع عرض الويب الذي يتم إبلاغ المنصات به",
    "settings.web.uaDesktop": "سطح المكتب",
    "settings.web.uaMobile": "الجوال",
    "settings.web.uaDefault": "افتراضي",
    "settings.web.autoplay": "تشغيل تلقائي",
    "settings.web.autoplayHint": "طريقة بدء المواقع للوسائط",
    "settings.web.autoplayAllow": "السماح",
    "settings.web.autoplayGesture": "طلب تفاعل المستخدم",
    "settings.web.autoplayBlock": "حظر",
    "settings.web.allowCamera": "السماح بإذن الكاميرا",
    "settings.web.allowMicrophone": "السماح بإذن الميكروفون",
    "settings.web.allowLocation": "السماح بإذن الموقع",
    "settings.web.allowNotifications": "السماح بالإشعارات",
    "settings.web.allowPopups": "السماح بالنوافذ المنبثقة",
    "library.title": "المكتبة",
    "library.collapseOpen": "إظهار شريط التبويبات",
    "library.collapseHide": "إخفاء شريط التبويبات",
    "library.openVideo": "فتح فيديو",
    "library.addMusic": "إضافة إلى المكتبة",
    "library.videoReady": "{count} فيديو جاهز",
    "library.musicReady": "{count} أغنية جاهزة",
    "library.pickVideo": "اختر ملف فيديو محلي",
    "library.root": "المكتبة الرئيسية",
    "library.collection": "المجموعة",
    "library.nowPlaying": "يتم التشغيل الآن",
    "library.queue": "قائمة الانتظار",
    "library.search": "ابحث في المكتبة...",
    "library.savedFolders": "المجلدات المحفوظة",
    "library.localVideo": "فيديو محلي",
    "library.localMusic": "موسيقى محلية",
    "library.shown": "المعروض: {count}",
    "library.cleanMissing": "تنظيف الملفات المفقودة",
    "nav.back": "رجوع",
    "nav.forward": "تقدم",
    "nav.refresh": "تحديث",
    "nav.viewSettings": "إعدادات العرض",
    "nav.musicViewSettings": "إعدادات عرض الموسيقى",
    "nav.list": "قائمة",
    "nav.compact": "مضغوط",
    "nav.comfortable": "مريح",
    "nav.card": "بطاقات",
    "nav.nowPlaying": "يتم التشغيل الآن: {name}",
    "music.emptyTitle": "مكتبة الموسيقى فارغة",
    "music.emptyHint": "أضف ملفات MP3 أو FLAC أو WAV أو OGG أو M4A أو OPUS.",
    "music.noResultsTitle": "لم يتم العثور على نتائج",
    "music.noResultsHint": "غيّر مرشح البحث وحاول مرة أخرى في المكتبة.",
    "music.playing": "قيد التشغيل",
    "video.emptyTitle": "مكتبة الفيديو فارغة",
    "video.emptyHint": "أضف ملفات MP4 أو MKV أو WebM أو MOV أو AVI.",
    "video.noResultsHint": "غيّر مرشح البحث وحاول مرة أخرى في مكتبة الفيديو.",
    "video.back": "رجوع",
    "video.fullscreen": "ملء الشاشة",
    "video.play": "تشغيل الفيديو",
    "video.miniPlayer": "مشغل مصغر",
    "video.restore": "إرجاع إلى مساحة العمل",
    "video.closeMini": "إغلاق المشغل المصغر",
    "video.position": "موضع الفيديو",
    "video.quality": "الجودة",
    "video.auto": "تلقائي",
    "video.stableVolume": "صوت ثابت",
    "video.volumeBoost": "تعزيز الصوت",
    "video.cinematicLight": "إضاءة سينمائية",
    "video.captions": "التعليقات",
    "video.subtitles": "الترجمات (1)",
    "video.sleepTimer": "مؤقت النوم",
    "video.closed": "مغلق",
    "video.open": "مفتوح",
    "video.speed": "سرعة التشغيل",
    "video.normal": "عادي",
    "player.position": "موضع التشغيل",
    "player.clear": "مسح",
    "player.shuffle": "خلط",
    "player.previous": "السابق",
    "player.rewind10": "رجوع 10 ث",
    "player.playPause": "تشغيل / إيقاف مؤقت",
    "player.forward10": "تقدم 10 ث",
    "player.next": "التالي",
    "player.repeat": "تكرار",
    "player.repeatOne": "تكرار الأغنية الحالية",
    "player.unmute": "تشغيل الصوت",
    "player.mute": "كتم",
    "player.volume": "مستوى الصوت",
    "common.removeFromLibrary": "إزالة من المكتبة",
    "sfx.windowTitle": "المؤثرات الصوتية ({scope}) - ArDali",
    "sfx.scope.music": "الموسيقى",
    "sfx.scope.video": "الفيديو",
    "sfx.scope.web": "الويب",
    "sfx.enableEffects": "تفعيل المؤثرات الصوتية",
    "sfx.lightColor": "لون الضوء",
    "sfx.light.cyan": "أزرق سماوي",
    "sfx.light.rainbow": "قوس قزح",
    "sfx.light.blue": "أزرق",
    "sfx.light.purple": "بنفسجي",
    "sfx.light.green": "أخضر",
    "sfx.light.amber": "كهرماني",
    "sfx.light.red": "أحمر",
    "sfx.light.off": "إيقاف",
    "sfx.status": "DSP: {state} • النطاق: {scope} • النشط: {active}",
    "sfx.on": "مفعل",
    "sfx.off": "متوقف",
    "sfx.enabled": "مفعل",
    "sfx.presets": "إعدادات جاهزة",
    "sfx.reset": "إعادة ضبط",
    "sfx.module": "وحدة ArDali",
    "sfx.resetModule": "إعادة ضبط الوحدة",
    "sfx.balance": "التوازن (يسار ↔ يمين)",
    "sfx.center": "الوسط",
    "sfx.resize": "تغيير حجم النافذة",
    "sfx.stereoField": "محاكاة مجال الستيريو",
    "sfx.dspStatus": "حالة DSP: {state} | Loaded: {loaded}",
    "sfx.connected": "متصل",
    "sfx.waiting": "بانتظار",
    "sfx.headphonesDetected": "تم التعرف على {device} كسماعات. Crossfeed مناسب للاستخدام.",
    "sfx.speakersDetected": "تم التعرف على {device} كمخرج سماعات/Line. Crossfeed غالبا غير ضروري.",
    "sfx.outputUnknown": "تعذر قراءة معلومات الخرج. يبقى Crossfeed في الوضع اليدوي.",
    "sfx.crossfeedAuto": "تشغيل/إيقاف Crossfeed تلقائيا حسب اتصال السماعات",
    "sfx.lowHighCut": "Low Cut {low} Hz • High Cut {high} Hz",
    "sfx.truePeakMeters": "عدادات Stereo True Peak",
    "sfx.clipping": "Clipping:",
    "sfx.oversampling": "Oversampling:",
    "sfx.stereoLink": "ربط الستيريو",
    "sfx.truePeakActive": "المحدد مفعل: Clipping {clip}، GR الحالي {gr} dB.",
    "sfx.truePeakIdle": "المحدد متوقف: العداد وعدّاد clipping في الانتظار.",
    "sfx.slope": "الميل",
    "sfx.bassMonoNote": "الترددات تحت Cutoff تُجمع في مركز mono؛ النطاق العلوي يحافظ على عرض الستيريو أو يوسعه.",
    "eqPresets.title": "إعدادات جاهزة",
    "eqPresets.windowTitle": "إعدادات ArDali الجاهزة - ArDali Media Player",
    "eqPresets.search": "ابحث في الإعدادات...",
    "eqPresets.viewMode": "وضع العرض",
    "eqPresets.quality": "كامل",
    "eqPresets.balanced": "متوازن",
    "eqPresets.performance": "أدنى",
    "eqPresets.category": "الفئة",
    "eqPresets.shown": "المعروض: {visible} / {total} • المجموعة: {group}",
    "eqPresets.loadError": "تعذر تحميل الإعدادات الجاهزة",
    "eqPresets.hintQuality": "الوضع الكامل: كل الحركات والمؤثرات المرئية فعالة.",
    "eqPresets.hintBalanced": "الوضع المتوازن: الحركات أبسط والأداء أكثر ثباتا.",
    "eqPresets.hintPerformance": "الوضع الأدنى: أخف عرض مع أقل حركة ومؤثرات.",
  },
  "es-ES": {
    "app.title": "ArDali WebMedia",
    "common.cancel": "Cancelar",
    "common.close": "Cerrar",
    "common.save": "Guardar",
    "common.resetDefaults": "Restablecer por defecto",
    "common.yes": "Sí",
    "common.no": "No",
    "window.minimize": "Minimizar",
    "window.maximize": "Maximizar",
    "rail.video": "Vídeos",
    "rail.music": "Música",
    "rail.gallery": "Galería",
    "rail.web": "Web",
    "rail.listen": "Escuchar",
    "rail.downloads": "Descargas",
    "rail.soundEffects": "Efectos de sonido",
    "rail.visualizer": "Visualizador",
    "rail.settings": "Ajustes",
    "rail.about": "Acerca de",
    "settings.title": "Preferencias",
    "settings.aria": "Secciones de ajustes",
    "settings.tabs.web": "Ajustes web",
    "settings.tabs.playback": "Reproducción",
    "settings.tabs.keyboard": "Atajos de teclado",
    "settings.tabs.listen": "Escuchar",
    "settings.tabs.behavior": "Comportamiento",
    "settings.tabs.security": "Seguridad",
    "settings.tabs.library": "Biblioteca multimedia",
    "settings.tabs.gallery": "Galería",
    "settings.tabs.audio": "Salida de audio",
    "settings.theme.aur": "ArDali Media Player",
    "settings.theme.performanceBalanced": "Flujo equilibrado",
    "settings.theme.performanceLite": "Estable para hardware bajo",
    "settings.theme.ardali": "ArDali",
    "settings.theme.dark": "Oscuro",
    "settings.theme.black": "Negro",
    "settings.theme.light": "Claro",
    "settings.theme.frappe": "Frappé",
    "settings.theme.onedark": "One Dark",
    "settings.theme.matrix": "Matrix",
    "settings.theme.latte": "Latte",
    "settings.theme.solarizedDark": "Solarized Dark",
    "settings.theme.neonNight": "Noche neón",
    "settings.theme.retroAmber": "Ámbar retro",
    "settings.theme.deepOcean": "Océano profundo",
    "settings.theme.forestMint": "Menta bosque",
    "settings.keyboard.media": "Atajos multimedia",
    "settings.keyboard.sections": "Secciones principales",
    "settings.keyboard.tools": "Herramientas",
    "settings.keyboard.playPause": "Reproducir / pausar",
    "settings.keyboard.previous": "Pista anterior",
    "settings.keyboard.next": "Pista siguiente",
    "settings.keyboard.mute": "Silenciar / activar sonido",
    "settings.keyboard.seekBack": "Retroceder 5 segundos",
    "settings.keyboard.seekForward": "Avanzar 5 segundos",
    "settings.keyboard.music": "Música",
    "settings.keyboard.video": "Video",
    "settings.keyboard.gallery": "Galería",
    "settings.keyboard.web": "Web",
    "settings.keyboard.settings": "Ajustes",
    "settings.keyboard.soundEffects": "Efectos de sonido",
    "settings.keyboard.visualizer": "Visualizador",
    "settings.keyboard.fullscreen": "Pantalla completa",
    "settings.playback.startupSection": "Inicio",
    "settings.playback.restoreLastTrack": "Restaurar la última pista al iniciar",
    "settings.playback.restoreLastTrackHint": "Prepara la última pista seleccionada al abrir la app.",
    "settings.playback.autoplayLastTrack": "Reproducir automáticamente la última pista",
    "settings.playback.autoplayLastTrackHint": "Inicia la reproducción después de restaurar la última pista.",
    "settings.playback.resumePosition": "Continuar la última pista desde su posición guardada",
    "settings.playback.resumePositionHint": "Empieza desde el tiempo guardado en vez del inicio.",
    "settings.playback.transitionsSection": "Transiciones",
    "settings.playback.fadeOnPause": "Fundido al pausar",
    "settings.playback.fadeOnPauseHint": "Baja el sonido con un fundido corto antes de pausar.",
    "settings.playback.fadeOnStop": "Fundido al detener",
    "settings.playback.fadeOnStopHint": "Reduce cortes bruscos al detener.",
    "settings.playback.fadeDuration": "Duración del fundido",
    "settings.playback.fadeDurationHint": "Duración de los fundidos de pausa/detención.",
    "settings.playback.crossfadeManual": "Crossfade al cambiar de pista",
    "settings.playback.crossfadeManualHint": "Suaviza los cambios anterior/siguiente.",
    "settings.playback.crossfadeAuto": "Crossfade automático antes de que termine la pista",
    "settings.playback.crossfadeAutoHint": "Pasa a la siguiente pista suavemente cerca del final.",
    "settings.playback.crossfadeDuration": "Duración del crossfade",
    "settings.playback.crossfadeDurationHint": "Duración usada en transiciones manuales y automáticas.",
    "settings.behavior.languageSection": "Selección de idioma",
    "settings.behavior.languageLabel": "Idioma",
    "settings.behavior.languageHint": "Cambiar el idioma requiere reiniciar después de guardar.",
    "settings.behavior.appearanceSection": "Apariencia",
    "settings.behavior.themeLabel": "Tema",
    "settings.behavior.themeHint": "Cambia los colores de la aplicación al instante.",
    "settings.behavior.followSystemTheme": "Seguir el tema del sistema",
    "settings.behavior.followSystemThemeHint": "Si está activo, la app sigue la preferencia clara/oscura del sistema.",
    "settings.behavior.startupSection": "Comportamiento de inicio",
    "settings.behavior.rememberLastSection": "Recordar la última sección principal",
    "settings.behavior.rememberLastSectionHint": "La app abre la sección principal usada por última vez.",
    "settings.behavior.startupPageLabel": "Sección de inicio predeterminada",
    "settings.behavior.startupPageHint": "Se usa cuando recordar la última sección está desactivado.",
    "settings.behavior.startupPageMusic": "Medios (audio)",
    "settings.behavior.startupPageVideo": "Video",
    "settings.behavior.startupPageGallery": "Galería",
    "settings.behavior.startupPageWeb": "Web",
    "settings.behavior.startupPageListen": "Escuchar",
    "settings.behavior.restartTitle": "Reinicio requerido",
    "settings.behavior.restartMessage": "La aplicación debe reiniciarse para aplicar el cambio de idioma. ¿Reiniciar ahora?",
    "settings.web.general": "General",
    "settings.web.enable": "Activar experiencia web",
    "settings.web.defaultPlatform": "Plataforma predeterminada",
    "settings.web.defaultPlatformHint": "La plataforma elegida al abrir la pestaña Web por primera vez",
    "settings.web.rememberPlatform": "Recordar la última plataforma web usada",
    "settings.web.restoreSession": "Restaurar la misma plataforma si la app se cerró en la pestaña Web",
    "settings.web.suspendInactive": "Cerrar la sesión web cuando la pestaña Web esté inactiva",
    "settings.web.startupDelay": "Retraso de carga web al iniciar",
    "settings.web.startupDelayHint": "Retrasa el primer inicio de WebView en sistemas lentos",
    "settings.web.delayInstant": "Instantáneo (0 s)",
    "settings.web.delayShort": "Corto (0.35 s)",
    "settings.web.delayBalanced": "Equilibrado (0.7 s)",
    "settings.web.delaySlow": "Sistema lento (1.2 s)",
    "settings.web.appearance": "Apariencia y movimiento",
    "settings.web.animation": "Animación de interfaz web",
    "settings.web.animationHint": "Cómo se comportan las barras superior y lateral con el contenido web",
    "settings.web.animationCompact": "Compacto",
    "settings.web.animationDock": "Estilo Dock",
    "settings.web.motion": "Velocidad de animación web",
    "settings.web.motionHint": "El ritmo para ocultar/mostrar las barras",
    "settings.web.motionCalm": "Calma",
    "settings.web.motionBalanced": "Equilibrada",
    "settings.web.motionFast": "Rápida",
    "settings.web.autoHide": "Ocultar automáticamente las barras superior y lateral al mirar",
    "settings.web.lowPower": "Modo de bajo consumo para animaciones web",
    "settings.web.autoHideDelay": "Tiempo de ocultación automática",
    "settings.web.autoHideDelayHint": "Espera después de que se detenga el movimiento del ratón",
    "settings.web.autoRecover": "Recargar automáticamente pantallas web vacías al iniciar",
    "settings.web.privacy": "Privacidad y datos",
    "settings.web.privacyInfo": "Cuando las sesiones persistentes están activas, los inicios de sesión web se guardan en la carpeta de perfil local protegida para el usuario Linux actual.",
    "settings.web.persistent": "Conservar sesiones persistentes",
    "settings.web.private": "Modo web privado",
    "settings.web.clearCacheOnQuit": "Limpiar caché web al salir",
    "settings.web.clearCookiesOnQuit": "Limpiar cookies web al salir",
    "settings.web.clearSiteDataOnQuit": "Limpiar datos del sitio al salir",
    "settings.web.preferHttps": "Abrir direcciones HTTP como HTTPS cuando sea posible",
    "settings.web.reduceWebRtc": "Reducir fugas de IP por WebRTC",
    "settings.web.stripTracking": "Eliminar parámetros de seguimiento conocidos",
    "settings.web.blockThirdParty": "Bloquear cookies de terceros",
    "settings.web.clearCache": "Limpiar caché",
    "settings.web.clearCookies": "Limpiar cookies",
    "settings.web.clearSiteData": "Limpiar datos del sitio",
    "settings.web.clearAll": "Limpiar sesiones web",
    "settings.web.clearing": "Limpiando {target}...",
    "settings.web.cleared": "{target} limpiado.",
    "settings.web.clearFailed": "No se pudo limpiar {target}.",
    "settings.web.permissions": "Permisos y política",
    "settings.web.userAgent": "Agente de usuario",
    "settings.web.userAgentHint": "Tipo de vista web informado a las plataformas",
    "settings.web.uaDesktop": "Escritorio",
    "settings.web.uaMobile": "Móvil",
    "settings.web.uaDefault": "Predeterminado",
    "settings.web.autoplay": "Reproducción automática",
    "settings.web.autoplayHint": "Cómo pueden iniciar medios los sitios web",
    "settings.web.autoplayAllow": "Permitir",
    "settings.web.autoplayGesture": "Requerir interacción del usuario",
    "settings.web.autoplayBlock": "Bloquear",
    "settings.web.allowCamera": "Permitir cámara",
    "settings.web.allowMicrophone": "Permitir micrófono",
    "settings.web.allowLocation": "Permitir ubicación",
    "settings.web.allowNotifications": "Permitir notificaciones",
    "settings.web.allowPopups": "Permitir ventanas emergentes",
    "library.title": "BIBLIOTECA",
    "library.collapseOpen": "Mostrar barra de pestañas",
    "library.collapseHide": "Ocultar barra de pestañas",
    "library.openVideo": "Abrir vídeo",
    "library.addMusic": "Añadir a la biblioteca",
    "library.videoReady": "{count} vídeos listos",
    "library.musicReady": "{count} canciones listas",
    "library.pickVideo": "Seleccionar archivo de vídeo local",
    "library.root": "Biblioteca raíz",
    "library.collection": "Colección",
    "library.nowPlaying": "Reproduciendo ahora",
    "library.queue": "Cola",
    "library.search": "Buscar en la biblioteca...",
    "library.savedFolders": "CARPETAS GUARDADAS",
    "library.localVideo": "Vídeo local",
    "library.localMusic": "Música local",
    "library.shown": "Mostrado: {count}",
    "library.cleanMissing": "Limpiar archivos faltantes",
    "nav.back": "Atrás",
    "nav.forward": "Adelante",
    "nav.refresh": "Actualizar",
    "nav.viewSettings": "Ajustes de vista",
    "nav.musicViewSettings": "Ajustes de vista de música",
    "nav.list": "Lista",
    "nav.compact": "Compacto",
    "nav.comfortable": "Cómodo",
    "nav.card": "Tarjeta",
    "nav.nowPlaying": "Reproduciendo: {name}",
    "music.emptyTitle": "La biblioteca de música está vacía",
    "music.emptyHint": "Añade archivos MP3, FLAC, WAV, OGG, M4A u OPUS.",
    "music.noResultsTitle": "No se encontraron resultados",
    "music.noResultsHint": "Cambia el filtro de búsqueda e inténtalo de nuevo.",
    "music.playing": "Reproduciendo",
    "video.emptyTitle": "La biblioteca de vídeo está vacía",
    "video.emptyHint": "Añade archivos MP4, MKV, WebM, MOV o AVI.",
    "video.noResultsHint": "Cambia el filtro de búsqueda e inténtalo en la biblioteca de vídeo.",
    "video.back": "Atrás",
    "video.fullscreen": "Pantalla completa",
    "video.play": "Reproducir vídeo",
    "video.miniPlayer": "Mini reproductor",
    "video.restore": "Volver al área de trabajo",
    "video.closeMini": "Cerrar mini reproductor",
    "video.position": "Posición del vídeo",
    "video.quality": "Calidad",
    "video.auto": "Auto",
    "video.stableVolume": "Volumen estable",
    "video.volumeBoost": "Aumento de volumen",
    "video.cinematicLight": "Iluminación cinemática",
    "video.captions": "Subtítulos",
    "video.subtitles": "Subtítulos (1)",
    "video.sleepTimer": "Temporizador de sueño",
    "video.closed": "Cerrado",
    "video.open": "Abierto",
    "video.speed": "Velocidad de reproducción",
    "video.normal": "Normal",
    "player.position": "Posición de reproducción",
    "player.clear": "Limpiar",
    "player.shuffle": "Aleatorio",
    "player.previous": "Anterior",
    "player.rewind10": "Retroceder 10 s",
    "player.playPause": "Reproducir / Pausar",
    "player.forward10": "Avanzar 10 s",
    "player.next": "Siguiente",
    "player.repeat": "Repetir",
    "player.repeatOne": "Repetir canción actual",
    "player.unmute": "Activar sonido",
    "player.mute": "Silenciar",
    "player.volume": "Volumen",
    "common.removeFromLibrary": "Quitar de la biblioteca",
    "sfx.windowTitle": "Efectos de sonido ({scope}) - ArDali",
    "sfx.scope.music": "Música",
    "sfx.scope.video": "Vídeo",
    "sfx.scope.web": "Web",
    "sfx.enableEffects": "Activar efectos de sonido",
    "sfx.lightColor": "Color de luz",
    "sfx.light.cyan": "Azul cielo",
    "sfx.light.rainbow": "Arcoíris",
    "sfx.light.blue": "Azul",
    "sfx.light.purple": "Morado",
    "sfx.light.green": "Verde",
    "sfx.light.amber": "Ámbar",
    "sfx.light.red": "Rojo",
    "sfx.light.off": "Apagado",
    "sfx.status": "DSP: {state} • Alcance: {scope} • Activo: {active}",
    "sfx.on": "Activo",
    "sfx.off": "Apagado",
    "sfx.enabled": "Activado",
    "sfx.presets": "Ajustes listos",
    "sfx.reset": "Restablecer",
    "sfx.module": "Módulo ArDali",
    "sfx.resetModule": "Restablecer módulo",
    "sfx.balance": "Balance (Izq ↔ Der)",
    "sfx.center": "Centro",
    "sfx.resize": "Cambiar tamaño de ventana",
    "sfx.stereoField": "Simulación de campo estéreo",
    "sfx.dspStatus": "Estado DSP: {state} | Loaded: {loaded}",
    "sfx.connected": "Conectado",
    "sfx.waiting": "Esperando",
    "sfx.headphonesDetected": "{device} detectado como auriculares. Crossfeed es adecuado.",
    "sfx.speakersDetected": "{device} detectado como altavoz/salida line. Crossfeed normalmente no es necesario.",
    "sfx.outputUnknown": "No se pudo leer la salida. Crossfeed queda en modo manual.",
    "sfx.crossfeedAuto": "Activar/desactivar crossfeed automáticamente con auriculares",
    "sfx.lowHighCut": "Low Cut {low} Hz • High Cut {high} Hz",
    "sfx.truePeakMeters": "Medidores Stereo True Peak",
    "sfx.clipping": "Clipping:",
    "sfx.oversampling": "Oversampling:",
    "sfx.stereoLink": "Stereo Link",
    "sfx.truePeakActive": "Limitador activo: Clipping {clip}, GR actual {gr} dB.",
    "sfx.truePeakIdle": "Limitador apagado: medidor y contador de clipping en espera.",
    "sfx.slope": "Pendiente",
    "sfx.bassMonoNote": "Las frecuencias bajo el cutoff se suman al centro mono; la banda superior conserva o amplía la anchura estéreo.",
    "eqPresets.title": "Ajustes listos",
    "eqPresets.windowTitle": "Ajustes listos ArDali - ArDali Media Player",
    "eqPresets.search": "Buscar ajuste...",
    "eqPresets.viewMode": "Modo de vista",
    "eqPresets.quality": "Completo",
    "eqPresets.balanced": "Equilibrado",
    "eqPresets.performance": "Mínimo",
    "eqPresets.category": "Categoría",
    "eqPresets.shown": "Mostrados: {visible} / {total} • Grupo: {group}",
    "eqPresets.loadError": "No se pudieron cargar los ajustes",
    "eqPresets.hintQuality": "Modo completo: todas las animaciones y efectos visuales activos.",
    "eqPresets.hintBalanced": "Modo equilibrado: animaciones simplificadas y rendimiento más estable.",
    "eqPresets.hintPerformance": "Modo mínimo: vista más ligera con animación y efectos mínimos.",
  },
};

function tr(language: AppLanguage, key: string) {
  return i18n[language]?.[key] ?? i18n["tr-TR"][key] ?? key;
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.split(`{${key}}`).join(String(value)), template);
}

const sfxEffectTranslations: Record<AppLanguage, Record<SfxEffectId, { title: string; description: string }>> = {
  "tr-TR": {
    audiophile: { title: "Ses Çıkışı (Odyofil)", description: "Sistem mikseri, çıkış cihazı, sample rate ve preamp davranışını yönetir." },
    eq32: { title: "32-Bantlı Profesyonel Ekolayzır", description: "Hassas frekans kontrolü, ton tekerlekleri, stereo genişlik ve balans." },
    reverb: { title: "Reverb (BASS FX)", description: "Oda boyutu, damping, ıslak/kuru oran ve giriş kazancı." },
    compressor: { title: "Dinamik Kompresör", description: "Threshold, ratio, attack, release, makeup gain ve knee ayarları." },
    limiter: { title: "Limiter", description: "Tepe kontrolü, lookahead ve çıkış tavan seviyesi." },
    bassboost: { title: "Bas Güçlendirici", description: "Alt frekans ağırlığı, harmonik miktarı, genişlik ve miks." },
    autogain: { title: "Auto Gain / Normalize", description: "Hedef loudness, maksimum kazanç ve tepki hızı." },
    truepeak: { title: "True Peak Limiter + Meter", description: "Oversampling, drive, ceiling ve kanal bağlama." },
    peq: { title: "Parametrik EQ (PEQ)", description: "Altı bant parametrik frekans, Q ve gain kontrolü." },
    dynamiceq: { title: "Dynamic EQ", description: "Eşik kontrollü dinamik frekans azaltma/artırma." },
    exciter: { title: "Netleştirici (Exciter)", description: "Üst harmonikler ve parlaklık miks kontrolü." },
    deesser: { title: "De-esser", description: "Sert sibilansları yumuşatmak için frekans ve threshold." },
    noisegate: { title: "Akıllı Noise Gate", description: "Arka plan gürültüsünü eşik, hold ve release ile azaltır." },
    stereowidener: { title: "Stereo Widener v2", description: "Merkez/yan seviye, bass mono ve stereo genişlik." },
    echo: { title: "Echo (Yankı)", description: "Delay, feedback, wet/dry ve high-cut kontrolü." },
    softecho: { title: "Saf Echo (Soft)", description: "Daha yumuşak atmosferik echo ayarları." },
    convreverb: { title: "Konvolüsyon Reverb (IR)", description: "Impuls yanıtlı mekan hissi, predelay ve mix." },
    crossfeed: { title: "Crossfeed (Kulaklık)", description: "Kulaklıkta daha doğal stereo sahne için kanal sızıntısı." },
    surround: { title: "Surround (5.1/7.1)", description: "Merkez, surround, LFE, crossover, delay ve mix ayarları." },
    bassmono: { title: "Bass Mono", description: "Düşük frekansları mono merkeze alır ve stereo tabanı temizler." },
    tapesat: { title: "Tape Saturation", description: "Analog bant sıcaklığı, drive, ton ve hafif hiss kontrolü." },
    bitdither: { title: "Bit-depth / Dither", description: "Bit derinliği, dither, noise shaping ve retro örnekleme." },
  },
  "en-US": {
    audiophile: { title: "Audio Output (Audiophile)", description: "Controls the system mixer, output device, sample rate and preamp behavior." },
    eq32: { title: "32-Band Professional Equalizer", description: "Precise frequency control, tone wheels, stereo width and balance." },
    reverb: { title: "Reverb (BASS FX)", description: "Room size, damping, wet/dry blend and input gain." },
    compressor: { title: "Dynamic Compressor", description: "Threshold, ratio, attack, release, makeup gain and knee controls." },
    limiter: { title: "Limiter", description: "Peak control, lookahead and output ceiling." },
    bassboost: { title: "Bass Booster", description: "Low-frequency weight, harmonics, width and mix." },
    autogain: { title: "Auto Gain / Normalize", description: "Target loudness, maximum gain and response speed." },
    truepeak: { title: "True Peak Limiter + Meter", description: "Oversampling, drive, ceiling and channel linking." },
    peq: { title: "Parametric EQ (PEQ)", description: "Six-band parametric frequency, Q and gain control." },
    dynamiceq: { title: "Dynamic EQ", description: "Threshold-controlled dynamic frequency reduction or boost." },
    exciter: { title: "Exciter / Clarity", description: "Upper harmonics and brightness mix control." },
    deesser: { title: "De-esser", description: "Frequency and threshold control for softening harsh sibilance." },
    noisegate: { title: "Smart Noise Gate", description: "Reduces background noise with threshold, hold and release." },
    stereowidener: { title: "Stereo Widener v2", description: "Mid/side level, bass mono and stereo width." },
    echo: { title: "Echo", description: "Delay, feedback, wet/dry and high-cut control." },
    softecho: { title: "Soft Echo", description: "Softer atmospheric echo settings." },
    convreverb: { title: "Convolution Reverb (IR)", description: "Impulse-response space, predelay and mix." },
    crossfeed: { title: "Crossfeed (Headphones)", description: "Channel bleed for a more natural headphone stereo stage." },
    surround: { title: "Surround (5.1/7.1)", description: "Center, surround, LFE, crossover, delay and mix settings." },
    bassmono: { title: "Bass Mono", description: "Centers low frequencies and cleans the stereo foundation." },
    tapesat: { title: "Tape Saturation", description: "Analog tape warmth, drive, tone and light hiss control." },
    bitdither: { title: "Bit-depth / Dither", description: "Bit depth, dither, noise shaping and retro resampling." },
  },
  "ar-SA": {
    audiophile: { title: "مخرج الصوت (أوديوفيل)", description: "يتحكم في خالط النظام وجهاز الخرج ومعدل العينة وسلوك التضخيم المسبق." },
    eq32: { title: "معادل احترافي 32 نطاقا", description: "تحكم دقيق في الترددات وعجلات النغمة وعرض الستيريو والتوازن." },
    reverb: { title: "صدى (BASS FX)", description: "حجم الغرفة والتخميد ونسبة الرطب/الجاف وكسب الإدخال." },
    compressor: { title: "ضاغط ديناميكي", description: "إعدادات العتبة والنسبة والهجوم والتحرير والكسب التعويضي." },
    limiter: { title: "محدد الصوت", description: "تحكم في القمم ووقت الاستباق وسقف الخرج." },
    bassboost: { title: "تعزيز الجهير", description: "وزن الترددات المنخفضة والهارمونيك والعرض والمزج." },
    autogain: { title: "كسب تلقائي / تطبيع", description: "الجهارة المستهدفة والحد الأقصى للكسب وسرعة الاستجابة." },
    truepeak: { title: "محدد وعداد True Peak", description: "Oversampling والدفع والسقف وربط القنوات." },
    peq: { title: "معادل بارامتري (PEQ)", description: "تحكم بستة نطاقات في التردد و Q والكسب." },
    dynamiceq: { title: "معادل ديناميكي", description: "خفض أو رفع ترددات ديناميكي بتحكم العتبة." },
    exciter: { title: "محسن الوضوح (Exciter)", description: "تحكم في الهارمونيك العليا ومزج اللمعان." },
    deesser: { title: "مخفف الصفير", description: "تحكم في التردد والعتبة لتليين الصفير الحاد." },
    noisegate: { title: "بوابة ضوضاء ذكية", description: "تقلل ضوضاء الخلفية بالعتبة والانتظار والتحرير." },
    stereowidener: { title: "موسع ستيريو v2", description: "مستوى الوسط/الجوانب، باس مونو، وعرض الستيريو." },
    echo: { title: "Echo (صدى)", description: "تحكم في التأخير والتغذية الراجعة والرطب/الجاف وقطع العالي." },
    softecho: { title: "صدى ناعم", description: "إعدادات صدى محيطية أنعم." },
    convreverb: { title: "صدى التفافي (IR)", description: "إحساس مكاني باستجابة نبضية، predelay ومزج." },
    crossfeed: { title: "Crossfeed (سماعات)", description: "تسريب قنوات لمشهد ستيريو طبيعي أكثر في السماعات." },
    surround: { title: "محيطي (5.1/7.1)", description: "إعدادات الوسط والمحيط و LFE والتقاطع والتأخير والمزج." },
    bassmono: { title: "باس مونو", description: "يجعل الترددات المنخفضة في الوسط وينظف قاعدة الستيريو." },
    tapesat: { title: "تشبع الشريط", description: "دفء شريط تناظري ودفع ونغمة وهسيس خفيف." },
    bitdither: { title: "عمق البت / Dither", description: "عمق البت و dither وتشكيل الضوضاء وإعادة أخذ عينات بنمط قديم." },
  },
  "es-ES": {
    audiophile: { title: "Salida de audio (audiófila)", description: "Controla el mezclador del sistema, dispositivo de salida, sample rate y preamp." },
    eq32: { title: "Ecualizador profesional de 32 bandas", description: "Control preciso de frecuencia, ruedas de tono, anchura estéreo y balance." },
    reverb: { title: "Reverb (BASS FX)", description: "Tamaño de sala, damping, mezcla wet/dry y ganancia de entrada." },
    compressor: { title: "Compresor dinámico", description: "Threshold, ratio, attack, release, makeup gain y knee." },
    limiter: { title: "Limitador", description: "Control de picos, lookahead y techo de salida." },
    bassboost: { title: "Refuerzo de graves", description: "Peso de bajas frecuencias, armónicos, anchura y mezcla." },
    autogain: { title: "Auto Gain / Normalize", description: "Loudness objetivo, ganancia máxima y velocidad de respuesta." },
    truepeak: { title: "Limitador + medidor True Peak", description: "Oversampling, drive, ceiling y enlace de canales." },
    peq: { title: "EQ paramétrico (PEQ)", description: "Control de frecuencia, Q y ganancia en seis bandas." },
    dynamiceq: { title: "Dynamic EQ", description: "Reducción o aumento dinámico de frecuencia por umbral." },
    exciter: { title: "Claridad (Exciter)", description: "Armónicos superiores y control de mezcla de brillo." },
    deesser: { title: "De-esser", description: "Frecuencia y threshold para suavizar sibilancias duras." },
    noisegate: { title: "Noise Gate inteligente", description: "Reduce ruido de fondo con threshold, hold y release." },
    stereowidener: { title: "Stereo Widener v2", description: "Nivel centro/lados, bass mono y anchura estéreo." },
    echo: { title: "Echo", description: "Control de delay, feedback, wet/dry y high-cut." },
    softecho: { title: "Echo suave", description: "Ajustes de echo atmosférico más suave." },
    convreverb: { title: "Reverb por convolución (IR)", description: "Espacio por respuesta impulsional, predelay y mezcla." },
    crossfeed: { title: "Crossfeed (auriculares)", description: "Cruce de canales para una escena estéreo más natural en auriculares." },
    surround: { title: "Surround (5.1/7.1)", description: "Ajustes de centro, surround, LFE, crossover, delay y mezcla." },
    bassmono: { title: "Bass Mono", description: "Centra las frecuencias bajas y limpia la base estéreo." },
    tapesat: { title: "Saturación de cinta", description: "Calidez de cinta analógica, drive, tono y hiss ligero." },
    bitdither: { title: "Bit-depth / Dither", description: "Profundidad de bits, dither, noise shaping y remuestreo retro." },
  },
};

const sfxParamTranslations: Record<AppLanguage, Record<string, string>> = {
  "tr-TR": {
    preamp: "Ana Kazanç",
    outputDevice: "Çıkış Cihazı",
    sampleRate: "Sample Rate",
    acousticSpace: "Akustik Alan",
    bass: "Bas (100 Hz)",
    mid: "Mid (500 Hz-2 kHz)",
    treble: "Tiz (10 kHz)",
    stereoExpander: "Stereo",
    balance: "Denge",
    frequency: "Frekans",
    gain: "Kazanç",
    targetLevel: "Hedef",
    maxGain: "Maks. Kazanç",
    speed: "Hız",
  },
  "en-US": {
    preamp: "Preamp",
    outputDevice: "Output Device",
    sampleRate: "Sample Rate",
    acousticSpace: "Acoustic Space",
    bass: "Bass (100 Hz)",
    mid: "Mid (500 Hz-2 kHz)",
    treble: "Treble (10 kHz)",
    stereoExpander: "Stereo",
    balance: "Balance",
    frequency: "Frequency",
    gain: "Gain",
    targetLevel: "Target",
    maxGain: "Max Gain",
    speed: "Speed",
  },
  "ar-SA": {
    preamp: "تضخيم مسبق",
    outputDevice: "جهاز الخرج",
    sampleRate: "معدل العينة",
    acousticSpace: "المجال الصوتي",
    bass: "الجهير (100 Hz)",
    mid: "الوسط (500 Hz-2 kHz)",
    treble: "الحدّة (10 kHz)",
    stereoExpander: "ستيريو",
    balance: "التوازن",
    frequency: "التردد",
    gain: "الكسب",
    targetLevel: "الهدف",
    maxGain: "أقصى كسب",
    speed: "السرعة",
  },
  "es-ES": {
    preamp: "Preamp",
    outputDevice: "Dispositivo de salida",
    sampleRate: "Sample Rate",
    acousticSpace: "Espacio acústico",
    bass: "Graves (100 Hz)",
    mid: "Medios (500 Hz-2 kHz)",
    treble: "Agudos (10 kHz)",
    stereoExpander: "Estéreo",
    balance: "Balance",
    frequency: "Frecuencia",
    gain: "Ganancia",
    targetLevel: "Objetivo",
    maxGain: "Ganancia máx.",
    speed: "Velocidad",
  },
};

function sfxEffectText(language: AppLanguage, id: SfxEffectId, fallback: SfxPanelDefinition | { label: string }) {
  const translated = sfxEffectTranslations[language]?.[id] ?? sfxEffectTranslations["tr-TR"][id];
  return translated ?? { title: "label" in fallback ? fallback.label : fallback.title, description: "description" in fallback ? fallback.description : "" };
}

function translateSfxParam(language: AppLanguage, param: SfxParam) {
  const translated = sfxParamTranslations[language]?.[param.key] ?? sfxParamTranslations["tr-TR"][param.key] ?? param.label;
  return { ...param, label: translated };
}

function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("web");
  const [draft, setDraft] = useState<WebSettings>(() => loadWebSettings());
  const [webClearStatus, setWebClearStatus] = useState("");
  const text = (key: string) => tr(draft.language, key);

  useEffect(() => {
    applyDocumentTheme(resolveEffectiveTheme(draft), { persist: false });
  }, [draft.theme, draft.followSystemTheme]);

  const updateDraft = <K extends keyof WebSettings>(key: K, value: WebSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const closeWindow = async () => {
    if (isTauriRuntime()) {
      await getCurrentWebviewWindow().close();
      return;
    }
    window.close();
  };

  const saveAndClose = async () => {
    const previousLanguage = loadWebSettings().language;
    saveWebSettings(draft);
    if (previousLanguage !== draft.language) {
      const shouldRestart = window.confirm(`${text("settings.behavior.restartTitle")}\n\n${text("settings.behavior.restartMessage")}`);
      if (shouldRestart && isTauriRuntime()) {
        await invoke("restart_app").catch((error) => reportClientError("app.restart", error));
        if (import.meta.env.DEV) await closeWindow();
        return;
      }
    }
    await closeWindow();
  };

  const resetDraft = () => {
    setDraft(resetWebSettings());
  };

  const clearWebDataNow = async (target: "cache" | "cookies" | "site-data" | "all", label: string) => {
    setWebClearStatus(formatLabel(text("settings.web.clearing"), { target: label }));
    try {
      await clearWebData(target);
      setWebClearStatus(formatLabel(text("settings.web.cleared"), { target: label }));
    } catch (error) {
      reportClientError("web.clear-data", error);
      setWebClearStatus(formatLabel(text("settings.web.clearFailed"), { target: label }));
    }
  };

  return (
    <main className="settings-window">
      <header className="settings-window-header" data-tauri-drag-region>
        <div className="settings-title">
          <SlidersHorizontal size={19} />
          <span>{text("settings.title")}</span>
        </div>
        <button className="settings-close-btn" onClick={() => void closeWindow()} title={text("common.close")} aria-label={text("common.close")}>
          <X size={18} />
        </button>
      </header>

      <nav className="settings-tabs" aria-label={text("settings.aria")}>
        {settingsTabs.map((tab) => (
          <button
            className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{text(tab.labelKey)}</span>
          </button>
        ))}
      </nav>

      <section className="settings-content">
        {activeTab === "web" ? (
          <>
            <h1>{text("settings.tabs.web")}</h1>
            <div className="settings-web-grid">
            <div className="settings-panel">
              <h2>{text("settings.web.general")}</h2>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft("enabled", event.target.checked)} />
                <span>{text("settings.web.enable")}</span>
              </label>

              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.defaultPlatform")}</strong>
                  <span>{text("settings.web.defaultPlatformHint")}</span>
                </div>
                <select value={draft.defaultPlatformId} onChange={(event) => updateDraft("defaultPlatformId", event.target.value)}>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="settings-check-row">
                <input type="checkbox" checked={draft.rememberLastPlatform} onChange={(event) => updateDraft("rememberLastPlatform", event.target.checked)} />
                <span>{text("settings.web.rememberPlatform")}</span>
              </label>

              <label className="settings-check-row">
                <input type="checkbox" checked={draft.restoreLastSession} onChange={(event) => updateDraft("restoreLastSession", event.target.checked)} />
                <span>{text("settings.web.restoreSession")}</span>
              </label>

              <label className="settings-check-row">
                <input type="checkbox" checked={draft.suspendWhenInactive} onChange={(event) => updateDraft("suspendWhenInactive", event.target.checked)} />
                <span>{text("settings.web.suspendInactive")}</span>
              </label>

              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.startupDelay")}</strong>
                  <span>{text("settings.web.startupDelayHint")}</span>
                </div>
                <select value={draft.startupDelayMs} onChange={(event) => updateDraft("startupDelayMs", Number(event.target.value))}>
                  <option value={0}>{text("settings.web.delayInstant")}</option>
                  <option value={350}>{text("settings.web.delayShort")}</option>
                  <option value={700}>{text("settings.web.delayBalanced")}</option>
                  <option value={1200}>{text("settings.web.delaySlow")}</option>
                </select>
              </div>
            </div>

            <div className="settings-panel">
              <h2>{text("settings.web.appearance")}</h2>
              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.animation")}</strong>
                  <span>{text("settings.web.animationHint")}</span>
                </div>
                <select value={draft.animationMode} onChange={(event) => updateDraft("animationMode", event.target.value as WebSettings["animationMode"])}>
                  <option value="compact">{text("settings.web.animationCompact")}</option>
                  <option value="dock">{text("settings.web.animationDock")}</option>
                </select>
              </div>

              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.motion")}</strong>
                  <span>{text("settings.web.motionHint")}</span>
                </div>
                <select value={draft.motionPreset} onChange={(event) => updateDraft("motionPreset", event.target.value as WebSettings["motionPreset"])}>
                  <option value="calm">{text("settings.web.motionCalm")}</option>
                  <option value="balanced">{text("settings.web.motionBalanced")}</option>
                  <option value="fast">{text("settings.web.motionFast")}</option>
                </select>
              </div>

              <label className="settings-check-row">
                <input type="checkbox" checked={draft.autoHideChrome} onChange={(event) => updateDraft("autoHideChrome", event.target.checked)} />
                <span>{text("settings.web.autoHide")}</span>
              </label>

              <label className="settings-check-row">
                <input type="checkbox" checked={draft.lowPowerMode} onChange={(event) => updateDraft("lowPowerMode", event.target.checked)} />
                <span>{text("settings.web.lowPower")}</span>
              </label>

              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.autoHideDelay")}</strong>
                  <span>{text("settings.web.autoHideDelayHint")}</span>
                </div>
                <div className="settings-number">
                  <input
                    type="number"
                    min={800}
                    max={8000}
                    step={100}
                    value={draft.chromeAutoHideDelayMs}
                    onChange={(event) => updateDraft("chromeAutoHideDelayMs", Number(event.target.value) || defaultWebSettings.chromeAutoHideDelayMs)}
                  />
                  <span>ms</span>
                </div>
              </div>

              <label className="settings-check-row">
                <input type="checkbox" checked={draft.autoRecover} onChange={(event) => updateDraft("autoRecover", event.target.checked)} />
                <span>{text("settings.web.autoRecover")}</span>
              </label>
            </div>

            <div className="settings-panel">
              <h2>{text("settings.web.privacy")}</h2>
              <div className="settings-info-row">
                {text("settings.web.privacyInfo")}
              </div>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={draft.persistentSession}
                  onChange={(event) => {
                    const persistentSession = event.target.checked;
                    setDraft((current) => ({
                      ...current,
                      persistentSession,
                      privateMode: persistentSession ? false : true,
                    }));
                  }}
                />
                <span>{text("settings.web.persistent")}</span>
              </label>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={draft.privateMode}
                  onChange={(event) => {
                    const privateMode = event.target.checked;
                    setDraft((current) => ({
                      ...current,
                      privateMode,
                      persistentSession: privateMode ? false : true,
                    }));
                  }}
                />
                <span>{text("settings.web.private")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.clearCacheOnQuit} onChange={(event) => updateDraft("clearCacheOnQuit", event.target.checked)} />
                <span>{text("settings.web.clearCacheOnQuit")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.clearCookiesOnQuit} onChange={(event) => updateDraft("clearCookiesOnQuit", event.target.checked)} />
                <span>{text("settings.web.clearCookiesOnQuit")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.clearSiteDataOnQuit} onChange={(event) => updateDraft("clearSiteDataOnQuit", event.target.checked)} />
                <span>{text("settings.web.clearSiteDataOnQuit")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.preferHttps} onChange={(event) => updateDraft("preferHttps", event.target.checked)} />
                <span>{text("settings.web.preferHttps")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.reduceWebRtcIpLeaks} onChange={(event) => updateDraft("reduceWebRtcIpLeaks", event.target.checked)} />
                <span>{text("settings.web.reduceWebRtc")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.stripTrackingParams} onChange={(event) => updateDraft("stripTrackingParams", event.target.checked)} />
                <span>{text("settings.web.stripTracking")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.blockThirdPartyCookies} onChange={(event) => updateDraft("blockThirdPartyCookies", event.target.checked)} />
                <span>{text("settings.web.blockThirdParty")}</span>
              </label>
              <div className="settings-button-grid">
                <button type="button" onClick={() => void clearWebDataNow("cache", text("settings.web.clearCache"))}>{text("settings.web.clearCache")}</button>
                <button type="button" onClick={() => void clearWebDataNow("cookies", text("settings.web.clearCookies"))}>{text("settings.web.clearCookies")}</button>
                <button type="button" onClick={() => void clearWebDataNow("site-data", text("settings.web.clearSiteData"))}>{text("settings.web.clearSiteData")}</button>
                <button type="button" onClick={() => void clearWebDataNow("all", text("settings.web.clearAll"))}>{text("settings.web.clearAll")}</button>
              </div>
              {webClearStatus ? <div className="settings-status-row">{webClearStatus}</div> : null}
            </div>

            <div className="settings-panel">
              <h2>{text("settings.web.permissions")}</h2>
              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.userAgent")}</strong>
                  <span>{text("settings.web.userAgentHint")}</span>
                </div>
                <select value={draft.userAgentMode} onChange={(event) => updateDraft("userAgentMode", event.target.value as WebSettings["userAgentMode"])}>
                  <option value="desktop">{text("settings.web.uaDesktop")}</option>
                  <option value="mobile">{text("settings.web.uaMobile")}</option>
                  <option value="default">{text("settings.web.uaDefault")}</option>
                </select>
              </div>
              <div className="settings-row">
                <div>
                  <strong>{text("settings.web.autoplay")}</strong>
                  <span>{text("settings.web.autoplayHint")}</span>
                </div>
                <select value={draft.autoplayPolicy} onChange={(event) => updateDraft("autoplayPolicy", event.target.value as WebSettings["autoplayPolicy"])}>
                  <option value="allow">{text("settings.web.autoplayAllow")}</option>
                  <option value="gesture">{text("settings.web.autoplayGesture")}</option>
                  <option value="block">{text("settings.web.autoplayBlock")}</option>
                </select>
              </div>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.allowCamera} onChange={(event) => updateDraft("allowCamera", event.target.checked)} />
                <span>{text("settings.web.allowCamera")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.allowMicrophone} onChange={(event) => updateDraft("allowMicrophone", event.target.checked)} />
                <span>{text("settings.web.allowMicrophone")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.allowLocation} onChange={(event) => updateDraft("allowLocation", event.target.checked)} />
                <span>{text("settings.web.allowLocation")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.allowNotifications} onChange={(event) => updateDraft("allowNotifications", event.target.checked)} />
                <span>{text("settings.web.allowNotifications")}</span>
              </label>
              <label className="settings-check-row">
                <input type="checkbox" checked={draft.allowPopups} onChange={(event) => updateDraft("allowPopups", event.target.checked)} />
                <span>{text("settings.web.allowPopups")}</span>
              </label>
            </div>
            </div>
          </>
        ) : activeTab === "playback" ? (
          <>
            <h1>{text("settings.tabs.playback")}</h1>
            <div className="settings-web-grid">
              <div className="settings-panel">
                <h2>{text("settings.playback.startupSection")}</h2>
                <label className="settings-toggle-row">
                  <input type="checkbox" checked={draft.playbackRestoreLastTrack} onChange={(event) => updateDraft("playbackRestoreLastTrack", event.target.checked)} />
                  <span>
                    <strong>{text("settings.playback.restoreLastTrack")}</strong>
                    <small>{text("settings.playback.restoreLastTrackHint")}</small>
                  </span>
                </label>
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.playbackAutoplayLastTrack}
                    disabled={!draft.playbackRestoreLastTrack}
                    onChange={(event) => updateDraft("playbackAutoplayLastTrack", event.target.checked)}
                  />
                  <span>
                    <strong>{text("settings.playback.autoplayLastTrack")}</strong>
                    <small>{text("settings.playback.autoplayLastTrackHint")}</small>
                  </span>
                </label>
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.playbackResumePosition}
                    disabled={!draft.playbackRestoreLastTrack}
                    onChange={(event) => updateDraft("playbackResumePosition", event.target.checked)}
                  />
                  <span>
                    <strong>{text("settings.playback.resumePosition")}</strong>
                    <small>{text("settings.playback.resumePositionHint")}</small>
                  </span>
                </label>
              </div>

              <div className="settings-panel">
                <h2>{text("settings.playback.transitionsSection")}</h2>
                <label className="settings-toggle-row">
                  <input type="checkbox" checked={draft.playbackFadeOnPause} onChange={(event) => updateDraft("playbackFadeOnPause", event.target.checked)} />
                  <span>
                    <strong>{text("settings.playback.fadeOnPause")}</strong>
                    <small>{text("settings.playback.fadeOnPauseHint")}</small>
                  </span>
                </label>
                <label className="settings-toggle-row">
                  <input type="checkbox" checked={draft.playbackFadeOnStop} onChange={(event) => updateDraft("playbackFadeOnStop", event.target.checked)} />
                  <span>
                    <strong>{text("settings.playback.fadeOnStop")}</strong>
                    <small>{text("settings.playback.fadeOnStopHint")}</small>
                  </span>
                </label>
                <div className="settings-row">
                  <div>
                    <strong>{text("settings.playback.fadeDuration")}</strong>
                    <span>{text("settings.playback.fadeDurationHint")}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={draft.playbackFadeDurationMs}
                    onChange={(event) => updateDraft("playbackFadeDurationMs", Number(event.target.value))}
                  />
                </div>
                <label className="settings-toggle-row">
                  <input type="checkbox" checked={draft.playbackCrossfadeManual} onChange={(event) => updateDraft("playbackCrossfadeManual", event.target.checked)} />
                  <span>
                    <strong>{text("settings.playback.crossfadeManual")}</strong>
                    <small>{text("settings.playback.crossfadeManualHint")}</small>
                  </span>
                </label>
                <label className="settings-toggle-row">
                  <input type="checkbox" checked={draft.playbackCrossfadeAuto} onChange={(event) => updateDraft("playbackCrossfadeAuto", event.target.checked)} />
                  <span>
                    <strong>{text("settings.playback.crossfadeAuto")}</strong>
                    <small>{text("settings.playback.crossfadeAutoHint")}</small>
                  </span>
                </label>
                <div className="settings-row">
                  <div>
                    <strong>{text("settings.playback.crossfadeDuration")}</strong>
                    <span>{text("settings.playback.crossfadeDurationHint")}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={15000}
                    step={100}
                    value={draft.playbackCrossfadeMs}
                    onChange={(event) => updateDraft("playbackCrossfadeMs", Number(event.target.value))}
                  />
                </div>
              </div>
            </div>
          </>
        ) : activeTab === "keyboard" ? (
          <>
            <h1>{text("settings.tabs.keyboard")}</h1>
            <div className="settings-shortcuts-grid">
              {keyboardShortcutGroups.map((group) => (
                <div className="settings-panel settings-shortcut-panel" key={group.titleKey}>
                  <h2>{text(group.titleKey)}</h2>
                  <div className="settings-shortcut-list">
                    {group.items.map((item) => (
                      <div className="settings-shortcut-row" key={item.labelKey}>
                        <span className="settings-shortcut-label">
                          <span className="settings-shortcut-icon">{item.icon}</span>
                          <span>{text(item.labelKey)}</span>
                        </span>
                        <div>
                          {item.keys.map((keyLabel) => (
                            <kbd key={keyLabel}>{shortcutKeyLabel(draft.language, keyLabel)}</kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : activeTab === "behavior" ? (
          <>
            <h1>{text("settings.tabs.behavior")}</h1>
            <div className="settings-panel">
              <h2>{text("settings.behavior.languageSection")}</h2>
              <div className="settings-row">
                <div>
                  <strong>{text("settings.behavior.languageLabel")}</strong>
                  <span>{text("settings.behavior.languageHint")}</span>
                </div>
                <select
                  className="settings-language-select"
                  value={draft.language}
                  onChange={(event) => updateDraft("language", event.target.value as AppLanguage)}
                >
                  {appLanguages.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.emoji} {language.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="settings-panel">
              <h2>{text("settings.behavior.appearanceSection")}</h2>
              <div className="settings-row">
                <div>
                  <strong>{text("settings.behavior.themeLabel")}</strong>
                  <span>{text("settings.behavior.themeHint")}</span>
                </div>
                <select value={draft.theme} onChange={(event) => updateDraft("theme", event.target.value as AppTheme)}>
                  {appThemes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {text(theme.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              <label className="settings-toggle-row">
                <input type="checkbox" checked={draft.followSystemTheme} onChange={(event) => updateDraft("followSystemTheme", event.target.checked)} />
                <span>
                  <strong>{text("settings.behavior.followSystemTheme")}</strong>
                  <small>{text("settings.behavior.followSystemThemeHint")}</small>
                </span>
              </label>
            </div>

            <div className="settings-panel">
              <h2>{text("settings.behavior.startupSection")}</h2>
              <label className="settings-toggle-row">
                <input type="checkbox" checked={draft.rememberLastSection} onChange={(event) => updateDraft("rememberLastSection", event.target.checked)} />
                <span>
                  <strong>{text("settings.behavior.rememberLastSection")}</strong>
                  <small>{text("settings.behavior.rememberLastSectionHint")}</small>
                </span>
              </label>

              <div className="settings-row">
                <div>
                  <strong>{text("settings.behavior.startupPageLabel")}</strong>
                  <span>{text("settings.behavior.startupPageHint")}</span>
                </div>
                <select value={draft.startupPage} onChange={(event) => updateDraft("startupPage", event.target.value as StartupPage)}>
                  {startupPages.map((startupPage) => (
                    <option key={startupPage.id} value={startupPage.id}>
                      {text(startupPage.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
          ) : (
          <div className="settings-empty-panel">
            <h1>{text(settingsTabs.find((tab) => tab.id === activeTab)?.labelKey ?? "settings.title")}</h1>
          </div>
        )}
      </section>

      <footer className="settings-footer">
        <button className="settings-secondary-btn" onClick={() => void closeWindow()}>{text("common.cancel")}</button>
        <button className="settings-secondary-btn" onClick={resetDraft}>{text("common.resetDefaults")}</button>
        <button className="settings-primary-btn" onClick={() => void saveAndClose()}>{text("common.save")}</button>
      </footer>
    </main>
  );
}

function ArdaliStoreView({
  items,
  status,
  onRefresh,
  onInstall,
  onToggle,
  onClose,
}: {
  items: ArdaliStoreItem[];
  status: string;
  onRefresh: () => void;
  onInstall: (pluginId: string, installed: boolean) => void;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onClose: () => void;
}) {
  return (
    <section className="ardali-store-view" aria-label="ArDali Magaza">
      <header className="ardali-store-head">
        <div>
          <span className="ardali-store-kicker">Resmi Yerel Mağaza</span>
          <h1>ArDali Mağaza</h1>
          <p>Bu ilk sürümde yalnızca uygulamayla gelen, resmi ve alan adı sınırlandırılmış eklentiler çalışır.</p>
        </div>
        <div className="ardali-store-head-actions">
          <button className="ardali-store-refresh" onClick={onRefresh} type="button">
            <RefreshCw size={17} />
            Yenile
          </button>
          <button className="ardali-store-close" onClick={onClose} type="button" title="Mağazayı kapat" aria-label="Mağazayı kapat">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="ardali-store-security">
        <Check size={18} />
        <span>Dışarıdan eklenti yükleme kapalı. Eklentiler Tauri komutlarına ve sistem dosyalarına erişemez.</span>
      </div>

      {status ? <div className="ardali-store-status">{status}</div> : null}

      <div className="ardali-store-grid">
        {items.map((plugin) => (
          <article className="ardali-store-card" key={plugin.id}>
            <div className="ardali-store-card-icon">
              <Store size={24} />
            </div>
            <div className="ardali-store-card-body">
              <div className="ardali-store-card-title">
                <h2>{plugin.name}</h2>
                <span>{plugin.official ? "Resmi" : "Harici"}</span>
              </div>
              <p>{plugin.description}</p>
              <div className="ardali-store-meta">
                <span>{plugin.category}</span>
                <span>v{plugin.version}</span>
                <span>{plugin.permissions.join(", ")}</span>
              </div>
              <div className="ardali-store-matches">
                {plugin.matches.map((match) => (
                  <code key={match}>{match}</code>
                ))}
              </div>
            </div>
            <div className="ardali-store-actions">
              <button
                className={plugin.installed ? "ardali-store-secondary" : "ardali-store-primary"}
                type="button"
                onClick={() => onInstall(plugin.id, !plugin.installed)}
              >
                {plugin.installed ? "Kaldır" : "Kur"}
              </button>
              <button
                className={`ardali-store-toggle ${plugin.enabled ? "active" : ""}`}
                disabled={!plugin.installed}
                type="button"
                onClick={() => onToggle(plugin.id, !plugin.enabled)}
              >
                {plugin.enabled ? "Açık" : "Kapalı"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function pathToMediaUrl(path: string) {
  if (!isTauriRuntime()) return convertFileSrc(path);
  return `http://127.0.0.1:1421/media?path=${encodeURIComponent(path)}`;
}

function pathToFileUrl(path?: string) {
  if (!path) return "";
  return encodeURI(`file://${path}`);
}

function trackFromPath(path: string, index: number, title?: string, duration = 0, lastPosition = 0, coverDataUrl?: string): Track {
  const fileName = basename(path);
  const trackTitle = title || titleFromFileName(fileName);
  const color = coverColors[index % coverColors.length];
  return {
    id: path,
    title: trackTitle,
    artist: "Yerel Dosya",
    album: "Tauri Path",
    length: duration > 0 ? formatTime(duration) : "--:--",
    duration,
    lastPosition,
    tag: "Kayitli",
    color,
    coverDataUrl,
    fileName,
    path,
    url: pathToMediaUrl(path),
  };
}

function getTrackArtwork(track?: Track) {
  if (track?.coverDataUrl) {
    return [{ src: track.coverDataUrl, sizes: "512x512", type: track.coverDataUrl.slice(5, track.coverDataUrl.indexOf(";")) || "image/jpeg" }];
  }
  return [{ src: "/icons/app/ardali_256.png", sizes: "256x256", type: "image/png" }];
}

function videoFromPath(path: string, index: number, title?: string, duration = 0, lastPosition = 0, thumbnailDataUrl?: string): VideoItem {
  const fileName = basename(path);
  return {
    id: path,
    title: title || titleFromFileName(fileName),
    meta: duration > 0 ? `Kayitli video • ${formatTime(duration)}` : "Kayitli video",
    duration,
    lastPosition,
    color: coverColors[(index + 2) % coverColors.length],
    thumbnailDataUrl,
    fileName,
    path,
    url: pathToMediaUrl(path),
  };
}

function captureVideoFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return undefined;
  const canvas = document.createElement("canvas");
  const width = 420;
  const height = Math.max(180, Math.round((width / video.videoWidth) * video.videoHeight));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  try {
    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  }
}

function matchesLibraryQuery(item: Track | VideoItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase("tr");
  if (!normalized) return true;
  return [item.title, item.fileName, item.path || "", "artist" in item ? item.artist : "", "album" in item ? item.album : ""]
    .join(" ")
    .toLocaleLowerCase("tr")
    .includes(normalized);
}

function createReverbImpulse(context: AudioContext) {
  const duration = 2.2;
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = 1 - index / length;
      data[index] = (Math.random() * 2 - 1) * Math.pow(decay, 2.4);
    }
  }

  return impulse;
}

export function App() {
  if (isSoundEffectsView()) return <SoundEffectsWindow />;
  if (isVisualizerView()) return <ProjectMWindow />;
  if (isEqPresetsView()) return <EqPresetsWindow />;
  if (isSettingsView()) return <SettingsWindow />;

  const nativeAudioMode = isTauriRuntime();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const analysisGraphTimerRef = useRef<number | null>(null);
  const projectMFeedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const autoGainPcmRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const autoGainValueRef = useRef(1);
  const projectMActiveRef = useRef(false);
  const [projectMActive, setProjectMActive] = useState(false);
  const transitionRef = useRef(false);
  const autoCrossfadeKeyRef = useRef("");
  const desiredPlaybackRef = useRef(false);
  const pendingAudioPlayUrlRef = useRef("");
  const goToTrackRef = useRef<(direction: 1 | -1) => void>(() => {});
  const handleSeekRef = useRef<(value: number) => void>(() => {});
  const seekByRef = useRef<(seconds: number) => void>(() => {});
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const videoCurrentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const visualHoldUntilRef = useRef(0);
  const nativeStateQuietUntilRef = useRef(0);
  const nativePlaybackClockRef = useRef({ position: 0, duration: 0, syncedAt: performance.now(), playing: false });
  const pendingSeekRef = useRef<{ position: number; until: number } | null>(null);
  const mprisMetadataKeyRef = useRef("");
  const mprisMetadataSentAtRef = useRef(0);
  const mprisPositionKeyRef = useRef("");
  const mprisSeekedPositionRef = useRef<number | null>(null);
  const mprisQuietUntilRef = useRef(0);
  const allowEmptyLibrarySaveRef = useRef(false);
  const effectsEnabledRef = useRef(true);
  const eqGainsRef = useRef<number[]>(flatEq);
  const dspSettingsRef = useRef<DspSettings>(defaultDspSettings);
  const nativeEffectsPayloadKeyRef = useRef("");
  const volumeRef = useRef(0.37);
  const tracksRef = useRef<Track[]>([]);
  const videosRef = useRef<VideoItem[]>([]);
  const stopAfterCurrentRef = useRef(false);
  const startupPlaybackHandledRef = useRef(false);

  const [page, setPage] = useState<PageId>("music");
  const pageRef = useRef<PageId>("music");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [videoItems, setVideoItems] = useState<VideoItem[]>([]);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState(0);
  const [effectsOpen, setEffectsOpen] = useState(true);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [eqGains, setEqGains] = useState<number[]>(flatEq);
  const [eqPreset, setEqPreset] = useState<EqPresetId>("flat");
  const [dspSettings, setDspSettings] = useState<DspSettings>(defaultDspSettings);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioActuallyPlaying, setIsAudioActuallyPlaying] = useState(false);
  const [htmlAudioFallbackActive, setHtmlAudioFallbackActive] = useState(false);
  const htmlAudioFallbackActiveRef = useRef(false);
  const setHtmlAudioFallbackMode = useCallback((active: boolean) => {
    htmlAudioFallbackActiveRef.current = active;
    setHtmlAudioFallbackActive(active);
  }, []);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoDocked, setVideoDocked] = useState(false);
  const [videoMiniClosed, setVideoMiniClosed] = useState(false);
  const [volume, setVolume] = useState(0.37);
  const [mediaSessionArtworkUrl, setMediaSessionArtworkUrl] = useState("");
  const [mprisArtworkUrl, setMprisArtworkUrl] = useState("");
  const [customMprisEnabled, setCustomMprisEnabled] = useState(false);
  const [musicViewMode, setMusicViewMode] = useState<MusicViewMode>("list");
  const [musicViewMenuOpen, setMusicViewMenuOpen] = useState(false);
  const [webSettings, setWebSettings] = useState<WebSettings>(() => loadWebSettings());
  const [activeWebPlatformId, setActiveWebPlatformId] = useState(platforms[0]?.id ?? "");
  const [storeItems, setStoreItems] = useState<ArdaliStoreItem[]>([]);
  const [storeStatus, setStoreStatus] = useState("");
  const [webRuntimeStatus, setWebRuntimeStatus] = useState("");
  const [webChromeHidden, setWebChromeHidden] = useState(false);
  const activeWebPlatformIdRef = useRef(platforms[0]?.id ?? "");
  const lastWebPlatformIdRef = useRef(platforms[0]?.id ?? "");
  const webChromeHideTimerRef = useRef<number | null>(null);
  const webChromeBoundsTimerRef = useRef<number | null>(null);
  const webFullscreenRef = useRef(false);
  const windowFocusedRef = useRef(true);
  const auxiliaryWindowFocusedRef = useRef(false);
  const lastAudibleVolumeRef = useRef(0.37);
  const text = useCallback((key: string) => tr(webSettings.language, key), [webSettings.language]);

  useEffect(() => {
    document.documentElement.lang = webSettings.language;
    document.documentElement.dir = "ltr";
    applyDocumentTheme(resolveEffectiveTheme(webSettings));
    if (isTauriRuntime()) {
      void invoke("update_tray_language", { language: webSettings.language }).catch((error) => reportClientError("tray.language", error));
    }
  }, [webSettings.language, webSettings.theme, webSettings.followSystemTheme]);

  effectsEnabledRef.current = effectsEnabled;
  pageRef.current = page;
  eqGainsRef.current = eqGains;
  dspSettingsRef.current = dspSettings;
  currentTimeRef.current = currentTime;
  videoCurrentTimeRef.current = videoCurrentTime;
  durationRef.current = duration;

  const applyNativeEffects = useCallback((options: { force?: boolean } = {}) => {
    if (!nativeAudioMode) return Promise.resolve();
    const payload = {
      effectsEnabled: effectsEnabledRef.current,
      eqGains: eqGainsRef.current,
      dspSettings: dspSettingsRef.current,
    };
    const payloadKey = JSON.stringify(payload);
    if (!options.force && payloadKey === nativeEffectsPayloadKeyRef.current) return Promise.resolve();
    nativeEffectsPayloadKeyRef.current = payloadKey;
    return invoke("native_audio_apply_effects", {
      payload,
    })
      .then(() => undefined)
      .catch((error) => {
        nativeEffectsPayloadKeyRef.current = "";
        reportClientError("native.effects", error);
      });
  }, [nativeAudioMode]);

  const applyCurrentWebDaliEffects = useCallback((reason = "runtime") => {
    if (!isTauriRuntime()) return Promise.resolve();
    const snapshot = loadScopedSfxBroadcast("web");
    return applyWebDaliEffects(toWebDaliPayload(snapshot)).catch((error) => {
      reportClientError(`web.dali.${reason}`, error);
    });
  }, []);

  const scheduleCurrentWebDaliEffects = useCallback((reason = "runtime") => {
    if (!isTauriRuntime()) return;
    [120, 450, 950, 1800, 3200].forEach((delay) => {
      window.setTimeout(() => {
        if (pageRef.current === "web") void applyCurrentWebDaliEffects(`${reason}-${delay}`);
      }, delay);
    });
  }, [applyCurrentWebDaliEffects]);

  const refreshStoreItems = useCallback(() => {
    void loadArdaliStoreItems()
      .then((items) => {
        setStoreItems(items);
        setStoreStatus(items.length ? `${items.length} resmi eklenti hazır.` : "Mağaza kataloğu boş.");
      })
      .catch((error) => {
        reportClientError("ardali-store.load", error);
        setStoreStatus("Mağaza kataloğu okunamadı.");
      });
  }, []);

  const scheduleOfficialPluginsForUrl = useCallback((url: string, reason = "runtime") => {
    if (!isTauriRuntime() || !url) return;
    [180, 700, 1500].forEach((delay) => {
      window.setTimeout(() => {
        if (pageRef.current !== "web") return;
        void applyOfficialPluginsForUrl(url).catch((error) => reportClientError(`ardali-store.apply.${reason}`, error));
      }, delay);
    });
  }, []);

  const syncNativeVolume = useCallback(
    (nextVolume: number) => {
      if (!nativeAudioMode) return;
      void invoke("native_audio_set_volume", {
        volume: Math.max(0, Math.min(1, nextVolume)),
        muted: nextVolume <= 0.001,
      }).catch((error) => reportClientError("native.volume", error));
    },
    [nativeAudioMode],
  );

  const setNativeVolumeNow = useCallback(
    (nextVolume: number) => {
      if (!nativeAudioMode) return Promise.resolve();
      return invoke("native_audio_set_volume", {
        volume: Math.max(0, Math.min(1, nextVolume)),
        muted: nextVolume <= 0.001,
      }).catch((error) => reportClientError("native.volume.immediate", error));
    },
    [nativeAudioMode],
  );

  const fadeNativeVolume = useCallback(
    (targetVolume: number, durationMs = 120) => {
      if (!nativeAudioMode) return Promise.resolve();
      const target = Math.max(0, Math.min(1, targetVolume));
      if (target <= 0.001 || durationMs <= 0) return setNativeVolumeNow(target);
      const steps = Math.max(4, Math.ceil(durationMs / 18));
      let step = 0;
      return new Promise<void>((resolve) => {
        const tick = () => {
          step += 1;
          const ratio = Math.min(1, step / steps);
          const eased = ratio * ratio * (3 - 2 * ratio);
          void invoke("native_audio_set_volume", {
            volume: target * eased,
            muted: false,
          }).catch((error) => reportClientError("native.volume.fade", error));
          if (ratio < 1) {
            window.setTimeout(tick, durationMs / steps);
            return;
          }
          resolve();
        };
        tick();
      });
    },
    [nativeAudioMode, setNativeVolumeNow],
  );

  const selectedTrackData = tracks[selectedTrack];
  const selectedVideoData = videoItems[selectedVideo];
  const persistedMusicPosition = Math.floor(Math.max(0, currentTime) / 10) * 10;
  const persistedVideoPosition = Math.floor(Math.max(0, videoCurrentTime) / 10) * 10;
  const visibleLibraryCount =
    page === "video"
      ? videoItems.filter((video) => matchesLibraryQuery(video, libraryQuery)).length
      : tracks.filter((track) => matchesLibraryQuery(track, libraryQuery)).length;

  const nowPlaying = useMemo(() => {
    if (page === "video") return selectedVideoData?.title ?? "Video";
    return selectedTrackData?.title ?? "ArDali Player - Hazir";
  }, [page, selectedTrackData, selectedVideoData]);

  useEffect(() => {
    try {
      const channel = new BroadcastChannel(soundEffectsChannelName);
      channel.onmessage = (event: MessageEvent<SfxBroadcastState>) => {
        const next = event.data;
        if (!next) return;
        const scope = normalizeSfxScope(next.scope || "music");
        if (scope === "web") {
          if (page === "web") {
            void applyWebDaliEffects(toWebDaliPayload(next)).catch((error) => reportClientError("web.dali.broadcast", error));
          }
          return;
        }
        if (scope !== "music") return;
        mprisQuietUntilRef.current = Date.now() + 1400;
        setEffectsEnabled(Boolean(next.effectsEnabled));
        if (isEqPresetId(next.eqPreset)) setEqPreset(next.eqPreset);
        if (Array.isArray(next.eqGains) && next.eqGains.length === eqFrequencies.length) setEqGains(next.eqGains);
        if (next.dspSettings) setDspSettings(next.dspSettings);
      };
      return () => channel.close();
    } catch {
      return undefined;
    }
  }, [page]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let unlisten: (() => void) | undefined;
    void listen<SfxBroadcastState>("ardali-sfx-broadcast", (event) => {
      const next = event.payload;
      if (!next) return;
      const scope = normalizeSfxScope(next.scope || "music");
      if (scope === "web") {
        if (page === "web") {
          void applyWebDaliEffects(toWebDaliPayload(next)).catch((error) => reportClientError("web.dali.event", error));
        }
        return;
      }
      if (scope !== "music") return;
      mprisQuietUntilRef.current = Date.now() + 1400;
      setEffectsEnabled(Boolean(next.effectsEnabled));
      if (isEqPresetId(next.eqPreset)) setEqPreset(next.eqPreset);
      if (Array.isArray(next.eqGains) && next.eqGains.length === eqFrequencies.length) setEqGains(next.eqGains);
      if (next.dspSettings) setDspSettings(next.dspSettings);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [page]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let unlisten: (() => void) | undefined;
    void listen<string>("webview-load-finished", (event) => {
      if (pageRef.current !== "web") return;
      setWebRuntimeStatus("");
      scheduleCurrentWebDaliEffects("load-finished");
      scheduleOfficialPluginsForUrl(event.payload, "load-finished");
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [scheduleCurrentWebDaliEffects, scheduleOfficialPluginsForUrl]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let unlisten: (() => void) | undefined;
    void listen<string>("webview-load-failed", (event) => {
      if (pageRef.current !== "web") return;
      const platformName = platforms.find((platform) => platform.id === activeWebPlatformIdRef.current)?.name ?? "Web";
      setWebRuntimeStatus(`${platformName} yuklenemedi. Yeniden deneniyor... ${event.payload}`);
      reportClientError("webview.load-failed", event.payload);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    refreshStoreItems();
    const handleStoreUpdate = () => refreshStoreItems();
    window.addEventListener("ardali-store-updated", handleStoreUpdate);
    return () => window.removeEventListener("ardali-store-updated", handleStoreUpdate);
  }, [refreshStoreItems]);

  useEffect(() => {
    const handleLocalSettings = (event: Event) => {
      const detail = (event as CustomEvent<WebSettings>).detail;
      setWebSettings(detail ?? loadWebSettings());
    };

    let unlisten: (() => void) | undefined;
    if (isTauriRuntime()) {
      void listen<WebSettings>(WEB_SETTINGS_EVENT, (event) => setWebSettings(event.payload)).then((cleanup) => {
        unlisten = cleanup;
      });
    }

    window.addEventListener(WEB_SETTINGS_EVENT, handleLocalSettings);
    return () => {
      unlisten?.();
      window.removeEventListener(WEB_SETTINGS_EVENT, handleLocalSettings);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreLibrary = async () => {
      try {
        const tauriSnapshot = isTauriRuntime() ? await invoke<LibrarySnapshot>("load_library") : null;
        const browserSnapshot = JSON.parse(localStorage.getItem(browserLibraryStorageKey) || '{"music":[],"videos":[]}') as LibrarySnapshot;
        const snapshot =
          tauriSnapshot && ((tauriSnapshot.music || []).length || (tauriSnapshot.videos || []).length)
            ? tauriSnapshot
            : browserSnapshot;

        if (cancelled) return;

        const restoredTracks = (snapshot.music || [])
          .filter((item) => item.path)
          .map((item, index) =>
            trackFromPath(
              item.path,
              index,
              item.title,
              item.duration || 0,
              item.lastPosition || 0,
              isEmbeddedCover(item.coverDataUrl) ? item.coverDataUrl : undefined,
            ),
          );
        const restoredVideos = (snapshot.videos || [])
          .filter((item) => item.path)
          .map((item, index) => videoFromPath(item.path, index, item.title, item.duration || 0, item.lastPosition || 0, item.coverDataUrl));
        const playback = snapshot.playback;
        const startupWebSettings = loadWebSettings();
        const selectedMusicIndex = startupWebSettings.playbackRestoreLastTrack
          ? restoredTracks.findIndex((track) => track.path === playback?.selectedMusicPath)
          : 0;
        const selectedVideoIndex = startupWebSettings.playbackRestoreLastTrack
          ? restoredVideos.findIndex((video) => video.path === playback?.selectedVideoPath)
          : 0;

        tracksRef.current = restoredTracks;
        videosRef.current = restoredVideos;
        setTracks(restoredTracks);
        setVideoItems(restoredVideos);
        setSelectedTrack(Math.max(0, selectedMusicIndex));
        setSelectedVideo(Math.max(0, selectedVideoIndex));
        const restoredWebPlatformId =
          startupWebSettings.rememberLastPlatform && playback?.activeWebPlatformId
            ? playback.activeWebPlatformId
            : startupWebSettings.defaultPlatformId;
        if (restoredWebPlatformId && platforms.some((platform) => platform.id === restoredWebPlatformId)) {
          activeWebPlatformIdRef.current = restoredWebPlatformId;
          lastWebPlatformIdRef.current = restoredWebPlatformId;
          setActiveWebPlatformId(restoredWebPlatformId);
        }
        const shouldRestoreLastSection = startupWebSettings.rememberLastSection && isPageId(playback?.currentPage);
        const requestedPage: PageId = shouldRestoreLastSection ? playback.currentPage! : startupWebSettings.startupPage;
        const restoredPage =
          requestedPage === "web" && (!startupWebSettings.enabled || (shouldRestoreLastSection && !startupWebSettings.restoreLastSession))
            ? "music"
            : requestedPage;
        setPage(restoredPage);
        setCurrentTime(0);
        setVideoCurrentTime(0);
        if (typeof playback?.volume === "number" && playback.volume >= 0 && playback.volume <= 1) setVolume(playback.volume);
        if (isMusicViewMode(playback?.musicViewMode)) setMusicViewMode(playback.musicViewMode);

        const effects = snapshot.effects;
        if (typeof effects?.effectsOpen === "boolean") setEffectsOpen(effects.effectsOpen);
        if (typeof effects?.effectsEnabled === "boolean") setEffectsEnabled(effects.effectsEnabled);
        if (isEqPresetId(effects?.eqPreset)) setEqPreset(effects.eqPreset);
        if (Array.isArray(effects?.eqGains) && effects.eqGains.length === eqFrequencies.length) {
          setEqGains(effects.eqGains.map((gain) => Math.max(-12, Math.min(12, Number(gain) || 0))));
        }
        if (effects?.dspSettings) {
          setDspSettings((current) => ({
            ...current,
            preampDb:
              typeof effects.dspSettings?.preampDb === "number"
                ? Math.max(-24, Math.min(24, effects.dspSettings.preampDb))
                : current.preampDb,
            outputDevice:
              typeof effects.dspSettings?.outputDevice === "string" && effects.dspSettings.outputDevice.trim()
                ? effects.dspSettings.outputDevice
                : current.outputDevice,
            sampleRate:
              typeof effects.dspSettings?.sampleRate === "string" && effects.dspSettings.sampleRate.trim()
                ? effects.dspSettings.sampleRate
                : current.sampleRate,
            bassBoost:
              typeof effects.dspSettings?.bassBoost === "number"
                ? Math.max(0, Math.min(12, effects.dspSettings.bassBoost))
                : current.bassBoost,
            bassFrequency:
              typeof effects.dspSettings?.bassFrequency === "number"
                ? Math.max(35, Math.min(220, effects.dspSettings.bassFrequency))
                : current.bassFrequency,
            bassMix:
              typeof effects.dspSettings?.bassMix === "number"
                ? Math.max(0, Math.min(100, effects.dspSettings.bassMix))
                : current.bassMix,
            bassBoostEnabled:
              typeof effects.dspSettings?.bassBoostEnabled === "boolean"
                ? effects.dspSettings.bassBoostEnabled
                : current.bassBoostEnabled,
            midGain:
              typeof effects.dspSettings?.midGain === "number"
                ? Math.max(-12, Math.min(12, effects.dspSettings.midGain))
                : current.midGain,
            trebleGain:
              typeof effects.dspSettings?.trebleGain === "number"
                ? Math.max(-12, Math.min(12, effects.dspSettings.trebleGain))
                : current.trebleGain,
            stereoWidth:
              typeof effects.dspSettings?.stereoWidth === "number"
                ? Math.max(0, Math.min(220, effects.dspSettings.stereoWidth))
                : current.stereoWidth,
            stereoWidenerEnabled:
              typeof effects.dspSettings?.stereoWidenerEnabled === "boolean"
                ? effects.dspSettings.stereoWidenerEnabled
                : current.stereoWidenerEnabled,
            stereoWidenerCenterLevel:
              typeof effects.dspSettings?.stereoWidenerCenterLevel === "number"
                ? Math.max(-12, Math.min(12, effects.dspSettings.stereoWidenerCenterLevel))
                : current.stereoWidenerCenterLevel,
            stereoWidenerSideLevel:
              typeof effects.dspSettings?.stereoWidenerSideLevel === "number"
                ? Math.max(-12, Math.min(12, effects.dspSettings.stereoWidenerSideLevel))
                : current.stereoWidenerSideLevel,
            stereoWidenerBassToMono:
              typeof effects.dspSettings?.stereoWidenerBassToMono === "number"
                ? Math.max(40, Math.min(400, effects.dspSettings.stereoWidenerBassToMono))
                : current.stereoWidenerBassToMono,
            balance:
              typeof effects.dspSettings?.balance === "number"
                ? Math.max(-100, Math.min(100, effects.dspSettings.balance))
                : current.balance,
            compressor:
              typeof effects.dspSettings?.compressor === "number"
                ? Math.max(0, Math.min(1, effects.dspSettings.compressor))
                : current.compressor,
            limiter:
              typeof effects.dspSettings?.limiter === "number"
                ? Math.max(-12, Math.min(0, effects.dspSettings.limiter))
                : current.limiter,
            autoGainEnabled:
              typeof effects.dspSettings?.autoGainEnabled === "boolean"
                ? effects.dspSettings.autoGainEnabled
                : current.autoGainEnabled,
            autoGainTargetLevel:
              typeof effects.dspSettings?.autoGainTargetLevel === "number"
                ? Math.max(-24, Math.min(-6, effects.dspSettings.autoGainTargetLevel))
                : current.autoGainTargetLevel,
            autoGainMaxGain:
              typeof effects.dspSettings?.autoGainMaxGain === "number"
                ? Math.max(0, Math.min(24, effects.dspSettings.autoGainMaxGain))
                : current.autoGainMaxGain,
            autoGainSpeed:
              typeof effects.dspSettings?.autoGainSpeed === "string" && effects.dspSettings.autoGainSpeed.trim()
                ? effects.dspSettings.autoGainSpeed
                : current.autoGainSpeed,
            limiterEnabled:
              typeof effects.dspSettings?.limiterEnabled === "boolean"
                ? effects.dspSettings.limiterEnabled
                : current.limiterEnabled,
            limiterCeiling:
              typeof effects.dspSettings?.limiterCeiling === "number"
                ? Math.max(-12, Math.min(0, effects.dspSettings.limiterCeiling))
                : current.limiterCeiling,
            limiterRelease:
              typeof effects.dspSettings?.limiterRelease === "number"
                ? Math.max(5, Math.min(1000, effects.dspSettings.limiterRelease))
                : current.limiterRelease,
            limiterLookahead:
              typeof effects.dspSettings?.limiterLookahead === "number"
                ? Math.max(0, Math.min(20, effects.dspSettings.limiterLookahead))
                : current.limiterLookahead,
            limiterGainDb:
              typeof effects.dspSettings?.limiterGainDb === "number"
                ? Math.max(-12, Math.min(12, effects.dspSettings.limiterGainDb))
                : current.limiterGainDb,
            truePeakEnabled:
              typeof effects.dspSettings?.truePeakEnabled === "boolean"
                ? effects.dspSettings.truePeakEnabled
                : current.truePeakEnabled,
            truePeakCeiling:
              typeof effects.dspSettings?.truePeakCeiling === "number"
                ? Math.max(-6, Math.min(0, effects.dspSettings.truePeakCeiling))
                : current.truePeakCeiling,
            truePeakRelease:
              typeof effects.dspSettings?.truePeakRelease === "number"
                ? Math.max(5, Math.min(500, effects.dspSettings.truePeakRelease))
                : current.truePeakRelease,
            truePeakLookahead:
              typeof effects.dspSettings?.truePeakLookahead === "number"
                ? Math.max(0, Math.min(20, effects.dspSettings.truePeakLookahead))
                : current.truePeakLookahead,
            truePeakDrive:
              typeof effects.dspSettings?.truePeakDrive === "number"
                ? Math.max(0, Math.min(12, effects.dspSettings.truePeakDrive))
                : current.truePeakDrive,
            truePeakOversampling:
              typeof effects.dspSettings?.truePeakOversampling === "number"
                ? Math.max(1, Math.min(8, effects.dspSettings.truePeakOversampling))
                : current.truePeakOversampling,
            truePeakStereoLink:
              typeof effects.dspSettings?.truePeakStereoLink === "boolean"
                ? effects.dspSettings.truePeakStereoLink
                : current.truePeakStereoLink,
            exciterEnabled:
              typeof effects.dspSettings?.exciterEnabled === "boolean"
                ? effects.dspSettings.exciterEnabled
                : current.exciterEnabled,
            exciterFrequency:
              typeof effects.dspSettings?.exciterFrequency === "number"
                ? Math.max(1000, Math.min(12000, effects.dspSettings.exciterFrequency))
                : current.exciterFrequency,
            exciterAmount:
              typeof effects.dspSettings?.exciterAmount === "number"
                ? Math.max(0, Math.min(100, effects.dspSettings.exciterAmount))
                : current.exciterAmount,
            exciterMix:
              typeof effects.dspSettings?.exciterMix === "number"
                ? Math.max(0, Math.min(100, effects.dspSettings.exciterMix))
                : current.exciterMix,
            exciterHarmonics:
              typeof effects.dspSettings?.exciterHarmonics === "string" && effects.dspSettings.exciterHarmonics.trim()
                ? effects.dspSettings.exciterHarmonics
                : current.exciterHarmonics,
            deesserEnabled:
              typeof effects.dspSettings?.deesserEnabled === "boolean"
                ? effects.dspSettings.deesserEnabled
                : current.deesserEnabled,
            deesserFrequency:
              typeof effects.dspSettings?.deesserFrequency === "number"
                ? Math.max(2000, Math.min(12000, effects.dspSettings.deesserFrequency))
                : current.deesserFrequency,
            deesserThreshold:
              typeof effects.dspSettings?.deesserThreshold === "number"
                ? Math.max(-60, Math.min(0, effects.dspSettings.deesserThreshold))
                : current.deesserThreshold,
            deesserRatio:
              typeof effects.dspSettings?.deesserRatio === "number"
                ? Math.max(1, Math.min(20, effects.dspSettings.deesserRatio))
                : current.deesserRatio,
            deesserRange:
              typeof effects.dspSettings?.deesserRange === "number"
                ? Math.max(-24, Math.min(0, effects.dspSettings.deesserRange))
                : current.deesserRange,
            noiseGateEnabled:
              typeof effects.dspSettings?.noiseGateEnabled === "boolean"
                ? effects.dspSettings.noiseGateEnabled
                : current.noiseGateEnabled,
            noiseGateThreshold:
              typeof effects.dspSettings?.noiseGateThreshold === "number"
                ? Math.max(-90, Math.min(0, effects.dspSettings.noiseGateThreshold))
                : current.noiseGateThreshold,
            noiseGateAttack:
              typeof effects.dspSettings?.noiseGateAttack === "number"
                ? Math.max(0.1, Math.min(100, effects.dspSettings.noiseGateAttack))
                : current.noiseGateAttack,
            noiseGateHold:
              typeof effects.dspSettings?.noiseGateHold === "number"
                ? Math.max(0, Math.min(500, effects.dspSettings.noiseGateHold))
                : current.noiseGateHold,
            noiseGateRelease:
              typeof effects.dspSettings?.noiseGateRelease === "number"
                ? Math.max(10, Math.min(1000, effects.dspSettings.noiseGateRelease))
                : current.noiseGateRelease,
            noiseGateRange:
              typeof effects.dspSettings?.noiseGateRange === "number"
                ? Math.max(-100, Math.min(0, effects.dspSettings.noiseGateRange))
                : current.noiseGateRange,
            echoEnabled:
              typeof effects.dspSettings?.echoEnabled === "boolean"
                ? effects.dspSettings.echoEnabled
                : current.echoEnabled,
            echoDelay:
              typeof effects.dspSettings?.echoDelay === "number"
                ? Math.max(40, Math.min(1800, effects.dspSettings.echoDelay))
                : current.echoDelay,
            echoFeedback:
              typeof effects.dspSettings?.echoFeedback === "number"
                ? Math.max(0, Math.min(95, effects.dspSettings.echoFeedback))
                : current.echoFeedback,
            echoMix:
              typeof effects.dspSettings?.echoMix === "number"
                ? Math.max(0, Math.min(100, effects.dspSettings.echoMix))
                : current.echoMix,
            echoHighCut:
              typeof effects.dspSettings?.echoHighCut === "number"
                ? Math.max(800, Math.min(18000, effects.dspSettings.echoHighCut))
                : current.echoHighCut,
            echoSoftMode:
              typeof effects.dspSettings?.echoSoftMode === "boolean"
                ? effects.dspSettings.echoSoftMode
                : current.echoSoftMode,
            convReverbEnabled:
              typeof effects.dspSettings?.convReverbEnabled === "boolean"
                ? effects.dspSettings.convReverbEnabled
                : current.convReverbEnabled,
            convReverbMix:
              typeof effects.dspSettings?.convReverbMix === "number"
                ? Math.max(0, Math.min(100, effects.dspSettings.convReverbMix))
                : current.convReverbMix,
            convReverbPredelay:
              typeof effects.dspSettings?.convReverbPredelay === "number"
                ? Math.max(0, Math.min(120, effects.dspSettings.convReverbPredelay))
                : current.convReverbPredelay,
            convReverbPreset:
              typeof effects.dspSettings?.convReverbPreset === "string" && effects.dspSettings.convReverbPreset.trim()
                ? effects.dspSettings.convReverbPreset
                : current.convReverbPreset,
            reverb:
              typeof effects.dspSettings?.reverb === "number"
                ? Math.max(0, Math.min(0.55, effects.dspSettings.reverb))
                : current.reverb,
          }));
        }
      } catch (error) {
        console.warn("Kutuphaneyi yukleme basarisiz:", error);
      } finally {
        if (!cancelled) setLibraryLoaded(true);
      }
    };

    const restoreTimer = window.setTimeout(() => {
      void restoreLibrary();
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    if (!libraryLoaded) return;

    const timeout = window.setTimeout(() => {
      const snapshot: LibrarySnapshot = {
        music: tracks
          .filter((track) => !!track.path)
          .map((track, index) => ({
            path: track.path as string,
            title: track.title,
            duration: index === selectedTrack ? duration || track.duration : track.duration,
            lastPosition: index === selectedTrack ? persistedMusicPosition : track.lastPosition,
            coverDataUrl: maybeEmbeddedTrackCover(track),
          })),
        videos: videoItems
          .filter((video) => !!video.path)
          .map((video, index) => ({
            path: video.path as string,
            title: video.title,
            duration: index === selectedVideo ? videoDuration || video.duration : video.duration,
            lastPosition: index === selectedVideo ? persistedVideoPosition : video.lastPosition,
            coverDataUrl: video.thumbnailDataUrl,
          })),
        playback: {
          currentPage: page,
          activeWebPlatformId,
          selectedMusicPath: selectedTrackData?.path,
          selectedVideoPath: selectedVideoData?.path,
          musicPosition: persistedMusicPosition,
          videoPosition: persistedVideoPosition,
          volume,
          musicViewMode,
        },
        effects: {
          effectsOpen,
          effectsEnabled,
          eqPreset,
          eqGains,
          dspSettings,
        },
      };

      if (!snapshot.music.length && !snapshot.videos.length && !allowEmptyLibrarySaveRef.current) return;
      allowEmptyLibrarySaveRef.current = false;

      if (isTauriRuntime()) {
        localStorage.setItem(browserLibraryStorageKey, JSON.stringify(snapshot));
        void invoke("save_library", { library: snapshot }).catch((error) => {
          console.warn("Kutuphaneyi kaydetme basarisiz:", error);
        });
        return;
      }

      localStorage.setItem(browserLibraryStorageKey, JSON.stringify(snapshot));
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    duration,
    dspSettings,
    effectsEnabled,
    effectsOpen,
    eqGains,
    eqPreset,
    activeWebPlatformId,
    libraryLoaded,
    musicViewMode,
    page,
    persistedMusicPosition,
    persistedVideoPosition,
    selectedTrack,
    selectedTrackData?.path,
    selectedVideo,
    selectedVideoData?.path,
    tracks,
    videoDuration,
    videoItems,
    volume,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void invoke<boolean>("is_custom_mpris_enabled")
      .then((enabled) => setCustomMprisEnabled(Boolean(enabled)))
      .catch((error) => {
        reportClientError("mpris.enabled", error);
        setCustomMprisEnabled(false);
      });
  }, []);

  useEffect(() => {
    if (!libraryLoaded || !isTauriRuntime()) return;
    const missingCoverTracks = tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => !!track.path && isFallbackCover(track.coverDataUrl));
    if (!missingCoverTracks.length) return;
    let cancelled = false;
    const loadCovers = async () => {
      for (const { track, index } of missingCoverTracks) {
        const coverDataUrl = await invoke<string | null>("extract_cover_art", { path: track.path }).catch(() => null);
        if (cancelled) return;
        if (coverDataUrl) {
          setTracks((current) =>
            current.map((item, itemIndex) =>
              itemIndex === index && isFallbackCover(item.coverDataUrl) ? { ...item, coverDataUrl } : item,
            ),
          );
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
      }
    };
    void loadCovers();
    return () => {
      cancelled = true;
    };
  }, [libraryLoaded, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const remotePlaybackAudio = audio as HTMLAudioElement & { disableRemotePlayback?: boolean };
    remotePlaybackAudio.disableRemotePlayback = true;
    audio.setAttribute("controlsList", "noremoteplayback nodownload");
    audio.setAttribute("disableRemotePlayback", "true");
  }, []);

  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (graphRef.current) return graphRef.current;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    let context: AudioContext;
    let source: MediaElementAudioSourceNode;
    try {
      context = new AudioContextCtor();
      source = context.createMediaElementSource(audio);
    } catch (error) {
      reportClientError("audio.graph", error);
      return null;
    }
    const filters = eqFrequencies.map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = graphicEqQ;
      filter.gain.value = 0;
      return filter;
    });
  const bassFilter = context.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.value = 110;
  bassFilter.gain.value = 0;
  const midFilter = context.createBiquadFilter();
  midFilter.type = "peaking";
  midFilter.frequency.value = 1150;
  midFilter.Q.value = 0.85;
  midFilter.gain.value = 0;
  const trebleFilter = context.createBiquadFilter();
  trebleFilter.type = "highshelf";
  trebleFilter.frequency.value = 9000;
  trebleFilter.gain.value = 0;
  const peqFilters = Array.from({ length: 6 }, (_, index) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0 ? "lowshelf" : index === 5 ? "highshelf" : "peaking";
    filter.frequency.value = [60, 150, 400, 1500, 5000, 12000][index];
    filter.Q.value = 1;
    filter.gain.value = 0;
    return filter;
  });
  const exciterDryGain = context.createGain();
  const exciterHighpass = context.createBiquadFilter();
  const exciterDrive = context.createGain();
  const exciterShaper = context.createWaveShaper();
  const exciterTone = context.createBiquadFilter();
  const exciterWetGain = context.createGain();
  const deesserFilter = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const autoGain = context.createGain();
  const limiterInputGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const truePeakDrive = context.createGain();
    const truePeakLimiter = context.createDynamicsCompressor();
  const stereoPanner = context.createStereoPanner();
  const reverb = context.createConvolver();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const toneGain = context.createGain();
    const gain = context.createGain();
    const analyser = context.createAnalyser();
    const rawAnalyser = context.createAnalyser();

    analyser.fftSize = 1024;
    rawAnalyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.32;
    rawAnalyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -92;
    analyser.maxDecibels = -6;
    rawAnalyser.minDecibels = -92;
    rawAnalyser.maxDecibels = -6;
    reverb.buffer = createReverbImpulse(context);
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;
    toneGain.gain.value = 1;
    truePeakDrive.gain.value = 1;
    exciterDryGain.gain.value = 1;
    exciterHighpass.type = "highpass";
    exciterHighpass.frequency.value = 3000;
    exciterHighpass.Q.value = 0.8;
    exciterDrive.gain.value = 1;
    exciterShaper.curve = makeExciterCurve("odd", 0);
    exciterShaper.oversample = "2x";
    exciterTone.type = "lowpass";
    exciterTone.frequency.value = 12000;
    exciterTone.Q.value = 0.707;
    exciterWetGain.gain.value = 0;
    deesserFilter.type = "peaking";
    deesserFilter.frequency.value = 7000;
    deesserFilter.Q.value = 4;
    deesserFilter.gain.value = 0;
    gain.gain.value = outputGainWithPreamp(volumeRef.current, dspSettingsRef.current);
    audio.volume = 1;
    source.connect(rawAnalyser);
    source.connect(filters[0]);
    filters.forEach((filter, index) => {
      const nextFilter = filters[index + 1];
      if (nextFilter) {
        filter.connect(nextFilter);
      } else {
        filter.connect(bassFilter);
      }
    });
  bassFilter.connect(midFilter);
  midFilter.connect(trebleFilter);
  trebleFilter.connect(peqFilters[0]);
  peqFilters.forEach((filter, index) => {
    const nextFilter = peqFilters[index + 1];
    if (nextFilter) filter.connect(nextFilter);
    else {
      filter.connect(exciterDryGain);
      filter.connect(exciterHighpass);
    }
  });
  exciterDryGain.connect(deesserFilter);
  exciterHighpass.connect(exciterDrive);
  exciterDrive.connect(exciterShaper);
  exciterShaper.connect(exciterTone);
  exciterTone.connect(exciterWetGain);
  exciterWetGain.connect(deesserFilter);
  deesserFilter.connect(compressor);
  compressor.connect(autoGain);
  autoGain.connect(limiterInputGain);
  limiterInputGain.connect(limiter);
  limiter.connect(stereoPanner);
  stereoPanner.connect(dryGain);
    stereoPanner.connect(reverb);
    reverb.connect(wetGain);
    dryGain.connect(toneGain);
    wetGain.connect(toneGain);
    toneGain.connect(truePeakDrive);
    truePeakDrive.connect(truePeakLimiter);
    truePeakLimiter.connect(gain);
    gain.connect(analyser);
    analyser.connect(context.destination);

  const graph: AudioGraph = {
    context,
    analyser,
    rawAnalyser,
    bassFilter,
    midFilter,
    trebleFilter,
    peqFilters,
    exciterDryGain,
    exciterHighpass,
    exciterDrive,
    exciterShaper,
    exciterTone,
    exciterWetGain,
    exciterCurveKey: "odd:0.0",
    deesserFilter,
    compressor,
    autoGain,
    limiterInputGain,
    dryGain,
    filters,
    limiter,
    stereoPanner,
    reverb,
    toneGain,
    wetGain,
    truePeakDrive,
    truePeakLimiter,
    gain,
  };
  graphRef.current = graph;
    const activeEffects = effectsEnabledRef.current;
    const currentEqGains = eqGainsRef.current;
    const currentDspSettings = dspSettingsRef.current;
    const now = context.currentTime;
    const compressorAmount = activeEffects ? currentDspSettings.compressor : 0;
    const reverbMix = activeEffects ? currentDspSettings.reverb : 0;
    filters.forEach((filter, index) => {
      filter.gain.setValueAtTime(activeEffects ? (currentEqGains[index] ?? 0) : 0, now);
    });
    bassFilter.frequency.setValueAtTime(activeEffects ? Math.max(35, Math.min(220, currentDspSettings.bassFrequency)) : 110, now);
    bassFilter.gain.setValueAtTime(activeEffects ? effectiveBassGain(currentDspSettings) : 0, now);
    toneGain.gain.setValueAtTime(activeEffects ? bassOutputTrim(currentDspSettings) : 1, now);
    midFilter.gain.setValueAtTime(activeEffects ? currentDspSettings.midGain : 0, now);
    trebleFilter.gain.setValueAtTime(activeEffects ? currentDspSettings.trebleGain : 0, now);
    peqFilters.forEach((filter, index) => {
      const band = currentDspSettings.peqBands?.[index];
      filter.type = index === 0 ? "lowshelf" : index === 5 ? "highshelf" : "peaking";
      filter.frequency.setValueAtTime(activeEffects && currentDspSettings.peqEnabled ? Math.max(20, Math.min(20000, band?.freq ?? filter.frequency.value)) : filter.frequency.value, now);
      filter.Q.setValueAtTime(activeEffects && currentDspSettings.peqEnabled ? Math.max(0.1, Math.min(10, band?.q ?? 1)) : 1, now);
      filter.gain.setValueAtTime(activeEffects && currentDspSettings.peqEnabled ? Math.max(-15, Math.min(15, band?.gain ?? 0)) : 0, now);
    });
    updateExciterGraph(graph, currentDspSettings, activeEffects, true);
    updateDeesserGraph(graph, currentDspSettings, activeEffects, true);
    stereoPanner.pan.setValueAtTime(activeEffects ? Math.max(-1, Math.min(1, currentDspSettings.balance / 100)) : 0, now);
    compressor.threshold.setValueAtTime(compressorAmount > 0 ? -8 - compressorAmount * 28 : 0, now);
    compressor.knee.setValueAtTime(12 + compressorAmount * 18, now);
    compressor.ratio.setValueAtTime(1 + compressorAmount * 7, now);
    compressor.attack.setValueAtTime(0.005 + compressorAmount * 0.018, now);
    compressor.release.setValueAtTime(0.18 + compressorAmount * 0.28, now);
    limiter.threshold.setValueAtTime(activeEffects ? currentDspSettings.limiter : 0, now);
    limiter.knee.setValueAtTime(0, now);
    limiter.ratio.setValueAtTime(activeEffects ? 20 : 1, now);
    limiter.attack.setValueAtTime(activeEffects ? Math.max(0.001, Math.min(0.02, (currentDspSettings.limiterLookahead ?? 5) / 1000)) : 0.002, now);
    limiter.release.setValueAtTime(activeEffects ? Math.max(0.005, Math.min(1, (currentDspSettings.limiterRelease ?? 50) / 1000)) : 0.08, now);
    limiterInputGain.gain.setValueAtTime(activeEffects ? dbToLinear(currentDspSettings.limiterGainDb ?? 0) : 1, now);
    truePeakDrive.gain.setValueAtTime(activeEffects && currentDspSettings.truePeakEnabled ? dbToLinear(currentDspSettings.truePeakDrive ?? 0) : 1, now);
    truePeakLimiter.threshold.setValueAtTime(activeEffects && currentDspSettings.truePeakEnabled ? currentDspSettings.truePeakCeiling ?? -0.1 : 0, now);
    truePeakLimiter.knee.setValueAtTime(0, now);
    truePeakLimiter.ratio.setValueAtTime(activeEffects && currentDspSettings.truePeakEnabled ? 30 : 1, now);
    truePeakLimiter.attack.setValueAtTime(activeEffects && currentDspSettings.truePeakEnabled ? Math.max(0.001, Math.min(0.02, (currentDspSettings.truePeakLookahead ?? 5) / 1000)) : 0.002, now);
    truePeakLimiter.release.setValueAtTime(activeEffects && currentDspSettings.truePeakEnabled ? Math.max(0.005, Math.min(0.5, (currentDspSettings.truePeakRelease ?? 50) / 1000)) : 0.05, now);
    dryGain.gain.setValueAtTime(1 - reverbMix * 0.34, now);
    wetGain.gain.setValueAtTime(reverbMix, now);
    return graph;
  }, []);

  const playAudioElement = useCallback(async () => {
    if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) {
      desiredPlaybackRef.current = true;
      try {
        await invoke("native_audio_play");
        setIsAudioActuallyPlaying(true);
        setIsPlaying(true);
      } catch (error) {
        reportClientError("native.play", error);
        desiredPlaybackRef.current = false;
        setIsAudioActuallyPlaying(false);
        setIsPlaying(false);
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    desiredPlaybackRef.current = true;
    try {
      const graph = graphRef.current;
      if (graph) {
        audio.volume = 1;
        if (!transitionRef.current) graph.gain.gain.value = volumeRef.current;
        void graph.context.resume().catch((error) => {
          reportClientError("audio.context.resume", error);
        });
      } else {
        audio.volume = volumeRef.current;
      }
      if (!desiredPlaybackRef.current) return;
      await audio.play();
      if (graph?.context.state === "suspended") {
        void graph.context.resume().catch((error) => {
          reportClientError("audio.context.resume.after-play", error);
        });
      }
      setIsPlaying(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (desiredPlaybackRef.current && (name === "AbortError" || name === "NotSupportedError")) {
        window.setTimeout(() => {
          if (desiredPlaybackRef.current) void playAudioElement();
        }, 120);
        return;
      }
      reportClientError("audio.play", error);
      desiredPlaybackRef.current = false;
      setIsPlaying(false);
    }
  }, [nativeAudioMode]);

  const syncAudioVolume = useCallback(
    (nextVolume: number) => {
      const audio = audioRef.current;
      const video = videoRef.current;
      volumeRef.current = nextVolume;
      if (nextVolume > 0.01) lastAudibleVolumeRef.current = nextVolume;
      syncNativeVolume(nextVolume);
      const nativeOnly = nativeAudioMode && !htmlAudioFallbackActiveRef.current;
      if (audio) {
        audio.volume = nativeOnly ? 0 : graphRef.current ? 1 : nextVolume;
        audio.muted = nativeOnly ? true : nextVolume <= 0.01;
      }
      if (video) video.volume = nextVolume;
      if (graphRef.current) {
        const targetGain = outputGainWithPreamp(nextVolume, dspSettingsRef.current);
        graphRef.current.gain.gain.setTargetAtTime(nativeOnly ? 0 : targetGain, graphRef.current.context.currentTime, 0.01);
      }
    },
    [nativeAudioMode, syncNativeVolume],
  );

  const toggleMute = useCallback(() => {
    setVolume((current) => (current > 0.01 ? 0 : Math.max(0.12, lastAudibleVolumeRef.current || 0.37)));
  }, []);

  const ensureAnalysisGraphAfterPlayback = useCallback(() => {
    if (graphRef.current || analysisGraphTimerRef.current !== null) return;
    analysisGraphTimerRef.current = window.setTimeout(() => {
      analysisGraphTimerRef.current = null;
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended || !desiredPlaybackRef.current) return;
      const graph = ensureAudioGraph();
      if (!graph) return;
      syncAudioVolume(volumeRef.current);
      void graph.context.resume().catch((error) => {
        reportClientError("audio.context.resume.analysis", error);
      });
      if (audio.paused && desiredPlaybackRef.current) void playAudioElement();
    }, 350);
  }, [ensureAudioGraph, playAudioElement, syncAudioVolume]);

  const fadeOutputGain = useCallback(
    (targetVolume: number, durationMs: number) =>
      new Promise<void>((resolve) => {
        const graph = graphRef.current ?? ensureAudioGraph();
        const nextVolume = Math.max(0, Math.min(1, targetVolume));
        if (graph) {
          const now = graph.context.currentTime;
          const param = graph.gain.gain;
          param.cancelScheduledValues(now);
          param.setValueAtTime(param.value, now);
          param.linearRampToValueAtTime(nextVolume, now + Math.max(0.02, durationMs / 1000));
          window.setTimeout(resolve, durationMs + 35);
          return;
        }

        const audio = audioRef.current;
        if (!audio) {
          resolve();
          return;
        }
        const start = audio.volume;
        const started = performance.now();
        const step = () => {
          const ratio = Math.min(1, (performance.now() - started) / Math.max(1, durationMs));
          audio.volume = start + (nextVolume - start) * ratio;
          if (ratio < 1) window.requestAnimationFrame(step);
          else resolve();
        };
        step();
      }),
    [ensureAudioGraph],
  );

  const openSoundEffectsWindow = useCallback(async () => {
    const scope = page === "video" ? "video" : page === "web" ? "web" : "music";
    const url = `/?view=sound-effects&scope=${scope}`;
    const title = getSoundEffectsWindowTitle(scope, webSettings.language);

    if (!isTauriRuntime()) {
      window.open(url, "ardali-sound-effects", "width=1300,height=800");
      return;
    }

    try {
      const existing = await WebviewWindow.getByLabel("sound-effects");
      if (existing) {
        await existing.close();
      }

      const webview = new WebviewWindow("sound-effects", {
        url,
        title,
        width: 1300,
        height: 800,
        minWidth: 860,
        minHeight: 560,
        resizable: true,
        decorations: false,
        center: true,
        visible: true,
      });

      webview.once("tauri://error", (event) => {
        reportClientError("sound-effects.window", event.payload);
      });
    } catch (error) {
      reportClientError("sound-effects.open", error);
    }
  }, [page]);

  const openProjectMWindow = useCallback(async () => {
    if (!isTauriRuntime()) {
      window.open("/?view=projectm", "ardali-projectm", "width=1200,height=760");
      return;
    }

    try {
      await invoke<string>("start_projectm_visualizer", { language: webSettings.language, theme: resolveEffectiveTheme(webSettings) });
      projectMActiveRef.current = true;
      setProjectMActive(true);
    } catch (error) {
      projectMActiveRef.current = false;
      setProjectMActive(false);
      reportClientError("projectm.open", error);
    }
  }, [webSettings.language]);

  const openSettingsWindow = useCallback(async () => {
    const url = "/?view=settings";

    if (!isTauriRuntime()) {
      window.open(url, "ardali-settings", "width=1180,height=820");
      return;
    }

    try {
      const existing = await WebviewWindow.getByLabel("settings");
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const webview = new WebviewWindow("settings", {
        url,
        title: "Tercihler",
        width: 1180,
        height: 820,
        minWidth: 900,
        minHeight: 620,
        resizable: true,
        decorations: false,
        center: true,
        visible: true,
      });

      webview.once("tauri://error", (event) => {
        console.warn("Ayarlar penceresi acilamadi:", event.payload);
        reportClientError("settings.window", event.payload);
      });
    } catch (error) {
      console.warn("Ayarlar penceresi acilamadi:", error);
      reportClientError("settings.open", error);
    }
  }, []);

  useEffect(() => {
    syncAudioVolume(volume);
  }, [syncAudioVolume, volume]);

  useEffect(() => {
    void applyNativeEffects();
  }, [applyNativeEffects, effectsEnabled, eqGains, dspSettings]);

  useEffect(() => {
    if (nativeAudioMode && !htmlAudioFallbackActive) return undefined;
    let cancelled = false;
    let frame = 0;
    const tick = () => {
      if (cancelled) return;
      const graph = graphRef.current;
      const active = effectsEnabledRef.current && dspSettingsRef.current.autoGainEnabled;
      if (!graph || !active || !isPlayingRef.current) {
        autoGainValueRef.current += (1 - autoGainValueRef.current) * 0.04;
        if (graph) graph.autoGain.gain.setTargetAtTime(autoGainValueRef.current, graph.context.currentTime, 0.04);
        frame = window.requestAnimationFrame(tick);
        return;
      }

      if (!autoGainPcmRef.current || autoGainPcmRef.current.length !== graph.rawAnalyser.fftSize) {
        autoGainPcmRef.current = new Float32Array(graph.rawAnalyser.fftSize);
      }
      const pcm = autoGainPcmRef.current;
      graph.rawAnalyser.getFloatTimeDomainData(pcm);
      let sum = 0;
      for (let index = 0; index < pcm.length; index += 1) sum += pcm[index] * pcm[index];
      const rms = Math.sqrt(sum / Math.max(1, pcm.length));
      const settings = dspSettingsRef.current;
      const target = dbToLinear(Math.max(-24, Math.min(-6, settings.autoGainTargetLevel ?? -14)));
      const maxBoost = dbToLinear(Math.max(0, Math.min(24, settings.autoGainMaxGain ?? 12)));
      const wanted = rms > 0.0004 ? Math.max(0.18, Math.min(maxBoost, target / rms)) : 1;
      const speed = settings.autoGainSpeed === "fast" ? 0.16 : settings.autoGainSpeed === "slow" ? 0.025 : 0.07;
      autoGainValueRef.current += (wanted - autoGainValueRef.current) * speed;
      graph.autoGain.gain.setTargetAtTime(autoGainValueRef.current, graph.context.currentTime, 0.035);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [effectsEnabled, htmlAudioFallbackActive, nativeAudioMode]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.filters.forEach((filter, index) => {
      const value = effectsEnabled ? (eqGains[index] ?? 0) : 0;
      filter.gain.setTargetAtTime(value, graph.context.currentTime, 0.015);
    });
  }, [effectsEnabled, eqGains]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    const active = effectsEnabled;
    const compressorAmount = active ? dspSettings.compressor : 0;
    const reverbMix = active ? dspSettings.reverb : 0;

    graph.bassFilter.frequency.setTargetAtTime(active ? Math.max(35, Math.min(220, dspSettings.bassFrequency)) : 110, now, 0.02);
    graph.bassFilter.gain.setTargetAtTime(active ? effectiveBassGain(dspSettings) : 0, now, 0.02);
    graph.toneGain.gain.setTargetAtTime(active ? bassOutputTrim(dspSettings) : 1, now, 0.02);
    graph.midFilter.gain.setTargetAtTime(active ? dspSettings.midGain : 0, now, 0.02);
    graph.trebleFilter.gain.setTargetAtTime(active ? dspSettings.trebleGain : 0, now, 0.02);
    graph.peqFilters.forEach((filter, index) => {
      const band = dspSettings.peqBands?.[index];
      filter.type = index === 0 ? "lowshelf" : index === 5 ? "highshelf" : "peaking";
      filter.frequency.setTargetAtTime(active && dspSettings.peqEnabled ? Math.max(20, Math.min(20000, band?.freq ?? filter.frequency.value)) : filter.frequency.value, now, 0.02);
      filter.Q.setTargetAtTime(active && dspSettings.peqEnabled ? Math.max(0.1, Math.min(10, band?.q ?? 1)) : 1, now, 0.02);
      filter.gain.setTargetAtTime(active && dspSettings.peqEnabled ? Math.max(-15, Math.min(15, band?.gain ?? 0)) : 0, now, 0.02);
    });
    updateExciterGraph(graph, dspSettings, active);
    updateDeesserGraph(graph, dspSettings, active);
    graph.stereoPanner.pan.setTargetAtTime(active ? Math.max(-1, Math.min(1, dspSettings.balance / 100)) : 0, now, 0.02);
    graph.gain.gain.setTargetAtTime(outputGainWithPreamp(volumeRef.current, dspSettings), now, 0.02);
    graph.compressor.threshold.setTargetAtTime(compressorAmount > 0 ? -8 - compressorAmount * 28 : 0, now, 0.02);
    graph.compressor.knee.setTargetAtTime(12 + compressorAmount * 18, now, 0.02);
    graph.compressor.ratio.setTargetAtTime(1 + compressorAmount * 7, now, 0.02);
    graph.compressor.attack.setTargetAtTime(0.005 + compressorAmount * 0.018, now, 0.02);
    graph.compressor.release.setTargetAtTime(0.18 + compressorAmount * 0.28, now, 0.02);
    graph.limiter.threshold.setTargetAtTime(active ? dspSettings.limiter : 0, now, 0.02);
    graph.limiter.knee.setTargetAtTime(0, now, 0.02);
    graph.limiter.ratio.setTargetAtTime(active ? 20 : 1, now, 0.02);
    graph.limiter.attack.setTargetAtTime(active ? Math.max(0.001, Math.min(0.02, (dspSettings.limiterLookahead ?? 5) / 1000)) : 0.002, now, 0.02);
    graph.limiter.release.setTargetAtTime(active ? Math.max(0.005, Math.min(1, (dspSettings.limiterRelease ?? 50) / 1000)) : 0.08, now, 0.02);
    graph.limiterInputGain.gain.setTargetAtTime(active ? dbToLinear(dspSettings.limiterGainDb ?? 0) : 1, now, 0.02);
    graph.truePeakDrive.gain.setTargetAtTime(active && dspSettings.truePeakEnabled ? dbToLinear(dspSettings.truePeakDrive ?? 0) : 1, now, 0.025);
    graph.truePeakLimiter.threshold.setTargetAtTime(active && dspSettings.truePeakEnabled ? dspSettings.truePeakCeiling ?? -0.1 : 0, now, 0.025);
    graph.truePeakLimiter.knee.setTargetAtTime(0, now, 0.02);
    graph.truePeakLimiter.ratio.setTargetAtTime(active && dspSettings.truePeakEnabled ? 30 : 1, now, 0.02);
    graph.truePeakLimiter.attack.setTargetAtTime(
      active && dspSettings.truePeakEnabled ? Math.max(0.001, Math.min(0.02, (dspSettings.truePeakLookahead ?? 5) / 1000)) : 0.002,
      now,
      0.02,
    );
    graph.truePeakLimiter.release.setTargetAtTime(
      active && dspSettings.truePeakEnabled ? Math.max(0.005, Math.min(0.5, (dspSettings.truePeakRelease ?? 50) / 1000)) : 0.05,
      now,
      0.02,
    );
    graph.dryGain.gain.setTargetAtTime(1 - reverbMix * 0.34, now, 0.02);
    graph.wetGain.gain.setTargetAtTime(reverbMix, now, 0.02);
  }, [dspSettings, effectsEnabled]);

  useEffect(() => {
    if ((!isPlaying && page !== "web") || page === "video" || !isTauriRuntime() || !projectMActive) return undefined;

    let cancelled = false;
    let frame = 0;
    let lastSent = 0;
    let webPcmRequestInFlight = false;

    const sendFrame = () => {
      if (cancelled) return;
      const now = performance.now();
      if (now - lastSent >= 16) {
        lastSent = now;
        if (page === "web") {
          if (webPcmRequestInFlight) {
            frame = window.requestAnimationFrame(sendFrame);
            return;
          }
          webPcmRequestInFlight = true;
          void getWebDaliRawPcm(1024)
            .then((pcmFrame) => {
              if (!pcmFrame.length) return;
              let peak = 0;
              let sumSq = 0;
              for (let index = 0; index < pcmFrame.length; index += 1) {
                const value = Number(pcmFrame[index]) || 0;
                peak = Math.max(peak, Math.abs(value));
                sumSq += value * value;
              }
              const rms = Math.sqrt(sumSq / Math.max(1, pcmFrame.length));
              const gain =
                peak > 0
                  ? Math.max(1, Math.min(8, Math.min(0.72 / Math.max(peak, 1e-6), 0.18 / Math.max(rms, 1e-6))))
                  : 1;
              const stereoSamples = new Array<number>(pcmFrame.length * 2);
              for (let index = 0; index < pcmFrame.length; index += 1) {
                const value = Math.tanh((Number(pcmFrame[index]) || 0) * gain);
                stereoSamples[index * 2] = value;
                stereoSamples[index * 2 + 1] = value;
              }
              const payload: ProjectMPcmPayload = {
                channels: 2,
                countPerChannel: pcmFrame.length,
                samples: stereoSamples,
              };
              return invoke("feed_projectm_pcm", payload);
            })
            .catch((error) => {
              reportClientError("projectm.web-pcm", error);
            })
            .finally(() => {
              webPcmRequestInFlight = false;
            });
        } else if (nativeAudioMode && !htmlAudioFallbackActive) {
          void invoke("feed_projectm_native_audio", { countPerChannel: 1024 }).catch((error) => {
            reportClientError("projectm.native-pcm", error);
          });
        } else {
          const graph = graphRef.current;
          if (graph) {
            if (!projectMFeedRef.current || projectMFeedRef.current.length !== 1024) {
              projectMFeedRef.current = new Float32Array(1024);
            }
            const pcmFrame = projectMFeedRef.current;
            graph.rawAnalyser.getFloatTimeDomainData(pcmFrame);
            let peak = 0;
            let sumSq = 0;
            for (let index = 0; index < pcmFrame.length; index += 1) {
              const value = Number(pcmFrame[index]) || 0;
              peak = Math.max(peak, Math.abs(value));
              sumSq += value * value;
            }
            const rms = Math.sqrt(sumSq / Math.max(1, pcmFrame.length));
            const gain =
              peak > 0
                ? Math.max(1, Math.min(8, Math.min(0.72 / Math.max(peak, 1e-6), 0.18 / Math.max(rms, 1e-6))))
                : 1;
            const stereoSamples = new Array<number>(pcmFrame.length * 2);
            for (let index = 0; index < pcmFrame.length; index += 1) {
              const value = Math.tanh((Number(pcmFrame[index]) || 0) * gain);
              stereoSamples[index * 2] = value;
              stereoSamples[index * 2 + 1] = value;
            }
            const payload: ProjectMPcmPayload = {
              channels: 2,
              countPerChannel: pcmFrame.length,
              samples: stereoSamples,
            };
            void invoke("feed_projectm_pcm", payload).catch((error) => {
              reportClientError("projectm.pcm", error);
            });
          }
        }
      }
      frame = window.requestAnimationFrame(sendFrame);
    };

    frame = window.requestAnimationFrame(sendFrame);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [htmlAudioFallbackActive, isPlaying, nativeAudioMode, page, projectMActive, selectedTrackData?.path, selectedTrackData?.url]);

  useEffect(() => {
    if (nativeAudioMode && !htmlAudioFallbackActive) return;
    const audio = audioRef.current;
    if (page !== "music" && page !== "files") return;
    if (!audio || !selectedTrackData) return;

    const shouldLoadSelectedTrack = isPlaying || desiredPlaybackRef.current || audio.src === selectedTrackData.url || audio.currentSrc === selectedTrackData.url;
    if (shouldLoadSelectedTrack && audio.src !== selectedTrackData.url) {
      audio.src = selectedTrackData.url;
      audio.load();
      setCurrentTime(0);
      setDuration(selectedTrackData.duration || 0);
    }

    if (isPlaying) {
      const graph = graphRef.current;
      const activeEffects = effectsEnabledRef.current;
      const currentEqGains = eqGainsRef.current;
      const currentDspSettings = dspSettingsRef.current;
      graph?.filters.forEach((filter, index) => {
        filter.gain.setTargetAtTime(activeEffects ? (currentEqGains[index] ?? 0) : 0, graph.context.currentTime, 0.015);
      });
      if (graph) {
        const now = graph.context.currentTime;
        const compressorAmount = activeEffects ? currentDspSettings.compressor : 0;
        const reverbMix = activeEffects ? currentDspSettings.reverb : 0;
        graph.bassFilter.frequency.setTargetAtTime(activeEffects ? Math.max(35, Math.min(220, currentDspSettings.bassFrequency)) : 110, now, 0.02);
        graph.bassFilter.gain.setTargetAtTime(activeEffects ? effectiveBassGain(currentDspSettings) : 0, now, 0.02);
        graph.toneGain.gain.setTargetAtTime(activeEffects ? bassOutputTrim(currentDspSettings) : 1, now, 0.02);
        graph.midFilter.gain.setTargetAtTime(activeEffects ? currentDspSettings.midGain : 0, now, 0.02);
        graph.trebleFilter.gain.setTargetAtTime(activeEffects ? currentDspSettings.trebleGain : 0, now, 0.02);
        graph.peqFilters.forEach((filter, index) => {
          const band = currentDspSettings.peqBands?.[index];
          filter.type = index === 0 ? "lowshelf" : index === 5 ? "highshelf" : "peaking";
          filter.frequency.setTargetAtTime(
            activeEffects && currentDspSettings.peqEnabled ? Math.max(20, Math.min(20000, band?.freq ?? filter.frequency.value)) : filter.frequency.value,
            now,
            0.02,
          );
          filter.Q.setTargetAtTime(activeEffects && currentDspSettings.peqEnabled ? Math.max(0.1, Math.min(10, band?.q ?? 1)) : 1, now, 0.02);
          filter.gain.setTargetAtTime(activeEffects && currentDspSettings.peqEnabled ? Math.max(-15, Math.min(15, band?.gain ?? 0)) : 0, now, 0.02);
        });
        updateExciterGraph(graph, currentDspSettings, activeEffects);
        updateDeesserGraph(graph, currentDspSettings, activeEffects);
        graph.stereoPanner.pan.setTargetAtTime(activeEffects ? Math.max(-1, Math.min(1, currentDspSettings.balance / 100)) : 0, now, 0.02);
        graph.gain.gain.setTargetAtTime(outputGainWithPreamp(volumeRef.current, currentDspSettings), now, 0.02);
        graph.compressor.threshold.setTargetAtTime(compressorAmount > 0 ? -8 - compressorAmount * 28 : 0, now, 0.02);
        graph.compressor.ratio.setTargetAtTime(1 + compressorAmount * 7, now, 0.02);
        graph.limiter.threshold.setTargetAtTime(activeEffects ? currentDspSettings.limiter : 0, now, 0.02);
        graph.limiter.ratio.setTargetAtTime(activeEffects ? 20 : 1, now, 0.02);
        graph.limiter.attack.setTargetAtTime(
          activeEffects ? Math.max(0.001, Math.min(0.02, (currentDspSettings.limiterLookahead ?? 5) / 1000)) : 0.002,
          now,
          0.02,
        );
        graph.limiter.release.setTargetAtTime(
          activeEffects ? Math.max(0.005, Math.min(1, (currentDspSettings.limiterRelease ?? 50) / 1000)) : 0.08,
          now,
          0.02,
        );
        graph.limiterInputGain.gain.setTargetAtTime(activeEffects ? dbToLinear(currentDspSettings.limiterGainDb ?? 0) : 1, now, 0.02);
        graph.truePeakDrive.gain.setTargetAtTime(
          activeEffects && currentDspSettings.truePeakEnabled ? dbToLinear(currentDspSettings.truePeakDrive ?? 0) : 1,
          now,
          0.025,
        );
        graph.truePeakLimiter.threshold.setTargetAtTime(
          activeEffects && currentDspSettings.truePeakEnabled ? currentDspSettings.truePeakCeiling ?? -0.1 : 0,
          now,
          0.025,
        );
        graph.truePeakLimiter.ratio.setTargetAtTime(activeEffects && currentDspSettings.truePeakEnabled ? 30 : 1, now, 0.02);
        graph.truePeakLimiter.attack.setTargetAtTime(
          activeEffects && currentDspSettings.truePeakEnabled
            ? Math.max(0.001, Math.min(0.02, (currentDspSettings.truePeakLookahead ?? 5) / 1000))
            : 0.002,
          now,
          0.02,
        );
        graph.truePeakLimiter.release.setTargetAtTime(
          activeEffects && currentDspSettings.truePeakEnabled
            ? Math.max(0.005, Math.min(0.5, (currentDspSettings.truePeakRelease ?? 50) / 1000))
            : 0.05,
          now,
          0.02,
        );
        graph.dryGain.gain.setTargetAtTime(1 - reverbMix * 0.34, now, 0.02);
        graph.wetGain.gain.setTargetAtTime(reverbMix, now, 0.02);
      }
    } else {
      audio.pause();
    }
  }, [htmlAudioFallbackActive, isPlaying, nativeAudioMode, page, selectedTrackData]);

  useEffect(() => {
    const video = videoRef.current;
    if (page !== "video") return;
    if (!video || !selectedVideoData) return;

    if (video.src !== selectedVideoData.url) {
      video.src = selectedVideoData.url;
      video.load();
      setVideoCurrentTime(0);
      setVideoDuration(selectedVideoData.duration || 0);
    }

    if (isVideoPlaying) {
      void video.play().catch((error) => {
        reportClientError("video.play", error);
        setIsVideoPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isVideoPlaying, page, selectedVideoData, videoDocked]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    videosRef.current = videoItems;
  }, [videoItems]);

  useEffect(() => {
    return () => {
      if (analysisGraphTimerRef.current !== null) {
        window.clearTimeout(analysisGraphTimerRef.current);
        analysisGraphTimerRef.current = null;
      }
      tracksRef.current.forEach((track) => revokeMediaUrl(track.url));
      videosRef.current.forEach((video) => revokeMediaUrl(video.url));
      void graphRef.current?.context.close();
    };
  }, []);

  const closeAudioSession = useCallback(() => {
    desiredPlaybackRef.current = false;
    if (analysisGraphTimerRef.current !== null) {
      window.clearTimeout(analysisGraphTimerRef.current);
      analysisGraphTimerRef.current = null;
    }
    autoCrossfadeKeyRef.current = "";
    mprisMetadataKeyRef.current = "";
    mprisMetadataSentAtRef.current = 0;
    mprisPositionKeyRef.current = "";
    mprisSeekedPositionRef.current = null;
    setIsPlaying(false);
    setIsAudioActuallyPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (nativeAudioMode) {
      void invoke("native_audio_stop").catch((error) => reportClientError("native.stop", error));
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, [nativeAudioMode]);

  const closeVideoSession = useCallback(() => {
    setIsVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setVideoMiniClosed(true);
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  }, []);

  const switchPage = useCallback(
    (nextPage: PageId) => {
      if (nextPage === page) return;
      if (nextPage === "web" && !webSettings.enabled) return;
      if (page === "web" && nextPage !== "web") {
        activeWebPlatformIdRef.current = "";
        setActiveWebPlatformId("");
        setWebChromeHidden(false);
        void hideWeb().catch((error) => reportClientError("web.leave-destroy", error));
      }
      if (nextPage === "video") {
        closeAudioSession();
      } else if (page === "video") {
        closeVideoSession();
      } else if (nextPage !== "music" && nextPage !== "files") {
        closeAudioSession();
        closeVideoSession();
      }
      if (nextPage === "web") setRailCollapsed(false);
      setPage(nextPage);
    },
    [closeAudioSession, closeVideoSession, page, webSettings.enabled],
  );

  const handleOpenWebPlatform = useCallback(async (platform: WebPlatform) => {
    activeWebPlatformIdRef.current = platform.id;
    lastWebPlatformIdRef.current = platform.id;
    setActiveWebPlatformId(platform.id);
    setWebRuntimeStatus(`${platform.name} yukleniyor...`);
    const platformUrl = webSettings.preferHttps ? platform.url.replace(/^http:/i, "https:") : platform.url;
    await openPlatform(platformUrl).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setWebRuntimeStatus(`${platform.name} acilamadi: ${message}`);
      reportClientError("web.open-platform", error);
    });
    scheduleCurrentWebDaliEffects("platform-open");
    scheduleOfficialPluginsForUrl(platformUrl, "platform-open");
  }, [scheduleCurrentWebDaliEffects, scheduleOfficialPluginsForUrl, webSettings.preferHttps]);

  const openArdaliStore = useCallback(() => {
    if (activeWebPlatformIdRef.current && activeWebPlatformIdRef.current !== ARDALI_STORE_PLATFORM_ID) {
      lastWebPlatformIdRef.current = activeWebPlatformIdRef.current;
    }
    activeWebPlatformIdRef.current = ARDALI_STORE_PLATFORM_ID;
    setActiveWebPlatformId(ARDALI_STORE_PLATFORM_ID);
    setWebChromeHidden(false);
    refreshStoreItems();
    void parkWeb().catch((error) => reportClientError("ardali-store.park-web", error));
  }, [refreshStoreItems]);

  const closeArdaliStore = useCallback(() => {
    const fallbackPlatform =
      platforms.find((platform) => platform.id === lastWebPlatformIdRef.current)
      ?? platforms.find((platform) => platform.id === webSettings.defaultPlatformId)
      ?? platforms[0];
    if (!fallbackPlatform) return;
    activeWebPlatformIdRef.current = fallbackPlatform.id;
    lastWebPlatformIdRef.current = fallbackPlatform.id;
    setActiveWebPlatformId(fallbackPlatform.id);
    setWebChromeHidden(false);
    window.requestAnimationFrame(() => {
      void onWindowResize().catch((error) => reportClientError("ardali-store.close-resize", error));
    });
  }, [webSettings.defaultPlatformId]);

  const handleInstallPlugin = useCallback((pluginId: string, installed: boolean) => {
    setStoreStatus(installed ? "Eklenti güvenlik doğrulamasından geçiriliyor..." : "Eklenti kaldırılıyor...");
    void setPluginInstalled(pluginId, installed)
      .then(() => {
        setStoreStatus(installed ? "Eklenti kuruldu. Uyumlu platform açıldığında çalışacak." : "Eklenti kaldırıldı.");
        void refreshStoreItems();
      })
      .catch((error) => {
        setStoreStatus(`Eklenti kurulamadı: ${String(error)}`);
      });
  }, [refreshStoreItems]);

  const handleTogglePlugin = useCallback((pluginId: string, enabled: boolean) => {
    setPluginEnabled(pluginId, enabled);
    setStoreStatus(enabled ? "Eklenti etkinleştirildi." : "Eklenti devre dışı bırakıldı.");
    const platform = platforms.find((item) => item.id === activeWebPlatformIdRef.current);
    if (enabled && platform) {
      const platformUrl = webSettings.preferHttps ? platform.url.replace(/^http:/i, "https:") : platform.url;
      scheduleOfficialPluginsForUrl(platformUrl, "toggle");
    }
  }, [scheduleOfficialPluginsForUrl, webSettings.preferHttps]);

  useEffect(() => {
    if (page !== "web" || webSettings.enabled) return;
    setPage("music");
    void hideWeb().catch((error) => reportClientError("web.disabled-hide", error));
  }, [page, webSettings.enabled]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!libraryLoaded) return;
    if (page === "web" && webSettings.enabled) {
      if (activeWebPlatformIdRef.current === ARDALI_STORE_PLATFORM_ID) {
        void parkWeb().catch((error) => reportClientError("ardali-store.open-active", error));
        return;
      }
      const activePlatform =
        platforms.find((platform) => platform.id === activeWebPlatformIdRef.current)
        ?? platforms.find((platform) => platform.id === webSettings.defaultPlatformId)
        ?? platforms[0];
      if (activePlatform) {
        const platformUrl = webSettings.preferHttps ? activePlatform.url.replace(/^http:/i, "https:") : activePlatform.url;
        const openTimer = window.setTimeout(() => {
          void openPlatform(platformUrl)
            .then(() => {
              scheduleCurrentWebDaliEffects("web-open-active");
              scheduleOfficialPluginsForUrl(platformUrl, "web-open-active");
            })
            .catch((error) => reportClientError("web.open-active", error));
        }, webSettings.startupDelayMs);
        const retryTimer = webSettings.autoRecover
          ? window.setTimeout(() => {
              void openPlatform(platformUrl)
                .then(() => {
                  scheduleCurrentWebDaliEffects("web-open-active-retry");
                  scheduleOfficialPluginsForUrl(platformUrl, "web-open-active-retry");
                })
                .catch((error) => reportClientError("web.open-active-retry", error));
            }, webSettings.startupDelayMs + 900)
          : null;
        return () => {
          window.clearTimeout(openTimer);
          if (retryTimer !== null) window.clearTimeout(retryTimer);
        };
      }
      return;
    }

    const closeInactiveWeb = webSettings.suspendWhenInactive ? hideWeb : parkWeb;
    void closeInactiveWeb().catch((error) => reportClientError(webSettings.suspendWhenInactive ? "web.hide" : "web.park", error));
  }, [
    libraryLoaded,
    page,
    webSettings.autoRecover,
    webSettings.defaultPlatformId,
    webSettings.enabled,
    webSettings.preferHttps,
    webSettings.startupDelayMs,
    webSettings.suspendWhenInactive,
    scheduleCurrentWebDaliEffects,
    scheduleOfficialPluginsForUrl,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const handleResize = () => {
      if (page !== "web") return;
      if (webChromeHidden) {
        void setWebChromeVisibility(true).catch((error) => reportClientError("web.resize-hidden", error));
        return;
      }

      void onWindowResize().catch((error) => reportClientError("web.resize", error));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [page, webChromeHidden]);

  useEffect(() => {
    if (!isTauriRuntime() || !libraryLoaded || page !== "web") {
      if (webChromeHideTimerRef.current !== null) {
        window.clearTimeout(webChromeHideTimerRef.current);
        webChromeHideTimerRef.current = null;
      }
      if (webChromeBoundsTimerRef.current !== null) {
        window.clearTimeout(webChromeBoundsTimerRef.current);
        webChromeBoundsTimerRef.current = null;
      }
      setWebChromeHidden(false);
      return;
    }

    if (!webSettings.autoHideChrome || webSettings.lowPowerMode) {
      if (webChromeHideTimerRef.current !== null) {
        window.clearTimeout(webChromeHideTimerRef.current);
        webChromeHideTimerRef.current = null;
      }
      if (webChromeBoundsTimerRef.current !== null) {
        window.clearTimeout(webChromeBoundsTimerRef.current);
        webChromeBoundsTimerRef.current = null;
      }
      setWebChromeHidden(false);
      void setWebChromeVisibility(false).catch((error) => reportClientError("web.chrome-visible", error));
      return;
    }

    let disposed = false;
    const hideAnimationMs = webSettings.motionPreset === "calm" ? 840 : webSettings.motionPreset === "fast" ? 340 : 600;

    const clearBoundsTimer = () => {
      if (webChromeBoundsTimerRef.current !== null) {
        window.clearTimeout(webChromeBoundsTimerRef.current);
        webChromeBoundsTimerRef.current = null;
      }
    };

    const applyHidden = (hidden: boolean) => {
      if (disposed) return;
      clearBoundsTimer();

      if (hidden) {
        setWebChromeHidden(true);
        webChromeBoundsTimerRef.current = window.setTimeout(() => {
          webChromeBoundsTimerRef.current = null;
          if (disposed) return;
          void setWebChromeVisibility(true).catch((error) => reportClientError("web.chrome-hide", error));
        }, hideAnimationMs);
        return;
      }

      void setWebChromeVisibility(false).catch((error) => reportClientError("web.chrome-show", error));
      window.requestAnimationFrame(() => {
        if (!disposed) setWebChromeHidden(false);
      });
    };

    const syncChromeWithFocus = () => {
      applyHidden(webFullscreenRef.current || (!windowFocusedRef.current && !auxiliaryWindowFocusedRef.current));
    };

    const refreshAuxiliaryFocus = async () => {
      const labels = ["sound-effects", "settings", "eq-presets"];
      for (const label of labels) {
        try {
          const webview = await WebviewWindow.getByLabel(label);
          if (webview && await webview.isFocused()) {
            auxiliaryWindowFocusedRef.current = true;
            syncChromeWithFocus();
            return;
          }
        } catch {
          // Ignore windows that are not open yet.
        }
      }

      auxiliaryWindowFocusedRef.current = false;
      syncChromeWithFocus();
    };

    windowFocusedRef.current = true;
    applyHidden(false);
    void getCurrentWindow().isFocused().then((focused) => {
      windowFocusedRef.current = focused;
      if (!disposed) syncChromeWithFocus();
    }).catch(() => undefined);

    const revealChromeFromActivity = () => {
      if (!webFullscreenRef.current && windowFocusedRef.current) applyHidden(false);
    };

    let unlisten: (() => void) | undefined;
    let unlistenFullscreen: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    const auxiliaryFocusPoll = window.setInterval(() => {
      if (!windowFocusedRef.current) void refreshAuxiliaryFocus();
    }, 350);
    void listen("webview-pointer-motion", revealChromeFromActivity).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });
    void listen<boolean>("webview-fullscreen-change", (event) => {
      webFullscreenRef.current = Boolean(event.payload);
      syncChromeWithFocus();
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlistenFullscreen = cleanup;
    });
    void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      windowFocusedRef.current = focused;
      if (focused) {
        auxiliaryWindowFocusedRef.current = false;
        syncChromeWithFocus();
      } else {
        window.setTimeout(() => void refreshAuxiliaryFocus(), 40);
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlistenFocus = cleanup;
    });

    window.addEventListener("mousemove", revealChromeFromActivity);
    window.addEventListener("keydown", revealChromeFromActivity);

    return () => {
      disposed = true;
      unlisten?.();
      unlistenFullscreen?.();
      unlistenFocus?.();
      window.clearInterval(auxiliaryFocusPoll);
      window.removeEventListener("mousemove", revealChromeFromActivity);
      window.removeEventListener("keydown", revealChromeFromActivity);
      if (webChromeHideTimerRef.current !== null) {
        window.clearTimeout(webChromeHideTimerRef.current);
        webChromeHideTimerRef.current = null;
      }
      clearBoundsTimer();
      setWebChromeHidden(false);
      void setWebChromeVisibility(false).catch((error) => reportClientError("web.chrome-cleanup", error));
    };
  }, [libraryLoaded, page, webSettings.autoHideChrome, webSettings.chromeAutoHideDelayMs, webSettings.lowPowerMode, webSettings.motionPreset]);

  const handleMainWindowAction = async (action: "minimize" | "maximize" | "close") => {
    if (!isTauriRuntime()) return;
    const current = getCurrentWindow();
    if (action === "minimize") await current.minimize();
    if (action === "maximize") await current.toggleMaximize();
    if (action === "close") await invoke("hide_main_window");
  };

  const stopMainWindowButtonDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const startMainWindowResize = async (direction: ResizeDirection) => {
    if (!isTauriRuntime()) return;
    try {
      await getCurrentWindow().startResizeDragging(direction);
    } catch (error) {
      reportClientError("main-window.resize", error);
    }
  };

  const handleMainResizeMouseDown = (
    event: ReactMouseEvent<HTMLDivElement>,
    direction: ResizeDirection,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    void startMainWindowResize(direction);
  };

  const openMusicPicker = async () => {
    switchPage("music");
    if (isTauriRuntime()) {
      const selected = await openDialog({
        multiple: true,
        filters: [
          {
            name: "Ses Dosyalari",
            extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus"],
          },
        ],
      });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (!paths.length) return;

      const nextTracks = await Promise.all(
        paths.map<Promise<Track>>(async (path, index) => {
          const coverDataUrl = await invoke<string | null>("extract_cover_art", { path }).catch(() => null);
          return trackFromPath(path, tracks.length + index, undefined, 0, 0, coverDataUrl || undefined);
        }),
      );

      const mergedTracks = [...tracksRef.current, ...nextTracks];
      tracksRef.current = mergedTracks;
      setTracks(mergedTracks);
      setSelectedTrack(0);
      switchPage("music");
      window.setTimeout(() => loadAndPlayTrack(0, { restorePosition: false, restartIfEnded: true }), 0);
      return;
    }
    fileInputRef.current?.click();
  };

  const openVideoPicker = async () => {
    switchPage("video");
    if (isTauriRuntime()) {
      const selected = await openDialog({
        multiple: true,
        filters: [
          {
            name: "Video Dosyalari",
            extensions: ["mp4", "mkv", "webm", "mov", "avi", "m4v", "ogv"],
          },
        ],
      });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (!paths.length) return;

      const nextVideos = paths.map<VideoItem>((path, index) => {
        return videoFromPath(path, videoItems.length + index);
      });

      setVideoItems((current) => [...current, ...nextVideos]);
      setSelectedVideo(videoItems.length);
      setVideoDocked(false);
      setVideoMiniClosed(false);
      switchPage("video");
      setIsVideoPlaying(true);
      return;
    }
    videoInputRef.current?.click();
  };

  const handleMusicFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("audio/"));
    if (!files.length) return;

    const nextTracks = files.map<Track>((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      title: titleFromFileName(file.name),
      artist: "Yerel Dosya",
      album: file.type || "Audio",
      length: "--:--",
      duration: 0,
      lastPosition: 0,
      tag: "Yeni",
      color: coverColors[(tracks.length + index) % coverColors.length],
      coverDataUrl: undefined,
      fileName: file.name,
      url: URL.createObjectURL(file),
    }));

    const mergedTracks = [...tracksRef.current, ...nextTracks];
    tracksRef.current = mergedTracks;
    setTracks(mergedTracks);
    setSelectedTrack(0);
    switchPage("music");
    window.setTimeout(() => loadAndPlayTrack(0, { restorePosition: false, restartIfEnded: true }), 0);
    event.target.value = "";
  };

  const handleVideoFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("video/"));
    if (!files.length) return;

    const nextVideos = files.map<VideoItem>((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      title: titleFromFileName(file.name),
      meta: file.type || "Video",
      duration: 0,
      lastPosition: 0,
      color: coverColors[(videoItems.length + index + 2) % coverColors.length],
      thumbnailDataUrl: undefined,
      fileName: file.name,
      url: URL.createObjectURL(file),
    }));

    setVideoItems((current) => [...current, ...nextVideos]);
    setSelectedVideo(videoItems.length);
    setVideoDocked(false);
    setVideoMiniClosed(false);
    switchPage("video");
    setIsVideoPlaying(true);
    event.target.value = "";
  };

  const rememberCurrentTrackPosition = useCallback(() => {
    setTracks((current) =>
      current.map((track, index) =>
        index === selectedTrack
          ? {
              ...track,
              duration: duration || track.duration,
              lastPosition: currentTimeRef.current,
              length: formatTime(duration || track.duration),
            }
          : track,
      ),
    );
  }, [duration, selectedTrack]);

  const rememberCurrentVideoPosition = useCallback(() => {
    setVideoItems((current) =>
      current.map((video, index) =>
        index === selectedVideo
          ? {
              ...video,
              duration: videoDuration || video.duration,
              lastPosition: videoCurrentTime,
              meta: `${video.fileName} • ${formatTime(videoDuration || video.duration)}`,
            }
          : video,
      ),
    );
  }, [selectedVideo, videoCurrentTime, videoDuration]);

  const loadAndPlayTrack = useCallback(
    (index: number, options: { restorePosition?: boolean; restartIfEnded?: boolean } = {}) => {
      const sourceTracks = tracksRef.current.length ? tracksRef.current : tracks;
      const track = sourceTracks[index];
      if (!track) return false;
      const audio = audioRef.current;
      switchPage("music");
      setSelectedTrack(index);
      visualHoldUntilRef.current = performance.now() + 450;
      nativeStateQuietUntilRef.current = performance.now() + 850;
      desiredPlaybackRef.current = true;
      pendingAudioPlayUrlRef.current = track.url;
      setIsPlaying(true);
      const useNativePlayback = nativeAudioMode && canUseNativeAudioForTrack(track);
      if (useNativePlayback) {
        setHtmlAudioFallbackMode(false);
        const restorePosition = options.restorePosition === true;
        const knownDuration = track.duration || 0;
        const savedPosition = restorePosition
          ? Math.max(0, Math.min(track.lastPosition || 0, Math.max(0, knownDuration - 1)))
          : 0;
        if (audio) {
          audio.pause();
          audio.muted = true;
          audio.volume = 0;
          audio.removeAttribute("src");
          audio.load();
        }
        setCurrentTime(savedPosition);
        setDuration(knownDuration);
        nativePlaybackClockRef.current = {
          position: savedPosition,
          duration: knownDuration,
          syncedAt: performance.now(),
          playing: false,
        };
        void (async () => {
          try {
            await setNativeVolumeNow(0);
            await applyNativeEffects({ force: true });
            await invoke("native_audio_load", { path: track.path });
            setHtmlAudioFallbackMode(false);
            await setNativeVolumeNow(0);
            await applyNativeEffects({ force: true });
            const state = await invoke<NativeAudioState>("native_audio_state");
            const nextDuration = Number(state.duration) || knownDuration;
            setDuration(nextDuration);
            setTracks((current) =>
              current.map((item, itemIndex) =>
                itemIndex === index
                  ? { ...item, duration: nextDuration, length: formatTime(nextDuration) }
                  : item,
              ),
            );
            const position = options.restartIfEnded && savedPosition >= Math.max(0, nextDuration - 0.35) ? 0 : savedPosition;
            if (position > 0) await invoke("native_audio_seek", { position });
            else setCurrentTime(0);
            nativePlaybackClockRef.current = {
              position,
              duration: nextDuration,
              syncedAt: performance.now(),
              playing: true,
            };
            await invoke("native_audio_play");
            await fadeNativeVolume(volumeRef.current, 130);
            pendingAudioPlayUrlRef.current = "";
            nativeStateQuietUntilRef.current = performance.now() + 220;
            transitionRef.current = false;
            setIsAudioActuallyPlaying(true);
            setIsPlaying(true);
          } catch (error) {
            reportClientError("native.load-play", error);
            const fallbackAudio = audioRef.current;
            if (!fallbackAudio) {
              desiredPlaybackRef.current = false;
              pendingAudioPlayUrlRef.current = "";
              transitionRef.current = false;
              setIsAudioActuallyPlaying(false);
              setIsPlaying(false);
              return;
            }
            try {
              await invoke("native_audio_stop").catch((stopError) => reportClientError("native.stop-before-fallback", stopError));
              setHtmlAudioFallbackMode(true);
              const graph = graphRef.current ?? ensureAudioGraph();
              fallbackAudio.muted = false;
              fallbackAudio.volume = graph ? 1 : volumeRef.current;
              if (fallbackAudio.src !== track.url) {
                fallbackAudio.src = track.url;
                fallbackAudio.load();
              }
              if (savedPosition > 0) {
                try {
                  fallbackAudio.currentTime = savedPosition;
                } catch {
                  // Metadata may not be ready yet.
                }
              }
              if (graph) {
                graph.gain.gain.setValueAtTime(volumeRef.current, graph.context.currentTime);
                void graph.context.resume().catch((resumeError) => reportClientError("audio.context.resume.fallback", resumeError));
              }
              await fallbackAudio.play();
              pendingAudioPlayUrlRef.current = "";
              transitionRef.current = false;
              setIsAudioActuallyPlaying(true);
              setIsPlaying(true);
            } catch (fallbackError) {
              reportClientError("audio.fallback-play", fallbackError);
              desiredPlaybackRef.current = false;
              pendingAudioPlayUrlRef.current = "";
              transitionRef.current = false;
              setIsAudioActuallyPlaying(false);
              setIsPlaying(false);
            }
          }
        })();
        return true;
      }
      setHtmlAudioFallbackMode(nativeAudioMode);
      if (!audio) return true;

      const restorePosition = options.restorePosition === true;
      const knownDuration = track.duration || Number(audio.duration) || 0;
      const savedPosition = restorePosition
        ? Math.max(0, Math.min(track.lastPosition || 0, Math.max(0, knownDuration - 1)))
        : 0;
      setDuration(knownDuration);
      setCurrentTime(savedPosition);
      void (async () => {
        if (nativeAudioMode) {
          await invoke("native_audio_stop").catch((error) => reportClientError("native.stop-before-html", error));
          nativePlaybackClockRef.current = {
            position: 0,
            duration: 0,
            syncedAt: performance.now(),
            playing: false,
          };
        }
        if (!graphRef.current) ensureAudioGraph();
        audio.muted = false;
        audio.volume = 1;
        if (audio.src !== track.url) {
          audio.pause();
          audio.src = track.url;
          audio.load();
        }
        if (!restorePosition || savedPosition > 0 || audio.currentTime >= Math.max(0, knownDuration - 0.35)) {
          try {
            audio.currentTime = savedPosition;
          } catch {
            // Metadata may not be ready yet.
          }
        }
        if (options.restartIfEnded && knownDuration > 0 && audio.currentTime >= knownDuration - 0.35) {
          audio.currentTime = 0;
          setCurrentTime(0);
        } else {
          setCurrentTime(Number(audio.currentTime) || savedPosition);
        }
        void playAudioElement();
      })();
      return true;
    },
    [applyNativeEffects, ensureAudioGraph, fadeNativeVolume, nativeAudioMode, playAudioElement, setNativeVolumeNow, switchPage, tracks],
  );

  const playTrack = (index: number) => {
    const sourceTracks = tracksRef.current.length ? tracksRef.current : tracks;
    const track = sourceTracks[index];
    if (!track) return;
    rememberCurrentTrackPosition();
    loadAndPlayTrack(index, { restorePosition: false, restartIfEnded: true });
  };

  useEffect(() => {
    if (!libraryLoaded || startupPlaybackHandledRef.current) return;
    if (!webSettings.playbackRestoreLastTrack || !tracks.length) {
      startupPlaybackHandledRef.current = true;
      return;
    }
    const targetIndex = tracks[selectedTrack] ? selectedTrack : 0;
    const targetTrack = tracks[targetIndex];
    if (!targetTrack) {
      startupPlaybackHandledRef.current = true;
      return;
    }
    startupPlaybackHandledRef.current = true;
    if (!webSettings.playbackAutoplayLastTrack) {
      if (webSettings.playbackResumePosition && targetTrack.lastPosition > 0.2) {
        setCurrentTime(targetTrack.lastPosition);
        setDuration(targetTrack.duration || durationRef.current || 0);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      loadAndPlayTrack(targetIndex, {
        restorePosition: webSettings.playbackResumePosition,
        restartIfEnded: true,
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [
    libraryLoaded,
    loadAndPlayTrack,
    selectedTrack,
    tracks,
    webSettings.playbackAutoplayLastTrack,
    webSettings.playbackRestoreLastTrack,
    webSettings.playbackResumePosition,
  ]);

  const selectTrack = (index: number) => {
    switchPage("music");
    setSelectedTrack(index);
  };

  const playVideo = (index: number) => {
    rememberCurrentVideoPosition();
    switchPage("video");
    setSelectedVideo(index);
    setVideoDocked(false);
    setVideoMiniClosed(false);
    desiredPlaybackRef.current = false;
    setIsVideoPlaying(true);
  };

  const togglePlayback = () => {
    if (page === "video") {
      if (!videoItems.length) {
        openVideoPicker();
        return;
      }
      desiredPlaybackRef.current = false;
      setIsPlaying(false);
      setIsVideoPlaying((value) => !value);
      return;
    }
    if (!tracks.length) {
      openMusicPicker();
      return;
    }
    const sourceTracks = tracksRef.current.length ? tracksRef.current : tracks;
    const targetIndex = sourceTracks[selectedTrack] ? selectedTrack : 0;
    const targetTrack = sourceTracks[targetIndex];
    if (!targetTrack) return;
    const targetUsesNativePlayback =
      nativeAudioMode && !htmlAudioFallbackActiveRef.current && canUseNativeAudioForTrack(targetTrack);
    if (targetUsesNativePlayback) {
      if (!isPlaying || !isAudioActuallyPlaying) {
        if (currentTimeRef.current > 0.2 && durationRef.current > 0) {
          desiredPlaybackRef.current = true;
          pendingAudioPlayUrlRef.current = "";
          void (async () => {
            try {
              await setNativeVolumeNow(0);
              await applyNativeEffects({ force: true });
              await invoke("native_audio_play");
              await fadeNativeVolume(volumeRef.current, 110);
              setIsAudioActuallyPlaying(true);
              setIsPlaying(true);
            } catch {
              rememberCurrentTrackPosition();
              loadAndPlayTrack(targetIndex, { restorePosition: currentTimeRef.current > 0.2, restartIfEnded: true });
            }
          })();
          return;
        }
        rememberCurrentTrackPosition();
        loadAndPlayTrack(targetIndex, { restorePosition: currentTime > 0.2, restartIfEnded: true });
        return;
      }
      desiredPlaybackRef.current = false;
      pendingAudioPlayUrlRef.current = "";
      const pauseNative = async () => {
        try {
          if (webSettings.playbackFadeOnPause) await fadeNativeVolume(0, webSettings.playbackFadeDurationMs);
          await invoke("native_audio_pause");
        } catch (error) {
          reportClientError("native.pause", error);
        } finally {
          audioRef.current?.pause();
          setIsAudioActuallyPlaying(false);
          setIsPlaying(false);
        }
      };
      void pauseNative();
      return;
    }
    const audio = audioRef.current;
    const targetLoaded = !!audio && (audio.src === targetTrack.url || audio.currentSrc === targetTrack.url);
    const audioIsPlaying = !!audio && targetLoaded && !audio.paused && !audio.ended;
    if (!audioIsPlaying) {
      rememberCurrentTrackPosition();
      loadAndPlayTrack(targetIndex, { restorePosition: targetLoaded, restartIfEnded: true });
      return;
    }
    desiredPlaybackRef.current = false;
    pendingAudioPlayUrlRef.current = "";
    if (analysisGraphTimerRef.current !== null) {
      window.clearTimeout(analysisGraphTimerRef.current);
      analysisGraphTimerRef.current = null;
    }
    if (webSettings.playbackFadeOnPause) {
      void fadeOutputGain(0, webSettings.playbackFadeDurationMs)
        .then(() => {
          audio.pause();
          syncAudioVolume(volumeRef.current);
        })
        .finally(() => {
          setIsAudioActuallyPlaying(false);
          setIsPlaying(false);
        });
      return;
    }
    audio.pause();
    setIsAudioActuallyPlaying(false);
    setIsPlaying(false);
  };

  const goToTrack = (direction: 1 | -1) => {
    if (!tracks.length) return;
    if (transitionRef.current) return;
    rememberCurrentTrackPosition();
    const nextIndex = (selectedTrack + direction + tracks.length) % tracks.length;
    const currentTrack = tracks[selectedTrack];
    const nextTrack = tracks[nextIndex];
    const nativeTrackTransition =
      nativeAudioMode &&
      !htmlAudioFallbackActiveRef.current &&
      canUseNativeAudioForTrack(currentTrack) &&
      canUseNativeAudioForTrack(nextTrack);
    if (isPlaying && tracks.length > 1 && webSettings.playbackCrossfadeManual && webSettings.playbackCrossfadeMs > 0) {
      if (nativeTrackTransition) {
        transitionRef.current = true;
        const fadeOutMs = Math.max(80, Math.round(webSettings.playbackCrossfadeMs * 0.42));
        void fadeNativeVolume(0, fadeOutMs)
          .then(() => {
            loadAndPlayTrack(nextIndex, { restorePosition: false, restartIfEnded: true });
          })
          .finally(() => {
            transitionRef.current = false;
          });
        return;
      }
      transitionRef.current = true;
      const fadeOutMs = Math.max(80, Math.round(webSettings.playbackCrossfadeMs * 0.42));
      const fadeInMs = Math.max(80, Math.round(webSettings.playbackCrossfadeMs * 0.58));
      void fadeOutputGain(0, fadeOutMs)
        .then(() => {
          loadAndPlayTrack(nextIndex, { restorePosition: false });
          return new Promise<void>((resolve) => window.setTimeout(resolve, 70));
        })
        .then(() => fadeOutputGain(volumeRef.current, fadeInMs))
        .finally(() => {
          transitionRef.current = false;
          syncAudioVolume(volumeRef.current);
        });
      return;
    }
    loadAndPlayTrack(nextIndex, { restorePosition: false });
  };

  useEffect(() => {
    if (!webSettings.playbackCrossfadeAuto || page !== "music" || !isPlaying || tracks.length < 2 || transitionRef.current) return;
    if (!duration || duration < 8) return;
    const remaining = duration - currentTime;
    const key = selectedTrackData?.id || "";
    const crossfadeSeconds = Math.max(0.2, webSettings.playbackCrossfadeMs / 1000);
    if (currentTime < 1) autoCrossfadeKeyRef.current = "";
    if (remaining > 0.2 && remaining <= crossfadeSeconds + 0.1 && autoCrossfadeKeyRef.current !== key) {
      autoCrossfadeKeyRef.current = key;
      goToTrack(1);
    }
  }, [currentTime, duration, isPlaying, page, selectedTrackData?.id, tracks.length, webSettings.playbackCrossfadeAuto, webSettings.playbackCrossfadeMs]);

  useEffect(() => {
    if (!nativeAudioMode || htmlAudioFallbackActive || page !== "music" || !isPlaying) return undefined;
    let cancelled = false;
    let endedHandled = false;
    const syncNativeState = async () => {
      try {
        const state = await invoke<NativeAudioState>("native_audio_state");
        if (cancelled) return;
        const nextDuration = Number(state.duration) || durationRef.current || selectedTrackData?.duration || 0;
        const nextPosition = Math.max(0, Math.min(nextDuration || Number.MAX_SAFE_INTEGER, Number(state.position) || 0));
        const quietState = performance.now() < nativeStateQuietUntilRef.current || transitionRef.current;
        nativePlaybackClockRef.current = {
          position: nextPosition,
          duration: nextDuration,
          syncedAt: performance.now(),
          playing: Boolean(state.playing),
        };
        const pendingSeek = pendingSeekRef.current;
        const pendingActive = pendingSeek && performance.now() < pendingSeek.until;
        const pendingSettled = pendingSeek && Math.abs(nextPosition - pendingSeek.position) <= 0.7;
        if (pendingSettled) pendingSeekRef.current = null;
        if (!quietState && (!pendingActive || pendingSettled)) {
          if (Math.abs(nextPosition - currentTimeRef.current) > 0.45) setCurrentTime(nextPosition);
        }
        if (nextDuration > 0) setDuration(nextDuration);
        setIsAudioActuallyPlaying(Boolean(state.playing));
        if (desiredPlaybackRef.current && !state.playing && nextDuration > 0 && nextPosition >= Math.max(0, nextDuration - 0.35) && !endedHandled) {
          endedHandled = true;
          setIsAudioActuallyPlaying(false);
          if (stopAfterCurrentRef.current) {
            desiredPlaybackRef.current = false;
            setIsPlaying(false);
            return;
          }
          goToTrackRef.current(1);
        }
      } catch (error) {
        if (!cancelled) reportClientError("native.state", error);
      }
    };
    const updateLocalClock = () => {
      const clock = nativePlaybackClockRef.current;
      const nextDuration = clock.duration || durationRef.current || selectedTrackData?.duration || 0;
      const elapsed = clock.playing ? (performance.now() - clock.syncedAt) / 1000 : 0;
      const nextPosition = Math.max(0, Math.min(nextDuration || Number.MAX_SAFE_INTEGER, clock.position + elapsed));
      const pendingSeek = pendingSeekRef.current;
      const pendingActive = pendingSeek && performance.now() < pendingSeek.until;
      const quietState = performance.now() < nativeStateQuietUntilRef.current || transitionRef.current;
      if (!quietState && !pendingActive && Math.abs(nextPosition - currentTimeRef.current) > 0.18) setCurrentTime(nextPosition);
      if (nextDuration > 0 && durationRef.current <= 0) setDuration(nextDuration);
      if (nextDuration > 0 && nextPosition >= Math.max(0, nextDuration - 0.35) && desiredPlaybackRef.current && !endedHandled) {
        endedHandled = true;
        setIsAudioActuallyPlaying(false);
        if (stopAfterCurrentRef.current) {
          desiredPlaybackRef.current = false;
          setIsPlaying(false);
          return;
        }
        goToTrackRef.current(1);
      }
    };
    void syncNativeState();
    const syncTimer = window.setInterval(syncNativeState, 1000);
    const clockTimer = window.setInterval(updateLocalClock, 500);
    return () => {
      cancelled = true;
      window.clearInterval(syncTimer);
      window.clearInterval(clockTimer);
    };
  }, [htmlAudioFallbackActive, isPlaying, nativeAudioMode, page, selectedTrackData?.duration, selectedTrackData?.url]);

  const goToVideo = (direction: 1 | -1) => {
    if (!videoItems.length) return;
    rememberCurrentVideoPosition();
    const nextIndex = (selectedVideo + direction + videoItems.length) % videoItems.length;
    setSelectedVideo(nextIndex);
    setVideoDocked(false);
    setVideoMiniClosed(false);
    setIsPlaying(false);
    setIsVideoPlaying(true);
  };

  const clearTracks = () => {
    allowEmptyLibrarySaveRef.current = true;
    tracks.forEach((track) => revokeMediaUrl(track.url));
    setTracks([]);
    setSelectedTrack(0);
    setIsPlaying(false);
    pendingAudioPlayUrlRef.current = "";
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
  };

  const removeTrack = (index: number) => {
    const removingCurrent = index === selectedTrack;
    if (tracks.length <= 1 && !videoItems.length) allowEmptyLibrarySaveRef.current = true;
    revokeMediaUrl(tracks[index]?.url || "");
    setTracks((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setSelectedTrack((current) => {
      if (current > index) return current - 1;
      if (current === index) return Math.max(0, current - 1);
      return current;
    });
    if (removingCurrent) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      if (audioRef.current) {
        pendingAudioPlayUrlRef.current = "";
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
    }
  };

  const clearVideos = () => {
    allowEmptyLibrarySaveRef.current = true;
    videoItems.forEach((video) => revokeMediaUrl(video.url));
    setVideoItems([]);
    setSelectedVideo(0);
    setIsVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  };

  const removeVideo = (index: number) => {
    const removingCurrent = index === selectedVideo;
    if (videoItems.length <= 1 && !tracks.length) allowEmptyLibrarySaveRef.current = true;
    revokeMediaUrl(videoItems[index]?.url || "");
    setVideoItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setSelectedVideo((current) => {
      if (current > index) return current - 1;
      if (current === index) return Math.max(0, current - 1);
      return current;
    });
    if (removingCurrent) {
      setIsVideoPlaying(false);
      setVideoCurrentTime(0);
      setVideoDuration(0);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    }
  };

  const cleanMissingLibraryItems = async () => {
    if (!isTauriRuntime()) return;

    const [trackChecks, videoChecks] = await Promise.all([
      Promise.all(
        tracks.map(async (track) => ({
          item: track,
          exists: track.path ? await invoke<boolean>("path_exists", { path: track.path }) : true,
        })),
      ),
      Promise.all(
        videoItems.map(async (video) => ({
          item: video,
          exists: video.path ? await invoke<boolean>("path_exists", { path: video.path }) : true,
        })),
      ),
    ]);

    const nextTracks = trackChecks.filter((entry) => entry.exists).map((entry) => entry.item);
    const nextVideos = videoChecks.filter((entry) => entry.exists).map((entry) => entry.item);
    const selectedTrackMissing = !!tracks[selectedTrack]?.path && !trackChecks[selectedTrack]?.exists;
    const selectedVideoMissing = !!videoItems[selectedVideo]?.path && !videoChecks[selectedVideo]?.exists;

    trackChecks.filter((entry) => !entry.exists).forEach((entry) => revokeMediaUrl(entry.item.url));
    videoChecks.filter((entry) => !entry.exists).forEach((entry) => revokeMediaUrl(entry.item.url));

    setTracks(nextTracks);
    setVideoItems(nextVideos);
    setSelectedTrack((current) => Math.min(current, Math.max(0, nextTracks.length - 1)));
    setSelectedVideo((current) => Math.min(current, Math.max(0, nextVideos.length - 1)));
    if (selectedTrackMissing) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      audioRef.current?.pause();
      audioRef.current?.removeAttribute("src");
      audioRef.current?.load();
    }
    if (selectedVideoMissing) {
      setIsVideoPlaying(false);
      setVideoCurrentTime(0);
      setVideoDuration(0);
      videoRef.current?.pause();
      videoRef.current?.removeAttribute("src");
      videoRef.current?.load();
    }
  };

  const handleSeek = (value: number) => {
    if (page === "video") {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = value;
      setVideoCurrentTime(value);
      return;
    }
    if (nativeAudioMode && !htmlAudioFallbackActive) {
      visualHoldUntilRef.current = performance.now() + 320;
      pendingSeekRef.current = { position: value, until: performance.now() + 1200 };
      nativePlaybackClockRef.current = {
        position: value,
        duration: durationRef.current || selectedTrackData?.duration || 0,
        syncedAt: performance.now(),
        playing: isPlayingRef.current,
      };
      setCurrentTime(value);
      mprisSeekedPositionRef.current = value;
      void invoke("native_audio_seek", { position: value }).catch((error) => reportClientError("native.seek", error));
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
    mprisSeekedPositionRef.current = value;
  };

  const seekBy = (seconds: number) => {
    const mediaDuration = page === "video" ? videoDuration : duration;
    const mediaCurrent = page === "video" ? videoCurrentTime : currentTime;
    handleSeek(Math.max(0, Math.min(mediaDuration || 0, mediaCurrent + seconds)));
  };

  goToTrackRef.current = goToTrack;
  handleSeekRef.current = handleSeek;
  seekByRef.current = seekBy;
  isPlayingRef.current = isAudioActuallyPlaying;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyboardShortcut(event)) return;
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      if (event.code === "Space" || event.code === "MediaPlayPause") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.code === "MediaTrackPrevious") {
        event.preventDefault();
        goToTrack(-1);
        return;
      }
      if (event.code === "MediaTrackNext") {
        event.preventDefault();
        goToTrack(1);
        return;
      }
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        if (ctrlOrMeta) goToTrack(-1);
        else seekBy(-5);
        return;
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        if (ctrlOrMeta) goToTrack(1);
        else seekBy(5);
        return;
      }
      if (!ctrlOrMeta && event.code === "KeyM") {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (!ctrlOrMeta && event.code === "Digit1") {
        event.preventDefault();
        switchPage("music");
        return;
      }
      if (!ctrlOrMeta && event.code === "Digit2") {
        event.preventDefault();
        switchPage("video");
        return;
      }
      if (!ctrlOrMeta && event.code === "Digit3") {
        event.preventDefault();
        switchPage("gallery");
        return;
      }
      if (!ctrlOrMeta && event.code === "Digit4") {
        event.preventDefault();
        switchPage("web");
        return;
      }
      if (ctrlOrMeta && event.code === "Comma") {
        event.preventDefault();
        void openSettingsWindow();
        return;
      }
      if (!ctrlOrMeta && event.code === "KeyE") {
        event.preventDefault();
        void openSoundEffectsWindow();
        return;
      }
      if (!ctrlOrMeta && event.code === "KeyV") {
        event.preventDefault();
        void openProjectMWindow();
        return;
      }
      if (!ctrlOrMeta && event.code === "KeyF") {
        event.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    goToTrack,
    openProjectMWindow,
    openSettingsWindow,
    openSoundEffectsWindow,
    seekBy,
    switchPage,
    toggleMute,
    togglePlayback,
  ]);

  useEffect(() => {
    let cancelled = false;
    setMediaSessionArtworkUrl("");
    setMprisArtworkUrl("");

    const embeddedCover = maybeEmbeddedTrackCover(selectedTrackData);
    if (!embeddedCover) return () => {
      cancelled = true;
    };

    if (!isTauriRuntime()) {
      setMediaSessionArtworkUrl(embeddedCover);
      return () => {
        cancelled = true;
      };
    }

    void invoke<string | null>("cache_media_art", {
      trackId: selectedTrackData.id || selectedTrackData.fileName,
      dataUrl: embeddedCover,
    })
      .then((path) => {
        if (!cancelled) {
          setMediaSessionArtworkUrl(path ? pathToMediaUrl(path) : embeddedCover);
          setMprisArtworkUrl(path ? pathToFileUrl(path) : "");
        }
      })
      .catch((error) => {
        reportClientError("media-session.artwork", error);
        if (!cancelled) setMediaSessionArtworkUrl(embeddedCover);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTrackData?.coverDataUrl, selectedTrackData?.fileName, selectedTrackData?.id]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      if (customMprisEnabled) {
        ([
          "play",
          "pause",
          "stop",
          "previoustrack",
          "nexttrack",
          "seekbackward",
          "seekforward",
          "seekto",
        ] as MediaSessionAction[]).forEach((action) => {
          try {
            navigator.mediaSession.setActionHandler(action, null);
          } catch {
            // WebKit may not support every action.
          }
        });
        return;
      }

      navigator.mediaSession.setActionHandler("play", () => {
        loadAndPlayTrack(selectedTrack, { restorePosition: true, restartIfEnded: true });
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        desiredPlaybackRef.current = false;
        pendingAudioPlayUrlRef.current = "";
        setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        desiredPlaybackRef.current = false;
        pendingAudioPlayUrlRef.current = "";
        setIsPlaying(false);
        handleSeekRef.current(0);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => goToTrackRef.current(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => goToTrackRef.current(1));
      navigator.mediaSession.setActionHandler("seekbackward", () => seekByRef.current(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => seekByRef.current(10));
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        const seekTime = Number(details.seekTime);
        if (Number.isFinite(seekTime)) handleSeekRef.current(Math.max(0, seekTime));
      });
    } catch (error) {
      reportClientError("media-session.handlers", error);
    }
  }, [customMprisEnabled, loadAndPlayTrack, selectedTrack]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      if (customMprisEnabled) {
        navigator.mediaSession.metadata = null;
        return;
      }

      if (!selectedTrackData || page !== "music") {
        navigator.mediaSession.metadata = null;
        return;
      }

      const embeddedCover = maybeEmbeddedTrackCover(selectedTrackData);
      const artwork = mediaSessionArtworkUrl || embeddedCover || "";
      navigator.mediaSession.metadata = new MediaMetadata({
        title: selectedTrackData.title || titleFromFileName(selectedTrackData.fileName),
        artist: selectedTrackData.artist || "ArDali WebMedia",
        album: selectedTrackData.album || "Yerel Dosya",
        artwork: artwork ? [{ src: artwork, sizes: "512x512" }] : [],
      });
    } catch (error) {
      reportClientError("media-session.metadata", error);
    }
  }, [
    customMprisEnabled,
    mediaSessionArtworkUrl,
    page,
    selectedTrackData?.album,
    selectedTrackData?.artist,
    selectedTrackData?.coverDataUrl,
    selectedTrackData?.fileName,
    selectedTrackData?.title,
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      if (customMprisEnabled) {
        navigator.mediaSession.playbackState = "none";
        return;
      }

      if (!selectedTrackData || page !== "music") {
        navigator.mediaSession.playbackState = "none";
        return;
      }

      navigator.mediaSession.playbackState = isAudioActuallyPlaying ? "playing" : "paused";
    } catch (error) {
      reportClientError("media-session.state", error);
    }
  }, [
    customMprisEnabled,
    isAudioActuallyPlaying,
    page,
    selectedTrackData?.id,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let disposed = false;
    const pendingPositionTimers = new Set<number>();
    const unlisteners = [
      listen<string>("mpris-control", (event) => {
        const action = event.payload;
        if (action === "play") {
          loadAndPlayTrack(selectedTrack, { restorePosition: true, restartIfEnded: true });
        } else if (action === "pause" || action === "stop") {
          desiredPlaybackRef.current = false;
          pendingAudioPlayUrlRef.current = "";
          setIsPlaying(false);
          if (action === "stop") handleSeekRef.current(0);
        } else if (action === "play-pause") {
          const next = !isPlayingRef.current;
          if (next) {
            loadAndPlayTrack(selectedTrack, { restorePosition: true, restartIfEnded: true });
          } else {
            desiredPlaybackRef.current = false;
            pendingAudioPlayUrlRef.current = "";
            setIsPlaying(false);
          }
        } else if (action === "next") {
          goToTrackRef.current(1);
        } else if (action === "previous") {
          goToTrackRef.current(-1);
        } else if (action === "toggle-mute") {
          toggleMute();
        } else if (action === "stop-after-current") {
          stopAfterCurrentRef.current = !stopAfterCurrentRef.current;
        }
      }),
      listen<number>("mpris-seek", (event) => {
        const seconds = (Number(event.payload) || 0) / 1_000_000;
        seekByRef.current(seconds);
      }),
      listen<number>("mpris-position", (event) => {
        const targetSeconds = Math.max(0, (Number(event.payload) || 0) / 1_000_000);
        const timer = window.setTimeout(() => {
          pendingPositionTimers.delete(timer);
          if (nativeAudioMode) {
            handleSeekRef.current(targetSeconds);
            return;
          }
          const audio = audioRef.current;
          if (audio && Math.abs((Number(audio.currentTime) || 0) - targetSeconds) < 1.25) {
            setCurrentTime(Number(audio.currentTime) || targetSeconds);
            return;
          }
          handleSeekRef.current(targetSeconds);
        }, 180);
        pendingPositionTimers.add(timer);
      }),
    ];

    return () => {
      disposed = true;
      pendingPositionTimers.forEach((timer) => window.clearTimeout(timer));
      pendingPositionTimers.clear();
      unlisteners.forEach((unlistenPromise) => {
        void unlistenPromise.then((unlisten) => {
          if (disposed) unlisten();
        });
      });
    };
  }, [loadAndPlayTrack, nativeAudioMode, selectedTrack, switchPage, toggleMute]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!customMprisEnabled) return;
    if (!selectedTrackData || page !== "music") return;
    if (Date.now() < mprisQuietUntilRef.current) return;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : selectedTrackData.duration || 0;
    const audioPosition = nativeAudioMode ? currentTime || 0 : Number(audioRef.current?.currentTime) || currentTime || 0;
    const safePosition = Math.max(0, Math.min(safeDuration || Number.MAX_SAFE_INTEGER, audioPosition));
    const payload: MprisMetadataPayload = {
      trackId: selectedTrackData.id || String(selectedTrack),
      title: selectedTrackData.title || titleFromFileName(selectedTrackData.fileName),
      artist: selectedTrackData.artist || "ArDali WebMedia",
      album: selectedTrackData.album || "",
      albumArt: mprisArtworkUrl || "",
      duration: safeDuration,
      position: safePosition,
      isPlaying: isAudioActuallyPlaying,
      canGoNext: tracks.length > 1,
      canGoPrevious: tracks.length > 1,
      canSeek: safeDuration > 0,
      mediaType: "audio",
      url: pathToFileUrl(selectedTrackData.path) || selectedTrackData.url,
      volume,
    };
    const key = JSON.stringify({
      activeMedia: "audio",
      trackId: payload.trackId,
      title: payload.title,
      artist: payload.artist,
      albumArt: payload.albumArt,
      isPlaying: payload.isPlaying,
      duration: Math.floor(payload.duration || 0),
      position: Math.floor((payload.position || 0) / 2),
    });
    const now = Date.now();
    if (mprisMetadataKeyRef.current === key && now - mprisMetadataSentAtRef.current < 650) return;
    mprisMetadataKeyRef.current = key;
    mprisMetadataSentAtRef.current = now;
    void invoke("update_mpris_metadata", { payload }).catch((error) => {
      reportClientError("mpris.update", error);
    });
  }, [
    customMprisEnabled,
    currentTime,
    duration,
    page,
    selectedTrack,
    selectedTrackData?.album,
    selectedTrackData?.artist,
    selectedTrackData?.coverDataUrl,
    selectedTrackData?.duration,
    selectedTrackData?.fileName,
    selectedTrackData?.id,
    selectedTrackData?.path,
    selectedTrackData?.title,
    selectedTrackData?.url,
    isAudioActuallyPlaying,
    mprisArtworkUrl,
    nativeAudioMode,
    tracks.length,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!customMprisEnabled) return;
    if (!selectedTrackData || page !== "music") return;
    if (Date.now() < mprisQuietUntilRef.current) return;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : selectedTrackData.duration || 0;
    const safePosition = Math.max(0, Math.min(safeDuration || Number.MAX_SAFE_INTEGER, currentTime || 0));
    const seekedPosition = mprisSeekedPositionRef.current;
    const didSeek =
      seekedPosition !== null && Math.abs(seekedPosition - safePosition) < 1.25;
    if (didSeek) {
      mprisSeekedPositionRef.current = null;
    }
    const payload: MprisPositionPayload = {
      position: safePosition,
      isPlaying: isAudioActuallyPlaying,
      volume,
      seeked: didSeek,
    };
    const key = `${selectedTrackData.id}:${Math.floor(safePosition)}:${payload.isPlaying}:${payload.seeked}`;
    if (mprisPositionKeyRef.current === key) return;
    mprisPositionKeyRef.current = key;
    void invoke("update_mpris_position", { payload }).catch((error) => {
      reportClientError("mpris.position", error);
    });
  }, [customMprisEnabled, currentTime, duration, isAudioActuallyPlaying, page, selectedTrackData?.duration, selectedTrackData?.id, volume]);

  const updateEqBand = (index: number, value: number) => {
    setEqPreset("flat");
    setEqGains((current) => current.map((gain, gainIndex) => (gainIndex === index ? value : gain)));
  };

  const applyEqPreset = (preset: EqPresetId) => {
    setEqPreset(preset);
    setEqGains([...eqPresets[preset].gains]);
  };

  const resetEq = () => applyEqPreset("flat");

  const updateDspSetting = (key: keyof DspSettings, value: number) => {
    setDspSettings((current) => ({ ...current, [key]: value }));
  };

  const resetDsp = () => setDspSettings(defaultDspSettings);

  const getSpectrumAnalyser = useCallback(
    () => (nativeAudioMode && !htmlAudioFallbackActive ? null : graphRef.current?.rawAnalyser ?? null),
    [htmlAudioFallbackActive, nativeAudioMode],
  );

  const getNativeSpectrum = useCallback(
    (bands: number) => invoke<NativeSpectrumPair>("native_audio_spectrum_pair", { bands }),
    [],
  );

  const handleLoadedMetadata = () => {
    if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const nextDuration = Number(audio.duration) || 0;
    const savedPosition = Number(audio.currentTime) || 0;
    setDuration(nextDuration);
    setCurrentTime(savedPosition);
    setTracks((current) =>
      current.map((track, index) =>
        index === selectedTrack
          ? { ...track, duration: nextDuration, lastPosition: savedPosition, length: formatTime(nextDuration) }
          : track,
      ),
    );
  };

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number(video.duration) || 0;
    const savedPosition = Math.min(selectedVideoData?.lastPosition || videoCurrentTime || 0, Math.max(0, nextDuration - 1));
    if (savedPosition > 0 && Math.abs(video.currentTime - savedPosition) > 0.5) {
      video.currentTime = savedPosition;
    }
    setVideoDuration(nextDuration);
    setVideoCurrentTime(savedPosition);
    setVideoItems((current) =>
      current.map((item, index) =>
        index === selectedVideo
          ? { ...item, duration: nextDuration, lastPosition: savedPosition, meta: `${item.fileName} • ${formatTime(nextDuration)}` }
          : item,
      ),
    );
  };

  const handleVideoLoadedData = () => {
    const video = videoRef.current;
    if (!video) return;
    const thumbnailDataUrl = captureVideoFrame(video);
    if (thumbnailDataUrl) {
      setVideoItems((current) =>
        current.map((item, index) => (index === selectedVideo && item.thumbnailDataUrl !== thumbnailDataUrl ? { ...item, thumbnailDataUrl } : item)),
      );
    }
    if (thumbnailDataUrl || !Number.isFinite(video.duration) || video.duration <= 1) return;
    const restoreTime = video.currentTime;
    const targetTime = Math.min(0.8, Math.max(0, video.duration - 0.2));
    const captureAtTarget = () => {
      const nextThumbnail = captureVideoFrame(video);
      if (nextThumbnail) {
        setVideoItems((current) =>
          current.map((item, index) => (index === selectedVideo && item.thumbnailDataUrl !== nextThumbnail ? { ...item, thumbnailDataUrl: nextThumbnail } : item)),
        );
      }
      video.removeEventListener("seeked", captureAtTarget);
      if (Math.abs(video.currentTime - restoreTime) > 0.25) video.currentTime = restoreTime;
    };
    video.addEventListener("seeked", captureAtTarget, { once: true });
    video.currentTime = targetTime;
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    const nextTime = Number(video?.currentTime) || 0;
    if (Math.abs(nextTime - videoCurrentTimeRef.current) < 0.75) return;
    setVideoCurrentTime(nextTime);
  };

  if (!libraryLoaded) {
    return <main className="app-boot-screen" aria-hidden="true" />;
  }

  return (
    <main className={`app-shell ${railCollapsed ? "rail-collapsed" : ""} ${page === "web" ? "web-mode" : ""} ${webChromeHidden ? "web-chrome-hidden" : ""} web-motion-${webSettings.motionPreset} web-animation-${webSettings.animationMode} ${webSettings.lowPowerMode ? "web-low-power" : ""}`}>
      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus"
        multiple
        onChange={handleMusicFiles}
      />
      <input
        ref={videoInputRef}
        className="hidden-file-input"
        type="file"
        accept="video/*,.mp4,.mkv,.webm,.mov,.avi,.m4v,.ogv"
        multiple
        onChange={handleVideoFiles}
      />
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        controlsList="noremoteplayback nodownload"
        preload="auto"
        onError={() => reportClientError("audio.element", mediaErrorMessage(audioRef.current))}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          const audio = audioRef.current;
          const pendingUrl = pendingAudioPlayUrlRef.current;
          const pendingPlay = !!pendingUrl && (audio?.src === pendingUrl || audio?.currentSrc === pendingUrl);
          if ((desiredPlaybackRef.current || pendingPlay) && audio?.paused) {
            desiredPlaybackRef.current = true;
            void playAudioElement();
          }
        }}
        onCanPlay={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          const audio = audioRef.current;
          const pendingUrl = pendingAudioPlayUrlRef.current;
          const pendingPlay = !!pendingUrl && (audio?.src === pendingUrl || audio?.currentSrc === pendingUrl);
          if ((desiredPlaybackRef.current || pendingPlay) && audio?.paused) {
            desiredPlaybackRef.current = true;
            void playAudioElement();
          }
        }}
        onTimeUpdate={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          const audio = audioRef.current;
          setCurrentTime(Number(audio?.currentTime) || 0);
          if (desiredPlaybackRef.current && audio && !audio.paused && !audio.ended) {
            setIsAudioActuallyPlaying(true);
          }
        }}
        onSeeking={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          const audio = audioRef.current;
          if (audio) setCurrentTime(Number(audio.currentTime) || 0);
        }}
        onSeeked={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          const audio = audioRef.current;
          if (audio) setCurrentTime(Number(audio.currentTime) || 0);
        }}
        onPlay={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          pendingAudioPlayUrlRef.current = "";
          desiredPlaybackRef.current = true;
          setIsAudioActuallyPlaying(true);
          setIsPlaying(true);
        }}
        onPlaying={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          pendingAudioPlayUrlRef.current = "";
          ensureAnalysisGraphAfterPlayback();
          setIsAudioActuallyPlaying(true);
          setIsPlaying(true);
        }}
        onWaiting={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          setIsAudioActuallyPlaying(false);
        }}
        onPause={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          const audio = audioRef.current;
          const pendingUrl = pendingAudioPlayUrlRef.current;
          const pendingPlay = !!pendingUrl && (audio?.src === pendingUrl || audio?.currentSrc === pendingUrl);
          setIsAudioActuallyPlaying(false);
          if (pendingPlay && desiredPlaybackRef.current && !audio?.ended) return;
          if (audio && !audio.ended && audio.currentTime > 0.2) {
            desiredPlaybackRef.current = false;
            pendingAudioPlayUrlRef.current = "";
            if (analysisGraphTimerRef.current !== null) {
              window.clearTimeout(analysisGraphTimerRef.current);
              analysisGraphTimerRef.current = null;
            }
          }
          if (desiredPlaybackRef.current && !audio?.ended) return;
          setIsPlaying(false);
        }}
        onEnded={() => {
          if (nativeAudioMode && !htmlAudioFallbackActiveRef.current) return;
          setIsAudioActuallyPlaying(false);
          if (stopAfterCurrentRef.current) {
            stopAfterCurrentRef.current = false;
            desiredPlaybackRef.current = false;
            setIsPlaying(false);
            handleSeekRef.current(0);
            return;
          }
          goToTrack(1);
        }}
      />

      <header className="window-titlebar" data-tauri-drag-region>
        <span data-tauri-drag-region>{text("app.title")}</span>
        <div className="window-controls">
          <button onPointerDown={stopMainWindowButtonDrag} onClick={() => void handleMainWindowAction("minimize")} title={text("window.minimize")} aria-label={text("window.minimize")}>-</button>
          <button onPointerDown={stopMainWindowButtonDrag} onClick={() => void handleMainWindowAction("maximize")} title={text("window.maximize")} aria-label={text("window.maximize")}>⌃</button>
          <button onPointerDown={stopMainWindowButtonDrag} onClick={() => void handleMainWindowAction("close")} title={text("common.close")} aria-label={text("common.close")}>×</button>
        </div>
      </header>
      <div className="main-window-resize-grip main-window-resize-n" onMouseDown={(event) => handleMainResizeMouseDown(event, "North")} />
      <div className="main-window-resize-grip main-window-resize-e" onMouseDown={(event) => handleMainResizeMouseDown(event, "East")} />
      <div className="main-window-resize-grip main-window-resize-s" onMouseDown={(event) => handleMainResizeMouseDown(event, "South")} />
      <div className="main-window-resize-grip main-window-resize-w" onMouseDown={(event) => handleMainResizeMouseDown(event, "West")} />
      <div className="main-window-resize-grip main-window-resize-ne" onMouseDown={(event) => handleMainResizeMouseDown(event, "NorthEast")} />
      <div className="main-window-resize-grip main-window-resize-nw" onMouseDown={(event) => handleMainResizeMouseDown(event, "NorthWest")} />
      <div className="main-window-resize-grip main-window-resize-se" onMouseDown={(event) => handleMainResizeMouseDown(event, "SouthEast")} />
      <div className="main-window-resize-grip main-window-resize-sw" onMouseDown={(event) => handleMainResizeMouseDown(event, "SouthWest")} />
      <div className="main-window-resize-cue" aria-hidden="true" />

      <nav className="rail" aria-label={text("settings.aria")}>
        <div className="rail-stack">
          {railItems.map((item) => {
            if (item.id === "web" && !webSettings.enabled) return null;
            const active = page === item.id || (item.id === "files" && page === "music");
            const iconName =
              item.id === "files"
                ? "files.svg"
                : item.id === "video"
                  ? "video.svg"
                  : item.id === "music"
                    ? "music.svg"
                    : item.id === "gallery"
                      ? "gallery.svg"
                      : item.id === "web"
                        ? "web.svg"
                        : "";
            return (
              <button
                className={`rail-btn ${active ? "active" : ""}`}
                data-page={item.id}
                key={item.id}
                onClick={() => switchPage(item.id)}
                title={text(item.labelKey)}
                aria-label={text(item.labelKey)}
              >
                {iconName ? <RailThemeIcon name={iconName} /> : <Settings size={26} strokeWidth={2.1} />}
              </button>
            );
          })}
          <button className="rail-btn utility" data-page="sound-effects" onClick={openSoundEffectsWindow} title={text("rail.soundEffects")} aria-label={text("rail.soundEffects")}>
            <RailThemeIcon name="sound-effects.svg" />
          </button>
          <button className="rail-btn utility" data-page="visualizer" onClick={openProjectMWindow} title={text("rail.visualizer")} aria-label={text("rail.visualizer")}>
            <RailThemeIcon name="visualizer.svg" />
          </button>
        </div>
        <button
          className="rail-btn"
          data-page="settings"
          onClick={() => void openSettingsWindow()}
          title={text("rail.settings")}
          aria-label={text("rail.settings")}
        >
          <Settings size={26} strokeWidth={2.1} />
        </button>
        <button className="rail-btn muted" title={text("rail.about")} aria-label={text("rail.about")}>
          <CircleHelp size={24} />
        </button>
      </nav>

      {page !== "web" ? (
      <aside className="library-panel">
        <div className="panel-header">
          <span>{text("library.title")}</span>
          <button
            className="library-collapse-btn"
            onClick={() => setRailCollapsed((value) => !value)}
            title={railCollapsed ? text("library.collapseOpen") : text("library.collapseHide")}
            aria-label={railCollapsed ? text("library.collapseOpen") : text("library.collapseHide")}
            aria-expanded={!railCollapsed}
          >
            {railCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <div className="library-panel-content">
          <div className="library-quick-add">
            {page === "video" ? (
              <button className="primary-library-btn" onClick={openVideoPicker}>
                <span className="library-add-icon"><Video size={22} /></span>
                <span>
                  <strong>{text("library.openVideo")}</strong>
                  <small>{videoItems.length ? formatLabel(text("library.videoReady"), { count: videoItems.length }) : text("library.pickVideo")}</small>
                </span>
              </button>
            ) : (
              <button className="primary-library-btn" onClick={openMusicPicker}>
                <span className="library-add-icon"><FolderPlus size={22} /></span>
                <span>
                  <strong>{text("library.addMusic")}</strong>
                  <small>{tracks.length ? formatLabel(text("library.musicReady"), { count: tracks.length }) : text("library.root")}</small>
                </span>
              </button>
            )}
          </div>
          <div className="library-summary" aria-label={text("library.collection")}>
            <div className="library-stat active" title={text("library.collection")}>
              <Album size={17} />
              <span>{page === "video" ? videoItems.length : tracks.length}</span>
            </div>
            <div className="library-stat" title={text("library.nowPlaying")}>
              <Play size={17} />
              <span>{page === "video" ? (selectedVideoData ? 1 : 0) : selectedTrackData ? 1 : 0}</span>
            </div>
            <div className="library-stat" title={text("library.queue")}>
              <ListMusic size={17} />
              <span>{Math.max(0, (page === "video" ? videoItems.length : tracks.length) - 1)}</span>
            </div>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              value={libraryQuery}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder={text("library.search")}
            />
          </label>
          <div className="saved-folders">
            <span className="section-label">{text("library.savedFolders")}</span>
            <button className="folder-row active">
              <span className="folder-dot" />
              {page === "video" ? text("library.localVideo") : text("library.localMusic")}
            </button>
            <button className="folder-row">
              <span className="folder-dot cyan" />
              {formatLabel(text("library.shown"), { count: visibleLibraryCount })}
            </button>
          </div>
          <div className="library-maintenance">
            <button className="library-maintenance-btn" onClick={cleanMissingLibraryItems} disabled={!isTauriRuntime()}>
              {text("library.cleanMissing")}
            </button>
          </div>
        </div>
      </aside>
      ) : null}

      <section className={`workspace ${page === "video" ? "video-workspace" : ""} ${page === "web" ? "web-workspace" : ""}`}>
        <div className={`nav-bar ${page === "web" ? "web-platform-bar" : ""}`}>
          {page === "web" ? (
            <>
              {activeWebPlatformId !== ARDALI_STORE_PLATFORM_ID ? (
                <div className="web-history-controls" aria-label="Web gezinme kontrolleri">
                  <button
                    className="web-history-btn"
                    onClick={() => void navigateWebHistory("back").catch((error) => reportClientError("web.history-back", error))}
                    title={text("nav.back")}
                    aria-label={text("nav.back")}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    className="web-history-btn"
                    onClick={() => void navigateWebHistory("forward").catch((error) => reportClientError("web.history-forward", error))}
                    title={text("nav.forward")}
                    aria-label={text("nav.forward")}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              ) : null}
              <button
                className={`web-platform-btn web-store-btn ${activeWebPlatformId === ARDALI_STORE_PLATFORM_ID ? "active" : ""}`}
                onClick={openArdaliStore}
                title="ArDali Mağaza"
                aria-label="ArDali Mağaza"
              >
                <Store size={21} />
              </button>
              {platforms.map((platform) => (
                <button
                  className={`web-platform-btn ${activeWebPlatformId === platform.id ? "active" : ""}`}
                  key={platform.id}
                  onClick={() => void handleOpenWebPlatform(platform)}
                  title={platform.name}
                  aria-label={platform.name}
                >
                  <WebPlatformIcon platform={platform} />
                </button>
              ))}
            </>
          ) : (
          <>
          <button
            className="nav-btn"
            onClick={() => {
              if (page === "video" && selectedVideoData) {
                rememberCurrentVideoPosition();
                setVideoDocked(true);
                return;
              }
              switchPage(page === "video" ? "files" : "music");
            }}
            title={text("nav.back")}
            aria-label={text("nav.back")}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="nav-btn"
            onClick={() => switchPage(page === "files" ? "music" : page)}
            title={text("nav.forward")}
            aria-label={text("nav.forward")}
          >
            <ChevronRight size={20} />
          </button>
          <button className="nav-btn" title={text("nav.refresh")} aria-label={text("nav.refresh")}>
            <RefreshCw size={18} />
          </button>
          {page === "music" ? (
            <div className="view-popover-wrap">
              <button
                className={`nav-btn ${musicViewMenuOpen ? "active" : ""}`}
                onClick={() => setMusicViewMenuOpen((value) => !value)}
                title={text("nav.viewSettings")}
                aria-label={text("nav.viewSettings")}
                aria-expanded={musicViewMenuOpen}
              >
                <SlidersHorizontal size={18} />
              </button>
              {musicViewMenuOpen ? (
                <div className="view-popover" role="menu" aria-label={text("nav.musicViewSettings")}>
                  {musicViewModes.map((mode) => (
                    <button
                      className={musicViewMode === mode.id ? "active" : ""}
                      key={mode.id}
                      onClick={() => {
                        setMusicViewMode(mode.id);
                        setMusicViewMenuOpen(false);
                      }}
                      role="menuitemradio"
                      aria-checked={musicViewMode === mode.id}
                    >
                      {mode.id === "cards" ? <Grid2X2 size={17} /> : <ListMusic size={17} />}
                      <span>{text(`nav.${mode.id}`)}</span>
                      {musicViewMode === mode.id ? <Check size={16} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="view-switch">
              <button className="active" title={text("nav.list")} aria-label={text("nav.list")}>
                <ListMusic size={17} />
              </button>
              <button title={text("nav.card")} aria-label={text("nav.card")}>
                <Grid2X2 size={17} />
              </button>
            </div>
          )}
          <div className="now-playing">{formatLabel(text("nav.nowPlaying"), { name: nowPlaying })}</div>
          </>
          )}
        </div>

        {page === "web" ? (
        <div className="web-stage" aria-hidden={activeWebPlatformId !== ARDALI_STORE_PLATFORM_ID && !webRuntimeStatus}>
          {activeWebPlatformId === ARDALI_STORE_PLATFORM_ID ? (
            <ArdaliStoreView
              items={storeItems}
              status={storeStatus}
              onRefresh={refreshStoreItems}
              onInstall={handleInstallPlugin}
              onToggle={handleTogglePlugin}
              onClose={closeArdaliStore}
            />
          ) : webRuntimeStatus ? (
            <div className="web-runtime-status" role="status">{webRuntimeStatus}</div>
          ) : null}
        </div>
        ) : (
        <>
        <div className="content-grid">
          <div className="media-stage">
            {page === "video" ? (
              <VideoPage
                videos={videoItems}
                query={libraryQuery}
                selected={selectedVideo}
                isPlaying={isVideoPlaying}
                docked={videoDocked}
                miniClosed={videoMiniClosed}
                videoRef={videoRef}
                currentTime={videoCurrentTime}
                duration={videoDuration}
                volume={volume}
                onAdd={openVideoPicker}
                onDock={() => {
                  rememberCurrentVideoPosition();
                  setVideoDocked(true);
                  setVideoMiniClosed(false);
                }}
                onUndock={() => {
                  setVideoDocked(false);
                  setVideoMiniClosed(false);
                }}
                onCloseMini={closeVideoSession}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onLoadedData={handleVideoLoadedData}
                onRemove={removeVideo}
                onSelect={playVideo}
                text={text}
                onTimeUpdate={handleVideoTimeUpdate}
                onPlayState={setIsVideoPlaying}
                onEnded={() => goToVideo(1)}
                onPrev={() => goToVideo(-1)}
                onNext={() => goToVideo(1)}
                onSeek={handleSeek}
                onSeekBy={seekBy}
                onVolume={setVolume}
              />
            ) : (
              <MusicPage
                tracks={tracks}
                query={libraryQuery}
                selected={selectedTrack}
                isPlaying={isPlaying}
                viewMode={musicViewMode}
                onAdd={openMusicPicker}
                onPlay={playTrack}
                onRemove={removeTrack}
                onSelect={selectTrack}
                text={text}
              />
            )}
          </div>
        </div>

        <PlayerBar
          page={page}
          currentTime={currentTime}
          duration={duration}
          videoCurrentTime={videoCurrentTime}
          videoDuration={videoDuration}
          volume={volume}
          isPlaying={page === "video" ? isVideoPlaying : isAudioActuallyPlaying}
          spectrumPlaying={page === "video" ? isVideoPlaying : isAudioActuallyPlaying || (isPlaying && currentTime > 0)}
          hasMedia={page === "video" ? videoItems.length > 0 : tracks.length > 0}
          coverDataUrl={page === "video" || !selectedTrackData ? undefined : trackCover(selectedTrackData)}
          coverColor={page === "video" ? selectedVideoData?.color : selectedTrackData?.color}
          onClear={page === "video" ? clearVideos : clearTracks}
          getAnalyser={getSpectrumAnalyser}
          getNativeSpectrum={nativeAudioMode && !htmlAudioFallbackActive ? getNativeSpectrum : undefined}
          visualHoldUntilRef={visualHoldUntilRef}
          onNext={() => (page === "video" ? goToVideo(1) : goToTrack(1))}
          onOpenProjectM={openProjectMWindow}
          onPlayPause={togglePlayback}
          onPrev={() => (page === "video" ? goToVideo(-1) : goToTrack(-1))}
          onSeek={handleSeek}
          onSeekBy={seekBy}
          onToggleMute={toggleMute}
          onVolume={setVolume}
          text={text}
        />
        </>
        )}
      </section>
    </main>
  );
}

function SoundEffectsWindow() {
  const scope = normalizeSfxScope(new URLSearchParams(window.location.search).get("scope") || "music");
  const initial = useMemo(() => loadSoundEffectsState(scope), [scope]);
  const [webSettings, setWebSettings] = useState<WebSettings>(() => loadWebSettings());
  const [masterEnabled, setMasterEnabled] = useState(initial.masterEnabled);
  const [currentEffect, setCurrentEffect] = useState<SfxEffectId>(initial.currentEffect);
  const [panels, setPanels] = useState<Record<SfxEffectId, SfxPanelDefinition>>(initial.panels);
  const [lightsMode, setLightsMode] = useState("cyan");
  const [windowVisible, setWindowVisible] = useState(!document.hidden);
  const [selectedPanelPresets, setSelectedPanelPresets] = useState<Partial<Record<SfxEffectId, string>>>({});
  const [crossfeedAutoHeadphones, setCrossfeedAutoHeadphones] = useState(() => localStorage.getItem(soundEffectsCrossfeedAutoKey) !== "0");
  const [crossfeedOutput, setCrossfeedOutput] = useState<NativeAudioOutputState>({
    success: false,
    currentOutputName: "Cikis bilgisi bekleniyor",
    currentOutputId: "",
    isHeadphones: false,
    message: "Cikis bilgisi okunuyor",
  });
  const [crossfeedDspState, setCrossfeedDspState] = useState<NativeAudioState | null>(null);
  const [sfxSpectrum, setSfxSpectrum] = useState<NativeSpectrumPair>({ processed: [], raw: [] });
  const [sfxBroadcast, setSfxBroadcast] = useState<SfxBroadcastState>({
    effectsEnabled: initial.broadcast?.effectsEnabled ?? initial.masterEnabled,
    eqPreset: isEqPresetId(initial.broadcast?.eqPreset) ? initial.broadcast.eqPreset : "flat",
    eqPresetLabel:
      typeof initial.broadcast?.eqPresetLabel === "string"
        ? initial.broadcast.eqPresetLabel
        : eqPresets[isEqPresetId(initial.broadcast?.eqPreset) ? initial.broadcast.eqPreset : "flat"]?.label,
    eqGains:
      Array.isArray(initial.broadcast?.eqGains) && initial.broadcast.eqGains.length === eqFrequencies.length
        ? initial.broadcast.eqGains
        : [...flatEq],
    dspSettings: {
      ...defaultDspSettings,
      ...initial.broadcast?.dspSettings,
    },
  });
  const activePanel = panels[currentEffect];
  const language = webSettings.language;
  const text = useCallback((key: string) => tr(language, key), [language]);
  const activePanelText = sfxEffectText(language, currentEffect, activePanel);
  const windowTitle = getSoundEffectsWindowTitle(scope, language);
  const spectrumActive = currentEffect === "eq32" || currentEffect === "truepeak";
  const animationsActive = windowVisible && lightsMode !== "off";
  const broadcastState = useMemo(
    () => ({
      ...sfxBroadcast,
      scope,
      effectsEnabled: masterEnabled,
      dspSettings: buildBroadcastFromSfx(panels, masterEnabled).dspSettings,
    }),
    [masterEnabled, panels, scope, sfxBroadcast],
  );

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
    document.title = windowTitle;
    applyDocumentTheme(resolveEffectiveTheme(webSettings));
  }, [language, webSettings.theme, webSettings.followSystemTheme, windowTitle]);

  useEffect(() => {
    const handleLocalSettings = (event: Event) => {
      const detail = (event as CustomEvent<WebSettings>).detail;
      setWebSettings(detail ?? loadWebSettings());
    };
    let cleanupTauri: (() => void) | undefined;
    if (isTauriRuntime()) {
      void listen<WebSettings>(WEB_SETTINGS_EVENT, (event) => setWebSettings(event.payload)).then((cleanup) => {
        cleanupTauri = cleanup;
      });
    }
    window.addEventListener(WEB_SETTINGS_EVENT, handleLocalSettings);
    return () => {
      cleanupTauri?.();
      window.removeEventListener(WEB_SETTINGS_EVENT, handleLocalSettings);
    };
  }, []);

  useEffect(() => {
    const syncVisibility = () => setWindowVisible(!document.hidden);
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", syncVisibility);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sfxLights = windowVisible ? lightsMode : "off";
  }, [lightsMode, windowVisible]);

  useEffect(() => {
    if (!isTauriRuntime() || !spectrumActive) {
      setSfxSpectrum({ processed: [], raw: [] });
      return undefined;
    }
    let cancelled = false;
    let timer = 0;
    let inFlight = false;
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        if (scope === "web") {
          const raw = await getWebDaliRawSpectrum(96);
          if (!cancelled) setSfxSpectrum({ processed: raw, raw });
        } else {
          const values = await invoke<NativeSpectrumPair>("native_audio_spectrum_pair", { bands: 96 });
          if (!cancelled && values && Array.isArray(values.processed) && Array.isArray(values.raw)) setSfxSpectrum(values);
        }
      } catch {
        if (!cancelled) setSfxSpectrum({ processed: [], raw: [] });
      } finally {
        inFlight = false;
        if (!cancelled) timer = window.setTimeout(refresh, spectrumActive ? 33 : 140);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scope, spectrumActive]);

  useEffect(() => {
    localStorage.setItem(soundEffectsCrossfeedAutoKey, crossfeedAutoHeadphones ? "1" : "0");
  }, [crossfeedAutoHeadphones]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let cancelled = false;
    let timer = 0;
    const refresh = async () => {
      try {
        const [output, state] = await Promise.all([
          invoke<NativeAudioOutputState>("native_audio_output_state"),
          invoke<NativeAudioState>("native_audio_state").catch(() => null),
        ]);
        if (cancelled) return;
        setCrossfeedOutput(output);
        setCrossfeedDspState(state);
        if (crossfeedAutoHeadphones && output.success) {
          setPanels((current) => {
            const enabled = output.isHeadphones;
            if (current.crossfeed.enabled === enabled) return current;
            return {
              ...current,
              crossfeed: {
                ...current.crossfeed,
                enabled,
              },
            };
          });
        }
      } catch {
        if (!cancelled) {
          setCrossfeedOutput({
            success: false,
            currentOutputName: "Cikis bilgisi okunamadi",
            currentOutputId: "",
            isHeadphones: false,
            message: "Cikis bilgisi okunamadi",
          });
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, 1800);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [crossfeedAutoHeadphones]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let unlisten: (() => void) | undefined;
    void listen<SfxBroadcastState>("ardali-eq-preset-apply", (event) => {
      const next = event.payload;
      if (!next || !Array.isArray(next.eqGains) || next.eqGains.length !== eqFrequencies.length) return;
      setMasterEnabled(Boolean(next.effectsEnabled));
      setCurrentEffect("eq32");
      setSfxBroadcast({
        effectsEnabled: Boolean(next.effectsEnabled),
        eqPreset: isEqPresetId(next.eqPreset) ? next.eqPreset : "flat",
        eqPresetLabel:
          typeof next.eqPresetLabel === "string"
            ? next.eqPresetLabel
            : eqPresets[isEqPresetId(next.eqPreset) ? next.eqPreset : "flat"]?.label,
        eqGains: normalizedEqBands(next.eqGains),
        dspSettings: {
          ...defaultDspSettings,
          ...next.dspSettings,
        },
      });
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const snapshot = {
        masterEnabled,
        currentEffect,
        panels,
        broadcast: broadcastState,
      };
      localStorage.setItem(scopedSoundEffectsStorageKey(scope), JSON.stringify(snapshot));
      try {
        const channel = new BroadcastChannel(soundEffectsChannelName);
        channel.postMessage(broadcastState);
        channel.close();
      } catch {
        // browser yoksa sessiz kal
      }
      if (scope === "web") {
        void applyWebDaliEffects(toWebDaliPayload(broadcastState)).catch((error) => reportClientError("web.dali.sfx-window-direct", error));
      }
      if (isTauriRuntime()) {
        void emit("ardali-sfx-broadcast", broadcastState).catch(() => undefined);
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [broadcastState, currentEffect, masterEnabled, panels, scope]);

  useEffect(() => {
    setSfxBroadcast((current) => {
      const next = buildBroadcastFromSfxState(panels, masterEnabled, current.eqGains, current.eqPreset, current.eqPresetLabel);
      const sameDsp =
        current.effectsEnabled === next.effectsEnabled &&
        JSON.stringify(current.dspSettings) === JSON.stringify(next.dspSettings);
      return sameDsp ? current : next;
    });
  }, [masterEnabled, panels]);

  const updatePanelParam = (panelId: SfxEffectId, key: string, value: number) => {
    setPanels((current) => ({
      ...current,
      [panelId]: {
        ...current[panelId],
        enabled: typeof current[panelId].enabled === "boolean" ? true : current[panelId].enabled,
        params: current[panelId].params.map((param) => (param.key === key ? { ...param, value } : param)),
      },
    }));
  };

  const updatePanelOption = (panelId: SfxEffectId, key: string, value: string) => {
    setPanels((current) => {
      const acousticPreset = panelId === "eq32" && key === "acousticSpace" ? eqAcousticSpacePresets[value] : undefined;
      return {
        ...current,
        [panelId]: {
          ...current[panelId],
          params: acousticPreset
            ? current[panelId].params.map((param) =>
                typeof acousticPreset[param.key] === "number" ? { ...param, value: acousticPreset[param.key] } : param,
              )
            : current[panelId].params,
          options: current[panelId].options?.map((option) => (option.key === key ? { ...option, value } : option)),
        },
      };
    });
  };

  const togglePanel = (panelId: SfxEffectId) => {
    setPanels((current) => ({
      ...current,
      [panelId]: {
        ...current[panelId],
        enabled: !current[panelId].enabled,
      },
    }));
  };

  const resetPanel = (panelId: SfxEffectId) => {
    if (panelId === "eq32") {
      setSfxBroadcast((current) => ({ ...current, eqPreset: "flat", eqGains: [...flatEq] }));
    }
    setSelectedPanelPresets((current) => ({ ...current, [panelId]: undefined }));
    setPanels((current) => ({
      ...current,
      [panelId]: cloneSfxDefinitions()[panelId],
    }));
  };

  const resetEqModule = () => {
    const defaults = cloneSfxDefinitions().eq32;
    const moduleKeys = new Set(["bass", "mid", "treble", "stereoExpander"]);
    setPanels((current) => ({
      ...current,
      eq32: {
        ...current.eq32,
        params: current.eq32.params.map((param) =>
          moduleKeys.has(param.key) ? (defaults.params.find((item) => item.key === param.key) ?? param) : param,
        ),
        options: current.eq32.options?.map((option) => defaults.options?.find((item) => item.key === option.key) ?? option),
      },
    }));
  };

  const setEqBand = (index: number, value: number) => {
    const next = [...broadcastState.eqGains];
    next[index] = value;
    const nextBroadcast: SfxBroadcastState = { ...broadcastState, eqGains: next, eqPreset: "flat", eqPresetLabel: "Duz (Flat)" };
    setSfxBroadcast(nextBroadcast);
  };

  const applyPreset = (preset: EqPresetId) => {
    const nextBroadcast: SfxBroadcastState = { ...broadcastState, eqPreset: preset, eqPresetLabel: eqPresets[preset].label, eqGains: [...eqPresets[preset].gains] };
    setSfxBroadcast(nextBroadcast);
  };

  const applyPanelPreset = (panelId: SfxEffectId, presetId: string) => {
    const preset = sfxPanelPresets[panelId]?.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedPanelPresets((current) => ({ ...current, [panelId]: presetId }));
    setPanels((current) => {
      const panel = current[panelId];
      return {
        ...current,
        [panelId]: {
          ...panel,
          enabled: typeof panel.enabled === "boolean" ? true : panel.enabled,
          params: panel.params.map((param) =>
            Object.prototype.hasOwnProperty.call(preset.values, param.key) && typeof preset.values[param.key] === "number"
              ? { ...param, value: Number(preset.values[param.key]) }
              : param,
          ),
          options: panel.options?.map((option) =>
            Object.prototype.hasOwnProperty.call(preset.values, option.key)
              ? { ...option, value: String(preset.values[option.key]) }
              : option,
          ),
        },
      };
    });
  };

  const windowAction = async (action: "minimize" | "maximize" | "close") => {
    if (action === "close") {
      setWindowVisible(false);
      document.documentElement.dataset.sfxLights = "off";
    }
    if (!isTauriRuntime()) {
      if (action === "close") window.close();
      return;
    }
    const current = getCurrentWebviewWindow();
    if (action === "minimize") await current.minimize();
    if (action === "maximize") await current.toggleMaximize();
    if (action === "close") await current.close();
  };

  const startWindowResize = async () => {
    if (!isTauriRuntime()) return;
    try {
      await getCurrentWindow().startResizeDragging("SouthEast");
    } catch (error) {
      reportClientError("sound-effects.resize", error);
    }
  };

  const openEqPresetsWindow = async () => {
    const url = "/?view=eq-presets";
    const title = `${text("sfx.presets")} - ArDali`;
    if (!isTauriRuntime()) {
      window.open(url, "ardali-eq-presets", "width=980,height=820");
      return;
    }
    const existing = await WebviewWindow.getByLabel("eq-presets");
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    new WebviewWindow("eq-presets", {
      url,
      title,
      width: 980,
      height: 820,
      minWidth: 980,
      minHeight: 820,
      resizable: true,
      decorations: false,
      center: true,
      visible: true,
    });
  };

  return (
    <main className={`sfx-window sfx-light-${lightsMode}`} data-sfx-lights={lightsMode}>
      <header className="sfx-titlebar" data-tauri-drag-region>
        <span data-tauri-drag-region>{windowTitle}</span>
        <div className="window-controls">
          <button onClick={() => void windowAction("minimize")} aria-label={text("window.minimize")}>-</button>
          <button onClick={() => void windowAction("maximize")} aria-label={text("window.maximize")}>⌃</button>
          <button onClick={() => void windowAction("close")} aria-label={text("common.close")}>×</button>
        </div>
      </header>
      <header className="sfx-window-header">
        <div className="sfx-header-left">
          <img className="sfx-logo" src="/icons/app/ardali_256.png" alt="ArDali" />
          <label className="sfx-master-toggle">
            <input checked={masterEnabled} onChange={() => setMasterEnabled((value) => !value)} type="checkbox" />
            <span />
            <strong>{text("sfx.enableEffects")}</strong>
          </label>
          <label className="sfx-light-control">
            <span>{text("sfx.lightColor")}</span>
            <select value={lightsMode} onChange={(event) => setLightsMode(event.target.value)}>
              <option value="cyan">{text("sfx.light.cyan")}</option>
              <option value="rainbow">{text("sfx.light.rainbow")}</option>
              <option value="blue">{text("sfx.light.blue")}</option>
              <option value="purple">{text("sfx.light.purple")}</option>
              <option value="green">{text("sfx.light.green")}</option>
              <option value="amber">{text("sfx.light.amber")}</option>
              <option value="red">{text("sfx.light.red")}</option>
              <option value="off">{text("sfx.light.off")}</option>
            </select>
          </label>
        </div>
        <div className="sfx-header-right">
          <span className="sfx-status">
            {formatLabel(text("sfx.status"), {
              state: masterEnabled ? text("sfx.on") : text("sfx.off"),
              scope: text(`sfx.scope.${scope}`),
              active: activePanelText.title,
            })}
          </span>
        </div>
      </header>

      <div className="sfx-window-body">
        <aside className="sfx-sidebar-full">
          {sfxSidebarGroups.map((group, groupIndex) => (
            <div className="sfx-sidebar-section" key={groupIndex}>
              {group.map((item) => (
                <button
                  className={`sfx-effect-row ${currentEffect === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setCurrentEffect(item.id)}
                >
                  <SfxEffectIcon id={item.id} />
                  <span>{sfxEffectText(language, item.id, item).title}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <section className="sfx-panel-full">
          <div className="sfx-panel-head">
            <div>
              <h1>{activePanelText.title}</h1>
              <p>{activePanelText.description}</p>
            </div>
            <div className="sfx-panel-actions">
              {typeof activePanel.enabled === "boolean" ? (
                <label className="sfx-enable">
                  <input checked={activePanel.enabled} onChange={() => togglePanel(currentEffect)} type="checkbox" />
                  <span>{text("sfx.enabled")}</span>
                </label>
              ) : null}
              {currentEffect === "eq32" ? (
                <button className="sfx-preset-btn" onClick={() => void openEqPresetsWindow()}>
                  {text("sfx.presets")} • {broadcastState.eqPresetLabel || eqPresets[broadcastState.eqPreset]?.label || "Duz (Flat)"}
                </button>
              ) : null}
              <button className="sfx-reset-btn" onClick={() => resetPanel(currentEffect)}>
                {text("sfx.reset")}
              </button>
            </div>
          </div>

          {currentEffect === "eq32" ? (
            <>
              <SfxEqBands
                active={spectrumActive}
                lightsMode={lightsMode}
                onBandChange={setEqBand}
                spectrumValues={sfxSpectrum.processed}
                rawSpectrumValues={sfxSpectrum.raw}
                values={broadcastState.eqGains}
              />
              <SfxEqModule
                active={animationsActive}
                lightsMode={lightsMode}
                options={activePanel.options || []}
                params={activePanel.params}
                onParamChange={(key, value) => updatePanelParam("eq32", key, value)}
                onOptionChange={(key, value) => updatePanelOption("eq32", key, value)}
                onReset={resetEqModule}
                language={language}
                text={text}
              />
            </>
          ) : (
            <>
              {currentEffect === "crossfeed" ? (
                <SfxCrossfeedAssist
                  autoHeadphones={crossfeedAutoHeadphones}
                  dspState={crossfeedDspState}
                  outputState={crossfeedOutput}
                  panel={activePanel}
                  onAutoChange={setCrossfeedAutoHeadphones}
                  text={text}
                />
              ) : null}
              {currentEffect === "truepeak" ? (
                <SfxTruePeakMeter
                  panel={activePanel}
                  spectrum={sfxSpectrum}
                  onOptionChange={(key, value) => updatePanelOption("truepeak", key, value)}
                  onParamChange={(key, value) => updatePanelParam("truepeak", key, value)}
                  text={text}
                />
              ) : null}
              {currentEffect === "bassmono" ? <SfxBassMonoVisual panel={activePanel} text={text} /> : null}
              <div className="sfx-knob-grid">
                {activePanel.params.map((param) => (
                  <SfxKnob
                    key={param.key}
                    lightsMode={lightsMode}
                    param={translateSfxParam(language, param)}
                    active={animationsActive}
                    onChange={(value) => updatePanelParam(currentEffect, param.key, value)}
                  />
                ))}
              </div>
            </>
          )}

          {currentEffect !== "eq32" && currentEffect !== "truepeak" && activePanel.options?.length ? (
            <div className="sfx-option-grid">
              {activePanel.options.map((option) => (
                <label className="sfx-option" key={option.key}>
                  <span>{sfxParamTranslations[language]?.[option.key] ?? sfxParamTranslations["tr-TR"][option.key] ?? option.label}</span>
                  <select value={option.value} onChange={(event) => updatePanelOption(currentEffect, option.key, event.target.value)}>
                    {option.options.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          {currentEffect !== "eq32" && sfxPanelPresets[currentEffect]?.length ? (
            <section className="sfx-presets-section">
              <div className="sfx-presets-title">{text("sfx.presets")}</div>
              <div className="sfx-presets-buttons">
                {sfxPanelPresets[currentEffect]?.map((preset) => (
                  <button
                    className={`sfx-preset-chip ${selectedPanelPresets[currentEffect] === preset.id ? "active" : ""}`}
                    key={preset.id}
                    onClick={() => applyPanelPreset(currentEffect, preset.id)}
                  >
                    <SfxEffectIcon id={currentEffect} />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </div>

      <footer className="sfx-window-footer">ArDali DSP Engine v3.0 • 48kHz / 32-bit Float Processing</footer>
      <button className="sfx-resize-grip" onMouseDown={() => void startWindowResize()} aria-label={text("sfx.resize")} />
    </main>
  );
}

function SfxBassMonoVisual({ panel, text }: { panel: SfxPanelDefinition; text: (key: string) => string }) {
  const cutoff = getPanelParam(panel, "cutoff");
  const slope = getPanelParam(panel, "slope");
  const stereoWidth = getPanelParam(panel, "stereoWidth");
  const freqs = [20, 50, 100, 200, 500, 1000, 5000, 10000, 20000];
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const xForFreq = (freq: number) => 28 + ((Math.log10(freq) - minLog) / (maxLog - minLog)) * 544;
  const yForResponse = (freq: number) => {
    const ratio = Math.max(freq / Math.max(cutoff, 1), 0.001);
    const attenuationDb = Math.max(0, Math.log2(ratio) * slope);
    const response = 1 / (1 + Math.pow(10, attenuationDb / 20));
    return 150 - response * 120;
  };
  const curve = useMemo(() => {
    const points: string[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const t = i / 120;
      const freq = Math.pow(10, minLog + (maxLog - minLog) * t);
      points.push(`${xForFreq(freq).toFixed(1)},${yForResponse(freq).toFixed(1)}`);
    }
    return points.join(" ");
  }, [cutoff, slope]);
  const cutoffX = xForFreq(cutoff);
  const widthX = xForFreq(9000);
  const widthEnd = Math.min(560, widthX + Math.max(32, stereoWidth * 0.42));

  return (
    <section className="sfx-bassmono-visual">
      <div className="sfx-bassmono-header">
        <strong>Bass Mono</strong>
        <div>
          <span>Cutoff {Math.round(cutoff)} Hz</span>
          <span>{text("sfx.slope")} {Math.round(slope)} dB/oct</span>
          <span>Stereo Width {Math.round(stereoWidth)}%</span>
        </div>
      </div>
      <svg viewBox="0 0 600 180" aria-hidden="true">
        <defs>
          <linearGradient id="bassMonoArea" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(255, 0, 174, 0.34)" />
            <stop offset="100%" stopColor="rgba(0, 212, 255, 0.18)" />
          </linearGradient>
        </defs>
        <rect className="plot-bg" x="18" y="18" width="564" height="138" rx="4" />
        <rect className="mono-zone" x="18" y="18" width={Math.max(0, cutoffX - 18)} height="138" />
        <rect className="stereo-zone" x={cutoffX} y="18" width={Math.max(0, 582 - cutoffX)} height="138" />
        {[1, 2, 3, 4].map((line) => <line className="grid-h" key={`h${line}`} x1="18" x2="582" y1={18 + line * 27.6} y2={18 + line * 27.6} />)}
        {freqs.map((freq) => <line className="grid-v" key={freq} x1={xForFreq(freq)} x2={xForFreq(freq)} y1="18" y2="156" />)}
        <polyline className="bassmono-curve-glow" points={curve} />
        <polyline className="bassmono-curve" points={curve} />
        <line className="cutoff-line" x1={cutoffX} x2={cutoffX} y1="18" y2="156" />
        <text className="cutoff-label" x={Math.min(540, cutoffX + 6)} y="38">{Math.round(cutoff)} Hz</text>
        <text className="zone-label" x="28" y="34">Mono</text>
        <text className="zone-label stereo" x="538" y="34">Stereo</text>
        <line className="width-line" x1={widthX} x2={widthEnd} y1="148" y2="148" />
        <text className="width-label" x="556" y="143" textAnchor="end">Stereo Width {Math.round(stereoWidth)}%</text>
        {freqs.map((freq) => (
          <text className="freq-label" key={`t${freq}`} x={xForFreq(freq)} y="170" textAnchor="middle">
            {freq >= 1000 ? `${freq / 1000}k` : freq}
          </text>
        ))}
      </svg>
      <div className="sfx-bassmono-note">
        {text("sfx.bassMonoNote")}
      </div>
    </section>
  );
}

function SfxTruePeakMeter({
  panel,
  spectrum,
  onParamChange,
  onOptionChange,
  text,
}: {
  panel: SfxPanelDefinition;
  spectrum: NativeSpectrumPair;
  onParamChange: (key: string, value: number) => void;
  onOptionChange: (key: string, value: string) => void;
  text: (key: string) => string;
}) {
  const ceiling = getPanelParam(panel, "ceiling");
  const drive = getPanelParam(panel, "drive");
  const oversampling = getPanelParam(panel, "oversampling");
  const stereoLink = getPanelOption(panel, "stereoLink") !== "off";
  const [clipCount, setClipCount] = useState(0);
  const values = spectrum.processed.length ? spectrum.processed : spectrum.raw;
  const rawPeak = values.reduce((peak, value) => Math.max(peak, Math.abs(Number(value) || 0)), 0);
  const normalizedPeak = rawPeak > 2 ? Math.min(1, rawPeak / 255) : Math.min(1, rawPeak);
  const drivenPeak = Math.min(1.6, normalizedPeak * dbToLinear(drive));
  const peakDb = drivenPeak > 0.000001 ? 20 * Math.log10(drivenPeak) : -60;
  const truePeakL = Math.max(-60, Math.min(3, peakDb + 0.25));
  const truePeakR = Math.max(-60, Math.min(3, peakDb - (stereoLink ? 0.25 : 0.75)));
  const gr = Math.max(0, Math.max(truePeakL, truePeakR) - ceiling);
  const active = panel.enabled === true;
  const meterL = active ? truePeakL : -60;
  const meterR = active ? truePeakR : -60;
  const displayGr = active ? gr : 0;

  useEffect(() => {
    if (!active) return;
    if (Math.max(truePeakL, truePeakR) >= ceiling) {
      setClipCount((count) => Math.min(9999, count + 1));
    }
  }, [active, ceiling, truePeakL, truePeakR]);

  const meterWidth = (db: number) => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
  const oversamplingValues = [2, 4, 8];

  return (
    <section className="sfx-truepeak-meter">
      <div className="sfx-truepeak-title">{text("sfx.truePeakMeters")}</div>
      {(["L", "R"] as const).map((channel, index) => {
        const db = channel === "L" ? meterL : meterR;
        return (
          <div className="sfx-truepeak-row" key={channel}>
            <strong>{channel}</strong>
            <div className={`sfx-truepeak-bar ${active ? "" : "idle"}`}>
              <span style={{ width: meterWidth(db) }} />
              <i style={{ left: meterWidth(ceiling) }} />
            </div>
            <em>{db.toFixed(1)} dBTP</em>
          </div>
        );
      })}
      <div className="sfx-truepeak-scale">
        <span>-60</span>
        <span>-36</span>
        <span>-18</span>
        <span>-6</span>
        <span>0 dBTP</span>
      </div>
      <div className="sfx-truepeak-statusline">
        <div>
          <span>{text("sfx.clipping")}</span>
          <strong>{clipCount}</strong>
          <button onClick={() => setClipCount(0)}>{text("sfx.reset")}</button>
        </div>
        <div>
          <span>GR:</span>
          <strong className={displayGr > 0.05 ? "active" : ""}>{displayGr.toFixed(1)} dB</strong>
        </div>
      </div>
      <div className="sfx-truepeak-controls">
        <div className="sfx-truepeak-os">
          <span>{text("sfx.oversampling")}</span>
          {oversamplingValues.map((value) => (
            <button className={Math.round(oversampling) === value ? "active" : ""} key={value} onClick={() => onParamChange("oversampling", value)}>
              {value}x
            </button>
          ))}
        </div>
        <label className="sfx-truepeak-link">
          <input checked={stereoLink} onChange={(event) => onOptionChange("stereoLink", event.target.checked ? "on" : "off")} type="checkbox" />
          <span>{text("sfx.stereoLink")}</span>
        </label>
      </div>
      <div className="sfx-truepeak-help">
        {active
          ? formatLabel(text("sfx.truePeakActive"), { clip: clipCount, gr: displayGr.toFixed(1) })
          : text("sfx.truePeakIdle")}
      </div>
    </section>
  );
}

function SfxCrossfeedAssist({
  autoHeadphones,
  dspState,
  outputState,
  panel,
  onAutoChange,
  text,
}: {
  autoHeadphones: boolean;
  dspState: NativeAudioState | null;
  outputState: NativeAudioOutputState;
  panel: SfxPanelDefinition;
  onAutoChange: (value: boolean) => void;
  text: (key: string) => string;
}) {
  const level = getPanelParam(panel, "level");
  const delay = getPanelParam(panel, "delay");
  const lowCut = getPanelParam(panel, "lowCut");
  const highCut = getPanelParam(panel, "highCut");
  const statusText = formatLabel(text("sfx.dspStatus"), {
    state: dspState?.initialized ? text("sfx.connected") : text("sfx.waiting"),
    loaded: dspState?.loaded ? "1" : "0",
  });
  const outputClass = outputState.success && outputState.isHeadphones ? "headphones" : outputState.success ? "speakers" : "unknown";
  const outputText =
    outputState.success && outputState.isHeadphones
      ? formatLabel(text("sfx.headphonesDetected"), { device: outputState.currentOutputName })
      : outputState.success
        ? formatLabel(text("sfx.speakersDetected"), { device: outputState.currentOutputName })
        : text("sfx.outputUnknown");

  return (
    <section className="sfx-crossfeed-assist">
      <div className="sfx-crossfeed-visual">
        <h3>{text("sfx.stereoField")}</h3>
        <svg viewBox="0 0 420 210" aria-hidden="true">
          <circle className="head" cx="210" cy="116" r="45" />
          <circle className="speaker speaker-left" cx="110" cy="42" r="8" />
          <circle className="speaker speaker-right" cx="320" cy="42" r="8" />
          <path className="direct" d="M110 42 L156 102" />
          <path className="direct" d="M320 42 L264 102" />
          <path className="cross cross-left" d="M110 42 Q207 2 264 102" />
          <path className="cross cross-right" d="M320 42 Q213 2 156 102" />
          <text x="102" y="24">L</text>
          <text x="314" y="24">R</text>
          <text className="caption" x="210" y="172" textAnchor="middle">
            Crossfeed: {Math.round(level)}%
          </text>
          <text className="caption" x="210" y="188" textAnchor="middle">
            Delay: {delay.toFixed(2)} ms
          </text>
        </svg>
      </div>
      <div className="sfx-crossfeed-status">{statusText}</div>
      <div className={`sfx-crossfeed-device ${outputClass}`}>{outputText}</div>
      <label className="sfx-crossfeed-auto">
        <input checked={autoHeadphones} onChange={(event) => onAutoChange(event.target.checked)} type="checkbox" />
        <span>{text("sfx.crossfeedAuto")}</span>
      </label>
      <div className="sfx-crossfeed-details">
        {formatLabel(text("sfx.lowHighCut"), { low: Math.round(lowCut), high: Math.round(highCut) })}
      </div>
    </section>
  );
}

function SfxEffectIcon({ id }: { id: SfxEffectId }) {
  const iconMap: Partial<Record<SfxEffectId, string>> = {
    audiophile: "M6 4v16M12 4v16M18 4v16M4 12h4M10 8h4M16 16h4",
    eq32: "M6 4v16M12 4v16M18 4v16M4 9h4M10 14h4M16 7h4",
    reverb: "M4 12h5l3-4v8l3-4h5",
    compressor: "M4 7h8l8 10M4 17h8l8-10",
    limiter: "M7 4v16M17 4v16M7 12h10",
    bassboost: "M5 14c3-6 5-6 8 0s5 6 8 0",
    autogain: "M7 17V7M12 17V4M17 17v-6M4 17h16",
    truepeak: "M4 18h16M7 15V9M12 15V5M17 15v-8",
    peq: "M4 16c4-9 6 9 10 0s3-4 6-2",
    dynamiceq: "M4 15c4-8 6 8 10 0s3-5 6-3M4 20h16",
    exciter: "M12 3l2.2 5.4L20 9l-4.5 3.6L17 19l-5-3.5L7 19l1.5-6.4L4 9l5.8-.6L12 3z",
    deesser: "M5 9c2-4 12-4 14 0M7 15c2 4 8 4 10 0",
    noisegate: "M4 12h4l2-6 4 12 2-6h4",
    stereowidener: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
    echo: "M5 12h6M13 8h6M13 12h6M13 16h6M7 9l-3 3 3 3",
    softecho: "M4 12c2.5-3 5.5-3 8 0s5.5 3 8 0M7 16c1.8-2 3.8-2 5.6 0",
    convreverb: "M4 7h16v10H4zM7 10h2M12 10h2M17 10h2M10 14h4",
    crossfeed: "M4 13v3M20 13v3M4 13a8 8 0 0 1 16 0M5 12h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2ZM19 12h-1a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2ZM9 15c1.2-1 2.8-1 4 0",
    surround: "M12 6v12M6 9v6M18 9v6M3.5 12h1M19.5 12h1",
    bassmono: "M4 16V8l4-2v12l-4-2ZM11 9c3 1.5 3 4.5 0 6M14 8c4 2 4 6 0 8",
    tapesat: "M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM9 14a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM15 14a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z",
    bitdither: "M4 8h3M9 8h3M14 8h3M19 8h1M4 16h1M7 16h3M12 16h3M17 16h3",
  };
  return (
    <span className="sfx-row-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={iconMap[id] || "M6 4v16M12 4v16M18 4v16"} />
      </svg>
    </span>
  );
}

function sfxLightStops(mode: string) {
  if (mode === "cyan" || mode === "off") return "#18d8ff, #22f3c5";
  if (mode === "blue") return "#3b82f6, #22d3ee";
  if (mode === "purple") return "#a855f7, #22d3ee";
  if (mode === "green") return "#84ff32, #22f3c5";
  if (mode === "amber") return "#ffcf33, #ff5b36";
  if (mode === "red") return "#ff3864, #ff8a30";
  return "#ff3d4f, #ffcc22, #4cff32, #19e6ff, #5145ff, #e83dff";
}

function sfxHue(mode: string) {
  if (mode === "blue") return 220;
  if (mode === "purple") return 275;
  if (mode === "green") return 135;
  if (mode === "amber") return 38;
  if (mode === "red") return 4;
  return 195;
}

function hsvToRgba(h: number, s: number, v: number, alpha = 255) {
  const sat = s / 255;
  const val = v / 255;
  const c = val * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)}, ${alpha / 255})`;
}

function sfxColorAtRatio(mode: string, ratio: number, shift: number, alpha = 255, saturation = 235, value = 255) {
  if (mode === "off") return hsvToRgba(195, 220, 255, alpha);
  if (mode !== "rainbow") return hsvToRgba(sfxHue(mode), saturation, value, alpha);
  return hsvToRgba(shift * 360 + Math.max(0, Math.min(1, ratio)) * 300, saturation, value, alpha);
}

function SfxEqBands({
  active,
  rawSpectrumValues,
  spectrumValues,
  values,
  onBandChange,
  lightsMode,
}: {
  active: boolean;
  rawSpectrumValues: number[];
  spectrumValues: number[];
  values: number[];
  onBandChange: (index: number, value: number) => void;
  lightsMode: string;
}) {
  return (
    <section className="sfx-eq-section eq-section">
      <SfxTopVisualizer active={active} eqValues={values} lightsMode={lightsMode} rawValues={rawSpectrumValues} values={spectrumValues} />
      <div className="sfx-eq-bands eq-bands-wrapper">
        {frequencies.map((freq, index) => (
          <label className="sfx-eq-band eq-band" key={freq}>
            <span className="eq-band-value">{(values[index] ?? 0).toFixed(1)}d</span>
            <SfxRainbowSlider
              ariaLabel={`${freq} Hz`}
              active={active}
              frequency={freq}
              lightsMode={lightsMode}
              value={values[index] ?? 0}
              onChange={(value) => onBandChange(index, value)}
            />
            <small className="eq-band-freq">{freq}</small>
          </label>
        ))}
      </div>
    </section>
  );
}

function eqVisualHeightScale(db: number) {
  const value = Math.max(-12, Math.min(12, db));
  if (value < 0) return 0.4 + ((value + 12) / 12) * 0.42;
  return 0.82 + (value / 12) * 0.18;
}

function SfxTopVisualizer({
  active,
  eqValues,
  rawValues,
  values,
  lightsMode,
}: {
  active: boolean;
  eqValues: number[];
  rawValues: number[];
  values: number[];
  lightsMode: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barsRef = useRef<Float32Array>(new Float32Array(96));
  const roofsRef = useRef<Float32Array>(new Float32Array(96));
  const roofVelocityRef = useRef<Float32Array>(new Float32Array(96));
  const eqValuesRef = useRef(eqValues);
  const rawValuesRef = useRef(rawValues);
  const valuesRef = useRef(values);
  const visualGainRef = useRef(1.35);
  const shiftRef = useRef(0);

  useEffect(() => {
    eqValuesRef.current = eqValues;
  }, [eqValues]);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    rawValuesRef.current = rawValues;
  }, [rawValues]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let frame = 0;
    let last = performance.now();
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    };

    const draw = (time: number) => {
      resize();
      const width = canvas.width;
      const height = canvas.height;
      const dt = time - last;
      last = time;
      if (active && lightsMode === "rainbow") shiftRef.current = (shiftRef.current + dt * 0.00022) % 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      const count = barsRef.current.length;
      const slot = width / count;
      const barW = Math.max(2, Math.floor(slot - 1));
      const spectrum = valuesRef.current;
      const rawSpectrum = rawValuesRef.current;
      const eqBands = eqValuesRef.current;
      let framePeak = 0;
      for (let index = 0; index < spectrum.length; index += 1) {
        framePeak = Math.max(framePeak, Math.max(0, spectrum[index] ?? 0));
      }
      const wantedGain = framePeak > 0.01 ? Math.max(1.15, Math.min(4.4, 0.86 / framePeak)) : 1.35;
      visualGainRef.current += (wantedGain - visualGainRef.current) * 0.08;
      for (let index = 0; index < count; index += 1) {
        const eqPosition = eqBands.length > 1 ? (index / Math.max(1, count - 1)) * (eqBands.length - 1) : 0;
        const eqIndex = Math.floor(eqPosition);
        const eqFrac = eqPosition - eqIndex;
        const eqLow = eqBands[eqIndex] ?? 0;
        const eqHigh = eqBands[Math.min(eqBands.length - 1, eqIndex + 1)] ?? eqLow;
        const eqDb = eqLow * (1 - eqFrac) + eqHigh * eqFrac;
        const eqScale = eqVisualHeightScale(eqDb);
        const sourcePosition = spectrum.length > 1 ? (index / Math.max(1, count - 1)) * (spectrum.length - 1) : 0;
        const sourceIndex = Math.floor(sourcePosition);
        const sourceFrac = sourcePosition - sourceIndex;
        const low = Math.max(0, spectrum[sourceIndex] ?? 0);
        const high = Math.max(0, spectrum[Math.min(spectrum.length - 1, sourceIndex + 1)] ?? low);
        const gain = Math.min(1, (low * (1 - sourceFrac) + high * sourceFrac) * visualGainRef.current);
        const rawPosition = rawSpectrum.length > 1 ? (index / Math.max(1, count - 1)) * (rawSpectrum.length - 1) : 0;
        const rawIndex = Math.floor(rawPosition);
        const rawFrac = rawPosition - rawIndex;
        const rawLow = Math.max(0, rawSpectrum[rawIndex] ?? 0);
        const rawHigh = Math.max(0, rawSpectrum[Math.min(rawSpectrum.length - 1, rawIndex + 1)] ?? rawLow);
        const rawGain = Math.min(1, (rawLow * (1 - rawFrac) + rawHigh * rawFrac) * visualGainRef.current);
        const maxBandHeight = Math.max(2, (height - 2) * eqScale);
        const target = active ? Math.min(maxBandHeight, Math.pow(gain, 0.48) * height * 0.985 * eqScale) : 0;
        barsRef.current[index] += (target - barsRef.current[index]) * (target > barsRef.current[index] ? 0.82 : 0.24);

        const barTop = barsRef.current[index];
        const rawKick = active ? Math.pow(rawGain, 0.62) * height * 0.035 * eqScale : 0;
        const pushedPeak = Math.min(maxBandHeight, barTop + rawKick);
        if (pushedPeak >= roofsRef.current[index]) {
          roofsRef.current[index] += (pushedPeak - roofsRef.current[index]) * 0.62;
          roofVelocityRef.current[index] *= 0.35;
        } else {
          roofVelocityRef.current[index] = Math.min(3.4, roofVelocityRef.current[index] + 0.075);
          roofsRef.current[index] = Math.max(barTop, roofsRef.current[index] - 0.34 - roofVelocityRef.current[index]);
        }
        const x = Math.floor(index * slot);
        const ratio = count <= 1 ? 0 : index / (count - 1);
        ctx.fillStyle = sfxColorAtRatio(lightsMode, ratio, shiftRef.current, 230, 230, 255);
        ctx.fillRect(x, height - barsRef.current[index], barW, barsRef.current[index]);
        ctx.fillStyle = lightsMode === "off" ? "#7dd3fc" : sfxColorAtRatio(lightsMode, ratio, shiftRef.current, 255, 235, 255);
        ctx.fillRect(x, Math.max(0, height - roofsRef.current[index] - 3), barW, 2);
      }
      if (active || barsRef.current.some((value) => value > 0.5)) frame = window.requestAnimationFrame(draw);
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [active, lightsMode]);

  return (
    <div className="eq-top-visualizer">
      <canvas ref={canvasRef} className="eq-top-visualizer-canvas" aria-hidden="true" />
    </div>
  );
}

function SfxRainbowSlider({
  ariaLabel,
  active,
  frequency,
  lightsMode,
  value,
  onChange,
}: {
  ariaLabel: string;
  active: boolean;
  frequency: string;
  lightsMode: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const valueRef = useRef(value);
  const targetRef = useRef(value);
  const draggingRef = useRef(false);
  const shiftRef = useRef(0);

  useEffect(() => {
    targetRef.current = value;
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let frame = 0;
    let last = performance.now();

    const setFromClientY = (clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const top = 8;
      const bottom = rect.height - 8;
      const ratio = 1 - (Math.max(top, Math.min(bottom, clientY - rect.top)) - top) / Math.max(1, bottom - top);
      const next = Math.round((-12 + ratio * 24) * 2) / 2;
      targetRef.current = Math.max(-12, Math.min(12, next));
      onChange(targetRef.current);
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setFromClientY(event.clientY);
    };
    const onMouseUp = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = true;
      setFromClientY(event.clientY);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 0.1 : 0.5;
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = Math.max(-12, Math.min(12, targetRef.current + direction * step));
      targetRef.current = Math.round(next * 10) / 10;
      onChange(targetRef.current);
    };
    const draw = (time: number) => {
      const dt = time - last;
      last = time;
      if (active && lightsMode === "rainbow") shiftRef.current = (shiftRef.current + dt * 0.0004) % 1;
      valueRef.current += (targetRef.current - valueRef.current) * 0.25;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const trackX = cx - 4;
      const trackY = 8;
      const trackW = 8;
      const trackH = height - 16;
      const ratio = Math.max(0, Math.min(1, (valueRef.current + 12) / 24));
      const handleY = trackY + trackH - trackH * ratio;

      const grad = ctx.createLinearGradient(trackX, trackY + trackH, trackX, trackY);
      for (let index = 0; index <= 28; index += 1) {
        const stop = index / 28;
        grad.addColorStop(stop, sfxColorAtRatio(lightsMode, stop, shiftRef.current, 92, 210, 255));
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(trackX, trackY, trackW, trackH, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(40,40,40,.63)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const brightGrad = ctx.createLinearGradient(trackX, trackY + trackH, trackX, trackY);
      for (let index = 0; index <= 28; index += 1) {
        const stop = index / 28;
        brightGrad.addColorStop(stop, sfxColorAtRatio(lightsMode, stop, shiftRef.current, 225, 235, 255));
      }
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(trackX, handleY, trackW, trackY + trackH - handleY, 4);
      ctx.clip();
      ctx.fillStyle = brightGrad;
      ctx.fillRect(trackX, handleY, trackW, trackY + trackH - handleY);
      ctx.restore();

      const knobColor = sfxColorAtRatio(lightsMode, ratio, shiftRef.current, 255, 235, 255);
      const glow = ctx.createRadialGradient(cx, handleY, 0, cx, handleY, 13);
      glow.addColorStop(0, sfxColorAtRatio(lightsMode, ratio, shiftRef.current, 210, 235, 255));
      glow.addColorStop(1, sfxColorAtRatio(lightsMode, ratio, shiftRef.current, 0, 235, 255));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, handleY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#101010";
      ctx.strokeStyle = knobColor;
      ctx.lineWidth = draggingRef.current ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, handleY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f5ffff";
      ctx.beginPath();
      ctx.arc(cx - 2, handleY - 2, 2, 0, Math.PI * 2);
      ctx.fill();

      if (active || Math.abs(targetRef.current - valueRef.current) > 0.001) frame = window.requestAnimationFrame(draw);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [active, lightsMode, onChange]);

  return (
    <span className="eq-slider-container">
      <canvas ref={canvasRef} className="eq-slider-canvas" width={26} height={180} role="slider" aria-label={ariaLabel} aria-valuemin={-12} aria-valuemax={12} aria-valuenow={value} data-frequency={frequency} />
    </span>
  );
}

function SfxEqModule({
  active,
  params,
  options,
  lightsMode,
  onParamChange,
  onOptionChange,
  onReset,
  language,
  text,
}: {
  active: boolean;
  params: SfxParam[];
  options: SfxOption[];
  lightsMode: string;
  onParamChange: (key: string, value: number) => void;
  onOptionChange: (key: string, value: string) => void;
  onReset: () => void;
  language: AppLanguage;
  text: (key: string) => string;
}) {
  const moduleParams = ["bass", "mid", "treble", "stereoExpander"]
    .map((key) => params.find((param) => param.key === key))
    .filter(Boolean) as SfxParam[];
  const balance = params.find((param) => param.key === "balance");
  return (
    <section className="sfx-module-row">
      <div className="sfx-module-card sfx-module-main">
        <div className="sfx-module-title">{text("sfx.module")}</div>
        <div className="sfx-module-knobs">
          {moduleParams.map((param) => (
            <SfxKnob
              active={active}
              key={param.key}
              lightsMode={lightsMode}
              param={translateSfxParam(language, param)}
              onChange={(value) => onParamChange(param.key, value)}
            />
          ))}
        </div>
        <div className="sfx-module-bottom">
          {options.map((option) => (
            <label className="sfx-acoustic-select" key={option.key}>
              <span>{sfxParamTranslations[language]?.[option.key] ?? sfxParamTranslations["tr-TR"][option.key] ?? option.label}</span>
              <select value={option.value} onChange={(event) => onOptionChange(option.key, event.target.value)}>
                {option.options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className="sfx-module-reset" onClick={onReset}>{text("sfx.resetModule")}</button>
        </div>
      </div>
      {balance ? (
        <div className="sfx-module-card sfx-balance-card">
          <div className="sfx-module-title">{text("sfx.balance")}</div>
          <div className="sfx-balance-readout">
            <button onClick={() => onParamChange("balance", -100)}>L</button>
            <strong>{getBalanceText(balance.value)}</strong>
            <button onClick={() => onParamChange("balance", 100)}>R</button>
          </div>
          <input
            className="sfx-balance-slider"
            max={100}
            min={-100}
            onChange={(event) => onParamChange("balance", Number(event.target.value))}
            onWheel={(event) => {
              event.preventDefault();
              const direction = event.deltaY < 0 ? 1 : -1;
              onParamChange("balance", Math.max(-100, Math.min(100, balance.value + direction * 5)));
            }}
            step={1}
            type="range"
            value={balance.value}
          />
          <button className="sfx-balance-center" onClick={() => onParamChange("balance", 0)}>{text("sfx.center")}</button>
        </div>
      ) : null}
    </section>
  );
}

function SfxKnob({
  active,
  param,
  lightsMode,
  onChange,
}: {
  active: boolean;
  param: SfxParam;
  lightsMode: string;
  onChange: (value: number) => void;
}) {
  return (
    <SfxCanvasKnob
      active={active}
      label={param.key === "bass" ? "Bas (100 Hz)" : param.key === "mid" ? "Mid (500Hz-2kHz)" : param.key === "treble" ? "Tiz (10 kHz)" : param.label}
      lightsMode={lightsMode}
      max={param.max}
      min={param.min}
      step={param.step}
      suffix={param.key === "stereoExpander" || param.unit === "%" ? " %" : param.unit || ""}
      value={param.value}
      onChange={onChange}
    />
  );
}

function SfxCanvasKnob({
  active,
  label,
  lightsMode,
  max,
  min,
  step,
  suffix,
  value,
  onChange,
}: {
  active: boolean;
  label: string;
  lightsMode: string;
  max: number;
  min: number;
  step: number;
  suffix: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const valueRef = useRef(value);
  const targetRef = useRef(value);
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const pendingChangeRef = useRef<number | null>(null);
  const changeTimerRef = useRef<number | null>(null);
  const requestDrawRef = useRef<() => void>(() => {});
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    targetRef.current = value;
    valueRef.current = value;
    requestDrawRef.current();
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let frame = 0;
    let draw: FrameRequestCallback;
    const requestDraw = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    requestDrawRef.current = requestDraw;

    const clampStep = (raw: number) => {
      const clamped = Math.max(min, Math.min(max, raw));
      return Number((Math.round(clamped / step) * step).toFixed(3));
    };
    const flushChange = () => {
      if (changeTimerRef.current !== null) {
        window.clearTimeout(changeTimerRef.current);
        changeTimerRef.current = null;
      }
      if (pendingChangeRef.current === null) return;
      const next = pendingChangeRef.current;
      pendingChangeRef.current = null;
      onChangeRef.current(next);
    };
    const scheduleChange = (next: number) => {
      pendingChangeRef.current = next;
      if (changeTimerRef.current !== null) return;
      changeTimerRef.current = window.setTimeout(() => {
        changeTimerRef.current = null;
        flushChange();
      }, 34);
    };
    const commit = (raw: number) => {
      const next = clampStep(raw);
      targetRef.current = next;
      valueRef.current = next;
      requestDraw();
      scheduleChange(next);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = true;
      lastYRef.current = event.clientY;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const deltaY = lastYRef.current - event.clientY;
      lastYRef.current = event.clientY;
      commit(targetRef.current + deltaY * ((max - min) / 160));
    };
    const onMouseUp = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = false;
      flushChange();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const wheelStep = event.shiftKey ? step * 0.25 : Math.max(step, (max - min) / 40);
      commit(targetRef.current + (event.deltaY < 0 ? 1 : -1) * wheelStep);
    };
    const valueText = () => {
      if (suffix.trim() === "%") return `${Math.round(valueRef.current)} %`;
      if (suffix.includes("Hz")) return `${Math.round(valueRef.current)}${suffix}`;
      if (suffix.includes("ms")) return `${Math.round(valueRef.current)}${suffix}`;
      if (suffix.includes("dB")) return `${valueRef.current.toFixed(1)} dB`;
      if (!suffix) return step < 1 ? valueRef.current.toFixed(1) : `${Math.round(valueRef.current)}`;
      return `${step < 1 ? valueRef.current.toFixed(1) : Math.round(valueRef.current)}${suffix}`;
    };

    draw = () => {
      frame = 0;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      const padding = 6;
      const bottomPadding = 40;
      const rectW = width - padding * 2;
      const knobH = height - padding * 2 - bottomPadding;
      const cx = padding + rectW / 2;
      const cy = padding + knobH / 2;
      const radius = Math.min(rectW, knobH) / 2 - 7;
      const innerRadius = radius - 10;
      const arcRadius = radius - 5;
      const valNorm = max === min ? 0 : Math.max(0, Math.min(1, (valueRef.current - min) / (max - min)));
      const degToRad = (deg: number) => (deg * Math.PI) / 180;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#2a2a2a";
      ctx.fill();
      const face = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.25, radius * 0.1, cx, cy, radius);
      face.addColorStop(0, "rgba(62,62,62,.95)");
      face.addColorStop(1, "#1f1f1f");
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = face;
      ctx.fill();

      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      const startAngleDeg = 135;
      const spanDeg = 270;
      const segments = 54;
      const segSpan = spanDeg / segments;
      for (let index = 0; index < segments; index += 1) {
        const angleStart = startAngleDeg + index * segSpan;
        ctx.beginPath();
        ctx.arc(cx, cy, arcRadius, degToRad(angleStart), degToRad(angleStart + segSpan - 1.3));
        ctx.strokeStyle = "rgba(40,40,40,.6)";
        ctx.stroke();
      }
      const activeFull = Math.floor(valNorm * segments);
      for (let index = 0; index < Math.min(segments, activeFull); index += 1) {
        const ratio = index / (segments - 1);
        const angleStart = startAngleDeg + index * segSpan;
        ctx.beginPath();
        ctx.arc(cx, cy, arcRadius, degToRad(angleStart), degToRad(angleStart + segSpan - 1));
        ctx.strokeStyle = sfxColorAtRatio(lightsMode, ratio, 0, 255, 235, 255);
        ctx.stroke();
      }

      const dotAngle = degToRad(startAngleDeg + spanDeg * valNorm);
      const dotX = cx + arcRadius * Math.cos(dotAngle);
      const dotY = cy + arcRadius * Math.sin(dotAngle);
      const dotRatio = Math.max(0, Math.min(1, activeFull / (segments - 1)));
      ctx.fillStyle = "#101010";
      ctx.strokeStyle = sfxColorAtRatio(lightsMode, dotRatio, 0, 255, 235, 255);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#050505";
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#5a5a5a";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(valueText(), width / 2, height - 30);
      ctx.font = "9px Arial";
      ctx.fillStyle = "rgb(180,180,180)";
      ctx.fillText(label, width / 2, height - 10);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    requestDraw();
    return () => {
      requestDrawRef.current = () => {};
      flushChange();
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [label, lightsMode, max, min, step, suffix]);

  return (
    <label className="sfx-knob-card knob-wrapper">
      <canvas className="ardali-knob-canvas" ref={canvasRef} width={130} height={170} />
    </label>
  );
}

type EqPresetCatalogItem = {
  id: string;
  filename: string;
  source: "ardali" | "autoeq";
  name: string;
  description: string;
  bands: number[];
  groups: string[];
  previewType: "wheel" | "curve";
};

type EqPresetCatalog = {
  version: number;
  total: number;
  presets: EqPresetCatalogItem[];
};

let eqPresetCatalogCache: EqPresetCatalogItem[] | null = null;
let eqPresetCatalogPromise: Promise<EqPresetCatalogItem[]> | null = null;

function loadEqPresetCatalog() {
  if (eqPresetCatalogCache) return Promise.resolve(eqPresetCatalogCache);
  if (!eqPresetCatalogPromise) {
    eqPresetCatalogPromise = fetch("/eq-presets/index.json")
      .then((response) => {
        if (!response.ok) throw new Error(`EQ preset catalog load failed: ${response.status}`);
        return response.json() as Promise<EqPresetCatalog>;
      })
      .then((catalog) => {
        eqPresetCatalogCache = catalog.presets.map((preset) => ({ ...preset, bands: normalizedEqBands(preset.bands) }));
        return eqPresetCatalogCache;
      });
  }
  return eqPresetCatalogPromise;
}

const eqGroupLabels: Array<[string, string]> = [
  ["all", "Tumu"],
  ["bass", "Bas"],
  ["treble", "Tiz"],
  ["vocal", "Vokal"],
  ["jazz", "Caz"],
  ["classical", "Klasik"],
  ["electronic", "Elektronik"],
  ["pop", "Pop"],
  ["rock", "Rock"],
  ["vshape", "V-Shape"],
  ["flat", "Duz"],
  ["other", "Diger"],
];

const eqGroupTranslations: Record<AppLanguage, Record<string, string>> = {
  "tr-TR": { all: "Tümü", bass: "Bas", treble: "Tiz", vocal: "Vokal", jazz: "Caz", classical: "Klasik", electronic: "Elektronik", pop: "Pop", rock: "Rock", vshape: "V-Shape", flat: "Düz", other: "Diğer" },
  "en-US": { all: "All", bass: "Bass", treble: "Treble", vocal: "Vocal", jazz: "Jazz", classical: "Classical", electronic: "Electronic", pop: "Pop", rock: "Rock", vshape: "V-Shape", flat: "Flat", other: "Other" },
  "ar-SA": { all: "الكل", bass: "جهير", treble: "حاد", vocal: "صوت", jazz: "جاز", classical: "كلاسيكي", electronic: "إلكتروني", pop: "بوب", rock: "روك", vshape: "V-Shape", flat: "مسطح", other: "أخرى" },
  "es-ES": { all: "Todo", bass: "Graves", treble: "Agudos", vocal: "Vocal", jazz: "Jazz", classical: "Clásica", electronic: "Electrónica", pop: "Pop", rock: "Rock", vshape: "V-Shape", flat: "Plano", other: "Otro" },
};

type EqPreviewProfile = "quality" | "balanced" | "performance";

function clampEqBand(value: number) {
  return Math.min(12, Math.max(-12, value));
}

function normalizedEqBands(bands: number[]) {
  return Array.from({ length: 32 }, (_, index) => clampEqBand(Number(bands[index] ?? 0)));
}

function normalizeSfxBroadcast(snapshot?: Partial<SfxBroadcastState>): SfxBroadcastState {
  const eqPreset = isEqPresetId(snapshot?.eqPreset) ? snapshot.eqPreset : "flat";
  return {
    effectsEnabled: snapshot?.effectsEnabled ?? true,
    eqPreset,
    eqPresetLabel: typeof snapshot?.eqPresetLabel === "string" ? snapshot.eqPresetLabel : eqPresets[eqPreset]?.label,
    eqGains:
      Array.isArray(snapshot?.eqGains) && snapshot.eqGains.length === eqFrequencies.length
        ? normalizedEqBands(snapshot.eqGains)
        : [...flatEq],
    dspSettings: {
      ...defaultDspSettings,
      ...snapshot?.dspSettings,
    },
  };
}

function sampleEqBandsLinear(bands: number[], t: number) {
  const safe = normalizedEqBands(bands);
  const x = Math.min(1, Math.max(0, t)) * (safe.length - 1);
  const i0 = Math.floor(x);
  const i1 = Math.min(safe.length - 1, i0 + 1);
  return safe[i0] + (safe[i1] - safe[i0]) * (x - i0);
}

function zoomEqBandsDomain(bands: number[], zoomX = 1) {
  const safe = normalizedEqBands(bands);
  if (!Number.isFinite(zoomX) || zoomX <= 1.001) return safe;
  return safe.map((_, index) => sampleEqBandsLinear(safe, 0.5 + (index / 31 - 0.5) / zoomX));
}

function smoothEqBandsForPreview(bands: number[], passes = 2) {
  let out = [...normalizedEqBands(bands)];
  for (let pass = 0; pass < passes; pass += 1) {
    out = out.map((value, index) => {
      const a = out[Math.max(0, index - 1)];
      const c = out[Math.min(out.length - 1, index + 1)];
      return a * 0.22 + value * 0.56 + c * 0.22;
    });
  }
  return out;
}

function eqMicroDetailOffset(index: number, baseValue: number) {
  return Math.sin(index * 0.93 + baseValue * 0.07) * 0.09 + Math.cos(index * 1.61 - baseValue * 0.05) * 0.07;
}

function getEqPreviewTuning(profile: EqPreviewProfile) {
  if (profile === "quality") {
    return {
      yScaleMult: 1.22,
      mainDetailMult: 1.28,
      layerDetailMult: 1.36,
      layerStructureMult: 1.25,
      mainLineWidthMult: 1.18,
      layerWidthMult: 1.15,
      layerAlphaMult: 1.12,
      layerCount: 5,
      glowAlphaMult: 1.22,
      eq32LineMult: 1.16,
      wheelSmoothPasses: 1,
      detailScale: 2.7,
    };
  }
  if (profile === "performance") {
    return {
      yScaleMult: 0.76,
      mainDetailMult: 0.7,
      layerDetailMult: 0.58,
      layerStructureMult: 0.72,
      mainLineWidthMult: 0.9,
      layerWidthMult: 0.82,
      layerAlphaMult: 0.72,
      layerCount: 2,
      glowAlphaMult: 0.55,
      eq32LineMult: 0.84,
      wheelSmoothPasses: 2,
      detailScale: 1,
    };
  }
  return {
    yScaleMult: 1,
    mainDetailMult: 1,
    layerDetailMult: 1,
    layerStructureMult: 1,
    mainLineWidthMult: 1,
    layerWidthMult: 1,
    layerAlphaMult: 1,
    layerCount: 5,
    glowAlphaMult: 1,
    eq32LineMult: 1,
    wheelSmoothPasses: 1,
    detailScale: 2.7,
  };
}

function pointsToSvgPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    const midX = (prev.x + curr.x) * 0.5;
    const midY = (prev.y + curr.y) * 0.5;
    commands.push(`Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`);
  }
  const last = points[points.length - 1];
  commands.push(`L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`);
  return commands.join(" ");
}

function buildEqLayerPoints(
  baseBands: number[],
  innerW: number,
  yMid: number,
  yScale: number,
  pad: number,
  layer: {
    off: number;
    bandGain: number;
    detailGain: number;
    structureGain: number;
    freq: number;
    phase: number;
    waveAmp: number;
    hfFreq: number;
    hfAmp: number;
    notchFreq: number;
    notchAmp: number;
    zigFreq: number;
    zigAmp: number;
    tilt: number;
  },
  profile: EqPreviewProfile,
) {
  const tuning = getEqPreviewTuning(profile);
  return baseBands.map((band, index) => {
    const prev = baseBands[Math.max(0, index - 1)];
    const next = baseBands[Math.min(baseBands.length - 1, index + 1)];
    const slope = (next - prev) * 0.5;
    const curvature = next - 2 * band + prev;
    const structural = slope * 0.92 + curvature * 1.06;
    const micro = eqMicroDetailOffset(index, band) * tuning.detailScale * layer.detailGain * 3 * tuning.layerDetailMult;
    const wave = Math.sin(index * layer.freq + layer.phase) * layer.waveAmp;
    const hf = index >= 18 ? Math.sin((index - 18) * layer.hfFreq + layer.phase * 0.6) * layer.hfAmp : 0;
    const notch = Math.cos(index * layer.notchFreq + layer.phase) * layer.notchAmp;
    const zig = index >= 15 ? Math.sin((index - 15) * layer.zigFreq + layer.phase * 1.4) * layer.zigAmp : 0;
    const tilt = (index / 31 - 0.5) * layer.tilt;
    const value =
      band * layer.bandGain +
      structural * layer.structureGain * 3 * tuning.layerStructureMult +
      micro +
      wave +
      hf +
      notch +
      zig +
      tilt;
    return {
      x: pad + (index / 31) * innerW,
      y: Math.min(84.2, Math.max(6.8, yMid - (value / 12) * yScale + layer.off)),
    };
  });
}

function EqPresetCurve({
  bands,
  profile,
}: {
  bands: number[];
  previewType: EqPresetCatalogItem["previewType"];
  profile: EqPreviewProfile;
}) {
  const tuning = getEqPreviewTuning(profile);
  const previewType = "wheel";
  const safeBands = normalizedEqBands(bands);
  const width = previewType === "wheel" ? 312 : 280;
  const height = 88;
  const pad = previewType === "wheel" ? 5 : 3;
  const innerW = width - pad * 2;
  const yMid = pad + ((height - pad * 2) * 0.56) - 7;
  const yScale = ((height - pad * 2) / 2) * (previewType === "wheel" ? 1.34 : 0.94) * 2 * tuning.yScaleMult;
  const renderBands =
    previewType === "wheel" ? safeBands : zoomEqBandsDomain(safeBands, 2);
  const smoothPasses = previewType === "wheel" ? tuning.wheelSmoothPasses : 2;
  const baseBands = smoothEqBandsForPreview(renderBands, smoothPasses);
  const mainPoints = baseBands.map((band, index) => {
    const detail =
      previewType === "wheel"
        ? eqMicroDetailOffset(index, band) * tuning.detailScale * tuning.mainDetailMult
        : 0;
    return {
      x: pad + (index / 31) * innerW,
      y: Math.min(84.2, Math.max(6.8, yMid - ((band + detail) / 12) * yScale)),
    };
  });
  const layers = [
    { color: "#35f467", off: -1.75, lw: 1.2, alpha: 0.94, bandGain: 1, detailGain: 1.18, structureGain: 1, freq: 0.56, phase: 0.35, waveAmp: 0.72, hfFreq: 1.28, hfAmp: 1.02, notchFreq: 0.94, notchAmp: 0.54, zigFreq: 2.18, zigAmp: 0.72, tilt: -0.28 },
    { color: "#d9ef3d", off: -0.36, lw: 1.08, alpha: 0.9, bandGain: 0.98, detailGain: 1.04, structureGain: 0.92, freq: 0.64, phase: 1.14, waveAmp: 0.64, hfFreq: 1.44, hfAmp: 0.86, notchFreq: 1.08, notchAmp: 0.56, zigFreq: 2.3, zigAmp: 0.62, tilt: -0.1 },
    { color: "#1680ff", off: 1.3, lw: 1.02, alpha: 0.92, bandGain: 0.92, detailGain: 1.48, structureGain: 1.2, freq: 0.76, phase: 2.18, waveAmp: 1.06, hfFreq: 1.64, hfAmp: 1.58, notchFreq: 1.34, notchAmp: 1, zigFreq: 2.56, zigAmp: 0.88, tilt: 0.22 },
    { color: "#c73ad9", off: 2.14, lw: 0.96, alpha: 0.88, bandGain: 0.88, detailGain: 1.54, structureGain: 1.24, freq: 0.86, phase: 3.02, waveAmp: 1.14, hfFreq: 1.8, hfAmp: 1.76, notchFreq: 1.46, notchAmp: 1.06, zigFreq: 2.76, zigAmp: 0.98, tilt: 0.36 },
    { color: "#fff", off: 2.34, lw: 0.7, alpha: 0.34, bandGain: 0.6, detailGain: 0.88, structureGain: 0.7, freq: 0.68, phase: 1.78, waveAmp: 0.4, hfFreq: 1.3, hfAmp: 0.58, notchFreq: 1.2, notchAmp: 0.36, zigFreq: 2.2, zigAmp: 0.44, tilt: 0.08 },
  ].slice(0, Math.max(1, Math.min(5, tuning.layerCount)));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`eq-main-${profile}-${previewType}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d8f655" />
          <stop offset="52%" stopColor="#64f57a" />
          <stop offset="100%" stopColor="#43d8ff" />
        </linearGradient>
      </defs>
      <path d={`M ${pad} ${yMid.toFixed(2)} L ${width - pad} ${yMid.toFixed(2)}`} stroke="rgba(220,228,240,.26)" strokeWidth=".9" />
      {previewType === "wheel" ? (
        <>
          <path d={pointsToSvgPath(mainPoints)} fill="none" stroke={`url(#eq-main-${profile}-${previewType})`} strokeWidth={1.9 * tuning.mainLineWidthMult} strokeLinecap="round" strokeLinejoin="round" opacity=".96" />
          {layers.map((layer) => (
            <path key={layer.color} d={pointsToSvgPath(buildEqLayerPoints(baseBands, innerW, yMid, yScale, pad, layer, profile))} fill="none" stroke={layer.color} strokeWidth={layer.lw * tuning.layerWidthMult} strokeLinecap="round" strokeLinejoin="round" opacity={Math.min(1, layer.alpha * tuning.layerAlphaMult)} />
          ))}
          <path d={pointsToSvgPath(mainPoints)} fill="none" stroke={`url(#eq-main-${profile}-${previewType})`} strokeWidth="1.18" strokeLinecap="round" strokeLinejoin="round" opacity={Math.min(1, 0.72 * tuning.glowAlphaMult)} />
        </>
      ) : (
        <>
          <path d={pointsToSvgPath(mainPoints)} fill="none" stroke="rgba(118,240,96,.18)" strokeWidth={2.1 * tuning.eq32LineMult} strokeLinecap="round" strokeLinejoin="round" />
          <path d={pointsToSvgPath(mainPoints)} fill="none" stroke={`url(#eq-main-${profile}-${previewType})`} strokeWidth={1.28 * tuning.eq32LineMult} strokeLinecap="round" strokeLinejoin="round" />
          <path d={pointsToSvgPath(mainPoints)} fill="none" stroke="rgba(246,255,228,.78)" strokeWidth={0.56 * tuning.eq32LineMult} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function EqPresetsWindow() {
  const [webSettings, setWebSettings] = useState<WebSettings>(() => loadWebSettings());
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [previewProfile, setPreviewProfile] = useState<EqPreviewProfile>("balanced");
  const [selected, setSelected] = useState("");
  const [presets, setPresets] = useState<EqPresetCatalogItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [renderLimit, setRenderLimit] = useState(80);
  const confirmedRef = useRef(false);
  const originalBroadcastRef = useRef<SfxBroadcastState>(normalizeSfxBroadcast(loadSoundEffectsState().broadcast));
  const language = webSettings.language;
  const text = useCallback((key: string) => tr(language, key), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
    document.title = text("eqPresets.windowTitle");
    applyDocumentTheme(resolveEffectiveTheme(webSettings));
  }, [language, text, webSettings.theme, webSettings.followSystemTheme]);

  useEffect(() => {
    const handleLocalSettings = (event: Event) => {
      const detail = (event as CustomEvent<WebSettings>).detail;
      setWebSettings(detail ?? loadWebSettings());
    };
    let cleanupTauri: (() => void) | undefined;
    if (isTauriRuntime()) {
      void listen<WebSettings>(WEB_SETTINGS_EVENT, (event) => setWebSettings(event.payload)).then((cleanup) => {
        cleanupTauri = cleanup;
      });
    }
    window.addEventListener(WEB_SETTINGS_EVENT, handleLocalSettings);
    return () => {
      cleanupTauri?.();
      window.removeEventListener(WEB_SETTINGS_EVENT, handleLocalSettings);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadEqPresetCatalog()
      .then((nextPresets) => {
        if (!alive) return;
        setPresets(nextPresets);
        setSelected((current) => current || nextPresets[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : text("eqPresets.loadError"));
      });
    return () => {
      alive = false;
    };
  }, [text]);

  const visiblePresets = useMemo(() => presets.filter((preset) => {
    const normalizedQuery = query.toLocaleLowerCase("tr");
    const matchesGroup = group === "all" || preset.groups.includes(group);
    const matchesQuery = [preset.name, preset.description, preset.filename, ...preset.groups]
      .join(" ")
      .toLocaleLowerCase("tr")
      .includes(normalizedQuery);
    return matchesGroup && matchesQuery;
  }), [group, presets, query]);
  const renderedPresets = visiblePresets.slice(0, renderLimit);
  const selectedPreset = presets.find((preset) => preset.id === selected) ?? visiblePresets[0] ?? presets[0];
  const groupLabel = eqGroupTranslations[language]?.[group] ?? eqGroupTranslations["tr-TR"][group] ?? group;
  const profileHint =
    previewProfile === "quality"
      ? text("eqPresets.hintQuality")
      : previewProfile === "performance"
        ? text("eqPresets.hintPerformance")
        : text("eqPresets.hintBalanced");

  useEffect(() => {
    setRenderLimit(80);
  }, [group, previewProfile, query]);

  const handlePresetScroll = (event: ReactUIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 520) return;
    setRenderLimit((current) => Math.min(visiblePresets.length, current + 120));
  };

  const windowAction = async (action: "minimize" | "maximize" | "close") => {
    if (!isTauriRuntime()) {
      if (action === "close") window.close();
      return;
    }
    const current = getCurrentWebviewWindow();
    if (action === "minimize") await current.minimize();
    if (action === "maximize") await current.toggleMaximize();
    if (action === "close") await current.close();
  };

  const sendPreset = useCallback(async (preset: EqPresetCatalogItem | null | undefined, closeAfterApply: boolean) => {
    if (!preset) return;
    const previous = originalBroadcastRef.current ?? loadSoundEffectsState().broadcast;
    const nextBroadcast: SfxBroadcastState = {
      effectsEnabled: true,
      eqPreset: "flat",
      eqPresetLabel: preset.name,
      eqGains: [...preset.bands],
      dspSettings: previous?.dspSettings ?? defaultDspSettings,
    };
    try {
      const channel = new BroadcastChannel(soundEffectsChannelName);
      channel.postMessage(nextBroadcast);
      channel.close();
    } catch {
      // ignore
    }
    if (isTauriRuntime()) {
      await emit("ardali-eq-preset-apply", nextBroadcast);
    }
    if (closeAfterApply) {
      confirmedRef.current = true;
      if (isTauriRuntime()) await getCurrentWebviewWindow().close();
      else window.close();
    }
  }, []);

  const restoreOriginal = useCallback(() => {
    if (confirmedRef.current || !originalBroadcastRef.current) return;
    const original = originalBroadcastRef.current;
    try {
      const channel = new BroadcastChannel(soundEffectsChannelName);
      channel.postMessage(original);
      channel.close();
    } catch {
      // ignore
    }
    if (isTauriRuntime()) {
      void emit("ardali-eq-preset-apply", original);
    }
  }, []);

  useEffect(() => {
    const restoreOnClose = () => restoreOriginal();
    window.addEventListener("pagehide", restoreOnClose);
    window.addEventListener("beforeunload", restoreOnClose);
    return () => {
      window.removeEventListener("pagehide", restoreOnClose);
      window.removeEventListener("beforeunload", restoreOnClose);
      restoreOriginal();
    };
  }, [restoreOriginal]);

  const selectPreset = (preset: EqPresetCatalogItem) => {
    setSelected(preset.id);
    void sendPreset(preset, false);
  };

  const applySelected = async () => {
    await sendPreset(selectedPreset, true);
  };

  return (
    <main className="eq-preset-window">
      <header className="eq-preset-titlebar" data-tauri-drag-region>
        <span data-tauri-drag-region>{text("eqPresets.windowTitle")}</span>
        <div className="window-controls">
          <button onClick={() => void windowAction("minimize")} aria-label={text("window.minimize")}>-</button>
          <button onClick={() => void windowAction("maximize")} aria-label={text("window.maximize")}>⌃</button>
          <button onClick={() => void windowAction("close")} aria-label={text("common.close")}>×</button>
        </div>
      </header>
      <header className="eq-preset-heading">
        <h1>{text("eqPresets.title")}</h1>
      </header>
      <label className="eq-preset-search">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("eqPresets.search")} />
      </label>
      <div className="eq-preset-toolbar">
        <div className="eq-profile-row" role="group" aria-label={text("eqPresets.viewMode")}>
          {[
            ["quality", text("eqPresets.quality")],
            ["balanced", text("eqPresets.balanced")],
            ["performance", text("eqPresets.performance")],
          ].map(([id, label]) => (
            <button className={previewProfile === id ? "active" : ""} key={id} onClick={() => setPreviewProfile(id as EqPreviewProfile)}>
              {label}
            </button>
          ))}
        </div>
        <label className="eq-group-select">
          <span>{text("eqPresets.category")}</span>
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            {eqGroupLabels.map(([id, label]) => (
              <option key={id} value={id}>
                {eqGroupTranslations[language]?.[id] ?? eqGroupTranslations["tr-TR"][id] ?? label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="eq-profile-hint">{profileHint}</div>
      <div className="eq-preset-status">
        {loadError ? loadError : formatLabel(text("eqPresets.shown"), { visible: visiblePresets.length, total: presets.length, group: groupLabel })}
      </div>
      <section className="eq-preset-list" onScroll={handlePresetScroll}>
        {renderedPresets.map((preset) => (
          <button
            className={selectedPreset?.id === preset.id ? "active" : ""}
            key={preset.id}
            onClick={() => selectPreset(preset)}
          >
            <span className="eq-preset-check">{selectedPreset?.id === preset.id ? <Check size={15} strokeWidth={3} /> : null}</span>
            <span className="eq-preset-curve">
              <EqPresetCurve bands={preset.bands} previewType={preset.previewType} profile={previewProfile} />
            </span>
            <span className="eq-preset-copy">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
          </button>
        ))}
      </section>
      <footer>
        <button onClick={applySelected}>{language === "ar-SA" ? "تم" : language === "en-US" ? "Done" : language === "es-ES" ? "Listo" : "Tamam"}</button>
      </footer>
    </main>
  );
}

function ProjectMWindow() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [compact, setCompact] = useState(true);
  const [autoDelay, setAutoDelay] = useState(120);
  const [nativeStatus, setNativeStatus] = useState("Native ProjectM hazir");
  const activePreset = presets[selectedPreset] || "ProjectM";

  useEffect(() => {
    let cancelled = false;
    fetch("/visualizer-presets/index.json")
      .then((response) => response.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled) setPresets(Array.isArray(data.files) ? data.files : []);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;
    const presetSeed = activePreset.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
      const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      frame += 1;
      ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      const arms = 4 + (presetSeed % 7);
      const radius = Math.min(width, height) * 0.38;
      for (let arm = 0; arm < arms; arm += 1) {
        const hue = (frame * 1.4 + arm * 47 + presetSeed) % 360;
        ctx.strokeStyle = `hsla(${hue}, 95%, 58%, 0.72)`;
        ctx.lineWidth = Math.max(1, width * 0.0025);
        ctx.beginPath();
        for (let step = 0; step < 160; step += 1) {
          const t = step / 159;
          const angle = t * Math.PI * 8 + arm * ((Math.PI * 2) / arms) + frame * 0.012;
          const wave = Math.sin(t * 18 + frame * 0.045 + presetSeed) * 0.18;
          const r = radius * t * (0.72 + wave);
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (step === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (let dot = 0; dot < 90; dot += 1) {
        const hue = (presetSeed + dot * 19 + frame * 2) % 360;
        const angle = dot * 2.399 + frame * 0.008;
        const r = ((dot * 37 + presetSeed) % 100) / 100 * radius;
        const pulse = 2 + Math.sin(frame * 0.08 + dot) * 1.6;
        ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.72)`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * r, Math.sin(angle) * r, pulse * window.devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [activePreset]);

  useEffect(() => {
    if (!presets.length) return undefined;
    const timer = window.setInterval(() => {
      setSelectedPreset((index) => (index + 1) % presets.length);
    }, Math.max(5, autoDelay) * 1000);
    return () => window.clearInterval(timer);
  }, [autoDelay, presets.length]);

  const windowAction = async (action: "minimize" | "maximize" | "close") => {
    if (!isTauriRuntime()) {
      if (action === "close") window.close();
      return;
    }
    const current = getCurrentWebviewWindow();
    if (action === "minimize") await current.minimize();
    if (action === "maximize") await current.toggleMaximize();
    if (action === "close") await current.close();
  };

  const startNativeProjectM = async () => {
    if (!isTauriRuntime()) {
      setNativeStatus("Native ProjectM sadece Tauri icinde baslatilir");
      return;
    }
    setNativeStatus("Native ProjectM baslatiliyor...");
    try {
      const settings = loadWebSettings();
      const message = await invoke<string>("start_projectm_visualizer", { language: settings.language, theme: resolveEffectiveTheme(settings) });
      setNativeStatus(message);
    } catch (error) {
      setNativeStatus(String(error));
    }
  };

  const stopNativeProjectM = async () => {
    if (!isTauriRuntime()) return;
    await invoke("stop_projectm_visualizer").catch(() => undefined);
    setNativeStatus("Native ProjectM durduruldu");
  };

  return (
    <main className="projectm-window">
      <header className="projectm-titlebar">
        <div>
          <strong>ArDali Gorseller</strong>
          <span>{nativeStatus} • Milkdrop presetleri: {presets.length}</span>
        </div>
        <div className="projectm-window-actions">
          <button onClick={() => void startNativeProjectM()} title="Native ProjectM baslat">
            PM
          </button>
          <button onClick={() => void stopNativeProjectM()} title="Native ProjectM durdur">
            ■
          </button>
          <button onClick={() => void windowAction("minimize")}>-</button>
          <button onClick={() => void windowAction("maximize")}>□</button>
          <button onClick={() => void windowAction("close")}>x</button>
        </div>
      </header>
      <section className="projectm-stage">
        <canvas ref={canvasRef} />
        <div className="projectm-overlay">
          <strong>{activePreset.replace(/\.milk$/i, "")}</strong>
          <span>Milkdrop preset dosyasi yuklendi</span>
        </div>
      </section>
      <aside className="projectm-presets">
        <div className="projectm-controls">
          <input placeholder="Preset ara..." />
          <button onClick={() => setCompact((value) => !value)}>{compact ? "Kompakt" : "Genis"}</button>
          <label>
            Gecis gecikmesi
            <input min="5" max="300" type="number" value={autoDelay} onChange={(event) => setAutoDelay(Number(event.target.value))} />
            s
          </label>
        </div>
        <div className={compact ? "projectm-list compact" : "projectm-list"}>
          {presets.map((preset, index) => (
            <button
              className={index === selectedPreset ? "active" : ""}
              key={preset}
              onClick={() => setSelectedPreset(index)}
            >
              <span>{index + 1}</span>
              <strong>{preset.replace(/\.milk$/i, "")}</strong>
              <small>{preset.split(".").pop()}</small>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}

const MusicPage = memo(function MusicPage({
  tracks,
  query,
  selected,
  isPlaying,
  viewMode,
  onAdd,
  onPlay,
  onRemove,
  onSelect,
  text,
}: {
  tracks: Track[];
  query: string;
  selected: number;
  isPlaying: boolean;
  viewMode: MusicViewMode;
  onAdd: () => void;
  onPlay: (index: number) => void;
  onRemove: (index: number) => void;
  onSelect: (index: number) => void;
  text: (key: string) => string;
}) {
  if (!tracks.length) {
    return (
      <div className="music-page empty-music-page">
        <button className="empty-library-card" onClick={onAdd}>
          <FolderPlus size={46} />
          <strong>{text("music.emptyTitle")}</strong>
          <span>{text("music.emptyHint")}</span>
        </button>
        <div className="visualizer-strip idle" aria-hidden="true">
          {Array.from({ length: 78 }, (_, index) => (
            <span key={index} style={{ "--bar": `${18 + ((index * 13) % 42)}%` } as React.CSSProperties} />
          ))}
        </div>
      </div>
    );
  }

  const visibleTracks = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => matchesLibraryQuery(track, query));

  if (!visibleTracks.length) {
    return (
      <div className="music-page empty-music-page">
        <div className="empty-library-card passive">
          <Search size={46} />
          <strong>{text("music.noResultsTitle")}</strong>
          <span>{text("music.noResultsHint")}</span>
        </div>
        <div className="visualizer-strip idle" aria-hidden="true">
          {Array.from({ length: 78 }, (_, index) => (
            <span key={index} style={{ "--bar": `${18 + ((index * 13) % 42)}%` } as React.CSSProperties} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="music-page">
      <div className={`playlist-grid playlist-view-${viewMode}`}>
        {visibleTracks.map(({ track, index }) => (
          <div
            className={`track-card ${selected === index ? "playing" : ""}`}
            key={track.id}
            role="button"
            tabIndex={0}
            onMouseDown={(event) => {
              if (event.detail >= 2) {
                event.preventDefault();
                onPlay(index);
              }
            }}
            onClick={(event) => {
              if (event.detail === 1) onSelect(index);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onPlay(index);
              }
              if (event.key === " ") {
                event.preventDefault();
                onSelect(index);
              }
            }}
          >
            <span className="track-index">{selected === index && isPlaying ? "II" : index + 1}</span>
            <span className="cover" style={{ "--cover": track.color } as React.CSSProperties}>
              <img src={trackCover(track)} alt="" />
            </span>
            <span className="track-copy">
              <strong>{track.title}</strong>
              <small>
                {track.artist} • {track.fileName}
              </small>
            </span>
            <span className="track-tag">{selected === index ? text("music.playing") : track.tag}</span>
            <span className="track-length">{track.length}</span>
            <span
              className="item-remove-btn"
              role="button"
              tabIndex={0}
              title={text("common.removeFromLibrary")}
              aria-label={text("common.removeFromLibrary")}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(index);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(index);
                }
              }}
            >
              <Trash2 size={16} />
            </span>
          </div>
        ))}
      </div>
      <div className={`visualizer-strip ${isPlaying ? "playing" : "idle"}`} aria-hidden="true">
        {Array.from({ length: 78 }, (_, index) => (
          <span
            key={index}
            style={
              {
                "--bar": `${20 + ((index * 17) % 68)}%`,
                "--delay": `${(index % 12) * 70}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
});

function VideoPage({
  videos,
  query,
  selected,
  isPlaying,
  docked,
  miniClosed,
  videoRef,
  currentTime,
  duration,
  volume,
  onAdd,
  onCloseMini,
  onDock,
  onUndock,
  onEnded,
  onLoadedData,
  onLoadedMetadata,
  onPlayState,
  onRemove,
  onSelect,
  onTimeUpdate,
  onPrev,
  onNext,
  onSeek,
  onSeekBy,
  onVolume,
  text,
}: {
  videos: VideoItem[];
  query: string;
  selected: number;
  isPlaying: boolean;
  docked: boolean;
  miniClosed: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  volume: number;
  onAdd: () => void;
  onCloseMini: () => void;
  onDock: () => void;
  onUndock: () => void;
  onEnded: () => void;
  onLoadedData: () => void;
  onLoadedMetadata: () => void;
  onPlayState: (playing: boolean) => void;
  onRemove: (index: number) => void;
  onSelect: (index: number) => void;
  onTimeUpdate: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (value: number) => void;
  onSeekBy: (seconds: number) => void;
  onVolume: (value: number) => void;
  text: (key: string) => string;
}) {
  const [fsSettingsOpen, setFsSettingsOpen] = useState(false);
  const [fsSettingsView, setFsSettingsView] = useState<"main" | "quality">("main");
  const [stableVolume, setStableVolume] = useState(false);
  const [volumeBoost, setVolumeBoost] = useState(false);
  const [cinematicLighting, setCinematicLighting] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("auto");
  const [targetFps, setTargetFps] = useState(0);
  const [speedFrameVisible, setSpeedFrameVisible] = useState(false);
  const [fullscreenBrightness, setFullscreenBrightness] = useState(1);
  const [fsControlsVisible, setFsControlsVisible] = useState(true);
  const [wheelHud, setWheelHud] = useState<{ side: "left" | "right"; kind: "volume" | "brightness"; percent: number } | null>(null);
  const wheelHudTimerRef = useRef<number | null>(null);
  const fsControlsTimerRef = useRef<number | null>(null);
  const videoClickTimerRef = useRef<number | null>(null);
  const speedFrameTimerRef = useRef<number | null>(null);
  const speedFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const remotePlaybackVideo = video as HTMLVideoElement & { disableRemotePlayback?: boolean; disablePictureInPicture?: boolean };
    remotePlaybackVideo.disableRemotePlayback = true;
    remotePlaybackVideo.disablePictureInPicture = true;
    video.setAttribute("controlsList", "noremoteplayback nodownload");
    video.setAttribute("disableRemotePlayback", "true");
    video.setAttribute("disablePictureInPicture", "true");
  }, [videoRef]);

  useEffect(() => {
    return () => {
      if (wheelHudTimerRef.current !== null) window.clearTimeout(wheelHudTimerRef.current);
      if (fsControlsTimerRef.current !== null) window.clearTimeout(fsControlsTimerRef.current);
      if (videoClickTimerRef.current !== null) window.clearTimeout(videoClickTimerRef.current);
      if (speedFrameTimerRef.current !== null) window.clearTimeout(speedFrameTimerRef.current);
    };
  }, []);

  if (!videos.length) {
    return (
      <div className="video-page empty-video-page">
        <button className="empty-library-card" onClick={onAdd}>
          <Video size={46} />
          <strong>{text("video.emptyTitle")}</strong>
          <span>{text("video.emptyHint")}</span>
        </button>
      </div>
    );
  }

  const visibleVideos = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => matchesLibraryQuery(video, query));

  const toggleVideoFullscreen = () => {
    const screen = videoRef.current?.closest(".video-screen") as HTMLElement | null;
    if (!screen) return;
    if (document.fullscreenElement) {
      setFsControlsVisible(true);
      if (fsControlsTimerRef.current !== null) window.clearTimeout(fsControlsTimerRef.current);
      void document.exitFullscreen();
      return;
    }
    setFsControlsVisible(true);
    if (fsControlsTimerRef.current !== null) window.clearTimeout(fsControlsTimerRef.current);
    fsControlsTimerRef.current = window.setTimeout(() => setFsControlsVisible(false), 4000);
    void screen.requestFullscreen?.();
  };

  if (!visibleVideos.length) {
    return (
      <div className="video-page empty-video-page">
        <div className="empty-library-card passive">
          <Search size={46} />
          <strong>{text("music.noResultsTitle")}</strong>
          <span>{text("video.noResultsHint")}</span>
        </div>
      </div>
    );
  }

  const selectedVideo = videos[selected];
  const mediaDuration = Math.max(1, duration || selectedVideo?.duration || 0);
  const mediaCurrent = Math.min(currentTime || 0, mediaDuration);
  const miniProgress = `${Math.max(0, Math.min(100, (mediaCurrent / mediaDuration) * 100))}%`;
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const fpsOptions = [0, 24, 30, 60];
  const qualityOptions: Array<{ id: VideoQuality; label: string }> = [
    { id: "auto", label: text("video.auto") },
    { id: "1080p", label: "1080p" },
    { id: "720p", label: "720p" },
    { id: "480p", label: "480p" },
    { id: "360p", label: "360p" },
  ];
  const sourceHeight = videoRef.current?.videoHeight || 0;
  const autoQualityLabel = sourceHeight > 0 ? `${sourceHeight}p` : text("video.auto");
  const selectedQualityMenuLabel = videoQuality === "auto" ? `${text("video.auto")}${sourceHeight > 0 ? ` (${autoQualityLabel})` : ""}` : videoQuality;
  const cyclePlaybackSpeed = () => {
    const video = videoRef.current;
    const canvas = speedFrameCanvasRef.current;
    const currentIndex = speedOptions.indexOf(playbackSpeed);
    const nextSpeed = speedOptions[(currentIndex + 1) % speedOptions.length];
    if (video && canvas && video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        flushSync(() => setSpeedFrameVisible(true));
        if (speedFrameTimerRef.current !== null) window.clearTimeout(speedFrameTimerRef.current);
        window.requestAnimationFrame(() => {
          video.playbackRate = nextSpeed;
          setPlaybackSpeed(nextSpeed);
          speedFrameTimerRef.current = window.setTimeout(() => setSpeedFrameVisible(false), 900);
        });
        return;
      }
    }
    if (video) video.playbackRate = nextSpeed;
    setPlaybackSpeed(nextSpeed);
  };
  const cycleTargetFps = () => {
    const currentIndex = fpsOptions.indexOf(targetFps);
    const nextFps = fpsOptions[(currentIndex + 1) % fpsOptions.length];
    setTargetFps(nextFps);
    showFullscreenControls();
  };
  const showWheelHud = (kind: "volume" | "brightness", percent: number) => {
    setWheelHud({ kind, percent: Math.round(percent), side: kind === "volume" ? "left" : "right" });
    if (wheelHudTimerRef.current !== null) window.clearTimeout(wheelHudTimerRef.current);
    wheelHudTimerRef.current = window.setTimeout(() => setWheelHud(null), 900);
  };
  const showFullscreenControls = () => {
    setFsControlsVisible(true);
    if (fsControlsTimerRef.current !== null) window.clearTimeout(fsControlsTimerRef.current);
    if (!document.fullscreenElement || fsSettingsOpen) return;
    fsControlsTimerRef.current = window.setTimeout(() => setFsControlsVisible(false), 4000);
  };
  const setVolumeFromWheel = (deltaY: number) => {
    const direction = deltaY > 0 ? -1 : 1;
    const next = Math.max(0, Math.min(1, volume + direction * 0.05));
    onVolume(next);
    showWheelHud("volume", next * 100);
    showFullscreenControls();
  };
  const setBrightnessFromWheel = (deltaY: number) => {
    const direction = deltaY > 0 ? -1 : 1;
    const next = Math.max(0.35, Math.min(2, fullscreenBrightness + direction * 0.07));
    setFullscreenBrightness(next);
    showWheelHud("brightness", next * 100);
    showFullscreenControls();
  };
  const handleFullscreenWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!document.fullscreenElement || event.ctrlKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".video-fs-controls, .video-fs-settings-menu, button, input, select, textarea")) return;
    const width = window.innerWidth || document.documentElement.clientWidth;
    const edgePx = 90;
    const inLeft = event.clientX <= edgePx;
    const inRight = event.clientX >= width - edgePx;
    if (!inLeft && !inRight) return;
    event.preventDefault();
    event.stopPropagation();
    if (inLeft) setVolumeFromWheel(event.deltaY);
    if (inRight) setBrightnessFromWheel(event.deltaY);
  };
  const handleVideoDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".video-fs-controls, .video-fs-settings-menu, .video-mini-overlay, button, input, select, textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    if (videoClickTimerRef.current !== null) {
      window.clearTimeout(videoClickTimerRef.current);
      videoClickTimerRef.current = null;
    }
    toggleVideoFullscreen();
  };
  const handleVideoClick = (event: ReactMouseEvent<HTMLVideoElement>) => {
    if (event.detail > 1) return;
    if (videoClickTimerRef.current !== null) window.clearTimeout(videoClickTimerRef.current);
    videoClickTimerRef.current = window.setTimeout(() => {
      onPlayState(!isPlaying);
      videoClickTimerRef.current = null;
    }, 220);
  };

  const videoElement = (
    <video
      ref={videoRef}
      crossOrigin="anonymous"
      preload="metadata"
      playsInline
      style={fullscreenBrightness === 1 ? undefined : { filter: `brightness(${fullscreenBrightness.toFixed(3)})` }}
      onClick={handleVideoClick}
      onEnded={onEnded}
      onError={() => reportClientError("video.element", mediaErrorMessage(videoRef.current))}
      onLoadedData={onLoadedData}
      onLoadedMetadata={onLoadedMetadata}
      onPause={() => onPlayState(false)}
      onPlay={() => onPlayState(true)}
      onTimeUpdate={onTimeUpdate}
    />
  );

  return (
    <div className={`video-page ${docked ? "video-page-docked" : "video-page-full"}`}>
      <div className="video-grid">
        {visibleVideos.map(({ video, index }) => (
          <button
            className={`video-card ${selected === index ? "active" : ""}`}
            key={video.title}
            onClick={() => onSelect(index)}
          >
            <span className="video-preview" style={{ "--cover": video.color } as React.CSSProperties}>
              {video.thumbnailDataUrl ? <img src={video.thumbnailDataUrl} alt="" /> : <Film size={42} />}
              <span className="video-play">
                {selected === index && isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </span>
            </span>
            <strong>{video.title}</strong>
            <small>{video.meta}</small>
            <span
              className="item-remove-btn video-remove-btn"
              role="button"
              tabIndex={0}
              title={text("common.removeFromLibrary")}
              aria-label={text("common.removeFromLibrary")}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(index);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(index);
                }
              }}
            >
              <Trash2 size={16} />
            </span>
          </button>
        ))}
      </div>
      <div className={`video-player-mock ${docked ? "video-player-docked" : ""} ${docked && miniClosed ? "video-player-hidden" : ""}`}>
        <div className="video-player-top">
          <button className="inline-btn" onClick={onDock}>
            <ChevronLeft size={17} />
            {text("video.back")}
          </button>
          <div>
            <strong>{selectedVideo?.title}</strong>
            <span>{selectedVideo?.fileName}</span>
          </div>
          <button className="inline-btn" onClick={toggleVideoFullscreen}>
            <Maximize2 size={17} />
            {text("video.fullscreen")}
          </button>
        </div>
        <div
          className={`video-screen video-quality-${videoQuality} ${cinematicLighting ? "video-screen-cinematic" : ""}`}
          onDoubleClick={handleVideoDoubleClick}
          onMouseMove={showFullscreenControls}
          onWheel={handleFullscreenWheel}
        >
          {videoElement}
          <canvas ref={speedFrameCanvasRef} className={`video-rate-frame ${speedFrameVisible ? "visible" : ""}`} aria-hidden="true" />
          <button className={`video-fs-center-play ${fsControlsVisible || fsSettingsOpen ? "" : "hidden"}`} onClick={() => onPlayState(!isPlaying)} aria-label={text("player.playPause")}>
            {isPlaying ? <Pause size={44} fill="currentColor" /> : <Play size={44} fill="currentColor" />}
          </button>
          {wheelHud ? (
            <div className={`fs-wheel-hud ${wheelHud.side}`}>
              <span className="fs-wheel-hud-icon">{wheelHud.kind === "volume" ? <Volume2 size={26} /> : <Sun size={26} />}</span>
              <span className="fs-wheel-hud-value">{wheelHud.percent}%</span>
              <span className="fs-wheel-hud-bar" aria-hidden="true">
                <span
                  className="fs-wheel-hud-bar-fill"
                  style={{
                    height:
                      wheelHud.kind === "brightness"
                        ? `${Math.max(0, Math.min(100, ((wheelHud.percent - 35) / 165) * 100))}%`
                        : `${Math.max(0, Math.min(100, wheelHud.percent))}%`,
                  }}
                />
              </span>
            </div>
          ) : null}
          {!isPlaying ? (
            <button className="video-center-play" onClick={() => onPlayState(true)} aria-label={text("video.play")}>
              <Play size={54} fill="currentColor" />
            </button>
          ) : null}
          <div className="video-mini-overlay" onClick={(event) => event.stopPropagation()}>
            <div className="video-mini-overlay-top">
              <button className="video-mini-overlay-btn" onClick={onUndock} title={text("video.restore")} aria-label={text("video.restore")}>
                <Maximize2 size={18} />
              </button>
              <button className="video-mini-overlay-btn" onClick={onCloseMini} title={text("video.closeMini")} aria-label={text("video.closeMini")}>
                <X size={18} />
              </button>
            </div>
            <button className="video-mini-play-toggle" onClick={() => onPlayState(!isPlaying)} title={text("player.playPause")} aria-label={text("player.playPause")}>
              {isPlaying ? <Pause size={42} fill="currentColor" /> : <Play size={42} fill="currentColor" />}
            </button>
            <div className="video-mini-info">
              <div className="video-mini-info-title">{selectedVideo?.title}</div>
              <div className="video-mini-info-meta">{isPlaying ? text("library.nowPlaying") : text("video.miniPlayer")}</div>
            </div>
            <div
              className="video-mini-progress"
              role="slider"
              aria-label={text("player.position")}
              aria-valuemin={0}
              aria-valuemax={Math.round(mediaDuration)}
              aria-valuenow={Math.round(mediaCurrent)}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
                onSeek(Math.max(0, Math.min(mediaDuration, ratio * mediaDuration)));
              }}
            >
              <span className="video-mini-progress-bar" style={{ width: miniProgress }} />
              <span className="video-mini-progress-thumb" style={{ left: miniProgress }} />
            </div>
          </div>
          <div
            className={`video-fs-controls ${fsControlsVisible || fsSettingsOpen ? "" : "hidden"}`}
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => {
              setFsControlsVisible(true);
              if (fsControlsTimerRef.current !== null) window.clearTimeout(fsControlsTimerRef.current);
            }}
            onMouseLeave={showFullscreenControls}
          >
            <div className="video-fs-timeline">
              <span>{formatTime(mediaCurrent)}</span>
              <input
                aria-label={text("video.position")}
                type="range"
                min="0"
                max={mediaDuration}
                value={mediaCurrent}
                onChange={(event) => onSeek(Number(event.target.value))}
              />
              <span>{formatTime(mediaDuration)}</span>
            </div>
            <div className="video-fs-control-row">
              <button onClick={onPrev} title={text("player.previous")} aria-label={text("player.previous")}>
                <SkipBack size={20} />
              </button>
              <button onClick={() => onSeekBy(-10)} title={text("player.rewind10")} aria-label={text("player.rewind10")}>
                <RotateCcw size={19} />
                <span className="control-badge">10</span>
              </button>
              <button className="video-fs-play" onClick={() => onPlayState(!isPlaying)} title={text("player.playPause")} aria-label={text("player.playPause")}>
                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
              </button>
              <button onClick={() => onSeekBy(10)} title={text("player.forward10")} aria-label={text("player.forward10")}>
                <RotateCw size={19} />
                <span className="control-badge">10</span>
              </button>
              <button onClick={onNext} title={text("player.next")} aria-label={text("player.next")}>
                <SkipForward size={20} />
              </button>
              <div className="video-fs-right-tools">
                <div
                  className="video-fs-volume"
                  onWheel={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setVolumeFromWheel(event.deltaY);
                  }}
                >
                  <Volume2 size={20} />
                  <input
                    aria-label={text("player.volume")}
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                  value={volume}
                  onChange={(event) => onVolume(Number(event.target.value))}
                  onWheel={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setVolumeFromWheel(event.deltaY);
                  }}
                />
                  <b>{Math.round(volume * 100)}%</b>
                </div>
                <button className="video-fs-pill" onClick={cyclePlaybackSpeed} title={text("video.speed")} aria-label={text("video.speed")}>
                  {playbackSpeed.toFixed(1)}x
                </button>
                <button className="video-fs-pill" onClick={cycleTargetFps} title="Hedef FPS" aria-label="Hedef FPS">
                  {targetFps === 0 ? "Auto" : targetFps}
                </button>
                <button
                  className={`video-fs-settings-btn ${fsSettingsOpen ? "active" : ""}`}
                  onClick={() => {
                    setFsSettingsOpen((value) => {
                      const next = !value;
                      if (next) setFsSettingsView("main");
                      return next;
                    });
                  }}
                  title={text("rail.settings")}
                  aria-label={text("rail.settings")}
                  aria-expanded={fsSettingsOpen}
                >
                  <Settings size={22} />
                </button>
                <button onClick={toggleVideoFullscreen} title={text("video.fullscreen")} aria-label={text("video.fullscreen")}>
                  <Maximize2 size={20} />
                </button>
              </div>
            </div>
            {fsSettingsOpen ? (
              <div className="video-fs-settings-menu">
                {fsSettingsView === "quality" ? (
                  <>
                    <div className="video-fs-settings-subhead">
                      <button onClick={() => setFsSettingsView("main")} title={text("nav.back")} aria-label={text("nav.back")}>
                        <ChevronLeft size={20} />
                      </button>
                      <strong>{text("video.quality")}</strong>
                    </div>
                    {qualityOptions.map((option) => (
                      <button
                        className={`video-fs-quality-row ${videoQuality === option.id ? "active" : ""}`}
                        key={option.id}
                        onClick={() => {
                          setVideoQuality(option.id);
                          setFsSettingsView("main");
                          showFullscreenControls();
                        }}
                      >
                        <span>{option.label}</span>
                        {videoQuality === option.id ? <Check size={18} /> : null}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <VideoSettingsToggle icon={<Volume2 size={19} />} label={text("video.stableVolume")} checked={stableVolume} onChange={setStableVolume} />
                    <VideoSettingsToggle icon={<SlidersHorizontal size={19} />} label={text("video.volumeBoost")} checked={volumeBoost} onChange={setVolumeBoost} />
                    <VideoSettingsToggle
                      icon={<Sun size={19} />}
                      label={text("video.cinematicLight")}
                      checked={cinematicLighting}
                      onChange={setCinematicLighting}
                    />
                    <VideoSettingsToggle icon={<ListMusic size={19} />} label={text("video.captions")} checked={captionsEnabled} onChange={setCaptionsEnabled} />
                    <button className="video-fs-settings-row">
                      <span>{text("video.subtitles")}</span>
                      <b>{captionsEnabled ? text("video.open") : text("video.closed")} ›</b>
                    </button>
                    <button className="video-fs-settings-row">
                      <span>{text("video.sleepTimer")}</span>
                      <b>{text("video.closed")} ›</b>
                    </button>
                    <button className="video-fs-settings-row" onClick={cyclePlaybackSpeed}>
                      <span>{text("video.speed")}</span>
                      <b>{playbackSpeed === 1 ? text("video.normal") : `${playbackSpeed.toFixed(2).replace(/\.00$/, "")}x`} ›</b>
                    </button>
                    <button className="video-fs-settings-row" onClick={() => setFsSettingsView("quality")}>
                      <span>{text("video.quality")}</span>
                      <b>{selectedQualityMenuLabel} ›</b>
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoSettingsToggle({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="video-fs-settings-toggle">
      <span className="video-fs-settings-icon">{icon}</span>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function EffectsPanel({
  enabled,
  dspSettings,
  eqGains,
  preset,
  onBandChange,
  onDspChange,
  onPreset,
  onResetDsp,
  onReset,
  onToggle,
}: {
  enabled: boolean;
  dspSettings: DspSettings;
  eqGains: number[];
  preset: EqPresetId;
  onBandChange: (index: number, value: number) => void;
  onDspChange: (key: keyof DspSettings, value: number) => void;
  onPreset: (preset: EqPresetId) => void;
  onResetDsp: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  return (
    <aside className="effects-panel">
      <header className="effects-head">
        <label className="toggle">
          <input checked={enabled} onChange={onToggle} type="checkbox" />
          <span />
        </label>
        <strong>Ses Efektleri</strong>
        <select aria-label="Isik rengi">
          <option>Gok Mavi</option>
          <option>Rainbow</option>
          <option>Yesil</option>
          <option>Mor</option>
        </select>
      </header>
      <div className="effects-body">
        <div className="effects-list">
          {effectItems.map((item, index) => (
            <button className={index === 1 ? "active" : ""} key={item}>
              <SlidersHorizontal size={17} />
              <span>{item}</span>
            </button>
          ))}
        </div>
        <div className="eq-area">
          <div className="eq-title">
            <div className="eq-icon">
              <SlidersHorizontal size={25} />
            </div>
            <div>
              <h2>32-Bantli Profesyonel Ekolayzir</h2>
              <p>Hassas frekans kontrolu ile sesinizi sekillendirin.</p>
            </div>
          </div>
          <div className="preset-row">
            <label className="preset-select">
              <span>Hazir Ayarlar</span>
              <select value={preset} onChange={(event) => onPreset(event.target.value as EqPresetId)}>
                {Object.entries(eqPresets).map(([id, item]) => (
                  <option key={id} value={id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="reset-btn" onClick={onReset}>
              Sifirla
            </button>
          </div>
          <div className="dsp-controls">
            <label className="dsp-control">
              <span>Reverb</span>
              <input
                type="range"
                min="0"
                max="0.55"
                step="0.01"
                value={dspSettings.reverb}
                onChange={(event) => onDspChange("reverb", Number(event.target.value))}
              />
              <b>{Math.round(dspSettings.reverb * 100)}%</b>
            </label>
            <label className="dsp-control">
              <span>Kompresor</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={dspSettings.compressor}
                onChange={(event) => onDspChange("compressor", Number(event.target.value))}
              />
              <b>{Math.round(dspSettings.compressor * 100)}%</b>
            </label>
            <label className="dsp-control">
              <span>Limiter</span>
              <input
                type="range"
                min="-12"
                max="0"
                step="0.5"
                value={dspSettings.limiter}
                onChange={(event) => onDspChange("limiter", Number(event.target.value))}
              />
              <b>{dspSettings.limiter.toFixed(1)}dB</b>
            </label>
            <label className="dsp-control">
              <span>Bass</span>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={dspSettings.bassBoost}
                onChange={(event) => onDspChange("bassBoost", Number(event.target.value))}
              />
              <b>{dspSettings.bassBoost.toFixed(1)}dB</b>
            </label>
            <button className="dsp-reset-btn" onClick={onResetDsp}>
              DSP Sifirla
            </button>
          </div>
          <div className="spectrum-preview" aria-hidden="true">
            {Array.from({ length: 96 }, (_, index) => (
              <span key={index} style={{ "--bar": `${12 + ((index * 23) % 82)}%` } as React.CSSProperties} />
            ))}
          </div>
          <div className="eq-bands">
            {frequencies.map((freq, index) => (
              <label className="eq-band" key={freq}>
                <span>{index % 4 === 0 ? `${(eqGains[index] ?? 0).toFixed(1)}d` : ""}</span>
                <input
                  aria-label={`${freq} Hz`}
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eqGains[index] ?? 0}
                  onChange={(event) => onBandChange(index, Number(event.target.value))}
                />
                <small>{freq}</small>
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PlayerBar({
  page,
  currentTime,
  duration,
  videoCurrentTime,
  videoDuration,
  volume,
  isPlaying,
  spectrumPlaying,
  hasMedia,
  coverDataUrl,
  coverColor,
  getAnalyser,
  getNativeSpectrum,
  visualHoldUntilRef,
  onClear,
  onNext,
  onOpenProjectM,
  onPlayPause,
  onPrev,
  onSeek,
  onSeekBy,
  onToggleMute,
  onVolume,
  text,
}: {
  page: PageId;
  currentTime: number;
  duration: number;
  videoCurrentTime: number;
  videoDuration: number;
  volume: number;
  isPlaying: boolean;
  spectrumPlaying: boolean;
  hasMedia: boolean;
  coverDataUrl?: string;
  coverColor?: string;
  getAnalyser: () => AnalyserNode | null;
  getNativeSpectrum?: (bands: number) => Promise<NativeSpectrumPair | number[]>;
  visualHoldUntilRef: RefObject<number>;
  onClear: () => void;
  onNext: () => void;
  onOpenProjectM: () => void;
  onPlayPause: () => void;
  onPrev: () => void;
  onSeek: (value: number) => void;
  onSeekBy: (seconds: number) => void;
  onToggleMute: () => void;
  onVolume: (value: number) => void;
  text: (key: string) => string;
}) {
  const mediaDuration = page === "video" ? videoDuration : duration;
  const mediaCurrent = page === "video" ? videoCurrentTime : currentTime;
  const disabled = !hasMedia;
  const muted = volume <= 0.01;
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [seekHold, setSeekHold] = useState<{ value: number; until: number } | null>(null);
  const holdActive = seekHold !== null && performance.now() < seekHold.until && Math.abs(mediaCurrent - seekHold.value) > 0.45;
  const timelineValue = seekDraft ?? (holdActive ? seekHold.value : mediaCurrent);
  const commitSeek = (value: number) => {
    const nextValue = Math.max(0, Math.min(mediaDuration || 0, value));
    setSeekHold({ value: nextValue, until: performance.now() + 1200 });
    setSeekDraft(null);
    onSeek(nextValue);
  };

  useEffect(() => {
    if (disabled) {
      setSeekDraft(null);
      setSeekHold(null);
      return;
    }
    if (seekHold && (Math.abs(mediaCurrent - seekHold.value) <= 0.45 || performance.now() >= seekHold.until)) {
      setSeekHold(null);
    }
  }, [disabled, mediaCurrent, seekHold]);

  return (
    <footer className={`player-bar ${page === "video" ? "video-player-bar" : ""}`}>
      <div className="timeline">
        <span>{formatTime(timelineValue)}</span>
        <input
          aria-label={text("player.position")}
          type="range"
          min="0"
          max={Math.max(1, mediaDuration)}
          value={Math.min(timelineValue, Math.max(1, mediaDuration))}
          onChange={(event) => setSeekDraft(Number(event.target.value))}
          onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
              commitSeek(Number(event.currentTarget.value));
            }
          }}
          onBlur={(event) => {
            if (seekDraft !== null) commitSeek(Number(event.currentTarget.value));
          }}
          onWheel={(event) => {
            event.preventDefault();
            setSeekDraft(null);
            onSeekBy(event.deltaY < 0 ? 10 : -10);
          }}
          disabled={disabled}
        />
        <span>{formatTime(mediaDuration)}</span>
      </div>
      <div className="player-controls">
        <button className="danger" onClick={onClear} title={text("player.clear")} aria-label={text("player.clear")} disabled={disabled}>
          <Trash2 size={19} />
        </button>
        <button title={text("player.shuffle")} aria-label={text("player.shuffle")} disabled={disabled}>
          <Shuffle size={19} />
        </button>
        <button onClick={onPrev} title={text("player.previous")} aria-label={text("player.previous")} disabled={disabled}>
          <SkipBack size={20} />
        </button>
        <button onClick={() => onSeekBy(-10)} title={text("player.rewind10")} aria-label={text("player.rewind10")} disabled={disabled}>
          <RotateCcw size={19} />
          <span className="control-badge">10</span>
        </button>
        <button className="play-btn" onClick={onPlayPause} title={text("player.playPause")} aria-label={text("player.playPause")}>
          {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
        <button onClick={() => onSeekBy(10)} title={text("player.forward10")} aria-label={text("player.forward10")} disabled={disabled}>
          <RotateCw size={19} />
          <span className="control-badge">10</span>
        </button>
        <button onClick={onNext} title={text("player.next")} aria-label={text("player.next")} disabled={disabled}>
          <SkipForward size={20} />
        </button>
        <button title={text("player.repeat")} aria-label={text("player.repeat")} disabled={disabled}>
          <Repeat size={19} />
        </button>
        <button title={text("player.repeatOne")} aria-label={text("player.repeatOne")} disabled={disabled}>
          <Repeat1 size={19} />
        </button>
        <div className="volume">
          <button
            className={`volume-toggle ${muted ? "muted" : ""}`}
            onClick={onToggleMute}
            title={muted ? text("player.unmute") : text("player.mute")}
            aria-label={muted ? text("player.unmute") : text("player.mute")}
            aria-pressed={muted}
            disabled={disabled}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <input
            aria-label={text("player.volume")}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            onWheel={(event) => {
              event.preventDefault();
              onVolume(Math.max(0, Math.min(1, volume + (event.deltaY < 0 ? 0.05 : -0.05))));
            }}
          />
          <b>{Math.round(volume * 100)}%</b>
        </div>
      </div>
      {page !== "video" ? (
        <div className="player-bottom">
          <div className="cover-section" style={{ "--cover": coverColor || "#28d7ff" } as React.CSSProperties}>
            {coverDataUrl ? <img src={coverDataUrl} alt="" /> : <img src="/icons/app/ardali_256.png" alt="" />}
          </div>
          <PlayerSpectrumCanvas
            getAnalyser={getAnalyser}
            getNativeSpectrum={getNativeSpectrum}
            isPlaying={spectrumPlaying && !disabled}
            onOpenProjectM={onOpenProjectM}
            visualHoldUntilRef={visualHoldUntilRef}
          />
        </div>
      ) : null}
    </footer>
  );
}

const visualizerAnalyzers: Array<{ id: VisualizerAnalyzerId; label: string }> = [
  { id: "ardali", label: "ArDali" },
  { id: "sfx_effects", label: "Ses Efek Ritmi" },
  { id: "ardali_center_turbine", label: "ArDali Merkez Türbin" },
  { id: "ardali_center_turbine_lines", label: "ArDali Merkez Türbin (çizgili)" },
  { id: "ardali_center_peak", label: "ArDali Merkez Tepe" },
  { id: "ardali_center_peak_lines", label: "ArDali Merkez Tepe (çizgili)" },
  { id: "turbine", label: "Türbin" },
  { id: "nyanalyzer", label: "Nyanalyzer Cat" },
  { id: "none", label: "Çözümleyici yok" },
];

const visualizerFramerates: Array<{ value: VisualizerSettingsState["framerate"]; label: string }> = [
  { value: 20, label: "Düşük (20 fps)" },
  { value: 25, label: "Orta (25 fps)" },
  { value: 30, label: "Yüksek (30 fps)" },
  { value: 60, label: "Çok yüksek (60 fps)" },
];

const visualizerSharpness: Array<{ value: VisualizerSettingsState["sharpness"]; label: string }> = [
  { value: 0, label: "Yumuşak" },
  { value: 1, label: "Dengeli" },
  { value: 2, label: "Keskin" },
  { value: 3, label: "Keskin+" },
];

const defaultVisualizerSettings: VisualizerSettingsState = {
  analyzer: "ardali",
  framerate: 60,
  sharpness: 1,
  psychedelic: true,
  glow: true,
  reflection: false,
};

function loadVisualizerSettings(): VisualizerSettingsState {
  try {
    const saved = JSON.parse(localStorage.getItem(visualizerStorageKey) || "{}") as Partial<{
      analyzer: VisualizerAnalyzerId;
      framerate: number;
      sharpness: number;
      psychedelic: boolean;
      glow: boolean;
      reflection: boolean;
    }>;
    const analyzer: VisualizerAnalyzerId =
      saved.analyzer && visualizerAnalyzers.some((item) => item.id === saved.analyzer)
        ? saved.analyzer
        : defaultVisualizerSettings.analyzer;
    const framerate = visualizerFramerates.some((item) => item.value === saved.framerate)
      ? (saved.framerate as VisualizerSettingsState["framerate"])
      : defaultVisualizerSettings.framerate;
    const sharpness = visualizerSharpness.some((item) => item.value === saved.sharpness)
      ? (saved.sharpness as VisualizerSettingsState["sharpness"])
      : defaultVisualizerSettings.sharpness;
    return {
      analyzer,
      framerate,
      sharpness,
      psychedelic: saved.psychedelic !== false,
      glow: saved.glow !== false,
      reflection: saved.reflection === true,
    };
  } catch {
    return defaultVisualizerSettings;
  }
}

function saveVisualizerSettings(settings: VisualizerSettingsState) {
  localStorage.setItem(
    visualizerStorageKey,
    JSON.stringify({
      analyzer: settings.analyzer,
      framerate: settings.framerate,
      sharpness: settings.sharpness,
      psychedelic: settings.psychedelic,
      glow: settings.glow,
      reflection: settings.reflection,
    }),
  );
}

const PlayerSpectrumCanvas = memo(function PlayerSpectrumCanvas({
  getAnalyser,
  getNativeSpectrum,
  isPlaying,
  onOpenProjectM,
  visualHoldUntilRef,
}: {
  getAnalyser: () => AnalyserNode | null;
  getNativeSpectrum?: (bands: number) => Promise<NativeSpectrumPair | number[]>;
  isPlaying: boolean;
  onOpenProjectM: () => void;
  visualHoldUntilRef: RefObject<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [settings, setSettings] = useState<VisualizerSettingsState>(() => loadVisualizerSettings());
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [projectMRunning, setProjectMRunning] = useState(false);
  const settingsRef = useRef(settings);
  const isPlayingRef = useRef(isPlaying);
  const analyserGetterRef = useRef(getAnalyser);
  const nativeSpectrumFetcherRef = useRef(getNativeSpectrum);
  const analyzerStateRef = useRef({
    bars: [] as number[],
    roofs: [] as number[],
    roofVelocity: [] as number[],
    roofMemory: [] as number[][],
    peakSpeed: [] as number[],
    attack: [] as number[],
    release: [] as number[],
    bandGain: [] as number[],
    bandMotion: [] as number[],
    bandFloor: [] as number[],
    previousSpectrum: [] as number[],
    spectrum: [] as number[],
    frequencyData: null as Uint8Array<ArrayBuffer> | null,
    adaptiveGain: 1,
    hue: 0,
    lastFrameAt: 0,
    currentAnalyzer: "" as VisualizerAnalyzerId | "",
  });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    analyserGetterRef.current = getAnalyser;
  }, [getAnalyser]);

  useEffect(() => {
    nativeSpectrumFetcherRef.current = getNativeSpectrum;
  }, [getNativeSpectrum]);

  const updateSettings = (updater: (current: VisualizerSettingsState) => VisualizerSettingsState) => {
    setSettings((current) => {
      const next = updater(current);
      saveVisualizerSettings(next);
      return next;
    });
  };

  const openMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 260;
    const menuHeight = Math.min(740, window.innerHeight - 20);
    setMenuPosition({
      x: Math.max(10, Math.min(event.clientX, window.innerWidth - menuWidth - 10)),
      y: Math.max(10, Math.min(event.clientY, window.innerHeight - menuHeight - 10)),
    });
  };

  useEffect(() => {
    if (!menuPosition) return undefined;
    const close = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".visualizer-context-menu")) return;
      setMenuPosition(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menuPosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let timeoutId = 0;
    let rafId = 0;
    let cancelled = false;
    let nativeSpectrumRequestInFlight = false;
    let lastNativeSpectrumRequestAt = 0;
    let latestNativeSpectrum: number[] = [];
    let resizeObserver: ResizeObserver | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = 1;
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        analyzerStateRef.current.bars = [];
      }
    };
    resize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    const interpolate = (data: Uint8Array<ArrayBuffer>, target: number[], analyser: AnalyserNode) => {
      const count = target.length;
      const sampleRate = analyser.context.sampleRate || 48_000;
      const nyquist = sampleRate * 0.5;
      const minHz = 38;
      const maxHz = Math.max(minHz * 2, Math.min(15_500, nyquist * 0.86));
      const range = maxHz / minHz;
      const binForFrequency = (frequency: number) => {
        const norm = Math.max(0, Math.min(0.999999, frequency / nyquist));
        return Math.max(0, Math.min(data.length - 1, norm * data.length));
      };
      const sampleBin = (bin: number) => {
        const low = Math.max(0, Math.min(data.length - 1, Math.floor(bin)));
        const high = Math.min(data.length - 1, low + 1);
        const frac = Math.max(0, Math.min(1, bin - low));
        return (data[low] || 0) * (1 - frac) + (data[high] || 0) * frac;
      };
      let peakValue = 0;
      let averageValue = 0;
      const rawValues = new Array(count).fill(0);
      for (let index = 0; index < count; index += 1) {
        const position = (index + 0.5) / Math.max(1, count);
        const centerHz = minHz * Math.pow(range, position);
        const nextCenterHz = minHz * Math.pow(range, Math.min(0.999, (index + 1.5) / Math.max(1, count)));
        const previousCenterHz = minHz * Math.pow(range, Math.max(0.001, (index - 0.5) / Math.max(1, count)));
        const halfWidthHz = Math.max(14, Math.min(360, (nextCenterHz - previousCenterHz) * 0.26));
        const firstBin = binForFrequency(centerHz - halfWidthHz);
        const lastBin = Math.max(firstBin + 0.5, binForFrequency(centerHz + halfWidthHz));
        const span = lastBin - firstBin;
        const taps = 3;
        let weighted = 0;
        let weightTotal = 0;
        let peak = sampleBin((firstBin + lastBin) * 0.5);
        for (let tap = 0; tap < taps; tap += 1) {
          const t = tap / (taps - 1);
          const bin = firstBin + span * t;
          const value = sampleBin(bin);
          const weight = 1 - Math.abs(t - 0.5) * 0.55;
          weighted += value * weight;
          weightTotal += weight;
          peak = Math.max(peak, value);
        }
        const average = weightTotal > 0 ? weighted / weightTotal : peak;
        const mixed = peak * 0.82 + average * 0.18;
        const bassTame = 0.8 + 0.2 * Math.pow(position, 0.72);
        const highLift = 1 + 0.42 * Math.pow(position, 1.55);
        const value = Math.max(0, (mixed - 4) / 251) * bassTame * highLift;
        rawValues[index] = value;
        peakValue = Math.max(peakValue, value);
        averageValue += value;
      }

      averageValue /= Math.max(1, count);
      const state = analyzerStateRef.current;
      const wantedGain = peakValue > 0.004 ? Math.min(2.9, Math.max(0.8, 0.5 / peakValue)) : 1.15;
      state.adaptiveGain += (wantedGain - state.adaptiveGain) * 0.09;
      for (let index = 0; index < count; index += 1) {
        const position = (index + 0.5) / Math.max(1, count);
        const bassWeight = Math.pow(1 - position, 1.65);
        const bandGain = state.bandGain[index] || 1;
        const previous = state.previousSpectrum[index] || 0;
        const floor = state.bandFloor[index] || 0;
        const bassBoost = 1 + bassWeight * 0.38;
        const raw = Math.max(0, rawValues[index] - averageValue * 0.075) * state.adaptiveGain * bandGain * bassBoost;
        const shaped = Math.pow(Math.min(1, raw), 0.58);
        const floorRise = 0.01 + position * 0.018;
        const floorFall = 0.075 + bassWeight * 0.055;
        const nextFloor = floor + (shaped - floor) * (shaped > floor ? floorRise : floorFall);
        const punch = Math.max(0, shaped - nextFloor * 0.76);
        const transient = Math.max(0, shaped - previous) * (0.42 + bassWeight * 0.36);
        const webAudioLike = Math.min(0.98, Math.pow(Math.min(1, punch * (1.72 + bassWeight * 0.62) + transient * 0.34 + shaped * 0.16), 0.8));
        const current = target[index] || 0;
        const alpha = webAudioLike > current ? 0.43 : 0.25;
        target[index] = current + (webAudioLike - current) * alpha;
        state.bandFloor[index] = nextFloor;
        state.previousSpectrum[index] = previous + (shaped - previous) * 0.24;
      }
    };

    const useNativeSpectrum = (source: number[], target: number[], deltaFramesForSmoothing: number) => {
      if (!source.length) {
        for (let index = 0; index < target.length; index += 1) {
          target[index] *= 0.97;
        }
        return target.some((value) => value > 0.01);
      }
      const count = target.length;
      let peakValue = 0;
      let averageValue = 0;
      const rawValues = new Array(count).fill(0);
      for (let index = 0; index < count; index += 1) {
        const sourcePosition = (index / Math.max(1, count - 1)) * Math.max(0, source.length - 1);
        const sourceIndex = Math.floor(sourcePosition);
        const sourceFrac = sourcePosition - sourceIndex;
        const low = source[sourceIndex] || 0;
        const high = source[Math.min(source.length - 1, sourceIndex + 1)] || low;
        const direct = low * (1 - sourceFrac) + high * sourceFrac;
        const left = source[Math.max(0, sourceIndex - 1)] || direct;
        const right = source[Math.min(source.length - 1, sourceIndex + 2)] || direct;
        const value = direct * 0.94 + Math.max(left, right) * 0.04 + ((left + right) * 0.5) * 0.02;
        rawValues[index] = value;
        peakValue = Math.max(peakValue, value);
        averageValue += value;
      }
      averageValue /= Math.max(1, count);
      const state = analyzerStateRef.current;
      const wantedGain = peakValue > 0.004 ? Math.min(1.55, Math.max(0.72, 0.3 / peakValue)) : 0.9;
      state.adaptiveGain += (wantedGain - state.adaptiveGain) * Math.min(1, 0.055 * deltaFramesForSmoothing);
      for (let index = 0; index < count; index += 1) {
        const position = (index + 0.5) / Math.max(1, count);
        const bassWeight = Math.pow(1 - position, 1.55);
        const bandGain = state.bandGain[index] || 1;
        const previousSpectrum = state.previousSpectrum[index] || 0;
        const floor = state.bandFloor[index] || 0;
        const raw = Math.max(0, rawValues[index] - averageValue * 0.06) * state.adaptiveGain * bandGain;
        const shaped = Math.pow(Math.min(1, raw), 0.56);
        const floorRise = 0.018 + position * 0.026;
        const floorFall = 0.09 + bassWeight * 0.06;
        const nextFloor = floor + (shaped - floor) * Math.min(1, (shaped > floor ? floorRise : floorFall) * deltaFramesForSmoothing);
        const punch = Math.max(0, shaped - nextFloor * 0.74);
        const transient = Math.max(0, shaped - previousSpectrum) * (1.28 + bassWeight * 1.05);
        const webAudioLike = Math.pow(Math.min(1, punch * (1.45 + bassWeight * 0.62) + transient * 0.78 + shaped * 0.07), 0.82);
        const limit = 0.78 + Math.pow(position, 0.7) * 0.08;
        const previous = target[index] || 0;
        const alpha = Math.min(1, (webAudioLike > previous ? 0.96 : 0.5) * deltaFramesForSmoothing);
        target[index] = Math.min(limit, previous + (webAudioLike - previous) * alpha);
        state.bandFloor[index] = nextFloor;
        state.previousSpectrum[index] = previousSpectrum + (shaped - previousSpectrum) * Math.min(1, 0.48 * deltaFramesForSmoothing);
      }
      return peakValue > 0.002;
    };

    const requestNativeSpectrum = (bandCount: number) => {
      const fetcher = nativeSpectrumFetcherRef.current;
      const now = performance.now();
      const sampleFps = document.hidden ? 8 : settingsRef.current.framerate;
      const requestInterval = 1000 / sampleFps;
      if (!fetcher || nativeSpectrumRequestInFlight || now - lastNativeSpectrumRequestAt < requestInterval) return;
      nativeSpectrumRequestInFlight = true;
      lastNativeSpectrumRequestAt = now;
      fetcher(Math.max(64, Math.min(128, Math.ceil(bandCount / 2))))
        .then((values) => {
          if (cancelled) return;
          const sourceValues = Array.isArray(values)
            ? values
            : settingsRef.current.analyzer === "sfx_effects"
              ? values.processed.length ? values.processed : values.raw
              : values.raw.length ? values.raw : values.processed;
          if (Array.isArray(sourceValues)) {
            let peak = 0;
            const nextSpectrum = new Array(sourceValues.length);
            for (let index = 0; index < sourceValues.length; index += 1) {
              const value = Math.max(0, Number(sourceValues[index]) || 0);
              nextSpectrum[index] = value;
              if (value > peak) peak = value;
            }
            if (peak > 0.001) latestNativeSpectrum = nextSpectrum;
          }
        })
        .catch(() => undefined)
        .finally(() => {
          nativeSpectrumRequestInFlight = false;
        });
    };

    const schedule = () => {
      if (cancelled) return;
      rafId = window.requestAnimationFrame(draw);
    };

    const draw = () => {
      if (cancelled) return;
      const state = analyzerStateRef.current;
      const fps = document.hidden ? 8 : 60;
      const now = performance.now();
      const frameInterval = 1000 / fps;
      if (document.hidden && state.lastFrameAt && now - state.lastFrameAt < frameInterval - 1) {
        schedule();
        return;
      }
      const elapsedMs = state.lastFrameAt ? now - state.lastFrameAt : frameInterval;
      const speedBoost = settingsRef.current.framerate >= 60 ? 1.72 : settingsRef.current.framerate >= 30 ? 1.22 : 1;
      const deltaFrames = Math.max(0.58, Math.min(2.55, (elapsedMs / 1000) * 60 * speedBoost));
      state.lastFrameAt = now;
      if (canvas.width <= 1 || canvas.height <= 1) resize();
      const settingsSnapshot = settingsRef.current;
      const playingSnapshot = isPlayingRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const ratio = 1;
      const gap = 1;
      const bandCount = Math.max(24, Math.floor((width + gap) / 5));
      const columnWidth = Math.max(2, (width - gap * Math.max(0, bandCount - 1)) / bandCount);

      if (state.bars.length !== bandCount) {
        state.bars = new Array(bandCount).fill(0);
        state.roofs = new Array(bandCount).fill(3);
        state.roofVelocity = new Array(bandCount).fill(32);
        state.roofMemory = Array.from({ length: bandCount }, () => []);
        state.peakSpeed = new Array(bandCount).fill(0.01);
        state.attack = Array.from({ length: bandCount }, (_, index) => 1.22 + (((index * 23) % 13) / 12) * 0.42);
        state.release = Array.from({ length: bandCount }, (_, index) => 0.38 + (((index * 31) % 17) / 16) * 0.28);
        state.bandGain = Array.from({ length: bandCount }, (_, index) => 0.78 + (((index * 29) % 19) / 18) * 0.5);
        state.bandMotion = Array.from({ length: bandCount }, (_, index) => 0.74 + (((index * 41) % 23) / 22) * 0.62);
        state.bandFloor = new Array(bandCount).fill(0);
        state.previousSpectrum = new Array(bandCount).fill(0);
        state.spectrum = new Array(bandCount).fill(0);
      }
      if (state.currentAnalyzer !== settingsSnapshot.analyzer) {
        state.currentAnalyzer = settingsSnapshot.analyzer;
        state.bars.fill(0);
        state.roofs.fill(3);
        state.roofVelocity.fill(32);
        state.peakSpeed.fill(0.01);
      }

      ctx.fillStyle = "#121212";
      ctx.fillRect(0, 0, width, height);
      state.hue = settingsSnapshot.psychedelic ? (state.hue + 0.5) % 360 : 190;

      if (settingsSnapshot.analyzer === "none") {
        schedule();
        return;
      }

      const analyser = analyserGetterRef.current();
      const spectrum = state.spectrum;
      const hasNativeSpectrum = Boolean(nativeSpectrumFetcherRef.current);
      const visualHoldActive = performance.now() < (visualHoldUntilRef.current || 0);
      let hasSpectrumData = false;
      if (playingSnapshot && visualHoldActive) {
        for (let index = 0; index < spectrum.length; index += 1) {
          spectrum[index] *= 0.86;
        }
        hasSpectrumData = spectrum.some((value) => value > 0.01);
      } else if (playingSnapshot && analyser && !hasNativeSpectrum) {
        spectrum.fill(0);
        const raw =
          state.frequencyData && state.frequencyData.length === analyser.frequencyBinCount
            ? state.frequencyData
            : new Uint8Array(analyser.frequencyBinCount);
        state.frequencyData = raw;
        analyser.getByteFrequencyData(raw);
        interpolate(raw, spectrum, analyser);
        hasSpectrumData = true;
      } else if (playingSnapshot && nativeSpectrumFetcherRef.current) {
        requestNativeSpectrum(bandCount);
        hasSpectrumData = useNativeSpectrum(latestNativeSpectrum, spectrum, deltaFrames);
      } else if (playingSnapshot) {
        const seconds = performance.now() * 0.001;
        for (let index = 0; index < bandCount; index += 1) {
          const position = index / Math.max(1, bandCount - 1);
          const bassBias = Math.pow(1 - position, 1.35);
          const pulse =
            Math.abs(Math.sin(seconds * 4.6 + index * 0.31)) * 0.22 +
            Math.abs(Math.sin(seconds * 8.9 + index * 0.13)) * 0.13 +
            Math.abs(Math.sin(seconds * 13.4 + index * 0.071)) * 0.07;
          spectrum[index] = Math.min(0.62, 0.045 + pulse * (0.48 + bassBias * 0.28));
        }
        hasSpectrumData = true;
      } else {
        spectrum.fill(0);
      }
      const hasLiveSpectrum = playingSnapshot && hasSpectrumData;

      const targetHeightForBand = (index: number, maxHeight: number, power = 0.72) => {
        const sharpnessBoost = 0.88 + settingsSnapshot.sharpness * 0.06;
        const source = spectrum[index] || 0;
        const left = spectrum[Math.max(0, index - 1)] || source;
        const right = spectrum[Math.min(bandCount - 1, index + 1)] || source;
        const neighbor = (left + right) * 0.5;
        const motion = state.bandMotion[index] || 1;
        const contrast = Math.max(0, source - neighbor * 0.72);
        const time = now * 0.001;
        const micro =
          source > 0.012
            ? (Math.sin(time * (10.5 + motion * 4.8) + index * 1.91) * 0.011 +
                Math.sin(time * (17.5 + motion * 3.2) + index * 0.67) * 0.007) *
              Math.min(1, source * 3.2)
            : 0;
        const livelySource = Math.max(0, source * (1.04 + motion * 0.12) + contrast * (0.62 + motion * 0.28) + micro);
        const shapedValue = Math.pow(Math.min(1, livelySource * sharpnessBoost), power);
        return Math.min(maxHeight, Math.max(shapedValue > 0.012 ? 1.2 : 0, shapedValue * maxHeight));
      };
      const drawReflection = () => {
        if (!settingsSnapshot.reflection) return;
        const reflectionHeight = Math.floor(height * 0.28);
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.translate(0, height);
        ctx.scale(1, -1);
        ctx.drawImage(canvas, 0, height - reflectionHeight, width, reflectionHeight, 0, 0, width, reflectionHeight);
        ctx.restore();
      };
      const drawPeakTrail = (index: number, x: number, y: number, lineWidth: number, hue: number, alphaScale = 0.5) => {
        const memory = state.roofMemory[index] || [];
        state.roofMemory[index] = memory;
        while (memory.length > 16) memory.shift();
        for (let item = 0; item < memory.length; item += 1) {
          const alpha = (1 - item / 16) * alphaScale;
          ctx.fillStyle = `hsla(${hue}, 100%, 76%, ${alpha})`;
          ctx.fillRect(x, Math.max(0, Math.min(height - 2, memory[item])), lineWidth, 2);
        }
        memory.push(Math.max(0, Math.min(height - 2, y)));
      };

      if (settingsSnapshot.analyzer === "ardali_center_turbine" || settingsSnapshot.analyzer === "ardali_center_turbine_lines") {
        const withLines = settingsSnapshot.analyzer === "ardali_center_turbine_lines";
        const centerY = height * 0.5;
        const centerX = width * 0.5;
        for (let index = 0; index < bandCount; index += 1) {
          const x = index * (columnWidth + gap);
          const distance = Math.min(1, Math.abs(x + columnWidth * 0.5 - centerX) / Math.max(1, centerX));
          const sourceIndex = Math.min(bandCount - 1, Math.floor(Math.pow(distance, 0.86) * (bandCount - 1)));
          const centerLift = 0.5 + Math.pow(1 - distance, 0.72) * 0.64;
          const hue = settingsSnapshot.psychedelic ? (state.hue + distance * 270 + index * 0.35) % 360 : (190 + distance * 95) % 360;
          if (!hasLiveSpectrum) {
            ctx.fillStyle = `hsla(${hue}, 100%, 54%, 0.24)`;
            ctx.fillRect(x, centerY - 2, columnWidth, 4);
            continue;
          }

          const target = targetHeightForBand(sourceIndex, height * 0.43 * centerLift, 0.7);
          const alpha = target > state.bars[index] ? 0.86 : 0.26;
          state.bars[index] += (target - state.bars[index]) * Math.min(1, alpha * deltaFrames);
          const barHeight = Math.min(centerY - 3, state.bars[index]);
          if (withLines) {
            if (barHeight > state.roofs[index]) {
              state.roofs[index] = barHeight;
              state.peakSpeed[index] = 0.01;
            } else {
              state.roofs[index] = Math.max(barHeight, state.roofs[index] - state.peakSpeed[index] * deltaFrames);
              state.peakSpeed[index] *= 1 + 0.11 * deltaFrames;
            }
          }
          const gradient = ctx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight);
          gradient.addColorStop(0, `hsla(${(hue + 52) % 360}, 100%, 70%, 0.96)`);
          gradient.addColorStop(0.5, `hsla(${hue}, 100%, 52%, 0.9)`);
          gradient.addColorStop(1, `hsla(${(hue + 52) % 360}, 100%, 70%, 0.96)`);
          ctx.fillStyle = gradient;
          if (settingsSnapshot.glow) {
            ctx.shadowColor = `hsla(${hue}, 100%, 62%, 0.45)`;
            ctx.shadowBlur = 7;
          }
          ctx.fillRect(x, centerY - barHeight, columnWidth, barHeight * 2);
          ctx.shadowBlur = 0;
          ctx.fillStyle = `hsla(${(hue + 170) % 360}, 100%, 82%, 0.86)`;
          ctx.fillRect(x, centerY - barHeight - 1, columnWidth, 2);
          ctx.fillRect(x, centerY + barHeight - 1, columnWidth, 2);
          if (withLines) {
            const roof = Math.min(centerY - 3, state.roofs[index]);
            drawPeakTrail(index, x, centerY - roof - 2, columnWidth, (hue + 180) % 360, 0.36);
            ctx.fillStyle = `hsla(${(hue + 180) % 360}, 100%, 86%, 0.92)`;
            ctx.fillRect(x, centerY - roof - 2, columnWidth, 2);
            ctx.fillRect(x, centerY + roof, columnWidth, 2);
          }
        }
        ctx.fillStyle = "rgba(130, 245, 255, 0.32)";
        ctx.fillRect(0, centerY, width, 1);
        drawReflection();
        schedule();
        return;
      }

      if (settingsSnapshot.analyzer === "ardali" || settingsSnapshot.analyzer === "ardali_center_peak" || settingsSnapshot.analyzer === "ardali_center_peak_lines") {
        const withLines = settingsSnapshot.analyzer === "ardali" || settingsSnapshot.analyzer === "ardali_center_peak_lines";
        const trailLines = settingsSnapshot.analyzer === "ardali_center_peak_lines";
        const centerX = width * 0.5;
        for (let index = 0; index < bandCount; index += 1) {
          const x = index * (columnWidth + gap);
          const distance = Math.min(1, Math.abs(x + columnWidth * 0.5 - centerX) / Math.max(1, centerX));
          const sourceIndex = Math.min(bandCount - 1, Math.floor(Math.pow(distance, 0.92) * (bandCount - 1)));
          const centerScale = 0.52 + Math.pow(1 - distance, 0.58) * 0.48;
          const hue = settingsSnapshot.psychedelic ? (state.hue + (1 - distance) * 220 + index * 0.22) % 360 : (176 + (1 - distance) * 54) % 360;
          if (!hasLiveSpectrum) {
            ctx.fillStyle = `hsla(${hue}, 100%, 54%, 0.24)`;
            ctx.fillRect(x, height - 4, columnWidth, 4);
            continue;
          }

          const target = targetHeightForBand(sourceIndex, height * 0.96 * centerScale, 0.66);
          const alpha = target > state.bars[index] ? 0.94 : 0.32;
          state.bars[index] += (target - state.bars[index]) * Math.min(1, alpha * deltaFrames);
          const barHeight = Math.max(0, state.bars[index]);
          if (withLines) {
            const lockedBarHeight = Math.min(height - 2, barHeight + 2);
            if (lockedBarHeight >= state.roofs[index]) {
              state.roofs[index] = lockedBarHeight;
              state.peakSpeed[index] = 0.01;
            } else {
              state.roofs[index] = Math.max(lockedBarHeight, state.roofs[index] - state.peakSpeed[index] * deltaFrames);
              state.peakSpeed[index] *= 1 + 0.11 * deltaFrames;
            }
          }
          const y = height - barHeight;
          const gradient = ctx.createLinearGradient(x, height, x, y);
          gradient.addColorStop(0, `hsla(${hue}, 100%, 42%, 0.98)`);
          gradient.addColorStop(0.62, `hsla(${(hue + 36) % 360}, 100%, 54%, 0.96)`);
          gradient.addColorStop(1, `hsla(${(hue + 82) % 360}, 100%, 74%, 0.98)`);
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, columnWidth, barHeight);
          if (settingsSnapshot.glow && distance < 0.22 && barHeight > height * 0.18) {
            ctx.save();
            ctx.shadowColor = `hsla(${hue}, 100%, 62%, 0.65)`;
            ctx.shadowBlur = 10;
            ctx.fillStyle = `hsla(${hue}, 100%, 58%, 0.22)`;
            ctx.fillRect(Math.max(0, x - 1), y, columnWidth + 2, barHeight);
            ctx.restore();
          }
          if (withLines) {
            const roofHeight = Math.min(height - 2, Math.max(barHeight + 2, state.roofs[index]));
            if (trailLines) drawPeakTrail(index, x, height - roofHeight - 2, columnWidth, (hue + 170) % 360, 0.42);
            ctx.fillStyle = `hsla(${(hue + 170) % 360}, 100%, 84%, 0.92)`;
            ctx.fillRect(x, height - roofHeight - 2, columnWidth, 2);
          }
        }
        drawReflection();
        schedule();
        return;
      }

      if (settingsSnapshot.analyzer === "turbine") {
        const centerY = height / 2;
        for (let index = 0; index < bandCount; index += 1) {
          const x = index * (columnWidth + gap);
          const hue = settingsSnapshot.psychedelic ? (state.hue + (index / bandCount) * 360) % 360 : 188;
          if (!hasLiveSpectrum) {
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.30)`;
            ctx.fillRect(x, centerY - 2, columnWidth, 4);
            continue;
          }

          let barHeight = Math.min(targetHeightForBand(index, centerY - 5, 0.74), centerY - 5);
          if (barHeight > 0.35) barHeight = Math.max(barHeight, 2.2);
          if (barHeight > state.bars[index]) {
            state.bars[index] = barHeight;
            if (barHeight > state.roofs[index]) {
              state.roofs[index] = barHeight;
              state.peakSpeed[index] = 0.01;
            }
          } else {
            state.bars[index] = Math.max(0, state.bars[index] - 1.271 * deltaFrames);
          }

          state.roofs[index] = Math.max(0, Math.max(state.bars[index], state.roofs[index] - state.peakSpeed[index] * deltaFrames));
          state.peakSpeed[index] *= 1 + 0.103 * deltaFrames;

          const barHeightValue = state.bars[index];
          if (barHeightValue > 0) {
            const gradient = ctx.createLinearGradient(x, centerY - barHeightValue, x, centerY + barHeightValue);
            if (settingsSnapshot.psychedelic) {
              gradient.addColorStop(0, `hsl(${(hue + 60) % 360}, 100%, 40%)`);
              gradient.addColorStop(0.5, `hsl(${hue}, 100%, 60%)`);
              gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 100%, 40%)`);
            } else {
              gradient.addColorStop(0, "#004466");
              gradient.addColorStop(0.5, "#00aaff");
              gradient.addColorStop(1, "#004466");
            }
            ctx.fillStyle = gradient;
            if (settingsSnapshot.glow) {
              ctx.shadowColor = `hsla(${hue}, 100%, 62%, 0.42)`;
              ctx.shadowBlur = 7;
            }
            ctx.fillRect(x, centerY - barHeightValue, columnWidth, barHeightValue);
            ctx.fillRect(x, centerY, columnWidth, barHeightValue);
            ctx.shadowBlur = 0;
          }

          drawPeakTrail(index, x, centerY - state.roofs[index] - 1, columnWidth, (hue + 180) % 360, 0.36);
          ctx.fillStyle = settingsSnapshot.psychedelic ? `hsl(${(hue + 180) % 360}, 100%, 80%)` : "#88ccff";
          ctx.fillRect(x, centerY - state.roofs[index] - 1, columnWidth, 2);
          ctx.fillRect(x, centerY + state.roofs[index] - 1, columnWidth, 2);
        }
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(0, centerY, width, 1);
        drawReflection();
        schedule();
        return;
      }

      const simplePeakLines = settingsSnapshot.analyzer === "sfx_effects";

      for (let index = 0; index < bandCount; index += 1) {
        const x = index * (columnWidth + gap);
        const hue =
          settingsSnapshot.psychedelic || settingsSnapshot.analyzer === "nyanalyzer"
          ? (state.hue + (index / bandCount) * 360) % 360
          : (190 + (index / bandCount) * 70) % 360;
        if (!hasLiveSpectrum) {
          ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.30)`;
          ctx.fillRect(x, height - 3, columnWidth, 3);
          continue;
        }

        const targetHeight = targetHeightForBand(index, height * 0.92, 0.72);
        const alpha = targetHeight > state.bars[index] ? state.attack[index] || 0.78 : state.release[index] || 0.34;
        state.bars[index] += (targetHeight - state.bars[index]) * Math.min(1, alpha * deltaFrames);
        state.bars[index] = Math.max(0, state.bars[index]);

        ctx.fillStyle =
          settingsSnapshot.psychedelic || settingsSnapshot.analyzer === "nyanalyzer"
            ? `hsl(${hue}, 100%, 54%)`
            : `hsl(${hue}, 96%, ${42 + Math.min(30, state.bars[index] / Math.max(1, height) * 42)}%)`;
        if (settingsSnapshot.glow) {
          ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.38)`;
          ctx.shadowBlur = 7;
        }
        ctx.fillRect(x, height - state.bars[index], columnWidth, state.bars[index]);
        ctx.shadowBlur = 0;
        if (state.bars[index] > state.roofs[index]) {
          state.roofs[index] = state.bars[index];
          state.roofVelocity[index] = 1;
        }
        const roofHeight = state.roofs[index];
        const roofY = Math.max(0, height - roofHeight - 2);
        if (!simplePeakLines) drawPeakTrail(index, x, roofY, columnWidth, (hue + 180) % 360, 0.5);
        ctx.fillStyle = `hsl(${(hue + 180) % 360}, 100%, 80%)`;
        ctx.fillRect(x, roofY, columnWidth, 2);
        state.roofVelocity[index] += 1.9 * deltaFrames;
        if (state.roofVelocity[index] > 32) {
          state.roofs[index] = Math.max(0, state.roofs[index] - ((state.roofVelocity[index] - 32) / 12) * deltaFrames);
        }
      }

      drawReflection();

      schedule();
    };

    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const toggleProjectM = async () => {
    if (projectMRunning) {
      await invoke("stop_projectm_visualizer").catch((error) => reportClientError("projectm.stop", error));
      setProjectMRunning(false);
      return;
    }
    onOpenProjectM();
    setProjectMRunning(true);
  };

  return (
    <div className="player-spectrum-wrap">
      <canvas
        ref={canvasRef}
        className="player-spectrum-canvas"
        aria-label="Görselleştirici"
        onContextMenu={openMenu}
      />
      {menuPosition ? (
        <div
          className="visualizer-context-menu"
          style={{ left: menuPosition.x, top: menuPosition.y } as React.CSSProperties}
          onClick={(event) => event.stopPropagation()}
        >
          <button className={`visualizer-menu-item ${projectMRunning ? "checked" : ""}`} type="button" onClick={() => void toggleProjectM()}>
            <span className="visualizer-menu-checkbox" />
            <span>ArDali Görselleştirici</span>
          </button>
          <div className="visualizer-menu-separator" />
          <div className="visualizer-menu-item has-submenu">
            <span className="visualizer-menu-label">Kare oranı</span>
            <span className="visualizer-submenu-arrow">›</span>
            <div className="visualizer-context-submenu">
              {visualizerFramerates.map((item) => (
                <button
                  className={`visualizer-menu-item ${settings.framerate === item.value ? "active text-only" : ""}`}
                  key={item.value}
                  type="button"
                  onClick={() => {
                    updateSettings((current) => ({ ...current, framerate: item.value }));
                    setMenuPosition(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="visualizer-menu-separator" />
          {visualizerAnalyzers.map((item) => (
            <button
              className={`visualizer-menu-item ${settings.analyzer === item.id ? "active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => {
                updateSettings((current) => ({ ...current, analyzer: item.id }));
                setMenuPosition(null);
              }}
            >
              <span className="visualizer-menu-radio" />
              <span className="visualizer-menu-label">{item.label}</span>
            </button>
          ))}
          <div className="visualizer-menu-separator" />
          <button
            className={`visualizer-menu-item ${settings.psychedelic ? "checked" : ""}`}
            type="button"
            onClick={() => updateSettings((current) => ({ ...current, psychedelic: !current.psychedelic }))}
          >
            <span className="visualizer-menu-checkbox" />
            <span className="visualizer-menu-label">Psikedelik renkleri kullan</span>
          </button>
          <div className="visualizer-menu-separator" />
          <div className="visualizer-menu-item has-submenu">
            <span className="visualizer-menu-label">Görseller</span>
            <span className="visualizer-submenu-arrow">›</span>
            <div className="visualizer-context-submenu">
              <button
                className={`visualizer-menu-item ${settings.glow ? "checked" : ""}`}
                type="button"
                onClick={() => updateSettings((current) => ({ ...current, glow: !current.glow }))}
              >
                <span className="visualizer-menu-checkbox" />
                <span>Parıltı efekti</span>
              </button>
              <button
                className={`visualizer-menu-item ${settings.reflection ? "checked" : ""}`}
                type="button"
                onClick={() => updateSettings((current) => ({ ...current, reflection: !current.reflection }))}
              >
                <span className="visualizer-menu-checkbox" />
                <span>Yansıma</span>
              </button>
              <div className="visualizer-menu-separator" />
              <div className="visualizer-menu-item has-submenu">
                <span>Netlik</span>
                <span className="visualizer-submenu-arrow">›</span>
                <div className="visualizer-context-submenu">
                  {visualizerSharpness.map((item) => (
                    <button
                      className={`visualizer-menu-item ${settings.sharpness === item.value ? "active text-only" : ""}`}
                      key={item.value}
                      type="button"
                      onClick={() => {
                        updateSettings((current) => ({ ...current, sharpness: item.value }));
                        setMenuPosition(null);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
