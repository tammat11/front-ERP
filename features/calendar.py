"""Фича calendar: даты карточек и настройки для видов «Календарь» и «Мои дела» (дела хранит фича timeline; локально, в Битрикс не пишем)."""
import re

_CODE_RE = re.compile(r"^[A-Za-z0-9_]{1,80}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_RU = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")
MAX_ITEMS = 3000
MAX_DATEFIELDS = 100
MODES = ("month", "week", "day")


def norm_date(v):
    """ДД.ММ.ГГГГ и ISO (с временем или без) → YYYY-MM-DD, иначе ''."""
    if isinstance(v, list):
        v = v[0] if v else ""
    if not isinstance(v, str):
        return ""
    v = v.strip()
    m = _ISO.match(v)
    if m:
        return "%s-%s-%s" % m.groups()
    m = _RU.match(v)
    if m:
        return "%04d-%02d-%02d" % (int(m.group(3)), int(m.group(2)), int(m.group(1)))
    return ""


def register(api, core):
    def _funnel(fid):
        snap = core.snapshot()
        return next((x for x in snap["funnels"] if x["id"] == fid), None), snap

    def _deals(f):
        for s in f["stages"]:
            for d in s["deals"]:
                yield s, d

    @api.get("/api/calendar/datefields")
    def datefields(req):
        fid = req.arg("f", "")
        f, snap = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        items, labels, meta = core._field_catalog(fid)
        ov = core.load(core.STATE, {}).get("fields") or {}
        ids = [d["ID"] for _, d in _deals(f)]
        codes = set()
        for c, m in (meta or {}).items():
            if (m or {}).get("type") in ("date", "datetime"):
                codes.add(c)
        for c, lb in (labels or {}).items():
            if lb and "дата" in lb.lower():
                codes.add(c)
        out = []
        for c in codes:
            n = 0
            for i in ids:
                v = (ov.get(i) or {}).get(c, (items.get(i) or {}).get(c))
                if norm_date(v):
                    n += 1
            if n:
                out.append({"code": c, "label": (labels.get(c) or c).strip(), "count": n})
        out.sort(key=lambda x: (-x["count"], x["label"]))
        return {"ok": True, "items": out}

    @api.get("/api/calendar/dates")
    def dates(req):
        fid, code = req.arg("f", ""), req.arg("code", "")
        d1, d2 = req.arg("from", ""), req.arg("to", "")
        if not _CODE_RE.match(code):
            return (400, {"error": "некорректный код поля"})
        if not (_DATE_RE.match(d1) and _DATE_RE.match(d2)):
            return (400, {"error": "from и to — даты YYYY-MM-DD"})
        f, snap = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        items, labels, meta = core._field_catalog(fid)
        st = core.load(core.STATE, {})
        ov, mv = st.get("fields") or {}, st.get("moves") or {}
        out = []
        for s, d in _deals(f):
            i = d["ID"]
            v = (ov.get(i) or {}).get(code, (items.get(i) or {}).get(code))
            day = norm_date(v)
            if not day or day < d1 or day > d2:
                continue
            out.append({"id": i, "f": fid, "date": day, "title": (ov.get(i) or {}).get("TITLE") or d.get("TITLE") or ("#" + i),
                        "company": snap["companies"].get(str(d.get("COMPANY_ID")), ""), "stage": s["name"],
                        "stageId": (mv.get(i) or {}).get("to") or s["id"]})
            if len(out) >= MAX_ITEMS:
                break
        out.sort(key=lambda x: (x["date"], x["title"]))
        return {"ok": True, "items": out, "label": (labels.get(code) or code).strip()}

    @api.get("/api/calendar/prefs")
    def get_prefs(req):
        return {"ok": True, "prefs": core.feat_load("calendar", {})}

    @api.post("/api/calendar/prefs")
    def set_prefs(req):
        b = req.body
        patch = {}
        if "mode" in b:
            if b["mode"] not in MODES:
                return (400, {"error": "режим: month, week или day"})
            patch["mode"] = b["mode"]
        for k in ("showActs", "showDates"):
            if k in b:
                patch[k] = bool(b[k])
        if "me" in b:
            me = str(b["me"] or "")[:20]
            if me and me not in core.snapshot()["users"]:
                return (400, {"error": "нет такого пользователя"})
            patch["me"] = me
        if "dateField" in b:
            fid, code = str(b.get("f", "")), str(b["dateField"] or "")
            if code and not _CODE_RE.match(code):
                return (400, {"error": "некорректный код поля"})
            if len(fid) > 40:
                return (400, {"error": "слишком длинный идентификатор воронки"})
            if not _funnel(fid)[0]:
                return (404, {"error": "нет такой воронки"})
            patch["dateField"] = (fid, code)

        def upd(st):
            for k, v in patch.items():
                if k != "dateField":
                    st[k] = v
            if "dateField" in patch:
                fid, code = patch["dateField"]
                df = st.get("dateFields") if isinstance(st.get("dateFields"), dict) else {}
                if code:
                    if fid not in df and len(df) >= MAX_DATEFIELDS:
                        return False
                    df[fid] = code
                else:
                    df.pop(fid, None)
                st["dateFields"] = df
            return True
        if not core.feat_update("calendar", upd, {}):
            return (400, {"error": "слишком много сохранённых полей дат"})
        return {"ok": True, "prefs": core.feat_load("calendar", {})}
