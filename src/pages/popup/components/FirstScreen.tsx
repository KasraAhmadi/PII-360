import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Upload, FileText } from 'lucide-react';

interface FirstScreenProps {
  onSubmit: (data: { text?: string; file?: File }) => void;
}

export function FirstScreen({ onSubmit }: FirstScreenProps) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setText(''); // Clear text when file is selected
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (value.trim()) {
      setSelectedFile(null); // Clear file when text is entered
    }
  };

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit({ text: text.trim() });
    } else if (selectedFile) {
      onSubmit({ file: selectedFile });
    }
  };

  const isSubmitDisabled = !text.trim() && !selectedFile;

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">PII 360</h1>
        <p className="text-muted-foreground">
          Enter text or upload a file to identify personally identifiable information
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="text-input">Enter Text</Label>
          <Textarea
            id="text-input"
            placeholder="Enter your text here to scan for PII..."
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="min-h-[120px] resize-none"
          />
        </div>

        <div className="flex items-center justify-center">
          <span className="text-muted-foreground text-sm">OR</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="file-upload">Upload File</Label>
          <div className="relative">
            <input
              id="file-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full h-auto p-4 border-dashed"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <div className="flex flex-col items-center space-y-2">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm">Click to upload</p>
                  <p className="text-xs text-muted-foreground">
                    PDF, JPG, PNG, TXT files
                  </p>
                </div>
              </div>
            </Button>
          </div>
          
          {selectedFile && (
            <div className="flex items-center space-x-2 p-2 bg-muted rounded-md">
              <FileText className="h-4 w-4" />
              <span className="text-sm truncate">{selectedFile.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
                className="ml-auto h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className="w-full"
        >
          Analyze for PII
        </Button>
      </div>
    </div>
  );
}