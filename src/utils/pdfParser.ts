// Use require as it's more reliable for some CommonJS packages in ts-node
const pdf = require('pdf-parse');

export interface ParsedInvoiceItem {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedInvoice {
  invoiceNumber: string;
  customerName: string;
  customerNif: string;
  vendor: string;
  issueDate: string;
  dueDate: string;
  reference: string;
  incidence: number;
  vatTotal: number;
  totalValue: number;
  items: ParsedInvoiceItem[];
}

interface Chunk {
  text: string;
  x: number;
  y: number;
}

export const parseMicroAtomoInvoice = async (dataBuffer: Buffer): Promise<ParsedInvoice> => {
  let chunks: Chunk[] = [];

  const renderPage = async (pageData: any) => {
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false
    });

    for (let item of textContent.items) {
      if (item.str.trim()) {
        chunks.push({
          text: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5]
        });
      }
    }
    return ''; // We don't need the joined text
  };

  await pdf(dataBuffer, { 
    max: 1,
    pagerender: renderPage
  });

  // --- Logic from invoice-parser.ts adapted ---

  const Y_TOLERANCE = 4;
  
  const findLabel = (label: string): Chunk | undefined => {
    return chunks.find(c => c.text.toLowerCase().includes(label.toLowerCase()));
  };

  const chunksOnSameLine = (ref: Chunk): Chunk[] => {
    return chunks.filter(c => c !== ref && Math.abs(c.y - ref.y) <= Y_TOLERANCE);
  };

  const findValueBelow = (labelChunk: Chunk): string => {
    const below = chunks
      .filter(c =>
        Math.abs(c.x - labelChunk.x) <= 80 &&
        c.y < labelChunk.y &&
        labelChunk.y - c.y <= 25
      )
      .sort((a, b) => b.y - a.y);
    return below.length > 0 ? below[0].text : '';
  };

  const findValueNear = (labelChunk: Chunk): string => {
    const sameLine = chunksOnSameLine(labelChunk)
      .filter(c => c.x > labelChunk.x && c.x - labelChunk.x <= 300)
      .sort((a, b) => a.x - b.x);
    return sameLine.length > 0 ? sameLine[0].text : '';
  };

  const groupByY = (chunkList: Chunk[]): Chunk[][] => {
    if (chunkList.length === 0) return [];
    const sorted = [...chunkList].sort((a, b) => b.y - a.y);
    const bands: Chunk[][] = [];
    let currentBand: Chunk[] = [sorted[0]];
    let currentY = sorted[0].y;

    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].y - currentY) <= Y_TOLERANCE) {
        currentBand.push(sorted[i]);
      } else {
        bands.push(currentBand);
        currentBand = [sorted[i]];
        currentY = sorted[i].y;
      }
    }
    bands.push(currentBand);
    return bands;
  };

  // 1. Extrair Cabeçalho
  const faturaChunk = chunks.find(c => c.text.startsWith('FACTURA Nº'));
  const invoiceNumber = faturaChunk ? faturaChunk.text.replace('FACTURA Nº', '').replace('FA ', '').trim() : '';

  const exmoChunk = findLabel('Exmo(s). Senhor(es),');
  let customerName = '';
  if (exmoChunk) {
    const abaixo = chunks
      .filter(c => c.y < exmoChunk.y && c.x > 280 && exmoChunk.y - c.y < 50)
      .sort((a, b) => b.y - a.y);
    if (abaixo.length > 0) customerName = abaixo[0].text;
  }

  const nifLabel = findLabel('V/ Nº Contribuinte');
  const nifRowChunks = nifLabel ? chunks.filter(c => nifLabel.y - c.y > 5 && nifLabel.y - c.y < 35) : [];
  const customerNif = nifRowChunks.map(c => c.text.match(/\d{9}/)?.[0]).find(n => n) || '';

  const vendLabel = findLabel('Vendedor');
  const vendor = vendLabel ? findValueBelow(vendLabel) : '';

  const dataLabel = findLabel('Data');
  const datePattern = /(\d{4}-\w{3}-\d{2})|(\d{2}-\d{2}-\d{4})/;
  const dataRowChunks = dataLabel ? chunks.filter(c => dataLabel.y - c.y > 5 && dataLabel.y - c.y < 35) : [];
  const issueDateRel = dataRowChunks.map(c => c.text.match(datePattern)?.[0]).find(n => n) || '';

  const vencLabel = findLabel('Vencimento');
  const vencRowChunks = vencLabel ? chunks.filter(c => vencLabel.y - c.y > 5 && vencLabel.y - c.y < 35) : [];
  const dueDateRel = vencRowChunks.map(c => c.text.match(datePattern)?.[0]).find(n => n) || '';

  const refLabel = findLabel('Referência');
  const reference = refLabel ? findValueBelow(refLabel) : '';

  // 2. Extrair Itens (Tabela)
  const headerYChunk = findLabel('Código');
  const tableEndChunk = findLabel('Ilíquido') || findLabel('Totais do Documento');
  
  const items: ParsedInvoiceItem[] = [];
  if (headerYChunk && tableEndChunk) {
    const tableChunks = chunks.filter(c => c.y < headerYChunk.y && c.y > tableEndChunk.y);
    const bands = groupByY(tableChunks);

    // Header X positions
    const xPositions = {
      codigo: findLabel('Código')?.x ?? 0,
      designacao: findLabel('Designação')?.x ?? 100,
      qtd: findLabel('Qtd.')?.x ?? 400,
      preco: findLabel('Preço')?.x ?? 450,
      total: findLabel('Total')?.x ?? 530
    };

    for (const band of bands) {
      if (band.length < 2) continue; // Ignore lines with only 1 chunk (often noise)
      
      const getCol = (xRef: number) => {
        const sorted = band.slice().sort((a, b) => Math.abs(a.x - xRef) - Math.abs(b.x - xRef));
        const best = sorted[0];
        // Must be within 50px of the header column
        return (best && Math.abs(best.x - xRef) < 50) ? best : null;
      };
      
      const codeChunk = getCol(xPositions.codigo);
      const qtdChunk = getCol(xPositions.qtd);
      const precoChunk = getCol(xPositions.preco);
      const totalChunk = getCol(xPositions.total);

      const designacaoChunks = band.filter(c => c.x > xPositions.codigo + 30 && c.x < xPositions.qtd).sort((a, b) => a.x - b.x);

      const quantity = parseFloat(qtdChunk?.text.replace(/\./g, '').replace(',', '.') || '0');
      const unitPrice = parseFloat(precoChunk?.text.replace(/\./g, '').replace(',', '.') || '0');
      const totalPrice = parseFloat(totalChunk?.text.replace(/\./g, '').replace(',', '.') || '0');

      // Only add if it has a valid-looking price and quantity
      if (quantity > 0 && unitPrice > 0) {
        items.push({
          code: codeChunk?.text || '',
          description: designacaoChunks.map(c => c.text).join(' '),
          quantity,
          unitPrice,
          totalPrice: totalPrice || (quantity * unitPrice) // fallback
        });
      }
    }
  }

  // 3. Extrair Totais
  const findTotalLabel = (lbl: string) => {
    const c = findLabel(lbl);
    if (!c) return 0;
    // value could be in the same chunk if merged, or to the right on the same line
    const sameLine = chunksOnSameLine(c).filter(item => item.x > c.x).sort((a, b) => a.x - b.x);
    const valueStr = sameLine.length > 0 ? sameLine[0].text : c.text;
    const match = valueStr.match(/(\d[\d.,]*)/);
    return match ? parseFloat(match[1].replace(/\./g, '').replace(',', '.')) : 0;
  };

  const incidence = findTotalLabel('Incidência') || findTotalLabel('Ilíquido');
  const vatTotal = findTotalLabel('I.V.A.') || findTotalLabel('Valor IVA');
  const totalValue = findTotalLabel('Total Final') || findTotalLabel('Total a Pagar');

  const monthMap: { [key: string]: string } = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
  };

  const normalizeDate = (dateStr: string) => {
    if (!dateStr) return '2000-01-01';
    const parts = dateStr.toLowerCase().split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${monthMap[parts[1]] || parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${monthMap[parts[1]] || parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return dateStr;
  };

  return {
    invoiceNumber,
    customerName: customerName || 'Cliente Desconhecido',
    customerNif,
    vendor,
    issueDate: normalizeDate(issueDateRel),
    dueDate: normalizeDate(dueDateRel),
    reference,
    incidence,
    vatTotal,
    totalValue,
    items
  };
};
