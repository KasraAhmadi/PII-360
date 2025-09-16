
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
const device = hasWebGPU() ? "webgpu" : "wasm";
console.log(`Loading pipeline on device: ${device}`);

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

// If you'd like to use a local model instead of loading the model
// from the Hugging Face Hub, you can remove this line.
env.allowLocalModels = false;

/**
 * Wrap the pipeline construction in a Singleton class to ensure:
 * (1) the pipeline is only loaded once, and
 * (2) the pipeline can be loaded lazily (only when needed).
 */

class VLM {
  static instance = null;

  // Lazy-load singleton
  static async getInstance(progress_callback) {
    if (!this.instance) {
      this.instance = AutoModelForImageTextToText.from_pretrained(
        "onnx-community/FastVLM-0.5B-ONNX",
        {
          dtype: {
            embed_tokens: "fp16",
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
}

class Singleton {
  static async getInstance(progress_callback) {
    // Return a function which does the following:
    // - Load the pipeline if it hasn't been loaded yet
    // - Run the pipeline, waiting for previous executions to finish if needed
    return (this.fn ??= async (...args) => {
      this.instance ??= pipeline(
        'token-classification',
        'onnx-community/piiranha-v1-detect-personal-information-ONNX',
        {
          progress_callback,
          device: "webgpu",
          dtype: "q4"
        },
      );

      return (this.promise_chain = (
        this.promise_chain ?? Promise.resolve()
      ).then(async () => (await this.instance)(...args)));
    });
  }
}

// Create generic classify function, which will be reused for the different types of events.
const VLM_inference = async (file) => {
  // Get the pipeline instance. This will load and build the model when run for the first time.
  const processor = await AutoProcessor.from_pretrained("onnx-community/FastVLM-0.5B-ONNX");
  const vlmModel = await VLM.getInstance((p) => console.log("Loading:", p));
  console.log("1")
  const messages = [
    {
      role: "user",
      content: "<image>Describe this image in detail.",
    },
  ];
  const prompt = processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  });
  console.log("2")

  // Prepare inputs
  const blob = base64ToBlob(file);
  console.log("3")

  const image = await load_image(blob);
  console.log("4")

  const inputs = await processor(image, prompt, {
    add_special_tokens: false,
  });
    console.log("5")


  // Generate output
  const outputs = await vlmModel.generate({
    ...inputs,
    max_new_tokens: 512,
    do_sample: false,
    streamer: new TextStreamer(processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (text) => {
        console.log(text) /* Do something with the streamed output */ },
    }),
  });

    console.log("6")


  // Decode output
  const decoded = processor.batch_decode(
    outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
    { skip_special_tokens: true },
  );

  console.log(decoded)


  return decoded;
};

// Create generic classify function, which will be reused for the different types of events.
const classify = async (text) => {
  // Get the pipeline instance. This will load and build the model when run for the first time.
  const classifier = await Singleton.getInstance((data) => {
    console.log(data)
  });

  // Run the model on the input text
  const result = await classifier(text);
  return result;
};

////////////////////// 2. Message Events /////////////////////
//
// Listen for messages from the UI, process it, and send the result back.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action == "classify") {
    (async function () {
      // Perform classification

      const tokenizer = await AutoTokenizer.from_pretrained('onnx-community/piiranha-v1-detect-personal-information-ONNX');

      const maxLength = 256; // your context length

      // Tokenize
      const encoding = await tokenizer(message.text, { add_special_tokens: true });
      // Check where input_ids actually is
      // Access the actual token IDs array from the Tensor
      const inputIdsArray = Array.from(encoding.input_ids.ort_tensor.cpuData); // .data gives the BigInt64Array
      // Split into chunks
      const tokenChunks = [];
      for (let i = 0; i < inputIdsArray.length; i += maxLength) {
        tokenChunks.push(inputIdsArray.slice(i, i + maxLength));
      }
      // Decode back to text
      const textChunks = await Promise.all(
        tokenChunks.map(ids => tokenizer.decode(ids, { skip_special_tokens: true }))
      );
      //   const textChunks = tokenChunks.map(ids => tokenizer.decode(ids, { skip_special_tokens: true }));
      let res = []
      // Run inference on each chunk
      for (const chunk of textChunks) {
        const output = await classify(chunk);
        res = res.concat(output);
      }
      // Send response back to UI
      sendResponse(res);
    })();
  }
  else if (message.action == "image") {
    (async function () {
        const output = await VLM_inference(message.text)
      // Send response back to UI
      sendResponse(output);
    })();

  }

  // Run model prediction asynchronously


  // return true to indicate we will send a response asynchronously
  // see https://stackoverflow.com/a/46628145 for more information
  return true;
});

