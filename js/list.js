import { esc, range, year, toast } from './util.js';

/** 一覧カードの小さな軌跡（SVG）。tracks は軌跡の配列。1本だけなら出発地点に印を付ける */
function thumb(tracks) {
  tracks = tracks.filter(t => t && t.length >= 2);
  if (!tracks.length) return '';
  const W = 88, H = 66, pad = 5;
  const all = tracks.flat();
  const k = Math.cos(all[0][0] * Math.PI / 180);
  const xs = all.map(p => p[1] * k), ys = all.map(p => -p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const px = p => [(ox + (p[1] * k - x0) * s).toFixed(1), (oy + (-p[0] - y0) * s).toFixed(1)];
  const d = tracks.map(t => t.map((p, i) => `${i ? 'L' : 'M'}${px(p).join(' ')}`).join('')).join('');
  const start = tracks.length === 1 ? `<circle cx="${px(tracks[0][0])[0]}" cy="${px(tracks[0][0])[1]}" r="3" fill="var(--d1)"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${start}</svg>`;
}

function banner(app) {
  if (app.status === 'offline') return '<div class="banner">電波がありません。スマホに保存済みの旅だけ見られます。</div>';
  if (app.status === 'login') return '<div class="banner">ログインすると最新の状態になります。<div id="signin" class="signin"></div></div>';
  if (app.status === 'error') return `<div class="banner warn">最新の状態を読み込めませんでした：${esc(app.message)}</div>`;
  return '';
}

/** 旅のカードを年ごとの見出しつきで並べる（一覧と「すべての軌跡」で共通） */
export function tripCards(trips, app) {
  const offline = app.status === 'offline';
  let lastYear = null;
  return trips.map(t => {
    const y = year(t.start);
    const head = y !== lastYear ? `<h2 class="year">${y}年</h2>` : '';
    lastYear = y;
    const saved = app.saved.has(t.id);
    const dim = offline && !saved;
    return `${head}
      <a class="card${dim ? ' dim' : ''}" href="#/trip/${encodeURIComponent(t.id)}">
        <div class="thumb">${thumb([t.thumb])}</div>
        <div class="card-body">
          <div class="card-title">${esc(t.title)}</div>
          <div class="card-sub num">${range(t.start, t.end)}</div>
          <div class="card-stats num"><b>${Math.round(t.km).toLocaleString()}</b>km ・ ${t.days}日${t.nights ? ` ・ 車中泊${t.nights}` : ''}${t.complete === false ? ' ・ <span class="muted">地名を調べ中</span>' : ''}</div>
        </div>
        ${saved ? '<span class="saved" title="スマホに保存済み">保存済</span>' : ''}
      </a>`;
  }).join('');
}

export function renderList(el, app) {
  const trips = app.index.trips || [];
  const offline = app.status === 'offline';
  const cards = tripCards(trips, app);

  const totalKm = trips.reduce((a, t) => a + t.km, 0);
  const allCard = trips.length ? `
      <a class="card all-card" href="#/all">
        <div class="thumb">${thumb(trips.map(t => t.thumb))}</div>
        <div class="card-body">
          <div class="card-title">すべての軌跡</div>
          <div class="card-stats num">合計 <b>${Math.round(totalKm).toLocaleString()}</b>km</div>
        </div>
      </a>` : '';

  el.innerHTML = `
    <header class="top">
      <h1>DriveTracker</h1>
      <button type="button" class="btn" id="importNow" ${offline ? 'disabled' : ''}>今すぐ取り込む</button>
    </header>
    ${banner(app)}
    <main class="list">
      ${allCard}
      ${cards || '<p class="empty">まだ旅がありません。GPXフォルダにGPXを置くと、1時間以内にここに並びます。</p>'}
    </main>
    <footer class="foot list-foot">
      ${app.installPrompt ? '<button type="button" class="btn" id="install">ホーム画面に追加</button>' : ''}
      ${app.email ? `<div>ログイン中：${esc(app.email)} ・ <button type="button" class="link" id="logout">ログアウト</button></div>` : ''}
      ${app.isMock ? '<div class="warn">手元の確認用データで表示しています</div>' : ''}
    </footer>`;

  const signin = el.querySelector('#signin');
  if (signin) app.auth.renderButton(signin);

  el.querySelector('#importNow').onclick = async e => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = '取り込み中…';
    try {
      const r = await app.call('importNow');
      if (r.busy) toast('ほかの取り込みが動いています。少し待ってからもう一度どうぞ');
      else toast(r.added.length || r.updated.length
        ? `追加${r.added.length}件・更新${r.updated.length}件${r.pending ? '（続きは1分後）' : ''}`
        : '新しいGPXはありませんでした');
      await app.refreshList();
    } catch (err) {
      app.handleError(err);
      toast('取り込めませんでした');
      app.route();
    }
  };
  const install = el.querySelector('#install');
  if (install) install.onclick = () => app.install();
  const logout = el.querySelector('#logout');
  if (logout) logout.onclick = () => {
    if (confirm('ログアウトします。スマホに保存した旅も消えます（Driveのデータは消えません）。')) app.logout();
  };
}
