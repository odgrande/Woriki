// Entry point. Wiring of all modules happens here (see ARCHITECTURE.md).
import { createContext } from './engine/context.js';

const ctx = createContext(document.getElementById('world'));
ctx.start();
window.__amen = { ctx };
