// Фича listview: вид «Список», экспорт и импорт CSV. Только локально.
(function () {
  "use strict";
  if (!window.PP) return;
  const PP = window.PP, esc = PP.esc;

  // ---------- стили ----------
  const css = `
.lv-root{display:flex;flex-direction:column;gap:12px;min-width:0}
.lv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lv-bar .lv-sp{flex:1}
.lv-grp{display:inline-flex;gap:4px}
.lv-grp .b.on{background:var(--ic-accent-soft,#EEF7D9);color:var(--ic-ink);border-color:var(--ic-accent,#8FC640)}
.lv-info{font-size:12px;color:var(--bx-mut,var(--ic-muted))}
.lv-wrap{position:relative;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);background:#fff;box-shadow:var(--sh1);overflow:auto;max-height:calc(100vh - 250px);min-height:120px}
.lv-t{border-collapse:separate;border-spacing:0;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
.lv-t th{position:sticky;top:0;z-index:2;background:var(--ic-hover);text-align:left;font-weight:600;font-size:11px;color:var(--bx-mut,var(--ic-muted));padding:10px 12px;border-bottom:1px solid var(--bx-line,#d5dde0);white-space:nowrap;cursor:pointer;user-select:none;transition:color .15s,background .15s}
.lv-t th:hover{color:var(--ic-ink);background:#eef1f4}
.lv-t th[aria-sort=ascending],.lv-t th[aria-sort=descending]{color:var(--bx-link,#4A7A12)}
.lv-t th.lv-ck{cursor:default;width:36px;padding:10px 4px 10px 14px}
.lv-t th.lv-ck:hover{background:var(--ic-hover)}
.lv-t th .lv-ar{display:inline-block;width:12px;margin-left:2px;color:var(--bx-link,#4A7A12)}
.lv-t th:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:-2px}
.lv-t td{padding:9px 12px;border-bottom:1px solid #e8edf0;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;transition:background .15s}
.lv-t td.lv-ck{padding:9px 4px 9px 14px;width:36px}
.lv-t td.lv-n,.lv-t th.lv-n{text-align:right}
.lv-t td.lv-id{color:var(--bx-mut,var(--ic-muted));font-size:11px}
.lv-t tr:last-child td{border-bottom:0}
.lv-t tbody tr:hover td{background:#f7f9fa}
.lv-t tbody tr.lv-sel td{background:var(--ic-accent-soft,#EEF7D9)}
.lv-t td.lv-title{min-width:220px;max-width:340px}
.lv-t .lv-open{display:block;border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--ic-ink);cursor:pointer;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .15s}
.lv-t .lv-open:hover{color:var(--bx-link,#4A7A12)}
.lv-t .lv-open:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:2px;border-radius:4px}
.lv-t input[type=checkbox]{width:15px;height:15px;cursor:pointer;margin:0;vertical-align:middle;-webkit-appearance:none;appearance:none;border:1.5px solid #b4bcb4;border-radius:4px;background:#fff center/12px no-repeat}
.lv-t input[type=checkbox]:checked{background-color:var(--ic-accent,#8FC640);border-color:var(--ic-accent,#8FC640);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2l2.4 2.4 4.6-5' fill='none' stroke='%231A1D1E' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
.lv-t input[type=checkbox]:indeterminate{background-color:var(--ic-accent,#8FC640);border-color:var(--ic-accent,#8FC640);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 6h6' stroke='%231A1D1E' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E")}
.lv-t .lv-dim{color:#b4bcc3}
.lv-t td.lv-sum{font-weight:600}
.lv-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:500;line-height:18px;color:var(--ic-ink);background:color-mix(in srgb,var(--c,#9aa4ab) 16%,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,#9aa4ab) 30%,#fff)}
.lv-chip i{flex:none;width:7px;height:7px;border-radius:50%;background:var(--c,#9aa4ab)}
.lv-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lv-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:44px 16px;text-align:center;color:var(--bx-mut,var(--ic-muted));font-size:12px}
.lv-empty svg{width:48px;height:48px;color:#b4bcc3;margin-bottom:4px}
.lv-empty b{font-size:13px;font-weight:600;color:var(--ic-ink)}
.lv-skel{display:flex;flex-direction:column;gap:0;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);background:#fff;overflow:hidden}
.lv-skel div{height:38px;border-bottom:1px solid #e8edf0;background:linear-gradient(90deg,var(--ic-hover) 25%,#e4e9ed 50%,var(--ic-hover) 75%);background-size:200% 100%;animation:lvsh 1.3s linear infinite}
.lv-skel div:first-child{background:var(--ic-hover);animation:none}
.lv-skel div:last-child{border-bottom:0}
@keyframes lvsh{from{background-position:200% 0}to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.lv-skel div{animation:none}}
.lv-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;font-size:12px;color:var(--bx-mut,var(--ic-muted));font-variant-numeric:tabular-nums}
.lv-foot b{color:var(--ic-ink);font-weight:600}
.lv-pg{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.lv-pop{position:absolute;z-index:20;width:min(360px,calc(100vw - 32px));max-height:min(480px,70vh);overflow:auto;background:#fff;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);box-shadow:var(--sh3);padding:10px}
.lv-pop h5{margin:8px 4px 4px;font-size:11px;color:var(--bx-mut,var(--ic-muted));font-weight:600}
.lv-pop input[type=text]{width:100%;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r-sm,6px);padding:7px 12px;font-size:12px;margin:2px 0 4px;transition:border-color .15s,box-shadow .15s}
.lv-pop input[type=text]:focus{border-color:var(--ic-accent,#8FC640);box-shadow:var(--focus)}
.lv-pop input[type=text]:focus-visible,.lv-imp select:focus-visible,.lv-imp input:focus-visible,.lv-root button:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:1px}
.lv-pi{display:flex;align-items:center;gap:6px;padding:4px;border-radius:var(--r-sm,6px);font-size:12px;transition:background .15s}
.lv-pi span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lv-pi .b{padding:2px 9px;font-size:11px}
.lv-pi:hover{background:var(--ic-hover)}
.lv-mini{padding:2px 9px!important;font-size:11px!important}
.lv-imp h3{margin-bottom:6px}
.lv-imp p{margin:6px 0;font-size:12px;color:var(--bx-mut,var(--ic-muted))}
.lv-map{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:6px 10px;align-items:center;margin:10px 0}
.lv-map div{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lv-pv{overflow:auto;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r-sm,6px);margin:8px 0}
.lv-pv table{border-collapse:collapse;font-size:11px;width:100%}
.lv-pv th,.lv-pv td{padding:6px 8px;border-bottom:1px solid #e8edf0;white-space:nowrap;text-align:left;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.lv-pv th{background:var(--ic-hover);color:var(--bx-mut,var(--ic-muted));font-size:11px;font-weight:600}
.lv-pv tr.lv-bad td{background:#fdf1f0}
.lv-err{color:var(--bx-red,#c8372d);font-size:12px}
.lv-warn{color:#8a5a00;font-size:12px}
.lv-errbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--bx-red,#c8372d);font-size:12px;background:#fdf1f0;border:1px solid #f3cfcb;border-radius:var(--r-sm,6px);padding:4px 4px 4px 10px}
.lv-ok{color:#5b7d00;font-weight:600}
.lv-list{font-size:12px;margin:6px 0 0;padding-left:16px;max-height:220px;overflow:auto}
.lv-row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.lv-chk{display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0}
.lv-chk input{width:auto!important}
@media(max-width:600px){.lv-wrap{max-height:calc(100vh - 300px)}.lv-pg{margin-left:0}.lv-t td{padding:8px 10px}}
`;
  const st = document.createElement("style");
  st.id = "lv-style";
  st.textContent = css;
  document.head.appendChild(st);

  // ---------- колонки ----------
  const BASE = [
    { k: "_id", l: "#", get: d => d.id, kind: "id" },
    { k: "_title", l: "Название", get: d => d.title, kind: "title" },
    { k: "_stage", l: "Стадия", get: d => d.stageName },
    { k: "_company", l: "Клиент", get: d => d.company },
    { k: "_who", l: "Ответственный", get: d => d.who },
    { k: "_month", l: "Месяц", get: d => d.month },
    { k: "_sum", l: "Сумма", get: d => d.sum, kind: "sum" },
    { k: "_created", l: "Создана", get: d => d.created, kind: "date" },
    { k: "_moved", l: "В стадии с", get: d => d.moved, kind: "date" },
  ];
  const EMPTY_SVG = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="9" width="36" height="30" rx="4"/><path d="M6 17h36M16 17v22M6 25h36M6 32h36"/></svg>';
  const stageColor = id => { const s = PP.B && (PP.B.stages || []).find(x => String(x.id) === String(id)); return s && /^#[0-9a-f]{3,8}$/i.test(s.color || "") ? s.color : "#9aa4ab"; };
  const BASEMAP = Object.fromEntries(BASE.map(c => [c.k, c]));
  const DEF_COLS = BASE.map(c => c.k);
  const S = { cfg: {}, schema: {}, rows: {}, page: {}, lastIdx: null, host: null, loading: {}, pop: null, err: {} };
  const CODE_RE = /^[A-Za-z0-9_]{1,80}$/;
  const validCol = k => typeof k === "string" && (!!BASEMAP[k] || (k.startsWith("f:") && CODE_RE.test(k.slice(2))));
  const MAX_IMPORT = 300;

  const ddmmyyyy = s => (/^\d{4}-\d{2}-\d{2}/.test(s || "") ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : s || "");
  function labelOf(k) {
    if (BASEMAP[k]) return BASEMAP[k].l;
    const code = k.slice(2);
    const sc = (S.schema[PP.cur] || {})[code];
    return sc ? sc.label : code;
  }
  function cfgOf(f) {
    const c = S.cfg[f] || {};
    const cc = Array.isArray(c.cols) ? c.cols.filter(validCol).slice(0, 40) : [];
    return { cols: cc.length ? cc : DEF_COLS.slice(), size: [50, 100, 200].includes(c.size) ? c.size : 50, sort: c.sort && validCol(c.sort.k) ? c.sort : { k: "", dir: "asc" } };
  }
  function saveCfg(f) {
    const c = cfgOf(f);
    S.cfg[f] = c;
    PP.api.post("/api/listview/config", { f, cols: c.cols, size: c.size, sort: c.sort }).then(r => { if (r && r.error) PP.toast(r.error); }).catch(() => {});
  }
  async function loadCfg(f) {
    if (S.cfg[f]) return;
    try {
      const r = await PP.api.get("/api/listview/config?f=" + encodeURIComponent(f));
      if (r && r.cfg) S.cfg[f] = r.cfg; else S.err[f] = (r && r.error) || "Не удалось загрузить настройки колонок";
    } catch (e) { S.err[f] = "Нет связи с панелью"; }
  }
  async function loadSchema(f) {
    if (S.schema[f]) return;
    try {
      const r = await PP.api.get("/api/schema?f=" + encodeURIComponent(f));
      if (!r || !r.fields) { S.err[f] = (r && r.error) || "Не удалось загрузить поля воронки"; return; }
      const m = {};
      r.fields.forEach(x => { if (x && CODE_RE.test(String(x.code))) m[x.code] = x; });
      S.schema[f] = m;
    } catch (e) { S.err[f] = "Нет связи с панелью"; }
  }

  // значения доп. полей: кэш на воронку и доску
  function extraCodes(c) { return c.cols.filter(k => k.startsWith("f:") && validCol(k)).map(k => k.slice(2)); }
  async function ensureRows(f, codes) {
    let rc = S.rows[f];
    if (!rc || rc.bid !== PP.B) rc = S.rows[f] = { bid: PP.B, codes: new Set(), data: {} };
    const miss = codes.filter(c => !rc.codes.has(c));
    if (!miss.length) return false;
    const key = f + "|" + (PP.B ? PP.B.id : "") + "|" + miss.join(",");
    if (S.loading[key]) return false;
    S.loading[key] = 1;
    try {
      const r = await PP.api.get("/api/listview/rows?f=" + encodeURIComponent(f) + "&cols=" + encodeURIComponent(miss.join(",")));
      if (r && r.rows && S.rows[f] === rc) {
        Object.keys(r.rows).forEach(id => { rc.data[id] = Object.assign(rc.data[id] || {}, r.rows[id]); });
        miss.forEach(c => rc.codes.add(c));
        S.err[f] = "";
        return true;
      }
      if (S.rows[f] === rc) S.err[f] = (r && r.error) || "Не удалось загрузить значения полей";
    } catch (e) { if (S.rows[f] === rc) S.err[f] = "Нет связи с панелью"; }
    finally { delete S.loading[key]; }
    return false;
  }

  function cellVal(col, d, f) {
    if (col.startsWith("f:")) {
      const rc = S.rows[f];
      const r = rc && rc.data[d.id];
      return r ? (r[col.slice(2)] || "") : "";
    }
    return BASEMAP[col].get(d);
  }
  function cellText(col, v) {
    if (col === "_sum") return PP.fmt(v || 0);
    if (col === "_created" || col === "_moved") return ddmmyyyy(v);
    if (col === "_month") return window.monLabel ? window.monLabel(v) : v;
    return v == null ? "" : String(v);
  }
  function sortKey(col, v) {
    if (col === "_sum") return [0, +v || 0];
    if (col === "_created" || col === "_moved") return v ? [1, String(v)] : [3, ""];
    if (v === "" || v == null) return [3, ""];
    const s = String(v);
    let m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    if (m) return [1, m[3] + m[2] + m[1]];
    m = /^(-?[\d\s]+(?:[.,]\d+)?)\s*₸$/.exec(s);
    if (m) return [0, parseFloat(m[1].replace(/\s/g, "").replace(",", "."))];
    if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return [0, parseFloat(s.replace(",", "."))];
    return [2, s.toLowerCase()];
  }
  const coll = new Intl.Collator("ru", { numeric: true });
  function compare(col, dir, a, b, f) {
    const ka = sortKey(col, cellVal(col, a, f)), kb = sortKey(col, cellVal(col, b, f));
    // пустые всегда внизу
    if (ka[0] === 3 || kb[0] === 3) return ka[0] === kb[0] ? 0 : ka[0] === 3 ? 1 : -1;
    let r;
    if (ka[0] !== kb[0]) r = ka[0] - kb[0];
    else if (typeof ka[1] === "number") r = ka[1] - kb[1];
    else r = coll.compare(ka[1], kb[1]);
    return dir === "desc" ? -r : r;
  }
  function viewRows(f) {
    const c = cfgOf(f);
    let list = PP.deals().filter(d => PP.match(d));
    if (c.sort.k && c.cols.includes(c.sort.k)) list = list.map((d, i) => [d, i]).sort((x, y) => compare(c.sort.k, c.sort.dir, x[0], y[0], f) || x[1] - y[1]).map(x => x[0]);
    return list;
  }

  // ---------- вид ----------
  function render(host) {
    closePop();         // поповер жил в старом DOM вида
    S.host = host;
    const f = PP.cur;
    S.err[f] = "";
    host.innerHTML = '<div class="lv-root" aria-busy="true"><div class="lv-skel" role="status" aria-label="Загрузка">' + "<div></div>".repeat(8) + "</div></div>";
    Promise.all([loadCfg(f), loadSchema(f)]).then(async () => {
      if (S.host !== host || PP.cur !== f || !host.isConnected) return;
      build(host, f);
      const ch = await ensureRows(f, extraCodes(cfgOf(f)));
      if ((ch || S.err[f]) && S.host === host && host.isConnected) draw(host, f);
    });
  }

  function build(host, f) {
    closePop();
    host.innerHTML = `<div class="lv-root">
      <div class="lv-bar">
        <button class="b" data-a="cols" aria-haspopup="true">Колонки</button>
        <button class="b" data-a="exp">Экспорт CSV</button>
        <button class="b" data-a="imp">Импорт CSV</button>
        <span class="lv-sp"></span>
        <span class="lv-info">На странице</span>
        <span class="lv-grp" role="group" aria-label="Размер страницы">${[50, 100, 200].map(n => `<button class="b" data-size="${n}">${n}</button>`).join("")}</span>
      </div>
      <div class="lv-wrap" tabindex="-1"><table class="lv-t"></table></div>
      <div class="lv-foot"></div></div>`;
    host.querySelector(".lv-bar").onclick = e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.size) { const c = cfgOf(f); c.size = +b.dataset.size; S.cfg[f] = c; S.page[f] = 0; saveCfg(f); draw(host, f); }
      else if (b.dataset.a === "cols") colsMenu(host, f, b);
      else if (b.dataset.a === "exp") exportCsv(f);
      else if (b.dataset.a === "imp") importDialog(f);
    };
    draw(host, f);
  }

  function draw(host, f) {
    const root = host.querySelector(".lv-root");
    if (!root || !root.querySelector(".lv-t")) return;
    const c = cfgOf(f), all = viewRows(f);
    const pages = Math.max(1, Math.ceil(all.length / c.size));
    let pg = Math.min(S.page[f] || 0, pages - 1);
    S.page[f] = pg;
    const rows = all.slice(pg * c.size, pg * c.size + c.size);
    root.querySelectorAll("[data-size]").forEach(b => b.classList.toggle("on", +b.dataset.size === c.size));
    const cols = c.cols.filter(validCol);
    const sk = c.sort.k;
    const allOn = rows.length && rows.every(d => PP.sel.has(d.id));
    const someOn = rows.some(d => PP.sel.has(d.id));
    const th = cols.map(k => `<th tabindex="0" data-k="${esc(k)}" class="${k === "_sum" ? "lv-n" : ""}" aria-sort="${sk === k ? (c.sort.dir === "desc" ? "descending" : "ascending") : "none"}" title="Сортировать">${esc(labelOf(k))}<span class="lv-ar">${sk === k ? (c.sort.dir === "desc" ? "↓" : "↑") : ""}</span></th>`).join("");
    let body;
    if (!all.length) {
      body = `<tbody><tr><td colspan="${cols.length + 1}"><div class="lv-empty">${EMPTY_SVG}<b>${PP.deals().length ? "Ничего не найдено" : "Пока пусто"}</b><span>${PP.deals().length ? "Нет карточек под текущие фильтры. Сбросьте фильтры или измените условия." : "В этой воронке пока нет карточек."}</span></div></td></tr></tbody>`;
    } else {
      body = "<tbody>" + rows.map(d => {
        const on = PP.sel.has(d.id);
        return `<tr data-id="${esc(d.id)}" class="${on ? "lv-sel" : ""}"><td class="lv-ck"><input type="checkbox" aria-label="Выбрать карточку ${esc(d.id)}" ${on ? "checked" : ""}></td>` + cols.map(k => {
          const v = cellVal(k, d, f), t = cellText(k, v);
          if (k === "_title") return `<td class="lv-title"><button class="lv-open" title="${esc(t)}">${esc(t) || "—"}</button></td>`;
          if (k === "_stage" && t) return `<td title="${esc(t)}"><span class="lv-chip" style="--c:${stageColor(d.stageId)}"><i></i><span>${esc(t)}</span></span></td>`;
          return `<td class="${k === "_sum" ? "lv-n lv-sum" : k === "_id" ? "lv-id" : ""}" title="${esc(t)}">${t ? esc(t) : '<span class="lv-dim">—</span>'}</td>`;
        }).join("") + "</tr>";
      }).join("") + "</tbody>";
    }
    const tbl = root.querySelector(".lv-t");
    tbl.innerHTML = `<thead><tr><th class="lv-ck"><input type="checkbox" aria-label="Выбрать все на странице" ${allOn ? "checked" : ""}></th>${th}</tr></thead>` + body;
    const hc = tbl.querySelector("thead input");
    if (hc) { hc.indeterminate = !allOn && someOn; if (S.hf) { S.hf = 0; hc.focus(); } }
    // события таблицы
    tbl.querySelector("thead").onclick = e => {
      if (e.target.closest("input")) { S.hf = 1; PP.sel.set(allOn ? PP.sel.list().filter(id => !rows.some(d => d.id === id)) : [...new Set([...PP.sel.list(), ...rows.map(d => d.id)])]); return; }
      const h = e.target.closest("th[data-k]");
      if (h) sortBy(host, f, h.dataset.k);
    };
    tbl.querySelector("thead").onkeydown = e => {
      const h = e.target.closest("th[data-k]");
      if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(host, f, h.dataset.k); }
    };
    const tb = tbl.querySelector("tbody");
    tb.onclick = e => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const id = tr.dataset.id;
      if (e.target.closest(".lv-open")) { if (typeof window.openCard === "function") window.openCard(f, id); return; }
      const cb = e.target.closest("input[type=checkbox]");
      if (!cb) return;
      const idx = rows.findIndex(d => d.id === id);
      if (e.shiftKey && S.lastIdx != null && S.lastIdx !== idx && S.lastIdx < rows.length) {
        const [a, b] = [Math.min(S.lastIdx, idx), Math.max(S.lastIdx, idx)];
        const ids = rows.slice(a, b + 1).map(d => d.id);
        PP.sel.set(cb.checked ? [...new Set([...PP.sel.list(), ...ids])] : PP.sel.list().filter(x => !ids.includes(x)));
      } else PP.sel.toggle(id, cb.checked);
      S.lastIdx = idx;
      const nc = tbl.querySelector(`tr[data-id="${CSS.escape(id)}"] input`); if (nc) nc.focus();
    };
    // итоги
    const sum = all.reduce((a, d) => a + (+d.sum || 0), 0);
    const selIn = all.filter(d => PP.sel.has(d.id));
    const selSum = selIn.reduce((a, d) => a + (+d.sum || 0), 0);
    const foot = root.querySelector(".lv-foot");
    foot.innerHTML = (S.err[f] ? `<span class="lv-errbar" role="alert">${esc(S.err[f])} <button class="b" data-retry="1">Повторить</button></span>` : "") + `<span>Карточек: <b>${all.length.toLocaleString("ru-RU")}</b></span><span>Сумма: <b>${esc(PP.fmt(sum))}</b></span>` +
      (selIn.length ? `<span>Выбрано: <b>${selIn.length}</b> на ${esc(PP.fmt(selSum))}</span>` : "") +
      `<span class="lv-pg"><button class="b" data-p="-1" ${pg <= 0 ? "disabled" : ""}>Назад</button><span>${pg + 1} / ${pages}</span><button class="b" data-p="1" ${pg >= pages - 1 ? "disabled" : ""}>Вперёд</button></span>`;
    foot.onclick = e => {
      const rb = e.target.closest("[data-retry]");
      if (rb) { S.err[f] = ""; delete S.schema[f]; if (!S.cfg[f]) delete S.cfg[f]; S.rows = {}; render(host); return; }
      const b = e.target.closest("[data-p]");
      if (b && !b.disabled) { S.page[f] = pg + +b.dataset.p; S.lastIdx = null; draw(host, f); root.querySelector(".lv-wrap").scrollTop = 0; }
    };
  }

  function sortBy(host, f, k) {
    const c = cfgOf(f);
    c.sort = c.sort.k === k ? (c.sort.dir === "asc" ? { k, dir: "desc" } : { k: "", dir: "asc" }) : { k, dir: "asc" };
    S.cfg[f] = c; S.page[f] = 0; saveCfg(f); draw(host, f);
    const h = host.querySelector(`th[data-k="${CSS.escape(k)}"]`);
    if (h) h.focus();
  }

  // обновление галочек без полной перерисовки
  PP.on("selection:changed", () => {
    const h = S.host;
    if (h && h.isConnected && PP.curView === "listview" && h.querySelector(".lv-t")) draw(h, PP.cur);
  });
  PP.on("board:loaded", () => { S.rows = {}; S.lastIdx = null; });
  PP.on("view:changed", () => closePop());

  // ---------- меню колонок ----------
  function closePop() { if (S.pop) { S.pop.remove(); S.pop = null; document.removeEventListener("mousedown", S.popOut, true); document.removeEventListener("keydown", S.popKey, true); } }
  function colsMenu(host, f, btn) {
    if (S.pop && !S.pop.isConnected) closePop();
    if (S.pop) { closePop(); return; }
    const pop = document.createElement("div");
    pop.className = "lv-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Колонки");
    const wrap = host.querySelector(".lv-bar");
    wrap.style.position = "relative";
    const paint = (q) => {
      const c = cfgOf(f), sch = S.schema[f] || {};
      const cur = c.cols.filter(validCol);
      const chosen = new Set(cur);
      const avail = [];
      BASE.forEach(b => { if (!chosen.has(b.k)) avail.push({ k: b.k, l: b.l }); });
      Object.values(sch).forEach(x => { if (!chosen.has("f:" + x.code)) avail.push({ k: "f:" + x.code, l: x.label }); });
      const ql = (q || "").trim().toLowerCase();
      const av = avail.filter(a => !ql || a.l.toLowerCase().includes(ql));
      pop.innerHTML = `<h5>Показаны (${cur.length})</h5>` + (cur.length ? cur.map((k, i) => `<div class="lv-pi"><span title="${esc(labelOf(k))}">${esc(labelOf(k))}</span><button class="b" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Выше">↑</button><button class="b" data-dn="${i}" ${i === cur.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button><button class="b" data-rm="${i}" ${cur.length === 1 ? "disabled" : ""}>Скрыть</button></div>`).join("") : '<div class="lv-empty">Нет колонок</div>') +
        `<h5>Добавить поле</h5><input type="text" placeholder="Найти поле" value="${esc(q || "")}" aria-label="Найти поле"><div class="lv-avail">` +
        (av.length ? av.slice(0, 60).map(a => `<div class="lv-pi"><span title="${esc(a.l)}">${esc(a.l)}</span><button class="b" data-add="${esc(a.k)}">Добавить</button></div>`).join("") + (av.length > 60 ? `<div class="lv-info" style="padding:4px">Ещё ${av.length - 60}: уточните поиск</div>` : "") : '<div class="lv-info" style="padding:4px">Ничего не найдено</div>') +
        `</div><div class="lv-row"><button class="b" data-def>По умолчанию</button><button class="b btn-create" data-done>Готово</button></div>`;
      const inp = pop.querySelector("input[type=text]");
      inp.oninput = () => { const pos = inp.value; paint(pos); const n = pop.querySelector("input[type=text]"); n.focus(); n.setSelectionRange(pos.length, pos.length); };
    };
    const apply = async (cols) => {
      const c = cfgOf(f);
      c.cols = cols;
      if (c.sort.k && !cols.includes(c.sort.k)) c.sort = { k: "", dir: "asc" };
      S.cfg[f] = c; saveCfg(f);
      draw(host, f);
      if (await ensureRows(f, extraCodes(c))) draw(host, f);
    };
    pop.onclick = e => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      const c = cfgOf(f), cols = c.cols.filter(validCol);
      const q = pop.querySelector("input[type=text]").value;
      if (b.dataset.up != null) { const i = +b.dataset.up; [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; }
      else if (b.dataset.dn != null) { const i = +b.dataset.dn; [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; }
      else if (b.dataset.rm != null) cols.splice(+b.dataset.rm, 1);
      else if (b.dataset.add) { if (cols.length >= 40) { PP.toast("Не больше 40 колонок"); return; } cols.push(b.dataset.add); }
      else if (b.hasAttribute("data-def")) { apply(DEF_COLS.slice()); paint(q); return; }
      else if (b.hasAttribute("data-done")) { closePop(); btn.focus(); return; }
      apply(cols); paint(q);
    };
    wrap.appendChild(pop);
    pop.style.top = btn.offsetTop + btn.offsetHeight + 6 + "px";
    pop.style.left = Math.max(0, Math.min(btn.offsetLeft, wrap.clientWidth - Math.min(360, wrap.clientWidth))) + "px";
    paint("");
    S.pop = pop;
    S.popOut = ev => { if (!pop.contains(ev.target) && ev.target !== btn) closePop(); };
    S.popKey = ev => { if (ev.key === "Escape") { closePop(); btn.focus(); } };
    document.addEventListener("mousedown", S.popOut, true);
    document.addEventListener("keydown", S.popKey, true);
  }

  // ---------- экспорт CSV ----------
  function csvCell(v, isText) {
    let s = v == null ? "" : String(v);
    if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;      // защита от формул в Excel
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv(f) {
    const c = cfgOf(f), cols = c.cols.filter(validCol);
    const rows = viewRows(f);
    if (!rows.length) { PP.toast("Нечего экспортировать: список пуст"); return; }
    const lines = [cols.map(k => csvCell(labelOf(k), true)).join(";")];
    rows.forEach(d => lines.push(cols.map(k => {
      const v = cellVal(k, d, f);
      if (k === "_sum") return csvCell(Math.round((+v || 0) * 100) / 100 + "");
      return csvCell(k === "_created" || k === "_moved" ? ddmmyyyy(v) : v, true);
    }).join(";")));
    const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const name = ((PP.B && PP.B.name) || "voronka").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    PP.toast("Экспортировано строк: " + rows.length);
  }

  // ---------- импорт CSV ----------
  function parseCsv(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    const cnt = ch => { let n = 0, q = false; for (const x of first) { if (x === '"') q = !q; else if (x === ch && !q) n++; } return n; };
    const cand = [";", ",", "\t"].map(d => [d, cnt(d)]).sort((a, b) => b[1] - a[1]);
    const delim = cand[0][1] ? cand[0][0] : ";";
    const rows = [];
    let row = [], cell = "", q = false, i = 0;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
    return { rows, delim, unclosed: q };
  }
  function decode(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { try { return new TextDecoder("windows-1251").decode(buf); } catch (e2) { return new TextDecoder("utf-8").decode(buf); } }
  }
  function cleanNum(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return { v: "", ok: true };
    let t = s.replace(/[^\d,.\-]/g, "");
    if (!/\d/.test(t)) return { v: s, ok: false };
    const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
    if (lc >= 0 && ld >= 0) t = lc > ld ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else t = t.replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? { v: String(n), ok: true } : { v: s, ok: false };
  }
  const SYN = { title: ["название", "title", "name", "наименование", "сделка"], sum: ["сумма", "amount", "sum", "opportunity", "стоимость"], stage: ["стадия", "stage", "этап"], who: ["ответственный", "responsible", "who", "менеджер"] };

  function importDialog(f) {
    const sch = S.schema[f] || {};
    const fieldOpts = Object.values(sch).map(x => `<option value="f:${esc(x.code)}">${esc(x.label)}</option>`).join("");
    let data = null, map = [], skipDups = true, busy = false;
    const mount = d => {
      const root = d.querySelector(".lv-imp") || d;
      const step1 = (msg) => {
        root.innerHTML = `<div class="lv-imp"><h3>Импорт CSV</h3>
          <p>Карточки создаются локально в воронке «${esc(PP.B ? PP.B.name : "")}». Первая строка — заголовки, разделитель «;» или «,», до 300 строк, файл до 2 МБ.</p>
          ${msg ? `<p class="lv-err" role="alert">${esc(msg)}</p>` : ""}
          <input type="file" accept=".csv,.txt,text/csv" hidden id="lv-file">
          <div class="lv-row"><button class="b btn-create" id="lv-pick">Выбрать файл</button><button class="b" id="lv-x">Закрыть</button></div></div>`;
        const inp = root.querySelector("#lv-file");
        root.querySelector("#lv-pick").onclick = () => inp.click();
        root.querySelector("#lv-x").onclick = () => PP.closeDrawer();
        inp.onchange = () => {
          const file = inp.files && inp.files[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) { step1("Файл больше 2 МБ."); return; }
          const rd = new FileReader();
          rd.onerror = () => step1("Не удалось прочитать файл.");
          rd.onload = () => {
            const p = parseCsv(decode(rd.result));
            if (p.rows.length < 2) { step1("В файле нет данных: нужна строка заголовков и хотя бы одна строка."); return; }
            if (p.unclosed) { step1("Файл повреждён: не закрыты кавычки."); return; }
            data = { name: file.name, head: p.rows[0].map(h => h.trim()), rows: p.rows.slice(1), delim: p.delim };
            const used = new Set();
            map = data.head.map(h => {
              const hl = h.toLowerCase();
              let t = "";
              for (const k of Object.keys(SYN)) if (SYN[k].includes(hl) && !used.has(k)) { t = k; break; }
              if (!t) { const m = Object.values(sch).find(x => x.label.trim().toLowerCase() === hl && !used.has("f:" + x.code)); if (m) t = "f:" + m.code; }
              if (t) used.add(t);
              return t;
            });
            step2();
          };
          rd.readAsArrayBuffer(file);
        };
        const pk = root.querySelector("#lv-pick"); if (pk) pk.focus();
      };
      const build = () => {
        const ti = map.indexOf("title"), si = map.indexOf("sum");
        return data.rows.map((r, i) => {
          const o = { n: i + 2, title: "", sum: "", stage: "", who: "", fields: {}, err: "" };
          map.forEach((t, c) => {
            const v = (r[c] || "").trim();
            if (!t) return;
            if (t === "sum") { const x = cleanNum(v); o.sum = x.v; if (!x.ok) o.err = "сумма не число"; }
            else if (t.startsWith("f:")) { if (v) o.fields[t.slice(2)] = v; }
            else o[t] = v;
          });
          if (ti < 0) o.err = "не сопоставлено название";
          else if (!o.title) o.err = "нет названия";
          return o;
        });
      };
      const step2 = () => {
        const rows = build(), good = rows.filter(r => !r.err), bad = rows.length - good.length;
        const tooMany = rows.length > MAX_IMPORT;
        const opt = sel => `<option value="" ${sel === "" ? "selected" : ""}>— не импортировать —</option><option value="title" ${sel === "title" ? "selected" : ""}>Название *</option><option value="sum" ${sel === "sum" ? "selected" : ""}>Сумма</option><option value="stage" ${sel === "stage" ? "selected" : ""}>Стадия (по названию)</option><option value="who" ${sel === "who" ? "selected" : ""}>Ответственный (по имени)</option>` + (fieldOpts ? `<optgroup label="Поля карточки">${fieldOpts.replace(`value="${esc(sel)}"`, `value="${esc(sel)}" selected`)}</optgroup>` : "");
        const stNames = new Set((PP.B ? PP.B.stages : []).map(x => x.name.trim().toLowerCase()));
        const stMiss = rows.filter(r => !r.err && r.stage && !stNames.has(r.stage.trim().toLowerCase())).length;
        const whoSet = rows.filter(r => !r.err && r.who).length;
        const used = map.map((t, i) => t ? i : -1).filter(i => i >= 0);
        const pvCols = used.slice(0, 6);
        root.innerHTML = `<div class="lv-imp"><h3>Импорт CSV</h3>
          <p>${esc(data.name)}: строк ${rows.length}, разделитель «${data.delim === "\t" ? "Tab" : esc(data.delim)}».</p>
          <div class="lv-map">${data.head.map((h, i) => `<div title="${esc(h)}">${esc(h) || "(без заголовка)"}</div><select data-c="${i}" aria-label="Поле для колонки ${esc(h)}">${opt(map[i])}</select>`).join("")}</div>
          <label class="lv-chk"><input type="checkbox" id="lv-dup" ${skipDups ? "checked" : ""}> Пропустить, если название и сумма уже есть</label>
          ${tooMany ? `<p class="lv-err" role="alert">В файле ${rows.length} строк, максимум 300. Разделите файл.</p>` : ""}
          ${stMiss ? `<p class="lv-warn" role="alert">У ${stMiss} строк стадия не найдена в воронке: карточки попадут в первую стадию.</p>` : ""}
          ${whoSet ? `<p class="lv-warn">Ответственный задаётся по точному имени пользователя; если имя не найдено, поле останется пустым.</p>` : ""}
          ${map.indexOf("title") < 0 ? '<p class="lv-err" role="alert">Сопоставьте колонку с названием.</p>' : ""}
          <p>Предпросмотр первых 10 строк. Ошибок: <b class="${bad ? "lv-err" : "lv-ok"}">${bad}</b> из ${rows.length}${bad ? " (такие строки будут пропущены)" : ""}.</p>
          <div class="lv-pv"><table><thead><tr><th>Строка</th>${pvCols.map(i => `<th>${esc(data.head[i])}</th>`).join("")}<th>Статус</th></tr></thead><tbody>${rows.slice(0, 10).map(r => `<tr class="${r.err ? "lv-bad" : ""}"><td>${r.n}</td>${pvCols.map(i => `<td>${esc(data.rows[r.n - 2][i] || "")}</td>`).join("")}<td>${r.err ? esc(r.err) : "ок"}</td></tr>`).join("")}</tbody></table></div>
          <div class="lv-row"><button class="b btn-create" id="lv-go" ${good.length && !tooMany ? "" : "disabled"}>Создать ${good.length} ${plural(good.length)}</button><button class="b" id="lv-back">Другой файл</button><button class="b" id="lv-x">Закрыть</button></div></div>`;
        root.querySelectorAll("select[data-c]").forEach(s => s.onchange = () => {
          const i = +s.dataset.c;
          if (s.value) map.forEach((t, k) => { if (t === s.value && k !== i) map[k] = ""; });
          map[i] = s.value; step2();
          const ns = root.querySelector(`select[data-c="${i}"]`); if (ns) ns.focus();
        });
        root.querySelector("#lv-dup").onchange = e => { skipDups = e.target.checked; };
        root.querySelector("#lv-back").onclick = () => step1("");
        root.querySelector("#lv-x").onclick = () => PP.closeDrawer();
        root.querySelector("#lv-go").onclick = async () => {
          if (busy) return;
          busy = true;
          const btn = root.querySelector("#lv-go"); btn.disabled = true; btn.textContent = "Создаём…";
          let res;
          try {
            res = await PP.api.post("/api/listview/import", { f, skip_dups: skipDups, rows: good.map(r => ({ n: r.n, title: r.title, sum: r.sum, stage: r.stage, who: r.who, fields: r.fields })) });
          } catch (e) { res = { error: "Нет связи с панелью" }; }
          busy = false;
          step3(res, rows.filter(r => r.err));
        };
        const go = root.querySelector("#lv-go"); if (go && !go.disabled) go.focus();
      };
      const step3 = (res, localBad) => {
        res = res || { error: "Нет ответа от панели" };
        const errs = (res.errors || []).concat(localBad.map(r => ({ row: r.n, error: r.err }))).sort((a, b) => a.row - b.row);
        const sk = res.skipped || [], wr = res.warnings || [];
        const li = (arr, fn) => arr.length ? `<ul class="lv-list">${arr.slice(0, 50).map(fn).join("")}${arr.length > 50 ? `<li>и ещё ${arr.length - 50}</li>` : ""}</ul>` : "";
        root.innerHTML = `<div class="lv-imp"><h3>Импорт завершён</h3>
          ${res.error ? `<p class="lv-err" role="alert">${esc(res.error)}</p><div class="lv-row"><button class="b" id="lv-retry">Повторить</button></div>` : `<p><span class="lv-ok">Создано: ${res.created || 0}</span>${sk.length ? ` · пропущено дублей: ${sk.length}` : ""}${errs.length ? ` · ошибок: ${errs.length}` : ""}</p>`}
          ${sk.length ? `<h4>Дубли</h4>${li(sk, x => `<li>строка ${x.row}: ${esc(x.reason)}</li>`)}` : ""}
          ${wr.length ? `<h4>Предупреждения</h4>${li(wr, x => `<li>строка ${x.row}: ${esc(x.warning)}</li>`)}` : ""}
          ${errs.length ? `<h4>Ошибки по строкам</h4>${li(errs, x => `<li>строка ${x.row}: ${esc(x.error)}</li>`)}` : ""}
          <div class="lv-row"><button class="b btn-create" id="lv-x">Закрыть</button></div></div>`;
        root.querySelector("#lv-x").onclick = () => PP.closeDrawer();
        const rt = root.querySelector("#lv-retry"); if (rt) rt.onclick = () => step2();
        root.querySelector("#lv-x").focus();
        if (res.created) PP.reload();
      };
      step1("");
    };
    PP.openDrawer('<div class="lv-imp"></div>', mount);
  }
  const plural = n => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? "карточку" : m >= 2 && m <= 4 && (h < 12 || h > 14) ? "карточки" : "карточек"; };

  PP.addView({ id: "listview", label: "Список", render });
  if (PP.B && PP.curView === "listview") render(document.getElementById("viewhost"));
})();
