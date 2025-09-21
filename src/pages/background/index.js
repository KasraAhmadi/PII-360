async function benchmarkBackend() {

  try {
    const wasmTime = await benchmarkWasm();

    // Micro-benchmark for WebGPU (if available)
    const gpuTime = (navigator.gpu) ? await benchmarkWebGPU() : Infinity;
    const best = wasmTime < gpuTime ? "wasm" : "webgpu";

    // Cache result
    return best;
  } catch (err) {
    console.error("Benchmarking failed, defaulting to wasm:", err);
    return "wasm";
  }
}

async function benchmarkWasm() {
  const start = performance.now();
  // Example: heavy math loop
  let x = 0;
  for (let i = 0; i < 1e7; i++) {
    x += Math.sqrt(i);
  }
  return performance.now() - start;
}

async function benchmarkWebGPU() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return Infinity;
  const device = await adapter.requestDevice();

  const start = performance.now();

  // Fake workload: just submit a no-op command buffer N times
  for (let i = 0; i < 1000; i++) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  await device.queue.onSubmittedWorkDone();
  return performance.now() - start;
}
// console.log("Hoorayyy")
// if (typeof window !== "undefined" && typeof localStorage !== "undefined") {

// }



function hasWebGPU() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
function base64ToBlob(base64, contentType = "image/png") {
  const byteChars = atob(base64.split(",")[1]);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}
// background.js - Handles requests from the UI, runs the model, then sends back a response
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "src/pages/popup/index.html" });
});

import {
  AutoProcessor,
  AutoModelForImageTextToText,
  load_image,
  TextStreamer, env, pipeline, AutoTokenizer
} from "@huggingface/transformers";

env.allowLocalModels = false;


class PIIDetector {
  static tokenizer = null;
  static pipelineInstance = null;
  static pipelineFn = null;
  static promiseChain = null;

  static async getInstance(device, progress_callback) {
    console.log(`Loading pipeline on device: ${device}`);
    return (this.pipelineFn ??= async (...args) => {
      this.pipelineInstance ??= pipeline(
        'token-classification',
        'onnx-community/piiranha-v1-detect-personal-information-ONNX',
        {
          progress_callback,
          device: device,
          dtype: "q4"
        },
      );

      return (this.promiseChain = (
        this.promiseChain ?? Promise.resolve()
      ).then(async () => (await this.pipelineInstance)(...args)));
    });
  }

  static async classifyText(message, progress_callback) {

    // Load tokenizer lazily
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(
        'onnx-community/piiranha-v1-detect-personal-information-ONNX'
      );
    }

    const maxLength = 128;

    // Tokenize input text
    const encoding = await this.tokenizer(message.text, { add_special_tokens: true });

    const inputIdsArray = Array.from(encoding.input_ids.ort_tensor.cpuData);

    // Chunk input IDs
    const tokenChunks = [];
    for (let i = 0; i < inputIdsArray.length; i += maxLength) {
      tokenChunks.push(inputIdsArray.slice(i, i + maxLength));
    }

    // Decode chunks back to text
    const textChunks = await Promise.all(
      tokenChunks.map(ids =>
        this.tokenizer.decode(ids, { skip_special_tokens: true })
      )
    );

    const classifier = await this.getInstance(message.backend, progress_callback);
    console.log("PII model is loaded")

    let results = [];
    for (const chunk of textChunks) {
      const output = await classifier(chunk);
      // console.log("classifier output:", JSON.stringify(output, null, 2));
      results = results.concat(output);
    }

    return results;
  }
}

class VLM {
  static instance = null;
  static processor = null;

  // Lazy-load singleton model
  static async getInstance(device, progress_callback) {
    if (!this.instance) {
      this.instance = await AutoModelForImageTextToText.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX",
        {
          dtype: {
            embed_tokens: "fp16",
            vision_encoder: "q4",
            decoder_model_merged: "q4",
          },
          progress_callback,
          device: device,
        }
      );
    }
    return this.instance;
  }

  // Inference function (refactored from VLM_inference)
  static async infer(file, device, progress_callback) {
    // Load processor lazily
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX"
      );
    }

    const vlmModel = await this.getInstance(device, progress_callback);
    console.log("VLM model is loaded")

    const messages = [
      {
        role: "user",
        content: "<image>You are a helpful visual AI assistant. Include all PII you find in response. Include cities, location, BOD, Names, and numbers.",
      },
    ];

    const prompt = this.processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });

    // Convert base64 to Blob
    const blob = base64ToBlob(file);
    const image = await load_image(blob);

    // Prepare inputs for model
    const inputs = await this.processor(image, prompt, {
      add_special_tokens: false,
    });

    // Run inference with streaming
    const outputs = await vlmModel.generate({
      ...inputs,
      max_new_tokens: 512,
      do_sample: false,
      streamer: new TextStreamer(this.processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
      }),
    });

    // Decode outputs
    const decoded = this.processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true }
    );
    return decoded;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action == "pageLoaded") {
    (async function () {
      benchmarkBackend().then(result => {
        sendResponse(result);
      });
    })();


  }

  if (message.action == "text") {
    (async function () {
      // Perform classification
      const result = await PIIDetector.classifyText({ text: message.text, backend: message.backend });
      // Send response back to UI
      sendResponse(result);
    })();
  }
  else if (message.action == "image") {
    (async function () {
      const vlm_output = await VLM.infer(message.text, message.backend);
      // console.log("VLM Output:", vlm_output);
      const result = await PIIDetector.classifyText({ text: vlm_output[0], backend: message.backend });
      sendResponse(result);
    })();

  }

  // Run model prediction asynchronously


  // return true to indicate we will send a response asynchronously
  // see https://stackoverflow.com/a/46628145 for more information
  return true;
});

