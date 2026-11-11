import { esc, css, dayVar, DAYVARS, md, wk, range, dur, stopName } from './util.js';

export const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
export const TILE_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

export async function renderDetail(el, id, app) {
  const seq = app.seq;
  let trip = await app.store.get('trip:' + id);
  if (seq !== app.seq) return;
  if (trip) draw(el, trip, app);
  else el.innerHTML = `${backBar(app)}<p class="loading">読み込み中…</p>`;

  try {
    const fresh = await app.call('trip', { id });
    if (fresh.error) throw new Error(fresh.error === 'not_found' ? 'この旅は一覧から外れています' : fresh.error);
    await app.store.set('trip:' + id, fresh);
    app.saved.add(id);
    if (seq !== app.seq) return;
    if (!trip || JSON.stringify(fresh) !== JSON.stringify(trip)) {
      app.cleanup && app.cleanup();
      draw(el, fresh, app);
    }
  } catch (e) {
    if (seq !== app.seq) return;
    app.handleError(e);
    if (trip) {
      if (app.status === 'offline') el.querySelector('.badge.edit')?.classList.add('disabled');
      return;
    }
    const msg = app.status === 'offline'
      ? 'この旅はまだスマホに保存されていません。電波のある所で一度開くと、次からは電波がなくても見られます。'
      : app.status === 'login' ? 'ログインが切れました。一覧に戻ってログインしてください。'
      : `読み込めませんでした：${esc(e.message)}`;
    el.innerHTML = `${backBar(app)}<p class="empty">${msg}</p>`;
  }
}

const backBar = app => `<header class="top"><a class="btn" href="${app.backTo}">← もどる</a></header>`;

function draw(el, trip, app) {
  const days = trip.days;
  const stops = trip.stops;
  const offline = app.status === 'offline';

  el.innerHTML = `
    <div id="map">
      <div class="trip-head">
        <a class="badge back" href="${app.backTo}" aria-label="もどる">←</a>
        <div class="badge grow"><b>${esc(trip.title)}</b><span class="num">${range(trip.start, trip.end)}</span></div>
        <a class="badge edit${offline ? ' disabled' : ''}" href="#/trip/${encodeURIComponent(trip.id)}/edit">名前を直す</a>
      </div>
    </div>
    <div class="sheet">
      <section class="stats" aria-label="旅のまとめ">
        <div class="stat"><div class="v">${Math.round(trip.km).toLocaleString()}<small>km</small></div><div class="k">走行距離</div></div>
        <div class="stat"><div class="v">${days.length}<small>日</small></div><div class="k">日数</div></div>
        <div class="stat"><div class="v">${trip.nights}<small>泊</small></div><div class="k">車中泊</div></div>
        <div class="stat"><div class="v">${(trip.maxEle ?? 0).toLocaleString()}<small>m</small></div><div class="k">最高標高</div></div>
      </section>
      <section>
        <h2>日ごとに見る</h2>
        <div class="chips" id="chips" role="group" aria-label="表示する日"></div>
      </section>
      <section><div class="days" id="days"></div></section>
      <section>
        <h2>標高の変化</h2>
        <div class="profile" id="profile"></div>
      </section>
      <section>
        <h2>停車した場所</h2>
        <div class="stops" id="stops"></div>
      </section>
      <p class="foot">地図：${TILE_ATTR}　地名：国土地理院、© OpenStreetMap contributors</p>
    </div>`;

  // 地図
  const map = L.map('map', { preferCanvas: true, zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
  map.zoomControl.setPosition('bottomright');
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18, minZoom: 5, crossOrigin: 'anonymous' }).addTo(map);
  app.cleanup = () => map.remove();

  const dayLayers = days.map((d, i) => {
    const g = L.layerGroup();
    const col = css(DAYVARS[i % 4]);
    d.lines.forEach(l => {
      if (l.length > 1) {
        L.polyline(l, { color: css('--surface'), weight: 7, opacity: .9, interactive: false, under: true }).addTo(g);
        L.polyline(l, { color: col, weight: 4, opacity: 1, interactive: false }).addTo(g);
      }
    });
    return g.addTo(map);
  });

  const stopLayer = L.layerGroup().addTo(map);
  const stopMarkers = stops.map(s => {
    const col = css(DAYVARS[s.day % 4]);
    const mk = s.stay
      ? L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="stay-pin">泊</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) })
      : L.circleMarker([s.lat, s.lon], { radius: 5, color: col, weight: 2.5, fillColor: css('--surface'), fillOpacity: 1 });
    mk.bindPopup(`<div class="pop-t">${esc(stopName(s))}</div><div class="pop-s">${s.stay ? '車中泊' : '停車'} 約${dur(s.minutes)}<br>${md(s.arrive)} ${s.arrive.slice(11)} 着${s.ele != null ? ` ・ 標高${s.ele}m` : ''}</div>`);
    return mk.addTo(stopLayer);
  });

  const allBounds = L.latLngBounds(days.flatMap(d => d.lines.flat()));
  const fit = b => map.fitBounds(b, { padding: [30, 30], paddingTopLeft: [30, 76] });
  fit(allBounds);

  // 日の切り替え
  const chips = el.querySelector('#chips');
  function select(i) {
    [...chips.children].forEach((c, j) => c.setAttribute('aria-pressed', String(j - 1 === i)));
    dayLayers.forEach((g, j) => g.eachLayer(l => {
      const on = i < 0 || i === j, under = l.options.under;
      l.setStyle({ opacity: on ? (under ? .9 : 1) : (under ? 0 : .22) });
    }));
    fit(i < 0 ? allBounds : L.latLngBounds(days[i].lines.flat()));
  }
  const chip = (label, i, col) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button';
    if (col) b.style.setProperty('--c', col);
    b.innerHTML = (col ? '<span class="dot"></span>' : '') + label;
    b.onclick = () => select(i);
    chips.appendChild(b);
  };
  chip('全体', -1, null);
  days.forEach((d, i) => chip(d.label, i, dayVar(i)));
  chips.firstChild.setAttribute('aria-pressed', 'true');

  // 日ごとの一覧
  el.querySelector('#days').innerHTML = days.map((d, i) => {
    const first = d.dates[0], last = d.dates[d.dates.length - 1];
    const lbl = d.dates.length > 1 ? `${md(first)}夜 – ${md(last)}(${wk(last)})` : `${md(first)}(${wk(first)})`;
    return `<div class="day" style="--c:${dayVar(i)}"><span class="bar"></span><div><div class="t">${esc(d.label)} <span class="s">${lbl}</span></div><div class="s num">${d.start} → ${d.end}${d.maxEle != null ? ` ・ 最高 ${d.maxEle}m` : ''}</div></div><div class="km">${d.km.toFixed(0)}<small> km</small></div></div>`;
  }).join('');

  // 停車した場所
  const sl = el.querySelector('#stops');
  stops.forEach((s, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stop' + (s.stay ? ' stay' : '');
    b.style.setProperty('--c', dayVar(s.day));
    const sub = [s.area, `約${dur(s.minutes)}${s.stay ? '' : ' 停車'}`].filter(Boolean).join(' ・ ');
    b.innerHTML = `<span class="ic"></span><div><div class="t">${s.stay ? '<span class="tag">泊</span>' : ''}${esc(stopName(s))}</div><div class="s">${esc(sub)}</div></div><div class="when num">${md(s.arrive)}<br>${s.arrive.slice(11)}</div>`;
    b.onclick = () => {
      document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
      map.flyTo([s.lat, s.lon], 14, { duration: .8 });
      setTimeout(() => stopMarkers[k].openPopup(), 850);
    };
    sl.appendChild(b);
  });
  if (!stops.length) sl.innerHTML = '<p class="s">10分以上の停車はありませんでした</p>';

  el.querySelector('#profile').innerHTML = profileSvg(trip);
}

function profileSvg(trip) {
  const P = trip.profile;
  if (!P || P.length < 2) return '<p class="s">標高の記録がありません</p>';
  const W = 700, H = 170, l = 40, r = 10, t = 10, b = 24;
  const maxX = P[P.length - 1][0] || 1;
  const maxY = Math.max(200, Math.ceil(Math.max(...P.map(p => p[1])) / 200) * 200);
  const x = v => l + (W - l - r) * v / maxX, y = v => t + (H - t - b) * (1 - Math.max(0, v) / maxY);
  const pts = P.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  let g = '';
  for (let v = 0; v <= maxY; v += 200) g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${l - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  const step = maxX > 1000 ? 250 : maxX > 300 ? 100 : maxX > 60 ? 20 : 5;
  for (let v = 0; v <= maxX - step * .4; v += step) g += `<text x="${x(v)}" y="${H - 6}" text-anchor="middle">${v}</text>`;
  g += `<text x="${W - r}" y="${H - 6}" text-anchor="end">km</text>`;
  let acc = 0;
  trip.days.forEach((d, i) => { const x0 = x(acc); acc += d.km; g += `<rect x="${x0}" y="${t}" width="${Math.max(0, x(Math.min(acc, maxX)) - x0)}" height="3" fill="${dayVar(i)}"/>`; });
  const area = `${x(0)},${y(0)} ${pts} ${x(maxX)},${y(0)}`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="走行距離ごとの標高"><polygon points="${area}" fill="var(--accent)" fill-opacity=".14"/>${g}<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6"/></svg>`;
}
