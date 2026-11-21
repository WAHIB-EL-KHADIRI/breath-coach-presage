import { app, BrowserWindow, ipcMain, Menu, safeStorage, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CH, EXTERNAL_LINKS } from './channels';
import { CredentialStore } from './credentials';
import { NativeSession } from './nativeSession';
import { cpuPercent, sumCpuTimes, type CpuTimes } from './system';
import { allowCamera, isAllowedRequestUrl, isTrustedUrl, type TrustedOrigins } from './security';

app.setName('Breath Coach');
app.enableSandbox(); // every renderer, not only the main window

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const devUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
const indexFile = path.join(__dirname, '..', 'dist', 'index.html');
const trusted: TrustedOrigins = { fileUrl: pathToFileURL(indexFile).href, devOrigin: devUrl };

let mainWindow: BrowserWindow | null = null;
let cameraArmed = false;
let credentials: CredentialStore;
let sdkAvailable = false;
let nativeSession: NativeSession | null = null;
let lastCpu: CpuTimes = sumCpuTimes(os.cpus());

const log = (msg: string) => console.log(`[breath-coach ${new Date().toISOString().slice(11, 23)}] ${msg}`);

function fromTrustedRenderer(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return (
    mainWindow != null &&
    event.sender === mainWindow.webContents &&
    isTrustedUrl(event.senderFrame?.url, trusted)
  );
}

function registerIpc(): void {
  const guarded =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (event: IpcMainInvokeEvent, ...args: A): R => {
      if (!fromTrustedRenderer(event)) throw new Error('untrusted sender');
      return fn(...args);
    };

  ipcMain.on(CH.version, (event) => {
    event.returnValue = fromTrustedRenderer(event) ? app.getVersion() : '';
  });
  ipcMain.handle(CH.keyStatus, guarded(() => credentials.status()));
  ipcMain.handle(
    CH.keySave,
    guarded((key: unknown) => {
      try {
        return credentials.save(key);
      } catch (e) {
        // Only a coarse reason crosses the boundary; the key never appears in an error message.
        throw new Error(e instanceof Error && e.message === 'encryption-unavailable' ? 'encryption-unavailable' : 'invalid-key-shape');
      }
    }),
  );
  ipcMain.handle(CH.keyLoad, guarded(() => credentials.load()));
  ipcMain.handle(CH.keyRemove, guarded(() => credentials.remove()));
  ipcMain.handle(
    CH.armCamera,
    guarded((armed: unknown) => {
      cameraArmed = armed === true;
      if (!cameraArmed) void nativeSession?.stop(); // disarming always closes a native camera too
      log(`camera ${cameraArmed ? 'armed' : 'disarmed'}`);
    }),
  );
  ipcMain.handle(
    CH.nativeStart,
    guarded(async (key: unknown) => {
      // Same rule as the Chromium camera gate: nothing opens the camera unless a session was explicitly armed.
      if (!cameraArmed || !sdkAvailable || !nativeSession) return { ok: false, code: 7, retryable: false };
      return nativeSession.start(key);
    }),
  );
  ipcMain.handle(CH.nativeStop, guarded(async () => void (await nativeSession?.stop())));
  ipcMain.handle(
    CH.systemLoad,
    guarded(() => {
      const cur = sumCpuTimes(os.cpus());
      const pct = cpuPercent(lastCpu, cur);
      lastCpu = cur;
      return { cpuPercent: pct };
    }),
  );
  ipcMain.handle(CH.sdkStatus, guarded(() => ({ available: sdkAvailable })));
  ipcMain.handle(
    CH.openExternal,
    guarded(async (id: unknown) => {
      const url = typeof id === 'string' ? EXTERNAL_LINKS[id] : undefined;
      if (url) await shell.openExternal(url);
    }),
  );
}

function configureCameraPermissions(): void {
  const ses = session.defaultSession;
  ses.setDevicePermissionHandler(() => false); // no USB / serial / HID / bluetooth for the page
  // The renderer never needs the network: cancel anything that is not its own bundle.
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedRequestUrl(details.url, trusted) }));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(
      allowCamera({
        permission,
        armed: cameraArmed,
        senderIsMainWindow: mainWindow != null && wc === mainWindow.webContents,
        requestingUrl: details.requestingUrl,
        details: details as { mediaTypes?: string[] },
        trusted,
      }),
    );
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    return allowCamera({
      permission,
      armed: cameraArmed,
      senderIsMainWindow: mainWindow != null && wc === mainWindow.webContents,
      requestingUrl: details.requestingUrl ?? requestingOrigin,
      details: { mediaType: (details as { mediaType?: string }).mediaType },
      trusted,
    });
  });
}

/** Loads the SmartSpectra main-process glue. A failure is reported to the UI, it does not crash the app. */
function bindSdk(win: BrowserWindow): void {
  try {
    if (app.isPackaged) {
      // Packaged builds always use the runtime shipped with the app; an environment override is ignored.
      const dll = { win32: 'smartspectra_capi.dll', darwin: 'libsmartspectra_capi.dylib', linux: 'libsmartspectra_capi.so' }[process.platform as string];
      if (dll) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', dll);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@smartspectra/node-sdk'); // fails here, early and clearly, if the native runtime is missing
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main') as typeof import('@smartspectra/node-sdk/main');
    bindSmartSpectraIpc(win, { logger: (level, msg) => (level !== 'info' || process.env.SMARTSPECTRA_DIAGNOSTICS === '1') && log(`sdk ${level}: ${msg}`) });
    sdkAvailable = true;
    log('SmartSpectra runtime ready');
  } catch (e) {
    sdkAvailable = false;
    log(`SmartSpectra runtime unavailable: ${e instanceof Error ? e.message.split('\n')[0] : 'unknown error'}`);
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Breath Coach',
    backgroundColor: '#060a13',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = win;

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url, trusted)) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  // Any reload or navigation of the main frame ends the camera session: nothing may keep running unseen.
  win.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return;
    cameraArmed = false;
    void nativeSession?.stop();
  });
  if (!app.isPackaged && process.env.SMARTSPECTRA_DIAGNOSTICS === '1') {
    // Development diagnostics only (never in a packaged build): mirror the renderer console (SDK frame-loop messages, session errors) into the log.
    win.webContents.on('console-message', (e) => log(`renderer ${e.level}: ${String(e.message).slice(0, 300)}`));
  }
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    void nativeSession?.stop();
    cameraArmed = false;
    mainWindow = null;
  });

  nativeSession = new NativeSession((e) => {
    if (!win.isDestroyed()) win.webContents.send(CH.nativeEvent, e);
  });
  bindSdk(win);
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(indexFile);
}

// Every web contents, present or future, gets the same restrictions as the main window.
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url, trusted)) e.preventDefault();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  credentials = new CredentialStore(app.getPath('userData'), safeStorage);
  registerIpc();
  configureCameraPermissions();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => void nativeSession?.stop());
app.on('window-all-closed', () => app.quit());
