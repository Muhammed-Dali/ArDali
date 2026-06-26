import { invoke } from "@tauri-apps/api/core";
import { DALI_WEB_EQ32_ENGINE_JS } from "./generated/daliWebEq32";
import { loadWebSettings } from "./webSettings";

export type WebPlatform = {
  id: string;
  name: string;
  url: string;
  icon: string;
};

export const WEB_SIDEBAR_WIDTH = 64;
export const WEB_TITLEBAR_HEIGHT = 0;
export const WEB_PLATFORM_TOOLBAR_HEIGHT = 53;
export const WEB_TOOLBAR_HEIGHT = WEB_TITLEBAR_HEIGHT + WEB_PLATFORM_TOOLBAR_HEIGHT;

export const platforms: WebPlatform[] = [
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com", icon: "youtube.svg" },
  { id: "ytmusic", name: "YouTube Music", url: "https://music.youtube.com", icon: "ytmusic.svg" },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com", icon: "spotify.svg" },
  { id: "deezer", name: "Deezer", url: "https://deezer.com", icon: "deezer.svg" },
  { id: "facebook", name: "Facebook", url: "https://facebook.com", icon: "facebook.svg" },
  { id: "instagram", name: "Instagram", url: "https://instagram.com", icon: "instagram.svg" },
  { id: "tiktok", name: "TikTok", url: "https://tiktok.com", icon: "tiktok.svg" },
  { id: "telegram", name: "Telegram", url: "https://web.telegram.org", icon: "telegram.svg" },
  { id: "twitter", name: "X", url: "https://x.com", icon: "twitter.svg" },
];

function readWebStageBounds() {
  const stage = document.querySelector<HTMLElement>(".web-stage");
  const rect = stage?.getBoundingClientRect();

  if (rect && rect.width > 20 && rect.height > 20) {
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  return {
    x: WEB_SIDEBAR_WIDTH,
    y: WEB_TOOLBAR_HEIGHT,
    width: Math.max(1, window.innerWidth - WEB_SIDEBAR_WIDTH),
    height: Math.max(1, window.innerHeight - WEB_TOOLBAR_HEIGHT),
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function getStableWebStageBounds() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await nextFrame();
    const stage = document.querySelector<HTMLElement>(".web-stage");
    const rect = stage?.getBoundingClientRect();
    if (rect && rect.width > 20 && rect.height > 20) break;
  }

  return readWebStageBounds();
}

export async function openPlatform(url: string) {
  const bounds = await getStableWebStageBounds();
  const settings = loadWebSettings();

  await invoke("open_web_platform_in_rect", {
    platformUrl: url,
    privateMode: settings.privateMode || !settings.persistentSession,
    userAgentMode: settings.userAgentMode,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}

export async function hideWeb(label: string) {
  await invoke("hide_web_view", { label });
}

export async function hideAllWeb() {
  await invoke("hide_all_web_views");
}

export async function parkWeb(label: string) {
  await invoke("park_web_view", { label });
}

export async function navigateWebHistory(label: string, direction: "back" | "forward") {
  await invoke("navigate_web_history", { label, direction });
}

export async function reloadWeb(label: string) {
  await invoke("reload_web_view", { label });
}

export type WebDaliPayload = {
  effectsEnabled?: boolean;
  eqGains?: number[];
  dspSettings?: Record<string, unknown>;
};

function webDaliInjectionScript(payload: WebDaliPayload) {
  const payloadJson = JSON.stringify(payload ?? {});
  const compiledEngineCode = DALI_WEB_EQ32_ENGINE_JS;
  return `
(() => {
try {
  const payload = ${payloadJson};
  const clamp = (value, min, max, fallback = 0) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return fallback;
    return Math.max(min, Math.min(max, next));
  };
  const dbToGain = (db) => Math.pow(10, db / 20);
  const freqs = [20,25,31,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,18000,20000];
  const root = window.__ARDALI_DALI_WEB__ || {};
  const currentHost = String(window.location && window.location.hostname ? window.location.hostname : "").toLowerCase();
  const isShortVideoPlatform = /(^|\\.)tiktok\\.com$|(^|\\.)instagram\\.com$|(^|\\.)facebook\\.com$/.test(currentHost);
  const engineProfile = isShortVideoPlatform ? "stable-stream" : "realtime";
  if (!root.graphs) root.graphs = new WeakMap();
  if (!root.graphRefs) root.graphRefs = new Set();
  const cfg = {
    enabled: payload.effectsEnabled !== false,
    eqGains: Array.isArray(payload.eqGains) ? payload.eqGains.slice(0, 32).map((value) => clamp(value, -12, 12, 0)) : freqs.map(() => 0),
    dsp: payload.dspSettings && typeof payload.dspSettings === "object" ? payload.dspSettings : {},
  };
  const hasMeaningfulProcessing = (() => {
    const dsp = cfg.dsp || {};
    if (!cfg.enabled) return false;
    if (cfg.eqGains.some((value) => Math.abs(Number(value) || 0) > 0.05)) return true;
    if (Math.abs(Number(dsp.preampDb) || 0) > 0.05) return true;
    if (Math.abs(Number(dsp.midGain) || 0) > 0.05 || Math.abs(Number(dsp.trebleGain) || 0) > 0.05) return true;
    if (dsp.bassBoostEnabled !== false && Math.abs(Number(dsp.bassBoost) || 0) > 0.05) return true;
    if (dsp.peqEnabled || dsp.dynamicEqEnabled || dsp.deesserEnabled || dsp.autoGainEnabled || dsp.noiseGateEnabled) return true;
    if (dsp.compressorEnabled || dsp.limiterEnabled || dsp.truePeakEnabled) return true;
    if (dsp.exciterEnabled || dsp.echoEnabled || dsp.reverbEnabled || dsp.convReverbEnabled) return true;
    if (dsp.crossfeedEnabled || dsp.surroundEnabled || dsp.bassMonoEnabled || dsp.stereoWidenerEnabled) return true;
    if (dsp.tapeSaturationEnabled || dsp.bitDitherEnabled) return true;
    if (Math.abs(Number(dsp.balance) || 0) > 0.05) return true;
    return false;
  })();
  if (isShortVideoPlatform && !hasMeaningfulProcessing) {
    Array.from(root.graphRefs || []).forEach((graph) => {
      try {
        if (graph && graph.master && graph.master.gain) {
          const mediaVolume = graph.media && !graph.media.muted ? clamp(graph.media.volume, 0, 1, 1) : 0;
          graph.master.gain.value = mediaVolume;
          graph.suspendedByArDali = false;
        }
      } catch (_) {}
    });
    root.lastPayload = cfg;
    root.shortVideoBypass = true;
    window.__ARDALI_DALI_WEB__ = root;
    try {
      console.info("[ArDali DALI WEB]", JSON.stringify({
        ok: true,
        connected: 0,
        bypass: "short-video-native-audio",
        totalMediaCount: document.querySelectorAll("video, audio").length,
        host: currentHost,
      }));
    } catch (_) {}
    return {
      ok: true,
      connected: 0,
      bypass: "short-video-native-audio",
      totalMediaCount: document.querySelectorAll("video, audio").length,
      contextState: root.context ? root.context.state : "not-created",
    };
  }
  const bootMediaElements = Array.from(document.querySelectorAll("video, audio"));
  const hasPlaybackCandidate = bootMediaElements.some((media) => {
    const ready = Number(media && media.readyState || 0);
    const currentTime = Number(media && media.currentTime || 0);
    const volume = Number(media && media.volume);
    return ready >= 2 && !media.paused && !media.muted && volume > 0 && currentTime >= 0;
  });
  if (isShortVideoPlatform && !hasPlaybackCandidate) {
    root.lastPayload = payload;
    root.deferredUntilPlayback = true;
    window.__ARDALI_DALI_WEB__ = root;
    try {
      console.info("[ArDali DALI WEB]", JSON.stringify({
        ok: true,
        connected: 0,
        deferred: "waiting-for-short-video-playback",
        totalMediaCount: bootMediaElements.length,
        host: currentHost,
      }));
    } catch (_) {}
    return {
      ok: true,
      connected: 0,
      deferred: "waiting-for-short-video-playback",
      totalMediaCount: bootMediaElements.length,
      contextState: root.context ? root.context.state : "not-created",
    };
  }
  if (!root.context) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return { ok: false, error: "audio-context-unavailable" };
    root.context = new AudioContextCtor({ latencyHint: isShortVideoPlatform ? "playback" : "interactive" });
    root.contextProfile = engineProfile;
  }
  if (!root.gestureListenersRegistered) {
    root.gestureListenersRegistered = true;
    const resumeCtx = () => {
      if (root.context && root.context.state === "suspended") {
        root.context.resume().catch(() => {});
      }
    };
    ["click", "pointerdown", "keydown", "touchstart"].forEach((event) => {
      document.addEventListener(event, resumeCtx, { capture: true, passive: true });
    });
  }
  window.__ARDALI_DALI_WEB__ = root;

  const context = root.context;
  if (!root.daliModule) {
    const module = { exports: {} };
    const exports = module.exports;
    ${compiledEngineCode}
    root.daliModule = module.exports;
  }
  if (!root.daliModule || typeof root.daliModule.buildGraph !== "function") {
    root.lastError = "compiled-dali-buildGraph-unavailable";
    return { ok: false, connected: 0, error: root.lastError };
  }

  const collectDaliNodes = (daliGraph) => {
    const chain = Array.isArray(daliGraph && daliGraph.nodes && daliGraph.nodes.chain) ? daliGraph.nodes.chain : [];
    const preamp = chain.find((item) => item && item.effect === "preamp" && item.node && item.node.gain)?.node || null;
    const bands = chain
      .filter((item) => item && item.effect === "peaking" && item.node && item.node.gain && item.node.frequency)
      .map((item) => item.node);
    const limiter = [...chain].reverse().find((item) => item && item.effect === "limiter" && item.node && item.node.threshold)?.node || null;
    return { preamp, bands, limiter };
  };

  const percentToMix = (value, fallback = 0) => clamp(value, 0, 100, fallback) / 100;
  const msToSeconds = (value, fallback = 0.1) => clamp(value, 1, 4000, fallback * 1000) / 1000;
  const makeDriveCurve = (amount, mode = 0) => {
    const curve = new Float32Array(2048);
    const drive = 1 + clamp(amount, 0, 36, 0) / 5;
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = mode === 1 ? Math.sin(Math.tanh(x * drive) * Math.PI / 2) : Math.tanh(x * drive);
    }
    return curve;
  };
  const makeExciterCurve = (amount, harmonics) => {
    const curve = new Float32Array(2048);
    const drive = 1 + clamp(amount, 0, 100, 0) / 18;
    const odd = harmonics !== "even";
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      const shaped = Math.tanh(x * drive);
      curve[i] = odd ? shaped : shaped + 0.08 * Math.sin(x * x * Math.PI * drive);
    }
    return curve;
  };
  const makeBitCurve = (bits, mix) => {
    const curve = new Float32Array(2048);
    const safeBits = Math.round(clamp(bits, 4, 24, 16));
    const levels = Math.pow(2, safeBits - 1);
    const wet = percentToMix(mix, 100);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      const quantized = Math.round(x * levels) / levels;
      curve[i] = x * (1 - wet) + quantized * wet;
    }
    return curve;
  };

  const flattenAudioNodes = (value, out = [], seen = new Set()) => {
    if (!value) return out;
    if ((typeof value === "object" || typeof value === "function") && seen.has(value)) return out;
    if (typeof value === "object" || typeof value === "function") seen.add(value);
    if (typeof value.disconnect === "function") {
      if (!out.includes(value)) out.push(value);
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => flattenAudioNodes(item, out, seen));
      return out;
    }
    if (value === window || value === document || value.nodeType || value instanceof AudioParam) return out;
    if (typeof value === "object") {
      Object.values(value).forEach((item) => flattenAudioNodes(item, out, seen));
    }
    return out;
  };

  const disconnectGraph = (graph) => {
    if (!graph) return;
    try {
      if (graph.daliGraph && typeof graph.daliGraph.disconnect === "function") graph.daliGraph.disconnect();
    } catch (_) {}
    try {
      if (graph.bitNoiseSource && typeof graph.bitNoiseSource.stop === "function") graph.bitNoiseSource.stop();
    } catch (_) {}
    flattenAudioNodes(graph).forEach((node) => {
      try { node.disconnect(); } catch (_) {}
    });
    if (graph.media) {
      try { root.graphs.delete(graph.media); } catch (_) {}
    }
    try { root.graphRefs.delete(graph); } catch (_) {}
  };

  const suspendGraph = (graph) => {
    if (!graph || !graph.master || !graph.master.gain) return;
    try {
      const now = context && Number.isFinite(context.currentTime) ? context.currentTime : 0;
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setTargetAtTime(0, now, 0.015);
      graph.suspendedByArDali = true;
    } catch (_) {}
  };

  const cleanupGraphs = (selectedMedia, forceInactive = false) => {
    const selected = new Set(selectedMedia);
    Array.from(root.graphRefs || []).forEach((graph) => {
      const media = graph && graph.media;
      if (!media || !document.documentElement.contains(media)) {
        disconnectGraph(graph);
        return;
      }
      const shouldKeep = selected.has(media) || (!forceInactive && isActiveMedia(media));
      if (!shouldKeep) suspendGraph(graph);
    });
  };

  const makeGraph = (media) => {
    const existing = root.graphs.get(media);
    if (existing) return existing;
    if (!cfg.enabled) return null;
    const source = context.createMediaElementSource(media);
    const daliInput = context.createGain();
    const daliOutput = context.createGain();
    const daliGraph = root.daliModule.buildGraph(context, daliInput, daliOutput);
    const daliNodes = collectDaliNodes(daliGraph);
    const bassShelf = context.createBiquadFilter();
    bassShelf.type = "lowshelf";
    bassShelf.frequency.value = 90;
    bassShelf.gain.value = 0;
    const midPeak = context.createBiquadFilter();
    midPeak.type = "peaking";
    midPeak.frequency.value = 1100;
    midPeak.Q.value = 0.9;
    midPeak.gain.value = 0;
    const trebleShelf = context.createBiquadFilter();
    trebleShelf.type = "highshelf";
    trebleShelf.frequency.value = 7200;
    trebleShelf.gain.value = 0;
    const peqFilters = Array.from({ length: 6 }, () => {
      const filter = context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = 1000;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    const dynamicEq = context.createBiquadFilter();
    dynamicEq.type = "peaking";
    dynamicEq.frequency.value = 2500;
    dynamicEq.Q.value = 1;
    dynamicEq.gain.value = 0;
    const deesser = context.createBiquadFilter();
    deesser.type = "peaking";
    deesser.frequency.value = 7000;
    deesser.Q.value = 3.5;
    deesser.gain.value = 0;
    const bassMono = context.createBiquadFilter();
    bassMono.type = "lowshelf";
    bassMono.frequency.value = 120;
    bassMono.gain.value = 0;
    const autoGain = context.createGain();
    const noiseGate = context.createGain();

    const exciterInput = context.createGain();
    const exciterDry = context.createGain();
    const exciterHighpass = context.createBiquadFilter();
    exciterHighpass.type = "highpass";
    exciterHighpass.frequency.value = 3000;
    const exciterDrive = context.createGain();
    const exciterShaper = context.createWaveShaper();
    const exciterTone = context.createBiquadFilter();
    exciterTone.type = "highshelf";
    exciterTone.frequency.value = 6500;
    const exciterWet = context.createGain();
    const exciterOutput = context.createGain();
    exciterInput.connect(exciterDry);
    exciterDry.connect(exciterOutput);
    exciterInput.connect(exciterHighpass);
    exciterHighpass.connect(exciterDrive);
    exciterDrive.connect(exciterShaper);
    exciterShaper.connect(exciterTone);
    exciterTone.connect(exciterWet);
    exciterWet.connect(exciterOutput);

    const compressor = context.createDynamicsCompressor();
    const compressorMakeup = context.createGain();
    const ambienceInput = context.createGain();
    const ambienceDry = context.createGain();
    const ambienceOutput = context.createGain();
    const echoDelay = context.createDelay(2);
    const echoFeedback = context.createGain();
    const echoTone = context.createBiquadFilter();
    echoTone.type = "lowpass";
    echoTone.frequency.value = 8000;
    const echoWet = context.createGain();
    const reverbDelay = context.createDelay(4);
    const reverbFeedback = context.createGain();
    const reverbTone = context.createBiquadFilter();
    reverbTone.type = "lowpass";
    reverbTone.frequency.value = 6500;
    const reverbWet = context.createGain();
    ambienceInput.connect(ambienceDry);
    ambienceDry.connect(ambienceOutput);
    ambienceInput.connect(echoDelay);
    echoDelay.connect(echoTone);
    echoTone.connect(echoWet);
    echoWet.connect(ambienceOutput);
    echoTone.connect(echoFeedback);
    echoFeedback.connect(echoDelay);
    ambienceInput.connect(reverbDelay);
    reverbDelay.connect(reverbTone);
    reverbTone.connect(reverbWet);
    reverbWet.connect(ambienceOutput);
    reverbTone.connect(reverbFeedback);
    reverbFeedback.connect(reverbDelay);

    const tapeInput = context.createGain();
    const tapeDry = context.createGain();
    const tapeShaper = context.createWaveShaper();
    const tapeTone = context.createBiquadFilter();
    tapeTone.type = "lowpass";
    tapeTone.frequency.value = 12000;
    const tapeWet = context.createGain();
    const tapeOutput = context.createGain();
    tapeInput.connect(tapeDry);
    tapeDry.connect(tapeOutput);
    tapeInput.connect(tapeShaper);
    tapeShaper.connect(tapeTone);
    tapeTone.connect(tapeWet);
    tapeWet.connect(tapeOutput);

    const bitShaper = context.createWaveShaper();
    const bitDownsampleFilter = context.createBiquadFilter();
    bitDownsampleFilter.type = "lowpass";
    bitDownsampleFilter.frequency.value = 20000;
    const bitOutput = context.createGain();
    const bitNoiseGain = context.createGain();
    let bitNoiseSource = null;
    try {
      const noiseBuffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * 0.5)), context.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      noise.connect(bitNoiseGain);
      bitNoiseGain.connect(bitOutput);
      noise.start();
      bitNoiseSource = noise;
    } catch (_) {}
    const limiterInputGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.ratio.value = 20;
    limiter.knee.value = 0;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.06;
    const truePeakDrive = context.createGain();
    const truePeakLimiter = context.createDynamicsCompressor();
    truePeakLimiter.ratio.value = 30;
    truePeakLimiter.knee.value = 0;
    truePeakLimiter.attack.value = 0.001;
    truePeakLimiter.release.value = 0.05;
    const stereoInput = context.createGain();
    const stereoOutput = context.createGain();
    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(2);
    const leftDirect = context.createGain();
    const rightDirect = context.createGain();
    const crossLeftDelay = context.createDelay(0.05);
    const crossRightDelay = context.createDelay(0.05);
    const crossLeftHp = context.createBiquadFilter();
    const crossRightHp = context.createBiquadFilter();
    const crossLeftLp = context.createBiquadFilter();
    const crossRightLp = context.createBiquadFilter();
    const crossLeftGain = context.createGain();
    const crossRightGain = context.createGain();
    crossLeftHp.type = "highpass";
    crossRightHp.type = "highpass";
    crossLeftLp.type = "lowpass";
    crossRightLp.type = "lowpass";
    const surroundLeftDelay = context.createDelay(0.08);
    const surroundRightDelay = context.createDelay(0.08);
    const surroundLeftGain = context.createGain();
    const surroundRightGain = context.createGain();
    const bassMonoLow = context.createBiquadFilter();
    bassMonoLow.type = "lowpass";
    bassMonoLow.frequency.value = 120;
    const bassMonoSum = context.createGain();
    const bassMonoGain = context.createGain();
    const width = context.createGain();
    stereoInput.connect(splitter);
    splitter.connect(leftDirect, 0);
    splitter.connect(rightDirect, 1);
    leftDirect.connect(merger, 0, 0);
    rightDirect.connect(merger, 0, 1);
    splitter.connect(crossLeftDelay, 0);
    crossLeftDelay.connect(crossLeftHp);
    crossLeftHp.connect(crossLeftLp);
    crossLeftLp.connect(crossLeftGain);
    crossLeftGain.connect(merger, 0, 1);
    splitter.connect(crossRightDelay, 1);
    crossRightDelay.connect(crossRightHp);
    crossRightHp.connect(crossRightLp);
    crossRightLp.connect(crossRightGain);
    crossRightGain.connect(merger, 0, 0);
    splitter.connect(surroundLeftDelay, 0);
    surroundLeftDelay.connect(surroundLeftGain);
    surroundLeftGain.connect(merger, 0, 1);
    splitter.connect(surroundRightDelay, 1);
    surroundRightDelay.connect(surroundRightGain);
    surroundRightGain.connect(merger, 0, 0);
    splitter.connect(bassMonoSum, 0);
    splitter.connect(bassMonoSum, 1);
    bassMonoSum.connect(bassMonoLow);
    bassMonoLow.connect(bassMonoGain);
    bassMonoGain.connect(merger, 0, 0);
    bassMonoGain.connect(merger, 0, 1);
    merger.connect(stereoOutput);
    const panner = context.createStereoPanner ? context.createStereoPanner() : null;
    const master = context.createGain();
    master.gain.value = 0;
    const rawAnalyser = context.createAnalyser();
    rawAnalyser.fftSize = 2048;
    rawAnalyser.smoothingTimeConstant = 0.68;
    rawAnalyser.minDecibels = -92;
    rawAnalyser.maxDecibels = -8;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;

    source.connect(rawAnalyser);
    source.connect(daliInput);
    let node = daliOutput;
    [
      bassShelf,
      midPeak,
      trebleShelf,
      ...peqFilters,
      dynamicEq,
      deesser,
      bassMono,
      autoGain,
      noiseGate,
      exciterInput,
    ].forEach((next) => {
      node.connect(next);
      node = next;
    });
    node = exciterOutput;
    [compressor, compressorMakeup, ambienceInput].forEach((next) => {
      node.connect(next);
      node = next;
    });
    node = ambienceOutput;
    [tapeInput].forEach((next) => {
      node.connect(next);
      node = next;
    });
    node = tapeOutput;
    [bitShaper, bitDownsampleFilter, bitOutput, limiterInputGain, limiter, truePeakDrive, truePeakLimiter, stereoInput].forEach((next) => {
      node.connect(next);
      node = next;
    });
    node = stereoOutput;
    [width, ...(panner ? [panner] : []), master, analyser, context.destination].forEach((next) => {
      node.connect(next);
      node = next;
    });

    const graph = {
      media,
      source,
      daliInput,
      daliOutput,
      daliGraph,
      daliNodes,
      bassShelf,
      midPeak,
      trebleShelf,
      peqFilters,
      dynamicEq,
      deesser,
      bassMono,
      autoGain,
      noiseGate,
      exciterHighpass,
      exciterDrive,
      exciterShaper,
      exciterTone,
      exciterDry,
      exciterWet,
      compressor,
      compressorMakeup,
      ambienceDry,
      echoDelay,
      echoFeedback,
      echoTone,
      echoWet,
      reverbDelay,
      reverbFeedback,
      reverbTone,
      reverbWet,
      tapeDry,
      tapeShaper,
      tapeTone,
      tapeWet,
      tapeOutput,
      bitShaper,
      bitDownsampleFilter,
      bitOutput,
      bitNoiseGain,
      bitNoiseSource,
      limiterInputGain,
      limiter,
      truePeakDrive,
      truePeakLimiter,
      leftDirect,
      rightDirect,
      crossLeftDelay,
      crossRightDelay,
      crossLeftHp,
      crossRightHp,
      crossLeftLp,
      crossRightLp,
      crossLeftGain,
      crossRightGain,
      surroundLeftDelay,
      surroundRightDelay,
      surroundLeftGain,
      surroundRightGain,
      bassMonoLow,
      bassMonoGain,
      width,
      panner,
      master,
      rawAnalyser,
      analyser,
      warmUpUntil: 0,
    };
    root.graphs.set(media, graph);
    root.graphRefs.add(graph);
    return graph;
  };

  const applyGraph = (graph) => {
    const now = context.currentTime;
    const dsp = cfg.dsp;
    const enabled = cfg.enabled;
    const headroom = cfg.eqGains.reduce((sum, value) => sum + Math.max(0, value), 0) * 0.018;
    const preampDb = enabled ? clamp(dsp.preampDb, -24, 24, 0) - headroom : 0;
    if (graph.daliNodes.preamp) graph.daliNodes.preamp.gain.setTargetAtTime(dbToGain(preampDb), now, 0.012);
    graph.daliNodes.bands.forEach((filter, index) => {
      filter.gain.setTargetAtTime(enabled ? cfg.eqGains[index] || 0 : 0, now, 0.012);
    });
    if (graph.daliNodes.limiter) graph.daliNodes.limiter.threshold.setTargetAtTime(enabled ? -0.8 : 0, now, 0.012);
    const bassGain = enabled && dsp.bassBoostEnabled !== false ? clamp(dsp.bassBoost, 0, 18, 0) * percentToMix(dsp.bassMix, 100) : 0;
    graph.bassShelf.frequency.setTargetAtTime(clamp(dsp.bassFrequency, 35, 240, 80), now, 0.018);
    graph.bassShelf.gain.setTargetAtTime(bassGain, now, 0.018);
    graph.midPeak.gain.setTargetAtTime(enabled ? clamp(dsp.midGain, -12, 12, 0) : 0, now, 0.018);
    graph.trebleShelf.gain.setTargetAtTime(enabled ? clamp(dsp.trebleGain, -12, 12, 0) : 0, now, 0.018);

    graph.peqFilters.forEach((filter, index) => {
      const band = Array.isArray(dsp.peqBands) ? dsp.peqBands[index] : null;
      filter.frequency.setTargetAtTime(clamp(band && band.freq, 20, 20000, 1000), now, 0.018);
      filter.Q.setTargetAtTime(clamp(band && band.q, 0.1, 18, 1), now, 0.018);
      filter.gain.setTargetAtTime(enabled && dsp.peqEnabled ? clamp(band && band.gain, -18, 18, 0) : 0, now, 0.018);
    });

    graph.dynamicEq.frequency.setTargetAtTime(clamp(dsp.dynamicEqFrequency, 40, 18000, 2500), now, 0.018);
    graph.dynamicEq.Q.setTargetAtTime(clamp(dsp.dynamicEqQ, 0.1, 12, 1), now, 0.018);
    const dynamicGain = enabled && dsp.dynamicEqEnabled ? clamp(dsp.dynamicEqGain, -18, 18, 0) * percentToMix(dsp.dynamicEqRange, 60) : 0;
    graph.dynamicEq.gain.setTargetAtTime(dynamicGain, now, 0.018);

    graph.deesser.frequency.setTargetAtTime(clamp(dsp.deesserFrequency, 2500, 14000, 7000), now, 0.018);
    graph.deesser.Q.setTargetAtTime(clamp(dsp.deesserRatio, 1, 12, 4), now, 0.018);
    const deessReduction = enabled && dsp.deesserEnabled ? -Math.abs(clamp(dsp.deesserRange, -24, 0, -8)) : 0;
    graph.deesser.gain.setTargetAtTime(deessReduction, now, 0.018);

    const bassMonoCut = clamp(dsp.bassMonoCutoff, 40, 300, 120);
    graph.bassMono.frequency.setTargetAtTime(bassMonoCut, now, 0.018);
    graph.bassMono.gain.setTargetAtTime(enabled && dsp.bassMonoEnabled ? clamp(100 - clamp(dsp.bassMonoWidth, 0, 200, 100), 0, 140, 0) * 0.028 : 0, now, 0.018);

    const autoGainDb = enabled && dsp.autoGainEnabled ? Math.min(clamp(dsp.autoGainMaxGain, 0, 24, 12), Math.max(0, -clamp(dsp.autoGainTargetLevel, -30, -6, -14) - 14) * 0.9) : 0;
    graph.autoGain.gain.setTargetAtTime(dbToGain(autoGainDb), now, 0.025);

    const gateDb = enabled && dsp.noiseGateEnabled ? clamp(dsp.noiseGateRange, -90, 0, -80) * Math.max(0, Math.min(0.25, (clamp(dsp.noiseGateThreshold, -90, -10, -40) + 90) / 320)) : 0;
    graph.noiseGate.gain.setTargetAtTime(dbToGain(gateDb), now, msToSeconds(dsp.noiseGateAttack, 0.005));

    graph.exciterHighpass.frequency.setTargetAtTime(clamp(dsp.exciterFrequency, 1000, 12000, 3000), now, 0.018);
    graph.exciterDrive.gain.setTargetAtTime(enabled && dsp.exciterEnabled ? 1 + clamp(dsp.exciterAmount, 0, 100, 50) / 35 : 1, now, 0.018);
    graph.exciterShaper.curve = makeExciterCurve(enabled && dsp.exciterEnabled ? dsp.exciterAmount : 0, dsp.exciterHarmonics);
    graph.exciterTone.gain.setTargetAtTime(enabled && dsp.exciterEnabled ? clamp(dsp.exciterAmount, 0, 100, 50) / 16 : 0, now, 0.018);
    const exciterMix = enabled && dsp.exciterEnabled ? percentToMix(dsp.exciterMix, 30) : 0;
    graph.exciterDry.gain.setTargetAtTime(1 - exciterMix * 0.35, now, 0.018);
    graph.exciterWet.gain.setTargetAtTime(exciterMix, now, 0.018);

    const compEnabled = enabled && dsp.compressorEnabled;
    const compAmount = enabled ? clamp(dsp.compressor, 0, 1, 0) : 0;
    graph.compressor.threshold.setTargetAtTime(compEnabled ? clamp(dsp.compressorThreshold, -60, 0, -24) : -24 * compAmount, now, 0.018);
    graph.compressor.ratio.setTargetAtTime(compEnabled ? clamp(dsp.compressorRatio, 1, 20, 3) : 1 + compAmount * 5, now, 0.018);
    graph.compressor.attack.setTargetAtTime(compEnabled ? msToSeconds(dsp.compressorAttack, 0.008) : 0.004 + compAmount * 0.018, now, 0.018);
    graph.compressor.release.setTargetAtTime(compEnabled ? msToSeconds(dsp.compressorRelease, 0.12) : 0.08 + compAmount * 0.22, now, 0.018);
    graph.compressorMakeup.gain.setTargetAtTime(dbToGain(compEnabled ? clamp(dsp.compressorMakeupGain, -12, 18, 0) : 0), now, 0.018);

    const echoMix = enabled && dsp.echoEnabled ? percentToMix(dsp.echoMix, 30) : 0;
    graph.ambienceDry.gain.setTargetAtTime(1, now, 0.018);
    graph.echoDelay.delayTime.setTargetAtTime(msToSeconds(dsp.echoDelay, 0.25), now, 0.018);
    graph.echoFeedback.gain.setTargetAtTime(echoMix > 0 ? Math.min(0.84, percentToMix(dsp.echoFeedback, 35) * (dsp.echoSoftMode ? 0.72 : 0.9)) : 0, now, 0.018);
    graph.echoTone.frequency.setTargetAtTime(clamp(dsp.echoHighCut, 1000, 18000, 8000), now, 0.018);
    graph.echoWet.gain.setTargetAtTime(echoMix * (dsp.echoSoftMode ? 0.6 : 0.8), now, 0.018);

    const reverbWet = enabled && dsp.reverbEnabled ? Math.max(0, Math.min(0.55, (clamp(dsp.reverbWetDry, -60, 12, -12) + 60) / 130)) : 0;
    const convWet = enabled && dsp.convReverbEnabled ? percentToMix(dsp.convReverbMix, 30) * 0.45 : 0;
    const room = clamp(dsp.reverbRoomSize, 80, 4000, 900);
    graph.reverbDelay.delayTime.setTargetAtTime(msToSeconds((dsp.convReverbEnabled ? dsp.convReverbPredelay : 0) + Math.min(900, room * 0.16), 0.14), now, 0.025);
    graph.reverbFeedback.gain.setTargetAtTime(Math.min(0.82, (room / 5000) + Math.max(reverbWet, convWet) * 0.35), now, 0.025);
    graph.reverbTone.frequency.setTargetAtTime(clamp(3500 + clamp(dsp.reverbHfRatio, 0, 1, 0.7) * 9500, 2500, 16000, 9000), now, 0.025);
    graph.reverbWet.gain.setTargetAtTime(Math.max(reverbWet, convWet, enabled ? clamp(dsp.reverb, 0, 1, 0) * 0.45 : 0), now, 0.025);

    const tapeEnabled = enabled && dsp.tapeSaturationEnabled;
    const tapeMix = tapeEnabled ? percentToMix(dsp.tapeMix, 50) : 0;
    graph.tapeShaper.curve = makeDriveCurve(tapeEnabled ? clamp(dsp.tapeDriveDb, 0, 30, 6) : 0, Math.round(clamp(dsp.tapeMode, 0, 2, 0)));
    graph.tapeTone.frequency.setTargetAtTime(3500 + clamp(dsp.tapeTone, 0, 100, 50) * 125, now, 0.018);
    graph.tapeDry.gain.setTargetAtTime(1 - tapeMix * 0.25, now, 0.018);
    graph.tapeWet.gain.setTargetAtTime(tapeMix, now, 0.018);
    graph.tapeOutput.gain.setTargetAtTime(dbToGain(tapeEnabled ? clamp(dsp.tapeOutputDb, -18, 12, -1) : 0), now, 0.018);

    const bitEnabled = enabled && dsp.bitDitherEnabled;
    const downsample = clamp(dsp.downsample, 1, 16, 1);
    graph.bitShaper.curve = makeBitCurve(dsp.bitDepth, bitEnabled ? dsp.bitDitherMix : 0);
    graph.bitDownsampleFilter.frequency.setTargetAtTime(bitEnabled ? Math.max(900, context.sampleRate / (2 * downsample)) : 20000, now, 0.018);
    graph.bitOutput.gain.setTargetAtTime(dbToGain(bitEnabled ? clamp(dsp.bitDitherOutputDb, -18, 12, 0) : 0), now, 0.018);
    graph.bitNoiseGain.gain.setTargetAtTime(bitEnabled ? (clamp(dsp.dither, 0, 2, 0) / 2) * percentToMix(dsp.bitDitherMix, 100) * 0.0022 : 0, now, 0.018);

    graph.limiterInputGain.gain.setTargetAtTime(dbToGain(enabled && dsp.limiterEnabled ? clamp(dsp.limiterGainDb, -12, 18, 0) : 0), now, 0.012);
    graph.limiter.threshold.setTargetAtTime(enabled && dsp.limiterEnabled ? clamp(dsp.limiterCeiling, -18, 0, -1) : enabled ? clamp(dsp.limiter, -12, 0, 0) : 0, now, 0.012);
    graph.limiter.release.setTargetAtTime(enabled && dsp.limiterEnabled ? msToSeconds(dsp.limiterRelease, 0.12) : 0.06, now, 0.012);
    graph.truePeakDrive.gain.setTargetAtTime(dbToGain(enabled && dsp.truePeakEnabled ? clamp(dsp.truePeakDrive, -12, 18, 0) : 0), now, 0.012);
    graph.truePeakLimiter.threshold.setTargetAtTime(enabled && dsp.truePeakEnabled ? clamp(dsp.truePeakCeiling, -18, 0, -0.1) : 0, now, 0.012);
    graph.truePeakLimiter.release.setTargetAtTime(enabled && dsp.truePeakEnabled ? msToSeconds(dsp.truePeakRelease, 0.05) : 0.05, now, 0.012);

    const widthValue = enabled && dsp.stereoWidenerEnabled ? clamp(dsp.stereoWidth, 0, 220, 100) / 100 : 1;
    const crossfeedAmount = enabled && dsp.crossfeedEnabled ? percentToMix(dsp.crossfeedLevel, 30) : 0;
    const crossDelay = clamp(dsp.crossfeedDelay, 0, 1.5, 0.3) / 1000;
    graph.crossLeftDelay.delayTime.setTargetAtTime(crossDelay, now, 0.018);
    graph.crossRightDelay.delayTime.setTargetAtTime(crossDelay, now, 0.018);
    graph.crossLeftHp.frequency.setTargetAtTime(clamp(dsp.crossfeedLowCut, 80, 1600, 700), now, 0.018);
    graph.crossRightHp.frequency.setTargetAtTime(clamp(dsp.crossfeedLowCut, 80, 1600, 700), now, 0.018);
    graph.crossLeftLp.frequency.setTargetAtTime(clamp(dsp.crossfeedHighCut, 1000, 9000, 4000), now, 0.018);
    graph.crossRightLp.frequency.setTargetAtTime(clamp(dsp.crossfeedHighCut, 1000, 9000, 4000), now, 0.018);
    const crossfeedStrength = Math.min(0.95, crossfeedAmount * 0.95);
    graph.crossLeftGain.gain.setTargetAtTime(crossfeedStrength, now, 0.018);
    graph.crossRightGain.gain.setTargetAtTime(crossfeedStrength, now, 0.018);

    const surroundMix = enabled && dsp.surroundEnabled ? percentToMix(dsp.surroundMix, 75) : 0;
    const surroundDelay = clamp(dsp.surroundDelay, 0, 30, 8) / 1000;
    const surroundGain = dbToGain(clamp(dsp.surroundSideLevel, -12, 12, 0)) * surroundMix * 0.36;
    graph.surroundLeftDelay.delayTime.setTargetAtTime(surroundDelay, now, 0.018);
    graph.surroundRightDelay.delayTime.setTargetAtTime(surroundDelay, now, 0.018);
    graph.surroundLeftGain.gain.setTargetAtTime(-surroundGain, now, 0.018);
    graph.surroundRightGain.gain.setTargetAtTime(-surroundGain, now, 0.018);

    const bassMonoMix = enabled && dsp.bassMonoEnabled ? Math.min(0.8, (1 - clamp(dsp.bassMonoWidth, 0, 200, 100) / 200) * 1.2) : 0;
    graph.bassMonoLow.frequency.setTargetAtTime(bassMonoCut, now, 0.018);
    graph.bassMonoGain.gain.setTargetAtTime(bassMonoMix * dbToGain(clamp(dsp.surroundLfeLevel, -12, 12, 0)) * 0.5, now, 0.018);
    const directTrim = Math.max(0.36, 1 - crossfeedAmount * 0.42 - surroundMix * 0.08 - bassMonoMix * 0.12);
    graph.leftDirect.gain.setTargetAtTime(directTrim * (0.92 + widthValue * 0.08), now, 0.018);
    graph.rightDirect.gain.setTargetAtTime(directTrim * (0.92 + widthValue * 0.08), now, 0.018);
    const centerLift = enabled && dsp.surroundEnabled ? dbToGain(clamp(dsp.surroundCenterLevel, -12, 12, 0) * surroundMix * 0.25) : 1;
    const surroundLift = enabled && dsp.surroundEnabled ? 1 + surroundMix * 0.04 : 1;
    graph.width.gain.setTargetAtTime(centerLift * surroundLift, now, 0.018);
    if (graph.panner) graph.panner.pan.setTargetAtTime(enabled ? clamp(dsp.balance, -100, 100, 0) / 100 : 0, now, 0.018);
    const mediaVolume = graph.media?.muted ? 0 : clamp(graph.media?.volume, 0, 1, 1);
    if (graph.suspendedByArDali) {
      graph.suspendedByArDali = false;
      graph.warmUpUntil = 0;
    }
    if (!graph.warmUpUntil) {
      // First time: fade in from 0 to avoid click/pop; protect for 300 ms
      const rampDuration = 0.3;
      graph.warmUpUntil = now + rampDuration + 0.05;
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setValueAtTime(0, now);
      graph.master.gain.linearRampToValueAtTime(mediaVolume, now + rampDuration);
    } else if (now >= graph.warmUpUntil) {
      // Ramp finished — smooth parameter update
      graph.master.gain.setTargetAtTime(mediaVolume, now, 0.025);
    }
    // else: ramp still in progress, do NOT touch master gain
  };

  const isActiveMedia = (media) => {
    if (!media) return false;
    const ready = Number(media.readyState || 0);
    const currentTime = Number(media.currentTime || 0);
    const volume = Number(media.volume);
    return ready >= 2 && !media.paused && !media.muted && volume > 0 && currentTime >= 0;
  };
  const isGraphCandidateMedia = (media) => {
    if (!media) return false;
    const volume = Number(media.volume);
    if (media.muted || volume <= 0) return false;
    const tag = String(media.tagName || "").toLowerCase();
    const ready = Number(media.readyState || 0);
    const hasSource = Boolean(media.currentSrc || media.src || media.srcObject);
    return tag === "video" || ready > 0 || hasSource;
  };
  const allMediaElements = Array.from(document.querySelectorAll("video, audio"));
  const activeMediaElements = allMediaElements.filter(isActiveMedia);
  const mediaVisibilityScore = (media) => {
    try {
      const rect = media.getBoundingClientRect ? media.getBoundingClientRect() : null;
      if (!rect || rect.width <= 1 || rect.height <= 1) return 0;
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const visibleArea = width * height;
      const area = Math.max(1, rect.width * rect.height);
      return Math.min(1, visibleArea / area);
    } catch (_) {
      return 0;
    }
  };
  const mediaScore = (media) => {
    const activeScore = isActiveMedia(media) ? 1000 : 0;
    const visibility = mediaVisibilityScore(media) * (isShortVideoPlatform ? 500 : 120);
    const ready = Number(media.readyState || 0) * 8;
    const size = (() => {
      try {
        const rect = media.getBoundingClientRect ? media.getBoundingClientRect() : null;
        return rect ? Math.min(120, Math.max(0, rect.width * rect.height) / 6000) : 0;
      } catch (_) {
        return 0;
      }
    })();
    return activeScore + visibility + ready + size;
  };
  const selectMediaElements = (items) => {
    const activeItems = items.filter(isActiveMedia);
    const candidateItems = activeItems.length ? activeItems : items.filter(isGraphCandidateMedia);
    const maxActiveGraphs = isShortVideoPlatform ? 1 : 2;
    return candidateItems
      .filter((media) => !!media)
      .sort((a, b) => mediaScore(b) - mediaScore(a))
      .slice(0, maxActiveGraphs);
  };
  const mediaElements = selectMediaElements(allMediaElements);
  cleanupGraphs(mediaElements, isShortVideoPlatform);
  let connected = 0;
  let mediaCount = mediaElements.length;
  for (const media of mediaElements) {
    try {
      const graph = makeGraph(media);
      if (graph) {
        applyGraph(graph);
        connected += 1;
      }
    } catch (error) {
      if (!root.lastError) root.lastError = String(error && error.message ? error.message : error);
    }
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  root.lastPayload = cfg;
  if (!root.mediaEventListeners) {
    root.mediaEventListeners = new WeakSet();
  }
  const bindMediaEvents = (media) => {
    if (!media || root.mediaEventListeners.has(media)) return;
    root.mediaEventListeners.add(media);
    const refresh = () => {
      clearTimeout(root.mediaEventTimer);
      root.mediaEventTimer = setTimeout(() => root.applyCurrent && root.applyCurrent(), 0);
    };
    ["loadstart", "loadedmetadata", "loadeddata", "canplay", "play", "playing", "volumechange"].forEach((eventName) => {
      media.addEventListener(eventName, refresh, { passive: true });
    });
  };
  allMediaElements.forEach(bindMediaEvents);
  root.applyCurrent = () => {
    const currentMedia = Array.from(document.querySelectorAll("video, audio"));
    currentMedia.forEach(bindMediaEvents);
    const selectedMedia = selectMediaElements(currentMedia);
    cleanupGraphs(selectedMedia, isShortVideoPlatform);
    let count = 0;
    for (const media of selectedMedia) {
      try {
        const graph = makeGraph(media);
        if (graph) {
          applyGraph(graph);
          count += 1;
        }
      } catch (_) {}
    }
    return count;
  };
  if (!root.observer) {
    root.observer = new MutationObserver(() => {
      const currentMedia = Array.from(document.querySelectorAll("video, audio"));
      let hasNew = false;
      currentMedia.forEach((media) => {
        if (media && !root.mediaEventListeners.has(media)) {
          bindMediaEvents(media);
          hasNew = true;
        }
      });
      if (hasNew) {
        root.applyCurrent && root.applyCurrent();
      }
      clearTimeout(root.observerTimer);
      root.observerTimer = setTimeout(() => root.applyCurrent && root.applyCurrent(), 180);
    });
    root.observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  const graphForActiveMedia = () => Array.from(document.querySelectorAll("video, audio"))
    .map((media) => root.graphs.get(media))
    .find((graph) => graph && graph.media && isActiveMedia(graph.media));
  const spectrumFromAnalyser = (analyser, bands = 96) => {
    if (!analyser) return [];
    const raw = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(raw);
    return Array.from({ length: Math.max(1, Math.min(512, Number(bands) || 96)) }, (_, index) => {
      const pos = Math.floor((index / Math.max(1, bands - 1)) * (raw.length - 1));
      return raw[pos] / 255;
    });
  };
  root.getSpectrumSnapshot = (bands = 96) => {
    const first = graphForActiveMedia();
    return first ? spectrumFromAnalyser(first.analyser, bands) : [];
  };
  root.getRawSpectrumSnapshot = (bands = 96) => {
    const first = graphForActiveMedia();
    return first ? spectrumFromAnalyser(first.rawAnalyser, bands) : [];
  };
  root.getRawPcmSnapshot = (samples = 1024) => {
    const first = graphForActiveMedia();
    if (!first || !first.rawAnalyser) return [];
    const count = Math.max(64, Math.min(4096, Number(samples) || 1024));
    const pcm = new Float32Array(count);
    first.rawAnalyser.getFloatTimeDomainData(pcm);
    return Array.from(pcm);
  };
  const result = {
    ok: connected > 0,
    connected,
    mediaCount,
    activeMediaCount: activeMediaElements.length,
    skippedMediaCount: Math.max(0, allMediaElements.length - mediaElements.length),
    totalMediaCount: allMediaElements.length,
    contextState: context.state,
    presetName: root.daliModule && root.daliModule.presetName ? root.daliModule.presetName : "",
    eqProbe: cfg.eqGains.slice(0, 8),
    toneProbe: {
      preampDb: cfg.dsp.preampDb ?? 0,
      bassBoost: cfg.dsp.bassBoost ?? 0,
      midGain: cfg.dsp.midGain ?? 0,
      trebleGain: cfg.dsp.trebleGain ?? 0,
      balance: cfg.dsp.balance ?? 0,
    },
    featureProbe: {
      reverb: Boolean(cfg.dsp.reverbEnabled || cfg.dsp.convReverbEnabled),
      compressor: Boolean(cfg.dsp.compressorEnabled),
      limiter: Boolean(cfg.dsp.limiterEnabled || cfg.dsp.truePeakEnabled),
      bassBoost: Boolean(cfg.dsp.bassBoostEnabled),
      autoGain: Boolean(cfg.dsp.autoGainEnabled),
      peq: Boolean(cfg.dsp.peqEnabled),
      dynamicEq: Boolean(cfg.dsp.dynamicEqEnabled),
      exciter: Boolean(cfg.dsp.exciterEnabled),
      deesser: Boolean(cfg.dsp.deesserEnabled),
      noiseGate: Boolean(cfg.dsp.noiseGateEnabled),
      echo: Boolean(cfg.dsp.echoEnabled),
      convolutionReverb: Boolean(cfg.dsp.convReverbEnabled),
      crossfeed: Boolean(cfg.dsp.crossfeedEnabled),
      surround: Boolean(cfg.dsp.surroundEnabled),
      bassMono: Boolean(cfg.dsp.bassMonoEnabled),
      stereoWidener: Boolean(cfg.dsp.stereoWidenerEnabled),
      tape: Boolean(cfg.dsp.tapeSaturationEnabled),
      bitDither: Boolean(cfg.dsp.bitDitherEnabled),
      stereoTools: Boolean(cfg.dsp.stereoWidenerEnabled || cfg.dsp.crossfeedEnabled || cfg.dsp.surroundEnabled || cfg.dsp.bassMonoEnabled),
    },
    mediaProbe: mediaElements.slice(0, 3).map((media) => ({
      tag: String(media.tagName || "").toLowerCase(),
      paused: Boolean(media.paused),
      muted: Boolean(media.muted),
      volume: Number(media.volume),
      currentTime: Number(media.currentTime || 0),
      readyState: Number(media.readyState || 0),
      active: isActiveMedia(media),
    })),
    error: root.lastError || "",
  };
  try { console.info("[ArDali DALI WEB]", JSON.stringify(result)); } catch (_) {}
  return result;
} catch (error) {
  const result = {
    ok: false,
    connected: 0,
    mediaCount: 0,
    totalMediaCount: 0,
    error: String(error && error.message ? error.message : error),
    stack: String(error && error.stack ? error.stack : ""),
  };
  try { console.error("[ArDali DALI WEB ERROR]", JSON.stringify(result)); } catch (_) {}
  return result;
}
})();
`;
}

export async function applyWebDaliEffects(label: string, payload: WebDaliPayload) {
  await invoke("apply_web_dali_script", { label, script: webDaliInjectionScript(payload) });
}

export async function getWebDaliRawSpectrum(label: string, bands: number) {
  const snapshot = await invoke<string>("web_dali_audio_snapshot", { label, kind: "raw-spectrum", size: bands });
  const parsed = JSON.parse(snapshot || "{}") as { ok?: boolean; values?: number[]; error?: string };
  return parsed.ok && Array.isArray(parsed.values) ? parsed.values : [];
}

export async function getWebDaliRawPcm(label: string, samples: number) {
  const snapshot = await invoke<string>("web_dali_audio_snapshot", { label, kind: "raw-pcm", size: samples });
  const parsed = JSON.parse(snapshot || "{}") as { ok?: boolean; values?: number[] };
  return parsed.ok && Array.isArray(parsed.values) ? parsed.values : [];
}

export async function clearWebData(label: string, target: "cache" | "cookies" | "site-data" | "all") {
  await invoke("clear_web_data", { label, target });
}

export async function onWindowResize(label: string) {
  const bounds = await getStableWebStageBounds();

  await invoke("update_webview_bounds_rect", {
    label,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}

export async function setWebChromeVisibility(label: string, hidden: boolean) {
  if (hidden) {
    await invoke("update_webview_bounds_rect", {
      label,
      x: 0,
      y: 0,
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    });
    return;
  }

  await onWindowResize((window as any).__ardali_activeTabId || "");
}
