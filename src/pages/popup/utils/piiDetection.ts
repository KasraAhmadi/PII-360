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


export function detectPiiWithRegexOptimized(text: string): PII[] {
    const piiResults: PII[] = [];
    let idCounter = 1;

    // A map to associate each PII category (capture group name) with its confidence level.
    const confidenceMap: { [key: string]: 'high' | 'medium' | 'low' } = {
        EMAIL_ADDRESS: 'high',
        SSN: 'high',
        CREDIT_CARD_NUMBER: 'high',
        IP_ADDRESS: 'high',
        PHONE_NUMBER: 'medium',
        US_PASSPORT_NUMBER: 'medium',
        US_STREET_ADDRESS: 'low',
        FULL_NAME: 'low',
    };
    
    const patterns = {
        EMAIL_ADDRESS: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}`,
        SSN: `(?!000|666|9\\d{2})([0-8]\\d{2}|7([0-6]\\d|7[012]))[- ]?\\d{2}[- ]?\\d{4}`,
        CREDIT_CARD_NUMBER: `(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{2})[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\\d{3})\\d{11})`,
        IP_ADDRESS: `(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)`,
        PHONE_NUMBER: `(?:\\+?1\\s*[-.\\s]?)?\\(?([2-9][0-8][0-9])\\)?[-.\\s]?([2-9][0-9]{2})[-.\\s]?([0-9]{4})`,
        US_PASSPORT_NUMBER: `[0-9]{9}`,
        US_STREET_ADDRESS: `\\d{1,5}\\s(?:[A-Z][a-z0-9]+\\s?)+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)`
        // FULL_NAME: `([A-Z][a-z'-]{1,30})\\s(?:([A-Z])\\.\\s)?([A-Z][a-z'-]{1,30})`,
    };

    // Combine all patterns into a single regex
    const combinedPattern = Object.entries(patterns)
        .map(([name, pattern]) => `(?<${name}>3\\b(?:${pattern})\\b)`)
        .join('|');
    
    const combinedRegex = new RegExp(combinedPattern, 'g');

    let match;
    while ((match = combinedRegex.exec(text)) !== null) {
        const groups = match.groups;
        if (groups) {
            for (const key in groups) {
                if (groups[key]) {
                    piiResults.push({
                        id: `regex-pii-${idCounter++}`,
                        word: groups[key].trim(),
                        category: key,
                        start: match.index,
                        end: match.index + groups[key].length,
                    });
                    // Once we find the match, we break the inner loop to avoid adding duplicates from the same match
                    break; 
                }
            }
        }
    }

    return piiResults;
}

