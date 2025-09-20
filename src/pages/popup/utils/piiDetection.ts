export interface PII {
  id: string;
  word: string;
  category: string;
  start: number;
  end: number;
}

export function post_process_PII(input_array: Array<any>, originalText?: string): PII[] {
  console.log(input_array);
  let idCounter = 1;
  let response: Array<PII> = [];
  let current_word = "";
  let current_category = "";
  let current_start = -1;

  let characterPosition = 0;
  const tokenPositions: Array<{start: number, end: number}> = [];
  
  if (originalText) {
    for (const token of input_array) {
      const word = token.word;
      const startPos = originalText.indexOf(word, characterPosition);
      if (startPos !== -1) {
        tokenPositions.push({
          start: startPos,
          end: startPos + word.length
        });
        characterPosition = startPos + word.length;
      } else {
        tokenPositions.push({
          start: characterPosition,
          end: characterPosition + word.length
        });
        characterPosition += word.length;
      }
    }
  } else {
    for (const token of input_array) {
      const word = token.word;
      tokenPositions.push({
        start: characterPosition,
        end: characterPosition + word.length
      });
      characterPosition += word.length;
    }
  }

  input_array.forEach((object, index) => {
    const token_category = object["entity"].split("-")[1];
    const word = object["word"];
    const start = tokenPositions[index]?.start ?? 0;
    const end = tokenPositions[index]?.end ?? word.length;

    const previousEnd = index > 0 ? tokenPositions[index - 1]?.end ?? 0 : 0;
    const isConsecutive = Math.abs(start - previousEnd) <= 5; 

    if ((current_category !== token_category || !isConsecutive) && current_word !== "") {
      response.push({
        id: `pii-${idCounter++}`,
        word: current_word.trim(),
        category: current_category,
        start: current_start,
        end: tokenPositions[index - 1]?.end ?? current_start + current_word.length,
      });
      current_word = "";
      current_category = "";
      current_start = -1;
    }

    if (current_word === "") {
      current_start = start;
      current_category = token_category;
    }

    current_word += word;

    if (index === input_array.length - 1 && current_word !== "") {
      response.push({
        id: `pii-${idCounter++}`,
        word: current_word.trim(),
        category: token_category,
        start: current_start,
        end: end,
      });
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
