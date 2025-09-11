import { useState } from 'react';
import { FirstScreen } from './components/FirstScreen';
import { SecondScreen } from './components/SecondScreen';
import { detectPIIInText, processFile } from './utils/piiDetection';
import type { PIIItem } from './utils/piiDetection';
import { Loader2 } from 'lucide-react';

type Screen = 'first' | 'second' | 'loading';

export default function Popup() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('first');
  const [piiResults, setPiiResults] = useState<PIIItem[]>([]);
  const [originalText, setOriginalText] = useState<string>('');

  const handleSubmit = async (data: { text?: string; file?: File }) => {

    setCurrentScreen('loading');

    try {
      let results: PIIItem[] = [];

      if (data.text) {
        const message = {
          action: "classify",
          text: data.text
        }
        chrome.runtime.sendMessage(message)
          .then((response) => {
            console.log('received user data', response);
          })
          .catch((err) => {
            console.error('Error sending message:', err);
          });

        setOriginalText(data.text);
        results = detectPIIInText(data.text);
      } else if (data.file) {
        setOriginalText(`[File: ${data.file.name}]`);
        results = await processFile(data.file);
      }

      setPiiResults(results);
      setCurrentScreen('second');
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