/**
 * The vocal remover's AI model: UVR-MDX-NET Inst HQ 3 from the Ultimate Vocal Remover project
 * (github.com/Anjok07/ultimatevocalremovergui, MIT; its developers ask for credit when their models
 * are used, see THIRD_PARTY_NOTICES.md). It reads the spectrogram of a 5.9 s piece of a stereo song
 * and gives back the spectrogram of the music without the singing.
 *
 * Pinned to one exact version on Hugging Face (seanghay/uvr_models) and checked against its SHA-256.
 * The numbers below are this file's entry in UVR's own model list (found by the MD5 of the file's
 * last 10 MB, 55657dd70583b0fedfba5f67df11d711): they must match the file, or the result is noise.
 */
export const MODEL = {
  url: 'https://huggingface.co/seanghay/uvr_models/resolve/6f4fc0cfb0717c9033ffed12471a53008f145b20/UVR-MDX-NET-Inst_HQ_3.onnx',
  sha256: '317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc',
  size: 66_759_214,
  /** Its own cache: the background remover clears everything else out of "unktilz-models". */
  cache: 'unktilz-models-audio',
  /** The song is read at this rate. */
  sampleRate: 44100,
  nFft: 6144,
  hop: 1024,
  /** Frequency rows the model reads (of nFft / 2 + 1). */
  dimF: 3072,
  /** Time columns of one piece. */
  dimT: 256,
  /** The result is this much too quiet; UVR multiplies it back. */
  compensate: 1.022,
} as const;

/** Samples of one piece the model reads. */
export const CHUNK = MODEL.hop * (MODEL.dimT - 1);
/** The ends of a piece are unreliable and thrown away. */
export const TRIM = MODEL.nFft / 2;
/** Samples of the song each piece gives. */
export const STEP = CHUNK - 2 * TRIM;

/** Longer songs need more memory than a browser tab gets. */
export const MAX_SECONDS = 15 * 60;
