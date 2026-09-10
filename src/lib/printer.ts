// PrinterManager - abstraction for thermal printing
// Works for browser (window.print fallback) and future Electron ESC/POS

export type PaperSize = '80mm' | '58mm';

export interface PrinterSettings {
  printerName: string;
  paperSize: PaperSize;
  printMode: 'Thermal' | 'Normal';
  copies: number;
  autoCut: boolean;
  openCashDrawer: boolean;
  printLogo: boolean;
  printCustomerDetails: boolean;
  printSku: boolean;
  printTax: boolean;
  printFooter: boolean;
  headerAlignment: 'left' | 'center' | 'right';
  bodyAlignment: 'left' | 'center' | 'right';
  footerAlignment: 'left' | 'center' | 'right';
  columns: number;
  autoPrint: boolean;
  feedLines: number;
}

const DEFAULT_SETTINGS: PrinterSettings = {
  printerName: '',
  paperSize: '80mm',
  printMode: 'Thermal',
  copies: 1,
  autoCut: true,
  openCashDrawer: false,
  printLogo: true,
  printCustomerDetails: true,
  printSku: false,
  printTax: true,
  printFooter: true,
  headerAlignment: 'center',
  bodyAlignment: 'left',
  footerAlignment: 'center',
  columns: 48,
  autoPrint: false,
  feedLines: 4,
};

const STORAGE_KEY = 'thermal_printer_settings';

export class PrinterManager {
  private settings: PrinterSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings(): PrinterSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(settings: Partial<PrinterSettings>) {
    this.settings = { ...this.settings, ...settings };
    // Auto-adjust columns based on paper size
    if (settings.paperSize) {
      this.settings.columns = settings.paperSize === '80mm' ? 48 : 32;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    return this.settings;
  }

  getSettings(): PrinterSettings {
    return { ...this.settings };
  }

  async getPrinters(): Promise<string[]> {
    // Browser cannot enumerate printers directly; return empty and use system dialog
    // In Electron, this would use ipcRenderer to get printers from main process
    if ((window as any).electron?.getPrinters) {
      try {
        const printers = await (window as any).electron.getPrinters();
        return printers.map((p: any) => p.name);
      } catch {}
    }
    // Fallback: try Web Print API enumeration (not widely supported)
    return [];
  }

  async getDefaultPrinter(): Promise<string> {
    const printers = await this.getPrinters();
    return printers[0] || this.settings.printerName;
  }

  async printText(text: string): Promise<void> {
    const settings = this.getSettings();
    for (let i = 0; i < settings.copies; i++) {
      await this.printSingleCopy(text, settings);
      if (i < settings.copies - 1) {
        // Feed between copies
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  private async printSingleCopy(text: string, settings: PrinterSettings): Promise<void> {
    // Try Electron ESC/POS direct printing if available
    if ((window as any).electron?.printThermal) {
      try {
        const result = await (window as any).electron.printThermal({
          text,
          printerName: settings.printerName,
          paperSize: settings.paperSize,
          columns: settings.columns,
          autoCut: settings.autoCut,
          openCashDrawer: settings.openCashDrawer,
          feedLines: settings.feedLines,
        });
        if (result?.success) return;
        // Fall through to fallback on failure
        console.warn('Electron thermal print failed, falling back to browser print', result);
      } catch (e) {
        console.warn('Electron print error, falling back', e);
      }
    }

    // Fallback: HTML/CSS printing with 80mm @page
    return this.printViaBrowser(text, settings);
  }

  private async printViaBrowser(text: string, settings: PrinterSettings): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
          reject(new Error('Failed to open print window. Please allow popups.'));
          return;
        }

        const is80mm = settings.paperSize === '80mm';
        const contentWidth = is80mm ? '72mm' : '48mm';
        const paperWidth = settings.paperSize;

        const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Print</title>
<style>
  @page {
    size: ${paperWidth} auto;
    margin: 0;
  }
  html, body {
    width: ${paperWidth};
    margin: 0;
    padding: 0;
    background: white;
  }
  .thermal-receipt {
    width: ${contentWidth};
    margin: 0 auto;
    padding: 2mm;
    box-sizing: border-box;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.3;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: black;
    background: white;
  }
  @media print {
    html, body {
      width: ${paperWidth};
      margin: 0;
      padding: 0;
    }
    .thermal-receipt {
      width: ${contentWidth};
      margin: 0 auto;
      padding: 2mm;
    }
  }
</style>
</head>
<body>
<div class="thermal-receipt">${this.escapeHtml(text)}</div>
<script>
  window.onload = function() {
    setTimeout(function() {
      window.print();
      // Don't close immediately, let print dialog handle it
      // window.close() will be called after print
    }, 300);
  };
  window.onafterprint = function() {
    window.close();
  };
  // Fallback close after 5s
  setTimeout(function() { try { window.close(); } catch(e) {} }, 5000);
</script>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        // Resolve after print dialog closes (or after timeout)
        const checkClosed = setInterval(() => {
          if (printWindow.closed) {
            clearInterval(checkClosed);
            resolve();
          }
        }, 500);

        setTimeout(() => {
          clearInterval(checkClosed);
          resolve();
        }, 8000);

      } catch (e) {
        reject(e);
      }
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  async testPrint(): Promise<void> {
    const settings = this.getSettings();
    const now = new Date();
    const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const cols = settings.columns;
    const sep = '='.repeat(cols);
    const text = [
      sep,
      this.center('TEST PRINT', cols),
      sep,
      '',
      `Business: ${(localStorage.getItem('store_name') || 'BusinessDesk').slice(0, cols)}`,
      `Printer: ${(settings.printerName || 'Default').slice(0, cols)}`,
      `Paper: ${settings.paperSize}`,
      `Date: ${date}`,
      `Time: ${time}`,
      '',
      '-'.repeat(cols),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      '!@#$%^&*()_+-=[]{}|;:,.<>?',
      '-'.repeat(cols),
      '',
      sep,
      this.center('PRINT SUCCESSFUL', cols),
      sep,
      '',
      '',
      '',
    ].join('\n');

    await this.printText(text);
    if (settings.autoCut) {
      await this.cutPaper();
    }
  }

  private center(text: string, cols: number): string {
    if (text.length >= cols) return text.slice(0, cols);
    const pad = cols - text.length;
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + text + ' '.repeat(pad - left);
  }

  async cutPaper(): Promise<void> {
    if ((window as any).electron?.cutPaper) {
      try {
        await (window as any).electron.cutPaper(this.settings.printerName);
      } catch {}
    }
    // Browser fallback does nothing - cut is handled by printer driver if autoCut enabled
  }

  async openCashDrawer(): Promise<void> {
    if ((window as any).electron?.openCashDrawer) {
      try {
        await (window as any).electron.openCashDrawer(this.settings.printerName);
      } catch {}
    }
  }

  async getPrinterStatus(): Promise<{ available: boolean; message: string }> {
    if ((window as any).electron?.getPrinterStatus) {
      try {
        return await (window as any).electron.getPrinterStatus(this.settings.printerName);
      } catch {}
    }
    // Browser fallback - assume available if we can open print window
    return { available: true, message: 'Ready (browser print)' };
  }
}

export const printerManager = new PrinterManager();

// ESC/POS helpers (for future Electron implementation)
export const ESCPOS = {
  INIT: '\x1B\x40',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  ALIGN_LEFT: '\x1B\x61\x00',
  ALIGN_CENTER: '\x1B\x61\x01',
  ALIGN_RIGHT: '\x1B\x61\x02',
  CUT: '\x1D\x56\x00',
  FEED: '\x1B\x64\x04',
  OPEN_DRAWER: '\x1B\x70\x00\x19\xFA',
};

export function buildEscPosReceipt(text: string, settings: PrinterSettings): string {
  let esc = ESCPOS.INIT;
  esc += text;
  // Feed lines
  esc += '\n'.repeat(settings.feedLines);
  if (settings.autoCut) esc += ESCPOS.CUT;
  if (settings.openCashDrawer) esc += ESCPOS.OPEN_DRAWER;
  return esc;
}
