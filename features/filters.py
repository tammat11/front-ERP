"""Фича filters: значения полей для конструктора условий, список полей воронки, сохранённые фильтры (локально)."""
import json
import re

_CODE_RE = re.compile(r"^[A-Za-z0-9_]{1,80}$")
MAX_CODES = 30
MAX_QUERY = 2500           # символов в параметре codes
MAX_PRESETS = 200
MAX_STATE_BYTES = 400000


def _s(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


def _clean_state(st):
    """Пропускаем только известные ключи и простые типы: чужой JSON в хранилище не попадёт."""
    if not isinstance(st, dict):
        return {}
    out = {}
    out["pills"] = [_s(x, 24) for x in (st.get("pills") or [])[:20] if isinstance(x, str)]
    out["stages"] = [_s(x, 80) for x in (st.get("stages") or [])[:200] if isinstance(x, str)]
    for k in ("cre", "mov"):
        r = st.get(k)
        out[k] = [_s(r[0], 10), _s(r[1], 10)] if isinstance(r, list) and len(r) == 2 else ["", ""]
    conds = []
    for c in (st.get("conds") or [])[:30]:
        if not isinstance(c, dict):
            continue
        v = c.get("val")
        if isinstance(v, list):
            v = [_s(x, 200) for x in v[:200] if isinstance(x, str)]
        else:
            v = _s(v, 200)
        conds.append({"field": _s(c.get("field"), 90), "op": _s(c.get("op"), 12), "val": v})
    out["conds"] = conds
    out["join"] = "or" if st.get("join") == "or" else "and"
    return out


def _clean_cfg(d):
    if not isinstance(d, dict):
        return {}
    presets = []
    for p in (d.get("presets") or [])[:MAX_PRESETS]:
        if not isinstance(p, dict) or not _s(p.get("name"), 80):
            continue
        presets.append({"id": _s(p.get("id"), 40) or str(len(presets) + 1), "name": _s(p.get("name"), 80),
                        "f": _s(p.get("f"), 40) or None, "state": _clean_state(p.get("state"))})
    defaults = {}
    for k, v in (d.get("defaults") or {}).items() if isinstance(d.get("defaults"), dict) else []:
        if isinstance(k, str) and isinstance(v, str) and len(defaults) < 300:
            defaults[k[:40]] = v[:40]
    try:
        sd = int(d.get("stuckDays", 7))
    except (TypeError, ValueError):
        sd = 7
    try:
        bs = float(d.get("bigSum", 1000000))
    except (TypeError, ValueError):
        bs = 1000000.0
    if bs != bs or bs in (float("inf"), float("-inf")):
        bs = 1000000.0
    return {"me": _s(d.get("me"), 120), "stuckDays": max(1, min(3650, sd)), "bigSum": max(0, min(1e12, bs)),
            "scope": "funnel" if d.get("scope") == "funnel" else "global", "presets": presets, "defaults": defaults}


def register(api, core):
    def _funnel(fid):
        snap = core.snapshot()
        return next((x for x in snap["funnels"] if x["id"] == fid), None), snap

    @api.get("/api/filters/fields")
    def fields(req):
        fid = req.arg("f", "")
        f, _ = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        sch = core.card_schema(fid) or {"fields": []}
        out = []
        for x in sch["fields"]:
            opts = [o["t"] for o in x["options"]] if x.get("options") else None
            out.append({"code": x["code"], "label": x["label"], "kind": x["kind"], "options": opts})
        return {"ok": True, "fields": out}

    @api.get("/api/filters/values")
    def values(req):
        fid = req.arg("f", "")
        raw = req.arg("codes", "")
        if len(raw) > MAX_QUERY:
            return (400, {"error": "слишком длинный список кодов"})
        codes = [c for c in raw.split(",") if c]
        if not codes or len(codes) > MAX_CODES or any(not _CODE_RE.match(c) for c in codes):
            return (400, {"error": "некорректный список кодов полей"})
        f, snap = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        items, labels, meta = core._field_catalog(fid)
        ov = core.load(core.STATE, {}).get("fields") or {}
        users = snap["users"]
        memo = {}
        out = {}
        for s in f["stages"]:
            for d in s["deals"]:
                did = d["ID"]
                doc = dict(items.get(did) or {})
                doc.update(ov.get(did) or {})
                row = {}
                for c in codes:
                    v = doc.get(c)
                    if v in (None, "", [], {}, "0", 0) or isinstance(v, dict):
                        continue
                    if isinstance(v, list):
                        v = [x for x in v if not isinstance(x, (dict, list))]
                    try:
                        key = (c, json.dumps(v, ensure_ascii=False, sort_keys=True))
                        if key not in memo:
                            memo[key] = core.fmt_val(c, v, users)
                        t = memo[key]
                    except Exception:      # noqa: BLE001
                        t = str(v)
                    if t:
                        row[c] = t
                if row:
                    out[did] = row
        return {"ok": True, "values": out}

    @api.get("/api/filters/state")
    def get_state(req):
        return {"ok": True, "cfg": _clean_cfg(core.feat_load("filters", {}))}

    @api.post("/api/filters/state")
    def set_state(req):
        cfg = req.body.get("cfg")
        if not isinstance(cfg, dict):
            return (400, {"error": "нужен объект cfg"})
        if len(json.dumps(cfg, ensure_ascii=False)) > MAX_STATE_BYTES:
            return (413, {"error": "слишком большие настройки фильтров"})
        clean = _clean_cfg(cfg)
        core.feat_save("filters", clean)
        return {"ok": True, "cfg": clean}
