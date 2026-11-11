import { css } from './util.js';
import { TILE_URL, TILE_ATTR } from './detail.js';
import { tripCards } from './list.js';

/** これまでの旅の軌跡をすべて1枚の地図に重ね、走行距離の合計と旅のリストを出す */
export async function renderAll(el, app) {
  const seq = app.seq;
  const trips = app.index.trips || [];
  const totalKm = trips.reduce((a, t) => a + t.km, 0);

  el.innerHTML = `
    <div id="map">
      <div class="trip-head">
        <a class="badge back" href="#/" aria-label="一覧に戻る">←</a>
        <div class="badge grow"><b>すべての軌跡</b><span class="num" id="allStatus"></span></div>
      </div>
    </div>
    <div class="sheet">
      <section class="stats" aria-label="合計">
        <div class="stat"><div class="v">${Math.round(totalKm).toLocaleString()}<small>km</small></div><div class="k">走行距離の合計</div></div>
      </section>
      <section>
        <h2>旅の一覧</h2>
        <div class="cards" id="allTrips">${tripCards(trips, app)}</div>
      </section>
      <p class="foot">地図：${TILE_ATTR}</p>
    </div>`;

  const map = L.map('map', { preferCanvas: true, zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
  map.zoomControl.setPosition('bottomright');
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18, minZoom: 4, crossOrigin: 'anonymous' }).addTo(map);
  app.cleanup = () => map.remove();

  const statusEl = el.querySelector('#allStatus');
  const fit = b => map.fitBounds(b, { padding: [30, 30], paddingTopLeft: [30, 76] });

  // まずは一覧の小さな軌跡で範囲を合わせる（すぐ出せる）
  const rough = trips.flatMap(t => t.thumb || []);
  if (rough.length) fit(L.latLngBounds(rough));
  else map.setView([36.5, 138], 5);

  const lineColor = css('--accent'), casing = css('--surface');
  let drawn = 0, missing = 0;
  const status = (loading) => {
    statusEl.textContent = loading
      ? `読み込み中 ${drawn}/${trips.length}`
      : missing ? `${trips.length}件の旅（${missing}件は電波のある所で表示）` : `${trips.length}件の旅`;
  };
  const draw = trip => {
    trip.days.forEach(d => d.lines.forEach(l => {
      if (l.length < 2) return;
      L.polyline(l, { color: casing, weight: 5, opacity: .8, interactive: false }).addTo(map);
      L.polyline(l, { color: lineColor, weight: 3, opacity: .9, interactive: false }).addTo(map);
    }));
    drawn++;
  };

  // スマホに保存済みの旅から描き、残りを窓口から取ってくる（取った旅は保存するので、次からは電波なしでも出る）
  const need = [];
  for (const t of trips) {
    const saved = await app.store.get('trip:' + t.id);
    if (seq !== app.seq) return;
    if (saved) draw(saved); else need.push(t);
  }
  status(need.length > 0);

  if (app.status === 'offline') {
    missing = need.length;
  } else {
    let next = 0;
    const worker = async () => {
      while (next < need.length && seq === app.seq) {
        const t = need[next++];
        try {
          const trip = await app.call('trip', { id: t.id });
          if (trip.error) throw new Error(trip.error);
          await app.store.set('trip:' + t.id, trip);
          app.saved.add(t.id);
          if (seq !== app.seq) return;
          draw(trip);
        } catch {
          missing++;
        }
        status(true);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }
  if (seq !== app.seq) return;
  status(false);
  // 取ってきた旅に「保存済」を付け直す
  el.querySelector('#allTrips').innerHTML = tripCards(trips, app);
}
