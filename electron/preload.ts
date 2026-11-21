// Sandboxed preload. The official SmartSpectra preload is bundled in so the renderer
// gets its MessagePort bridge (window.__smartspectraBridge) without disabling the sandbox.
import '@smartspectra/node-sdk/preload';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BreathCoachBridge, ExternalLinkId } from '../src/shared/bridge';
import { CH } from './channels';

const bridge: BreathCoachBridge = {
  platform: process.platform,
  version: ipcRenderer.sendSync(CH.version) as string,
  key: {
    status: () => ipcRenderer.invoke(CH.keyStatus),
    save: (key: string) => ipcRenderer.invoke(CH.keySave, String(key)),
    load: () => ipcRenderer.invoke(CH.keyLoad),
    remove: () => ipcRenderer.invoke(CH.keyRemove),
  },
  armCamera: (armed: boolean) => ipcRenderer.invoke(CH.armCamera, Boolean(armed)),
  sdkStatus: () => ipcRenderer.invoke(CH.sdkStatus),
  openExternal: (id: ExternalLinkId) => ipcRenderer.invoke(CH.openExternal, String(id)),
  native: {
    start: (key: string) => ipcRenderer.invoke(CH.nativeStart, String(key)),
    stop: () => ipcRenderer.invoke(CH.nativeStop),
    onEvent: (cb) => {
      const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload as never);
      ipcRenderer.on(CH.nativeEvent, listener);
      return () => void ipcRenderer.removeListener(CH.nativeEvent, listener);
    },
  },
};

contextBridge.exposeInMainWorld('breathCoach', bridge);
