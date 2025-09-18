
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

  static async getInstance(progress_callback) {
  const device = hasWebGPU() ? "webgpu" : "wasm";
  console.log(`Loading pipeline on device: ${device}`);
    return (this.pipelineFn ??= async (...args) => {
      this.pipelineInstance ??= pipeline(
        'token-classification',
        "iiiorg/piiranha-v1-detect-personal-information",
        //'onnx-community/piiranha-v1-detect-personal-information-ONNX',
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
       "iiiorg/piiranha-v1-detect-personal-information" 
      //'onnx-community/piiranha-v1-detect-personal-information-ONNX'
      );
    }

    const maxLength = 256;

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

    const classifier = await this.getInstance(progress_callback);
    console.log("PII model is loaded")

    let results = [];
    for (const chunk of textChunks) {
      const output = await classifier(chunk);
      console.log("classifier output:", JSON.stringify(output, null, 2));
      results = results.concat(output);
    }

    return results;
  }
}

class VLM {
  static instance = null;
  static processor = null;

  // Lazy-load singleton model
  static async getInstance(progress_callback) {
    if (!this.instance) {
      this.instance = await AutoModelForImageTextToText.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX",
        {
          dtype: {
            embed_tokens: "q4",
            vision_encoder: "q4",
            decoder_model_merged: "q4",
          },
          progress_callback,
          device: "webgpu",
        }
      );
    }
    return this.instance;
  }

  // Inference function (refactored from VLM_inference)
  static async infer(file, progress_callback) {
    // Load processor lazily
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX"
      );
    }

    const vlmModel = await this.getInstance(progress_callback);
    console.log("VLM model is loaded")

    const messages = [
      {
        role: "user",
        content: "<image>Describe this image in detail. Include all PII you find in response.",
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
  if (message.action == "text") {
    (async function () {
      // Perform classification
      const result = await PIIDetector.classifyText({ text: message.text });
      // Send response back to UI
      sendResponse(result);
    })();
  }
  else if (message.action == "image") {
    (async function () {
      const vlm_output = await VLM.infer(message.text);
      console.log("VLM Output:", vlm_output);
      const result = await PIIDetector.classifyText({ text: vlm_output[0]});
      sendResponse(result);
    })();

  }

  // Run model prediction asynchronously


  // return true to indicate we will send a response asynchronously
  // see https://stackoverflow.com/a/46628145 for more information
  return true;
});

