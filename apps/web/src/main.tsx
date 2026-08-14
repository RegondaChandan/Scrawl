import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/space-grotesk/latin-400.css';
import { App } from './App';
import { EditorProvider } from './EditorProvider';
import { UiPreferencesProvider } from './ui-preferences';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root was not found');

createRoot(root).render(
  <StrictMode>
    <UiPreferencesProvider>
      <EditorProvider>
        <App />
      </EditorProvider>
    </UiPreferencesProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
