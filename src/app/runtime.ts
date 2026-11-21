import { createNativeSource, createPresageSource } from '../infrastructure/presage/rendererSdk';
import { SimulatedSource } from '../infrastructure/simulation/simulatedSource';
import { createStore } from '../shared/store';
import { SessionController, type Persistence } from './sessionController';
import { SignalStore } from './signalStore';
import { PreviewStore } from './previewStore';
import { initialState } from './state';

function browserPersistence(): Persistence {
  return {
    get: (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* storage unavailable: preferences simply don't persist */
      }
    },
    remove: (k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

export const store = createStore(initialState());
export const signal = new SignalStore();
export const preview = new PreviewStore();
export const controller = new SessionController({
  store,
  signal,
  preview,
  bridge: window.breathCoach,
  createPresage: (key, engine) => {
    const options = { brightnessBoost: () => store.getState().prefs.cameraBoost };
    return engine === 'native' ? createNativeSource(key, options) : createPresageSource(key, options);
  },
  createSimulated: () => new SimulatedSource({ now: () => performance.now() }),
  persistence: browserPersistence(),
  now: () => performance.now(),
});
