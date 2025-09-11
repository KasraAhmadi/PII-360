// Mock PII detection utility
// In a real application, this would connect to a backend service or ML model
// import { pipeline } from '@huggingface/transformers';
// // import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
// const classifier = await pipeline('token-classification', 'onnx-community/llama-ai4privacy-multilingual-categorical-anonymiser-openpii-ONNX');

export interface PIIItem {
  id: string;
  text: string;
  type: string;
  confidence: number;
  position: {
    start: number;
    end: number;
  };
}

const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  credit_card: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
  date: /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g,
};

const NAME_PATTERNS = [
  /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // FirstName LastName
  /\bMr\. [A-Z][a-z]+\b/g,
  /\bMrs\. [A-Z][a-z]+\b/g,
  /\bMs\. [A-Z][a-z]+\b/g,
  /\bDr\. [A-Z][a-z]+\b/g,
];

const ADDRESS_PATTERNS = [
  /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi,
  /\b[A-Z][a-z]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/g, // City, State ZIP
];

export function detectPIIInText(text: string): PIIItem[] {
  const results: PIIItem[] = [];
  let idCounter = 1;

  // Check for basic PII patterns
  Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        results.push({
          id: `pii-${idCounter++}`,
          text: match[0],
          type,
          confidence: getConfidenceScore(type, match[0]),
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
        });
      }
    }
  });

  // Check for names
  NAME_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        results.push({
          id: `pii-${idCounter++}`,
          text: match[0],
          type: 'name',
          confidence: getConfidenceScore('name', match[0]),
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
        });
      }
    }
  });

  // Check for addresses
  ADDRESS_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        results.push({
          id: `pii-${idCounter++}`,
          text: match[0],
          type: 'address',
          confidence: getConfidenceScore('address', match[0]),
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
        });
      }
    }
  });

  // Remove duplicates and sort by position
  const uniqueResults = results.filter((item, index, arr) => 
    arr.findIndex(other => 
      other.text === item.text && 
      other.type === item.type && 
      other.position.start === item.position.start
    ) === index
  );

  return uniqueResults.sort((a, b) => a.position.start - b.position.start);
}

function getConfidenceScore(type: string, text: string): number {
  // Simple confidence scoring based on pattern matching
  const baseConfidence: Record<string, number> = {
    email: 0.95,
    phone: 0.85,
    ssn: 0.98,
    credit_card: 0.90,
    name: 0.70,
    address: 0.75,
    date: 0.60,
  };

  let confidence = baseConfidence[type] || 0.5;

  // Adjust confidence based on text characteristics
  if (type === 'email' && text.includes('@')) {
    confidence = Math.min(0.98, confidence + 0.1);
  }
  
  if (type === 'phone' && (text.includes('(') || text.includes('-'))) {
    confidence = Math.min(0.95, confidence + 0.1);
  }

  if (type === 'name' && text.split(' ').length >= 2) {
    confidence = Math.min(0.85, confidence + 0.15);
  }

  return confidence;
}

export async function processFile(file: File): Promise<PIIItem[]> {
  // Mock file processing - in a real app, this would extract text from files
  // and then run PII detection on the extracted content
        const mockFileContent = `
        Dear John Smith,
        
        Thank you for contacting us. Your account information:
        Email: john.smith@email.com
        Phone: (555) 123-4567
        Address: 123 Main Street, Anytown, CA 90210
        SSN: 123-45-6789
        
        Best regards,
        Customer Service Team
      `;
      console.log(file)
      // const output = await classifier(mockFileContent);
      // console.log(output)
      const results = detectPIIInText(mockFileContent);
      return results;

}