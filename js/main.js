import * as store from './store.js';
import * as auth from './auth.js';
import { call, Forbidden, NeedLogin, Offline, isMock } from './api.js';
import { renderList } from './list.js';
import { renderDetail } from './detail.js';
import { renderEdit } from './edit.js';
import { renderAll } from './all.js';
import { esc, toast } from './util.js';

const view = document.getElementById('view');

// 画面どうしで共有する状態と操作
const app = {
  index: null,            // 旅の一覧（スマホに保存したもの、または最新）
  status: 'loading',      // loading | ok | offline | login | forbidden | error
  message: '',
  email: null,
  saved: new Set(),       // スマホに保存済みの旅ID
  installPrompt: null,
  seq: 0,                 // 画面を切り替えるたびに増える。古い描画を捨てるため
  backTo: '#/',           // 旅の詳細の「←」で戻る先（一覧か「すべての軌跡」）
  cleanup: null,
  isMock,
  call,
  store,
  auth,
  route,
  refreshList,
  handleError,
  go: hash => { location.hash = hash; },
  async logout() {
    auth.signOut();
    await store.clear();
    app.index = null; app.saved = new Set(); app.email = null; app.status = 'login';
    route();
  },
  async install() {
    if (!app.installPrompt) return;
    app.installPrompt.prompt();
    await app.installPrompt.userChoice;
    app.installPrompt = null;
    route();
  }
};

function handleError(e) {
  if (e instanceof Forbidden) {
    app.status = 'forbidden';
    store.clear();
    app.index = null; app.saved = new Set();
  } else if (e instanceof Offline || !navigator.onLine) {
    app.status = 'offline';
  } else if (e instanceof NeedLogin) {
    app.status = 'login';
  } else {
    app.status = 'error';
    app.message = e.message;
  }
}

async function refreshList() {
  try {
    const index = await call('list');
    app.index = index;
    app.status = 'ok';
    await store.set('index', index);
    app.email = auth.email() || app.email;
    if (app.email) store.set('email', app.email);
  } catch (e) {
    handleError(e);
  }
  app.saved = new Set((await store.keys()).filter(k => k.startsWith('trip:')).map(k => k.slice(5)));
  const r = parseRoute();
  if (r.name === 'list' || !app.index || app.status === 'forbidden') route();
}

function parseRoute() {
  if (location.hash === '#/all') return { name: 'all' };
  const m = location.hash.match(/^#\/trip\/([^/]+)(\/edit)?$/);
  if (m) return { name: m[2] ? 'edit' : 'detail', id: decodeURIComponent(m[1]) };
  return { name: 'list' };
}

function route() {
  app.seq++;
  if (app.cleanup) { app.cleanup(); app.cleanup = null; }
  window.scrollTo(0, 0);

  if (app.status === 'forbidden') return renderGate('forbidden');
  if (!app.index) {
    if (app.status === 'loading') { view.innerHTML = '<p class="loading">読み込み中…</p>'; return; }
    return renderGate(app.status);
  }
  const r = parseRoute();
  if (r.name === 'list' || r.name === 'all') app.backTo = r.name === 'all' ? '#/all' : '#/';
  if (r.name === 'detail') return renderDetail(view, r.id, app);
  if (r.name === 'edit') return renderEdit(view, r.id, app);
  if (r.name === 'all') return renderAll(view, app);
  return renderList(view, app);
}

/** 一覧がまだ1つも保存されていないときの入口（ログイン／許可外／オフライン） */
function renderGate(kind) {
  const texts = {
    login: ['旅の記録を見るには、Googleでログインしてください。', true],
    forbidden: ['このアカウントでは見られません。登録した二人のGoogleアカウントでログインしてください。', true],
    offline: ['電波がありません。一度でも開いた旅は、電波のない所でも見られます。', false],
    error: [`うまく読み込めませんでした：${esc(app.message)}`, true]
  };
  const [text, showButton] = texts[kind] || texts.login;
  view.innerHTML = `
    <div class="gate">
      <img src="icons/icon-192.png" alt="" width="72" height="72">
      <h1>DriveTracker</h1>
      <p class="${kind === 'forbidden' ? 'warn' : ''}">${text}</p>
      ${showButton ? '<div id="signin" class="signin"></div>' : '<button type="button" class="btn" id="retry">もう一度試す</button>'}
    </div>`;
  if (showButton) {
    if (kind === 'forbidden') auth.signOut();
    auth.renderButton(document.getElementById('signin'));
  } else {
    document.getElementById('retry').onclick = () => { app.status = 'loading'; route(); refreshList(); };
  }
}

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    app.installPrompt = e;
    if (parseRoute().name === 'list') route();
  });
  window.addEventListener('appinstalled', () => toast('ホーム画面に追加しました'));
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => refreshList());
  window.addEventListener('offline', () => { app.status = 'offline'; if (parseRoute().name === 'list') route(); });
  auth.onLogin(email => {
    app.email = email;
    if (app.status !== 'ok') { app.status = 'loading'; refreshList(); }
  });

  app.index = (await store.get('index')) || null;
  app.email = (await store.get('email')) || null;
  app.saved = new Set((await store.keys()).filter(k => k.startsWith('trip:')).map(k => k.slice(5)));
  if (app.index) app.status = navigator.onLine ? 'ok' : 'offline';
  route();
  refreshList();
}

boot();
