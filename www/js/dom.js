// Tiny DOM helpers: escaping, bottom sheets (with Android back-button support) and toasts.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
export const icon = (name, size) => `<img class="ic"${size ? ` style="width:${size}px;height:${size}px"` : ''} src="icons/${name}.svg" alt="">`;

// ---------- sheets ----------
// One sheet at a time. Opening pushes a history entry so the Android back button closes the sheet
// instead of leaving the app.
let sheetOnClose = null;
let sheetOpen = false;

export function openSheet(html, onClose) {
  const root = $('#sheet-root');
  closeSheet(true);
  root.innerHTML = `<button class="scrim" data-act="close-sheet" aria-label="סגור"></button><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  sheetOnClose = onClose || null;
  sheetOpen = true;
  try { history.pushState({ sheet: true }, ''); } catch (e) { /* history unavailable: back button just exits */ }
  return $('.sheet', root);
}

export function sheetEl() { return sheetOpen ? $('#sheet-root .sheet') : null; }
export const isSheetOpen = () => sheetOpen;

export function closeSheet(silent) {
  if (!sheetOpen) return;
  const root = $('#sheet-root');
  root.classList.remove('open');
  root.innerHTML = '';
  sheetOpen = false;
  const cb = sheetOnClose;
  sheetOnClose = null;
  if (!silent) {
    try { if (history.state && history.state.sheet) history.back(); } catch (e) { /* ignore */ }
  }
  if (cb && !silent) cb();
}

window.addEventListener('popstate', () => {
  if (sheetOpen) {
    // Back was pressed: the history entry is already gone, just tear the sheet down.
    const root = $('#sheet-root');
    root.classList.remove('open');
    root.innerHTML = '';
    sheetOpen = false;
    const cb = sheetOnClose;
    sheetOnClose = null;
    if (cb) cb();
  }
});

// ---------- toast ----------
let toastTimer = null;
export function toast(text, action) {
  const root = $('#toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast"><span>${esc(text)}</span>${action ? `<button data-act="toast-action">${esc(action.label)}</button>` : ''}</div>`;
  const btn = $('[data-act="toast-action"]', root);
  if (btn) btn.addEventListener('click', () => { root.innerHTML = ''; action.run(); });
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, action ? 6000 : 3500);
}
export function clearToast() { clearTimeout(toastTimer); $('#toast-root').innerHTML = ''; }
