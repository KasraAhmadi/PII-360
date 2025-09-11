// console.log('background script loaded');
// import { pipeline } from '@huggingface/transformers';
// // import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
// const classifier = await pipeline('token-classification', 'onnx-community/llama-ai4privacy-multilingual-categorical-anonymiser-openpii-ONNX');

// const mockFileContent = `
// Dear John Smith,

// Thank you for contacting us. Your account information:
// Email: john.smith@email.com
// Phone: (555) 123-4567
// Address: 123 Main Street, Anytown, CA 90210
// SSN: 123-45-6789

// Best regards,
// Customer Service Team`;
// const output = await classifier(mockFileContent);
// // console.log(output)

// background.js - Handles requests from the UI, runs the model, then sends back a response
console.log("Kasra")

import { env, pipeline } from "@huggingface/transformers";
// If you'd like to use a local model instead of loading the model
// from the Hugging Face Hub, you can remove this line.
env.allowLocalModels = false;

/**
 * Wrap the pipeline construction in a Singleton class to ensure:
 * (1) the pipeline is only loaded once, and
 * (2) the pipeline can be loaded lazily (only when needed).
 */
class Singleton {
  static async getInstance(progress_callback) {
    // Return a function which does the following:
    // - Load the pipeline if it hasn't been loaded yet
    // - Run the pipeline, waiting for previous executions to finish if needed
    return (this.fn ??= async (...args) => {
      this.instance ??= pipeline(
        'token-classification', 
        'onnx-community/llama-ai4privacy-multilingual-categorical-anonymiser-openpii-ONNX',
        {
          progress_callback,
          device: "webgpu",
          dtype: "q4",
        },
      );

      return (this.promise_chain = (
        this.promise_chain ?? Promise.resolve()
      ).then(async () => (await this.instance)(...args)));
    });
  }
}

// Create generic classify function, which will be reused for the different types of events.
const classify = async (text) => {
  // Get the pipeline instance. This will load and build the model when run for the first time.
  const classifier = await Singleton.getInstance((data) => {
    console.log(data)
    // You can track the progress of the pipeline creation here.
    // e.g., you can send `data` back to the UI to indicate a progress bar
    // console.log(data)
  });

  // Run the model on the input text
  const result = await classifier(text);
  return result;
};

////////////////////// 2. Message Events /////////////////////
//
// Listen for messages from the UI, process it, and send the result back.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "classify") return; // Ignore messages that are not meant for classification.

  // Run model prediction asynchronously
  (async function () {
    // Perform classification
    const result = await classify(message.text);

    // Send response back to UI
    sendResponse(result);
  })();

  // return true to indicate we will send a response asynchronously
  // see https://stackoverflow.com/a/46628145 for more information
  return true;
});


