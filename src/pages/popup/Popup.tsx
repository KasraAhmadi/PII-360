import { useState } from 'react';
import { FirstScreen } from './components/FirstScreen';
import { SecondScreen } from './components/SecondScreen';
import { post_process_PII } from './utils/piiDetection';
import type { PII } from './utils/piiDetection';
import { Loader2 } from 'lucide-react';
import { getDocument, PDFDocumentProxy, PDFPageProxy, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

// Configure worker
GlobalWorkerOptions.workerSrc = pdfWorker;

type Screen = 'first' | 'second' | 'loading';

export interface PdfPage {
  pageNum: number;
  text: string;
  processedAt: string;
}

export interface PdfData {
  pages: PdfPage[];
  documentInfo: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file); // encodes as base64
  });
}
export async function processPdf(file: File): Promise<string> {
  const PdfData: PdfData = {
    pages: [],
    documentInfo: "Document processing started",
  };

  try {
    // Convert File → ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // Load PDF
    const loadingTask = getDocument({ data: arrayBuffer });
    const doc: PDFDocumentProxy = await loadingTask.promise;

    await doc.getMetadata().catch(() => { }); // optional metadata

    for (let i = 1; i <= doc.numPages; i++) {
      const page: PDFPageProxy = await doc.getPage(i);
      const content = await page.getTextContent();

      const strings = content.items.map((item: any) => item.str);
      const str_val = strings.join(" ");

      PdfData.pages.push({
        pageNum: i,
        text: str_val,
        processedAt: new Date().toISOString(),
      });

      page.cleanup();
    }

    PdfData.documentInfo = `Processed ${doc.numPages} pages`;
    const allText: string = PdfData.pages.map(page => page.text).join("\n\n");

    return allText;
  } catch (err) {
    console.error("Error while processing PDF:", err);
    throw err;
  }
}

export default function Popup() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('first');
  const [piiResults, setPiiResults] = useState<PII[]>([]);
  const [originalText, setOriginalText] = useState<string>('');

  const handleSubmit = async (data: { text?: string; file?: File }) => {

    setCurrentScreen('loading');

    try {
      let results: PII[] = [];

      if (data.text) {
        const message = {
          action: "text",
          text: data.text
        }
        chrome.runtime.sendMessage(message)
          .then(async (response: Array<any>) => {
            results = await post_process_PII(response);
            setPiiResults(results);
            setCurrentScreen('second');
          })
          .catch((err) => {
            console.error('Error sending message:', err);
          });

        setOriginalText(data.text);
      }

      else if (data.file) {
        if (data.file.type == "application/pdf") {
          const pdfData = await processPdf(data.file);
          const message = {
            action: "text",
            text: pdfData
          }
          chrome.runtime.sendMessage(message)
            .then(async (response: Array<any>) => {
              results = await post_process_PII(response);
              setPiiResults(results);
              setCurrentScreen('second');
            })
            .catch((err) => {
              console.error('Error sending message:', err);
            });
        } else if(data.file.type == "image/jpeg"){
          const base64 = await fileToBase64(data.file);

          const message = {
            action: "image",
            text: base64
          }
          chrome.runtime.sendMessage(message)
            .then(async (response: Array<any>) => {
              results = await post_process_PII(response);
              setPiiResults(results);
              setCurrentScreen('second');
            })
            .catch((err) => {
              console.error('Error sending message:', err);
            });
        }
      }
    } catch (error) {
      console.error('Error processing data:', error);
      setCurrentScreen('first');
    }
  };

  const handleBack = () => {
    setCurrentScreen('first');
    setPiiResults([]);
    setOriginalText('');
  };

  if (currentScreen === 'loading') {
    return (
      <div className="size-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <div>
            <h2 className="text-lg font-semibold">Analyzing for PII...</h2>
            <p className="text-muted-foreground">This may take a few moments</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full bg-background">
      {currentScreen === 'first' && (
        <div className="size-full flex items-center justify-center">
          <FirstScreen onSubmit={handleSubmit} />
        </div>
      )}

      {currentScreen === 'second' && (
        <div className="size-full flex items-center justify-center">
          <SecondScreen
            piiItems={piiResults}
            onBack={handleBack}
            originalText={originalText}
          />
        </div>
      )}
    </div>
  );
}