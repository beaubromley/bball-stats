/**
 * Sherpa-ONNX WASM speech engine — full pre-built package.
 * Uses the larger model from the official HF Space (~191MB .data file, cached after first download).
 */

const WASM_CDN =
  "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SherpaModule = any;

export interface SherpaEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognizer: any;
  module: SherpaModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createStream: () => any;
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(s);
  });
}

/**
 * Load the sherpa-onnx WASM engine with the full pre-built model.
 * First download is ~191MB (cached by browser after).
 */
export async function loadSherpaEngine(
  onStatus: (msg: string) => void,
  hotwords?: string
): Promise<SherpaEngine> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (win._sherpaEngine) { onStatus("Sherpa-ONNX ready (cached)"); return win._sherpaEngine; }

  onStatus("Loading Sherpa-ONNX (~191MB first time, cached after)...");

  // Load the JS API wrapper first
  await loadScript(`${WASM_CDN}/sherpa-onnx-asr.js`);

  return new Promise<SherpaEngine>((resolve, reject) => {
    // 191MB download + WASM init can take a while — 5 min timeout
    const timeout = setTimeout(() => reject(new Error("Sherpa init timeout (5 min)")), 300000);

    win.Module = {
      locateFile: (path: string) => `${WASM_CDN}/${path}`,
      onRuntimeInitialized: () => {
        clearTimeout(timeout);
        try {
          onStatus("Model loaded, creating recognizer...");

          // Write hotwords file if provided
          let hotwordsPath = "";
          if (hotwords) {
            try {
              const FS = win.Module.FS || win.FS;
              if (FS && FS.writeFile) {
                FS.writeFile("./hotwords.txt", new TextEncoder().encode(hotwords));
                hotwordsPath = "./hotwords.txt";
                onStatus(`Hotwords: ${hotwords.split("\n").length} terms`);
              } else if (win.Module.FS_createDataFile) {
                const arr = Array.from(new TextEncoder().encode(hotwords));
                win.Module.FS_createDataFile("/", "hotwords.txt", arr, true, true);
                hotwordsPath = "./hotwords.txt";
              }
            } catch { /* hotwords optional */ }
          }

          const config = {
            featConfig: { sampleRate: 16000, featureDim: 80 },
            modelConfig: {
              transducer: { encoder: "./encoder.onnx", decoder: "./decoder.onnx", joiner: "./joiner.onnx" },
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
            decodingMethod: hotwordsPath ? "modified_beam_search" : "greedy_search",
            maxActivePaths: 4,
            enableEndpoint: 1,
            rule1MinTrailingSilence: 2.4,
            rule2MinTrailingSilence: 1.2,
            rule3MinUtteranceLength: 20,
            hotwordsFile: hotwordsPath,
            hotwordsScore: 2.0,
            hotwordsBuf: "",
            hotwordsBufSize: 0,
            ctcFstDecoderConfig: { graph: "", maxActive: 3000 },
            ruleFsts: "",
            ruleFars: "",
            blankPenalty: 0,
            hr: { lexicon: "", ruleFsts: "" },
          };

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
      setStatus: (status: string) => { if (status) onStatus(status); },
    };

    loadScript(`${WASM_CDN}/sherpa-onnx-wasm-main-asr.js`).catch(reject);
  });
}

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
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]; count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function buildHotwords(teamA: string[], teamB: string[]): string {
  const lines: string[] = [];
  for (const name of [...teamA, ...teamB]) {
    const first = name.split(/\s/)[0].toLowerCase();
    if (first.length > 1) lines.push(`${first} :3.0`);
  }
  for (const term of ["bucket", "layup", "dunk", "floater", "three", "deep", "downtown", "steal", "block", "assist", "undo", "cancel"]) {
    lines.push(`${term} :2.0`);
  }
  return lines.join("\n");
}
