import { useState, useEffect } from 'react';
import { FirstScreen } from './components/FirstScreen';
import { SecondScreen } from './components/SecondScreen';
import { post_process_PII, detectPiiWithRegexOptimized as detectPiiWithRegex } from './utils/piiDetection';
import type { PII } from './utils/piiDetection';
import { Loader2 } from 'lucide-react';
import { getDocument, PDFDocumentProxy, PDFPageProxy, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { highlightPIIInPdf } from './utils/pdfUtils';

// Configure worker
GlobalWorkerOptions.workerSrc = pdfWorker;

type Screen = 'first' | 'second' | 'loading';

export interface PdfPage {
  pageNum: number;
  text: string;
  processedAt: string;
  items: any[];
}

export interface PdfData {
  pages: PdfPage[];
  documentInfo: string;
  text: string;
  items: any[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file); // encodes as base64
  });
}
export async function processPdf(file: File): Promise<PdfData> {
  const pdfData: PdfData = {
    pages: [],
    documentInfo: "Document processing started",
    text: "",
    items: [],
  };

  try {
    // Convert File → ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // Load PDF
    const loadingTask = getDocument({ data: arrayBuffer });
    const doc: PDFDocumentProxy = await loadingTask.promise;

    await doc.getMetadata().catch(() => { }); // optional metadata

    const allItems: any[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page: PDFPageProxy = await doc.getPage(i);
      const content = await page.getTextContent();

      const strings = content.items.map((item: any) => item.str);
      const str_val = strings.join(" ");

      pdfData.pages.push({
        pageNum: i,
        text: str_val,
        processedAt: new Date().toISOString(),
        items: content.items,
      });

      // Add page index to each item for highlighting
      const itemsWithPageIndex = content.items.map((item: any) => ({
        ...item,
        pageIndex: i - 1  // PDF pages are 0-indexed in pdf-lib
      }));
      allItems.push(...itemsWithPageIndex);

      page.cleanup();
    }

    pdfData.documentInfo = `Processed ${doc.numPages} pages`;
    pdfData.text = pdfData.pages.map(page => page.text).join("\n\n");
    pdfData.items = allItems;

    return pdfData;
  } catch (err) {
    console.error("Error while processing PDF:", err);
    throw err;
  }
}

export default function Popup() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('first');
  const [piiResults, setPiiResults] = useState<PII[]>([]);
  const [originalText, setOriginalText] = useState<string>('');
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [highlightedPdf, setHighlightedPdf] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [imageSupported, setImageSupported] = useState<boolean>(true); // <-- NEW


  useEffect(() => {
    const backend = localStorage.getItem("bestBackend");
    if (backend) {
      console.log("Previously selected backend:", backend);
      if (backend === "wasm") {
        console.log("wasm");
      } else if (backend === "webgpu") {
        console.log("webgpu");
      }
    } else {
      console.log("No cached backend found, running benchmark...");
      chrome.runtime.sendMessage(
        { action: "pageLoaded" },
        (response) => {
          console.log("Background responded to page load:", response);
          localStorage.setItem("bestBackend", response);
          if (response === "wasm") {
            setImageSupported(false);
          }
        }
      );
    }

  }, []);

  const handleSubmit = async (data: { text?: string; file?: File }) => {

    setCurrentScreen('loading');

    try {
      let results: PII[] = [];

      if (data.text) {
        const message = {
          action: "text",
          text: data.text,
          backend: localStorage.getItem("bestBackend")
        }
        chrome.runtime.sendMessage(message)
          .then(async (response: Array<any>) => {
            results = await post_process_PII(response, data.text);
            setPiiResults(results);
            setCurrentScreen('second');
          })
          .catch((err) => {
            console.error('Error sending message:', err);
          });

        setOriginalText(data.text);
      }

      else if (data.file) {
        setFileName(data.file.name);
        if (data.file.type == "application/pdf") {
          const pdfData = await processPdf(data.file);
          setPdfData(pdfData);
          const message = {
            action: "text",
            text: pdfData.text,
            backend: localStorage.getItem("bestBackend")
          }
          console.log("Sending message to background script");
          chrome.runtime.sendMessage(message)
            .then(async (response: Array<any>) => {
              console.log("Received response from background script");
              const modelPiiResults = await post_process_PII(response, pdfData.text);
              const regexPiiResults = detectPiiWithRegex(pdfData.text);
              results = [...modelPiiResults, ...regexPiiResults];
              setPiiResults(results);
              if (data.file) {
                const highlighted = await highlightPIIInPdf(data.file, results, pdfData);
                setHighlightedPdf(highlighted);
              }
              console.log("Setting screen to second");
              setCurrentScreen('second');
            })
            .catch((err) => {
              console.error('Error sending message:', err);
            });
        } else if (data.file.type == "image/jpeg") {
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
    setPdfData(null);
    setHighlightedPdf(null);
    setFileName(undefined);
  };

  if (currentScreen === 'loading') {
    return (
      <div className="size-full flex flex-col items-center justify-center">
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
    <div className="size-full bg-background flex flex-col">
      <div className="flex-grow">
        {currentScreen === 'first' && (
          <div className="size-full flex flex-col items-center justify-center space-y-2">
            {!imageSupported && (
              <p className="text-red-600 text-sm font-medium">
                WebGPU is not efficient on your device. Image PII detection is not supported.
              </p>
            )}
            <FirstScreen onSubmit={handleSubmit} imageSupported={imageSupported} />
          </div>
        )}

        {currentScreen === 'second' && (
          <div className="size-full flex items-center justify-center">
            <SecondScreen
              piiItems={piiResults}
              onBack={handleBack}
              originalText={originalText}
              highlightedPdf={highlightedPdf}
              fileName={fileName}
            />
          </div>
        )}
      </div>

      {/* Footer Section */}
      <footer className="w-full border-t border-gray-200 p-1 text-[8px] text-center text-gray-500">
        <p>
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/kasra-ahmadii/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Kasra Ahmadi
          </a>{" "}
          &{" "}
          <a
            href="https://www.linkedin.com/in/georgi-varbanov-22505a369/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Georgi Varbanov
          </a>
        </p>
        <p>
          <a
            href="https://github.com/KasraAhmadi/PII-360"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            View Project on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
