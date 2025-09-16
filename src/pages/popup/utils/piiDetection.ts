// Mock PII detection utility
// In a real application, this would connect to a backend service or ML model
// import { pipeline } from '@huggingface/transformers';
// // import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
// const classifier = await pipeline('token-classification', 'onnx-community/llama-ai4privacy-multilingual-categorical-anonymiser-openpii-ONNX');


export interface PII {
  id: string;
  word: string;
  category: string;
}

export function post_process_PII(input_array: Array<any>): PII[] {
  console.log(input_array);
  let idCounter = 1;
  let expected_index = 0;
  let response: Array<PII> = [];
  let pr_token: string;
  let word = ""
  let pii_object: PII;
  input_array.forEach((object, index) => {
    const token_category = object["entity"].split("-")[1];
    if (index >= 1) {
      pr_token = input_array[index - 1]["entity"].split("-")[1];
    }
    const token_index = object["index"];
    if (expected_index == 0 || expected_index == token_index) {
      word += object["word"]
    } else {
      pii_object = {
        id: `pii-${idCounter++}`,
        word: word,
        category: pr_token
      };
      response.push(pii_object);
      word = "";
      word += object["word"]
    }
    expected_index = token_index + 1
    if (index === input_array.length - 1) {
      pii_object = {
        id: `pii-${idCounter++}`,
        word: word,
        category: token_category
      };
      response.push(pii_object);
    }
  });
  return response;
}





// export async function processFile(file: File): Promise<PIIItem[]> {
//   // Mock file processing - in a real app, this would extract text from files
//   // and then run PII detection on the extracted content
//   const mockFileContent = `
//         Dear John Smith,
        
//         Thank you for contacting us. Your account information:
//         Email: john.smith@email.com
//         Phone: (555) 123-4567
//         Address: 123 Main Street, Anytown, CA 90210
//         SSN: 123-45-6789
        
//         Best regards,
//         Customer Service Team
//       `;
//   console.log(file)
//   // const output = await classifier(mockFileContent);
//   // console.log(output)
//   const results = detectPIIInText(mockFileContent);
//   return results;

// }