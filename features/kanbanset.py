"""Фича kanbanset: настройка канбана и стадий (поля на карточке, плотность, цветовая метка, свёртка колонок,
косметика стадий, WIP-лимиты, диалог закрытия сделки). Всё локально, в Битрикс ничего не пишем.
Состояние: core.feat «kanbanset» = {"cfg": {fid: {...}}, "reasons": [...], "closures": [...]}."""
import re
import time

_CODE_RE = re.compile(r"^[A-Za-z0-9_]{1,80}$")
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_ID_RE = re.compile(r"^[A-Za-z0-9_]{1,40}$")
MAX_CLOSURES = 1000
MAX_FIELDS = 6
DEFAULT_REASONS = ["Дорого", "Выбрали конкурента", "Нет бюджета", "Не отвечает", "Дубль", "Другое"]
_schema_cache = {}


def _ids(v, limit=300):
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        x = str(x)
        if 0 < len(x) <= 80 and x not in out:
            out.append(x)
    return out[:limit]


def sanitize(c):
    """Приводит присланную настройку воронки к безопасному виду."""
    c = c if isinstance(c, dict) else {}
    out = {}
    out["fields"] = [x for x in _ids(c.get("fields"), MAX_FIELDS) if _CODE_RE.match(x)]
    out["density"] = c.get("density") if c.get("density") in ("compact", "normal", "full") else "normal"
    sh = c.get("show") if isinstance(c.get("show"), dict) else {}
    out["show"] = {k: bool(sh.get(k, True)) for k in ("who", "sum", "company", "chips")}
    col = c.get("color") if isinstance(c.get("color"), dict) else {}
    code = str(col.get("code") or "")
    cmap = {}
    if isinstance(col.get("map"), dict):
        for k, v in list(col["map"].items())[:80]:
            if isinstance(v, str) and _HEX_RE.match(v) and len(str(k)) <= 120:
                cmap[str(k)] = v
    out["color"] = {"code": code if _CODE_RE.match(code) else "", "map": cmap}
    out["collapsed"] = _ids(c.get("collapsed"))
    out["hidden"] = _ids(c.get("hidden"))
    out["order"] = _ids(c.get("order"))
    out["colsum"] = bool(c.get("colsum", True))
    out["sort"] = c.get("sort") if c.get("sort") in ("", "sumd", "title", "new") else ""
    stg = {}
    if isinstance(c.get("stages"), dict):
        for k, v in list(c["stages"].items())[:300]:
            if not isinstance(v, dict) or len(str(k)) > 80:
                continue
            e = {}
            nm = str(v.get("name") or "").strip()[:60]
            if nm:
                e["name"] = nm
            if isinstance(v.get("color"), str) and _HEX_RE.match(v["color"]):
                e["color"] = v["color"]
            if e:
                stg[str(k)] = e
    out["stages"] = stg
    wip = {}
    if isinstance(c.get("wip"), dict):
        for k, v in list(c["wip"].items())[:300]:
            try:
                n = int(v)
            except (TypeError, ValueError, OverflowError):
                continue
            if 0 < n <= 9999 and len(str(k)) <= 80:
                wip[str(k)] = n
    out["wip"] = wip
    return out


def sanitize_reasons(v):
    out = []
    if isinstance(v, list):
        for x in v:
            x = str(x).strip()[:60]
            if x and x not in out:
                out.append(x)
    return out[:40]


def register(api, core):
    def _funnel(fid):
        snap = core.snapshot()
        return next((x for x in snap["funnels"] if x["id"] == fid), None), snap

    @api.get("/api/kanbanset/config")
    def get_cfg(req):
        fid = req.arg("f", "")
        st = core.feat_load("kanbanset", {})
        reasons = st.get("reasons")
        if not isinstance(reasons, list) or not reasons:
            reasons = DEFAULT_REASONS
        return {"ok": True, "cfg": (st.get("cfg") or {}).get(fid) or {}, "reasons": reasons}

    @api.post("/api/kanbanset/config")
    def set_cfg(req):
        fid = str(req.body.get("f") or "")
        f, _ = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        cfg = sanitize(req.body.get("cfg"))

        def upd(st):
            c = st.get("cfg")
            if not isinstance(c, dict):
                c = st["cfg"] = {}
            c[fid] = cfg
        core.feat_update("kanbanset", upd, {})
        return {"ok": True, "cfg": cfg}

    @api.post("/api/kanbanset/reasons")
    def set_reasons(req):
        r = sanitize_reasons(req.body.get("reasons"))
        if not r:
            return (400, {"error": "нужна хотя бы одна причина"})
        core.feat_update("kanbanset", lambda st: st.__setitem__("reasons", r), {})
        return {"ok": True, "reasons": r}

    @api.get("/api/kanbanset/schema")
    def schema(req):
        fid = req.arg("f", "")
        hit = _schema_cache.get(fid)
        if hit and time.time() - hit[0] < 60:
            return hit[1]
        sch = core.card_schema(fid)
        if sch is None:
            return (404, {"error": "нет такой воронки"})
        res = {"ok": True, "fields": [{"code": x["code"], "label": x["label"], "kind": x["kind"]} for x in sch["fields"]]}
        _schema_cache[fid] = (time.time(), res)
        return res

    @api.get("/api/kanbanset/values")
    def values(req):
        fid = req.arg("f", "")
        f, snap = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        codes = [c for c in req.arg("codes", "").split(",") if c]
        if len(codes) > 12 or any(not _CODE_RE.match(c) for c in codes):
            return (400, {"error": "некорректный список полей"})
        items, labels, meta = core._field_catalog(fid)
        ov = core.load(core.STATE, {}).get("fields") or {}
        users = snap["users"]
        out = {}
        for s in f["stages"]:
            for d in s["deals"]:
                did = d["ID"]
                doc = dict(items.get(did) or {})
                doc.update(ov.get(did) or {})
                row = {}
                for c in codes:
                    v = doc.get(c)
                    if isinstance(v, dict):
                        v = ""
                    if isinstance(v, list):
                        v = [x for x in v if not isinstance(x, (dict, list))]
                    try:
                        t = core.fmt_val(c, v, users)
                    except Exception:      # noqa: BLE001
                        t = str(v) if v not in (None, [], {}) else ""
                    t = "" if t is None else str(t)
                    if t:
                        row[c] = t
                if row:
                    out[did] = row
        return {"ok": True, "values": out, "labels": {c: labels.get(c) or c for c in codes}}

    @api.post("/api/kanbanset/closure")
    def closure(req):
        b = req.body if isinstance(req.body, dict) else {}
        f, deal = b.get("f"), b.get("deal")
        if not (isinstance(f, str) and isinstance(deal, str) and _ID_RE.match(f) and _ID_RE.match(deal)):
            return (400, {"error": "некорректная карточка"})
        kind = b.get("kind")
        if kind not in ("won", "lost"):
            return (400, {"error": "некорректный тип закрытия"})
        reason, comment = b.get("reason") or "", b.get("comment") or ""
        if not isinstance(reason, str) or not isinstance(comment, str) or len(reason) > 200 or len(comment) > 2000:
            return (400, {"error": "слишком длинный текст"})
        reason, comment = reason.strip(), comment.strip()
        if kind == "lost" and not reason:
            return (400, {"error": "укажите причину"})
        if core._find_card(f, deal)[2] is None:
            return (404, {"error": "нет такой карточки"})
        rec = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "f": f, "deal": deal,
               "to": str(b.get("to") or "")[:80], "toName": str(b.get("toName") or "")[:80], "kind": kind,
               "reason": reason, "comment": comment}

        def upd(st):
            cl = st.get("closures")
            if not isinstance(cl, list):
                cl = st["closures"] = []
            cl.append(rec)
            del cl[:-MAX_CLOSURES]
        core.feat_update("kanbanset", upd, {})
        return {"ok": True}

    @api.get("/api/kanbanset/closures")
    def closures(req):
        st = core.feat_load("kanbanset", {})
        deal = req.arg("deal", "")
        rows = [r for r in (st.get("closures") or []) if not deal or r.get("deal") == deal]
        return {"ok": True, "rows": rows[-200:]}
