declare module "pdfkit" {
  import { EventEmitter } from "node:events";

  type PdfInfo = {
    Author?: string;
    Title?: string;
  };

  type PdfOptions = {
    info?: PdfInfo;
    margin?: number;
  };

  export default class PDFDocument extends EventEmitter {
    constructor(options?: PdfOptions);
    end(): void;
    fillColor(color: string): this;
    fontSize(size: number): this;
    moveDown(lines?: number): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
  }
}
