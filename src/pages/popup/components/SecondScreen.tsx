import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { ArrowLeft, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';


 interface PIIItem {
  id: string;
  word: string;
  category: string;
}


interface SecondScreenProps {
  piiItems: PIIItem[];
  onBack: () => void;
  originalText?: string;
}

const getPIITypeColor = (type: string) => {
  const colors: Record<string, string> = {
    'email': 'bg-blue-100 text-blue-800 border-blue-200',
    'phone': 'bg-green-100 text-green-800 border-green-200',
    'ssn': 'bg-red-100 text-red-800 border-red-200',
    'credit_card': 'bg-purple-100 text-purple-800 border-purple-200',
    'name': 'bg-orange-100 text-orange-800 border-orange-200',
    'address': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'date': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  return colors[type] || 'bg-gray-100 text-gray-800 border-gray-200';
};

export function SecondScreen({ piiItems, onBack }: SecondScreenProps) {
  const [showSensitiveData, setShowSensitiveData] = useState(false);

  const maskText = (text: string, type: string) => {
    if (showSensitiveData) return text;
    
    switch (type) {
      case 'email':
        const emailParts = text.split('@');
        return emailParts[0].substring(0, 2) + '***@' + emailParts[1];
      case 'phone':
        return '***-***-' + text.slice(-4);
      case 'ssn':
        return '***-**-' + text.slice(-4);
      case 'credit_card':
        return '**** **** **** ' + text.slice(-4);
      default:
        return text.substring(0, 2) + '***';
    }
  };

  const groupedPII = piiItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, PIIItem[]>);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">PII Detection Results</h1>
          <p className="text-muted-foreground">
            Found {piiItems.length} potential PII element{piiItems.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSensitiveData(!showSensitiveData)}
          className="flex items-center space-x-2"
        >
          {showSensitiveData ? (
            <>
              <EyeOff className="h-4 w-4" />
              <span>Hide</span>
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              <span>Show</span>
            </>
          )}
        </Button>
      </div>

      {piiItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg">No PII detected</p>
            <p className="text-muted-foreground">
              The analyzed content appears to be free of personally identifiable information.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {Object.entries(groupedPII).map(([type, items]) => (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="capitalize">{type.replace('_', ' ')}</span>
                    <Badge variant="secondary">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <code className="bg-muted px-2 py-1 rounded text-sm">
                            {maskText(item.word, item.category)}
                          </code>
                          <Badge 
                            className={getPIITypeColor(item.category)}
                            variant="outline"
                          >
                            {item.category}
                          </Badge>
                        </div>
                        {/* <p className="text-sm text-muted-foreground">
                          Confidence: {Math.round(item.confidence * 100)}%
                        </p> */}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="flex space-x-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Analyze Another
        </Button>
        <Button 
          onClick={() => {
            // Export functionality could be added here
            console.log('Export results:', piiItems);
          }}
          className="flex-1"
        >
          Export Results
        </Button>
      </div>
    </div>
  );
}