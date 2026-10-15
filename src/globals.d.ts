/** Set by vite.config.ts from package.json. */
declare const __APP_VERSION__: string;

/** libheif compiled to wasm, with the wasm inlined. The default export starts it. */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const start: (options?: object) => unknown;
  export default start;
}
