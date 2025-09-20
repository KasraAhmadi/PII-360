import { PDFDocument, rgb } from 'pdf-lib';
import { PII } from './piiDetection';
import { PdfData } from '../Popup';

function findItemsToHighlight(piiResults: PII[], allTextItems: any[]) {
    console.log('Finding items to highlight...', { piiResults, allTextItemsCount: allTextItems.length });
    const itemsToHighlight = [];
    if (!piiResults || piiResults.length === 0) {
        console.log('No PII results to highlight');
        return itemsToHighlight;
    }
    let charIndex = 0;
    const piiEntities = [...piiResults].sort((a, b) => a.start - b.start);
    console.log('Sorted PII entities:', piiEntities);
    let currentPiiIndex = 0;
    for (const item of allTextItems) {
        const itemEndIndex = charIndex + item.str.length;
        const itemInfo = { text: item.str, start: charIndex, end: itemEndIndex };
        while (currentPiiIndex < piiEntities.length) {
            const pii = piiEntities[currentPiiIndex];
            const overlap = Math.max(charIndex, pii.start) < Math.min(itemEndIndex, pii.end);
            if (overlap) {
                console.log('Found overlap:', { itemInfo, pii });
                itemsToHighlight.push(item);
            }
            if (pii.end < itemEndIndex) {
                currentPiiIndex++;
            } else {
                break;
            }
        }
        charIndex = itemEndIndex + 1; // +1 for the space
    }
    console.log('Items to highlight:', itemsToHighlight.length);
    return [...new Set(itemsToHighlight)];
}

export async function highlightPIIInPdf(
  originalPdfData: File,
  piiItems: PII[],
  pdfData: PdfData,
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(await originalPdfData.arrayBuffer());
    const pages = pdfDoc.getPages();
    const itemsToHighlight = findItemsToHighlight(piiItems, pdfData.items);

    for (const item of itemsToHighlight) {
        console.log('Highlighting item:', { pageIndex: item.pageIndex, text: item.str });
        
        if (item.pageIndex === undefined || item.pageIndex < 0 || item.pageIndex >= pages.length) {
            console.warn('Invalid pageIndex for item:', item);
            continue;
        }
        
        const page = pages[item.pageIndex];
        if (!page) {
            console.warn('Page not found for index:', item.pageIndex);
            continue;
        }
        
        const { height } = page.getSize();
        const itemX = item.transform?.[4] ?? 0;
        const itemY = item.transform?.[5] ?? 0;
        const itemWidth = item.width ?? 50;
        const itemHeight = item.height ?? 10;
        
        console.log('Drawing rectangle:', { x: itemX, y: itemY, width: itemWidth, height: itemHeight });
        
        page.drawRectangle({
            x: itemX, 
            y: itemY,
            width: itemWidth, 
            height: itemHeight,
            color: rgb(1, 1, 0),
            opacity: 0.3,
        });
    }
    return await pdfDoc.save();
}
