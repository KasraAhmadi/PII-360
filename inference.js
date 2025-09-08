import { pipeline } from '@huggingface/transformers';

// import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const classifier = await pipeline('token-classification', 'onnx-community/llama-ai4privacy-multilingual-categorical-anonymiser-openpii-ONNX');

// const PdfData = {
//   pages: [],
//   documentInfo: "Document processing started"
// };

// const loadingTask = getDocument('./files/story.pdf');
// loadingTask.promise
//   .then(function (doc) {
//     const numPages = doc.numPages;

//     let lastPromise; // will be used to chain promises
//     lastPromise = doc.getMetadata().then(function (data) {});

//     const loadPage = function (pageNum) {
//               return doc.getPage(pageNum).then(function (page) {
//         const viewport = page.getViewport({ scale: 1.0 });
//         return page
//           .getTextContent()
//           .then(function (content) {
//             // Content contains lots of information about the text layout and
//             // styles, but we need only strings at the moment
//             const strings = content.items.map(function (item) {
//               return item.str;
//             });
//             let str_val = strings.join(" ")
//             // Release page resources.
//             PdfData.pages.push({
//                 pageNum: pageNum,
//                 text: str_val,
//                 processedAt: new Date().toISOString()
//             });
//             page.cleanup();
//           })
//           .then(function () {
//             console.log();
//           });
//       });
//     };
//     // Loading of the first page will wait on metadata and subsequent loadings
//     // will wait on the previous pages.
//     for (let i = 1; i <= numPages; i++) {
//       lastPromise = lastPromise.then(loadPage.bind(null, i));
//     }
//     return lastPromise;
//   })
//   .then(
//     async function () {
//         const output = await classifier(PdfData["pages"][0]["text"]);
//         console.log(PdfData["pages"][0]["text"])
//         console.log(output);
//         console.log("# End of Document");
//     },
//     function (err) {
//       console.error("Error: " + err);
//     }
//   );

import {
  AutoProcessor,
  AutoModelForImageTextToText,
  load_image,
  TextStreamer,
} from "@huggingface/transformers";

// Load processor and model
const model_id = "onnx-community/FastVLM-0.5B-ONNX";
const processor = await AutoProcessor.from_pretrained(model_id);
const model = await AutoModelForImageTextToText.from_pretrained(model_id, {
  dtype: {
    embed_tokens: "fp16",
    vision_encoder: "q4",
    decoder_model_merged: "q4",
  },
});

// Prepare prompt
const messages = [
  {
    role: "user",
    content: "<image>Describe this image in detail.",
  },
];
const prompt = processor.apply_chat_template(messages, {
  add_generation_prompt: true,
});

// Prepare inputs
const url = "./files/empire_state.jpg";
const image = await load_image(url);
const inputs = await processor(image, prompt, {
  add_special_tokens: false,
});

// Generate output
const outputs = await model.generate({
  ...inputs,
  max_new_tokens: 512,
  do_sample: false,
  streamer: new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: (text) => { /* Do something with the streamed output */ },
  }),
});

// Decode output
const decoded = processor.batch_decode(
  outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
  { skip_special_tokens: true },
);
console.log(decoded[0]);
const output = await classifier(decoded[0]);
console.log(output)
s