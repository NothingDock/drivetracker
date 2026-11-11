import { esc, md, dur, toast } from './util.js';

/** 旅タイトルと停車地点の名前を直す。空欄にすると自動の名前に戻る */
export async function renderEdit(el, id, app) {
  const seq = app.seq;
  const trip = await app.store.get('trip:' + id);
  if (seq !== app.seq) return;
  const back = `#/trip/${encodeURIComponent(id)}`;
  if (!trip) { app.go(back); return; }

  const offline = app.status === 'offline';
  el.innerHTML = `
    <header class="top">
      <a class="btn" href="${back}">← もどる</a>
      <h1>名前を直す</h1>
    </header>
    ${offline ? '<div class="banner">電波がないので保存できません。</div>' : ''}
    <form class="edit" id="form" autocomplete="off">
      <label class="field">
        <span class="lbl">旅のタイトル</span>
        <input name="tripTitle" value="${esc(trip.customTitle || '')}" placeholder="${esc(trip.autoTitle || trip.title)}" maxlength="80">
      </label>
      <h2>停車した場所</h2>
      <p class="hint">空欄のままなら、自動で付けた名前（薄い文字）になります。</p>
      ${trip.stops.map((s, i) => `
        <label class="field stop-field">
          <span class="lbl">${s.stay ? '<span class="tag">泊</span>' : ''}<span class="num">${md(s.arrive)} ${s.arrive.slice(11)}</span> ・ 約${dur(s.minutes)}${s.area ? ` ・ ${esc(s.area)}` : ''}</span>
          <input name="stop${i}" value="${esc(s.name || '')}" placeholder="${esc(s.autoName || '名前なし')}" maxlength="80">
        </label>`).join('')}
      <div class="actions">
        <button type="submit" class="btn primary" ${offline ? 'disabled' : ''}>保存する</button>
        <a class="btn" href="${back}">やめる</a>
      </div>
      <p class="hint">保存すると、もう一人のスマホにも反映されます。</p>
    </form>`;

  el.querySelector('#form').onsubmit = async e => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      const saved = await app.call('saveNames', {
        id,
        title: f.elements.tripTitle.value,
        stops: trip.stops.map((s, i) => ({ arrive: s.arrive, name: f.elements['stop' + i].value }))
      });
      if (saved.error) throw new Error(saved.message || saved.error);
      await app.store.set('trip:' + id, saved);
      const row = app.index.trips.find(t => t.id === id);
      if (row) { row.title = saved.title; await app.store.set('index', app.index); }
      toast('保存しました');
      app.go(back);
    } catch (err) {
      app.handleError(err);
      toast(app.status === 'offline' ? '電波がないので保存できませんでした' : `保存できませんでした：${err.message}`);
      btn.disabled = false; btn.textContent = '保存する';
    }
  };
}
