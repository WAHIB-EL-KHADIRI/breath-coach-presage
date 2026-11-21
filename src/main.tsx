import '@fontsource-variable/inter';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/orb.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { controller } from './app/runtime';

void controller.init();
createRoot(document.getElementById('root') as HTMLElement).render(<App />);
