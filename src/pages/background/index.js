
async function benchmarkBackend() {

  try {
    const wasmTime = await benchmarkWasm();

    // Micro-benchmark for WebGPU (if available)
    const gpuTime = (navigator.gpu) ? await benchmarkWebGPU() : Infinity;
    const best = wasmTime < gpuTime ? "wasm" : "webgpu";
    console.log(wasmTime)
    console.log(gpuTime)
    // Cache result
    return best;
  } catch (err) {
    console.error("Benchmarking failed, defaulting to wasm:", err);
    return "wasm";
  }
}

async function benchmarkWasm() {
  const size = 1e7;
  const a = new Float32Array(size);
  const b = new Float32Array(size);
  const c = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    a[i] = Math.random();
    b[i] = Math.random();
  }

  const start = performance.now();
  for (let i = 0; i < size; i++) {
    c[i] = Math.sqrt(a[i] * a[i] + b[i] * b[i]);
  }
  return performance.now() - start;
}

async function benchmarkWebGPU() {
  if (!navigator.gpu) return Infinity;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return Infinity;

  const device = await adapter.requestDevice();

  const size = 1e7; // 1M elements for demo
  const bufferSize = size * 4; // Float32 = 4 bytes

  // Create GPU buffers
  let aBuffer = device.createBuffer({ size: bufferSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let bBuffer = device.createBuffer({ size: bufferSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let cBuffer = device.createBuffer({ size: bufferSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

  // Fill buffers with random data
  const aData = new Float32Array(size).map(() => Math.random());
  const bData = new Float32Array(size).map(() => Math.random());
  device.queue.writeBuffer(aBuffer, 0, aData);
  device.queue.writeBuffer(bBuffer, 0, bData);

  // Minimal compute shader
  const shaderCode = `
    @group(0) @binding(0) var<storage, read> a: array<f32>;
    @group(0) @binding(1) var<storage, read> b: array<f32>;
    @group(0) @binding(2) var<storage, write> c: array<f32>;

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i < arrayLength(&a)) {
        c[i] = sqrt(a[i] * a[i] + b[i] * b[i]);
      }
    }
  `;

  const module = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: aBuffer } },
      { binding: 1, resource: { buffer: bBuffer } },
      { binding: 2, resource: { buffer: cBuffer } },
    ],
  });

  // Run compute
  const start = performance.now();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(size / 64));
  pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const duration = performance.now() - start;
  // --- Cleanup ---
  aBuffer.destroy();
  bBuffer.destroy();
  cBuffer.destroy();
  // Nullify references to help GC
  // @ts-ignore
  aBuffer = null;
  // @ts-ignore
  bBuffer = null;
  // @ts-ignore
  cBuffer = null;
  return duration;
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
  TextStreamer, env, pipeline, AutoTokenizer,
  ConvBertModel
} from "@huggingface/transformers";

env.allowLocalModels = false;


class PIIDetector {
  static tokenizer = null;
  static pipelineInstance = null;
  static pipelineFn = null;
  static promiseChain = null;

  static async getInstance(device) {
    console.log(`Loading PII on device: ${device}`);
    return (this.pipelineFn ??= async (...args) => {
      this.pipelineInstance ??= pipeline(
        'token-classification',
        'onnx-community/piiranha-v1-detect-personal-information-ONNX',
        {
          device: device,
          dtype: "q4"
        },
      );

      return (this.promiseChain = (
        this.promiseChain ?? Promise.resolve()
      ).then(async () => (await this.pipelineInstance)(...args)));
    });
  }

  static async classifyText(message) {

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

    const classifier = await this.getInstance(message.backend);
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
  static async getInstance(device) {
    console.log(`Loading vlm on device: ${device}`);
    if (!this.instance) {
      this.instance = await AutoModelForImageTextToText.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX",
        {
          dtype: {
            embed_tokens: "fp16",
            vision_encoder: "q4",
            decoder_model_merged: "q4",
          },
          device: device
        }
      );
    }
    return this.instance;
  }

  // Inference function (refactored from VLM_inference)
  static async infer(file, device) {
    // Load processor lazily
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX"
      );
    }

    const vlmModel = await this.getInstance(device);
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

