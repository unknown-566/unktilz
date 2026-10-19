/**
 * The background remover's AI model: BiRefNet_lite (MIT licence) exported for 512×512 input, in half
 * precision, from Hugging Face (studioludens/birefnet-lite-512). The 1024×1024 exports run out of
 * memory in browsers; this one works on the graphics card and on the processor. Pinned to one exact
 * version and checked against the SHA-256 Hugging Face publishes for the file.
 */
export const MODEL = {
  url: 'https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/onnx/model_fp16.onnx',
  sha256: 'eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516',
  size: 98_484_532,
  /** It looks at the picture squeezed to this square. */
  side: 512,
  /** Cache Storage name (the model stays there between visits). */
  cache: 'unktilz-models',
};
