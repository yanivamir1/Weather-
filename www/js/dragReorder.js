// Drag-to-reorder for the place cards. It starts only from the grip handle (touch-action: none there), so scrolling
// the list and the hourly strips is untouched. Cards slide out of the way while dragging, the list auto-scrolls near
// its edges, and the new order is committed on drop. The "my location" card is pinned and never moves.
let active = false;
export const isDragging = () => active;

export function initDrag({ list, onDrop, onEnd }) {
  list.addEventListener('contextmenu', (e) => { if (e.target.closest('.gp-grip')) e.preventDefault(); });
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.gp-grip');
    if (!grip || active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const card = grip.closest('.gp-card');
    const cards = Array.from(list.querySelectorAll('.gp-card[data-key]:not([data-pin])'));
    const from = cards.indexOf(card);
    if (from < 0 || cards.length < 2) return;
    e.preventDefault();
    start(list, grip, card, cards, from, e, onDrop, onEnd);
  });
}

function start(list, grip, card, cards, from, e, onDrop, onEnd) {
  active = true;
  const startScroll = list.scrollTop;
  const listRect = list.getBoundingClientRect();
  const geo = cards.map((c) => { const r = c.getBoundingClientRect(); return { mid: r.top + list.scrollTop + r.height / 2, h: r.height }; });
  const gap = parseFloat(getComputedStyle(card).marginBottom) || 0;
  const shift = geo[from].h + gap;
  const startY = e.clientY;
  let pointerY = startY, to = from, raf = 0;

  try { grip.setPointerCapture(e.pointerId); } catch (err) { /* capture is best effort */ }
  card.classList.add('dragging');
  cards.forEach((c) => { if (c !== card) c.classList.add('shifting'); });

  const layout = () => {
    const d = pointerY - startY + (list.scrollTop - startScroll);
    card.style.transform = `translateY(${d}px) scale(1.012)`;
    const center = geo[from].mid + d;
    let up = 0, down = 0;
    cards.forEach((c, j) => {
      if (j === from) return;
      let t = 0;
      if (j > from && center > geo[j].mid) { t = -shift; up++; }
      else if (j < from && center < geo[j].mid) { t = shift; down++; }
      c.style.transform = t ? `translateY(${t}px)` : '';
    });
    to = from + up - down;
  };
  const tick = () => {
    const top = listRect.top + 90, bottom = listRect.bottom - 110;
    let v = 0;
    if (pointerY < top) v = -Math.min(16, (top - pointerY) / 5);
    else if (pointerY > bottom) v = Math.min(16, (pointerY - bottom) / 5);
    if (v) { list.scrollTop += v; layout(); }
    raf = requestAnimationFrame(tick);
  };
  const onMove = (ev) => { pointerY = ev.clientY; layout(); };
  const finish = (commit) => {
    cancelAnimationFrame(raf);
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', onUp);
    grip.removeEventListener('pointercancel', onCancel);
    cards.forEach((c) => { c.classList.remove('dragging', 'shifting'); c.style.transform = ''; });
    active = false;
    if (commit && to !== from) onDrop(card.dataset.key, to);
    onEnd();
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onUp);
  grip.addEventListener('pointercancel', onCancel);
  layout();
  raf = requestAnimationFrame(tick);
}
