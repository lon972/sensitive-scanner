declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    version?: string;
  }

  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}

declare module "node-tesseract-ocr" {
  interface TesseractConfig {
    lang?: string;
    oem?: number;
    psm?: number;
    binary?: string;
    tessdataDir?: string;
  }

  const tesseract: {
    recognize(input: string | Buffer, config?: TesseractConfig): Promise<string>;
  };

  export default tesseract;
}
