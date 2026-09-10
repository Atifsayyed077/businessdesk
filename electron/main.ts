import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// isDev: prefer electron-is-dev if present, else fallback to app.isPackaged
let isDev: boolean;
try {
  const m: any = require('electron-is-dev');
  isDev = typeof m === 'boolean' ? m : (m.default ?? !app.isPackaged);
} catch {
  isDev = !app.isPackaged;
}

// autoUpdater: lazy-loaded, app must not crash if electron-updater is missing (ERR_MODULE_NOT_FOUND)
let autoUpdater: any = null;
try {
  const upd: any = require('electron-updater');
  autoUpdater = upd.autoUpdater ?? upd.default?.autoUpdater ?? upd.default ?? null;
} catch (e) {
  console.warn('[main] electron-updater not available — auto-update disabled', e);
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // __dirname is .../app.asar/electron/dist in packaged app, .../electron/dist in dev
  // dist/index.html is at .../app.asar/dist/index.html → need ../../dist
  const iconPath = path.join(__dirname, '../../dist/favicon.svg');
  const distIndex = path.join(__dirname, '../../dist/index.html');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${distIndex}`;

  if (isDev) {
    mainWindow.loadURL(startUrl);
  } else {
    // loadFile handles spaces correctly vs loadURL
    mainWindow.loadFile(distIndex);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock - prevents double EXE
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // AutoUpdater - only in production and if available
  if (!isDev && autoUpdater) {
    try {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('update-available', (info: any) => {
        dialog.showMessageBox(mainWindow!, {
          type: 'info',
          title: 'Update Available',
          message: `New version ${info.version} is available. Downloading in background...`,
          buttons: ['OK'],
        });
        autoUpdater.downloadUpdate();
      });

      autoUpdater.on('update-downloaded', (info: any) => {
        dialog.showMessageBox(mainWindow!, {
          type: 'info',
          title: 'Update Ready',
          message: `Version ${info.version} downloaded. Restart now to install?`,
          buttons: ['Restart Now', 'Later'],
          defaultId: 0,
        }).then(({ response }: any) => {
          if (response === 0) autoUpdater.quitAndInstall();
        });
      });

      autoUpdater.on('error', (err: any) => {
        console.error('AutoUpdater error:', err);
      });

      // Check on start + every 6 hours
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
      setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
      }, 6 * 60 * 60 * 1000);
    } catch (e) {
      console.warn('[main] autoUpdater setup failed', e);
    }
  } else if (!isDev && !autoUpdater) {
    console.warn('[main] autoUpdater unavailable — skipping update checks');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------- IPC: Printer ----------------
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map(p => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault, status: p.status }));
});

ipcMain.handle('print-thermal', async (_event, args: { text: string; printerName?: string; autoCut?: boolean }) => {
  if (!mainWindow) return { success: false, error: 'No window' };
  try {
    // Use silent print to configured printer if available
    const options: any = {
      silent: !!args.printerName,
      printBackground: false,
      margins: { marginType: 'none' },
    };
    if (args.printerName) options.deviceName = args.printerName;

    // Create hidden window with thermal text
    const printWin = new BrowserWindow({
      show: false,
      width: 380,
      height: 600,
      webPreferences: { offscreen: true },
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      @page { size: 80mm auto; margin: 0; }
      html,body { width: 80mm; margin:0; padding:0; background:white; }
      pre { font-family:'Courier New',monospace; font-size:11px; line-height:1.3; white-space:pre-wrap; word-wrap:break-word; margin:0; padding:4mm; width:72mm; margin:0 auto; color:black; background:white; }
    </style></head><body><pre>${escapeHtml(args.text)}</pre></body></html>`;

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    const contents = printWin.webContents;
    await new Promise<void>((resolve, reject) => {
      contents.print(options, (success, errorType) => {
        if (!success) reject(new Error(errorType || 'Print failed'));
        else resolve();
      });
    });
    printWin.close();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('get-printer-status', async (_event, printerName?: string) => {
  if (!mainWindow) return { available: false, message: 'No window' };
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    if (!printerName) return { available: true, message: 'Ready (system default)' };
    const found = printers.find(p => p.name === printerName);
    if (!found) return { available: false, message: `Printer "${printerName}" not found` };
    return { available: true, message: `Ready: ${found.displayName || found.name}` };
  } catch (e: any) {
    return { available: false, message: e.message };
  }
});

ipcMain.handle('check-for-updates', async () => {
  if (isDev) return { available: false, message: 'Dev mode - updates disabled' };
  if (!autoUpdater) return { available: false, message: 'Auto-update not available in this build' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
  } catch (e: any) {
    return { available: false, error: e.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'Auto-update not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('quit-and-install', () => {
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall();
});

// ---------------- IPC: SMS (avoids CORS, works without same WiFi in Electron) ----------------
ipcMain.handle('sms-send', async (_event, args: { url: string; token: string; phone: string; message: string; template?: string }) => {
  try {
    const template = args.template || '{ "to": "{phone}", "message": "{message}" }';
    let bodyStr = template.replaceAll('{phone}', args.phone).replaceAll('{message}', args.message.replaceAll('"', '\\"').replaceAll('\n', '\\n'));
    let body: any;
    try { body = JSON.parse(bodyStr); } catch { body = bodyStr; }
    const bodyJson = typeof body === 'string' ? body : JSON.stringify(body);

    // Use Electron net or Node fetch (no CORS in main process)
    const res = await fetch(args.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': args.token,
      },
      body: bodyJson,
    } as any);

    const text = await (res as any).text().catch(() => '');
    if ((res as any).ok) {
      return { ok: true, status: (res as any).status };
    } else {
      return { ok: false, error: `Gateway ${(res as any).status}: ${text.slice(0, 300) || (res as any).statusText}` };
    }
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('sms-test', async (_event, args: { url: string; token: string; template?: string }) => {
  try {
    const template = args.template || '{ "to": "{phone}", "message": "{message}" }';
    let bodyStr = template.replaceAll('{phone}', '9999999999').replaceAll('{message}', 'test');
    let body: any;
    try { body = JSON.parse(bodyStr); } catch { body = bodyStr; }
    const bodyJson = typeof body === "string" ? body : JSON.stringify(body);
    const res: any = await fetch(args.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': args.token },
      body: bodyJson,
    } as any);
    const text = await res.text().catch(() => '');
    if (res.status === 400 || (res.ok)) {
      return { ok: true, status: res.status, message: `Gateway reachable at ${args.url} (responded ${res.status})` };
    }
    return { ok: false, status: res.status, message: `Gateway responded ${res.status}: ${text.slice(0,150)}` };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
});

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
