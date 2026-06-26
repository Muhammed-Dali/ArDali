use serde::{Deserialize, Serialize};
use std::{
    ffi::{c_char, c_int, c_void, CString},
    ptr,
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};

type Bool = c_int;
type Dword = u32;
type Qword = u64;
type HStream = Dword;
type HDsp = Dword;
type Hfx = Dword;

const BASS_SAMPLE_FLOAT: Dword = 0x100;
const BASS_STREAM_DECODE: Dword = 0x200000;
const BASS_POS_BYTE: Dword = 0;
const BASS_ATTRIB_VOL: Dword = 2;
const BASS_ATTRIB_PAN: Dword = 3;
const BASS_ACTIVE_PLAYING: Dword = 1;
const BASS_FX_DX8_REVERB: Dword = 8;
#[allow(dead_code)]
const BASS_DATA_FFT2048: Dword = 0x80000002;

const EQ_BANDS: usize = 32;
const VISUAL_BANDS: usize = 256;
const VISUAL_PCM_SAMPLES: usize = 4096;
const VISUAL_PCM_STEREO_SAMPLES: usize = VISUAL_PCM_SAMPLES * 2;

struct VisualAnalysis {
    spectrum: [f32; VISUAL_BANDS],
    raw_spectrum: [f32; VISUAL_BANDS],
    pcm: [f32; VISUAL_PCM_SAMPLES],
    pcm_stereo: [f32; VISUAL_PCM_STEREO_SAMPLES],
    raw_pcm: [f32; VISUAL_PCM_SAMPLES],
    pcm_len: usize,
    pcm_write: usize,
    raw_pcm_len: usize,
    raw_pcm_write: usize,
    sample_rate: f32,
    adaptive_gain: f32,
    raw_adaptive_gain: f32,
}

impl VisualAnalysis {
    fn new() -> Self {
        Self {
            spectrum: [0.0; VISUAL_BANDS],
            raw_spectrum: [0.0; VISUAL_BANDS],
            pcm: [0.0; VISUAL_PCM_SAMPLES],
            pcm_stereo: [0.0; VISUAL_PCM_STEREO_SAMPLES],
            raw_pcm: [0.0; VISUAL_PCM_SAMPLES],
            pcm_len: 0,
            pcm_write: 0,
            raw_pcm_len: 0,
            raw_pcm_write: 0,
            sample_rate: 44_100.0,
            adaptive_gain: 1.0,
            raw_adaptive_gain: 1.0,
        }
    }
}

#[repr(C)]
#[derive(Default, Copy, Clone)]
struct BassChannelInfo {
    freq: Dword,
    chans: Dword,
    flags: Dword,
    ctype: Dword,
    origres: Dword,
    plugin: Dword,
    sample: Dword,
    filename: *const c_char,
}

#[repr(C)]
#[derive(Default, Copy, Clone)]
struct BassDx8Reverb {
    f_in_gain: f32,
    f_reverb_mix: f32,
    f_reverb_time: f32,
    f_high_freq_rt_ratio: f32,
}

type DspProc = Option<unsafe extern "C" fn(HDsp, Dword, *mut c_void, Dword, *mut c_void)>;

#[link(name = "bass")]
extern "C" {
    fn BASS_Init(
        device: c_int,
        freq: Dword,
        flags: Dword,
        win: *mut c_void,
        dsguid: *const c_void,
    ) -> Bool;
    fn BASS_ErrorGetCode() -> c_int;
    fn BASS_StreamCreateFile(
        mem: Bool,
        file: *const c_void,
        offset: Qword,
        length: Qword,
        flags: Dword,
    ) -> HStream;
    fn BASS_StreamFree(handle: HStream) -> Bool;
    fn BASS_ChannelPlay(handle: Dword, restart: Bool) -> Bool;
    fn BASS_ChannelPause(handle: Dword) -> Bool;
    fn BASS_ChannelStop(handle: Dword) -> Bool;
    fn BASS_ChannelIsActive(handle: Dword) -> Dword;
    fn BASS_ChannelSetPosition(handle: Dword, pos: Qword, mode: Dword) -> Bool;
    fn BASS_ChannelGetPosition(handle: Dword, mode: Dword) -> Qword;
    fn BASS_ChannelGetLength(handle: Dword, mode: Dword) -> Qword;
    fn BASS_ChannelBytes2Seconds(handle: Dword, pos: Qword) -> f64;
    fn BASS_ChannelSeconds2Bytes(handle: Dword, pos: f64) -> Qword;
    fn BASS_ChannelSetAttribute(handle: Dword, attrib: Dword, value: f32) -> Bool;
    fn BASS_ChannelSlideAttribute(handle: Dword, attrib: Dword, value: f32, time: Dword) -> Bool;
    #[allow(dead_code)]
    fn BASS_ChannelGetData(handle: Dword, buffer: *mut c_void, length: Dword) -> c_int;
    fn BASS_ChannelGetInfo(handle: Dword, info: *mut BassChannelInfo) -> Bool;
    fn BASS_ChannelSetDSP(handle: Dword, proc: DspProc, user: *mut c_void, priority: c_int)
        -> HDsp;
    fn BASS_ChannelRemoveDSP(handle: Dword, dsp: HDsp) -> Bool;
    fn BASS_ChannelSetFX(handle: Dword, fx_type: Dword, priority: c_int) -> Hfx;
    fn BASS_ChannelRemoveFX(handle: Dword, fx: Hfx) -> Bool;
    fn BASS_FXSetParameters(handle: Dword, params: *const c_void) -> Bool;
}

extern "C" {
    fn create_dsp() -> *mut c_void;
    fn process_dsp(dsp: *mut c_void, buffer: *mut f32, num_frames: c_int, channels: c_int);
    fn reset_dsp_state(dsp: *mut c_void);
    fn set_eq_bands(dsp: *mut c_void, gains: *const f32, num_bands: c_int);
    fn set_tone_params(dsp: *mut c_void, bass: f32, mid: f32, treble: f32);
    fn set_stereo_width(dsp: *mut c_void, width: f32);
    fn set_stereo_widener_params(
        dsp: *mut c_void,
        enabled: c_int,
        width: f32,
        center: f32,
        side: f32,
        bass_to_mono: f32,
    );
    fn set_dsp_enabled(dsp: *mut c_void, enabled: c_int);
    fn set_sample_rate(dsp: *mut c_void, sample_rate: f32);
    fn set_compressor_params(
        dsp: *mut c_void,
        enabled: c_int,
        thresh: f32,
        ratio: f32,
        att: f32,
        rel: f32,
        makeup: f32,
    );
    fn set_auto_gain_params(
        dsp: *mut c_void,
        enabled: c_int,
        target: f32,
        max_gain: f32,
        speed: c_int,
    );
    fn set_gate_params(
        dsp: *mut c_void,
        enabled: c_int,
        thresh: f32,
        att: f32,
        hold: f32,
        rel: f32,
        range: f32,
    );
    fn set_limiter_params(
        dsp: *mut c_void,
        enabled: c_int,
        ceiling: f32,
        rel: f32,
        lookahead: f32,
        gain: f32,
    );
    fn set_true_peak_params(
        dsp: *mut c_void,
        enabled: c_int,
        ceiling: f32,
        rel: f32,
        lookahead: f32,
        drive: f32,
        oversampling: c_int,
        stereo_link: c_int,
    );
    fn set_exciter_params(
        dsp: *mut c_void,
        enabled: c_int,
        frequency: f32,
        amount: f32,
        mix: f32,
        harmonic_type: c_int,
    );
    fn set_deesser_params(
        dsp: *mut c_void,
        enabled: c_int,
        frequency: f32,
        threshold: f32,
        ratio: f32,
        range: f32,
    );
    fn set_echo_params(
        dsp: *mut c_void,
        enabled: c_int,
        delay: f32,
        feedback: f32,
        mix: f32,
        high_cut: f32,
        soft_mode: c_int,
    );
    fn set_convolution_reverb_params(
        dsp: *mut c_void,
        enabled: c_int,
        mix: f32,
        predelay: f32,
        preset: c_int,
    );
    fn set_bass_boost(dsp: *mut c_void, enabled: c_int, gain: f32, freq: f32);
    fn set_peq_band(dsp: *mut c_void, band: c_int, enabled: c_int, freq: f32, gain: f32, q: f32);
    fn set_crossfeed_params(
        dsp: *mut c_void,
        enabled: c_int,
        level: f32,
        delay: f32,
        low_cut: f32,
        high_cut: f32,
    );
    fn set_bass_mono_params(dsp: *mut c_void, enabled: c_int, cutoff: f32, slope: f32, width: f32);
    fn set_dynamic_eq_params(
        dsp: *mut c_void,
        enabled: c_int,
        freq: f32,
        q: f32,
        threshold: f32,
        gain: f32,
        range: f32,
        attack: f32,
        release: f32,
    );
    fn set_bit_dither_params(
        dsp: *mut c_void,
        enabled: c_int,
        bit_depth: c_int,
        dither: c_int,
        shaping: c_int,
        downsample: c_int,
        mix: f32,
        output_db: f32,
    );
    fn set_tape_saturation_params(
        dsp: *mut c_void,
        enabled: c_int,
        drive: f32,
        mix: f32,
        tone: f32,
        output_db: f32,
        mode: c_int,
        hiss: f32,
    );
    fn set_surround_params(
        dsp: *mut c_void,
        enabled: c_int,
        center: f32,
        surround: f32,
        lfe: f32,
        crossover: f32,
        delay: f32,
        mix: f32,
    );
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDspSettings {
    #[serde(default)]
    preamp_db: f32,
    #[serde(default)]
    output_device: String,
    #[serde(default)]
    sample_rate: String,
    #[serde(default)]
    bass_boost: f32,
    #[serde(default = "default_bass_frequency")]
    bass_frequency: f32,
    #[serde(default)]
    bass_mix: f32,
    #[serde(default)]
    bass_boost_enabled: bool,
    #[serde(default)]
    mid_gain: f32,
    #[serde(default)]
    treble_gain: f32,
    #[serde(default = "default_stereo_width")]
    stereo_width: f32,
    #[serde(default)]
    stereo_widener_enabled: bool,
    #[serde(default)]
    stereo_widener_center_level: f32,
    #[serde(default)]
    stereo_widener_side_level: f32,
    #[serde(default = "default_stereo_widener_bass")]
    stereo_widener_bass_to_mono: f32,
    #[serde(default)]
    balance: f32,
    #[serde(default)]
    compressor: f32,
    #[serde(default)]
    limiter: f32,
    #[serde(default)]
    reverb: f32,
    #[serde(default)]
    reverb_enabled: bool,
    #[serde(default = "default_reverb_room_size")]
    reverb_room_size: f32,
    #[serde(default = "default_reverb_wet_dry")]
    reverb_wet_dry: f32,
    #[serde(default = "default_reverb_hf_ratio")]
    reverb_hf_ratio: f32,
    #[serde(default)]
    reverb_input_gain: f32,
    #[serde(default)]
    conv_reverb_enabled: bool,
    #[serde(default = "default_conv_reverb_mix")]
    conv_reverb_mix: f32,
    #[serde(default = "default_conv_reverb_predelay")]
    conv_reverb_predelay: f32,
    #[serde(default = "default_conv_reverb_preset")]
    conv_reverb_preset: String,
    #[serde(default)]
    compressor_enabled: bool,
    #[serde(default = "default_compressor_threshold")]
    compressor_threshold: f32,
    #[serde(default = "default_compressor_ratio")]
    compressor_ratio: f32,
    #[serde(default = "default_compressor_attack")]
    compressor_attack: f32,
    #[serde(default = "default_compressor_release")]
    compressor_release: f32,
    #[serde(default)]
    compressor_makeup_gain: f32,
    #[serde(default)]
    auto_gain_enabled: bool,
    #[serde(default = "default_auto_gain_target")]
    auto_gain_target_level: f32,
    #[serde(default = "default_auto_gain_max")]
    auto_gain_max_gain: f32,
    #[serde(default = "default_auto_gain_speed")]
    auto_gain_speed: String,
    #[serde(default)]
    limiter_enabled: bool,
    #[serde(default = "default_limiter_ceiling")]
    limiter_ceiling: f32,
    #[serde(default = "default_limiter_release")]
    limiter_release: f32,
    #[serde(default = "default_limiter_lookahead")]
    limiter_lookahead: f32,
    #[serde(default)]
    limiter_gain_db: f32,
    #[serde(default)]
    true_peak_enabled: bool,
    #[serde(default = "default_true_peak_ceiling")]
    true_peak_ceiling: f32,
    #[serde(default = "default_limiter_release")]
    true_peak_release: f32,
    #[serde(default = "default_limiter_lookahead")]
    true_peak_lookahead: f32,
    #[serde(default)]
    true_peak_drive: f32,
    #[serde(default = "default_true_peak_oversampling")]
    true_peak_oversampling: i32,
    #[serde(default = "default_true_peak_stereo_link")]
    true_peak_stereo_link: bool,
    #[serde(default)]
    exciter_enabled: bool,
    #[serde(default = "default_exciter_frequency")]
    exciter_frequency: f32,
    #[serde(default = "default_exciter_amount")]
    exciter_amount: f32,
    #[serde(default = "default_exciter_mix")]
    exciter_mix: f32,
    #[serde(default = "default_exciter_harmonics")]
    exciter_harmonics: String,
    #[serde(default)]
    deesser_enabled: bool,
    #[serde(default = "default_deesser_frequency")]
    deesser_frequency: f32,
    #[serde(default = "default_deesser_threshold")]
    deesser_threshold: f32,
    #[serde(default = "default_deesser_ratio")]
    deesser_ratio: f32,
    #[serde(default = "default_deesser_range")]
    deesser_range: f32,
    #[serde(default)]
    echo_enabled: bool,
    #[serde(default = "default_echo_delay")]
    echo_delay: f32,
    #[serde(default = "default_echo_feedback")]
    echo_feedback: f32,
    #[serde(default = "default_echo_mix")]
    echo_mix: f32,
    #[serde(default = "default_echo_high_cut")]
    echo_high_cut: f32,
    #[serde(default)]
    echo_soft_mode: bool,
    #[serde(default)]
    noise_gate_enabled: bool,
    #[serde(default = "default_noise_gate_threshold")]
    noise_gate_threshold: f32,
    #[serde(default = "default_noise_gate_attack")]
    noise_gate_attack: f32,
    #[serde(default = "default_noise_gate_hold")]
    noise_gate_hold: f32,
    #[serde(default = "default_noise_gate_release")]
    noise_gate_release: f32,
    #[serde(default = "default_noise_gate_range")]
    noise_gate_range: f32,
    #[serde(default)]
    peq_enabled: bool,
    #[serde(default)]
    peq_bands: Vec<NativePeqBand>,
    #[serde(default)]
    crossfeed_enabled: bool,
    #[serde(default = "default_crossfeed_level")]
    crossfeed_level: f32,
    #[serde(default = "default_crossfeed_delay")]
    crossfeed_delay: f32,
    #[serde(default = "default_crossfeed_low_cut")]
    crossfeed_low_cut: f32,
    #[serde(default = "default_crossfeed_high_cut")]
    crossfeed_high_cut: f32,
    #[serde(default)]
    bass_mono_enabled: bool,
    #[serde(default = "default_bass_mono_cutoff")]
    bass_mono_cutoff: f32,
    #[serde(default = "default_bass_mono_slope")]
    bass_mono_slope: f32,
    #[serde(default = "default_stereo_width")]
    bass_mono_width: f32,
    #[serde(default)]
    dynamic_eq_enabled: bool,
    #[serde(default = "default_dynamic_eq_frequency")]
    dynamic_eq_frequency: f32,
    #[serde(default = "default_dynamic_eq_q")]
    dynamic_eq_q: f32,
    #[serde(default = "default_dynamic_eq_threshold")]
    dynamic_eq_threshold: f32,
    #[serde(default = "default_dynamic_eq_gain")]
    dynamic_eq_gain: f32,
    #[serde(default = "default_dynamic_eq_range")]
    dynamic_eq_range: f32,
    #[serde(default = "default_dynamic_eq_attack")]
    dynamic_eq_attack: f32,
    #[serde(default = "default_dynamic_eq_release")]
    dynamic_eq_release: f32,
    #[serde(default)]
    bit_dither_enabled: bool,
    #[serde(default = "default_bit_depth")]
    bit_depth: i32,
    #[serde(default = "default_dither")]
    dither: i32,
    #[serde(default)]
    shaping: i32,
    #[serde(default = "default_downsample")]
    downsample: i32,
    #[serde(default = "default_bit_dither_mix")]
    bit_dither_mix: f32,
    #[serde(default)]
    bit_dither_output_db: f32,
    #[serde(default)]
    tape_saturation_enabled: bool,
    #[serde(default = "default_tape_drive")]
    tape_drive_db: f32,
    #[serde(default = "default_tape_mix")]
    tape_mix: f32,
    #[serde(default = "default_tape_tone")]
    tape_tone: f32,
    #[serde(default = "default_tape_output")]
    tape_output_db: f32,
    #[serde(default)]
    tape_mode: i32,
    #[serde(default)]
    tape_hiss: f32,
    #[serde(default)]
    surround_enabled: bool,
    #[serde(default)]
    surround_center_level: f32,
    #[serde(default)]
    surround_side_level: f32,
    #[serde(default)]
    surround_lfe_level: f32,
    #[serde(default = "default_surround_crossover")]
    surround_crossover: f32,
    #[serde(default = "default_surround_delay")]
    surround_delay: f32,
    #[serde(default = "default_surround_mix")]
    surround_mix: f32,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSpectrumPair {
    pub processed: Vec<f32>,
    pub raw: Vec<f32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePeqBand {
    #[serde(default)]
    freq: f32,
    #[serde(default)]
    gain: f32,
    #[serde(default = "default_peq_q")]
    q: f32,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEffectsPayload {
    #[serde(default)]
    effects_enabled: bool,
    #[serde(default)]
    eq_gains: Vec<f32>,
    #[serde(default)]
    dsp_settings: NativeDspSettings,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioState {
    available: bool,
    initialized: bool,
    loaded: bool,
    playing: bool,
    position: f64,
    duration: f64,
}

fn default_bass_frequency() -> f32 {
    80.0
}

fn default_stereo_width() -> f32 {
    100.0
}

fn default_stereo_widener_bass() -> f32 {
    200.0
}
fn default_reverb_room_size() -> f32 {
    1000.0
}
fn default_reverb_wet_dry() -> f32 {
    -10.0
}
fn default_reverb_hf_ratio() -> f32 {
    0.7
}
fn default_conv_reverb_mix() -> f32 {
    30.0
}
fn default_conv_reverb_predelay() -> f32 {
    20.0
}
fn default_conv_reverb_preset() -> String {
    "hall".to_string()
}
fn default_compressor_threshold() -> f32 {
    -20.0
}
fn default_compressor_ratio() -> f32 {
    4.0
}
fn default_compressor_attack() -> f32 {
    10.0
}
fn default_compressor_release() -> f32 {
    100.0
}
fn default_limiter_ceiling() -> f32 {
    -0.3
}
fn default_limiter_release() -> f32 {
    50.0
}
fn default_limiter_lookahead() -> f32 {
    5.0
}
fn default_auto_gain_target() -> f32 {
    -14.0
}
fn default_auto_gain_max() -> f32 {
    12.0
}
fn default_auto_gain_speed() -> String {
    "medium".to_string()
}
fn default_true_peak_ceiling() -> f32 {
    -0.1
}
fn default_true_peak_oversampling() -> i32 {
    4
}
fn default_true_peak_stereo_link() -> bool {
    true
}
fn default_exciter_frequency() -> f32 {
    3000.0
}
fn default_exciter_amount() -> f32 {
    50.0
}
fn default_exciter_mix() -> f32 {
    30.0
}
fn default_exciter_harmonics() -> String {
    "odd".to_string()
}
fn default_deesser_frequency() -> f32 {
    7000.0
}
fn default_deesser_threshold() -> f32 {
    -30.0
}
fn default_deesser_ratio() -> f32 {
    4.0
}
fn default_deesser_range() -> f32 {
    -12.0
}
fn default_echo_delay() -> f32 {
    250.0
}
fn default_echo_feedback() -> f32 {
    40.0
}
fn default_echo_mix() -> f32 {
    30.0
}
fn default_echo_high_cut() -> f32 {
    8000.0
}
fn default_noise_gate_threshold() -> f32 {
    -40.0
}
fn default_noise_gate_attack() -> f32 {
    5.0
}
fn default_noise_gate_hold() -> f32 {
    100.0
}
fn default_noise_gate_release() -> f32 {
    150.0
}
fn default_noise_gate_range() -> f32 {
    -80.0
}
fn default_peq_q() -> f32 {
    1.0
}
fn default_crossfeed_level() -> f32 {
    30.0
}
fn default_crossfeed_delay() -> f32 {
    0.3
}
fn default_crossfeed_low_cut() -> f32 {
    700.0
}
fn default_crossfeed_high_cut() -> f32 {
    4000.0
}
fn default_bass_mono_cutoff() -> f32 {
    120.0
}
fn default_bass_mono_slope() -> f32 {
    24.0
}
fn default_dynamic_eq_frequency() -> f32 {
    3500.0
}
fn default_dynamic_eq_q() -> f32 {
    2.0
}
fn default_dynamic_eq_threshold() -> f32 {
    -40.0
}
fn default_dynamic_eq_gain() -> f32 {
    -6.0
}
fn default_dynamic_eq_range() -> f32 {
    12.0
}
fn default_dynamic_eq_attack() -> f32 {
    5.0
}
fn default_dynamic_eq_release() -> f32 {
    120.0
}
fn default_bit_depth() -> i32 {
    16
}
fn default_dither() -> i32 {
    2
}
fn default_downsample() -> i32 {
    1
}
fn default_bit_dither_mix() -> f32 {
    100.0
}
fn default_tape_drive() -> f32 {
    6.0
}
fn default_tape_mix() -> f32 {
    50.0
}
fn default_tape_tone() -> f32 {
    50.0
}
fn default_tape_output() -> f32 {
    -1.0
}
fn default_surround_crossover() -> f32 {
    110.0
}
fn default_surround_delay() -> f32 {
    8.0
}
fn default_surround_mix() -> f32 {
    75.0
}

fn exciter_harmonic_type(value: &str) -> i32 {
    match value.trim().to_lowercase().as_str() {
        "even" => 1,
        "mixed" | "tape" => 2,
        "tube" => 3,
        _ => 0,
    }
}

fn conv_reverb_preset_type(value: &str) -> i32 {
    match value.trim().to_lowercase().as_str() {
        "room" | "small" => 1,
        "plate" | "spring" => 2,
        "cathedral" | "church" => 3,
        "large" | "chamber" => 4,
        _ => 0,
    }
}

fn db_to_linear(db: f32) -> f32 {
    10.0f32.powf(db / 20.0)
}

fn bass_output_gain(module_bass: f32, enhancer_bass: f32) -> f32 {
    let tone_trim_db = module_bass.max(0.0) * 0.16;
    let enhancer_trim_db = enhancer_bass.max(0.0) * 0.26;
    let trim_db = (tone_trim_db + enhancer_trim_db).min(3.2);
    db_to_linear(-trim_db)
}

pub struct NativeAudioEngine {
    initialized: bool,
    stream: HStream,
    analysis_stream: HStream,
    dsp: *mut c_void,
    dsp_handle: HDsp,
    reverb_fx: Hfx,
    volume: f32,
    muted: bool,
    effects_enabled: bool,
    preamp_db: f32,
    output_device: String,
    sample_rate: String,
    eq_gains: [f32; EQ_BANDS],
    bass: f32,
    mid: f32,
    treble: f32,
    bass_boost: f32,
    bass_boost_enabled: bool,
    bass_frequency: f32,
    effect_output_gain: f32,
    stereo_width: f32,
    stereo_widener_enabled: bool,
    stereo_widener_center_level: f32,
    stereo_widener_side_level: f32,
    stereo_widener_bass_to_mono: f32,
    balance: f32,
    compressor: f32,
    limiter: f32,
    reverb: f32,
    reverb_enabled: bool,
    reverb_room_size: f32,
    reverb_wet_dry: f32,
    reverb_hf_ratio: f32,
    reverb_input_gain: f32,
    conv_reverb_enabled: bool,
    conv_reverb_mix: f32,
    conv_reverb_predelay: f32,
    conv_reverb_preset: String,
    compressor_enabled: bool,
    compressor_threshold: f32,
    compressor_ratio: f32,
    compressor_attack: f32,
    compressor_release: f32,
    compressor_makeup_gain: f32,
    auto_gain_enabled: bool,
    auto_gain_target_level: f32,
    auto_gain_max_gain: f32,
    auto_gain_speed: String,
    limiter_enabled: bool,
    limiter_ceiling: f32,
    limiter_release: f32,
    limiter_lookahead: f32,
    limiter_gain_db: f32,
    true_peak_enabled: bool,
    true_peak_ceiling: f32,
    true_peak_release: f32,
    true_peak_lookahead: f32,
    true_peak_drive: f32,
    true_peak_oversampling: i32,
    true_peak_stereo_link: bool,
    exciter_enabled: bool,
    exciter_frequency: f32,
    exciter_amount: f32,
    exciter_mix: f32,
    exciter_harmonics: String,
    deesser_enabled: bool,
    deesser_frequency: f32,
    deesser_threshold: f32,
    deesser_ratio: f32,
    deesser_range: f32,
    echo_enabled: bool,
    echo_delay: f32,
    echo_feedback: f32,
    echo_mix: f32,
    echo_high_cut: f32,
    echo_soft_mode: bool,
    noise_gate_enabled: bool,
    noise_gate_threshold: f32,
    noise_gate_attack: f32,
    noise_gate_hold: f32,
    noise_gate_release: f32,
    noise_gate_range: f32,
    peq_enabled: bool,
    peq_bands: [(f32, f32, f32); 6],
    crossfeed_enabled: bool,
    crossfeed_level: f32,
    crossfeed_delay: f32,
    crossfeed_low_cut: f32,
    crossfeed_high_cut: f32,
    bass_mono_enabled: bool,
    bass_mono_cutoff: f32,
    bass_mono_slope: f32,
    bass_mono_width: f32,
    dynamic_eq_enabled: bool,
    dynamic_eq_frequency: f32,
    dynamic_eq_q: f32,
    dynamic_eq_threshold: f32,
    dynamic_eq_gain: f32,
    dynamic_eq_range: f32,
    dynamic_eq_attack: f32,
    dynamic_eq_release: f32,
    bit_dither_enabled: bool,
    bit_depth: i32,
    dither: i32,
    shaping: i32,
    downsample: i32,
    bit_dither_mix: f32,
    bit_dither_output_db: f32,
    tape_saturation_enabled: bool,
    tape_drive_db: f32,
    tape_mix: f32,
    tape_tone: f32,
    tape_output_db: f32,
    tape_mode: i32,
    tape_hiss: f32,
    surround_enabled: bool,
    surround_center_level: f32,
    surround_side_level: f32,
    surround_lfe_level: f32,
    surround_crossover: f32,
    surround_delay: f32,
    surround_mix: f32,
    visual: Mutex<VisualAnalysis>,
}

unsafe impl Send for NativeAudioEngine {}

impl Drop for NativeAudioEngine {
    fn drop(&mut self) {
        // BASS can still be unwinding its audio callback while the process exits.
        // Leaving process-global audio allocations to the OS avoids a shutdown race
        // without affecting runtime playback.
        self.dsp = ptr::null_mut();
        self.initialized = false;
    }
}

impl NativeAudioEngine {
    fn new() -> Self {
        Self {
            initialized: false,
            stream: 0,
            analysis_stream: 0,
            dsp: ptr::null_mut(),
            dsp_handle: 0,
            reverb_fx: 0,
            volume: 1.0,
            muted: false,
            effects_enabled: true,
            preamp_db: 0.0,
            output_device: "default".to_string(),
            sample_rate: "auto".to_string(),
            eq_gains: [0.0; EQ_BANDS],
            bass: 0.0,
            mid: 0.0,
            treble: 0.0,
            bass_boost: 0.0,
            bass_boost_enabled: false,
            bass_frequency: 80.0,
            effect_output_gain: 1.0,
            stereo_width: 100.0,
            stereo_widener_enabled: false,
            stereo_widener_center_level: 0.0,
            stereo_widener_side_level: 0.0,
            stereo_widener_bass_to_mono: 200.0,
            balance: 0.0,
            compressor: 0.0,
            limiter: 0.0,
            reverb: 0.0,
            reverb_enabled: false,
            reverb_room_size: 1000.0,
            reverb_wet_dry: -10.0,
            reverb_hf_ratio: 0.7,
            reverb_input_gain: 0.0,
            conv_reverb_enabled: false,
            conv_reverb_mix: 30.0,
            conv_reverb_predelay: 20.0,
            conv_reverb_preset: "hall".to_string(),
            compressor_enabled: false,
            compressor_threshold: -20.0,
            compressor_ratio: 4.0,
            compressor_attack: 10.0,
            compressor_release: 100.0,
            compressor_makeup_gain: 0.0,
            auto_gain_enabled: false,
            auto_gain_target_level: -14.0,
            auto_gain_max_gain: 12.0,
            auto_gain_speed: "medium".to_string(),
            limiter_enabled: false,
            limiter_ceiling: -0.3,
            limiter_release: 50.0,
            limiter_lookahead: 5.0,
            limiter_gain_db: 0.0,
            true_peak_enabled: false,
            true_peak_ceiling: -0.1,
            true_peak_release: 50.0,
            true_peak_lookahead: 5.0,
            true_peak_drive: 0.0,
            true_peak_oversampling: 4,
            true_peak_stereo_link: true,
            exciter_enabled: false,
            exciter_frequency: 3000.0,
            exciter_amount: 50.0,
            exciter_mix: 30.0,
            exciter_harmonics: "odd".to_string(),
            deesser_enabled: false,
            deesser_frequency: 7000.0,
            deesser_threshold: -30.0,
            deesser_ratio: 4.0,
            deesser_range: -12.0,
            echo_enabled: false,
            echo_delay: 250.0,
            echo_feedback: 40.0,
            echo_mix: 30.0,
            echo_high_cut: 8000.0,
            echo_soft_mode: false,
            noise_gate_enabled: false,
            noise_gate_threshold: -40.0,
            noise_gate_attack: 5.0,
            noise_gate_hold: 100.0,
            noise_gate_release: 150.0,
            noise_gate_range: -80.0,
            peq_enabled: false,
            peq_bands: [
                (60.0, 0.0, 1.0),
                (150.0, 0.0, 1.0),
                (400.0, 0.0, 1.0),
                (1500.0, 0.0, 1.0),
                (5000.0, 0.0, 1.0),
                (12000.0, 0.0, 1.0),
            ],
            crossfeed_enabled: false,
            crossfeed_level: 30.0,
            crossfeed_delay: 0.3,
            crossfeed_low_cut: 700.0,
            crossfeed_high_cut: 4000.0,
            bass_mono_enabled: false,
            bass_mono_cutoff: 120.0,
            bass_mono_slope: 24.0,
            bass_mono_width: 100.0,
            dynamic_eq_enabled: false,
            dynamic_eq_frequency: 3500.0,
            dynamic_eq_q: 2.0,
            dynamic_eq_threshold: -40.0,
            dynamic_eq_gain: -6.0,
            dynamic_eq_range: 12.0,
            dynamic_eq_attack: 5.0,
            dynamic_eq_release: 120.0,
            bit_dither_enabled: false,
            bit_depth: 16,
            dither: 2,
            shaping: 0,
            downsample: 1,
            bit_dither_mix: 100.0,
            bit_dither_output_db: 0.0,
            tape_saturation_enabled: false,
            tape_drive_db: 6.0,
            tape_mix: 50.0,
            tape_tone: 50.0,
            tape_output_db: -1.0,
            tape_mode: 0,
            tape_hiss: 0.0,
            surround_enabled: false,
            surround_center_level: 0.0,
            surround_side_level: 0.0,
            surround_lfe_level: 0.0,
            surround_crossover: 110.0,
            surround_delay: 8.0,
            surround_mix: 75.0,
            visual: Mutex::new(VisualAnalysis::new()),
        }
    }

    fn init(&mut self) -> Result<(), String> {
        if self.initialized {
            return Ok(());
        }
        let ok = unsafe { BASS_Init(-1, 44_100, 0, ptr::null_mut(), ptr::null()) } != 0;
        if !ok {
            return Err(format!("BASS baslatilamadi: {}", unsafe {
                BASS_ErrorGetCode()
            }));
        }
        self.initialized = true;
        Ok(())
    }

    fn clear_streams(&mut self) {
        unsafe {
            if self.stream != 0 {
                if self.dsp_handle != 0 {
                    BASS_ChannelRemoveDSP(self.stream, self.dsp_handle);
                    self.dsp_handle = 0;
                }
                if self.reverb_fx != 0 {
                    BASS_ChannelRemoveFX(self.stream, self.reverb_fx);
                    self.reverb_fx = 0;
                }
                BASS_ChannelStop(self.stream);
                BASS_StreamFree(self.stream);
                self.stream = 0;
            }
            if self.analysis_stream != 0 {
                BASS_StreamFree(self.analysis_stream);
                self.analysis_stream = 0;
            }
        }
    }

    fn load_file(&mut self, path: &str) -> Result<f64, String> {
        self.init()?;
        self.clear_streams();
        let c_path = CString::new(path).map_err(|_| "Dosya yolu gecersiz".to_string())?;
        let stream = unsafe {
            BASS_StreamCreateFile(0, c_path.as_ptr() as *const c_void, 0, 0, BASS_SAMPLE_FLOAT)
        };
        if stream == 0 {
            return Err(format!("BASS dosyayi acamadi: {}", unsafe {
                BASS_ErrorGetCode()
            }));
        }
        self.stream = stream;
        self.analysis_stream = unsafe {
            BASS_StreamCreateFile(
                0,
                c_path.as_ptr() as *const c_void,
                0,
                0,
                BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT,
            )
        };
        self.setup_fx();
        Ok(self.duration())
    }

    fn setup_fx(&mut self) {
        if self.stream == 0 {
            return;
        }
        unsafe {
            if self.dsp.is_null() {
                self.dsp = create_dsp();
            }
            if !self.dsp.is_null() {
                let mut info = BassChannelInfo::default();
                let sample_rate =
                    if BASS_ChannelGetInfo(self.stream, &mut info) != 0 && info.freq > 0 {
                        info.freq as f32
                    } else {
                        44_100.0
                    };
                if let Ok(mut visual) = self.visual.lock() {
                    visual.sample_rate = sample_rate;
                    visual.spectrum.fill(0.0);
                    visual.raw_spectrum.fill(0.0);
                    visual.pcm.fill(0.0);
                    visual.pcm_stereo.fill(0.0);
                    visual.raw_pcm.fill(0.0);
                    visual.pcm_len = 0;
                    visual.pcm_write = 0;
                    visual.raw_pcm_len = 0;
                    visual.raw_pcm_write = 0;
                    visual.adaptive_gain = 1.0;
                    visual.raw_adaptive_gain = 1.0;
                }
                set_sample_rate(self.dsp, sample_rate);
                self.apply_dsp_params();
            }
            if self.dsp_handle != 0 {
                BASS_ChannelRemoveDSP(self.stream, self.dsp_handle);
                self.dsp_handle = 0;
            }
            self.dsp_handle = BASS_ChannelSetDSP(
                self.stream,
                Some(dsp_callback),
                self as *mut _ as *mut c_void,
                0,
            );
            self.apply_volume();
            self.apply_reverb();
        }
    }

    unsafe fn apply_dsp_params(&mut self) {
        if self.dsp.is_null() {
            return;
        }
        let enabled = self.effects_enabled as c_int;
        set_dsp_enabled(self.dsp, enabled);
        set_eq_bands(self.dsp, self.eq_gains.as_ptr(), EQ_BANDS as c_int);
        set_tone_params(
            self.dsp,
            if self.effects_enabled { self.bass } else { 0.0 },
            if self.effects_enabled { self.mid } else { 0.0 },
            if self.effects_enabled {
                self.treble
            } else {
                0.0
            },
        );
        set_stereo_width(
            self.dsp,
            if self.effects_enabled && !self.stereo_widener_enabled {
                (self.stereo_width / 100.0).clamp(0.0, 2.2)
            } else {
                1.0
            },
        );
        set_stereo_widener_params(
            self.dsp,
            (self.effects_enabled && self.stereo_widener_enabled) as c_int,
            self.stereo_width.clamp(0.0, 220.0),
            self.stereo_widener_center_level.clamp(-12.0, 12.0),
            self.stereo_widener_side_level.clamp(-12.0, 12.0),
            self.stereo_widener_bass_to_mono.clamp(40.0, 400.0),
        );
        set_bass_boost(
            self.dsp,
            (self.effects_enabled && self.bass_boost_enabled && self.bass_boost.abs() > 0.01)
                as c_int,
            self.bass_boost.clamp(0.0, 18.0),
            self.bass_frequency.clamp(35.0, 220.0),
        );
        set_compressor_params(
            self.dsp,
            (self.effects_enabled && self.compressor_enabled) as c_int,
            self.compressor_threshold.clamp(-60.0, 0.0),
            self.compressor_ratio.clamp(1.0, 20.0),
            self.compressor_attack.clamp(0.1, 200.0),
            self.compressor_release.clamp(10.0, 1000.0),
            self.compressor_makeup_gain.clamp(-12.0, 24.0),
        );
        let auto_gain_speed = match self.auto_gain_speed.as_str() {
            "slow" => 0,
            "fast" => 2,
            _ => 1,
        };
        set_auto_gain_params(
            self.dsp,
            (self.effects_enabled && self.auto_gain_enabled) as c_int,
            self.auto_gain_target_level.clamp(-24.0, -6.0),
            self.auto_gain_max_gain.clamp(0.0, 24.0),
            auto_gain_speed,
        );
        set_limiter_params(
            self.dsp,
            (self.effects_enabled && self.limiter_enabled) as c_int,
            self.limiter_ceiling.clamp(-12.0, 0.0),
            self.limiter_release.clamp(5.0, 1000.0),
            self.limiter_lookahead.clamp(0.0, 20.0),
            self.limiter_gain_db.clamp(-12.0, 12.0),
        );
        let oversampling = match self.true_peak_oversampling {
            2 | 4 | 8 => self.true_peak_oversampling,
            _ => 1,
        };
        set_true_peak_params(
            self.dsp,
            (self.effects_enabled && self.true_peak_enabled) as c_int,
            self.true_peak_ceiling.clamp(-6.0, 0.0),
            self.true_peak_release.clamp(5.0, 500.0),
            self.true_peak_lookahead.clamp(0.0, 20.0),
            self.true_peak_drive.clamp(0.0, 12.0),
            oversampling as c_int,
            self.true_peak_stereo_link as c_int,
        );
        set_exciter_params(
            self.dsp,
            (self.effects_enabled && self.exciter_enabled) as c_int,
            self.exciter_frequency.clamp(1000.0, 12000.0),
            self.exciter_amount.clamp(0.0, 100.0),
            self.exciter_mix.clamp(0.0, 100.0),
            exciter_harmonic_type(&self.exciter_harmonics) as c_int,
        );
        set_deesser_params(
            self.dsp,
            (self.effects_enabled && self.deesser_enabled) as c_int,
            self.deesser_frequency.clamp(2000.0, 12000.0),
            self.deesser_threshold.clamp(-60.0, 0.0),
            self.deesser_ratio.clamp(1.0, 20.0),
            self.deesser_range.clamp(-24.0, 0.0),
        );
        set_gate_params(
            self.dsp,
            (self.effects_enabled && self.noise_gate_enabled) as c_int,
            self.noise_gate_threshold.clamp(-90.0, 0.0),
            self.noise_gate_attack.clamp(0.1, 100.0),
            self.noise_gate_hold.clamp(0.0, 500.0),
            self.noise_gate_release.clamp(10.0, 1000.0),
            self.noise_gate_range.clamp(-100.0, 0.0),
        );
        set_echo_params(
            self.dsp,
            (self.effects_enabled && self.echo_enabled) as c_int,
            self.echo_delay.clamp(40.0, 1800.0),
            ((self.echo_feedback / 100.0) * if self.echo_soft_mode { 0.82 } else { 1.0 })
                .clamp(0.0, 0.95),
            ((self.echo_mix / 100.0) * if self.echo_soft_mode { 0.92 } else { 1.0 })
                .clamp(0.0, 1.0),
            self.echo_high_cut.clamp(800.0, 18000.0),
            self.echo_soft_mode as c_int,
        );
        set_convolution_reverb_params(
            self.dsp,
            (self.effects_enabled && self.conv_reverb_enabled) as c_int,
            (self.conv_reverb_mix / 100.0).clamp(0.0, 1.0),
            self.conv_reverb_predelay.clamp(0.0, 120.0),
            conv_reverb_preset_type(&self.conv_reverb_preset) as c_int,
        );
        for (index, (freq, gain, q)) in self.peq_bands.iter().copied().enumerate() {
            set_peq_band(
                self.dsp,
                index as c_int,
                (self.effects_enabled && self.peq_enabled) as c_int,
                freq.clamp(20.0, 20000.0),
                gain.clamp(-18.0, 18.0),
                q.clamp(0.1, 12.0),
            );
        }
        set_crossfeed_params(
            self.dsp,
            (self.effects_enabled && self.crossfeed_enabled) as c_int,
            self.crossfeed_level.clamp(0.0, 100.0),
            self.crossfeed_delay.clamp(0.0, 1.5),
            self.crossfeed_low_cut.clamp(80.0, 1600.0),
            self.crossfeed_high_cut.clamp(1000.0, 9000.0),
        );
        set_bass_mono_params(
            self.dsp,
            (self.effects_enabled && self.bass_mono_enabled) as c_int,
            self.bass_mono_cutoff.clamp(40.0, 300.0),
            self.bass_mono_slope.clamp(6.0, 48.0),
            self.bass_mono_width.clamp(0.0, 200.0),
        );
        set_dynamic_eq_params(
            self.dsp,
            (self.effects_enabled && self.dynamic_eq_enabled) as c_int,
            self.dynamic_eq_frequency.clamp(20.0, 20000.0),
            self.dynamic_eq_q.clamp(0.1, 10.0),
            self.dynamic_eq_threshold.clamp(-80.0, 0.0),
            self.dynamic_eq_gain.clamp(-24.0, 24.0),
            self.dynamic_eq_range.clamp(0.0, 24.0),
            self.dynamic_eq_attack.clamp(1.0, 2000.0),
            self.dynamic_eq_release.clamp(5.0, 5000.0),
        );
        let downsample = self.downsample.clamp(1, 16);
        set_bit_dither_params(
            self.dsp,
            (self.effects_enabled && self.bit_dither_enabled) as c_int,
            self.bit_depth.clamp(4, 24) as c_int,
            self.dither.clamp(0, 2) as c_int,
            self.shaping.clamp(0, 1) as c_int,
            downsample as c_int,
            self.bit_dither_mix.clamp(0.0, 100.0),
            self.bit_dither_output_db.clamp(-12.0, 12.0),
        );
        set_tape_saturation_params(
            self.dsp,
            (self.effects_enabled && self.tape_saturation_enabled) as c_int,
            self.tape_drive_db.clamp(0.0, 24.0),
            self.tape_mix.clamp(0.0, 100.0),
            self.tape_tone.clamp(0.0, 100.0),
            self.tape_output_db.clamp(-12.0, 12.0),
            self.tape_mode.clamp(0, 2) as c_int,
            self.tape_hiss.clamp(0.0, 100.0),
        );
        set_surround_params(
            self.dsp,
            (self.effects_enabled && self.surround_enabled) as c_int,
            self.surround_center_level.clamp(-12.0, 12.0),
            self.surround_side_level.clamp(-12.0, 12.0),
            self.surround_lfe_level.clamp(-12.0, 12.0),
            self.surround_crossover.clamp(40.0, 220.0),
            self.surround_delay.clamp(0.0, 30.0),
            self.surround_mix.clamp(0.0, 100.0),
        );
    }

    fn apply_effects(&mut self, payload: NativeEffectsPayload) {
        self.effects_enabled = payload.effects_enabled;
        for (index, gain) in payload.eq_gains.into_iter().take(EQ_BANDS).enumerate() {
            self.eq_gains[index] = gain.clamp(-15.0, 15.0);
        }
        let settings = payload.dsp_settings;
        self.preamp_db = settings.preamp_db.clamp(-24.0, 24.0);
        self.output_device = if settings.output_device.trim().is_empty() {
            "default".to_string()
        } else {
            settings.output_device.trim().to_string()
        };
        self.sample_rate = if settings.sample_rate.trim().is_empty() {
            "auto".to_string()
        } else {
            settings.sample_rate.trim().to_string()
        };
        self.bass_boost_enabled = settings.bass_boost_enabled;
        let module_bass = settings.bass_boost.clamp(0.0, 12.0);
        let bass_mix = (settings.bass_mix.max(0.0) / 100.0).clamp(0.0, 1.0);
        self.bass = if self.bass_boost_enabled {
            0.0
        } else {
            module_bass
        };
        self.mid = settings.mid_gain.clamp(-12.0, 12.0);
        self.treble = settings.treble_gain.clamp(-12.0, 12.0);
        self.bass_boost = if self.bass_boost_enabled {
            (module_bass * bass_mix).clamp(0.0, 18.0)
        } else {
            0.0
        };
        self.bass_frequency = settings.bass_frequency.clamp(35.0, 220.0);
        self.effect_output_gain = bass_output_gain(self.bass, self.bass_boost);
        self.stereo_width = settings.stereo_width.clamp(0.0, 220.0);
        self.stereo_widener_enabled = settings.stereo_widener_enabled;
        self.stereo_widener_center_level = settings.stereo_widener_center_level;
        self.stereo_widener_side_level = settings.stereo_widener_side_level;
        self.stereo_widener_bass_to_mono = settings.stereo_widener_bass_to_mono;
        self.balance = settings.balance.clamp(-100.0, 100.0);
        self.compressor = settings.compressor.clamp(0.0, 1.0);
        self.limiter = settings.limiter.clamp(-12.0, 0.0);
        self.reverb = settings.reverb.clamp(0.0, 0.55);
        self.reverb_enabled = settings.reverb_enabled;
        self.reverb_room_size = settings.reverb_room_size;
        self.reverb_wet_dry = settings.reverb_wet_dry;
        self.reverb_hf_ratio = settings.reverb_hf_ratio;
        self.reverb_input_gain = settings.reverb_input_gain;
        self.conv_reverb_enabled = settings.conv_reverb_enabled;
        self.conv_reverb_mix = settings.conv_reverb_mix;
        self.conv_reverb_predelay = settings.conv_reverb_predelay;
        self.conv_reverb_preset = settings.conv_reverb_preset;
        self.compressor_enabled = settings.compressor_enabled || self.compressor > 0.01;
        self.compressor_threshold = settings.compressor_threshold;
        self.compressor_ratio = settings.compressor_ratio;
        self.compressor_attack = settings.compressor_attack;
        self.compressor_release = settings.compressor_release;
        self.compressor_makeup_gain = settings.compressor_makeup_gain;
        self.auto_gain_enabled = settings.auto_gain_enabled;
        self.auto_gain_target_level = settings.auto_gain_target_level;
        self.auto_gain_max_gain = settings.auto_gain_max_gain;
        self.auto_gain_speed = settings.auto_gain_speed;
        self.limiter_enabled = settings.limiter_enabled || self.limiter < -0.01;
        self.limiter_ceiling = settings.limiter_ceiling;
        self.limiter_release = settings.limiter_release;
        self.limiter_lookahead = settings.limiter_lookahead;
        self.limiter_gain_db = settings.limiter_gain_db;
        self.true_peak_enabled = settings.true_peak_enabled;
        self.true_peak_ceiling = settings.true_peak_ceiling;
        self.true_peak_release = settings.true_peak_release;
        self.true_peak_lookahead = settings.true_peak_lookahead;
        self.true_peak_drive = settings.true_peak_drive;
        self.true_peak_oversampling = settings.true_peak_oversampling;
        self.true_peak_stereo_link = settings.true_peak_stereo_link;
        self.exciter_enabled = settings.exciter_enabled;
        self.exciter_frequency = settings.exciter_frequency;
        self.exciter_amount = settings.exciter_amount;
        self.exciter_mix = settings.exciter_mix;
        self.exciter_harmonics = settings.exciter_harmonics;
        self.deesser_enabled = settings.deesser_enabled;
        self.deesser_frequency = settings.deesser_frequency;
        self.deesser_threshold = settings.deesser_threshold;
        self.deesser_ratio = settings.deesser_ratio;
        self.deesser_range = settings.deesser_range;
        self.echo_enabled = settings.echo_enabled;
        self.echo_delay = settings.echo_delay;
        self.echo_feedback = settings.echo_feedback;
        self.echo_mix = settings.echo_mix;
        self.echo_high_cut = settings.echo_high_cut;
        self.echo_soft_mode = settings.echo_soft_mode;
        self.noise_gate_enabled = settings.noise_gate_enabled;
        self.noise_gate_threshold = settings.noise_gate_threshold;
        self.noise_gate_attack = settings.noise_gate_attack;
        self.noise_gate_hold = settings.noise_gate_hold;
        self.noise_gate_release = settings.noise_gate_release;
        self.noise_gate_range = settings.noise_gate_range;
        self.peq_enabled = settings.peq_enabled;
        self.peq_bands = [
            (60.0, 0.0, 1.0),
            (150.0, 0.0, 1.0),
            (400.0, 0.0, 1.0),
            (1500.0, 0.0, 1.0),
            (5000.0, 0.0, 1.0),
            (12000.0, 0.0, 1.0),
        ];
        for (index, band) in settings.peq_bands.into_iter().take(6).enumerate() {
            self.peq_bands[index] = (band.freq, band.gain, band.q);
        }
        self.crossfeed_enabled = settings.crossfeed_enabled;
        self.crossfeed_level = settings.crossfeed_level;
        self.crossfeed_delay = settings.crossfeed_delay;
        self.crossfeed_low_cut = settings.crossfeed_low_cut;
        self.crossfeed_high_cut = settings.crossfeed_high_cut;
        self.bass_mono_enabled = settings.bass_mono_enabled;
        self.bass_mono_cutoff = settings.bass_mono_cutoff;
        self.bass_mono_slope = settings.bass_mono_slope;
        self.bass_mono_width = settings.bass_mono_width;
        self.dynamic_eq_enabled = settings.dynamic_eq_enabled;
        self.dynamic_eq_frequency = settings.dynamic_eq_frequency;
        self.dynamic_eq_q = settings.dynamic_eq_q;
        self.dynamic_eq_threshold = settings.dynamic_eq_threshold;
        self.dynamic_eq_gain = settings.dynamic_eq_gain;
        self.dynamic_eq_range = settings.dynamic_eq_range;
        self.dynamic_eq_attack = settings.dynamic_eq_attack;
        self.dynamic_eq_release = settings.dynamic_eq_release;
        self.bit_dither_enabled = settings.bit_dither_enabled;
        self.bit_depth = settings.bit_depth;
        self.dither = settings.dither;
        self.shaping = settings.shaping;
        self.downsample = settings.downsample;
        self.bit_dither_mix = settings.bit_dither_mix;
        self.bit_dither_output_db = settings.bit_dither_output_db;
        self.tape_saturation_enabled = settings.tape_saturation_enabled;
        self.tape_drive_db = settings.tape_drive_db;
        self.tape_mix = settings.tape_mix;
        self.tape_tone = settings.tape_tone;
        self.tape_output_db = settings.tape_output_db;
        self.tape_mode = settings.tape_mode;
        self.tape_hiss = settings.tape_hiss;
        self.surround_enabled = settings.surround_enabled;
        self.surround_center_level = settings.surround_center_level;
        self.surround_side_level = settings.surround_side_level;
        self.surround_lfe_level = settings.surround_lfe_level;
        self.surround_crossover = settings.surround_crossover;
        self.surround_delay = settings.surround_delay;
        self.surround_mix = settings.surround_mix;
        unsafe {
            self.apply_dsp_params();
        }
        self.apply_volume();
        self.apply_reverb();
    }

    fn apply_volume(&self) {
        if self.stream == 0 {
            return;
        }
        let vol = self.output_volume();
        unsafe {
            BASS_ChannelSetAttribute(self.stream, BASS_ATTRIB_VOL, vol);
            BASS_ChannelSetAttribute(
                self.stream,
                BASS_ATTRIB_PAN,
                (self.balance / 100.0).clamp(-1.0, 1.0),
            );
        }
    }

    fn output_volume(&self) -> f32 {
        let vol = if self.muted {
            0.0
        } else {
            self.volume.clamp(0.0, 1.0)
        };
        let preamp = db_to_linear(self.preamp_db.clamp(-24.0, 24.0)).clamp(0.0, 4.0);
        vol * preamp
            * if self.effects_enabled {
                self.effect_output_gain
            } else {
                1.0
            }
    }

    fn apply_reverb(&mut self) {
        if self.stream == 0 {
            return;
        }
        unsafe {
            if self.effects_enabled && (self.reverb_enabled || self.reverb > 0.001) {
                if self.reverb_fx == 0 {
                    self.reverb_fx = BASS_ChannelSetFX(self.stream, BASS_FX_DX8_REVERB, 2);
                }
                if self.reverb_fx != 0 {
                    let params = BassDx8Reverb {
                        f_in_gain: self.reverb_input_gain.clamp(-96.0, 0.0),
                        f_reverb_mix: self.reverb_wet_dry.clamp(-96.0, 0.0),
                        f_reverb_time: self.reverb_room_size.clamp(1.0, 3000.0),
                        f_high_freq_rt_ratio: self.reverb_hf_ratio.clamp(0.001, 0.999),
                    };
                    BASS_FXSetParameters(self.reverb_fx, &params as *const _ as *const c_void);
                }
            } else if self.reverb_fx != 0 {
                BASS_ChannelRemoveFX(self.stream, self.reverb_fx);
                self.reverb_fx = 0;
            }
        }
    }

    fn play(&self) -> Result<(), String> {
        if self.stream == 0 {
            return Err("Yuklu parca yok".to_string());
        }
        let ok = unsafe { BASS_ChannelPlay(self.stream, 0) } != 0;
        if ok {
            Ok(())
        } else {
            Err(format!("BASS play hata: {}", unsafe {
                BASS_ErrorGetCode()
            }))
        }
    }

    fn pause(&self) {
        if self.stream != 0 {
            unsafe {
                BASS_ChannelPause(self.stream);
            }
        }
    }

    fn stop(&self) {
        if self.stream != 0 {
            unsafe {
                BASS_ChannelStop(self.stream);
                BASS_ChannelSetPosition(self.stream, 0, BASS_POS_BYTE);
            }
        }
    }

    fn seek(&mut self, seconds: f64) -> Result<(), String> {
        if self.stream == 0 {
            return Err("Yuklu parca yok".to_string());
        }
        let was_playing = self.playing();
        let target_volume = self.output_volume();

        let ok = {
            let _callback_guard = CALLBACK_LOCK
                .lock()
                .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
            if was_playing && self.effects_enabled {
                unsafe {
                    BASS_ChannelSlideAttribute(self.stream, BASS_ATTRIB_VOL, 0.0, 24);
                }
                thread::sleep(Duration::from_millis(24));
                unsafe {
                    BASS_ChannelPause(self.stream);
                    BASS_ChannelSetAttribute(self.stream, BASS_ATTRIB_VOL, 0.0);
                }
            }
            let bytes = unsafe { BASS_ChannelSeconds2Bytes(self.stream, seconds.max(0.0)) };
            let ok = unsafe { BASS_ChannelSetPosition(self.stream, bytes, BASS_POS_BYTE) } != 0;
            if ok && self.effects_enabled && !self.dsp.is_null() {
                unsafe {
                    reset_dsp_state(self.dsp);
                }
            }
            ok
        };

        if ok {
            if was_playing && self.effects_enabled {
                unsafe {
                    BASS_ChannelPlay(self.stream, 0);
                    BASS_ChannelSlideAttribute(self.stream, BASS_ATTRIB_VOL, target_volume, 190);
                }
            }
            Ok(())
        } else {
            if was_playing && self.effects_enabled {
                unsafe {
                    BASS_ChannelSetAttribute(self.stream, BASS_ATTRIB_VOL, target_volume);
                }
            }
            Err(format!("BASS seek hata: {}", unsafe {
                BASS_ErrorGetCode()
            }))
        }
    }

    fn position(&self) -> f64 {
        if self.stream == 0 {
            return 0.0;
        }
        let pos = unsafe { BASS_ChannelGetPosition(self.stream, BASS_POS_BYTE) };
        unsafe { BASS_ChannelBytes2Seconds(self.stream, pos) }
    }

    fn duration(&self) -> f64 {
        if self.stream == 0 {
            return 0.0;
        }
        let len = unsafe { BASS_ChannelGetLength(self.stream, BASS_POS_BYTE) };
        unsafe { BASS_ChannelBytes2Seconds(self.stream, len) }
    }

    fn playing(&self) -> bool {
        self.stream != 0 && unsafe { BASS_ChannelIsActive(self.stream) == BASS_ACTIVE_PLAYING }
    }

    fn update_visual_spectrum(&self, samples: &[f32], raw: bool) {
        if samples.len() < 4 {
            return;
        }
        let Ok(mut visual) = self.visual.try_lock() else {
            return;
        };
        let frames = samples.len() / 2;
        for frame in 0..frames {
            let left = samples[frame * 2].clamp(-1.0, 1.0);
            let right = samples[frame * 2 + 1].clamp(-1.0, 1.0);
            let mono = ((left + right) * 0.5).clamp(-1.0, 1.0);
            if raw {
                let write = visual.raw_pcm_write;
                visual.raw_pcm[write] = mono;
                visual.raw_pcm_write = (write + 1) % VISUAL_PCM_SAMPLES;
            } else {
                let write = visual.pcm_write;
                visual.pcm[write] = mono;
                let stereo_write = write * 2;
                visual.pcm_stereo[stereo_write] = left;
                visual.pcm_stereo[stereo_write + 1] = right;
                visual.pcm_write = (write + 1) % VISUAL_PCM_SAMPLES;
            }
        }
        if raw {
            visual.raw_pcm_len = (visual.raw_pcm_len + frames).min(VISUAL_PCM_SAMPLES);
        } else {
            visual.pcm_len = (visual.pcm_len + frames).min(VISUAL_PCM_SAMPLES);
        }
    }

    #[allow(dead_code)]
    fn spectrum(&self, bands: usize) -> Vec<f32> {
        let count = bands.clamp(8, 256);
        let mut visual = match self.visual.lock() {
            Ok(visual) => visual,
            Err(_) => return vec![0.0; count],
        };
        if self.stream == 0 || !self.playing() {
            for value in visual.spectrum.iter_mut() {
                *value *= 0.9;
            }
        } else {
            let mut fft = [0.0f32; 1024];
            let got = unsafe {
                BASS_ChannelGetData(
                    self.stream,
                    fft.as_mut_ptr() as *mut c_void,
                    BASS_DATA_FFT2048,
                )
            };
            if got <= 0 {
                for value in visual.spectrum.iter_mut() {
                    *value *= 0.92;
                }
            } else {
                let sample_rate = visual.sample_rate.max(8_000.0);
                let nyquist = sample_rate * 0.5;
                let min_hz = 38.0f32;
                let max_hz = (nyquist * 0.82).min(15_500.0).max(min_hz * 2.0);
                let log_range = max_hz / min_hz;
                let mut peak_value = 0.0001f32;
                let mut next = [0.0f32; VISUAL_BANDS];
                let bin_for_frequency = |frequency: f32| -> usize {
                    let norm = (frequency / nyquist).clamp(0.0, 0.999);
                    (norm * (fft.len() - 1) as f32).round() as usize
                };

                for band in 0..VISUAL_BANDS {
                    let pos = (band as f32 + 0.5) / VISUAL_BANDS as f32;
                    let center_hz = min_hz * log_range.powf(pos);
                    let next_hz = min_hz
                        * log_range.powf(((band + 1) as f32 / VISUAL_BANDS as f32).min(0.999));
                    let prev_hz =
                        min_hz * log_range.powf((band as f32 / VISUAL_BANDS as f32).max(0.001));
                    let first = bin_for_frequency(
                        (center_hz - (center_hz - prev_hz).max(18.0)).max(min_hz),
                    );
                    let last = bin_for_frequency(
                        (center_hz + (next_hz - center_hz).max(18.0)).min(max_hz),
                    )
                    .max(first + 1);
                    let mut sum = 0.0f32;
                    let mut peak = 0.0f32;
                    let mut samples_in_band = 0.0f32;
                    for bin in first..=last.min(fft.len() - 1) {
                        let value = fft[bin].max(0.0);
                        sum += value;
                        peak = peak.max(value);
                        samples_in_band += 1.0;
                    }
                    let average = if samples_in_band > 0.0 {
                        sum / samples_in_band
                    } else {
                        peak
                    };
                    let mixed = peak * 0.72 + average * 0.28;
                    let bass_tame = 0.42 + pos.powf(0.72) * 0.72;
                    let high_lift = 0.92 + pos.powf(1.3) * 0.42;
                    let independent = 0.9 + (((band * 37) % 29) as f32 / 28.0) * 0.16;
                    let raw = mixed * 13.5 * bass_tame * high_lift * independent;
                    let shaped = raw.clamp(0.0, 1.0).powf(0.5);
                    next[band] = shaped;
                    peak_value = peak_value.max(shaped);
                }

                let normalize = (0.74 / peak_value).clamp(0.72, 1.75);
                for band in 0..VISUAL_BANDS {
                    let pos = band as f32 / (VISUAL_BANDS - 1) as f32;
                    let limit = 0.78 + pos.powf(0.7) * 0.14;
                    let target = (next[band] * normalize).min(limit);
                    let current = visual.spectrum[band];
                    let alpha = if target > current { 0.86 } else { 0.58 };
                    visual.spectrum[band] = current + (target - current) * alpha;
                }
            }
        }
        let mut out = vec![0.0; count];
        for (index, value) in out.iter_mut().enumerate() {
            let source_index =
                (index as f32 / (count - 1).max(1) as f32) * (VISUAL_BANDS - 1) as f32;
            let low = source_index.floor() as usize;
            let high = (low + 1).min(VISUAL_BANDS - 1);
            let frac = source_index - low as f32;
            *value = (visual.spectrum[low] * (1.0 - frac) + visual.spectrum[high] * frac)
                .clamp(0.0, 1.0);
        }
        out
    }

    fn smooth_pcm_spectrum(&self, bands: usize) -> Vec<f32> {
        self.smooth_pcm_spectrum_for(bands, false)
    }

    fn raw_pcm_spectrum(&self, bands: usize) -> Vec<f32> {
        self.smooth_pcm_spectrum_for(bands, true)
    }

    fn smooth_pcm_spectrum_for(&self, bands: usize, raw: bool) -> Vec<f32> {
        let count = bands.clamp(8, 256);
        if self.stream == 0 || !self.playing() {
            if let Ok(mut visual) = self.visual.try_lock() {
                let spectrum = if raw {
                    &mut visual.raw_spectrum
                } else {
                    &mut visual.spectrum
                };
                for value in spectrum.iter_mut() {
                    *value *= 0.9;
                }
                return Self::resample_visual_spectrum(spectrum, count);
            }
            return vec![0.0; count];
        }

        const FFT_SAMPLES: usize = 512;
        let (samples, sample_rate, available) = {
            let visual = match self.visual.try_lock() {
                Ok(visual) => visual,
                Err(_) => return self.cached_visual_spectrum(count),
            };
            let pcm_len = if raw {
                visual.raw_pcm_len
            } else {
                visual.pcm_len
            };
            let pcm_write = if raw {
                visual.raw_pcm_write
            } else {
                visual.pcm_write
            };
            let pcm = if raw { &visual.raw_pcm } else { &visual.pcm };
            let available = pcm_len.min(VISUAL_PCM_SAMPLES).min(FFT_SAMPLES);
            let mut samples = [0.0f32; FFT_SAMPLES];
            if available > 0 {
                let start = (pcm_write + VISUAL_PCM_SAMPLES - available) % VISUAL_PCM_SAMPLES;
                let offset = FFT_SAMPLES - available;
                for index in 0..available {
                    samples[offset + index] = pcm[(start + index) % VISUAL_PCM_SAMPLES];
                }
            }
            (samples, visual.sample_rate.max(8_000.0), available)
        };

        if available < 96 {
            if let Ok(mut visual) = self.visual.try_lock() {
                let spectrum = if raw {
                    &mut visual.raw_spectrum
                } else {
                    &mut visual.spectrum
                };
                for value in spectrum.iter_mut() {
                    *value *= 0.92;
                }
                return Self::resample_visual_spectrum(spectrum, count);
            }
            return self.cached_visual_spectrum(count);
        }

        let mean = samples.iter().copied().sum::<f32>() / FFT_SAMPLES as f32;
        let rms = (samples
            .iter()
            .map(|sample| {
                let centered = *sample - mean;
                centered * centered
            })
            .sum::<f32>()
            / FFT_SAMPLES as f32)
            .sqrt();
        let mut windowed = [0.0f32; FFT_SAMPLES];
        for (index, sample) in samples.iter().enumerate() {
            let window = 0.5
                - 0.5
                    * ((2.0 * std::f32::consts::PI * index as f32) / (FFT_SAMPLES - 1) as f32)
                        .cos();
            windowed[index] = (*sample - mean) * window;
        }
        let nyquist = sample_rate * 0.5;
        let min_hz = 38.0f32;
        let max_hz = (nyquist * 0.82).min(15_500.0).max(min_hz * 2.0);
        let log_range = max_hz / min_hz;
        let mut peak_value = 0.0001f32;
        let mut next = [0.0f32; VISUAL_BANDS];

        for band in 0..VISUAL_BANDS {
            let pos = (band as f32 + 0.5) / VISUAL_BANDS as f32;
            let frequency = min_hz * log_range.powf(pos);
            let omega = 2.0 * std::f32::consts::PI * frequency / sample_rate;
            let coeff = 2.0 * omega.cos();
            let mut q0;
            let mut q1 = 0.0f32;
            let mut q2 = 0.0f32;
            for sample in windowed.iter() {
                q0 = *sample + coeff * q1 - q2;
                q2 = q1;
                q1 = q0;
            }
            let power = (q1 * q1 + q2 * q2 - q1 * q2 * coeff).max(0.0).sqrt() / FFT_SAMPLES as f32;
            let bass_tame = 0.44 + pos.powf(0.72) * 0.7;
            let high_lift = 0.94 + pos.powf(1.35) * 0.45;
            let independent = 0.9 + (((band * 37) % 29) as f32 / 28.0) * 0.14;
            let raw = power * 28.0 * bass_tame * high_lift * independent;
            let shaped = raw.clamp(0.0, 1.0).powf(0.48);
            next[band] = shaped;
            peak_value = peak_value.max(shaped);
        }

        if let Ok(mut visual) = self.visual.try_lock() {
            let wanted_gain = if rms > 0.0008 {
                (0.105 / rms).clamp(0.62, 1.55)
            } else {
                0.88
            };
            if raw {
                visual.raw_adaptive_gain += (wanted_gain - visual.raw_adaptive_gain) * 0.16;
            } else {
                visual.adaptive_gain += (wanted_gain - visual.adaptive_gain) * 0.16;
            }
            let adaptive_gain = if raw {
                visual.raw_adaptive_gain
            } else {
                visual.adaptive_gain
            };
            let normalize =
                ((0.58 / peak_value).clamp(0.82, 1.28) * adaptive_gain).clamp(0.58, 1.45);
            let spectrum = if raw {
                &mut visual.raw_spectrum
            } else {
                &mut visual.spectrum
            };
            for band in 0..VISUAL_BANDS {
                let pos = band as f32 / (VISUAL_BANDS - 1) as f32;
                let limit = 0.72 + pos.powf(0.7) * 0.12;
                let target = (next[band] * normalize).min(limit);
                let current = spectrum[band];
                let alpha = if target > current { 0.86 } else { 0.42 };
                spectrum[band] = current + (target - current) * alpha;
            }
            return Self::resample_visual_spectrum(spectrum, count);
        }

        self.cached_visual_spectrum(count)
    }

    fn cached_visual_spectrum(&self, count: usize) -> Vec<f32> {
        match self.visual.try_lock() {
            Ok(visual) => Self::resample_visual_spectrum(&visual.spectrum, count),
            Err(_) => vec![0.0; count],
        }
    }

    fn resample_visual_spectrum(spectrum: &[f32; VISUAL_BANDS], count: usize) -> Vec<f32> {
        let mut out = vec![0.0; count];
        for (index, value) in out.iter_mut().enumerate() {
            let source_index =
                (index as f32 / (count - 1).max(1) as f32) * (VISUAL_BANDS - 1) as f32;
            let low = source_index.floor() as usize;
            let high = (low + 1).min(VISUAL_BANDS - 1);
            let frac = source_index - low as f32;
            *value = (spectrum[low] * (1.0 - frac) + spectrum[high] * frac).clamp(0.0, 1.0);
        }
        out
    }

    fn projectm_pcm_stereo(&self, count_per_channel: usize) -> Vec<f32> {
        let count = count_per_channel.clamp(64, VISUAL_PCM_SAMPLES);
        let visual = match self.visual.lock() {
            Ok(visual) => visual,
            Err(_) => return vec![0.0; count * 2],
        };
        if visual.pcm_len == 0 {
            return vec![0.0; count * 2];
        }
        let available = visual.pcm_len.min(VISUAL_PCM_SAMPLES);
        let read_count = count.min(available);
        let start = (visual.pcm_write + VISUAL_PCM_SAMPLES - read_count) % VISUAL_PCM_SAMPLES;
        let mut out = vec![0.0f32; count * 2];
        let offset = count.saturating_sub(read_count);
        for index in 0..read_count {
            let source = (start + index) % VISUAL_PCM_SAMPLES;
            let target = (offset + index) * 2;
            out[target] = visual.pcm_stereo[source * 2];
            out[target + 1] = visual.pcm_stereo[source * 2 + 1];
        }
        apply_projectm_visual_gain(&mut out);
        out
    }

    fn state(&self) -> NativeAudioState {
        NativeAudioState {
            available: true,
            initialized: self.initialized,
            loaded: self.stream != 0,
            playing: self.playing(),
            position: self.position(),
            duration: self.duration(),
        }
    }
}

fn apply_projectm_visual_gain(samples: &mut [f32]) {
    if samples.is_empty() {
        return;
    }

    let mut peak = 0.0f32;
    let mut sum_sq = 0.0f32;
    for sample in samples.iter() {
        let value = sample.clamp(-1.0, 1.0);
        peak = peak.max(value.abs());
        sum_sq += value * value;
    }
    if peak <= 0.0 {
        return;
    }

    let rms = (sum_sq / samples.len().max(1) as f32).sqrt();
    let peak_gain = 0.72 / peak.max(1e-6);
    let rms_gain = 0.18 / rms.max(1e-6);
    let gain = peak_gain.min(rms_gain).clamp(1.0, 8.0);
    if gain <= 1.02 {
        return;
    }

    for sample in samples.iter_mut() {
        *sample = (*sample * gain).tanh();
    }
}

unsafe extern "C" fn dsp_callback(
    _handle: HDsp,
    channel: Dword,
    buffer: *mut c_void,
    length: Dword,
    user: *mut c_void,
) {
    if user.is_null() || buffer.is_null() || length == 0 {
        return;
    }
    let engine = &mut *(user as *mut NativeAudioEngine);

    let mut info = BassChannelInfo::default();
    unsafe {
        BASS_ChannelGetInfo(channel, &mut info);
    }
    let chans = if info.chans > 0 {
        info.chans as usize
    } else {
        2
    };

    let frames = (length as usize / std::mem::size_of::<f32>() / chans) as c_int;
    if frames <= 0 {
        return;
    }

    let raw_floats = std::slice::from_raw_parts(buffer as *const f32, frames as usize * chans);

    // We need to convert it to stereo for the visualizer to avoid out-of-bounds
    let mut stereo_samples = vec![0.0f32; frames as usize * 2];
    for i in 0..(frames as usize) {
        let left = raw_floats[i * chans];
        let right = if chans > 1 {
            raw_floats[i * chans + 1]
        } else {
            left
        };
        stereo_samples[i * 2] = left;
        stereo_samples[i * 2 + 1] = right;
    }

    engine.update_visual_spectrum(&stereo_samples, true);

    let Ok(_callback_guard) = CALLBACK_LOCK.try_lock() else {
        if engine.effects_enabled {
            let samples =
                std::slice::from_raw_parts_mut(buffer as *mut f32, frames as usize * chans);
            samples.fill(0.0);
            engine.update_visual_spectrum(&vec![0.0f32; frames as usize * 2], false);
        }
        return;
    };
    if engine.effects_enabled && engine.dsp.is_null() {
        let samples = std::slice::from_raw_parts_mut(buffer as *mut f32, frames as usize * chans);
        samples.fill(0.0);
        engine.update_visual_spectrum(&vec![0.0f32; frames as usize * 2], false);
        return;
    }
    if !engine.dsp.is_null() && engine.effects_enabled {
        process_dsp(engine.dsp, buffer as *mut f32, frames, chans as i32);
    }

    let processed_floats =
        std::slice::from_raw_parts(buffer as *const f32, frames as usize * chans);
    for i in 0..(frames as usize) {
        let left = processed_floats[i * chans];
        let right = if chans > 1 {
            processed_floats[i * chans + 1]
        } else {
            left
        };
        stereo_samples[i * 2] = left;
        stereo_samples[i * 2 + 1] = right;
    }
    engine.update_visual_spectrum(&stereo_samples, false);
}

static ENGINE: OnceLock<Mutex<NativeAudioEngine>> = OnceLock::new();
static CALLBACK_LOCK: Mutex<()> = Mutex::new(());
static SPECTRUM_CACHE: OnceLock<Mutex<Vec<f32>>> = OnceLock::new();

fn engine() -> &'static Mutex<NativeAudioEngine> {
    ENGINE.get_or_init(|| Mutex::new(NativeAudioEngine::new()))
}

fn spectrum_cache() -> &'static Mutex<Vec<f32>> {
    SPECTRUM_CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

fn with_engine<T>(
    f: impl FnOnce(&mut NativeAudioEngine) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = engine()
        .lock()
        .map_err(|_| "Native ses motoru kilidi alinamadi".to_string())?;
    f(&mut guard)
}

pub fn init() -> Result<(), String> {
    with_engine(|engine| engine.init())
}

pub fn state() -> NativeAudioState {
    engine()
        .lock()
        .map(|engine| engine.state())
        .unwrap_or_else(|_| NativeAudioState::default())
}

pub fn load_file(path: String) -> Result<f64, String> {
    with_engine(|engine| {
        let _callback_guard = CALLBACK_LOCK
            .lock()
            .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
        engine.load_file(&path)
    })
}

pub fn play() -> Result<(), String> {
    with_engine(|engine| {
        let _callback_guard = CALLBACK_LOCK
            .lock()
            .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
        engine.play()
    })
}

pub fn pause() -> Result<(), String> {
    with_engine(|engine| {
        let _callback_guard = CALLBACK_LOCK
            .lock()
            .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
        engine.pause();
        Ok(())
    })
}

pub fn stop() -> Result<(), String> {
    with_engine(|engine| {
        let _callback_guard = CALLBACK_LOCK
            .lock()
            .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
        engine.stop();
        Ok(())
    })
}

pub fn seek(position: f64) -> Result<(), String> {
    with_engine(|engine| engine.seek(position))
}

pub fn set_volume(volume: f32, muted: bool) -> Result<(), String> {
    with_engine(|engine| {
        let _callback_guard = CALLBACK_LOCK
            .lock()
            .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
        engine.volume = volume.clamp(0.0, 1.0);
        engine.muted = muted;
        engine.apply_volume();
        Ok(())
    })
}

pub fn apply_effects(payload: NativeEffectsPayload) -> Result<(), String> {
    with_engine(|engine| {
        let _callback_guard = CALLBACK_LOCK
            .lock()
            .map_err(|_| "Native callback kilidi alinamadi".to_string())?;
        engine.apply_effects(payload);
        Ok(())
    })
}

pub fn spectrum(bands: usize) -> Vec<f32> {
    let count = bands.clamp(8, 256);
    if let Ok(engine) = engine().try_lock() {
        let values = engine.smooth_pcm_spectrum(count);
        if let Ok(mut cache) = spectrum_cache().try_lock() {
            *cache = values.clone();
        }
        return values;
    }

    if let Ok(cache) = spectrum_cache().try_lock() {
        if cache.len() == count {
            return cache.clone();
        }
        if !cache.is_empty() {
            let mut out = vec![0.0; count];
            for (index, value) in out.iter_mut().enumerate() {
                let source_index =
                    (index as f32 / (count - 1).max(1) as f32) * (cache.len() - 1) as f32;
                let low = source_index.floor() as usize;
                let high = (low + 1).min(cache.len() - 1);
                let frac = source_index - low as f32;
                *value = cache[low] * (1.0 - frac) + cache[high] * frac;
            }
            return out;
        }
    }

    vec![0.0; count]
}

pub fn spectrum_pair(bands: usize) -> NativeSpectrumPair {
    let count = bands.clamp(8, 256);
    if let Ok(engine) = engine().try_lock() {
        return NativeSpectrumPair {
            processed: engine.smooth_pcm_spectrum(count),
            raw: engine.raw_pcm_spectrum(count),
        };
    }
    NativeSpectrumPair {
        processed: vec![0.0; count],
        raw: vec![0.0; count],
    }
}

pub fn projectm_pcm_stereo(count_per_channel: usize) -> Vec<f32> {
    engine()
        .lock()
        .map(|engine| engine.projectm_pcm_stereo(count_per_channel))
        .unwrap_or_else(|_| vec![0.0; count_per_channel.clamp(64, VISUAL_PCM_SAMPLES) * 2])
}
