// i18n-ignore-file: maths only
// The short-time Fourier transform the model was trained with (torch.stft / torch.istft with a
// periodic Hann window, centred, reflect padding), for a window of 6144 samples.
//
// 6144 = 3 × 2048, so it isn't a power of two: a transform of that size is put together from three
// power-of-two ones, X[k] = Σr w^(r·k) · FFT2048(x[3m + r])[k mod 2048] with w = e^(−2πi / 6144).

/** In-place radix-2 FFT of n = 2^p complex numbers. */
function makeFft2(n: number) {
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  return (re: Float64Array, im: Float64Array) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let v = re[i];
        re[i] = re[j];
        re[j] = v;
        v = im[i];
        im[i] = im[j];
        im[j] = v;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step];
          const wi = sin[k * step];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  };
}

/** A forward FFT of n = 3 × 2^p complex numbers (out-of-place). */
export function makeFft(n: number) {
  const m = n / 3;
  if (!Number.isInteger(m) || (m & (m - 1)) !== 0) throw new Error('size must be 3 × 2^p');
  const fft2 = makeFft2(m);
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  const pr = [new Float64Array(m), new Float64Array(m), new Float64Array(m)];
  const pi = [new Float64Array(m), new Float64Array(m), new Float64Array(m)];
  return (inRe: Float64Array, inIm: Float64Array, outRe: Float64Array, outIm: Float64Array) => {
    for (let r = 0; r < 3; r++) {
      const a = pr[r];
      const b = pi[r];
      for (let j = 0; j < m; j++) {
        a[j] = inRe[3 * j + r];
        b[j] = inIm[3 * j + r];
      }
      fft2(a, b);
    }
    for (let k = 0; k < n; k++) {
      const q = k % m;
      const i1 = k; // w^k
      const i2 = (2 * k) % n; // w^(2k)
      outRe[k] = pr[0][q] + pr[1][q] * cos[i1] - pi[1][q] * sin[i1] + pr[2][q] * cos[i2] - pi[2][q] * sin[i2];
      outIm[k] = pi[0][q] + pr[1][q] * sin[i1] + pi[1][q] * cos[i1] + pr[2][q] * sin[i2] + pi[2][q] * cos[i2];
    }
  };
}

export type Stft = {
  /**
   * The spectrogram of `wave` (length hop × (frames − 1)) written into `out` as two planes, real then
   * imaginary, each `bins` rows of `frames` columns (row-major), starting at `offset`.
   */
  forward(wave: Float32Array, out: Float32Array, offset: number): void;
  /** The wave of a spectrogram laid out like `forward` writes it (missing top rows are zero). */
  inverse(spec: Float32Array, offset: number, wave: Float32Array): void;
};

export function makeStft(nFft: number, hop: number, bins: number, frames: number): Stft {
  const fft = makeFft(nFft);
  const half = nFft / 2;
  const window = new Float64Array(nFft);
  for (let i = 0; i < nFft; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);
  const length = hop * (frames - 1);
  const padded = new Float64Array(length + nFft);
  // The window squared, added up where the frames overlap: what the inverse divides by.
  const norm = new Float64Array(length + nFft);
  for (let f = 0; f < frames; f++) for (let i = 0; i < nFft; i++) norm[f * hop + i] += window[i] * window[i];
  const inRe = new Float64Array(nFft);
  const inIm = new Float64Array(nFft);
  const outRe = new Float64Array(nFft);
  const outIm = new Float64Array(nFft);
  const plane = bins * frames;

  return {
    forward(wave, out, offset) {
      // Centred: the wave is mirrored at both ends by half a window.
      for (let i = 0; i < half; i++) padded[i] = wave[half - i];
      for (let i = 0; i < length; i++) padded[half + i] = wave[i];
      for (let i = 0; i < half; i++) padded[half + length + i] = wave[length - 2 - i];
      inIm.fill(0);
      for (let f = 0; f < frames; f++) {
        const at = f * hop;
        for (let i = 0; i < nFft; i++) inRe[i] = padded[at + i] * window[i];
        inIm.fill(0);
        fft(inRe, inIm, outRe, outIm);
        for (let b = 0; b < bins; b++) {
          out[offset + b * frames + f] = outRe[b];
          out[offset + plane + b * frames + f] = outIm[b];
        }
      }
    },
    inverse(spec, offset, wave) {
      padded.fill(0);
      for (let f = 0; f < frames; f++) {
        // The full spectrum of a real signal: the upper half mirrors the lower one. The inverse is
        // the forward transform of the conjugate, conjugated (and divided by the size).
        inRe.fill(0);
        inIm.fill(0);
        for (let b = 0; b < bins; b++) {
          const re = spec[offset + b * frames + f];
          const im = spec[offset + plane + b * frames + f];
          inRe[b] = re;
          inIm[b] = -im;
          if (b > 0 && b < half) {
            inRe[nFft - b] = re;
            inIm[nFft - b] = im;
          }
        }
        fft(inRe, inIm, outRe, outIm);
        const at = f * hop;
        for (let i = 0; i < nFft; i++) padded[at + i] += (outRe[i] / nFft) * window[i];
      }
      for (let i = 0; i < length; i++) {
        const n = norm[half + i];
        wave[i] = n > 1e-11 ? padded[half + i] / n : 0;
      }
    },
  };
}
