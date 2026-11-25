/* Фича filters: быстрые фильтры, период и стадии, конструктор условий, сохранённые фильтры. Всё локально. */
(function () {
  "use strict";
  const PP = window.PP, esc = PP.esc;
  const LS = "pp_flt_cur";
  const PILLS = [
    ["all", "Все"], ["mine", "Мои"], ["noowner", "Без ответственного"], ["stuck", "Застряли"],
    ["today", "Создано сегодня"], ["week", "Создано за неделю"], ["month", "Создано за месяц"],
    ["local", "Изменено локально"], ["sum", "С суммой"], ["big", "Крупные"]
  ];
  const BUILTIN = [
    { code: "@title", label: "Название", kind: "text" }, { code: "@who", label: "Ответственный", kind: "select", dyn: "who" },
    { code: "@company", label: "Клиент", kind: "text" }, { code: "@sum", label: "Сумма", kind: "number" },
    { code: "@month", label: "Месяц", kind: "text" }, { code: "@id", label: "ID", kind: "text" },
    { code: "@created", label: "Создана", kind: "date" }, { code: "@moved", label: "В стадии с", kind: "date" }
  ];
  const OPS = {
    eq: "равно", neq: "не равно", contains: "содержит", gt: "больше", lt: "меньше",
    empty: "пусто", notempty: "не пусто", in: "в списке"
  };
  const KOPS = {
    text: ["eq", "neq", "contains", "in", "empty", "notempty"],
    select: ["eq", "neq", "in", "contains", "empty", "notempty"],
    number: ["eq", "neq", "gt", "lt", "empty", "notempty"],
    date: ["eq", "gt", "lt", "empty", "notempty"]
  };
  const NOVAL = { empty: 1, notempty: 1 };

  const meName = () => (PP.me && PP.me.name) || cfg.me || "";
  let cfg = { me: "", stuckDays: 7, bigSum: 1000000, scope: "global", presets: [], defaults: {} };
  let S = emptyS();
  let fid = null, bypass = false, open = null, mobOpen = false, users = [];
  let schemas = {};      // fid -> {fields:[...]} | "loading" | {error}
  let vals = {};         // fid -> code -> {dealId: text}
  let inflight = {};
  let valEpoch = 0;      // растёт при перезагрузке доски: ответы со старой эпохой отбрасываем
  let ver = 0;           // версия состояния: сбрасывает подготовленные условия
  let prep = null, sfc = null;
  let stageMap = new Map(), stageMapB = null;
  let ui = { view: "filter", cur: null, creRange: false, showConds: false, saving: false, renaming: null, ioText: "", ioMsg: "", cfgErr: "", valErr: "", schErr: "" };
  let wrap = null, saveT = null;

  function emptyS() { return { pills: [], stages: [], cre: ["", ""], mov: ["", ""], conds: [], join: "and", who: [], whoX: false, my: ["", ""], sm: ["", ""], smx: false, co: "", cox: false }; }
  const pair = a => Array.isArray(a) && a.length === 2 ? [String(a[0] || ""), String(a[1] || "")] : ["", ""];
  function normS(x) {
    const s = emptyS();
    if (!x || typeof x !== "object") return s;
    if (Array.isArray(x.pills)) s.pills = x.pills.filter(p => typeof p === "string" && p !== "all" && PILLS.some(q => q[0] === p));
    if (Array.isArray(x.stages)) s.stages = x.stages.filter(p => typeof p === "string");
    ["cre", "mov"].forEach(k => { if (Array.isArray(x[k]) && x[k].length === 2) s[k] = pair(x[k]); });
    if (Array.isArray(x.conds)) s.conds = x.conds.filter(c => c && typeof c === "object").map(c => ({ field: String(c.field || ""), op: String(c.op || "eq"), val: Array.isArray(c.val) ? c.val.map(String) : String(c.val == null ? "" : c.val) }));
    s.join = x.join === "or" ? "or" : "and";
    if (Array.isArray(x.who)) s.who = x.who.map(String).filter(Boolean);
    s.whoX = !!x.whoX; s.my = pair(x.my); s.sm = pair(x.sm); s.smx = !!x.smx;
    s.co = typeof x.co === "string" ? x.co : ""; s.cox = !!x.cox;
    return s;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- стили ----------
  const st = document.createElement("style");
  st.textContent = `
  #fpanel{display:none!important}
  .bx-filter{gap:4px;padding-left:3px}
  .bx-fbtn{display:none!important}
  .flt-preset{flex:none;display:inline-flex;align-items:center;gap:4px;height:calc(var(--btn-h) - 2px);padding:0 9px 0 11px;border:0;border-radius:999px;background:var(--ic-bg);color:var(--ic-ink);font:600 var(--fs)/1 inherit;cursor:pointer;max-width:190px}
  .flt-preset .flt-pl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .flt-preset:hover,.flt-preset[aria-expanded=true]{background:var(--ic-accent-soft)}
  .flt-bi{flex:none;width:24px;height:24px;border:0;background:none;border-radius:50%;color:var(--ic-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:15px;line-height:1}
  .flt-bi:hover{background:var(--ic-hover);color:var(--ic-ink)}
  .flt-bi svg{width:14px;height:14px}
  #fchips .fchip .fc-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
  #flt-wrap{position:fixed;z-index:26;width:min(740px,calc(100vw - 16px));display:flex;flex-direction:column;background:#fff;border:1px solid var(--ic-line);border-radius:12px;box-shadow:0 12px 32px rgba(26,29,30,.18);overflow:hidden;font-size:var(--fs);font-variant-numeric:tabular-nums}
  #flt-wrap.hidden{display:none!important}
  #flt-wrap *{box-sizing:border-box}
  #flt-wrap button:focus-visible,#flt-wrap input:focus-visible,#flt-wrap select:focus-visible{outline:2px solid var(--ic-ink);outline-offset:1px}
  .flt-top{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px;border-bottom:1px solid var(--ic-line);flex:none}
  .flt-top b{font-size:13px;font-weight:600}
  .flt-found{color:var(--ic-muted);font-size:var(--fs)}.flt-found b{color:var(--ic-ink);font-size:var(--fs)}
  .flt-sp{flex:1}
  .flt-body{display:grid;grid-template-columns:200px minmax(0,1fr);min-height:0;flex:1}
  .flt-side{border-right:1px solid var(--ic-line);padding:8px;overflow-y:auto;background:var(--ic-bg);display:flex;flex-direction:column;gap:1px;min-height:0}
  .flt-sh{font-size:11px;color:var(--ic-muted);padding:8px 8px 4px}
  .flt-pr{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-height:var(--btn-h);padding:0 8px;border:0;border-radius:8px;background:none;font:inherit;font-size:var(--fs);color:var(--ic-ink);text-align:left;cursor:pointer}
  .flt-pr .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
  .flt-pr small{color:var(--ic-muted);font-size:11px;flex:none}
  .flt-pr:hover{background:var(--ic-hover)}
  .flt-pr.on{background:var(--ic-accent-soft);box-shadow:inset 2px 0 0 var(--ic-accent);font-weight:600}
  .flt-sv{display:flex;align-items:center;gap:2px}.flt-sv .flt-pr{flex:1;min-width:0}
  .flt-sv input{flex:1;min-width:0;height:var(--btn-h);border:1px solid var(--ic-accent);border-radius:8px;padding:0 8px;font:inherit;font-size:var(--fs)}
  .flt-star{font-size:11px;color:var(--ic-muted);flex:none}
  .flt-main{padding:10px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;min-height:120px}
  .flt-fgrid{display:flex;flex-direction:column;gap:10px;width:100%}
  .flt-f{min-width:0}
  .flt-f.wide{grid-column:1/-1}
  .flt-fh{display:flex;align-items:center;gap:2px;margin-bottom:3px;min-height:20px}
  .flt-fl{font-size:11px;color:var(--ic-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .flt-ib{width:20px;height:20px;border:0;background:none;border-radius:50%;color:var(--ic-muted);cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1}
  .flt-ib:hover{background:var(--ic-hover);color:var(--ic-ink)}
  .flt-f input:not([type=checkbox]),.flt-f select,.flt-cond input:not([type=checkbox]),.flt-cond select,.flt-foot input[data-sn]{width:100%;height:var(--btn-h);min-height:var(--btn-h);border:1px solid var(--ic-line);border-radius:8px;background:#fff;padding:0 9px;font:inherit;font-size:var(--fs);color:var(--ic-ink)}
  .flt-f input:focus,.flt-f select:focus,.flt-foot input:focus{border-color:var(--ic-accent);box-shadow:var(--focus);outline:none}
  .flt-2{display:flex;flex-direction:column;gap:6px}
  .flt-opts{max-height:104px;overflow:auto;border:1px solid var(--ic-line);border-radius:8px;padding:4px 8px;display:flex;flex-direction:column;gap:2px;background:#fff}
  .flt-opts label{display:flex;align-items:center;gap:6px;font-size:var(--fs);min-height:22px;cursor:pointer}
  .flt-chips{display:flex;flex-wrap:wrap;gap:4px;max-height:84px;overflow:auto}
  .flt-chips .b{min-height:24px;font-size:var(--fs-s);padding:0 9px}
  .b.flt-on{background:var(--ic-accent-soft);border-color:var(--ic-accent)}
  .flt-chk{display:flex;align-items:center;gap:6px;min-height:var(--btn-h);cursor:pointer;font-size:var(--fs)}
  .flt-foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 14px;border-top:1px solid var(--ic-line);background:#fff;flex:none}
  .flt-foot .flt-sc{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs);color:var(--ic-muted)}
  .flt-foot input[data-sn]{flex:1 1 180px;width:auto}
  .flt-sec{border-top:1px solid var(--ic-line);padding-top:10px}
  .flt-sec h5{margin:0 0 6px;font-size:12px;font-weight:600}
  .flt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
  .flt-row label{font-size:var(--fs);color:var(--ic-muted);display:flex;align-items:center;gap:6px}
  .flt-cond{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px;background:var(--ic-bg);border:1px solid var(--ic-line);border-radius:10px}
  .flt-cond>select{flex:0 1 190px;width:auto}.flt-cond>select[data-co]{flex:0 1 130px}
  .flt-cond .flt-v{flex:1 1 160px;min-width:120px}
  .flt-cond .flt-x{flex:0 0 28px;width:28px;height:var(--btn-h);padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--ic-muted)}
  .flt-cond .flt-x svg{width:13px;height:13px}
  .flt-bad{color:var(--bx-red);font-size:11px;flex-basis:100%}
  .flt-note{color:var(--ic-muted);font-size:11px;padding:2px 0}
  .flt-err{color:var(--bx-red);font-size:var(--fs);display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:4px 0}
  .flt-empty{display:flex;align-items:center;gap:10px;padding:10px;border:1px dashed var(--ic-line);border-radius:8px;color:var(--ic-muted);font-size:var(--fs);margin-bottom:6px}
  .flt-empty svg{flex:0 0 28px;width:28px;height:28px}.flt-empty b{display:block;color:var(--ic-ink);font-weight:600}
  .flt-main textarea{width:100%;min-height:80px;border:1px solid var(--ic-line);border-radius:8px;padding:8px;font-family:ui-monospace,Menlo,monospace;font-size:11px}
  .flt-none{display:none;align-items:center;gap:8px;padding:8px 10px;border:1px dashed var(--ic-line);border-radius:8px;background:var(--ic-bg);font-size:var(--fs);color:var(--ic-muted)}
  .flt-none.on{display:flex}
  .flt-row select,.flt-row input:not([type=checkbox]){height:var(--btn-h);border:1px solid var(--ic-line);border-radius:8px;background:#fff;padding:0 9px;font:inherit;font-size:var(--fs);color:var(--ic-ink)}
  @media(max-width:700px){
    #flt-wrap{inset:0!important;width:auto!important;max-height:none!important;border-radius:0;border:0}
    .flt-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
    .flt-side{flex-direction:row;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--ic-line);padding:6px 8px;gap:4px;scrollbar-width:none}
    .flt-side .flt-sh{display:none}
    .flt-pr{width:auto;flex:none;white-space:nowrap;border:1px solid var(--ic-line);border-radius:999px;background:#fff;min-height:30px}
    .flt-pr.on{box-shadow:none;border-color:var(--ic-accent)}
    .flt-sv{flex:none}
    .flt-fgrid{grid-template-columns:minmax(0,1fr)}
    .flt-foot .b{min-height:30px}
  }
`;
  document.head.appendChild(st);

  // ---------- хелперы ----------
  async function call(method, url, body) {
    try { return method === "post" ? await PP.api.post(url, body) : await PP.api.get(url); }
    catch (e) { return { error: "Нет связи с сервером" }; }
  }
  const isoOf = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const daysAgoISO = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); };
  const ruDate = iso => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "";
  function num(v) {
    if (typeof v === "number") return v;
    const t = String(v == null ? "" : v).replace(/[\s ₸]/g, "").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    return parseFloat(t);
  }
  function dateIso(v) {
    const t = String(v || "").trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(t); if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return "";
  }
  function stageOf(d) {
    if (PP.B !== stageMapB) { stageMapB = PP.B; stageMap = new Map(); if (PP.B) PP.B.stages.forEach(s => s.deals.forEach(x => stageMap.set(x.id, s.id))); }
    return stageMap.get(d.id) || d.stageId || "";
  }
  // список полей и справочник ответственных кешируем по (PP.B, fid, объект схемы)
  function fieldCache() {
    const sc = schemas[fid];
    if (!sfc || sfc.B !== PP.B || sfc.fid !== fid || sfc.sc !== sc) {
      const who = [...new Set(PP.deals().map(d => d.who).filter(Boolean))].sort();
      const dyn = BUILTIN.map(b => b.dyn === "who" ? Object.assign({}, b, { options: who }) : b);
      const list = dyn.concat(sc && sc.fields ? sc.fields : []);
      const map = new Map();
      list.forEach(f => { if (!map.has(f.code)) map.set(f.code, f); });
      sfc = { B: PP.B, fid, sc, list, map };
    }
    return sfc;
  }
  function schemaFields() { return fieldCache().list; }
  function fieldInfo(code) { return fieldCache().map.get(code); }
  function valueOf(d, code) {
    switch (code) {
      case "@title": return d.title || "";
      case "@who": return d.who || "";
      case "@company": return d.company || "";
      case "@sum": return d.sum;
      case "@month": return d.month || "";
      case "@id": return String(d.id);
      case "@created": return d.created || "";
      case "@moved": return d.moved || "";
    }
    const m = (vals[fid] || {})[code];
    return m === undefined ? undefined : (m[d.id] || "");
  }
  function condValid(c) {
    if (!c.field) return false;
    if (!fieldInfo(c.field)) return false;
    if (NOVAL[c.op]) return true;
    if (c.op === "in") return Array.isArray(c.val) ? c.val.length > 0 : String(c.val || "").trim() !== "";
    return String(c.val == null ? "" : c.val).trim() !== "";
  }
  function condPass(d, c, f) {
    let v = valueOf(d, c.field);
    if (v === undefined) return true;         // значения ещё грузятся
    const kind = f.kind, isEmpty = v === "" || v == null || (kind === "number" && c.field === "@sum" && v === 0 && false);
    if (c.op === "empty") return isEmpty;
    if (c.op === "notempty") return !isEmpty;
    const parts = typeof v === "string" ? v.split(", ").map(x => x.trim().toLowerCase()) : [];
    const sv = String(v == null ? "" : v).toLowerCase();
    if (c.op === "in") {
      const want = (Array.isArray(c.val) ? c.val : String(c.val).split(",")).map(x => x.trim().toLowerCase()).filter(Boolean);
      return want.some(w => sv === w || parts.includes(w));
    }
    const cv = Array.isArray(c.val) ? c.val[0] || "" : c.val;
    if (c.op === "eq" || c.op === "neq") {
      let r;
      if (kind === "number") { const a = num(v), b = num(cv); r = !isNaN(a) && !isNaN(b) && a === b; }
      else if (kind === "date") r = dateIso(v) !== "" && dateIso(v) === dateIso(cv);
      else r = sv === String(cv).trim().toLowerCase() || parts.includes(String(cv).trim().toLowerCase());
      return c.op === "eq" ? r : !r;
    }
    if (c.op === "contains") return sv.includes(String(cv).trim().toLowerCase());
    if (c.op === "gt" || c.op === "lt") {
      let a, b;
      if (kind === "date") { a = dateIso(v); b = dateIso(cv); if (!a || !b) return false; return c.op === "gt" ? a > b : a < b; }
      a = num(v); b = num(cv);
      if (isNaN(a) || isNaN(b)) return false;
      return c.op === "gt" ? a > b : a < b;
    }
    return true;
  }
  const pillPred = {
    all: () => true,
    mine: d => !!meName() && d.who === meName(),
    noowner: d => !d.who,
    stuck: d => !!d.moved && d.moved < prepared().stuckISO && !PP.stageFinal(PP.cur, stageOf(d)),
    today: d => d.created === prepared().today,
    week: d => !!d.created && d.created >= prepared().week,
    month: d => !!d.created && d.created >= prepared().month,
    local: d => !!(d.movedLocal || d.isLocal || (d.fields || []).some(x => x.local)),
    sum: d => d.sum > 0,
    big: d => d.sum > cfg.bigSum
  };
  function pillLabel(id) {
    const base = (PILLS.find(p => p[0] === id) || [id, id])[1];
    if (id === "stuck") return "Застряли > " + cfg.stuckDays + " дн.";
    if (id === "big") return "Крупные > " + PP.fmt(cfg.bigSum);
    return base;
  }
  // подготовленное состояние: активные условия с уже найденным полем и пороги дат; пересчёт только при смене ver/доски
  function prepared() {
    if (!prep || prep.ver !== ver || prep.B !== PP.B || prep.fid !== fid) {
      const cs = [];
      S.conds.forEach(c => { if (condValid(c)) cs.push({ c, f: fieldInfo(c.field) }); });
      prep = { ver, B: PP.B, fid, cs, stuckISO: daysAgoISO(cfg.stuckDays), today: isoOf(new Date()), week: daysAgoISO(7), month: daysAgoISO(30) };
    }
    return prep;
  }
  function activeConds() { return prepared().cs.map(x => x.c); }
  const smActive = () => S.smx ? !isNaN(num(S.sm[0])) : (!isNaN(num(S.sm[0])) || !isNaN(num(S.sm[1])));
  const monName = m => (window.monLabel ? window.monLabel(m) : m);
  const MN = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  function fieldChips() {
    const out = [];
    if (S.who.length) out.push({ k: "who", t: (S.whoX ? "Кроме: " : "Ответственный: ") + S.who.join(", ") });
    if (S.my[0] || S.my[1]) out.push({ k: "my", t: "Месяц начисления: " + [S.my[0] ? MN[+S.my[0] - 1] : "", S.my[1]].filter(Boolean).join(" ") });
    if (smActive()) { const a = num(S.sm[0]), b = num(S.sm[1]); out.push({ k: "sm", t: "Сумма" + (S.smx ? " = " + PP.fmt(a) : (!isNaN(a) ? " от " + PP.fmt(a) : "") + (!isNaN(b) ? " до " + PP.fmt(b) : "")) }); }
    if (S.co.trim()) out.push({ k: "co", t: (S.cox ? "Клиент = " : "Клиент: ") + S.co.trim() });
    return out;
  }
  function activeCount() {
    return fieldChips().length + S.pills.length + (S.stages.length ? 1 : 0) + (S.cre[0] || S.cre[1] ? 1 : 0) + (S.mov[0] || S.mov[1] ? 1 : 0) + activeConds().length;
  }
  function isActive() { return activeCount() > 0; }
  function myFilter(d) {
    if (bypass || fid !== PP.cur || !isActive()) return true;
    for (const p of S.pills) if (!pillPred[p](d)) return false;
    if (S.stages.length && !S.stages.includes(stageOf(d))) return false;
    if (S.cre[0] && !(d.created && d.created >= S.cre[0])) return false;
    if (S.cre[1] && !(d.created && d.created <= S.cre[1])) return false;
    if (S.mov[0] && !(d.moved && d.moved >= S.mov[0])) return false;
    if (S.mov[1] && !(d.moved && d.moved <= S.mov[1])) return false;
    if (S.who.length) { const h = S.who.includes(d.who); if (S.whoX ? h : !h) return false; }
    if (S.my[0] || S.my[1]) { const m = d.month || ""; if (!m) return false; if (S.my[1] && m.slice(0, 4) !== S.my[1]) return false; if (S.my[0] && m.slice(5, 7) !== S.my[0]) return false; }
    if (smActive()) { const a = num(S.sm[0]), b = num(S.sm[1]); if (S.smx) { if (d.sum !== a) return false; } else { if (!isNaN(a) && d.sum < a) return false; if (!isNaN(b) && d.sum > b) return false; } }
    if (S.co.trim()) { const c = (d.company || "").toLowerCase(), q = S.co.trim().toLowerCase(); if (S.cox ? c !== q : !c.includes(q)) return false; }
    const cs = prepared().cs;
    if (cs.length) {
      const r = S.join === "or" ? cs.some(x => condPass(d, x.c, x.f)) : cs.every(x => condPass(d, x.c, x.f));
      if (!r) return false;
    }
    return true;
  }
  function condText(c) {
    const f = fieldInfo(c.field);
    const name = f ? f.label : c.field;
    const v = Array.isArray(c.val) ? c.val.join(", ") : c.val;
    let sv = v;
    if (f && f.kind === "date") sv = String(v).includes("-") ? ruDate(v) : v;
    if (f && f.kind === "number" && !isNaN(num(v))) sv = PP.fmt(num(v));
    if (c.op === "in") return name + " ∈ [" + sv + "]";
    const sign = { eq: "=", neq: "≠", gt: ">", lt: "<", contains: "содержит", empty: "пусто", notempty: "не пусто" }[c.op] || c.op;
    return NOVAL[c.op] ? name + " " + sign : name + " " + sign + " " + sv;
  }
  function describe() {
    const out = [];
    S.pills.forEach(p => out.push(pillLabel(p)));
    if (S.stages.length) {
      const names = S.stages.map(id => ((PP.B && PP.B.stages.find(s => s.id === id)) || {}).name).filter(Boolean);
      out.push("Стадии: " + (names.length ? names.join(", ") : S.stages.length));
    }
    const rg = (t, a) => t + (a[0] ? " с " + ruDate(a[0]) : "") + (a[1] ? " по " + ruDate(a[1]) : "");
    if (S.cre[0] || S.cre[1]) out.push(rg("Создана", S.cre));
    if (S.mov[0] || S.mov[1]) out.push(rg("В стадии", S.mov));
    fieldChips().forEach(c => out.push(c.t));
    const cs = activeConds();
    if (cs.length) out.push((cs.length > 1 && S.join === "or" ? "Любое из: " : "") + cs.map(condText).join(S.join === "or" ? " или " : "; "));
    return out.join("; ");
  }

  // ---------- хранение ----------
  function loadLocal() {
    try { return (JSON.parse(localStorage.getItem(LS) || "{}") || {})[fid]; } catch (e) { return null; }
  }
  function saveLocal() {
    try { const all = JSON.parse(localStorage.getItem(LS) || "{}") || {}; all[fid] = S; localStorage.setItem(LS, JSON.stringify(all)); } catch (e) { /* без localStorage работаем в памяти */ }
  }
  function saveCfg() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const r = await call("post", "/api/filters/state", { cfg });
      const was = ui.cfgErr;
      ui.cfgErr = r && r.error ? r.error : "";
      if (ui.cfgErr || was) paint();
    }, 250);
  }

  // ---------- значения полей ----------
  function condCodes() { return [...new Set(S.conds.map(c => c.field).filter(c => c && c[0] !== "@"))]; }
  async function ensureValues() {
    if (!fid) return;
    const f0 = fid, ep = valEpoch, have = vals[f0] = vals[f0] || {};
    const need = condCodes().filter(c => !(c in have) && !inflight[f0 + "|" + c] && /^[A-Za-z0-9_]{1,80}$/.test(c));
    if (!need.length) return;
    const keys = need.map(c => f0 + "|" + c);
    keys.forEach(k => { inflight[k] = 1; });
    let failed = false;
    const wasErr = !!ui.valErr;
    try {
      for (let i = 0; i < need.length; i += 25) {
        const chunk = need.slice(i, i + 25);
        const r = await call("get", "/api/filters/values?f=" + encodeURIComponent(f0) + "&codes=" + chunk.join(","));
        if (ep !== valEpoch) return;        // доска перезагружена: ответ устарел
        if (r && r.values) {
          chunk.forEach(c => { have[c] = {}; });
          for (const id in r.values) for (const c in r.values[id]) if (have[c]) have[c][id] = r.values[id][c];
          ui.valErr = "";
        } else { failed = true; ui.valErr = (r && r.error) || "Не удалось получить значения полей"; break; }
      }
    } finally {
      if (ep === valEpoch) keys.forEach(k => { delete inflight[k]; });
    }
    if (ep !== valEpoch) return;
    if (failed) { paint(); return; }
    if (f0 === fid) { ver++; PP.refilter(); if (wasErr) paint(); else refresh(); }
  }
  async function ensureSchema(force) {
    if (!fid || (schemas[fid] && !force)) return;
    const f0 = fid;
    schemas[f0] = "loading";
    const r = await call("get", "/api/filters/fields?f=" + encodeURIComponent(f0));
    if (r && r.fields) { schemas[f0] = { fields: r.fields }; ui.schErr = ""; }
    else { delete schemas[f0]; ui.schErr = (r && r.error) || "Не удалось получить поля воронки"; schemas[f0] = { fields: [], error: ui.schErr, failed: true }; }
    ver++;
    if (f0 === fid) { paint(); ensureValues(); PP.refilter(); }
  }

  // ---------- применение ----------
  function changed(structural) {
    ver++;
    saveLocal();
    ensureValues();
    PP.refilter();
    if (structural) paint(); else refresh();
  }
  function counts() {
    const ds = PP.deals(), res = {};
    bypass = true;
    try {
      const pass = ds.filter(d => PP.match(d));
      PILLS.forEach(p => { res[p[0]] = p[0] === "all" ? pass.length : pass.filter(pillPred[p[0]]).length; });
    } finally { bypass = false; }
    return res;
  }
  function syncCount() {
    const fc = document.getElementById("fcount"), fb = document.getElementById("fbtn");
    if (!fc) return;
    const core = document.querySelectorAll("#fchips .fchip").length, n = core + (fid === PP.cur ? activeCount() : 0);
    fc.textContent = n ? n : "";
    if (fb) fb.classList.toggle("act", n > 0);
  }
  function refresh() {
    syncCount();
    if (wrap) {
      const cn = counts();
      wrap.querySelectorAll("[data-pc]").forEach(el => { el.textContent = cn[el.dataset.pc]; });
      foundPaint();
      const svb = wrap.querySelector("[data-save]"); if (svb) svb.disabled = !isActive();
      const cur = wrap.querySelector("[data-pa].on"); if (cur) { const p = cfg.presets.find(x => x.id === cur.dataset.pa); if (!p || !sameState(p.state)) cur.classList.remove("on"); }
      const bad = S.conds.length - activeConds().length;
      const w = wrap.querySelector(".flt-warn");
      if (w) w.textContent = bad > 0 ? bad + " " + plural(bad, "условие", "условия", "условий") + " не заполнено или поля нет в этой воронке: не применяется" : "";
    }
    chipsPaint(); barPaint();
  }
  function coreChips() {
    const F = PP.FS || {}, out = [];
    if (F.who) out.push(["who", "Ответственный: " + F.who]);
    if (F.mon) out.push(["mon", "Месяц: " + monName(F.mon)]);
    if (F.co) out.push(["co", "Клиент: " + F.co]);
    if (F.min) out.push(["min", "Сумма от " + F.min]);
    if (F.max) out.push(["max", "Сумма до " + F.max]);
    if (F.loc) out.push(["loc", "Только изменённые локально"]);
    return out;
  }
  function chipList() {
    const out = [];
    S.pills.forEach(p => out.push({ k: "pill:" + p, t: pillLabel(p) }));
    if (S.stages.length) out.push({ k: "stages", t: "Стадии: " + (S.stages.map(id => ((PP.B && PP.B.stages.find(x => x.id === id)) || {}).name).filter(Boolean).join(", ") || S.stages.length) });
    const rg = (t, a) => t + (a[0] ? " с " + ruDate(a[0]) : "") + (a[1] ? " по " + ruDate(a[1]) : "");
    if (S.cre[0] || S.cre[1]) out.push({ k: "cre", t: rg("Создана", S.cre) });
    if (S.mov[0] || S.mov[1]) out.push({ k: "mov", t: rg("В стадии", S.mov) });
    fieldChips().forEach(c => out.push({ k: c.k, t: c.t }));
    S.conds.forEach((c, i) => { if (condValid(c)) out.push({ k: "cond:" + i, t: condText(c) }); });
    coreChips().forEach(([k, t]) => out.push({ k: "core:" + k, t }));
    return out;
  }
  // чипы активных условий внутри строки поиска
  function chipsPaint() {
    const box = document.getElementById("fchips"); if (!box) return;
    const html = chipList().map(c => `<span class="fchip"><span class="fc-t" title="${esc(c.t)}">${esc(c.t)}</span><button type="button" data-unchip="${esc(c.k)}" aria-label="Убрать фильтр: ${esc(c.t)}" title="Убрать">×</button></span>`).join("");
    if (box.innerHTML !== html) box.innerHTML = html;
  }
  function sameState(p) { try { return JSON.stringify(normS(p)) === JSON.stringify(S); } catch (e) { return false; } }
  function presetLabel() {
    const cur = cfg.presets.find(p => p.id === ui.cur);
    if (cur && sameState(cur.state)) return cur.name;
    const cc = coreChips().length;
    if (!activeCount()) return "Все сделки";
    if (S.pills.length === 1 && activeCount() === 1 && !cc) return pillLabel(S.pills[0]);
    return "Свой фильтр";
  }
  function barPaint() {
    const pl = document.querySelector("#fpreset .flt-pl"); if (pl) { const t = presetLabel(); if (pl.textContent !== t) pl.textContent = t; }
    const gx = document.getElementById("fgx"), q = document.getElementById("q");
    if (gx) gx.classList.toggle("hidden", !(chipList().length || (q && q.value)));
  }
  function foundPaint() {
    const fe = wrap && wrap.querySelector(".flt-found"); if (!fe) return;
    const ds = PP.deals(); let n = 0;
    ds.forEach(d => { if (PP.match(d)) n++; });
    fe.innerHTML = "Найдено <b>" + n.toLocaleString("ru-RU") + "</b> из " + ds.length.toLocaleString("ru-RU");
    const none = wrap.querySelector(".flt-none");
    if (none) none.classList.toggle("on", ds.length > 0 && n === 0);
  }
  function unchip(k) {
    if (k.startsWith("pill:")) S.pills = S.pills.filter(x => x !== k.slice(5));
    else if (k === "stages") S.stages = [];
    else if (k === "cre") S.cre = ["", ""];
    else if (k === "mov") S.mov = ["", ""];
    else if (k === "who") { S.who = []; }
    else if (k === "my") S.my = ["", ""];
    else if (k === "sm") S.sm = ["", ""];
    else if (k === "co") S.co = "";
    else if (k.startsWith("cond:")) S.conds.splice(+k.slice(5), 1);
    else if (k.startsWith("core:")) { const c = k.slice(5), o = {}; o[c] = c === "loc" ? false : ""; if (PP.setFilters) PP.setFilters(o); changed(true); return; }
    changed(true);
  }
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };

  // ---------- отрисовка ----------
  function condRowHtml(c, i) {
    const fs = schemaFields();
    const f = fs.find(x => x.code === c.field);
    const sch = schemas[fid];
    const grp = (t, arr) => arr.length ? `<optgroup label="${t}">${arr.map(x => `<option value="${esc(x.code)}"${x.code === c.field ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</optgroup>` : "";
    const fsel = `<select data-cf="${i}" aria-label="Поле"><option value=""${c.field ? "" : " selected"}>Поле…</option>${grp("Карточка", fs.filter(x => x.code[0] === "@"))}${grp("Поля воронки", fs.filter(x => x.code[0] !== "@"))}${c.field && !f ? `<option value="${esc(c.field)}" selected>${esc(c.field)} (нет в воронке)</option>` : ""}</select>`;
    const kind = f ? f.kind : "text";
    const ops = KOPS[kind] || KOPS.text;
    const osel = `<select data-co="${i}" aria-label="Оператор">${ops.map(o => `<option value="${o}"${o === c.op ? " selected" : ""}>${OPS[o]}</option>`).join("")}</select>`;
    let v = "";
    if (!NOVAL[c.op] && f) {
      if (c.op === "in" && f.options) {
        const sel = Array.isArray(c.val) ? c.val : [];
        v = `<select multiple data-cvs="${i}" data-placeholder="Выберите значения" aria-label="Значения">${f.options.map(o => `<option${sel.includes(o) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      } else if (f.options && (c.op === "eq" || c.op === "neq")) {
        v = `<select data-cv="${i}" aria-label="Значение"><option value="">Выберите…</option>${f.options.map(o => `<option${o === c.val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      } else if (c.op === "in") {
        v = `<input data-cv="${i}" placeholder="значения через запятую" value="${esc(Array.isArray(c.val) ? c.val.join(", ") : c.val)}">`;
      } else {
        const t = kind === "date" ? "date" : "text";
        v = `<input data-cv="${i}" type="${t}"${kind === "number" ? ' inputmode="decimal"' : ""} placeholder="Значение" aria-label="Значение" value="${esc(Array.isArray(c.val) ? c.val.join(", ") : c.val)}">`;
      }
    }
    const bad = c.field && !f && !(sch === "loading" || !sch);
    return `<div class="flt-cond" data-ci="${i}">${fsel}${osel}<div class="flt-v">${v}</div><button class="b flt-x" data-cdel="${i}" aria-label="Удалить условие" title="Удалить условие"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>${bad ? '<span class="flt-bad">поля нет в этой воронке</span>' : ""}</div>`;
  }
  const EMPTY = (t, h, ic) => `<div class="flt-empty"><svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg><div><b>${t}</b>${h}</div></div>`;
  const FIELDS = [["who", "Ответственный"], ["stage", "Стадия"], ["my", "Месяц начисления"], ["cre", "Дата создания"], ["mov", "В стадии с"], ["sum", "Сумма"], ["co", "Клиент / компания"], ["loc", "Локальные правки"]];
  const VIS_LS = "pp_flt_vis";
  let vis = (() => { try { const a = JSON.parse(localStorage.getItem(VIS_LS) || "null"); if (Array.isArray(a)) return a.filter(k => FIELDS.some(f => f[0] === k)); } catch (e) { /* по умолчанию */ } return FIELDS.map(f => f[0]).filter(k => k !== "mov"); })();
  const saveVis = () => { try { localStorage.setItem(VIS_LS, JSON.stringify(vis)); } catch (e) { /* без localStorage */ } };
  const dkey = el => el.tagName + "|" + Object.entries(el.dataset).map(([a, b]) => a + "=" + b).join("&");
  function creMode() {
    const [a, b] = S.cre;
    if (!a && !b) return "any";
    if (a === isoOf(new Date()) && b === a) return "today";
    if (!b && a === daysAgoISO(7)) return "week";
    if (!b && a === daysAgoISO(30)) return "month";
    return "range";
  }
  function setCreMode(v) {
    ui.creRange = v === "range";
    if (v === "any") S.cre = ["", ""];
    else if (v === "today") S.cre = [isoOf(new Date()), isoOf(new Date())];
    else if (v === "week") S.cre = [daysAgoISO(7), ""];
    else if (v === "month") S.cre = [daysAgoISO(30), ""];
  }
  function clearField(k) {
    if (k === "who") S.who = []; else if (k === "stage") S.stages = []; else if (k === "my") S.my = ["", ""];
    else if (k === "cre") { S.cre = ["", ""]; ui.creRange = false; } else if (k === "mov") S.mov = ["", ""];
    else if (k === "sum") S.sm = ["", ""]; else if (k === "co") S.co = ""; else if (k === "loc") S.pills = S.pills.filter(x => x !== "local");
  }
  function fieldHtml(k) {
    const lab = (FIELDS.find(f => f[0] === k) || [])[1] || k;
    let c = "", wide = false;
    if (k === "who") {
      const names = [...new Set(PP.deals().map(d => d.who).filter(Boolean).concat(S.who))].sort((a, b) => a.localeCompare(b, "ru"));
      c = `<select multiple data-whs="1" data-placeholder="Все" aria-label="Ответственный">${names.map(n => `<option${S.who.includes(n) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
    } else if (k === "stage") {
      c = `<select multiple data-sts="1" data-placeholder="Все стадии" aria-label="Стадия">${PP.B ? PP.B.stages.map(x => `<option value="${esc(x.id)}"${S.stages.includes(x.id) ? " selected" : ""}>${esc(x.name)}</option>`).join("") : ""}</select>`;
    } else if (k === "my") {
      const years = [...new Set(PP.deals().map(d => (d.month || "").slice(0, 4)).filter(Boolean).concat(S.my[1] ? [S.my[1]] : [], [String(new Date().getFullYear())]))].sort().reverse();
      c = `<div class="flt-2"><select data-my="0" aria-label="Месяц"><option value="">Любой месяц</option>${MN.map((n, i) => { const v = String(i + 1).padStart(2, "0"); return `<option value="${v}"${S.my[0] === v ? " selected" : ""}>${n}</option>`; }).join("")}</select><select data-my="1" aria-label="Год"><option value="">Любой год</option>${years.map(y => `<option${S.my[1] === y ? " selected" : ""}>${y}</option>`).join("")}</select></div>`;
    } else if (k === "cre") {
      const cm = ui.creRange ? "range" : creMode();
      c = `<select data-crem="1" aria-label="Дата создания">${[["any", "Любая дата"], ["today", "Сегодня"], ["week", "За 7 дней"], ["month", "За 30 дней"], ["range", "Период…"]].map(([v, t]) => `<option value="${v}"${cm === v ? " selected" : ""}>${t}</option>`).join("")}</select>` +
        (cm === "range" ? `<div class="flt-2" style="margin-top:6px"><input type="date" data-rg="cre0" value="${esc(S.cre[0])}" aria-label="Создана с"><input type="date" data-rg="cre1" value="${esc(S.cre[1])}" aria-label="Создана по"></div>` : "");
    } else if (k === "mov") {
      c = `<div class="flt-2"><input type="date" data-rg="mov0" value="${esc(S.mov[0])}" aria-label="В стадии с"><input type="date" data-rg="mov1" value="${esc(S.mov[1])}" aria-label="В стадии по"></div>`;
    } else if (k === "sum") {
      const nf = v => String(v).replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      c = S.smx ? `<input type="text" inputmode="numeric" autocomplete="off" data-sm="0" placeholder="Сумма" value="${nf(S.sm[0])}" aria-label="Сумма">`
        : `<div class="flt-2"><input type="text" inputmode="numeric" autocomplete="off" data-sm="0" placeholder="от" value="${nf(S.sm[0])}" aria-label="Сумма от"><input type="text" inputmode="numeric" autocomplete="off" data-sm="1" placeholder="до" value="${nf(S.sm[1])}" aria-label="Сумма до"></div>`;
    } else if (k === "co") {
      c = `<input type="text" data-cq="1" placeholder="${S.cox ? "Название клиента точно" : "Часть названия клиента"}" value="${esc(S.co)}" autocomplete="off" aria-label="Клиент">`;
    } else if (k === "loc") {
      c = `<label class="flt-chk"><input type="checkbox" data-loc="1"${S.pills.includes("local") ? " checked" : ""}> Только изменённые локально</label>`;
    }
    return `<section class="flt-f${wide ? " wide" : ""}" data-field="${k}"><div class="flt-fh"><span class="flt-fl">${esc(lab)}</span><button type="button" class="flt-ib" data-fm="${k}" aria-haspopup="true" aria-label="Тип условия: ${esc(lab)}" title="Тип условия">⋯</button><button type="button" class="flt-ib" data-fx="${k}" aria-label="Убрать поле: ${esc(lab)}" title="Убрать поле">×</button></div>${c}</section>`;
  }
  function condsHtml() {
    const sch = schemas[fid];
    const note = sch === "loading" || !sch ? '<div class="flt-note">Загружаю поля воронки…</div>' : (sch.error ? `<div class="flt-err">${esc(sch.error)} <button type="button" class="b sm" data-retry="schema">Повторить</button></div>` : "");
    const vnote = ui.valErr ? `<div class="flt-err">${esc(ui.valErr)} <button type="button" class="b sm" data-retry="values">Повторить</button></div>` : "";
    const join = S.conds.length > 1 ? `<div class="flt-row"><span class="flt-note">Между условиями:</span><button type="button" class="b sm${S.join === "and" ? " flt-on" : ""}" data-join="and">И (все)</button><button type="button" class="b sm${S.join === "or" ? " flt-on" : ""}" data-join="or">ИЛИ (любое)</button></div>` : "";
    return `<section class="flt-sec"><h5>Условия по полям воронки</h5>${note}${vnote}${S.conds.map(condRowHtml).join("") || EMPTY("Условий пока нет", "Добавьте первое: поле, оператор, значение.", '<path d="M6 10h24M10 18h16M14 26h8"/>')}${join}
      <div class="flt-row"><button type="button" class="b sm" data-cadd="1">+ Условие</button><span class="flt-warn flt-note"></span></div></section>`;
  }
  function visiblePresets() { return cfg.presets.filter(p => !p.f || p.f === fid); }
  function sideHtml() {
    const rows = PILLS.map(([id]) => {
      const on = id === "all" ? !S.pills.length : S.pills.includes(id);
      return `<button type="button" class="flt-pr${on ? " on" : ""}" data-pill="${id}" aria-pressed="${on}"><span class="nm">${esc(pillLabel(id))}</span><small data-pc="${id}"></small></button>`;
    }).join("");
    const sv = visiblePresets().map(p => ui.renaming === p.id
      ? `<div class="flt-sv"><input data-rn="${esc(p.id)}" value="${esc(p.name)}" maxlength="80" aria-label="Название"><button type="button" class="b sm btn-create" data-rnok="${esc(p.id)}">OK</button></div>`
      : `<div class="flt-sv"><button type="button" class="flt-pr${ui.cur === p.id && sameState(p.state) ? " on" : ""}" data-pa="${esc(p.id)}" title="${esc(p.name)}"><span class="nm">${esc(p.name)}</span>${cfg.defaults[fid] === p.id ? '<span class="flt-star" title="По умолчанию">★</span>' : ""}</button><button type="button" class="flt-ib" data-pm="${esc(p.id)}" aria-haspopup="true" aria-label="Действия с фильтром «${esc(p.name)}»" title="Ещё">⋯</button></div>`).join("");
    return `<div class="flt-sh">Готовые</div>${rows}<div class="flt-sh">Сохранённые</div>${sv || '<div class="flt-note" style="padding:2px 8px">Пока нет. Настройте поля и нажмите «Сохранить фильтр…».</div>'}`;
  }
  function settingsHtml() {
    const me = users.map(u => `<option${u.name === meName() ? " selected" : ""}>${esc(u.name)}</option>`).join("");
    return `<div class="flt-row"><button type="button" class="b sm" data-view="filter">← К фильтру</button></div>
      <div class="flt-row"><label>Я — <select data-me="1" aria-label="Кто я"><option value="">не выбран</option>${me}</select></label></div>
      <div class="flt-row"><label>Застряли, дней <input type="text" inputmode="numeric" data-sd="1" value="${cfg.stuckDays}" style="width:90px"></label>
      <label>Крупные, сумма больше <input type="text" inputmode="numeric" data-bs="1" value="${cfg.bigSum}" style="width:150px"></label></div>
      <div class="flt-row"><label><input type="checkbox" data-scope="1"${cfg.scope === "funnel" ? " checked" : ""}> сохранять новые фильтры только для этой воронки</label></div>
      <div class="flt-note">Пороги и «я» хранятся локально на сервере панели.${users.length ? "" : " Список пользователей не загружен."}</div>
      <div class="flt-sec"><h5>Перенос сохранённых фильтров</h5><div class="flt-row"><button type="button" class="b sm" data-exp="1">Экспорт JSON</button><button type="button" class="b sm" data-imp="1">Импорт JSON</button></div>
      <textarea data-io="1" placeholder="Здесь появится JSON при экспорте. Для импорта вставьте JSON и нажмите «Импортировать»." spellcheck="false">${esc(ui.ioText)}</textarea>
      <div class="flt-row" style="margin-top:6px"><button type="button" class="b sm" data-iogo="1">Импортировать</button><button type="button" class="b sm" data-iocopy="1">Скопировать</button><span class="flt-note">${esc(ui.ioMsg)}</span></div>${ui.cfgErr ? `<div class="flt-err">${esc(ui.cfgErr)} <button type="button" class="b sm" data-retry="cfg">Повторить</button></div>` : ""}</div>`;
  }
  function fieldsHtml() {
    const ks = FIELDS.map(f => f[0]).filter(k => vis.includes(k));
    const showConds = S.conds.length > 0 || ui.showConds;
    return `<div class="flt-fgrid">${ks.map(fieldHtml).join("")}</div>${ks.length || showConds ? "" : '<div class="flt-empty"><div><b>Полей нет</b>Нажмите «+ Поле», чтобы добавить условия.</div></div>'}${showConds ? condsHtml() : ""}<div class="flt-none" role="status">Ничего не найдено. Ослабьте условия или нажмите «Сбросить».</div>`;
  }
  function footHtml() {
    if (ui.saving) return `<input data-sn="1" placeholder="Название фильтра" maxlength="80" aria-label="Название фильтра"><label class="flt-sc"><input type="checkbox" data-scope="1"${cfg.scope === "funnel" ? " checked" : ""}> только эта воронка</label><button type="button" class="b btn-create" data-sok="1">Сохранить</button><button type="button" class="b" data-scancel="1">Отмена</button>`;
    return `<button type="button" class="b btn-create" data-find="1" title="Применить и закрыть">Найти</button><button type="button" class="b" data-reset="1" title="Сбросить все условия">Сбросить</button><button type="button" class="b" data-addf="1" aria-haspopup="true">+ Поле</button><button type="button" class="b" data-save="1"${isActive() ? "" : " disabled"}>Сохранить фильтр…</button>`;
  }
  function paint() {
    if (!wrap) return;
    const ae = document.activeElement, fk = ae && wrap.contains(ae) && /^(BUTTON|INPUT)$/.test(ae.tagName) ? dkey(ae) : null;
    const ms = wrap.querySelector(".flt-main"), ss = wrap.querySelector(".flt-side");
    const sy = ms ? ms.scrollTop : 0, sy2 = ss ? ss.scrollTop : 0, sx2 = ss ? ss.scrollLeft : 0;
    wrap.innerHTML = `<div class="flt-top"><b>${ui.view === "settings" ? "Настройки фильтра" : "Фильтр"}</b><span class="flt-found" aria-live="polite"></span><span class="flt-sp"></span><button type="button" class="flt-bi" data-close="1" aria-label="Закрыть фильтр" title="Закрыть (Esc)">×</button></div>
      <div class="flt-body"><nav class="flt-side" aria-label="Готовые и сохранённые фильтры">${sideHtml()}</nav><div class="flt-main">${ui.view === "settings" ? settingsHtml() : fieldsHtml()}</div></div>
      <div class="flt-foot">${footHtml()}</div>`;
    refresh();
    const nm = wrap.querySelector(".flt-main"), ns = wrap.querySelector(".flt-side");
    if (nm) nm.scrollTop = sy; if (ns) { ns.scrollTop = sy2; ns.scrollLeft = sx2; }
    if (fk) { const el = [...wrap.querySelectorAll("button,input")].find(x => dkey(x) === fk); if (el) el.focus(); }
    if (PP.enhanceSelects) PP.enhanceSelects(wrap);
  }

  // ---------- события ----------
  function applyPreset(p) {
    S = normS(clone(p.state)); ui.cur = p.id; ui.creRange = false;
    changed(true);
    PP.toast("Фильтр «" + p.name + "» применён");
  }
  function addCond() {
    S.conds.push({ field: "", op: "eq", val: "" }); ver++;
    ui.view = "filter"; ui.showConds = true; ensureSchema();
    saveLocal(); paint();
    const sel = wrap.querySelector(`[data-cf="${S.conds.length - 1}"]`); if (sel) sel.focus();
  }
  function resetAll() {
    S = emptyS(); ver++; ui.cur = null; ui.creRange = false; ui.showConds = false;
    if (PP.setFilters) PP.setFilters({ q: "", who: "", mon: "", co: "", min: "", max: "", sort: "", loc: false });
    saveLocal(); PP.refilter(); paint();
  }
  function removeField(k) { clearField(k); vis = vis.filter(x => x !== k); saveVis(); changed(true); }
  function fieldMenu(k, btn) {
    const r = btn.getBoundingClientRect(), it = [];
    const mk = (label, fn, on) => it.push({ label: (on ? "✓ " : "") + label, onClick: fn });
    if (k === "who") { mk("Любой из выбранных", () => { S.whoX = false; changed(true); }, !S.whoX); mk("Все, кроме выбранных", () => { S.whoX = true; changed(true); }, S.whoX); }
    if (k === "sum") { mk("Диапазон (от и до)", () => { S.smx = false; changed(true); }, !S.smx); mk("Точно", () => { S.smx = true; S.sm = [S.sm[0], ""]; changed(true); }, S.smx); }
    if (k === "co") { mk("Содержит", () => { S.cox = false; changed(true); }, !S.cox); mk("Точно", () => { S.cox = true; changed(true); }, S.cox); }
    if (k === "cre") [["any", "Любая дата"], ["today", "Сегодня"], ["week", "За 7 дней"], ["month", "За 30 дней"], ["range", "Период…"]].forEach(([v, t]) => mk(t, () => { setCreMode(v); changed(true); }, (ui.creRange ? "range" : creMode()) === v));
    it.push({ label: "Очистить поле", onClick: () => { clearField(k); changed(true); } });
    menuAt(r.right - 210, r.bottom + 4, it);
  }
  function addFieldMenu(btn) {
    const r = btn.getBoundingClientRect();
    const it = FIELDS.filter(f => !vis.includes(f[0])).map(([k, l]) => ({ label: l, onClick: () => { vis.push(k); saveVis(); ui.view = "filter"; paint(); } }));
    it.push({ label: "Условие по полю воронки…", onClick: addCond });
    menuAt(r.left, r.bottom + 4, it);
  }
  function delPreset(id) {
    const p = cfg.presets.find(x => x.id === id); cfg.presets = cfg.presets.filter(x => x.id !== id);
    Object.keys(cfg.defaults).forEach(k => { if (cfg.defaults[k] === id) delete cfg.defaults[k]; });
    if (ui.cur === id) ui.cur = null;
    saveCfg(); paint(); PP.toast("Фильтр «" + (p ? p.name : "") + "» удалён");
  }
  function presetMenu(id, btn) {
    const r = btn.getBoundingClientRect(), isDef = cfg.defaults[fid] === id;
    menuAt(r.right, r.bottom + 4, [
      { label: isDef ? "Не открывать по умолчанию" : "Открывать по умолчанию", onClick: () => { if (isDef) delete cfg.defaults[fid]; else cfg.defaults[fid] = id; saveCfg(); paint(); } },
      { label: "Переименовать", onClick: () => { ui.renaming = id; paint(); const el = wrap.querySelector("[data-rn]"); if (el) { el.focus(); el.select(); } } },
      { label: "Удалить", danger: true, onClick: () => delPreset(id) }
    ]);
  }
  function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function onClick(e) {
    const t = e.target.closest("button,input[type=checkbox]"); if (!t || !wrap.contains(t)) return;
    const D = t.dataset;
    if (D.retry === "cfg") { saveCfg(); return; }
    if (D.retry) { if (D.retry === "schema") { delete schemas[fid]; ensureSchema(true); } else { ui.valErr = ""; ensureValues(); } paint(); return; }
    if (D.close || D.find) { closePanel(); return; }
    if (D.view) { ui.view = D.view; paint(); return; }
    if (D.wh !== undefined) { const i = S.who.indexOf(D.wh); if (t.checked && i < 0) S.who.push(D.wh); if (!t.checked && i >= 0) S.who.splice(i, 1); ui.cur = null; changed(false); return; }
    if (D.loc) { const i = S.pills.indexOf("local"); if (t.checked && i < 0) S.pills.push("local"); if (!t.checked && i >= 0) S.pills.splice(i, 1); changed(true); return; }
    if (D.fx) { removeField(D.fx); return; }
    if (D.fm) { fieldMenu(D.fm, t); return; }
    if (D.addf) { addFieldMenu(t); return; }
    if (D.pm) { presetMenu(D.pm, t); return; }
    if (D.pill) {
      if (D.pill === "all") S.pills = [];
      else {
        const i = S.pills.indexOf(D.pill);
        if (i >= 0) S.pills.splice(i, 1); else S.pills.push(D.pill);
        if (D.pill === "mine" && !meName() && S.pills.includes("mine")) { ui.view = "settings"; if (!users.length) loadUsers(); PP.toast("Выберите, кто вы, чтобы работал фильтр «Мои»"); }
      }
      changed(true); return;
    }
    if (D.stage) { const i = S.stages.indexOf(D.stage); if (i >= 0) S.stages.splice(i, 1); else S.stages.push(D.stage); changed(true); return; }
    if (D.cadd) { addCond(); return; }
    if (D.cdel !== undefined) { S.conds.splice(+D.cdel, 1); changed(true); return; }
    if (D.join) { S.join = D.join; changed(true); return; }
    if (D.ck) { const [i, k] = D.ck.split(":").map(Number); const c = S.conds[i], f = c && fieldInfo(c.field); if (!f) return; const o = f.options[k]; let a = Array.isArray(c.val) ? c.val.slice() : []; const j = a.indexOf(o); if (t.checked && j < 0) a.push(o); if (!t.checked && j >= 0) a.splice(j, 1); c.val = a; changed(false); return; }
    if (D.unchip) { unchip(D.unchip); return; }
    if (D.reset) { resetAll(); return; }
    if (D.save) { ui.saving = true; paint(); const el = wrap.querySelector("[data-sn]"); if (el) el.focus(); return; }
    if (D.scancel) { ui.saving = false; paint(); return; }
    if (D.sok) { savePreset(); return; }
    if (D.scope) { cfg.scope = t.checked ? "funnel" : "global"; saveCfg(); return; }
    if (D.pa) { const p = cfg.presets.find(x => x.id === D.pa); if (p) applyPreset(p); return; }
    if (D.pd) { if (cfg.defaults[fid] === D.pd) delete cfg.defaults[fid]; else cfg.defaults[fid] = D.pd; saveCfg(); paint(); return; }
    if (D.pr) { ui.renaming = D.pr; paint(); const el = wrap.querySelector("[data-rn]"); if (el) { el.focus(); el.select(); } return; }
    if (D.rncancel) { ui.renaming = null; paint(); return; }
    if (D.rnok) { renamePreset(D.rnok); return; }
    if (D.px) {
      const p = cfg.presets.find(x => x.id === D.px); cfg.presets = cfg.presets.filter(x => x.id !== D.px);
      Object.keys(cfg.defaults).forEach(k => { if (cfg.defaults[k] === D.px) delete cfg.defaults[k]; });
      saveCfg(); paint(); PP.toast("Фильтр «" + (p ? p.name : "") + "» удалён"); return;
    }
    if (D.exp) { ui.ioText = JSON.stringify({ presets: cfg.presets }, null, 1); ui.ioMsg = cfg.presets.length ? "Экспортировано: " + cfg.presets.length : "Нет сохранённых фильтров"; paint(); return; }
    if (D.imp) { const el = wrap.querySelector("[data-io]"); if (el) el.focus(); return; }
    if (D.iocopy) { const el = wrap.querySelector("[data-io]"); const txt = el ? el.value : ""; if (!txt) { ui.ioMsg = "Нечего копировать"; paint(); return; } (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => PP.toast("Скопировано"), () => { el.select(); PP.toast("Выделено, скопируйте вручную"); }); return; }
    if (D.iogo) { importPresets(); return; }
  }
  function savePreset() {
    const el = wrap.querySelector("[data-sn]"), name = (el ? el.value : "").trim();
    if (!name) { if (el) { el.focus(); el.style.borderColor = "#c8372d"; } return; }
    const p = { id: newId(), name: name.slice(0, 80), f: cfg.scope === "funnel" ? fid : null, state: clone(S) };
    const dup = cfg.presets.find(x => x.name.trim().toLowerCase() === p.name.toLowerCase() && (x.f || null) === p.f);
    if (dup) { p.id = dup.id; cfg.presets[cfg.presets.indexOf(dup)] = p; } else cfg.presets.push(p);
    ui.cur = p.id; ui.saving = false; saveCfg(); paint(); PP.toast((dup ? "Обновлён: " : "Сохранено: ") + p.name);
  }
  function renamePreset(id) {
    const el = wrap.querySelector("[data-rn]"), name = (el ? el.value : "").trim();
    if (!name) { if (el) el.focus(); return; }
    const p = cfg.presets.find(x => x.id === id); if (p) p.name = name.slice(0, 80);
    ui.renaming = null; saveCfg(); paint();
  }
  function importPresets() {
    const el = wrap.querySelector("[data-io]"), txt = (el ? el.value : "").trim();
    ui.ioText = txt;
    let j;
    try { j = JSON.parse(txt); } catch (e) { ui.ioMsg = "Это не JSON: " + e.message; paint(); return; }
    const arr = Array.isArray(j) ? j : j && Array.isArray(j.presets) ? j.presets : null;
    if (!arr) { ui.ioMsg = "Ожидается массив или {\"presets\": [...]}"; paint(); return; }
    let n = 0;
    arr.slice(0, 100).forEach(p => {
      if (!p || typeof p !== "object" || typeof p.name !== "string" || !p.name.trim()) return;
      cfg.presets = cfg.presets.filter(x => !(x.name.trim().toLowerCase() === p.name.trim().toLowerCase() && (x.f || null) === (typeof p.f === "string" && p.f ? p.f : null)));
    cfg.presets.push({ id: newId(), name: p.name.trim().slice(0, 80), f: typeof p.f === "string" && p.f ? p.f : null, state: normS(p.state) }); n++;
    });
    ui.ioMsg = n ? "Импортировано: " + n : "Подходящих фильтров не найдено";
    if (n) saveCfg();
    paint();
  }
  function onChange(e) {
    const t = e.target, D = t.dataset;
    if (D.me !== undefined) { cfg.me = t.value; const mu = (PP.users || []).find(u => u.name === t.value); PP.setMe(mu ? mu.id : ""); saveCfg(); changed(true); return; }
    if (D.cvs !== undefined) { S.conds[+D.cvs].val = [...t.selectedOptions].map(o => o.value); changed(false); return; }
    if (D.whs !== undefined) { S.who = [...t.selectedOptions].map(o => o.value); ui.cur = null; changed(false); return; }
    if (D.sts !== undefined) { S.stages = [...t.selectedOptions].map(o => o.value); ui.cur = null; changed(false); return; }
    if (D.my !== undefined) { S.my[+D.my] = t.value; changed(false); return; }
    if (D.crem !== undefined) { setCreMode(t.value); changed(true); return; }
    if (D.cf !== undefined) { const c = S.conds[+D.cf]; c.field = t.value; const f = fieldInfo(t.value); c.op = f ? KOPS[f.kind][0] : "eq"; c.val = ""; changed(true); return; }
    if (D.co !== undefined) { const c = S.conds[+D.co]; c.op = t.value; if (c.op === "in") c.val = fieldInfo(c.field) && fieldInfo(c.field).options ? [] : ""; else if (Array.isArray(c.val)) c.val = c.val[0] || ""; changed(true); return; }
    if (D.cv !== undefined && t.tagName === "SELECT") { S.conds[+D.cv].val = t.value; changed(false); return; }
  }
  let inT = null;
  function onInput(e) {
    const t = e.target, D = t.dataset;
    if (D.cv !== undefined && t.tagName === "INPUT") { S.conds[+D.cv].val = t.value; clearTimeout(inT); inT = setTimeout(() => changed(false), 200); return; }
    if (D.sm !== undefined) { const raw = t.value.replace(/\D/g, ""); S.sm[+D.sm] = raw; t.value = raw.replace(/\B(?=(\d{3})+(?!\d))/g, " "); clearTimeout(inT); inT = setTimeout(() => changed(false), 150); return; }
    if (D.cq !== undefined) { S.co = t.value; clearTimeout(inT); inT = setTimeout(() => changed(false), 150); return; }
    if (D.rg) { const k = D.rg.slice(0, 3), i = +D.rg[3]; S[k][i] = t.value; changed(false); return; }
    if (D.sd !== undefined) { const n = parseInt(t.value, 10); if (n >= 1) { cfg.stuckDays = Math.min(n, 3650); saveCfg(); clearTimeout(inT); inT = setTimeout(() => { ver++; PP.refilter(); refresh(); }, 250); } return; }
    if (D.bs !== undefined) { const n = parseFloat(t.value.replace(/\s/g, "")); if (n >= 0) { cfg.bigSum = n; saveCfg(); clearTimeout(inT); inT = setTimeout(() => { ver++; PP.refilter(); refresh(); }, 250); } return; }
  }
  function onKey(e) {
    if (e.key !== "Enter") return;
    const D = e.target.dataset;
    if (D.cv !== undefined || D.rg) { e.preventDefault(); clearTimeout(inT); changed(false); e.target.blur(); }
    if (D.sm !== undefined || D.cq !== undefined) { e.preventDefault(); clearTimeout(inT); changed(false); closePanel(); }
    if (D.sn !== undefined) { e.preventDefault(); savePreset(); }
    if (D.rn !== undefined) { e.preventDefault(); renamePreset(D.rn); }
  }

  // ---------- старт и смена воронки ----------
  async function loadUsers() {
    const r = await call("get", "/api/users");
    users = (r && r.items) || [];
    if (ui.view === "settings") paint();
  }
  function enterFunnel() {
    const f = PP.cur;
    if (f === fid) return false;
    fid = f; ui.saving = false; ui.renaming = null;
    let s = loadLocal();
    if (!s) {
      const dp = cfg.presets.find(p => p.id === cfg.defaults[fid] && (!p.f || p.f === fid));
      s = dp ? dp.state : null; if (dp) ui.cur = dp.id;
    }
    S = normS(s);
    ensureSchema(); ensureValues();
    return true;
  }
  function onBoard() {
    // доска перечитана (в т.ч. после bulk-правок): значения полей считаем устаревшими
    valEpoch++; vals = {}; inflight = {}; ver++; ui.valErr = "";
    const sw = enterFunnel();
    if (!sw) ensureValues();
    if (sw) { if (isActive()) PP.refilter(); paint(); } else refresh();
  }
  function onClear(e) {
    if (!e.target.closest || !e.target.closest("#fclr")) return;
    // ядро уже сбросило свои фильтры (его обработчик на самой кнопке выполнился раньше)
    S = emptyS(); ver++; ui.saving = false;
    saveLocal(); PP.refilter(); paint();
  }
  function mount() {
    if (document.getElementById("flt-wrap")) return false;
    wrap = document.createElement("div"); wrap.id = "flt-wrap"; wrap.className = "hidden";
    wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-label", "Фильтр");
    const head = document.querySelector(".bx-head"); if (head) head.after(wrap); else document.body.appendChild(wrap);
    wrap.addEventListener("click", onClick);
    wrap.addEventListener("change", onChange);
    wrap.addEventListener("input", onInput);
    wrap.addEventListener("keydown", onKey);
    buildBar();
    return true;
  }
  const GEAR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>';
  function buildBar() {
    const bar = document.querySelector(".bx-filter"); if (!bar || document.getElementById("fpreset")) return;
    const pb = document.createElement("button"); pb.type = "button"; pb.id = "fpreset"; pb.className = "flt-preset";
    pb.setAttribute("aria-haspopup", "dialog"); pb.setAttribute("aria-expanded", "false"); pb.title = "Готовые и сохранённые фильтры";
    pb.innerHTML = '<span class="flt-pl">Все сделки</span><i class="caret"></i>';
    bar.prepend(pb);
    const gear = document.createElement("button"); gear.type = "button"; gear.id = "fgear"; gear.className = "flt-bi"; gear.title = "Настройки фильтра"; gear.setAttribute("aria-label", "Настройки фильтра"); gear.innerHTML = GEAR;
    const gx = document.createElement("button"); gx.type = "button"; gx.id = "fgx"; gx.className = "flt-bi hidden"; gx.title = "Сбросить фильтр и поиск"; gx.setAttribute("aria-label", "Сбросить фильтр и поиск"); gx.textContent = "×";
    bar.append(gear, gx);
    const q = document.getElementById("q"); if (q) q.placeholder = "Поиск";
    pb.addEventListener("click", e => { if (panelOpen()) closePanel(); else openPanel("filter", e.detail === 0); });
    gear.addEventListener("click", () => { if (panelOpen() && ui.view === "settings") closePanel(); else { if (!users.length) loadUsers(); openPanel("settings", false); } });
    gx.addEventListener("click", () => { resetAll(); const q2 = document.getElementById("q"); if (q2) q2.focus(); });
    bar.addEventListener("click", e => { if (e.target.closest("#fchips [data-unchip],#fgear,#fgx,#fpreset")) return; if (!panelOpen()) openPanel("filter", false); });
    if (q) q.addEventListener("keydown", e => { if (e.key === "ArrowDown" && !panelOpen()) { e.preventDefault(); openPanel("filter", true); } });
    const ch = document.getElementById("fchips"); if (ch) ch.addEventListener("click", e => { const b = e.target.closest("[data-unchip]"); if (b) { e.stopPropagation(); unchip(b.dataset.unchip); } });
  }
  function panelOpen() { return !!wrap && !wrap.classList.contains("hidden"); }
  function placePanel() {
    const bar = document.querySelector(".bx-filter"); if (!bar || !wrap) return;
    const r = bar.getBoundingClientRect(), w = Math.min(740, innerWidth - 16);
    wrap.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    wrap.style.top = (r.bottom + 6) + "px";
    wrap.style.maxHeight = Math.max(240, innerHeight - r.bottom - 18) + "px";
  }
  function openPanel(view, focus) {
    if (!wrap) return;
    if (view) ui.view = view;
    if (S.conds.length) ensureSchema();
    wrap.classList.remove("hidden"); paint(); placePanel();
    const pb = document.getElementById("fpreset"); if (pb) pb.setAttribute("aria-expanded", "true");
    if (focus) { const f = wrap.querySelector(".flt-pr.on,.flt-pr"); if (f) f.focus(); }
  }
  function closePanel() {
    if (!panelOpen()) return;
    const had = wrap.contains(document.activeElement);
    wrap.classList.add("hidden"); ui.saving = false;
    const pb = document.getElementById("fpreset"); if (pb) { pb.setAttribute("aria-expanded", "false"); if (had) pb.focus(); }
  }
  PP.openFilter = (v) => openPanel(v || "filter", false);
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !panelOpen()) return;
    if (document.querySelector(".ctxmenu,.ic-ov:not(.hidden)")) return;
    if (ui.saving) { ui.saving = false; paint(); return; }
    closePanel();
  });
  document.addEventListener("mousedown", e => {
    if (!panelOpen()) return;
    const t = e.target;
    if (!t || !t.closest || !document.body.contains(t)) return;
    if (t.closest("#flt-wrap,.bx-filter,.ctxmenu,.toast,.ic-ov,.ic-selpop,.ic-datepop,[role=dialog]")) return;
    closePanel();
  });
  window.addEventListener("resize", () => { if (panelOpen()) placePanel(); });
  async function init() {
    if (!mount()) return;
    PP.chipHook = () => { chipsPaint(); barPaint(); };
    PP.addFilter(myFilter);
    document.addEventListener("click", onClear);
    PP.on("board:loaded", onBoard);
    PP.on("board:rendered", refresh);
    const r = await call("get", "/api/filters/state");
    if (r && r.cfg) {
      Object.assign(cfg, r.cfg);
      // схлопнуть старые дубли пресетов с одним именем (остаётся последний)
      const seen = new Map(), remap = {};
      (cfg.presets || []).forEach(p => { const k = (p.f || "") + "|" + String(p.name).trim().toLowerCase(); if (seen.has(k)) remap[seen.get(k).id] = p.id; seen.set(k, p); });
      if (Object.keys(remap).length) {
        cfg.presets = [...seen.values()];
        Object.keys(cfg.defaults || {}).forEach(k => { if (remap[cfg.defaults[k]]) cfg.defaults[k] = remap[cfg.defaults[k]]; });
        saveCfg();
      }
    }
    else ui.cfgErr = (r && r.error) || "Не удалось загрузить сохранённые фильтры";
    loadUsers();
    if (PP.B) { fid = null; onBoard(); } else paint();
  }
  init();
})();
