#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
#include <cstdio>
#include <cstdint>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ArDali Safe EQ Engine (32-band only)
namespace ArDaliDSP {

static const int NUM_BANDS = 32;
static float gSampleRate = 48000.0f;
static const float MIN_EQ_FREQ = 20.0f;
static const float MAX_EQ_FREQ = 20000.0f;
static const float NOISE_GATE_DB = -60.0f;
static const float NOISE_GATE_RMS = std::pow(10.0f, NOISE_GATE_DB / 20.0f);

static inline float clampf(float value, float min_value, float max_value) {
  return std::max(min_value, std::min(value, max_value));
}

// Windowed Sinc Resampler (Fixed 44.1k -> 48k for Monitor)
struct Resampler {
  float bufferL[256], bufferR[256];
  int writePos;
  double phase;
  double ratio;

  Resampler() : writePos(0), phase(0.0), ratio(48000.0 / 44100.0) {
    std::fill(bufferL, bufferL + 256, 0.0f);
    std::fill(bufferR, bufferR + 256, 0.0f);
  }

  void push(float L, float R) {
    bufferL[writePos] = L;
    bufferR[writePos] = R;
    writePos = (writePos + 1) % 256;
  }

  void process(float *inL, float *inR, int inFrames, float *out,
               int &outFrames) {
    double step = 1.0 / ratio;
    int outIdx = 0;
    while (phase < inFrames) {
      int i = (int)phase;
      double f = phase - i;

      float L, R;
      if (i + 1 < inFrames) {
        L = inL[i] * (1.0f - (float)f) + inL[i + 1] * (float)f;
        R = inR[i] * (1.0f - (float)f) + inR[i + 1] * (float)f;
      } else {
        L = inL[i];
        R = inR[i];
      }

      out[outIdx * 2] = L;
      out[outIdx * 2 + 1] = R;
      outIdx++;
      phase += step;
    }
    phase -= inFrames;
    outFrames = outIdx;
  }
};

static std::array<float, NUM_BANDS> makeCenterFrequencies() {
  std::array<float, NUM_BANDS> freqs{};
  float log_min = std::log10(MIN_EQ_FREQ);
  float log_max = std::log10(MAX_EQ_FREQ);
  float step = (log_max - log_min) / (NUM_BANDS - 1);
  for (int i = 0; i < NUM_BANDS; ++i) {
    freqs[i] = std::pow(10.0f, log_min + step * i);
  }
  return freqs;
}

static const std::array<float, NUM_BANDS> CENTER_FREQUENCIES =
    makeCenterFrequencies();

// ==================================================================================
// BIQUAD FILTER CORE
// ==================================================================================
struct Biquad {
  float b0, b1, b2, a1, a2;
  float x1, x2, y1, y2;

  Biquad() : b0(1), b1(0), b2(0), a1(0), a2(0), x1(0), x2(0), y1(0), y2(0) {}

  void reset() { x1 = x2 = y1 = y2 = 0; }

  void setIdentity() {
    b0 = 1.0f;
    b1 = 0.0f;
    b2 = 0.0f;
    a1 = 0.0f;
    a2 = 0.0f;
    reset();
  }

  bool coeffsFinite() const {
    return std::isfinite(b0) && std::isfinite(b1) && std::isfinite(b2) && std::isfinite(a1) &&
           std::isfinite(a2);
  }

  static inline float clampFreq(float freq) {
    return clampf(freq, 10.0f, gSampleRate * 0.45f);
  }

  static inline float clampQ(float q) { return clampf(q, 0.1f, 18.0f); }

  void setPeakingEQ(float centerFreq, float Q, float gaindB) {
    centerFreq = clampFreq(centerFreq);
    Q = clampQ(Q);
    float A = std::pow(10.0f, gaindB / 40.0f);
    float omega = 2.0f * (float)M_PI * centerFreq / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float alpha = sn / (2.0f * Q);

    float b0_tmp = 1.0f + alpha * A;
    float b1_tmp = -2.0f * cs;
    float b2_tmp = 1.0f - alpha * A;
    float a0_tmp = 1.0f + alpha / A;
    float a1_tmp = -2.0f * cs;
    float a2_tmp = 1.0f - alpha / A;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;

    if (!coeffsFinite()) setIdentity();
  }

  void setLowShelf(float cutoffFreq, float gaindB) {
    cutoffFreq = clampFreq(cutoffFreq);
    float A = std::pow(10.0f, gaindB / 40.0f);
    float omega = 2.0f * (float)M_PI * cutoffFreq / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float beta = std::sqrt(A + A);

    float b0_tmp = A * ((A + 1) - (A - 1) * cs + beta * sn);
    float b1_tmp = 2 * A * ((A - 1) - (A + 1) * cs);
    float b2_tmp = A * ((A + 1) - (A - 1) * cs - beta * sn);
    float a0_tmp = (A + 1) + (A - 1) * cs + beta * sn;
    float a1_tmp = -2 * ((A - 1) + (A + 1) * cs);
    float a2_tmp = (A + 1) + (A - 1) * cs - beta * sn;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;

    if (!coeffsFinite()) setIdentity();
  }

  void setHighShelf(float cutoffFreq, float gaindB) {
    cutoffFreq = clampFreq(cutoffFreq);
    float A = std::pow(10.0f, gaindB / 40.0f);
    float omega = 2.0f * (float)M_PI * cutoffFreq / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float beta = std::sqrt(A + A);

    float b0_tmp = A * ((A + 1) + (A - 1) * cs + beta * sn);
    float b1_tmp = -2 * A * ((A - 1) + (A + 1) * cs);
    float b2_tmp = A * ((A + 1) + (A - 1) * cs - beta * sn);
    float a0_tmp = (A + 1) - (A - 1) * cs + beta * sn;
    float a1_tmp = 2 * ((A - 1) - (A + 1) * cs);
    float a2_tmp = (A + 1) - (A - 1) * cs - beta * sn;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;

    if (!coeffsFinite()) setIdentity();
  }

  void setLowPass(float cutoffFreq, float Q) {
    float fc = clampf(cutoffFreq, 10.0f, gSampleRate * 0.45f);
    float omega = 2.0f * (float)M_PI * fc / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float alpha = sn / (2.0f * Q);

    float b0_tmp = (1.0f - cs) * 0.5f;
    float b1_tmp = 1.0f - cs;
    float b2_tmp = (1.0f - cs) * 0.5f;
    float a0_tmp = 1.0f + alpha;
    float a1_tmp = -2.0f * cs;
    float a2_tmp = 1.0f - alpha;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;
  }

  void setHighPass(float cutoffFreq, float Q) {
    float fc = clampf(cutoffFreq, 10.0f, gSampleRate * 0.45f);
    float omega = 2.0f * (float)M_PI * fc / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float alpha = sn / (2.0f * Q);

    float b0_tmp = (1.0f + cs) * 0.5f;
    float b1_tmp = -(1.0f + cs);
    float b2_tmp = (1.0f + cs) * 0.5f;
    float a0_tmp = 1.0f + alpha;
    float a1_tmp = -2.0f * cs;
    float a2_tmp = 1.0f - alpha;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;
  }

  void setNotch(float centerFreq, float Q) {
    float fc = clampf(centerFreq, 10.0f, gSampleRate * 0.45f);
    float omega = 2.0f * (float)M_PI * fc / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float alpha = sn / (2.0f * Q);

    float b0_tmp = 1.0f;
    float b1_tmp = -2.0f * cs;
    float b2_tmp = 1.0f;
    float a0_tmp = 1.0f + alpha;
    float a1_tmp = -2.0f * cs;
    float a2_tmp = 1.0f - alpha;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;
  }

  void setBandPass(float centerFreq, float Q) {
    float fc = clampf(centerFreq, 10.0f, gSampleRate * 0.45f);
    float omega = 2.0f * (float)M_PI * fc / gSampleRate;
    float sn = std::sin(omega);
    float cs = std::cos(omega);
    float alpha = sn / (2.0f * Q);

    float b0_tmp = alpha;
    float b1_tmp = 0.0f;
    float b2_tmp = -alpha;
    float a0_tmp = 1.0f + alpha;
    float a1_tmp = -2.0f * cs;
    float a2_tmp = 1.0f - alpha;

    b0 = b0_tmp / a0_tmp;
    b1 = b1_tmp / a0_tmp;
    b2 = b2_tmp / a0_tmp;
    a1 = a1_tmp / a0_tmp;
    a2 = a2_tmp / a0_tmp;
  }

  inline float process(float input) {
    float output = b0 * input + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    if (std::abs(output) < 1e-20f)
      output = 0.0f;
    x2 = x1;
    x1 = input;
    y2 = y1;
    y1 = output;
    return output;
  }
};

// ===========================================
// ADDITIONAL EFFECTS (From ArDali project)
// ===========================================

struct SimpleCompressor {
    float threshold;
    float ratio;
    float attack;
    float release;
    float makeup;
    float envelope;
    bool enabled;

    SimpleCompressor() : threshold(1.0f), ratio(1.0f), attack(0.0f), release(0.0f), makeup(1.0f), envelope(0.0f), enabled(false) {}

    void setParams(float threshdB, float rat, float attMs, float relMs, float makdB) {
        threshold = std::pow(10.0f, threshdB / 20.0f);
        ratio = std::max(1.0f, rat);
        attack = std::exp(-1.0f / (std::max(1.0f, attMs) * 0.001f * gSampleRate));
        release = std::exp(-1.0f / (std::max(1.0f, relMs) * 0.001f * gSampleRate));
        makeup = std::pow(10.0f, makdB / 20.0f);
    }

    float process(float input) {
        if (!enabled) {
            envelope *= 0.995f;
            return input;
        }
        
        float absIn = std::abs(input);
        if (absIn > envelope) envelope = attack * (envelope - absIn) + absIn;
        else envelope = release * (envelope - absIn) + absIn;
        
        if (envelope > threshold && envelope > 1e-6f) {
            float gr = std::pow(envelope / threshold, (1.0f / ratio) - 1.0f);
            return input * gr * makeup;
        }
        return input * makeup;
    }
};

struct SimpleGate {
    float threshold;
    float envelope;
    float attack;
    float release;
    float closedGain;
    int holdSamples;
    int holdCounter;
    bool enabled;
    
    SimpleGate() : threshold(0.0f), envelope(1.0f), attack(0.0f), release(0.0f), closedGain(0.0001f), holdSamples(0), holdCounter(0), enabled(false) {}
    
    void setParams(float threshdB, float attMs, float holdMs, float relMs, float rangeDb) {
        threshold = std::pow(10.0f, threshdB / 20.0f);
        attack = std::exp(-1.0f / (std::max(0.1f, attMs) * 0.001f * gSampleRate));
        release = std::exp(-1.0f / (std::max(1.0f, relMs) * 0.001f * gSampleRate));
        holdSamples = std::max(0, (int)(std::max(0.0f, holdMs) * 0.001f * gSampleRate));
        closedGain = std::pow(10.0f, clampf(rangeDb, -100.0f, 0.0f) / 20.0f);
    }
    
    float process(float input) {
        if (!enabled) {
            envelope += (1.0f - envelope) * 0.002f;
            holdCounter = 0;
            return input;
        }
        
        float absIn = std::abs(input);
        float target = 1.0f;
        if (absIn > threshold) {
            holdCounter = holdSamples;
        } else if (holdCounter > 0) {
            --holdCounter;
        } else {
            target = closedGain;
        }
        
        if (target > envelope) envelope = attack * (envelope - target) + target;
        else envelope = release * (envelope - target) + target;
        
        return input * envelope;
    }
};

struct SimpleLimiter {
    float ceiling;
    float targetCeiling;
    float envelope;
    float release;
    float inputGain;
    float targetInputGain;
    int lookaheadSamples;
    int delayIndex;
    std::vector<float> delay;
    bool enabled;
    
    SimpleLimiter()
        : ceiling(1.0f), targetCeiling(1.0f), envelope(0.0f), release(0.0f), inputGain(1.0f), targetInputGain(1.0f),
          lookaheadSamples(0), delayIndex(0), delay(4097, 0.0f), enabled(false) {}
    
    void setParams(float ceil, float relMs, float lookaheadMs, float gainDb) {
        targetCeiling = std::pow(10.0f, ceil / 20.0f);
        release = std::exp(-1.0f / (std::max(1.0f, relMs) * 0.001f * gSampleRate));
        targetInputGain = std::pow(10.0f, clampf(gainDb, -12.0f, 12.0f) / 20.0f);
        const int maxLookahead = std::max(1, (int)std::lround(0.02f * gSampleRate));
        if ((int)delay.size() < maxLookahead + 1) delay.resize((size_t)maxLookahead + 1, 0.0f);
        lookaheadSamples = std::max(0, std::min(maxLookahead, (int)std::lround(clampf(lookaheadMs, 0.0f, 20.0f) * 0.001f * gSampleRate)));
        delayIndex %= (int)delay.size();
    }
    
    float process(float input) {
        if (!enabled) {
            if (!delay.empty()) {
                delay[(size_t)delayIndex] = input;
                delayIndex = (delayIndex + 1) % (int)delay.size();
            }
            envelope *= 0.995f;
            return input;
        }

        const float smooth = std::exp(-1.0f / (std::max(8.0f, gSampleRate * 0.012f)));
        ceiling = targetCeiling + (ceiling - targetCeiling) * smooth;
        inputGain = targetInputGain + (inputGain - targetInputGain) * smooth;
        
        float driven = input * inputGain;
        float delayed = driven;
        if (lookaheadSamples > 0 && !delay.empty()) {
            const int size = (int)delay.size();
            const int readIndex = (delayIndex + size - lookaheadSamples) % size;
            delayed = delay[(size_t)readIndex];
            delay[(size_t)delayIndex] = driven;
            delayIndex = (delayIndex + 1) % size;
        }

        float absIn = std::abs(driven);
        if (absIn > envelope) envelope = absIn;
        else envelope = release * (envelope - absIn) + absIn;
        
        if (envelope > ceiling && envelope > 1e-6f) {
            return delayed * (ceiling / envelope);
        }
        return delayed;
    }
};

struct SimpleEcho {
    std::vector<float> buffer;
    int pos;
    float feedback;
    float targetFeedback;
    float mix; // 0-1
    float targetMix;
    int delaySamples;
    int targetDelaySamples;
    float highCut;
    Biquad tone;
    Biquad softTone;
    float smear;
    bool softMode;
    bool enabled;
    
    SimpleEcho() : pos(0), feedback(0.0f), targetFeedback(0.0f), mix(0.0f), targetMix(0.0f),
                   delaySamples(12000), targetDelaySamples(12000), highCut(8000.0f), smear(0.0f), softMode(false), enabled(false) {
        buffer.resize(96000, 0.0f); // Max 2 sec
        tone.setLowPass(highCut, 0.707f);
        softTone.setLowPass(highCut * 0.72f, 0.55f);
    }
    
    void setParams(float delayMs, float fb, float mx, float hiCut, bool soft) {
        targetDelaySamples = (int)(clampf(delayMs, 1.0f, 2000.0f) * 0.001f * gSampleRate);
        targetFeedback = clampf(fb, 0.0f, 0.95f);
        targetMix = clampf(mx, 0.0f, 1.0f);
        highCut = clampf(hiCut, 800.0f, 18000.0f);
        softMode = soft;
        tone.setLowPass(highCut, 0.707f);
        softTone.setLowPass(clampf(highCut * 0.72f, 800.0f, 16000.0f), 0.55f);
        if (targetDelaySamples >= (int)buffer.size()) targetDelaySamples = (int)buffer.size() - 1;
        if (targetDelaySamples < 1) targetDelaySamples = 1;
    }
    
    float process(float input) {
        feedback += (targetFeedback - feedback) * 0.0015f;
        mix += (targetMix - mix) * 0.0015f;
        if (delaySamples < targetDelaySamples) delaySamples += std::max(1, (targetDelaySamples - delaySamples) / 2048);
        else if (delaySamples > targetDelaySamples) delaySamples -= std::max(1, (delaySamples - targetDelaySamples) / 2048);
        delaySamples = std::max(1, std::min(delaySamples, (int)buffer.size() - 1));

        if (!enabled || mix < 0.000001f) return input;
        
        int readPos = pos - delaySamples;
        if (readPos < 0) readPos += (int)buffer.size();
        float delayed = tone.process(buffer[readPos]);
        if (softMode) {
            delayed = softTone.process(delayed);
            delayed = delayed * 0.76f + smear * 0.24f;
            smear += (delayed - smear) * 0.18f;
        }
        float writeInput = softMode ? input * 0.82f : input;
        float newVal = writeInput + delayed * feedback;
        if (std::abs(newVal) < 1e-20f) newVal = 0.0f;
        
        buffer[pos] = newVal;
        pos++;
        if (pos >= (int)buffer.size()) pos = 0;
        
        float dry = softMode ? (1.0f - mix * 0.72f) : (1.0f - mix);
        return input * dry + delayed * mix;
    }
};

struct ConvolutionReverbSim {
    bool enabled;
    float targetMix;
    float mix;
    float predelayMs;
    int preset;
    int pos;
    float dampL;
    float dampR;
    float damping;
    std::vector<float> bufferL;
    std::vector<float> bufferR;
    std::array<int, 8> taps;
    std::array<float, 8> gains;

    ConvolutionReverbSim()
        : enabled(false), targetMix(0.0f), mix(0.0f), predelayMs(20.0f), preset(0),
          pos(0), dampL(0.0f), dampR(0.0f), damping(0.45f) {
        bufferL.resize(192000, 0.0f);
        bufferR.resize(192000, 0.0f);
        configurePreset(0);
    }

    void configurePreset(int mode) {
        preset = std::max(0, std::min(4, mode));
        if (preset == 1) { // room
            taps = { 1430, 2410, 3790, 5570, 7910, 10100, 13210, 17110 };
            gains = { 0.56f, 0.43f, 0.34f, 0.25f, 0.18f, 0.13f, 0.09f, 0.06f };
            damping = 0.58f;
        } else if (preset == 2) { // plate/spring
            taps = { 920, 1770, 2890, 4210, 6120, 8540, 11290, 14810 };
            gains = { 0.48f, 0.46f, 0.41f, 0.35f, 0.29f, 0.23f, 0.17f, 0.12f };
            damping = 0.34f;
        } else if (preset == 3) { // cathedral
            taps = { 3510, 5770, 9010, 13270, 18710, 24890, 32110, 42110 };
            gains = { 0.64f, 0.55f, 0.47f, 0.38f, 0.30f, 0.23f, 0.17f, 0.12f };
            damping = 0.27f;
        } else if (preset == 4) { // large/chamber
            taps = { 2520, 4210, 6870, 10090, 14230, 19220, 25100, 31870 };
            gains = { 0.60f, 0.50f, 0.41f, 0.32f, 0.24f, 0.18f, 0.13f, 0.09f };
            damping = 0.38f;
        } else { // hall
            taps = { 2100, 3430, 5710, 8230, 11900, 15810, 21370, 28730 };
            gains = { 0.58f, 0.48f, 0.39f, 0.30f, 0.23f, 0.17f, 0.12f, 0.08f };
            damping = 0.42f;
        }
    }

    void setParams(bool en, float mx, float predelay, int mode) {
        enabled = en;
        targetMix = enabled ? clampf(mx, 0.0f, 1.0f) : 0.0f;
        predelayMs = clampf(predelay, 0.0f, 120.0f);
        if (mode != preset) configurePreset(mode);
    }

    float readTap(const std::vector<float>& buffer, int delay) const {
        int size = (int)buffer.size();
        int read = pos - delay;
        while (read < 0) read += size;
        read %= size;
        return buffer[read];
    }

    void process(float &L, float &R) {
        mix += (targetMix - mix) * 0.0012f;
        bufferL[pos] = L;
        bufferR[pos] = R;
        if (mix < 0.000001f) {
            pos = (pos + 1) % (int)bufferL.size();
            return;
        }

        int predelaySamples = (int)(predelayMs * 0.001f * gSampleRate);
        float wetL = 0.0f;
        float wetR = 0.0f;
        for (size_t i = 0; i < taps.size(); ++i) {
            int delay = std::min((int)bufferL.size() - 1, predelaySamples + taps[i]);
            float g = gains[i];
            wetL += readTap(bufferL, delay) * g;
            wetR += readTap(bufferR, delay + (int)(157.0f + i * 53.0f)) * g;
            wetL += readTap(bufferR, delay + (int)(311.0f + i * 41.0f)) * (g * 0.22f);
            wetR += readTap(bufferL, delay + (int)(271.0f + i * 47.0f)) * (g * 0.22f);
        }

        dampL += (wetL - dampL) * (1.0f - damping);
        dampR += (wetR - dampR) * (1.0f - damping);
        wetL = dampL * 0.34f;
        wetR = dampR * 0.34f;
        float dryGain = 1.0f - mix * 0.36f;
        L = L * dryGain + wetL * mix;
        R = R * dryGain + wetR * mix;
        pos = (pos + 1) % (int)bufferL.size();
    }

    void reset() {
        std::fill(bufferL.begin(), bufferL.end(), 0.0f);
        std::fill(bufferR.begin(), bufferR.end(), 0.0f);
        pos = 0;
        dampL = dampR = 0.0f;
    }
};

struct BitDither {
    bool enabled;
    int bitDepth;
    int dither;
    int shaping;
    int downsampleFactor;
    float mix;
    float outputDb;
    float targetAmount;
    float currentAmount;
    float targetOutput;
    float currentOutput;
    int holdCounter;
    float holdL;
    float holdR;
    float antiAliasL;
    float antiAliasR;
    float errL;
    float errR;
    uint32_t rng;

    BitDither()
        : enabled(false), bitDepth(16), dither(2), shaping(0), downsampleFactor(1),
          mix(100.0f), outputDb(0.0f), targetAmount(0.0f), currentAmount(0.0f),
          targetOutput(1.0f), currentOutput(1.0f), holdCounter(0), holdL(0.0f), holdR(0.0f),
          antiAliasL(0.0f), antiAliasR(0.0f), errL(0.0f), errR(0.0f), rng(1234567u) {}

    static inline float rand01(uint32_t &state) {
        state = 1664525u * state + 1013904223u;
        uint32_t value = (state >> 9) | 0x3F800000u;
        float out;
        std::memcpy(&out, &value, sizeof(float));
        return out - 1.0f;
    }

    static inline float randSigned(uint32_t &state) {
        return rand01(state) * 2.0f - 1.0f;
    }

    static inline float quantize(float x, int bits) {
        const int levels = 1 << (bits - 1);
        if (levels <= 0) return x;
        return std::round(x * (float)levels) / (float)levels;
    }

    void setParams(bool en, int bits, int dith, int shape, int ds, float mx, float outDb) {
        enabled = en;
        bitDepth = std::max(4, std::min(bits, 24));
        dither = std::max(0, std::min(dith, 2));
        shaping = std::max(0, std::min(shape, 1));
        downsampleFactor = std::max(1, std::min(ds, 16));
        mix = clampf(mx, 0.0f, 100.0f);
        outputDb = clampf(outDb, -12.0f, 12.0f);
        targetAmount = enabled ? (mix * 0.01f) : 0.0f;
        targetOutput = std::pow(10.0f, outputDb / 20.0f);
    }

    void process(float &L, float &R) {
        currentAmount += (targetAmount - currentAmount) * 0.0018f;
        currentOutput += (targetOutput - currentOutput) * 0.0018f;
        if (currentAmount < 0.0001f && targetAmount <= 0.0f) return;

        float inL = L;
        float inR = R;
        float xL = inL;
        float xR = inR;

        if (downsampleFactor > 1) {
            float cutoff = clampf((gSampleRate / (float)downsampleFactor) * 0.42f, 900.0f, gSampleRate * 0.45f);
            float aa = 1.0f - std::exp(-2.0f * (float)M_PI * cutoff / gSampleRate);
            antiAliasL += aa * (inL - antiAliasL);
            antiAliasR += aa * (inR - antiAliasR);
            if (holdCounter <= 0) {
                holdCounter = downsampleFactor;
                holdL = antiAliasL;
                holdR = antiAliasR;
            }
            holdCounter--;
            xL = holdL;
            xR = holdR;
        }

        if (shaping == 1) {
            xL += 0.82f * errL;
            xR += 0.82f * errR;
        }

        const int levels = 1 << (bitDepth - 1);
        const float lsb = 1.0f / (float)levels;
        float dL = 0.0f;
        float dR = 0.0f;
        if (dither == 1) {
            dL = randSigned(rng) * 0.5f * lsb;
            dR = randSigned(rng) * 0.5f * lsb;
        } else if (dither == 2) {
            dL = (rand01(rng) - rand01(rng)) * lsb;
            dR = (rand01(rng) - rand01(rng)) * lsb;
        }

        float yL = xL + dL;
        float yR = xR + dR;
        float qL = quantize(yL, bitDepth);
        float qR = quantize(yR, bitDepth);
        errL = clampf(yL - qL, -lsb * 4.0f, lsb * 4.0f);
        errR = clampf(yR - qR, -lsb * 4.0f, lsb * 4.0f);

        L = clampf((inL * (1.0f - currentAmount) + qL * currentAmount) * currentOutput, -1.0f, 1.0f);
        R = clampf((inR * (1.0f - currentAmount) + qR * currentAmount) * currentOutput, -1.0f, 1.0f);
    }

    void reset() {
        currentAmount = targetAmount;
        currentOutput = targetOutput;
        holdCounter = 0;
        holdL = holdR = 0.0f;
        antiAliasL = antiAliasR = 0.0f;
        errL = errR = 0.0f;
    }
};

struct TapeSaturation {
    bool enabled;
    float driveDb;
    float mix;
    float tone;
    float outputDb;
    int mode;
    float hiss;
    float targetAmount;
    float currentAmount;
    float targetDrive;
    float currentDrive;
    float targetTone;
    float currentTone;
    float targetOutput;
    float currentOutput;
    float targetHiss;
    float currentHiss;
    float toneL;
    float toneR;
    float headL;
    float headR;
    float hissFilterL;
    float hissFilterR;
    uint32_t rng;

    TapeSaturation()
        : enabled(false), driveDb(6.0f), mix(50.0f), tone(50.0f), outputDb(-1.0f),
          mode(0), hiss(0.0f), targetAmount(0.0f), currentAmount(0.0f),
          targetDrive(std::pow(10.0f, 6.0f / 20.0f)), currentDrive(targetDrive),
          targetTone(50.0f), currentTone(50.0f), targetOutput(std::pow(10.0f, -1.0f / 20.0f)),
          currentOutput(targetOutput), targetHiss(0.0f), currentHiss(0.0f),
          toneL(0.0f), toneR(0.0f), headL(0.0f), headR(0.0f),
          hissFilterL(0.0f), hissFilterR(0.0f), rng(22222u) {}

    static inline float fastTanh(float x) {
        const float x2 = x * x;
        return x * (27.0f + x2) / (27.0f + 9.0f * x2);
    }

    static inline float randSigned(uint32_t &state) {
        state = 1664525u * state + 1013904223u;
        uint32_t value = (state >> 9) | 0x3F800000u;
        float out;
        std::memcpy(&out, &value, sizeof(float));
        return (out - 1.0f) * 2.0f - 1.0f;
    }

    static inline float onePoleAlpha(float cutoffHz) {
        float x = std::exp(-2.0f * (float)M_PI * cutoffHz / gSampleRate);
        return 1.0f - x;
    }

    void setParams(bool en, float drive, float mx, float tn, float outDb, int md, float hs) {
        enabled = en;
        driveDb = clampf(drive, 0.0f, 24.0f);
        mix = clampf(mx, 0.0f, 100.0f);
        tone = clampf(tn, 0.0f, 100.0f);
        outputDb = clampf(outDb, -12.0f, 12.0f);
        mode = std::max(0, std::min(md, 2));
        hiss = clampf(hs, 0.0f, 100.0f);
        targetAmount = enabled ? (mix * 0.01f) : 0.0f;
        targetDrive = std::pow(10.0f, driveDb / 20.0f);
        targetTone = tone;
        targetOutput = std::pow(10.0f, outputDb / 20.0f);
        targetHiss = hiss * 0.01f;
    }

    void process(float &L, float &R) {
        currentAmount += (targetAmount - currentAmount) * 0.0015f;
        currentDrive += (targetDrive - currentDrive) * 0.0015f;
        currentTone += (targetTone - currentTone) * 0.0015f;
        currentOutput += (targetOutput - currentOutput) * 0.0015f;
        currentHiss += (targetHiss - currentHiss) * 0.0015f;
        if (currentAmount < 0.0001f && targetAmount <= 0.0f) return;

        float cutoff = 4200.0f + (currentTone * 0.01f) * (15500.0f - 4200.0f);
        float alpha = onePoleAlpha(cutoff);
        float headAlpha = onePoleAlpha(95.0f);
        float hissAlpha = onePoleAlpha(6500.0f);

        float softness = 0.78f;
        float evenHarm = 0.06f;
        float headBump = 0.025f;
        float compression = 0.06f;
        if (mode == 1) {
            softness = 0.68f;
            evenHarm = 0.11f;
            headBump = 0.055f;
            compression = 0.09f;
        } else if (mode == 2) {
            softness = 0.58f;
            evenHarm = 0.16f;
            headBump = 0.035f;
            compression = 0.12f;
        }

        float dryL = L;
        float dryR = R;
        float inputLevel = 0.5f * (std::abs(dryL) + std::abs(dryR));
        float gainRide = 1.0f / (1.0f + inputLevel * currentDrive * compression);

        headL += headAlpha * (dryL - headL);
        headR += headAlpha * (dryR - headR);

        float xL = (dryL + headL * headBump) * currentDrive * gainRide;
        float xR = (dryR + headR * headBump) * currentDrive * gainRide;
        float satL = fastTanh(xL * softness) / std::max(0.25f, softness);
        float satR = fastTanh(xR * softness) / std::max(0.25f, softness);
        satL += evenHarm * (xL * xL) * (xL >= 0.0f ? 1.0f : -1.0f) * 0.018f;
        satR += evenHarm * (xR * xR) * (xR >= 0.0f ? 1.0f : -1.0f) * 0.018f;

        toneL += alpha * (satL - toneL);
        toneR += alpha * (satR - toneR);
        float wetL = toneL;
        float wetR = toneR;

        float hissGain = currentHiss * 0.0012f;
        if (hissGain > 0.0f) {
            hissFilterL += hissAlpha * (randSigned(rng) - hissFilterL);
            hissFilterR += hissAlpha * (randSigned(rng) - hissFilterR);
            wetL += hissFilterL * hissGain;
            wetR += hissFilterR * hissGain;
        }

        L = clampf((dryL * (1.0f - currentAmount) + wetL * currentAmount) * currentOutput, -1.0f, 1.0f);
        R = clampf((dryR * (1.0f - currentAmount) + wetR * currentAmount) * currentOutput, -1.0f, 1.0f);
    }

    void reset() {
        currentAmount = targetAmount;
        currentDrive = targetDrive;
        currentTone = targetTone;
        currentOutput = targetOutput;
        currentHiss = targetHiss;
        toneL = toneR = 0.0f;
        headL = headR = 0.0f;
        hissFilterL = hissFilterR = 0.0f;
    }
};

struct SurroundVirtualizer {
    bool enabled;
    float centerLevel;
    float sideLevel;
    float lfeLevel;
    float crossover;
    float rearDelay;
    float mix;
    float targetMix;
    float currentMix;
    float targetCenterGain;
    float currentCenterGain;
    float targetSideGain;
    float currentSideGain;
    float targetLfeGain;
    float currentLfeGain;
    std::vector<float> sideDelayBuffer;
    int delaySamples;
    int targetDelaySamples;
    size_t writePos;
    Biquad lfeFilter;
    Biquad sideHighpass;
    Biquad sideDamp;

    SurroundVirtualizer()
        : enabled(false), centerLevel(0.0f), sideLevel(0.0f), lfeLevel(0.0f),
          crossover(110.0f), rearDelay(8.0f), mix(75.0f),
          targetMix(0.0f), currentMix(0.0f), targetCenterGain(1.0f), currentCenterGain(1.0f),
          targetSideGain(1.0f), currentSideGain(1.0f), targetLfeGain(1.0f), currentLfeGain(1.0f),
          delaySamples(384), targetDelaySamples(384), writePos(0) {
        sideDelayBuffer.assign(4096, 0.0f);
        updateFilters();
    }

    void updateFilters() {
        const float cross = clampf(crossover, 40.0f, 220.0f);
        lfeFilter.setLowPass(cross, 0.707f);
        sideHighpass.setHighPass(cross, 0.707f);
        sideDamp.setLowPass(7200.0f, 0.55f);
    }

    void setParams(bool en, float center, float side, float lfe, float cross, float delay, float mx) {
        enabled = en;
        centerLevel = clampf(center, -12.0f, 12.0f);
        sideLevel = clampf(side, -12.0f, 12.0f);
        lfeLevel = clampf(lfe, -12.0f, 12.0f);
        crossover = clampf(cross, 40.0f, 220.0f);
        rearDelay = clampf(delay, 0.0f, 30.0f);
        mix = clampf(mx, 0.0f, 100.0f);
        targetCenterGain = std::pow(10.0f, centerLevel / 20.0f);
        targetSideGain = std::pow(10.0f, sideLevel / 20.0f);
        targetLfeGain = std::pow(10.0f, lfeLevel / 20.0f);
        targetMix = enabled ? (mix * 0.01f) : 0.0f;
        targetDelaySamples = std::max(1, (int)std::lround((rearDelay * gSampleRate) / 1000.0f));
        targetDelaySamples = std::min(targetDelaySamples, (int)sideDelayBuffer.size() - 2);
        updateFilters();
    }

    void process(float &L, float &R) {
        const float dryL = L;
        const float dryR = R;
        const float mid = 0.5f * (dryL + dryR);
        const float side = 0.5f * (dryL - dryR);
        const float surroundBand = sideHighpass.process(side);

        sideDelayBuffer[writePos] = surroundBand;
        currentMix += (targetMix - currentMix) * 0.0016f;
        currentCenterGain += (targetCenterGain - currentCenterGain) * 0.0016f;
        currentSideGain += (targetSideGain - currentSideGain) * 0.0016f;
        currentLfeGain += (targetLfeGain - currentLfeGain) * 0.0016f;
        if (delaySamples < targetDelaySamples) {
            delaySamples++;
        } else if (delaySamples > targetDelaySamples) {
            delaySamples--;
        }

        const size_t delaySize = sideDelayBuffer.size();
        const size_t readPos = (writePos + delaySize - (size_t)delaySamples) % delaySize;
        const float delayedSide = sideDamp.process(sideDelayBuffer[readPos]);
        writePos = (writePos + 1) % delaySize;

        if (currentMix < 0.0001f) return;

        const float amount = currentMix;
        const float center = mid * currentCenterGain;
        const float lfe = lfeFilter.process(mid) * currentLfeGain * 0.42f;
        const float surround = delayedSide * currentSideGain * (0.65f + amount * 0.25f);

        const float wetL = center + surround + lfe;
        const float wetR = center - surround + lfe;
        L = clampf(dryL * (1.0f - amount) + wetL * amount, -1.0f, 1.0f);
        R = clampf(dryR * (1.0f - amount) + wetR * amount, -1.0f, 1.0f);
    }

    void reset() {
        std::fill(sideDelayBuffer.begin(), sideDelayBuffer.end(), 0.0f);
        writePos = 0;
        currentMix = 0.0f;
        currentCenterGain = targetCenterGain;
        currentSideGain = targetSideGain;
        currentLfeGain = targetLfeGain;
        delaySamples = targetDelaySamples;
        lfeFilter.reset();
        sideHighpass.reset();
        sideDamp.reset();
    }
};

// Filter Types for Parametric EQ
enum PEQFilterType {
    PEQ_BELL = 0,        // Peak/Bell (varsayılan)
    PEQ_LOW_SHELF,       // Low Shelf
    PEQ_HIGH_SHELF,      // High Shelf
    PEQ_LOW_PASS,        // Low Pass
    PEQ_HIGH_PASS,       // High Pass
    PEQ_NOTCH,           // Notch (Band Stop)
    PEQ_BAND_PASS        // Band Pass
};

struct ParametricEQ {
    static const int BANDS = 6;  // 6 bant!
    Biquad bands[BANDS];
    bool enabled;
    
    struct BandSettings {
        float freq;
        float gain;
        float Q;
        PEQFilterType filterType;
    } settings[BANDS];

    // Varsayılan frekanslar (6 bant)
    static constexpr float DEFAULT_FREQS[6] = {60.0f, 150.0f, 400.0f, 1500.0f, 5000.0f, 12000.0f};
    static constexpr PEQFilterType DEFAULT_TYPES[6] = {
        PEQ_LOW_SHELF, PEQ_BELL, PEQ_BELL, PEQ_BELL, PEQ_BELL, PEQ_HIGH_SHELF
    };

    ParametricEQ() : enabled(false) {
        for(int i=0; i<BANDS; i++) {
            settings[i] = {DEFAULT_FREQS[i], 0.0f, 1.0f, DEFAULT_TYPES[i]};
        }
    }
    
    void setBand(int index, float freq, float gain, float Q) {
        if (index < 0 || index >= BANDS) return;
        settings[index].freq = freq;
        settings[index].gain = gain;
        settings[index].Q = Q;
        applyBandFilter(index);
    }
    
    void setFilterType(int index, PEQFilterType type) {
        if (index < 0 || index >= BANDS) return;
        settings[index].filterType = type;
        applyBandFilter(index);
    }
    
    void applyBandFilter(int index) {
        if (index < 0 || index >= BANDS) return;
        
        float freq = settings[index].freq;
        float gain = settings[index].gain;
        float Q = settings[index].Q;
        
        switch (settings[index].filterType) {
            case PEQ_BELL:
                bands[index].setPeakingEQ(freq, Q, gain);
                break;
            case PEQ_LOW_SHELF:
                bands[index].setLowShelf(freq, gain);
                break;
            case PEQ_HIGH_SHELF:
                bands[index].setHighShelf(freq, gain);
                break;
            case PEQ_LOW_PASS:
                bands[index].setLowPass(freq, Q);
                break;
            case PEQ_HIGH_PASS:
                bands[index].setHighPass(freq, Q);
                break;
            case PEQ_NOTCH:
                bands[index].setNotch(freq, Q);
                break;
            case PEQ_BAND_PASS:
                bands[index].setBandPass(freq, Q);
                break;
        }
    }
    
    void recalc() {
        for(int i=0; i<BANDS; i++) {
            applyBandFilter(i);
        }
    }
    
    float process(float input) {
        if (!enabled) return input;
        float out = input;
        for(int i=0; i<BANDS; i++) {
             out = bands[i].process(out);
        }
        return out;
    }
};

struct HarmonicExciter {
  bool enabled;
  float frequency;
  float amount;
  float mix;
  int harmonicType;
  float currentWet;
  float targetWet;
  Biquad highpassL, highpassR;
  Biquad toneL, toneR;

  HarmonicExciter()
      : enabled(false), frequency(3000.0f), amount(0.5f), mix(0.3f),
        harmonicType(0), currentWet(0.0f), targetWet(0.0f) {
    updateFilters();
  }

  void updateFilters() {
    highpassL.setHighPass(frequency, 0.8f);
    highpassR.setHighPass(frequency, 0.8f);
    float toneFreq = clampf(frequency * 1.9f, 2200.0f, 14000.0f);
    toneL.setLowPass(toneFreq, 0.707f);
    toneR.setLowPass(toneFreq, 0.707f);
  }

  void setParams(bool en, float freq, float amt, float mx, int type) {
    float nextFrequency = clampf(freq, 1000.0f, 12000.0f);
    if (std::abs(nextFrequency - frequency) > 1.0f) {
      frequency = nextFrequency;
      updateFilters();
    }
    enabled = en;
    amount = clampf(amt / 100.0f, 0.0f, 1.0f);
    mix = clampf(mx / 100.0f, 0.0f, 1.0f);
    harmonicType = std::max(0, std::min(3, type));
    targetWet = enabled ? std::min(0.7f, mix * 0.85f) : 0.0f;
  }

  float shape(float x) const {
    float drive = 1.0f + amount * 5.0f;
    float odd = std::tanh(x * drive) / std::max(0.0001f, std::tanh(drive));
    float even = x * (1.0f - (0.12f + amount * 0.5f)) + (x * x * (x >= 0.0f ? 1.0f : -1.0f) * (0.12f + amount * 0.5f));
    float tape = (std::tanh(x * (1.0f + amount * 2.8f)) / std::max(0.0001f, std::tanh(1.0f + amount * 2.8f))) * 0.68f
               + (x / (1.0f + std::abs(x) * (0.25f + amount * 0.6f))) * 0.32f;
    float tube = std::tanh(x * (1.0f + amount * 4.2f)) / std::max(0.0001f, std::tanh(1.0f + amount * 4.2f));
    float shaped = odd;
    if (harmonicType == 1) shaped = even;
    else if (harmonicType == 2) shaped = odd * 0.65f + even * 0.35f;
    else if (harmonicType == 3) shaped = tube * 0.75f + tape * 0.25f;
    float blend = 0.02f + amount * 0.20f;
    return (x * (1.0f - blend) + shaped * blend) - x;
  }

  void process(float &L, float &R) {
    currentWet += (targetWet - currentWet) * 0.0015f;
    if (currentWet < 0.000001f && targetWet <= 0.0f) return;
    float highL = highpassL.process(L);
    float highR = highpassR.process(R);
    float wetL = toneL.process(shape(highL));
    float wetR = toneR.process(shape(highR));
    float dryScale = enabled ? std::max(0.55f, 1.0f - mix * 0.7f) : 1.0f;
    L = L * dryScale + wetL * currentWet;
    R = R * dryScale + wetR * currentWet;
  }

  void reset() {
    highpassL.reset(); highpassR.reset();
    toneL.reset(); toneR.reset();
    currentWet = targetWet;
    updateFilters();
  }
};

struct DeEsser {
  bool enabled;
  float frequency;
  float thresholdDb;
  float ratio;
  float rangeDb;
  float envL, envR;
  float gainL, gainR;
  float reductionDbL, reductionDbR;
  int coeffCounter;
  Biquad detectorL, detectorR;
  Biquad bandL, bandR;
  Biquad reductionL, reductionR;

  DeEsser()
      : enabled(false), frequency(7000.0f), thresholdDb(-30.0f), ratio(4.0f),
        rangeDb(-12.0f), envL(0.0f), envR(0.0f), gainL(1.0f), gainR(1.0f),
        reductionDbL(0.0f), reductionDbR(0.0f), coeffCounter(0) {
    updateFilters();
  }

  void updateFilters() {
    detectorL.setBandPass(frequency, 4.0f);
    detectorR.setBandPass(frequency, 4.0f);
    bandL.setBandPass(frequency, 4.0f);
    bandR.setBandPass(frequency, 4.0f);
    reductionL.setPeakingEQ(frequency, 4.0f, 0.0f);
    reductionR.setPeakingEQ(frequency, 4.0f, 0.0f);
  }

  void setParams(bool en, float freq, float threshold, float rat, float range) {
    float nextFrequency = clampf(freq, 2000.0f, 12000.0f);
    if (std::abs(nextFrequency - frequency) > 1.0f) {
      frequency = nextFrequency;
      updateFilters();
    }
    enabled = en;
    thresholdDb = clampf(threshold, -60.0f, 0.0f);
    ratio = clampf(rat, 1.0f, 20.0f);
    rangeDb = clampf(range, -24.0f, 0.0f);
  }

  float detectReduction(float input, Biquad &detector, float &env, float &gain) {
    float detected = detector.process(input);
    float x = std::abs(detected);
    float atk = std::exp(-1.0f / (0.001f * 0.6f * gSampleRate));
    float rel = std::exp(-1.0f / (0.001f * 45.0f * gSampleRate));
    env = (x > env) ? atk * env + (1.0f - atk) * x : rel * env + (1.0f - rel) * x;
    float envDb = 20.0f * std::log10(env + 1e-9f);
    float targetReductionDb = 0.0f;
    if (envDb > thresholdDb && ratio > 1.0f) {
      float over = envDb - thresholdDb;
      targetReductionDb = -over * (1.0f - 1.0f / ratio);
      targetReductionDb = std::max(targetReductionDb, rangeDb);
    }
    float targetGain = std::pow(10.0f, targetReductionDb / 20.0f);
    gain += (targetGain - gain) * 0.008f;
    return 20.0f * std::log10(std::max(0.000001f, gain));
  }

  void process(float &L, float &R) {
    if (!enabled) return;
    reductionDbL = detectReduction(L, detectorL, envL, gainL);
    reductionDbR = detectReduction(R, detectorR, envR, gainR);
    if (++coeffCounter >= 16) {
      reductionL.setPeakingEQ(frequency, 4.0f, clampf(reductionDbL, rangeDb, 0.0f));
      reductionR.setPeakingEQ(frequency, 4.0f, clampf(reductionDbR, rangeDb, 0.0f));
      coeffCounter = 0;
    }
    L = reductionL.process(L);
    R = reductionR.process(R);
  }

  void reset() {
    detectorL.reset(); detectorR.reset();
    bandL.reset(); bandR.reset();
    reductionL.reset(); reductionR.reset();
    envL = envR = 0.0f;
    gainL = gainR = 1.0f;
    reductionDbL = reductionDbR = 0.0f;
    coeffCounter = 0;
    updateFilters();
  }
};

// ==================================================================================
// MASTER DSP CHAIN (Merged Angolla + ArDali Effects)
// ==================================================================================
class MasterDSP {
private:
  // Angolla Core
  std::vector<Biquad> filtersLeft, filtersRight;
  Biquad lowExciterL, lowExciterR;
  Biquad highExciterL, highExciterR;
  Biquad smartBassL, smartBassR;
  Biquad bassLoudL, bassLoudR;
  Biquad bassProtectL, bassProtectR;
  Biquad toneMidL, toneMidR;
  Biquad toneHighL, toneHighR;
  Biquad webLowPassL, webLowPassR;
  
  // Custom Modules
  ParametricEQ peqL, peqR;
  SimpleCompressor compressorL, compressorR;
  SimpleGate gateL, gateR;
  SimpleLimiter limiterL, limiterR;
  SimpleLimiter truePeakL, truePeakR;
  bool truePeakStereoLink;
  SimpleEcho echoL, echoR;
  ConvolutionReverbSim convolutionReverb;
  HarmonicExciter exciter;
  DeEsser deesser;
  TapeSaturation tapeSaturation;
  BitDither bitDither;
  Biquad bassBoostL, bassBoostR;
  bool bassBoostEnabled;
  float bassBoostGain;

  // Crossfeed (Headphone Enhancement - Meier/Linkwitz style)
  struct Crossfeed {
      bool enabled;
      float level;        // 0-100%
      float delay;        // ms
      float lowCut;       // Hz
      float highCut;      // Hz
      float targetMix;
      float currentMix;

      // Internal
      std::vector<float> delayBufferL, delayBufferR;
      int delaySamples;
      int targetDelaySamples;
      int bufferPos;
      Biquad shadowHighpassL, shadowHighpassR;
      Biquad shadowLowpassL, shadowLowpassR;

      Crossfeed() : enabled(false), level(30.0f), delay(0.3f), lowCut(700.0f), highCut(4000.0f),
                    targetMix(0.0f), currentMix(0.0f), delaySamples(1), targetDelaySamples(1),
                    bufferPos(0) {
          delayBufferL.resize(4800, 0.0f); // Max 100ms at 48kHz
          delayBufferR.resize(4800, 0.0f);
          updateFilters();
      }

      void updateFilters() {
          const float safeLow = clampf(lowCut, 80.0f, 1600.0f);
          const float safeHigh = clampf(std::max(highCut, safeLow + 150.0f), 1000.0f, 9000.0f);
          shadowHighpassL.setHighPass(safeLow, 0.707f);
          shadowHighpassR.setHighPass(safeLow, 0.707f);
          shadowLowpassL.setLowPass(safeHigh, 0.55f);
          shadowLowpassR.setLowPass(safeHigh, 0.55f);
      }

      void setParams(bool en, float lvl, float dly, float low, float high) {
          enabled = en;
          level = clampf(lvl, 0.0f, 100.0f);
          delay = clampf(dly, 0.0f, 1.5f);
          lowCut = clampf(low, 80.0f, 1600.0f);
          highCut = clampf(high, 1000.0f, 9000.0f);
          if (highCut <= lowCut + 150.0f) highCut = lowCut + 150.0f;

          // Recalculate delay samples (inter-aural time difference)
          targetDelaySamples = (int)(delay * 0.001f * gSampleRate);
          if (targetDelaySamples < 1) targetDelaySamples = 1;
          if (targetDelaySamples >= (int)delayBufferL.size()) targetDelaySamples = (int)delayBufferL.size() - 1;

          // Head shadowing band: remove sub-bass mud and keep high frequencies from hard-crossing.
          updateFilters();
          targetMix = enabled ? (level * 0.01f) : 0.0f;
      }

      void process(float &L, float &R) {
          currentMix += (targetMix - currentMix) * 0.0018f;
          if (delaySamples < targetDelaySamples) {
              delaySamples++;
          } else if (delaySamples > targetDelaySamples) {
              delaySamples--;
          }

          const float dryL = L;
          const float dryR = R;
          delayBufferL[bufferPos] = dryL;
          delayBufferR[bufferPos] = dryR;

          int readPos = bufferPos - delaySamples;
          if (readPos < 0) readPos += delayBufferL.size();

          float crossL = delayBufferR[readPos];
          float crossR = delayBufferL[readPos];

          crossL = shadowLowpassL.process(shadowHighpassL.process(crossL));
          crossR = shadowLowpassR.process(shadowHighpassR.process(crossR));

          const float mix = currentMix * 0.72f;
          const float directGain = 1.0f - (currentMix * 0.22f);

          L = (dryL * directGain) + (crossL * mix);
          R = (dryR * directGain) + (crossR * mix);

          bufferPos = (bufferPos + 1) % delayBufferL.size();
      }
  } crossfeed;

  // Bass Mono (Low Frequency Mono Summing)
  struct BassMono {
      bool enabled;
      float cutoff;       // Hz
      float slope;        // dB/oct (12, 24, 48)
      float stereoWidth;  // % (cutoff üstü genişlik)
      float targetAmount;
      float currentAmount;
      float targetWidth;
      float currentWidth;

      // Crossover Filters
      Biquad lpL, lpR, hpL, hpR;
      Biquad lpL2, lpR2, hpL2, hpR2; // For 24dB
      Biquad lpL3, lpR3, hpL3, hpR3; // For 48dB
      Biquad lpL4, lpR4, hpL4, hpR4; // For 48dB

      BassMono() : enabled(false), cutoff(120.0f), slope(24.0f), stereoWidth(100.0f),
                   targetAmount(0.0f), currentAmount(0.0f), targetWidth(1.0f), currentWidth(1.0f) {
          updateFilters();
      }

      void setParams(bool en, float freq, float s, float width) {
          enabled = en;
          cutoff = clampf(freq, 40.0f, 300.0f);
          slope = clampf(s, 6.0f, 48.0f);
          stereoWidth = clampf(width, 0.0f, 200.0f);
          targetAmount = enabled ? 1.0f : 0.0f;
          targetWidth = stereoWidth * 0.01f;
          updateFilters();
      }

      void updateFilters() {
          float q = 0.707f;
          if (slope >= 24.0f) q = 0.5f;

          lpL.setLowPass(cutoff, q); lpR.setLowPass(cutoff, q);
          hpL.setHighPass(cutoff, q); hpR.setHighPass(cutoff, q);

          if (slope >= 24.0f) {
              lpL2.setLowPass(cutoff, q); lpR2.setLowPass(cutoff, q);
              hpL2.setHighPass(cutoff, q); hpR2.setHighPass(cutoff, q);
          }
          if (slope >= 48.0f) {
              lpL3.setLowPass(cutoff, q); lpR3.setLowPass(cutoff, q);
              hpL3.setHighPass(cutoff, q); hpR3.setHighPass(cutoff, q);
              lpL4.setLowPass(cutoff, q); lpR4.setLowPass(cutoff, q);
              hpL4.setHighPass(cutoff, q); hpR4.setHighPass(cutoff, q);
          }
      }

      void process(float &L, float &R) {
          currentAmount += (targetAmount - currentAmount) * 0.0018f;
          currentWidth += (targetWidth - currentWidth) * 0.0018f;
          if (currentAmount < 0.0001f && targetAmount <= 0.0f) return;

          const float dryL = L;
          const float dryR = R;

          float lowStageL[5] = { dryL, 0.0f, 0.0f, 0.0f, 0.0f };
          float lowStageR[5] = { dryR, 0.0f, 0.0f, 0.0f, 0.0f };
          lowStageL[1] = lpL.process(dryL);
          lowStageR[1] = lpR.process(dryR);
          lowStageL[2] = lpL2.process(lowStageL[1]);
          lowStageR[2] = lpR2.process(lowStageR[1]);
          lowStageL[3] = lpL3.process(lowStageL[2]);
          lowStageR[3] = lpR3.process(lowStageR[2]);
          lowStageL[4] = lpL4.process(lowStageL[3]);
          lowStageR[4] = lpR4.process(lowStageR[3]);

          float highStageL[5] = { dryL, 0.0f, 0.0f, 0.0f, 0.0f };
          float highStageR[5] = { dryR, 0.0f, 0.0f, 0.0f, 0.0f };
          highStageL[1] = hpL.process(dryL);
          highStageR[1] = hpR.process(dryR);
          highStageL[2] = hpL2.process(highStageL[1]);
          highStageR[2] = hpR2.process(highStageR[1]);
          highStageL[3] = hpL3.process(highStageL[2]);
          highStageR[3] = hpR3.process(highStageR[2]);
          highStageL[4] = hpL4.process(highStageL[3]);
          highStageR[4] = hpR4.process(highStageR[3]);

          const float stagePos = clampf(slope / 12.0f, 0.5f, 4.0f);
          const int lowerStage = std::max(0, std::min(4, (int)std::floor(stagePos)));
          const int upperStage = std::max(0, std::min(4, lowerStage + 1));
          const float stageBlend = clampf(stagePos - (float)lowerStage, 0.0f, 1.0f);
          float lowL = lowStageL[lowerStage] * (1.0f - stageBlend) + lowStageL[upperStage] * stageBlend;
          float lowR = lowStageR[lowerStage] * (1.0f - stageBlend) + lowStageR[upperStage] * stageBlend;
          float highL = highStageL[lowerStage] * (1.0f - stageBlend) + highStageL[upperStage] * stageBlend;
          float highR = highStageR[lowerStage] * (1.0f - stageBlend) + highStageR[upperStage] * stageBlend;

          const float monoBass = (lowL + lowR) * 0.5f;

          float mid = (highL + highR) * 0.5f;
          float side = (highL - highR) * 0.5f;
          side *= currentWidth;
          highL = mid + side;
          highR = mid - side;

          const float wetL = monoBass + highL;
          const float wetR = monoBass + highR;
          L = dryL * (1.0f - currentAmount) + wetL * currentAmount;
          R = dryR * (1.0f - currentAmount) + wetR * currentAmount;
      }

      void reset() {
          lpL.reset(); lpR.reset(); hpL.reset(); hpR.reset();
          lpL2.reset(); lpR2.reset(); hpL2.reset(); hpR2.reset();
          lpL3.reset(); lpR3.reset(); hpL3.reset(); hpR3.reset();
          lpL4.reset(); lpR4.reset(); hpL4.reset(); hpR4.reset();
          currentAmount = targetAmount;
          currentWidth = targetWidth;
          updateFilters();
      }
  } bassMono;

  struct StereoWidener {
      bool enabled;
      float width;
      float centerDb;
      float sideDb;
      float bassToMono;
      Biquad lpL, lpR, hpL, hpR;

      StereoWidener() : enabled(false), width(100.0f), centerDb(0.0f), sideDb(0.0f), bassToMono(200.0f) {
          updateFilters();
      }

      void setParams(bool en, float w, float center, float side, float bassFreq) {
          enabled = en;
          width = clampf(w, 0.0f, 220.0f);
          centerDb = clampf(center, -12.0f, 12.0f);
          sideDb = clampf(side, -12.0f, 12.0f);
          float nextBass = clampf(bassFreq, 40.0f, 400.0f);
          if (std::abs(nextBass - bassToMono) > 1.0f) {
              bassToMono = nextBass;
              updateFilters();
          }
      }

      void updateFilters() {
          lpL.setLowPass(bassToMono, 0.707f);
          lpR.setLowPass(bassToMono, 0.707f);
          hpL.setHighPass(bassToMono, 0.707f);
          hpR.setHighPass(bassToMono, 0.707f);
      }

      void process(float &L, float &R) {
          if (!enabled) return;
          float lowL = lpL.process(L);
          float lowR = lpR.process(R);
          float highL = hpL.process(L);
          float highR = hpR.process(R);
          float monoBass = (lowL + lowR) * 0.5f;
          float mid = (highL + highR) * 0.5f;
          float side = (highL - highR) * 0.5f;
          float centerGain = std::pow(10.0f, centerDb / 20.0f);
          float sideGain = std::pow(10.0f, sideDb / 20.0f) * (width / 100.0f);
          mid *= centerGain;
          side *= sideGain;
          L = monoBass + mid + side;
          R = monoBass + mid - side;
      }

      void reset() {
          lpL.reset(); lpR.reset(); hpL.reset(); hpR.reset();
          updateFilters();
      }
  } stereoWidener;

  SurroundVirtualizer surroundVirtualizer;
  
  // Dynamic EQ (Professional Mastering) - High Quality 2nd Order
  struct DynamicEQ {
      bool enabled;
      float frequency;   
      float q;           
      float threshold;   
      float targetGain;  
      float range;       
      float attackMs;
      float releaseMs;

      // Processing State
      float env;         
      Biquad detL, detR;    
      Biquad peakL, peakR;  
      
      uint32_t counter;
      float smoothedGainDb;

      DynamicEQ() : enabled(false), frequency(3500.0f), q(2.0f), threshold(-40.0f),
                    targetGain(-6.0f), range(12.0f), attackMs(5.0f), releaseMs(120.0f),
                    env(0.0f), counter(0), smoothedGainDb(0.0f) {
          detL.reset(); detR.reset(); peakL.reset(); peakR.reset();
      }

      void setParams(bool en, float f, float _q, float thr, float gain, float rng, float atk, float rel) {
          bool freqChanged = (std::abs(f - frequency) > 1.0f || std::abs(_q - q) > 0.05f);
          enabled = en;
          frequency = f;
          q = _q;
          threshold = thr;
          targetGain = gain;
          range = rng;
          attackMs = atk;
          releaseMs = rel;

          if (freqChanged) {
              detL.setBandPass(frequency, q);
              detR.setBandPass(frequency, q);
          }
      }

      void process(float &L, float &R) {
          if (!enabled) return;

          float sr = gSampleRate;
          float atkCoeff = std::exp(-1.0f / (0.001f * std::max(0.1f, attackMs) * sr));
          float relCoeff = std::exp(-1.0f / (0.001f * std::max(1.0f, releaseMs) * sr));

          float thrLin = std::pow(10.0f, threshold / 20.0f);
          float targetGainDb = clampf(targetGain, -24.0f, 24.0f);
          float maxRange = clampf(range, 0.0f, 36.0f);

          // 1. Detection
          float detOutL = detL.process(L);
          float detOutR = detR.process(R);
          float x = 0.5f * (std::abs(detOutL) + std::abs(detOutR));

          // 2. Envelope
          if (x > env) env = atkCoeff * env + (1.0f - atkCoeff) * x;
          else env = relCoeff * env + (1.0f - relCoeff) * x;

          // 3. Dynamic Gain Calculation & Smoothing
          float over = (env > thrLin) ? (env - thrLin) / (thrLin + 1e-6f) : 0.0f;
          float targetDynDb = clampf(over * targetGainDb, -maxRange, maxRange);
          
          // Smooth the gain to avoid filter ripples
          smoothedGainDb = 0.995f * smoothedGainDb + 0.005f * targetDynDb;

          // 4. Update filters (Every 64 samples for stability and performance)
          if (++counter >= 64) {
              peakL.setPeakingEQ(frequency, q, smoothedGainDb);
              peakR.setPeakingEQ(frequency, q, smoothedGainDb);
              counter = 0;
          }

          // 5. Apply
          L = peakL.process(L);
          R = peakR.process(R);

          // Debug
          static int debugCounter = 0;
          if (enabled && ++debugCounter > 10000) {
              printf("[DYNAMIC EQ] env=%.4f thr=%.4f dynGain=%.2f dB over=%.2f\n", 
                     env, thrLin, smoothedGainDb, over);
              debugCounter = 0;
          }
      }
  } dynamicEQ;


  // State
  float webLowPassFreq;
  float gains[NUM_BANDS];
  float targetGains[NUM_BANDS];
  float currentGains[NUM_BANDS];
  float targetTone[3];
  float currentTone[3];
  float targetStereoWidth;
  float currentStereoWidth;
  float targetPreGain;
  float currentPreGain;
  float currentMasterGain;
  bool autoGainEnabled;
  float autoGainTargetRms;
  float autoGainMaxBoost;
  float autoGainCurrent;
  float autoGainRms;
  float autoGainAttack;
  float autoGainRelease;
  float smartMix;
  std::array<int, NUM_BANDS> activeBands;
  int activeBandCount;
  float limiterCeiling;
  bool smartEnabled;
  bool dspEnabled;
  bool needsRebuild;

  // Steady-State Noise Detector
  float lastRMS;
  float rmsVariance;
  int frozenCounter;
  bool signalFrozen;
  bool forceMute;
  float monitorGateThreshold;
  Resampler monitorResampler;

public:
  MasterDSP()
      : targetPreGain(1.0f), currentPreGain(1.0f), activeBandCount(0),
        webLowPassFreq(8000.0f), bassBoostEnabled(false) {
    truePeakStereoLink = true;
    filtersLeft.resize(NUM_BANDS);
    filtersRight.resize(NUM_BANDS);
    for (int i = 0; i < NUM_BANDS; ++i) {
      gains[i] = 1.0f;
      targetGains[i] = 1.0f;
      currentGains[i] = 1.0f;
    }
    targetTone[0] = targetTone[1] = targetTone[2] = 1.0f;
    currentTone[0] = currentTone[1] = currentTone[2] = 1.0f;
    targetStereoWidth = 1.0f;
    currentStereoWidth = 1.0f;
    currentMasterGain = 1.0f;
    autoGainEnabled = false;
    autoGainTargetRms = std::pow(10.0f, -14.0f / 20.0f);
    autoGainMaxBoost = std::pow(10.0f, 12.0f / 20.0f);
    autoGainCurrent = 1.0f;
    autoGainRms = 0.02f;
    autoGainAttack = 0.0007f;
    autoGainRelease = 0.00018f;
    smartMix = 0.3f;
    smartEnabled = true;
    dspEnabled = true;
    needsRebuild = false;

    limiterCeiling = std::pow(10.0f, -0.3f / 20.0f);

    lastRMS = 0.0f;
    rmsVariance = 1.0f;
    frozenCounter = 0;
    signalFrozen = false;
    forceMute = false;
    monitorGateThreshold = std::pow(10.0f, -35.0f / 20.0f);
  }

  void rebuildFilters() {
    for (auto &f : filtersLeft) f.reset();
    for (auto &f : filtersRight) f.reset();
    lowExciterL.reset(); lowExciterR.reset();
    highExciterL.reset(); highExciterR.reset();
    smartBassL.reset(); smartBassR.reset();
    bassLoudL.reset(); bassLoudR.reset();
    bassProtectL.reset(); bassProtectR.reset();
    toneMidL.reset(); toneMidR.reset();
    toneHighL.reset(); toneHighR.reset();
    webLowPassL.reset(); webLowPassR.reset();
    peqL.recalc(); peqR.recalc();
    exciter.updateFilters();
    deesser.updateFilters();
    stereoWidener.updateFilters();

    const float Q = 2.5f;
    for (int b = 0; b < NUM_BANDS; ++b) {
      if (b == 0) {
        filtersLeft[b].setLowShelf(CENTER_FREQUENCIES[b], currentGains[b]);
        filtersRight[b].setLowShelf(CENTER_FREQUENCIES[b], currentGains[b]);
      } else if (b == NUM_BANDS - 1) {
        filtersLeft[b].setHighShelf(CENTER_FREQUENCIES[b], currentGains[b]);
        filtersRight[b].setHighShelf(CENTER_FREQUENCIES[b], currentGains[b]);
      } else {
        filtersLeft[b].setPeakingEQ(CENTER_FREQUENCIES[b], Q, currentGains[b]);
        filtersRight[b].setPeakingEQ(CENTER_FREQUENCIES[b], Q, currentGains[b]);
      }
    }

    lowExciterL.setLowPass(120.0f, 0.7f);
    lowExciterR.setLowPass(120.0f, 0.7f);
    highExciterL.setHighPass(6000.0f, 0.7f);
    highExciterR.setHighPass(6000.0f, 0.7f);

    smartBassL.setLowPass(120.0f, 0.7f);
    smartBassR.setLowPass(120.0f, 0.7f);
    bassLoudL.setLowShelf(100.0f, currentTone[0]);
    bassLoudR.setLowShelf(100.0f, currentTone[0]);
    bassProtectL.setLowPass(140.0f, 0.7f);
    bassProtectR.setLowPass(140.0f, 0.7f);

    toneMidL.setPeakingEQ(1000.0f, 0.8f, currentTone[1]);
    toneMidR.setPeakingEQ(1000.0f, 0.8f, currentTone[1]);
    toneHighL.setHighShelf(10000.0f, currentTone[2]);
    toneHighR.setHighShelf(10000.0f, currentTone[2]);
    webLowPassL.setLowPass(webLowPassFreq, 0.7f);
    webLowPassR.setLowPass(webLowPassFreq, 0.7f);
  }

  void setSampleRate(float sr) {
    float clamped = clampf(sr, 8000.0f, 192000.0f);
    if (std::abs(clamped - gSampleRate) < 1.0f)
      return;
    gSampleRate = clamped;
    needsRebuild = true;
  }

  // ... [Standard Angolla Setters]
  void updateTargets() {
    float max_boost = 0.0f;
    for (int i = 0; i < NUM_BANDS; ++i) {
      targetGains[i] = gains[i];
      float weight = (i == 0 || i == NUM_BANDS - 1) ? 0.6f : 1.0f;
      float weighted = targetGains[i] * weight;
      if (weighted > max_boost)
        max_boost = weighted;
    }
    float soft_boost = 6.0f * std::tanh(max_boost / 6.0f);
    targetPreGain = std::pow(10.0f, -(soft_boost * 0.60f) / 20.0f);
  }

  void setEQGain(int band, float db) {
    if (band >= 0 && band < NUM_BANDS) {
      gains[band] = db;
      updateTargets();
    }
  }

  void setEQGains(const float *newGains, int numBands) {
    if (!newGains) return;
    int count = std::min(numBands, NUM_BANDS);
    for (int i = 0; i < count; ++i) gains[i] = newGains[i];
    updateTargets();
  }

  void setDSPEnabled(bool enabled) { dspEnabled = enabled; }
  void setToneParams(float bass, float mid, float treble) {
    targetTone[0] = bass; targetTone[1] = mid; targetTone[2] = treble;
  }
  void setStereoWidth(float width) { targetStereoWidth = clampf(width, 0.0f, 2.0f); }
  void setStereoWidenerParams(bool enabled, float width, float center, float side, float bassToMono) {
      stereoWidener.setParams(enabled, width, center, side, bassToMono);
  }
  void setMasterToggle(bool active) { smartEnabled = active; }
  void setAutoGainParams(bool enabled, float targetLevel, float maxGain, int speed) {
    autoGainEnabled = enabled;
    autoGainTargetRms = std::pow(10.0f, clampf(targetLevel, -24.0f, -6.0f) / 20.0f);
    autoGainMaxBoost = std::pow(10.0f, clampf(maxGain, 0.0f, 24.0f) / 20.0f);
    if (speed <= 0) {
      autoGainAttack = 0.00028f; autoGainRelease = 0.00008f;
    } else if (speed >= 2) {
      autoGainAttack = 0.0022f; autoGainRelease = 0.00055f;
    } else {
      autoGainAttack = 0.00085f; autoGainRelease = 0.0002f;
    }
  }
  void setWebLPF(float freq) {
    float clamped = clampf(freq, 200.0f, 20000.0f);
    if (std::abs(clamped - webLowPassFreq) > 1.0f) {
      webLowPassFreq = clamped;
      webLowPassL.setLowPass(webLowPassFreq, 0.7f);
      webLowPassR.setLowPass(webLowPassFreq, 0.7f);
    }
  }
  void setForceMute(bool mute) { forceMute = mute; }

  // [Enhanced Setters for Extra Effects]
  void setCompressorParams(bool enabled, float thresh, float ratio, float att, float rel, float makeup) {
        compressorL.enabled = enabled; compressorR.enabled = enabled;
        if (enabled) {
            compressorL.setParams(thresh, ratio, att, rel, makeup);
            compressorR.setParams(thresh, ratio, att, rel, makeup);
        }
    }
    
    void setGateParams(bool enabled, float thresh, float att, float hold, float rel, float range) {
        gateL.enabled = enabled; gateR.enabled = enabled;
        if (enabled) {
            gateL.setParams(thresh, att, hold, rel, range);
            gateR.setParams(thresh, att, hold, rel, range);
        }
    }
    
    void setLimiterParams(bool enabled, float ceiling, float rel, float lookahead, float gain) {
        limiterL.enabled = enabled; limiterR.enabled = enabled;
        if (enabled) {
            limiterL.setParams(ceiling, rel, lookahead, gain);
            limiterR.setParams(ceiling, rel, lookahead, gain);
        }
    }

    void setTruePeakParams(bool enabled, float ceiling, float rel, float lookahead, float drive, int oversampling, bool stereoLink) {
        truePeakL.enabled = enabled; truePeakR.enabled = enabled;
        truePeakStereoLink = stereoLink;
        if (enabled) {
            float osGuardDb = oversampling >= 8 ? 0.22f : oversampling >= 4 ? 0.14f : oversampling >= 2 ? 0.08f : 0.0f;
            truePeakL.setParams(ceiling - osGuardDb, rel, lookahead, drive);
            truePeakR.setParams(ceiling - osGuardDb, rel, lookahead, drive);
        }
    }

    void setExciterParams(bool enabled, float frequency, float amount, float mix, int harmonicType) {
        exciter.setParams(enabled, frequency, amount, mix, harmonicType);
    }

    void setDeEsserParams(bool enabled, float frequency, float threshold, float ratio, float range) {
        deesser.setParams(enabled, frequency, threshold, ratio, range);
    }
    
    void setEchoParams(bool enabled, float delay, float feedback, float mix, float highCut, bool softMode) {
        echoL.enabled = enabled; echoR.enabled = enabled;
        if (enabled) {
            echoL.setParams(delay, feedback, mix, highCut, softMode);
            echoR.setParams(delay, feedback, mix, highCut, softMode);
        }
    }

    void setConvolutionReverbParams(bool enabled, float mix, float predelay, int preset) {
        convolutionReverb.setParams(enabled, mix, predelay, preset);
    }
    
    void setBassBoost(bool enabled, float gain, float freq) {
        bassBoostEnabled = enabled;
        bassBoostGain = gain;
        bassBoostL.setLowShelf(freq, gain);
        bassBoostR.setLowShelf(freq, gain);
    }

    void setCrossfeedParams(bool enabled, float level, float delay, float lowCut, float highCut) {
        crossfeed.setParams(enabled, level, delay, lowCut, highCut);
    }

    void setPEQBand(int index, bool enabled, float freq, float gain, float Q) {
        peqL.enabled = enabled; peqR.enabled = enabled;
        peqL.setBand(index, freq, gain, Q);
        peqR.setBand(index, freq, gain, Q);
    }
    
    void setPEQFilterType(int index, int filterType) {
        peqL.setFilterType(index, static_cast<PEQFilterType>(filterType));
    peqR.setFilterType(index, static_cast<PEQFilterType>(filterType));
  }

  void setBassMonoParams(bool enabled, float cutoff, float slope, float width) {
      bassMono.setParams(enabled, cutoff, slope, width);
  }
  
  void setDynamicEQParams(bool enabled, float freq, float q, float thr, float gain, float rng, float atk, float rel) {
      dynamicEQ.setParams(enabled, freq, q, thr, gain, rng, atk, rel);
  }

  void setBitDitherParams(bool enabled, int bitDepth, int dither, int shaping, int downsample, float mix, float outputDb) {
      bitDither.setParams(enabled, bitDepth, dither, shaping, downsample, mix, outputDb);
  }

  void setTapeSaturationParams(bool enabled, float drive, float mix, float tone, float outputDb, int mode, float hiss) {
      tapeSaturation.setParams(enabled, drive, mix, tone, outputDb, mode, hiss);
  }

  void setSurroundParams(bool enabled, float center, float surround, float lfe, float crossover, float delay, float mix) {
      surroundVirtualizer.setParams(enabled, center, surround, lfe, crossover, delay, mix);
  }
  
  // PEQ band ayarlarını al
    void getPEQBand(int index, float* freq, float* gain, float* Q, int* filterType) {
        if (index < 0 || index >= ParametricEQ::BANDS) return;
        *freq = peqL.settings[index].freq;
        *gain = peqL.settings[index].gain;
        *Q = peqL.settings[index].Q;
        *filterType = static_cast<int>(peqL.settings[index].filterType);
    }

  void resetStateForSeek() {
    rebuildFilters();
    for (int i = 0; i < NUM_BANDS; ++i) {
      currentGains[i] = targetGains[i];
    }
    currentTone[0] = targetTone[0];
    currentTone[1] = targetTone[1];
    currentTone[2] = targetTone[2];
    currentStereoWidth = targetStereoWidth;
    currentPreGain = targetPreGain;
    currentMasterGain = targetPreGain;
    smartMix = smartEnabled ? 1.0f : 0.0f;
    activeBandCount = 0;
    lastRMS = 0.0f;
    rmsVariance = 1.0f;
    frozenCounter = 0;
    signalFrozen = false;

    compressorL.envelope = 0.0f; compressorR.envelope = 0.0f;
    gateL.envelope = 1.0f; gateR.envelope = 1.0f;
    gateL.holdCounter = 0; gateR.holdCounter = 0;
    limiterL.envelope = 0.0f; limiterR.envelope = 0.0f;

    std::fill(echoL.buffer.begin(), echoL.buffer.end(), 0.0f);
    std::fill(echoR.buffer.begin(), echoR.buffer.end(), 0.0f);
    echoL.pos = 0; echoR.pos = 0;
    echoL.tone.reset(); echoR.tone.reset();
    echoL.softTone.reset(); echoR.softTone.reset();
    echoL.smear = 0.0f; echoR.smear = 0.0f;
    convolutionReverb.reset();

    peqL.recalc(); peqR.recalc();
    for (int i = 0; i < ParametricEQ::BANDS; ++i) {
      peqL.bands[i].reset();
      peqR.bands[i].reset();
    }

    bassBoostL.reset(); bassBoostR.reset();
    exciter.reset();
    deesser.reset();
    stereoWidener.reset();

    std::fill(crossfeed.delayBufferL.begin(), crossfeed.delayBufferL.end(), 0.0f);
    std::fill(crossfeed.delayBufferR.begin(), crossfeed.delayBufferR.end(), 0.0f);
    crossfeed.bufferPos = 0;
    crossfeed.currentMix = 0.0f;
    crossfeed.delaySamples = crossfeed.targetDelaySamples;
    crossfeed.shadowHighpassL.reset();
    crossfeed.shadowHighpassR.reset();
    crossfeed.shadowLowpassL.reset();
    crossfeed.shadowLowpassR.reset();

    bassMono.reset();

    dynamicEQ.env = 0.0f;
    dynamicEQ.counter = 0;
    dynamicEQ.smoothedGainDb = 0.0f;
    dynamicEQ.detL.reset(); dynamicEQ.detR.reset();
    dynamicEQ.peakL.reset(); dynamicEQ.peakR.reset();

    bitDither.reset();

    tapeSaturation.reset();

    surroundVirtualizer.reset();

    std::fill(monitorResampler.bufferL, monitorResampler.bufferL + 256, 0.0f);
    std::fill(monitorResampler.bufferR, monitorResampler.bufferR + 256, 0.0f);
    monitorResampler.writePos = 0;
    monitorResampler.phase = 0.0;
    needsRebuild = false;
  }

  void processBuffer(float *buffer, int numFrames, int channels) {
    if (!buffer || channels != 2) return;
    int total_samples = numFrames * channels;
    if (total_samples <= 0) return;

    double sum_sq = 0.0;
    for (int i = 0; i < total_samples; ++i) {
      float v = buffer[i];
      sum_sq += static_cast<double>(v) * static_cast<double>(v);
    }
    float rms = std::sqrt(sum_sq / total_samples);
    
    if (rms < NOISE_GATE_RMS) {
      std::fill(buffer, buffer + total_samples, 0.0f);
      return;
    }

    if (needsRebuild) { rebuildFilters(); needsRebuild = false; }
    
    if (!dspEnabled) return;

    const float smoothingSamples = std::max(512.0f, gSampleRate * 0.02f);
    const float smartHeadroomDb = -3.0f;
    const float smartStep = 1.0f / smoothingSamples;
    const float invSmoothing = 1.0f / smoothingSamples;
    const float smoothThreshold = 0.0001f;
    const float Q = 2.5f;
    const float toneQ = 0.8f;
    const float duckThresholdDb = 10.0f;
    const float duckRangeDb = 5.0f;
    const float duckMaxDb = -6.0f;
    const float bassLimit = limiterCeiling * 0.85f;
    const float hardLimiterCeiling = 1.0f;

    auto hard_limit = [&](float x) {
      if (x > hardLimiterCeiling) return hardLimiterCeiling;
      if (x < -hardLimiterCeiling) return -hardLimiterCeiling;
      return x;
    };

    // Update EQ gains + coefficients once per buffer to avoid zipper noise and potential IIR instability.
    const float blockAlpha = 1.0f - std::pow(1.0f - invSmoothing, (float)numFrames);
    activeBandCount = 0;
    for (int b = 0; b < NUM_BANDS; ++b) {
      float diff = targetGains[b] - currentGains[b];
      if (std::abs(diff) > smoothThreshold) {
        currentGains[b] += diff * blockAlpha;
      } else if (diff != 0.0f) {
        currentGains[b] = targetGains[b];
      }

      if (b == 0) {
        filtersLeft[b].setLowShelf(CENTER_FREQUENCIES[b], currentGains[b]);
        filtersRight[b].setLowShelf(CENTER_FREQUENCIES[b], currentGains[b]);
      } else if (b == NUM_BANDS - 1) {
        filtersLeft[b].setHighShelf(CENTER_FREQUENCIES[b], currentGains[b]);
        filtersRight[b].setHighShelf(CENTER_FREQUENCIES[b], currentGains[b]);
      } else {
        filtersLeft[b].setPeakingEQ(CENTER_FREQUENCIES[b], Q, currentGains[b]);
        filtersRight[b].setPeakingEQ(CENTER_FREQUENCIES[b], Q, currentGains[b]);
      }

      if (std::abs(currentGains[b]) > 1e-5f) activeBands[activeBandCount++] = b;
    }

    for (int i = 0; i < numFrames * 2; i += 2) {
      float &L = buffer[i];
      float &R = buffer[i + 1];
      float inL = L;
      float inR = R;

      // --- Angolla Smart Logic ---
      float smartTarget = smartEnabled ? 1.0f : 0.0f;
      if (smartMix < smartTarget) smartMix = std::min(smartTarget, smartMix + smartStep);
      else if (smartMix > smartTarget) smartMix = std::max(smartTarget, smartMix - smartStep);

      if (smartMix > 0.0f) {
        float lowL = smartBassL.process(inL);
        float lowR = smartBassR.process(inR);
        float drive = 1.4f;
        float harmL = std::tanh(lowL * drive) - lowL;
        float harmR = std::tanh(lowR * drive) - lowR;
        inL += harmL * (0.12f * smartMix);
        inR += harmR * (0.12f * smartMix);
        float headroom = std::pow(10.0f, (smartHeadroomDb * smartMix) / 20.0f);
        inL *= headroom;
        inR *= headroom;
      }

      currentPreGain += (targetPreGain - currentPreGain) * invSmoothing;
      currentStereoWidth += (targetStereoWidth - currentStereoWidth) * invSmoothing;

      L = inL * currentPreGain;
      R = inR * currentPreGain;

      // --- CUSTOM EFFECT CHAIN START ---
      // 1. Noise Gate
      if (gateL.enabled) { L = gateL.process(L); R = gateR.process(R); }
      // 2. Compressor
      if (compressorL.enabled) { L = compressorL.process(L); R = compressorR.process(R); }
      // 3. Bass Boost (Custom, separate from Angolla SmartBass)
      if (bassBoostEnabled) { L = bassBoostL.process(L); R = bassBoostR.process(R); }
      // 4. Parametric EQ
      if (peqL.enabled) { L = peqL.process(L); R = peqR.process(R); }
      // 5. Exciter (high-band harmonic enhancer)
      exciter.process(L, R);
      // 6. De-esser (dynamic sibilance reduction)
      deesser.process(L, R);
      // 7. Stereo Widener (mid/side + mono bass)
      stereoWidener.process(L, R);
      // 8. Crossfeed (Headphone Enhancement) - Before limiter
      crossfeed.process(L, R);
      // 9. Bass Mono (Low Frequency Mono Summing) - Important for Master/Vinyl
      bassMono.process(L, R);
      // 10. Dynamic EQ (Professional Mastering)
      dynamicEQ.process(L, R);
      // 11. Surround Virtualizer (stereo based 5.1/7.1 simulation)
      surroundVirtualizer.process(L, R);
      // --- CUSTOM EFFECT CHAIN END ---

      // --- 32-Band Angolla EQ ---
      for (int j = 0; j < activeBandCount; ++j) {
        int b = activeBands[j];
        L = filtersLeft[b].process(L);
        R = filtersRight[b].process(R);
      }

      // --- Angolla Exciter Logic ---
      float low_boost = currentGains[0];
      float high_boost = currentGains[NUM_BANDS - 1];
      float low_amount = clampf((low_boost - 10.0f) / 5.0f, 0.0f, 1.0f);
      float high_amount = clampf((high_boost - 10.0f) / 5.0f, 0.0f, 1.0f);

      if (low_amount > 0.0f) {
        float lowL = lowExciterL.process(L); float lowR = lowExciterR.process(R);
        float drive = 1.0f + (low_amount * 2.0f);
        float harmL = std::tanh(lowL * drive) - lowL; float harmR = std::tanh(lowR * drive) - lowR;
        L += harmL * (0.10f * low_amount); R += harmR * (0.10f * low_amount);
      }
      if (high_amount > 0.0f) {
        float highL = highExciterL.process(L); float highR = highExciterR.process(R);
        float drive = 1.0f + (high_amount * 2.5f);
        float harmL = std::tanh(highL * drive) - highL; float harmR = std::tanh(highR * drive) - highR;
        L += harmL * (0.08f * high_amount); R += harmR * (0.08f * high_amount);
      }

      // --- Angolla Tone Space ---
      for (int t = 0; t < 3; ++t) {
        float diff = targetTone[t] - currentTone[t];
        if (std::abs(diff) > smoothThreshold) currentTone[t] += diff * invSmoothing;
        else if (diff != 0.0f) currentTone[t] = targetTone[t];
      }

      if (smartMix > 0.0f) {
        bassLoudL.setLowShelf(100.0f, currentTone[0]); bassLoudR.setLowShelf(100.0f, currentTone[0]);
        toneMidL.setPeakingEQ(1000.0f, toneQ, currentTone[1]); toneMidR.setPeakingEQ(1000.0f, toneQ, currentTone[1]);
        toneHighL.setHighShelf(10000.0f, currentTone[2]); toneHighR.setHighShelf(10000.0f, currentTone[2]);

        float toneScale = smartMix;
        float L_proc = L; float R_proc = R;
        L_proc = bassLoudL.process(L_proc); R_proc = bassLoudR.process(R_proc);
        L_proc = toneMidL.process(L_proc); R_proc = toneMidR.process(R_proc);
        L_proc = toneHighL.process(L_proc); R_proc = toneHighR.process(R_proc);
        L = L * (1.0f - toneScale) + L_proc * toneScale;
        R = R * (1.0f - toneScale) + R_proc * toneScale;

        if (currentStereoWidth != 1.0f) {
          float M = (L + R) * 0.5f; float S = (L - R) * 0.5f; S *= currentStereoWidth;
          L = M + S; R = M - S;
        }
      }

      // 5. Convolution-style room response
      convolutionReverb.process(L, R);
      // 6. Echo (Post-Processing)
      if (echoL.enabled) { L = echoL.process(L); R = echoR.process(R); }

      // --- Angolla Dynamic Handling (Limiter/Duck) ---
      float duckAmount = 0.0f;
      if (smartMix > 0.0f && currentTone[0] > duckThresholdDb) {
        duckAmount = clampf((currentTone[0] - duckThresholdDb) / duckRangeDb, 0.0f, 1.0f);
      }
      float max_low_boost = 0.0f;
      for (int b = 0; b < 6; ++b) if (currentGains[b] > max_low_boost) max_low_boost = currentGains[b];

      float bass_reduction_db = std::max(0.0f, max_low_boost * 0.45f);
      float tone_bass_boost_db = std::max(0.0f, currentTone[0]) * smartMix;
      float tone_bass_reduction_db = tone_bass_boost_db * 0.333f;
      float duck_db = duckMaxDb * duckAmount * smartMix;
      float targetMaster = limiterCeiling * std::pow(10.0f, (duck_db - bass_reduction_db - tone_bass_reduction_db) / 20.0f);

      currentMasterGain += (targetMaster - currentMasterGain) * invSmoothing;
      L *= currentMasterGain; R *= currentMasterGain;

      if (autoGainEnabled) {
        float frameRms = std::sqrt((L * L + R * R) * 0.5f);
        float rmsAlpha = frameRms > autoGainRms ? autoGainAttack : autoGainRelease;
        autoGainRms += (frameRms - autoGainRms) * rmsAlpha;
        float wantedGain = 1.0f;
        if (autoGainRms > 0.00035f) {
          wantedGain = clampf(autoGainTargetRms / autoGainRms, 0.18f, autoGainMaxBoost);
        }
        float gainAlpha = wantedGain > autoGainCurrent ? autoGainAttack : autoGainRelease * 1.7f;
        autoGainCurrent += (wantedGain - autoGainCurrent) * gainAlpha;
        L *= autoGainCurrent;
        R *= autoGainCurrent;
      } else if (std::abs(autoGainCurrent - 1.0f) > 0.0001f) {
        autoGainCurrent += (1.0f - autoGainCurrent) * 0.0004f;
        L *= autoGainCurrent;
        R *= autoGainCurrent;
      }

      // Bass Protect Hard Limiter
      auto bass_limit = [&](float x) {
        float ax = std::abs(x);
        if (ax <= bassLimit) return x;
        float excess = ax - bassLimit; float k = 6.0f;
        float compressed = bassLimit + (1.0f - std::exp(-k * excess)) / k;
        return (x < 0.0f) ? -compressed : compressed;
      };
      
      float lowL = bassProtectL.process(L); float lowR = bassProtectR.process(R);
      L = (L - lowL) + bass_limit(lowL);
      R = (R - lowR) + bass_limit(lowR);

      // Angolla Soft Limiter
      auto soft_limit = [&](float x) {
        float ax = std::abs(x);
        if (ax <= limiterCeiling) return x;
        float excess = ax - limiterCeiling; float k = 4.0f;
        float compressed = limiterCeiling + (1.0f - std::exp(-k * excess)) / k;
        return (x < 0.0f) ? -compressed : compressed;
      };
      L = soft_limit(L); R = soft_limit(R);

      // 6. Bass Mono (Low Frequency Mono Summing)
      bassMono.process(L, R);

      // 7. User Limiter (Post-everything safety)
      if (limiterL.enabled) { L = limiterL.process(L); R = limiterR.process(R); }

      // 8. Tape Saturation and Bit-depth / Dither (final creative color stages)
      tapeSaturation.process(L, R);
      bitDither.process(L, R);

      // 9. True Peak Limiter (absolute final safety, after color/dither stages)
      if (truePeakL.enabled) {
        L = truePeakL.process(L);
        R = truePeakR.process(R);
        if (truePeakStereoLink) {
          const float linkedPeak = std::max(std::abs(L), std::abs(R));
          const float linkedCeiling = std::min(truePeakL.ceiling, truePeakR.ceiling);
          if (linkedPeak > linkedCeiling && linkedPeak > 1e-6f) {
            const float linkedGain = linkedCeiling / linkedPeak;
            L *= linkedGain;
            R *= linkedGain;
          }
        }
      }

      buffer[i] = hard_limit(L);
      buffer[i + 1] = hard_limit(R);
    }
  }

  void processWebBuffer(float *buffer, int numFrames, int channels) {
      // Just wrap processBuffer for now, Angolla had duplicate logic for web
      processBuffer(buffer, numFrames, channels);
  }

  void processMonitorBuffer(float *buffer, int numFrames, int inSampleRate) {
    if (!buffer) return;
    // Just forward to processWeb
    processWebBuffer(buffer, numFrames, 2);
  }
};

} // namespace ArDaliDSP

// ==================================================================================
// C-INTERFACE
// ==================================================================================
extern "C" {
void *create_dsp() { return new ArDaliDSP::MasterDSP(); }
void destroy_dsp(void *dsp) { delete static_cast<ArDaliDSP::MasterDSP *>(dsp); }
void process_dsp(void *dsp, float *buffer, int numFrames, int channels) {
  if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->processBuffer(buffer, numFrames, channels);
}
void set_eq_band(void *dsp, int band, float gain) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setEQGain(band, gain); }
void set_eq_bands(void *dsp, const float *gains, int numBands) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setEQGains(gains, numBands); }
void set_tone_params(void *dsp, float bass, float mid, float treble) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setToneParams(bass, mid, treble); }
void set_stereo_width(void *dsp, float width) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setStereoWidth(width); }
void set_stereo_widener_params(void *dsp, int enabled, float width, float center, float side, float bassToMono) {
  if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setStereoWidenerParams(enabled != 0, width, center, side, bassToMono);
}
void set_master_toggle(void *dsp, int active) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setMasterToggle(active != 0); }
void set_dsp_enabled(void *dsp, int enabled) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setDSPEnabled(enabled != 0); }
void set_sample_rate(void *dsp, float sample_rate) { if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setSampleRate(sample_rate); }
// New wrappers
void set_compressor_params(void *dsp, int enabled, float thresh, float ratio, float att, float rel, float makeup) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setCompressorParams(enabled != 0, thresh, ratio, att, rel, makeup);
}
void set_auto_gain_params(void *dsp, int enabled, float target, float maxGain, int speed) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setAutoGainParams(enabled != 0, target, maxGain, speed);
}
void set_gate_params(void *dsp, int enabled, float thresh, float att, float hold, float rel, float range) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setGateParams(enabled != 0, thresh, att, hold, rel, range);
}
void set_limiter_params(void *dsp, int enabled, float ceiling, float rel, float lookahead, float gain) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setLimiterParams(enabled != 0, ceiling, rel, lookahead, gain);
}
void set_true_peak_params(void *dsp, int enabled, float ceiling, float rel, float lookahead, float drive, int oversampling, int stereoLink) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setTruePeakParams(enabled != 0, ceiling, rel, lookahead, drive, oversampling, stereoLink != 0);
}
void set_exciter_params(void *dsp, int enabled, float frequency, float amount, float mix, int harmonicType) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setExciterParams(enabled != 0, frequency, amount, mix, harmonicType);
}
void set_deesser_params(void *dsp, int enabled, float frequency, float threshold, float ratio, float range) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setDeEsserParams(enabled != 0, frequency, threshold, ratio, range);
}
void set_echo_params(void *dsp, int enabled, float delay, float feedback, float mix, float highCut, int softMode) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setEchoParams(enabled != 0, delay, feedback, mix, highCut, softMode != 0);
}
void set_convolution_reverb_params(void *dsp, int enabled, float mix, float predelay, int preset) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setConvolutionReverbParams(enabled != 0, mix, predelay, preset);
}
void set_bass_boost(void *dsp, int enabled, float gain, float freq) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setBassBoost(enabled != 0, gain, freq);
}
void set_peq_band(void *dsp, int band, int enabled, float freq, float gain, float Q) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setPEQBand(band, enabled != 0, freq, gain, Q);
}
void set_peq_filter_type(void *dsp, int band, int filterType) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setPEQFilterType(band, filterType);
}
void get_peq_band(void *dsp, int band, float* freq, float* gain, float* Q, int* filterType) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->getPEQBand(band, freq, gain, Q, filterType);
}
void reset_dsp_state(void *dsp) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->resetStateForSeek();
}
void set_crossfeed_params(void *dsp, int enabled, float level, float delay, float lowCut, float highCut) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setCrossfeedParams(enabled != 0, level, delay, lowCut, highCut);
}
void set_bass_mono_params(void *dsp, int enabled, float cutoff, float slope, float width) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setBassMonoParams(enabled != 0, cutoff, slope, width);
}
void set_dynamic_eq_params(void *dsp, int enabled, float freq, float q, float thr, float gain, float rng, float atk, float rel) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setDynamicEQParams(enabled != 0, freq, q, thr, gain, rng, atk, rel);
}
void set_bit_dither_params(void *dsp, int enabled, int bitDepth, int dither, int shaping, int downsample, float mix, float outputDb) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setBitDitherParams(enabled != 0, bitDepth, dither, shaping, downsample, mix, outputDb);
}
void set_tape_saturation_params(void *dsp, int enabled, float drive, float mix, float tone, float outputDb, int mode, float hiss) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setTapeSaturationParams(enabled != 0, drive, mix, tone, outputDb, mode, hiss);
}
void set_surround_params(void *dsp, int enabled, float center, float surround, float lfe, float crossover, float delay, float mix) {
    if (dsp) static_cast<ArDaliDSP::MasterDSP *>(dsp)->setSurroundParams(enabled != 0, center, surround, lfe, crossover, delay, mix);
}
}
