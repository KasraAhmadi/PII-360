// import { pipeline } from '@huggingface/transformers';
const ranha_model = "onnx-community/piiranha-v1-detect-personal-information-ONNX"
const ai4privacy = "onnx-community/llama-ai4privacy-multilingual-categorical-anonymiser-openpii-ONNX"
// const classifier = await pipeline('token-classification', ranha_model, {
//     device: "cpu",
//     dtype: "q4"
// },);
import { pipeline, AutoTokenizer } from '@huggingface/transformers';

async function run(text) {
    // Load pipeline and tokenizer
    const classifier = await pipeline('token-classification', ranha_model, {
        device: "cpu",
        dtype: "q4"
    },); const tokenizer = await AutoTokenizer.from_pretrained(ai4privacy);

    const maxLength = 256; // your context length

    // Tokenize
    const encoding = await tokenizer(text, { add_special_tokens: true });
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
        const output = await classifier(chunk);
        res = res.concat(output);
    }
    return res
}




class PII {
    constructor(word, category) {
        this.word = word;
        this.category = category;
    }
}

async function post_processing(input_array) {
    let expected_index = 0;
    let response = []
    let pr_token = null;
    let word = ""
    let pii_object;
    input_array.forEach((object, index) => {
        const token_category = object["entity"].split("-")[1];
        if (index >= 1) {
            pr_token = input_array[index - 1]["entity"].split("-")[1];
        }
        const token_index = object["index"];
        if (expected_index == 0 || expected_index == token_index) {
            word += object["word"]
        } else {
            pii_object = new PII(word, pr_token);
            response.push(pii_object);
            word = "";
            word += object["word"]
        }
        expected_index = token_index + 1
        if (index === input_array.length - 1) {
            pii_object = new PII(word, token_category);
            response.push(pii_object);
        }
    });
    return response;
}
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PdfData = {
    pages: [],
    documentInfo: "Document processing started"
};

const loadingTask = getDocument('./files/story.pdf');
loadingTask.promise
    .then(function (doc) {
        const numPages = doc.numPages;

        let lastPromise; // will be used to chain promises
        lastPromise = doc.getMetadata().then(function (data) { });

        const loadPage = function (pageNum) {
            return doc.getPage(pageNum).then(function (page) {
                const viewport = page.getViewport({ scale: 1.0 });
                return page
                    .getTextContent()
                    .then(function (content) {
                        // Content contains lots of information about the text layout and
                        // styles, but we need only strings at the moment
                        const strings = content.items.map(function (item) {
                            return item.str;
                        });
                        let str_val = strings.join(" ")
                        // Release page resources.
                        PdfData.pages.push({
                            pageNum: pageNum,
                            text: str_val,
                            processedAt: new Date().toISOString()
                        });
                        page.cleanup();
                    })
                    .then(function () {
                    });
            });
        };
        // Loading of the first page will wait on metadata and subsequent loadings
        // will wait on the previous pages.
        for (let i = 1; i <= numPages; i++) {
            lastPromise = lastPromise.then(loadPage.bind(null, i));
        }
        return lastPromise;
    })
    .then(
        async function () {
            const allText = PdfData.pages.map(page => page.text).join("\n\n");
            const output = await run(allText)
            console.log(output);
            console.log("# End of Document");
        },
        function (err) {
            console.error("Error: " + err);
        }
    );

// import {
//   AutoProcessor,
//   AutoModelForImageTextToText,
//   load_image,
//   TextStreamer,
// } from "@huggingface/transformers";

// // Load processor and model
// const model_id = "onnx-community/FastVLM-0.5B-ONNX";
// const processor = await AutoProcessor.from_pretrained(model_id);
// const model = await AutoModelForImageTextToText.from_pretrained(model_id, {
//   dtype: {
//     embed_tokens: "fp16",
//     vision_encoder: "q4",
//     decoder_model_merged: "q4",
//   },
// });

// // Prepare prompt
// const messages = [
//   {
//     role: "user",
//     content: "<image>Describe this image in detail.",
//   },
// ];
// const prompt = processor.apply_chat_template(messages, {
//   add_generation_prompt: true,
// });

// // Prepare inputs
// const url = "./files/empire_state.jpg";
// const image = await load_image(url);
// const inputs = await processor(image, prompt, {
//   add_special_tokens: false,
// });

// // Generate output
// const outputs = await model.generate({
//   ...inputs,
//   max_new_tokens: 512,
//   do_sample: false,
//   streamer: new TextStreamer(processor.tokenizer, {
//     skip_prompt: true,
//     skip_special_tokens: false,
//     callback_function: (text) => { /* Do something with the streamed output */ },
//   }),
// });

// // Decode output
// const decoded = processor.batch_decode(
//   outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
//   { skip_special_tokens: true },
// );
// console.log(decoded[0]);
// const output = await classifier("My email is kasra.research@gmail.com  and the city I live is london and my other email is ahmadi1@usf.edu hellooo");
// console.log(output);
// const res = await post_processing(output);
// console.log(res) 