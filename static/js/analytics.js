/* Фича analytics: вид «Аналитика» (воронка, возраст в стадии, ответственные, месяцы, клиенты) + вкладка «Дубли». Всё считается на клиенте из PP.deals(). */
(function () {
  const esc = PP.esc, fmt = PP.fmt;
  const AGE = [
    { k: "0–3", lo: 0, hi: 3, c: "#7fc8a9" }, { k: "4–7", lo: 4, hi: 7, c: "#b9dc9a" },
    { k: "8–14", lo: 8, hi: 14, c: "#f1d37c" }, { k: "15–30", lo: 15, hi: 30, c: "#eba56d" },
    { k: "30+", lo: 31, hi: 1e9, c: "#d8786a" }];
  const RULES = [["title", "Одинаковое название"], ["company_sum", "Компания + сумма"], ["title_company", "Название + клиент"]];
  const S = { tab: "an", sort: {}, rules: ["title"], dupes: null, dupKey: "", dupBusy: false, confirm: null, token: 0, D: null };

  const css = document.createElement("style");
  css.textContent = `
.an{max-width:1180px;display:flex;flex-direction:column;gap:12px;font-variant-numeric:tabular-nums}
.an-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.an-tabs .b.on,.an-rules .b.on{background:var(--ic-accent-soft,#EEF7D9);color:var(--ic-ink);border-color:var(--ic-accent,#8FC640)}
.an .b{min-height:30px}
.an-note{color:var(--bx-mut,var(--ic-muted));font-size:12px;line-height:1.45}
.an-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}@media(max-width:760px){.an-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
.an-tile{position:relative;background:#fff;border:1px solid var(--ic-line,#E7E9E2);border-radius:var(--r,8px);box-shadow:var(--sh1);padding:12px 14px 12px 16px;min-width:0;overflow:hidden;display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:start;align-content:start;transition:box-shadow .18s var(--ease,ease),transform .18s var(--ease,ease)}
.an-tile:hover{box-shadow:var(--sh2);transform:translateY(-1px)}
.an-tile:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tc,var(--ic-accent,#8FC640))}
.an-tile b{grid-column:1/-1;font-size:20px;line-height:1.2;font-weight:600;letter-spacing:0;white-space:nowrap;min-width:0;color:#1a1d1e}
.an-tile span{grid-column:1;font-size:11px;color:var(--bx-mut,var(--ic-muted));line-height:1.35}
.an-tile svg{grid-column:2;grid-row:2;align-self:end;width:22px;height:22px;color:var(--tc,var(--ic-accent,#8FC640));opacity:.9}
.an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px}
.an-card{background:#fff;border:1px solid var(--ic-line,#E7E9E2);border-radius:var(--r,8px);box-shadow:var(--sh1);padding:14px 16px;min-width:0}
.an-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.an-h h3{margin:0;font-size:13px;font-weight:600;flex:1;min-width:140px;color:#1a1d1e}
.an-empty{display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--bx-mut,var(--ic-muted));font-size:12px;padding:22px 0;text-align:center}
.an-empty svg{width:40px;height:40px;color:#b8c2c8}
.an-fr{margin-bottom:10px}
.an-fr:last-child{margin-bottom:0}
.an-fr-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:600}
.an-fr-top>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:7px}
.an-dot{flex:0 0 auto;width:9px;height:9px;border-radius:3px;background:var(--sc,#9dcf00)}
.an-tag{font-size:10px;font-weight:600;border-radius:10px;padding:1px 8px;background:#eef1f3;color:var(--bx-mut,var(--ic-muted))}
.an-trk{height:16px;background:#eef1f3;border-radius:6px;overflow:hidden;margin:4px 0}
.an .an-trk i{display:block;height:100%;border-radius:6px;background:var(--sc,#9dcf00);transition:filter .15s}
.an .an-trk:hover i{filter:brightness(1.07)}
.an .an-fin-no i{opacity:.55}
.an-meta{font-size:11px;color:var(--bx-mut,var(--ic-muted))}
.an-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--bx-mut,var(--ic-muted));margin-bottom:10px}
.an-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.an-stk{display:flex;height:16px;border-radius:6px;overflow:hidden;background:#eef1f3;margin-top:4px;gap:1px}
.an-stk i{display:block;height:100%;min-width:3px}
.an-tw{overflow:auto;max-height:420px;border:1px solid #e6ebee;border-radius:var(--r-sm,6px)}
.an table{border-collapse:separate;border-spacing:0;width:100%;font-size:12px}
.an th,.an td{padding:8px 10px;border-bottom:1px solid #edf0f2;text-align:left;vertical-align:middle}
.an tr:last-child td{border-bottom:0}
.an tbody tr:hover td,.an table tr:hover td{background:var(--ic-hover,#F8F9F4)}
.an td.n,.an th.n{text-align:right;white-space:nowrap}
.an th{position:sticky;top:0;z-index:1;background:var(--ic-hover);font-weight:600;color:var(--bx-mut,var(--ic-muted));white-space:nowrap;font-size:11px;border-bottom:1px solid #e1e7ea}
.an th button{border:0;background:none;font:inherit;font-weight:600;color:inherit;cursor:pointer;padding:2px 6px;margin:-2px -6px;border-radius:var(--r-sm,6px);transition:background .15s}
.an th button:hover{background:#e8edf0}.an th button.on{color:#1A1D1E}
.an .an-mb{display:inline-block;height:8px;border-radius:4px;background:linear-gradient(90deg,#8FC640,#B6DB7C);vertical-align:middle;min-width:3px;margin-right:4px}
.an-ellip{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.an-svg{display:block;width:100%;height:auto}
.an-svgw{overflow-x:auto}
.an-svg rect[data-tip]{transition:filter .15s}.an-svg rect[data-tip]:hover{filter:brightness(1.08)}
.an-tip{position:fixed;z-index:9999;pointer-events:none;background:var(--ic-ink,#1A1D1E);color:#fff;font-size:11px;line-height:1.4;padding:6px 10px;border-radius:var(--r-sm,6px);box-shadow:var(--sh2);max-width:260px;display:none;white-space:pre-line}
.an-rules{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.an-grp{background:#fff;border:1px solid var(--ic-line,#E7E9E2);border-radius:var(--r,8px);box-shadow:var(--sh1);padding:12px 14px;min-width:0;transition:box-shadow .18s var(--ease,ease)}
.an-grp:hover{box-shadow:var(--sh2)}
.an-grp-h{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:12px}
.an-grp-h strong{flex:1;min-width:120px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.an-cnt{background:var(--ic-accent-soft,#EEF7D9);color:#1A1D1E;border:1px solid var(--ic-accent,#8FC640);border-radius:10px;padding:0 8px;font-size:11px;font-weight:600;line-height:18px}
.an-why{font-weight:500;color:var(--bx-mut,var(--ic-muted))}
.an-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}
.an-dc{flex:0 0 240px;border:1px solid #e1e7ea;border-radius:var(--r,8px);padding:10px 12px;background:#fafbfc;display:flex;flex-direction:column;gap:4px;font-size:12px;min-width:0}
.an-dc b{font-size:12px;font-weight:600;overflow-wrap:anywhere}
.an-dc .dv{display:flex;gap:6px;align-items:baseline;min-width:0}
.an-dc .dv em{font-style:normal;flex:0 0 62px;font-size:11px;color:var(--bx-mut,var(--ic-muted))}
.an-dc .dv span{min-width:0;overflow-wrap:anywhere}
.an-dc .dv.df span{background:#fff4d6;border-radius:4px;padding:0 5px;box-shadow:inset 0 0 0 1px #f1d98a}
.an-dc .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:8px}
.an-dc .acts .b{font-size:11px;padding:5px 10px;min-height:28px;white-space:normal;text-align:left;line-height:1.35;max-width:100%;box-sizing:border-box}
.an-cf{margin-top:8px;padding:10px 12px;border:1px solid #f1b8b3;background:#fdf1f0;border-radius:var(--r,8px);font-size:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.an-cf span{flex:1;min-width:180px}
.b.an-del{color:var(--bx-red,#c8372d)}
.an button:focus-visible,.an input:focus-visible{outline:2px solid #1A1D1E;outline-offset:1px}
.an-err{color:var(--bx-red,#c8372d);font-size:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0}
.an-load{height:56px;border-radius:var(--r,8px);background:linear-gradient(90deg,#eef1f3 25%,#f7f9fa 50%,#eef1f3 75%);background-size:200% 100%;animation:anSh 1.2s linear infinite}
@keyframes anSh{to{background-position:-200% 0}}
@media(max-width:480px){.an-grid{grid-template-columns:minmax(0,1fr)}.an-dc{flex-basis:210px}.an-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.an-tile b{font-size:22px}.an-card{padding:12px}}`;
  document.head.appendChild(css);

  /* ---------- утилиты ---------- */
  const today = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  function ageDays(d) {
    const s = d.moved || d.created; if (!s) return null;
    const t = Date.parse(s.slice(0, 10)); if (isNaN(t)) return null;
    return Math.max(0, Math.floor((today() - t) / 864e5));
  }
  const pct = (a, b) => (b > 0 ? (a > b ? "×" + (Math.round((a / b) * 10) / 10).toLocaleString("ru-RU") : Math.round((a / b) * 100) + "%") : "—");
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fin = (id) => PP.stageFinal(PP.cur, id);
  const isWin = id => /(SUCCESS|WON)$/.test(id);
  function csvDownload(name, head, rows) {
    // строки с «формульным» началом экранируем апострофом; числа (typeof number) идут как есть
    const q = v => { const isNum = typeof v === "number"; v = String(v ?? ""); if (!isNum && /^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const txt = "﻿" + [head].concat(rows).map(r => r.map(q).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = name + "_" + PP.cur + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const csvBtn = id => `<button class="b" data-an-csv="${id}">Скачать CSV</button>`;
  const EMPTY_SVG = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="28" height="24" rx="4"/><path d="M12 26l6-7 5 4 6-9"/></svg>';
  const empty = t => `<div class="an-empty">${EMPTY_SVG}<span>${esc(t || "Нет данных")}</span></div>`;
  function card(id, title, body, hasCsv, extra) {
    return `<section class="an-card" id="an-${id}"><div class="an-h"><h3>${esc(title)}</h3>${extra || ""}${hasCsv ? csvBtn(id) : ""}</div>${body}</section>`;
  }

  /* ---------- вычисления ---------- */
  function compute(ctx) {
    const B = ctx.B, all = ctx.deals, ds = all.filter(PP.match);
    const stages = B.stages.map(s => ({ id: s.id, name: s.name, total: s.count || 0, shown: s.shown ?? s.deals.length, trunc: !!s.truncated }));
    const M = stages.reduce((a, s) => a + s.total, 0), N = ds.length;
    const withSum = ds.filter(d => d.sum > 0), sum = ds.reduce((a, d) => a + d.sum, 0);
    const D = { ds, N, M, shownAll: all.length, stages, sum, trunc: stages.some(s => s.trunc) || N < M };
    D.tiles = { n: N, sum, avg: withSum.length ? sum / withSum.length : 0, med: median(withSum.map(d => d.sum)), nowho: ds.filter(d => !d.who).length, nosum: N - withSum.length, withSum: withSum.length };
    const colOf = id => { const b = (B.stages || []).find(x => x.id === id); const c = b && b.color; return c ? (/^#|^rgb/.test(c) ? c : "#" + c) : "#8FC640"; };
    D.stageRows = stages.map(s => {
      const arr = ds.filter(d => d.stageId === s.id);
      return { ...s, color: colOf(s.id), n: arr.length, sum: arr.reduce((a, d) => a + d.sum, 0), final: fin(s.id), win: isWin(s.id) };
    });
    const ages = AGE.map(() => 0); D.ageRows = D.stageRows.map(s => {
      const b = AGE.map(() => 0); let nod = 0;
      ds.filter(d => d.stageId === s.id).forEach(d => { const a = ageDays(d); if (a == null) { nod++; return; } const i = AGE.findIndex(x => a >= x.lo && a <= x.hi); b[i]++; ages[i]++; });
      return { id: s.id, name: s.name, final: s.final, b, nod, n: s.n };
    });
    D.stuck = ds.filter(d => !fin(d.stageId)).map(d => ({ d, a: ageDays(d) })).filter(x => x.a != null).sort((x, y) => y.a - x.a).slice(0, 10);
    const w = {}; ds.forEach(d => { const k = d.who || "— без ответственного"; const o = w[k] || (w[k] = { who: k, n: 0, sum: 0 }); o.n++; o.sum += d.sum; });
    D.who = Object.values(w).map(o => ({ ...o, avg: o.n ? o.sum / o.n : 0, share: N ? o.n / N : 0 }));
    const mo = {}; ds.forEach(d => { const k = (d.created || "").slice(0, 7); if (!k) return; const o = mo[k] || (mo[k] = { m: k, n: 0, sum: 0 }); o.n++; o.sum += d.sum; });
    D.months = Object.values(mo).sort((a, b) => a.m.localeCompare(b.m));
    D.nomonth = ds.filter(d => !(d.created || "").slice(0, 7)).length;
    const cl = {}; let nocl = 0; ds.forEach(d => { if (!d.company) { nocl++; return; } const o = cl[d.company] || (cl[d.company] = { co: d.company, n: 0, sum: 0 }); o.n++; o.sum += d.sum; });
    D.clients = Object.values(cl).sort((a, b) => b.sum - a.sum || b.n - a.n).slice(0, 10); D.nocl = nocl;
    return D;
  }
  const honest = D => D.trunc ? `По показанным ${D.N.toLocaleString("ru-RU")} из ${D.M.toLocaleString("ru-RU")} карточек воронки (на доске показано не всё и действуют фильтры).` : `Все ${D.N.toLocaleString("ru-RU")} карточек воронки, с учётом текущих фильтров.`;

  /* ---------- блоки ---------- */
  function sortRows(id, rows, def) {
    const s = S.sort[id] || def; const k = s.k, m = s.dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => (typeof a[k] === "string" ? a[k].localeCompare(b[k], "ru") : a[k] - b[k]) * m);
  }
  function th(id, cols, def) {
    const s = S.sort[id] || def;
    return "<tr>" + cols.map(c => `<th class="${c.n ? "n" : ""}"><button data-an-sort="${id}" data-k="${c.k}" class="${s.k === c.k ? "on" : ""}" title="Сортировать">${esc(c.t)}${s.k === c.k ? (s.dir === "asc" ? " ↑" : " ↓") : ""}</button></th>`).join("") + "</tr>";
  }

  function tilesHtml(D) {
    const t = D.tiles, IC = {
      n: '<path d="M4 6h16M4 12h16M4 18h10"/>', s: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>', a: '<path d="M5 19V9M12 19V5M19 19v-7"/>',
      m: '<path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="8"/>', w: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5 7-5s6 1 7 5"/>', z: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>' };
    const T = (v, l, c, i) => `<div class="an-tile" style="--tc:${c}"><b>${v}</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[i]}</svg><span>${esc(l)}</span></div>`;
    return `<div class="an-tiles">${T(t.n.toLocaleString("ru-RU"), "карточек" + (D.trunc ? ` (из ${D.M.toLocaleString("ru-RU")})` : ""), "#8FC640", "n")}${T(fmt(t.sum), "сумма", "#9dcf00", "s")}${T(fmt(t.avg), "средняя (по " + t.withSum + " с суммой)", "#7b8cff", "a")}${T(fmt(t.med), "медиана (по показанным с суммой)", "#a98bd9", "m")}${T(t.nowho, "без ответственного", "#eba56d", "w")}${T(t.nosum, "без суммы", "#d8786a", "z")}</div>`;
  }

  function funnelBlock(D) {
    if (!D.N) return card("funnel", "Воронка стадий", empty("Нет карточек под текущие фильтры"), false);
    const max = Math.max(1, ...D.stageRows.map(s => s.n)), first = D.stageRows[0].n;
    const body = D.stageRows.map((s, i) => {
      const prev = i ? D.stageRows[i - 1].n : null;
      const cls = s.final ? (s.win ? "an-fin-ok" : "an-fin-no") : "";
      const meta = [fmt(s.sum), i ? pct(s.n, prev) + " от предыдущей" : "первая стадия", i ? pct(s.n, first) + " от первой" : "", s.trunc ? `показано ${s.shown} из ${s.total.toLocaleString("ru-RU")}` : ""].filter(Boolean).join(" · ");
      return `<div class="an-fr" style="--sc:${esc(s.color)}"><div class="an-fr-top"><span><i class="an-dot"></i>${esc(s.name)}${s.final ? `<span class="an-tag">${s.win ? "финал: успех" : "финал: провал"}</span>` : ""}</span><span>${s.n.toLocaleString("ru-RU")}</span></div>
<div class="an-trk ${cls}" role="img" aria-label="${esc(s.name)}: ${s.n}" data-tip="${esc(s.name + "\n" + s.n + " карточек · " + fmt(s.sum))}"><i style="width:${s.n ? Math.max(1, (s.n / max) * 100) : 0}%"></i></div><div class="an-meta">${esc(meta)}</div></div>`;
    }).join("");
    return card("funnel", "Воронка стадий", (D.trunc ? `<div class="an-note" style="margin-bottom:8px">Конверсия считается по показанным карточкам.</div>` : "") + body, true);
  }

  function ageBlock(D) {
    const rows = D.ageRows.filter(r => r.n);
    if (!rows.length) return card("age", "Возраст в стадии", empty("Нет карточек под текущие фильтры"), false);
    const leg = `<div class="an-legend">${AGE.map(a => `<span><i style="background:${a.c}"></i>${a.k} дн.</span>`).join("")}</div>`;
    const body = rows.map(r => {
      const tot = r.b.reduce((a, x) => a + x, 0);
      const segs = r.b.map((v, i) => v ? `<i data-tip="${esc(r.name + "\n" + AGE[i].k + " дн.: " + v)}" style="width:${(v / (tot || 1)) * 100}%;background:${AGE[i].c}"></i>` : "").join("");
      return `<div class="an-fr"><div class="an-fr-top"><span>${esc(r.name)}${r.final ? '<span class="an-tag">финал</span>' : ""}</span><span>${r.n}</span></div><div class="an-stk" role="img" aria-label="${esc(r.name)}: ${r.b.map((v, i) => AGE[i].k + " дн. — " + v).join(", ")}">${segs}</div>
<div class="an-meta">${r.b.map((v, i) => AGE[i].k + ": " + v).join(" · ")}${r.nod ? ` · без даты: ${r.nod}` : ""}</div></div>`;
    }).join("");
    return card("age", "Возраст в стадии (дней «в стадии с»)", leg + body, true);
  }

  function stuckBlock(D) {
    if (!D.stuck.length) return card("stuck", "Самые застрявшие (топ-10)", empty("Нет карточек в рабочих стадиях"), false);
    const rows = D.stuck.map(x => `<tr><td class="n">${esc(x.d.id)}</td><td><div class="an-ellip" title="${esc(x.d.title)}">${esc(x.d.title)}</div></td><td>${esc(x.d.stageName)}</td><td class="n">${x.a} дн.</td><td class="n">${fmt(x.d.sum)}</td><td>${esc(x.d.who || "—")}</td><td><button class="b" data-an-open="${esc(x.d.id)}">Открыть</button></td></tr>`).join("");
    return card("stuck", "Самые застрявшие (топ-10, без финальных)", `<div class="an-tw"><table><tr><th class="n">ID</th><th>Название</th><th>Стадия</th><th class="n">В стадии</th><th class="n">Сумма</th><th>Ответственный</th><th></th></tr>${rows}</table></div>`, true);
  }

  function whoBlock(D) {
    if (!D.who.length) return card("who", "По ответственным", empty("Нет карточек под текущие фильтры"), false);
    const def = { k: "n", dir: "desc" }, rows = sortRows("who", D.who, def), max = Math.max(1, ...D.who.map(x => x.n));
    const cols = [{ k: "who", t: "Ответственный" }, { k: "n", t: "Карточек", n: 1 }, { k: "sum", t: "Сумма", n: 1 }, { k: "avg", t: "Средняя", n: 1 }, { k: "share", t: "Доля", n: 1 }];
    const tr = rows.map(r => `<tr><td>${esc(r.who)}</td><td class="n"><span class="an-mb" style="width:${Math.round((r.n / max) * 70)}px"></span> ${r.n.toLocaleString("ru-RU")}</td><td class="n">${fmt(r.sum)}</td><td class="n">${fmt(r.avg)}</td><td class="n">${(r.share * 100).toFixed(1)}%</td></tr>`).join("");
    return card("who", "По ответственным", `<div class="an-tw"><table>${th("who", cols, def)}${tr}</table></div>`, true);
  }

  function monthsBlock(D) {
    if (!D.months.length) return card("months", "По месяцам создания", empty(), false);
    const ms = D.months.slice(-36), cut = D.months.length - ms.length;
    const bw = 34, W = Math.max(300, ms.length * bw + 66), H = 190, pt = 22, pb = 44, ch = H - pt - pb;
    const maxS = Math.max(1, ...ms.map(m => m.sum)), maxN = Math.max(1, ...ms.map(m => m.n));
    const short = v => v >= 1e9 ? (v / 1e9).toFixed(1) + " млрд" : v >= 1e6 ? (v / 1e6).toFixed(1) + " млн" : v >= 1e3 ? Math.round(v / 1e3) + " тыс" : String(Math.round(v));
    const grid = [0, .25, .5, .75, 1].map(f => { const y = pt + ch - f * ch; return `<line x1="58" y1="${y}" x2="${W}" y2="${y}" stroke="#e6ebee"${f ? ' stroke-dasharray="3 3"' : ""}/><text x="54" y="${y + 3.5}" font-size="10" text-anchor="end" fill="#5A645E">${f ? esc(short(maxS * f)) : "0"}</text>`; }).join("");
    const bars = ms.map((m, i) => {
      const x = 62 + i * bw, h = (m.sum / maxS) * ch, hn = (m.n / maxN) * ch, tip = esc(m.m + "\n" + m.n + " карточек\n" + fmt(m.sum));
      return `<g><rect x="${x}" y="${pt}" width="${bw}" height="${ch}" fill="transparent" data-tip="${tip}"/>
<rect x="${x + 3}" y="${pt + ch - h}" width="${bw - 14}" height="${Math.max(h, m.sum ? 1 : 0)}" rx="3" fill="#8FC640" data-tip="${tip}"/>
<rect x="${x + bw - 11}" y="${pt + ch - hn}" width="6" height="${Math.max(hn, 1)}" rx="2" fill="#a0aab2" data-tip="${tip}"/>
<text x="${x + bw / 2 - 2}" y="${H - pb + 14}" font-size="10" text-anchor="end" transform="rotate(-50 ${x + bw / 2 - 2} ${H - pb + 14})" fill="#5A645E">${esc(m.m)}</text></g>`;
    }).join("");
    const svg = `<div class="an-svgw"><svg class="an-svg" style="min-width:${W}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="Сумма и число карточек по месяцам создания">${grid}${bars}</svg></div>`;
    const note = `<div class="an-legend"><span><i style="background:#8FC640"></i>сумма, ₸ (макс. ${esc(fmt(maxS))})</span><span><i style="background:#a0aab2"></i>число карточек (макс. ${maxN})</span>${cut ? `<span>показаны последние 36 мес., ещё ${cut} в CSV</span>` : ""}${D.nomonth ? `<span>без даты создания: ${D.nomonth}</span>` : ""}</div>`;
    return card("months", "По месяцам создания", note + svg, true);
  }

  function clientsBlock(D) {
    if (!D.clients.length) return card("clients", "Топ-10 клиентов по сумме", empty("Нет карточек с указанным клиентом"), false);
    const max = Math.max(1, ...D.clients.map(x => x.sum));
    const tr = D.clients.map((r, i) => `<tr><td class="n">${i + 1}</td><td><div class="an-ellip" title="${esc(r.co)}">${esc(r.co)}</div></td><td class="n">${r.n}</td><td class="n"><span class="an-mb" style="width:${Math.round((r.sum / max) * 70)}px"></span> ${fmt(r.sum)}</td></tr>`).join("");
    return card("clients", "Топ-10 клиентов по сумме", `<div class="an-tw"><table><tr><th class="n">#</th><th>Клиент</th><th class="n">Карточек</th><th class="n">Сумма</th></tr>${tr}</table></div>` + (D.nocl ? `<div class="an-meta" style="margin-top:6px">Без клиента: ${D.nocl} карточек</div>` : ""), true);
  }

  const BLOCKS = { funnel: funnelBlock, age: ageBlock, stuck: stuckBlock, who: whoBlock, months: monthsBlock, clients: clientsBlock };

  function csvFor(id, D) {
    switch (id) {
      case "funnel": return [["Стадия", "Карточек", "Сумма", "% от предыдущей", "% от первой", "Показано", "Всего в стадии"], D.stageRows.map((s, i) => [s.name, s.n, Math.round(s.sum), i ? pct(s.n, D.stageRows[i - 1].n) : "", i ? pct(s.n, D.stageRows[0].n) : "", s.shown, s.total])];
      case "age": return [["Стадия"].concat(AGE.map(a => a.k + " дн."), ["Без даты"]), D.ageRows.map(r => [r.name].concat(r.b, [r.nod]))];
      case "stuck": return [["ID", "Название", "Стадия", "Дней в стадии", "Сумма", "Ответственный"], D.stuck.map(x => [x.d.id, x.d.title, x.d.stageName, x.a, Math.round(x.d.sum), x.d.who])];
      case "who": return [["Ответственный", "Карточек", "Сумма", "Средняя", "Доля"], sortRows("who", D.who, { k: "n", dir: "desc" }).map(r => [r.who, r.n, Math.round(r.sum), Math.round(r.avg), (r.share * 100).toFixed(1) + "%"])];
      case "months": return [["Месяц создания", "Карточек", "Сумма"], D.months.map(m => [m.m, m.n, Math.round(m.sum)])];
      case "clients": return [["Клиент", "Карточек", "Сумма"], D.clients.map(r => [r.co, r.n, Math.round(r.sum)])];
    }
    return [[], []];
  }

  /* ---------- вкладка «Дубли» ---------- */
  function dupKey() { return [PP.cur, S.rules.join(","), S.ver || 0].join("|"); }
  async function loadDupes(host, force) {
    const key = dupKey();
    if (!force && S.dupKey === key && S.dupes) { drawDupes(host); return; }
    const tk = ++S.token; S.dupBusy = true; S.dupes = null; drawDupes(host);
    let r;
    try { r = await PP.api.get("/api/analytics/dupes?f=" + encodeURIComponent(PP.cur) + "&rules=" + S.rules.join(",")); } catch (e) { r = { error: "Нет связи с панелью" }; }
    if (tk !== S.token) return;
    S.dupBusy = false; S.dupes = r; S.dupKey = key; drawDupes(host);
  }
  function drawDupes(host) {
    const el = host.querySelector("#an-dupbody"); if (!el) return;
    const rules = `<div class="an-rules">${RULES.map(([k, t]) => `<button class="b${S.rules.includes(k) ? " on" : ""}" data-an-rule="${k}" aria-pressed="${S.rules.includes(k)}">${esc(t)}</button>`).join("")}<button class="b" data-an-rescan>Обновить</button></div>`;
    let body;
    const r = S.dupes;
    if (S.dupBusy) body = '<div class="an-load" role="status" aria-label="Ищу дубли"></div>';
    else if (!r) body = empty();
    else if (r.error) body = `<div class="an-err" role="alert">${esc(r.error)} <button class="b" data-an-rescan>Повторить</button></div>`;
    else {
      const head = `<div class="an-note">Проверено ${r.scanned.toLocaleString("ru-RU")} карточек из слепка воронки` + (r.total > r.in_snapshot ? ` (в воронке всего ${r.total.toLocaleString("ru-RU")}, в слепке только часть)` : "") + `. Групп: ${r.groups.length}.${r.truncated ? " Показаны не все (лимит 200 групп / 1 млн сравнений), сузьте правила." : ""}</div>`;
      const hid = r.hidden ? `<div class="an-rules"><span class="an-note">Скрыто как «не дубль»: ${r.hidden}</span><button class="b" data-an-unhide>Показать скрытые</button></div>` : "";
      const groups = r.groups.length ? r.groups.map(g => groupHtml(g)).join("") : empty(r.hidden ? "Все найденные группы помечены как «не дубль»" : "Дубли не найдены");
      body = head + hid + `<div style="display:flex;flex-direction:column;gap:10px">${groups}</div>`;
    }
    el.innerHTML = rules + `<div style="margin-top:10px">${body}</div>`;
  }
  const RN = { title: "название", company_sum: "компания + сумма", title_company: "название + клиент" };
  function groupHtml(g) {
    const cf = S.confirm && S.confirm.key === g.key ? S.confirm : null;
    const dif = k => new Set(g.members.map(m => String(m[k] ?? ""))).size > 1 ? " df" : "";
    const row = (l, v, k) => `<div class="dv${k ? dif(k) : ""}"><em>${l}</em><span>${v}</span></div>`;
    const cards = g.members.map(m => `<div class="an-dc"><b>${esc(m.title || "(без названия)")}</b>
${row("Карточка", "#" + esc(m.id) + " · " + esc(m.stageName), "stageName")}${row("Сумма", esc(fmt(m.sum)), "sum")}${row("Ответств.", esc(m.who || "без ответственного"), "who")}${row("Клиент", esc(m.company || "—"), "company")}${row("Создана", esc(m.created || "—"), "created")}
<div class="acts"><button class="b" data-an-open="${esc(m.id)}">Открыть</button><button class="b an-del" data-an-keep="${esc(m.id)}" data-g="${g.key}">Оставить эту, остальные удалить локально</button></div></div>`).join("");
    const conf = cf ? `<div class="an-cf" role="alert"><span>Спрятать локально ${cf.ids.length} карточ. из группы, оставить #${esc(cf.keep)}? В Битриксе они останутся, вернуть можно через «Удалённые».</span><button class="b btn-create" data-an-doit>Да, спрятать</button><button class="b" data-an-cancel>Отмена</button></div>` : "";
    return `<section class="an-grp" data-g="${g.key}"><div class="an-grp-h"><strong><span class="an-cnt">${g.size}</span> карточек <span class="an-why">· совпало: ${esc(g.rules.map(x => RN[x]).join(", "))}${g.more > 0 ? ` · показано ${g.members.length}` : ""}</span></strong><button class="b" data-an-nodupe="${g.key}">Не дубль</button></div><div class="an-row">${cards}</div>${conf}</section>`;
  }

  async function doDelete(host) {
    const c = S.confirm; if (!c) return; S.confirm = null; drawDupes(host);
    let ok = 0, bad = "";
    for (const id of c.ids) {
      let r; try { r = await PP.api.post("/api/card/delete", { f: PP.cur, deal: id }); } catch (e) { r = { error: "нет связи с панелью" }; }
      if (r && r.ok) ok++; else { bad = (r && r.error) || "ошибка"; break; }
    }
    PP.toast(bad ? `Спрятано ${ok}, ошибка: ${bad}` : `Спрятано локально: ${ok}`);
    S.ver = (S.ver || 0) + 1; S.dupKey = "";
    PP.reload();           // перерисует вид и подтянет дубли заново
  }

  /* ---------- вид ---------- */
  function render(host, ctx) {
    host.innerHTML = ""; const root = document.createElement("div"); root.className = "an"; host.appendChild(root);
    S.D = compute(ctx);
    const tabs = `<div class="an-tabs" role="tablist"><button class="b${S.tab === "an" ? " on" : ""}" role="tab" aria-selected="${S.tab === "an"}" data-an-tab="an">Аналитика</button><button class="b${S.tab === "dup" ? " on" : ""}" role="tab" aria-selected="${S.tab === "dup"}" data-an-tab="dup">Дубли</button></div>`;
    if (S.tab === "an") {
      const D = S.D;
      if (!ctx.deals.length) { root.innerHTML = tabs + empty("В воронке нет карточек"); }
      else root.innerHTML = tabs + `<div class="an-note">${esc(honest(D))}</div>` + tilesHtml(D) +
        `<div class="an-grid">${["funnel", "age", "months", "who", "stuck", "clients"].map(id => BLOCKS[id](D)).join("")}</div>`;
    } else {
      root.innerHTML = tabs + `<div class="an-card"><div class="an-h"><h3>Возможные дубли в воронке</h3></div><div class="an-note" style="margin-bottom:8px">Проверяется вся воронка из слепка, независимо от фильтров доски.</div><div id="an-dupbody"></div></div>`;
      loadDupes(root);
    }
    root.onclick = e => onClick(e, root);
    const tip = document.createElement("div"); tip.className = "an-tip"; root.appendChild(tip);
    root.onmousemove = e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (!t) { tip.style.display = "none"; return; } tip.textContent = t.getAttribute("data-tip"); tip.style.display = "block"; const w = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX + 12)) + "px"; tip.style.top = (e.clientY + 14) + "px"; };
    root.onmouseleave = () => { tip.style.display = "none"; };
  }

  function onClick(e, root) {
    const t = e.target.closest("button"); if (!t) return;
    const ds = t.dataset;
    if (ds.anTab) { S.tab = ds.anTab; PP.setView("analytics"); return; }
    if (ds.anCsv) { const [h, r] = csvFor(ds.anCsv, S.D); csvDownload("analytics_" + ds.anCsv, h, r); return; }
    if (ds.anSort) {
      const cur = S.sort[ds.anSort] || { k: "n", dir: "desc" };
      S.sort[ds.anSort] = { k: ds.k, dir: cur.k === ds.k && cur.dir === "desc" ? "asc" : (ds.k === "who" ? "asc" : "desc") };
      const el = root.querySelector("#an-" + ds.anSort); if (el) { const n = document.createElement("div"); n.innerHTML = BLOCKS[ds.anSort](S.D); el.replaceWith(n.firstElementChild); }
      const nb = root.querySelector(`#an-${ds.anSort} [data-an-sort="${ds.anSort}"][data-k="${ds.k}"]`); if (nb) nb.focus();
      return;
    }
    if (ds.anOpen) { openCard(PP.cur, ds.anOpen); return; }
    if (ds.anRule) { const i = S.rules.indexOf(ds.anRule); if (i >= 0) { if (S.rules.length > 1) S.rules.splice(i, 1); else PP.toast("Нужно оставить хотя бы одно правило"); } else S.rules.push(ds.anRule); S.confirm = null; loadDupes(root); return; }
    if (t.hasAttribute("data-an-rescan")) { S.confirm = null; loadDupes(root, true); return; }
    if (ds.anKeep) {
      const g = S.dupes && S.dupes.groups.find(x => x.key === ds.g); if (!g) return;
      S.confirm = { key: g.key, keep: ds.anKeep, ids: g.ids.filter(i => i !== ds.anKeep) };
      if (g.size > g.ids.length) PP.toast("В группе больше 500 карточек: спрячутся первые 499");
      drawDupes(root); const b = root.querySelector("[data-an-doit]"); if (b) b.focus(); return;
    }
    if (t.hasAttribute("data-an-doit")) { doDelete(root); return; }
    if (t.hasAttribute("data-an-cancel")) { S.confirm = null; drawDupes(root); return; }
    if (ds.anNodupe) {
      PP.api.post("/api/analytics/notdupe", { f: PP.cur, key: ds.anNodupe }).catch(() => ({ error: "Нет связи с панелью, попробуйте ещё раз" })).then(r => {
        if (r.error) { PP.toast(r.error); return; }
        S.dupes.groups = S.dupes.groups.filter(g => g.key !== ds.anNodupe); S.dupes.hidden++; drawDupes(root); PP.toast("Группа скрыта как «не дубль»");
      }); return;
    }
    if (t.hasAttribute("data-an-unhide")) { PP.api.post("/api/analytics/notdupe/reset", { f: PP.cur }).catch(() => ({ error: 1 })).then(r => { if (r && r.error) PP.toast("Не удалось показать скрытые, попробуйте ещё раз"); else loadDupes(root, true); }); }
  }

  PP.addView({ id: "analytics", label: "Аналитика", render });
  PP.on("board:loaded", () => { S.dupKey = ""; S.confirm = null; });
})();
