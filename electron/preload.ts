import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getPrinters: (): Promise<any[]> => ipcRenderer.invoke('get-printers'),
  printThermal: (args: { text: string; printerName?: string; autoCut?: boolean }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('print-thermal', args),
  getPrinterStatus: (printerName?: string) => ipcRenderer.invoke('get-printer-status', printerName),
  cutPaper: (printerName?: string) => ipcRenderer.invoke('print-thermal', { text: '\n\n\n', printerName, autoCut: true }),
  openCashDrawer: (printerName?: string) => ipcRenderer.invoke('print-thermal', { text: '', printerName, autoCut: false }),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  smsSend: (args: { url: string; token: string; phone: string; message: string; template?: string }) => ipcRenderer.invoke('sms-send', args),
  smsTest: (args: { url: string; token: string; template?: string }) => ipcRenderer.invoke('sms-test', args),
  isElectron: true,
});

declare global {
  interface Window {
    electron?: {
      getPrinters: () => Promise<any[]>;
      printThermal: (args: any) => Promise<any>;
      getPrinterStatus: (name?: string) => Promise<any>;
      cutPaper: (name?: string) => Promise<any>;
      openCashDrawer: (name?: string) => Promise<any>;
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      quitAndInstall: () => void;
      smsSend: (args: any) => Promise<any>;
      smsTest: (args: any) => Promise<any>;
      isElectron: boolean;
    };
  }
}
