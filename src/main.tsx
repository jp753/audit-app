import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/arimo/latin-400.css';
import '@fontsource/arimo/latin-700.css';
import './styles.css';
import { App } from './ui/App';
import { showUpdateBanner } from './ui/update';

render(<App />, document.getElementById('app')!);

// Offline support. When a new version is published, ask before switching
// so nothing is interrupted mid-audit.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    showUpdateBanner(() => updateSW(true));
  },
});
