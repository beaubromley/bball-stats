/**
 * Sherpa-ONNX WASM speech engine integration.
 * Loads a streaming Zipformer transducer model for real-time ASR.
 * Runs entirely client-side — no server, no API costs.
 *
 * WASM runtime from: k2-fsa/web-assembly-asr-sherpa-onnx-en (Hugging Face)
 * Int8 model from: csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17
 */

// CDN URLs — change these to GitHub Release URLs if HF breaks
const WASM_CDN =
  "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main";
const MODEL_CDN =
  "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main";

const CACHE_NAME = "sherpa-model-v1";

// Model files to download (int8 quantized — ~44MB total)
const MODEL_FILES = [
  { url: `${MODEL_CDN}/encoder-epoch-99-avg-1.int8.onnx`, name: "encoder.onnx", size: 42_800_000 },
  { url: `${MODEL_CDN}/decoder-epoch-99-avg-1.int8.onnx`, name: "decoder.onnx", size: 539_000 },
  { url: `${MODEL_CDN}/joiner-epoch-99-avg-1.int8.onnx`, name: "joiner.onnx", size: 260_000 },
  { url: `${MODEL_CDN}/tokens.txt`, name: "tokens.txt", size: 5_000 },
];

const TOTAL_MODEL_SIZE = MODEL_FILES.reduce((sum, f) => sum + f.size, 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SherpaModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SherpaRecognizer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SherpaStream = any;

export interface SherpaEngine {
  recognizer: SherpaRecognizer;
  module: SherpaModule;
  createStream: () => SherpaStream;
}

/**
 * Fetch a file using the Cache API for persistent storage.
 * Returns the response from cache or network.
 */
async function fetchCached(url: string): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (response.ok) {
    await cache.put(url, response.clone());
  }
  return response;
}

/**
 * Load a script by URL, returning a promise that resolves when loaded.
 */
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Load the sherpa-onnx WASM engine. Downloads model files (~44MB) on first use,
 * caches them permanently via Cache API.
 *
 * @param onStatus - callback with status messages for UI
 * @param hotwords - optional hotwords string (one per line, format: "word :score")
 * @returns SherpaEngine with recognizer ready to use
 */
export async function loadSherpaEngine(
  onStatus: (msg: string) => void,
  hotwords?: string
): Promise<SherpaEngine> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;

  // If already loaded, return existing
  if (win._sherpaEngine) {
    onStatus("Sherpa-ONNX ready (cached)");
    return win._sherpaEngine;
  }

  // Step 1: Download model files to Cache API
  onStatus("Checking cached model files...");
  const modelData: { name: string; data: ArrayBuffer }[] = [];
  let downloaded = 0;

  for (const file of MODEL_FILES) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(file.url);
    if (cached) {
      onStatus(`${file.name} (cached)`);
      modelData.push({ name: file.name, data: await cached.arrayBuffer() });
      downloaded += file.size;
    } else {
      onStatus(`Downloading ${file.name} (${Math.round(file.size / 1_000_000)}MB)...`);
      const resp = await fetch(file.url);
      if (!resp.ok) throw new Error(`Failed to download ${file.name}: ${resp.status}`);
      const data = await resp.arrayBuffer();
      await cache.put(file.url, new Response(data.slice(0)));
      modelData.push({ name: file.name, data });
      downloaded += file.size;
      onStatus(`Downloaded ${Math.round((downloaded / TOTAL_MODEL_SIZE) * 100)}%`);
    }
  }

  // Step 2: Load the WASM JS API wrapper
  onStatus("Loading WASM runtime...");
  await loadScript(`${WASM_CDN}/sherpa-onnx-asr.js`);

  // Step 3: Load and initialize the Emscripten WASM module
  // We need to prevent it from loading the .data file (191MB).
  // Instead, we'll write model files to FS manually after init.
  return new Promise<SherpaEngine>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Sherpa-ONNX init timeout")), 60000);

    win.Module = {
      locateFile: (path: string) => {
        // Redirect .wasm file to CDN, block .data file
        if (path.endsWith(".wasm")) {
          return `${WASM_CDN}/${path}`;
        }
        if (path.endsWith(".data")) {
          // Return empty blob URL to prevent 191MB download
          return URL.createObjectURL(new Blob([]));
        }
        return path;
      },
      noInitialRun: true,
      onRuntimeInitialized: () => {
        clearTimeout(timeout);
        try {
          onStatus("Writing model files to WASM filesystem...");

          // Emscripten exposes FS in different ways depending on build config
          const FS = win.Module.FS || win.FS;
          if (!FS || !FS.writeFile) {
            // Fallback: try FS_createDataFile (older Emscripten API)
            if (win.Module.FS_createDataFile) {
              for (const { name, data } of modelData) {
                const uint8 = new Uint8Array(data);
                win.Module.FS_createDataFile("/", name, uint8, true, true);
              }
            } else {
              throw new Error(
                "Emscripten FS not available. The WASM module may require its .data file. " +
                "Available Module keys: " + Object.keys(win.Module).filter((k: string) => k.startsWith("FS") || k.startsWith("_")).slice(0, 20).join(", ")
              );
            }
          } else {
            // Write each model file to the Emscripten virtual filesystem
            for (const { name, data } of modelData) {
              const uint8 = new Uint8Array(data);
              FS.writeFile(`./${name}`, uint8);
            }
          }

          onStatus("Creating recognizer...");

          // Build config
          const config = {
            featConfig: { sampleRate: 16000, featureDim: 80 },
            modelConfig: {
              transducer: {
                encoder: "./encoder.onnx",
                decoder: "./decoder.onnx",
                joiner: "./joiner.onnx",
              },
              paraformer: { encoder: "", decoder: "" },
              zipformer2Ctc: { model: "" },
              nemoCtc: { model: "" },
              toneCtc: { model: "" },
              tokens: "./tokens.txt",
              numThreads: 1,
              provider: "cpu",
              debug: 0,
              modelType: "",
              modelingUnit: "",
              bpeVocab: "",
              tokensBuf: "",
              tokensBufSize: 0,
            },
            decodingMethod: hotwords ? "modified_beam_search" : "greedy_search",
            maxActivePaths: 4,
            enableEndpoint: 1,
            rule1MinTrailingSilence: 2.4,
            rule2MinTrailingSilence: 1.2,
            rule3MinUtteranceLength: 20,
            hotwordsFile: "",
            hotwordsScore: 2.0,
            hotwordsBuf: hotwords || "",
            hotwordsBufSize: hotwords ? hotwords.length : 0,
            ctcFstDecoderConfig: { graph: "", maxActive: 3000 },
            ruleFsts: "",
            ruleFars: "",
            blankPenalty: 0,
            hr: { lexicon: "", ruleFsts: "" },
          };

          // createOnlineRecognizer is defined in sherpa-onnx-asr.js (loaded globally)
          const recognizer = win.createOnlineRecognizer(win.Module, config);

          const engine: SherpaEngine = {
            recognizer,
            module: win.Module,
            createStream: () => recognizer.createStream(),
          };

          win._sherpaEngine = engine;
          onStatus("Sherpa-ONNX ready");
          resolve(engine);
        } catch (err) {
          reject(err);
        }
      },
      setStatus: (status: string) => {
        if (status) onStatus(status);
      },
    };

    // Load the Emscripten glue script (triggers WASM download + init)
    loadScript(`${WASM_CDN}/sherpa-onnx-wasm-main-asr.js`).catch(reject);
  });
}

/**
 * Downsample audio buffer from one sample rate to another.
 * Needed when AudioContext doesn't honor the requested 16kHz (e.g., iOS Safari gives 48kHz).
 */
export function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) return buffer;
  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Build a hotwords string from player roster and basketball terms.
 * Format: one keyword per line, with optional `:score` suffix.
 */
export function buildHotwords(teamA: string[], teamB: string[]): string {
  const lines: string[] = [];

  // Player names (high boost)
  for (const name of [...teamA, ...teamB]) {
    const first = name.split(/\s/)[0].toLowerCase();
    if (first.length > 1) lines.push(`${first} :3.0`);
  }

  // Basketball terms (medium boost)
  const terms = [
    "bucket", "layup", "dunk", "floater", "three", "deep",
    "downtown", "steal", "block", "assist", "undo", "cancel",
    "rebound", "score", "pointer",
  ];
  for (const term of terms) {
    lines.push(`${term} :2.0`);
  }

  return lines.join("\n");
}
