export const DAYVARS = ['--d1', '--d2', '--d3', '--d4'];
export const dayVar = i => `var(${DAYVARS[i % DAYVARS.length]})`;
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** "2026-09-19" → "9/19" */
export const md = s => { const [, m, d] = s.slice(0, 10).split('-'); return `${+m}/${+d}`; };
export const wk = s => '日月火水木金土'[new Date(s.slice(0, 10) + 'T12:00:00').getDay()];
export const mdw = s => `${md(s)}(${wk(s)})`;
export const range = (a, b) => a.slice(0, 10) === b.slice(0, 10) ? mdw(a) : `${mdw(a)} – ${mdw(b)}`;
export const year = s => s.slice(0, 4);

export const dur = min => {
  const h = Math.floor(min / 60), m = min % 60;
  return (h ? `${h}時間` : '') + (m || !h ? `${m}分` : '');
};

export const stopName = s => s.name || s.autoName || `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
