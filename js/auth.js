// Googleでログイン（Google Identity Services）。ID トークンは1時間で切れるので、切れる前に自動で取り直す
export class NeedLogin extends Error {}

let token = null, exp = 0, who = null, inited = false;
const waiters = [], listeners = [];

export function config() {
  const c = Object.assign({ clientId: '', apiUrl: '' }, window.APP_CONFIG);
  // 手元の確認用：config.js が空なら、窓口テストページで保存した値を使う
  if ((!c.clientId || !c.apiUrl) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try {
      c.clientId = c.clientId || localStorage.getItem('clientId') || '';
      c.apiUrl = c.apiUrl || localStorage.getItem('apiUrl') || '';
    } catch {}
  }
  return c;
}

export const email = () => who;
export const onLogin = fn => listeners.push(fn);

function payload(t) {
  const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b))));
}

function accept(t) {
  const p = payload(t);
  token = t; exp = p.exp * 1000; who = p.email;
  try { sessionStorage.setItem('idToken', t); } catch {}
  waiters.splice(0).forEach(w => w.resolve(t));
  listeners.forEach(fn => fn(who));
}

try {
  const saved = sessionStorage.getItem('idToken');
  if (saved && payload(saved).exp * 1000 > Date.now() + 120000) {
    token = saved; exp = payload(saved).exp * 1000; who = payload(saved).email;
  }
} catch {}

function gis(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function wait() {
      if (window.google && google.accounts && google.accounts.id) {
        if (!inited) {
          google.accounts.id.initialize({
            client_id: config().clientId,
            callback: r => accept(r.credential),
            auto_select: true,
            use_fedcm_for_prompt: true,
            cancel_on_tap_outside: false
          });
          inited = true;
        }
        resolve(google.accounts.id);
      } else if (Date.now() - t0 > timeoutMs) {
        reject(new NeedLogin('Googleのログイン部品を読み込めませんでした'));
      } else {
        setTimeout(wait, 150);
      }
    })();
  });
}

/** 有効なトークンを返す。なければ前回のアカウントで自動ログインを試し、だめなら NeedLogin */
export async function getToken() {
  if (token && exp - Date.now() > 120000) return token;
  const id = await gis();
  return new Promise((resolve, reject) => {
    const w = { resolve, reject };
    waiters.push(w);
    id.prompt();
    setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) { waiters.splice(i, 1); reject(new NeedLogin()); }
    }, 7000);
  });
}

/** ログインボタンを置く */
export function renderButton(el) {
  gis().then(id => {
    el.innerHTML = '';
    id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ja' });
  }).catch(() => {
    el.textContent = 'ログインには電波が必要です';
  });
}

export function signOut() {
  token = null; exp = 0; who = null;
  try { sessionStorage.removeItem('idToken'); } catch {}
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
}
