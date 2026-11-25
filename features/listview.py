"""Фича listview: значения полей для вида «Список», настройки колонок, импорт CSV (локально, в Битрикс ничего не пишем)."""
import re
import sys
import traceback

MAX_ROWS = 300
MAX_COLS = 40
_CODE_RE = re.compile(r"^[A-Za-z0-9_]{1,80}$")
BASE_COLS = {"_id", "_title", "_stage", "_company", "_who", "_month", "_sum", "_created", "_moved"}


def _col_ok(k):
    return isinstance(k, str) and (k in BASE_COLS or (k.startswith("f:") and bool(_CODE_RE.match(k[2:]))))


def register(api, core):
    def _funnel(fid):
        snap = core.snapshot()
        return next((x for x in snap["funnels"] if x["id"] == fid), None), snap

    def _deal_ids(f):
        return [d["ID"] for s in f["stages"] for d in s["deals"]]

    # ---------- значения полей ----------
    @api.get("/api/listview/rows")
    def rows(req):
        fid = req.arg("f", "")
        f, snap = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        cols = [c for c in req.arg("cols", "").split(",") if c]
        if len(cols) > MAX_COLS or any(not _CODE_RE.match(c) for c in cols):
            return (400, {"error": "некорректный список колонок"})
        ids = [i for i in req.arg("ids", "").split(",") if i]
        if len(ids) > 20000:
            return (400, {"error": "слишком много id"})
        items, labels, meta = core._field_catalog(fid)
        ov = core.load(core.STATE, {}).get("fields") or {}
        want = ids or _deal_ids(f)
        users = snap["users"]
        out = {}
        for did in want:
            doc = dict(items.get(did) or {})
            doc.update(ov.get(did) or {})
            row = {}
            for c in cols:
                v = doc.get(c)
                if isinstance(v, (dict,)):
                    v = ""
                if isinstance(v, list):
                    v = [x for x in v if not isinstance(x, (dict, list))]
                try:
                    row[c] = core.fmt_val(c, v, users)
                except Exception:      # noqa: BLE001
                    row[c] = str(v) if v not in (None, [], {}) else ""
            out[did] = row
        return {"ok": True, "rows": out, "cols": cols}

    # ---------- настройки колонок ----------
    @api.get("/api/listview/config")
    def get_cfg(req):
        fid = req.arg("f", "")
        st = core.feat_load("listview", {})
        c = (st.get("cfg") or {}).get(fid) or {}
        if isinstance(c, dict) and isinstance(c.get("cols"), list):
            c = dict(c, cols=[k for k in c["cols"] if _col_ok(k)][:MAX_COLS])
        return {"ok": True, "cfg": c if isinstance(c, dict) else {}}

    @api.post("/api/listview/config")
    def set_cfg(req):
        b = req.body
        fid = str(b.get("f") or "")
        f, _ = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        cols = b.get("cols")
        if not isinstance(cols, list) or len(cols) > MAX_COLS or not all(_col_ok(c) for c in cols):
            return (400, {"error": "cols: ожидается список до %d кодов колонок (_id… или f:КОД)" % MAX_COLS})
        size = b.get("size")
        if size not in (50, 100, 200):
            size = 50
        sort = b.get("sort") if isinstance(b.get("sort"), dict) else {}
        sk = sort.get("k")
        sk = sk if _col_ok(sk) else ""
        sd = "desc" if sort.get("dir") == "desc" else "asc"
        entry = {"cols": cols, "size": size, "sort": {"k": sk, "dir": sd} if sk else {}}

        def upd(st):
            if not isinstance(st.get("cfg"), dict):
                st["cfg"] = {}
            st["cfg"][fid] = entry
        core.feat_update("listview", upd, {})
        return {"ok": True}

    # ---------- импорт ----------
    def _enum_value(meta, code, text):
        m = meta.get(code) or {}
        en = m.get("enum")
        if not en:
            return text, None
        t = str(text).strip()
        if t in en:
            return t, None
        for k, v in en.items():
            if str(v).strip().lower() == t.lower():
                return k, None
        return None, "значение «%s» не из списка поля" % t[:40]

    @api.post("/api/listview/import")
    def do_import(req):
        b = req.body
        fid = str(b.get("f") or "")
        f, snap = _funnel(fid)
        if not f:
            return (404, {"error": "нет такой воронки"})
        rows_in = b.get("rows")
        if not isinstance(rows_in, list):
            return (400, {"error": "rows: ожидается список"})
        if not rows_in:
            return (400, {"error": "нет строк для импорта"})
        if len(rows_in) > MAX_ROWS:
            return (400, {"error": "не больше %d строк за раз, получено %d" % (MAX_ROWS, len(rows_in))})
        skip_dups = bool(b.get("skip_dups"))
        stages = f["stages"]
        by_name = {s["name"].strip().lower(): s["id"] for s in stages}
        first = stages[0]["id"] if stages else ""
        if not first:
            return (400, {"error": "в воронке нет стадий"})
        users = {str(n).strip().lower(): k for k, n in snap["users"].items()}
        items, labels, meta = core._field_catalog(fid)
        # существующие (название, сумма) — с учётом локальных правок
        seen = set()
        if skip_dups:
            bd = core.board(fid) or {"stages": []}
            for s in bd["stages"]:
                for d in s["deals"]:
                    seen.add((d["title"].strip().lower(), round(d["sum"], 2)))
        created, skipped, errors, warnings = [], [], [], []
        for i, r in enumerate(rows_in):
            n = r.get("n", i + 1) if isinstance(r, dict) else i + 1
            if not isinstance(r, dict):
                errors.append({"row": n, "error": "строка не объект"})
                continue
            title = str(r.get("title") or "").strip()
            if not title:
                errors.append({"row": n, "error": "нет названия"})
                continue
            raw_sum = r.get("sum")
            if raw_sum in (None, ""):
                opp = 0.0
            else:
                opp = core._money(raw_sum)
                if opp == 0.0 and not re.search(r"\d", str(raw_sum)):
                    errors.append({"row": n, "error": "сумма не число: «%s»" % str(raw_sum)[:30]})
                    continue
            if opp < 0 or opp > 1e13:
                errors.append({"row": n, "error": "сумма вне допустимого диапазона"})
                continue
            stage = first
            sname = str(r.get("stage") or "").strip()
            if sname:
                stage = by_name.get(sname.lower())
                if not stage:
                    stage = first
                    warnings.append({"row": n, "warning": "стадия «%s» не найдена, карточка в первой стадии" % sname[:40]})
            who = ""
            wname = str(r.get("who") or "").strip()
            if wname:
                who = users.get(wname.lower(), "")
                if not who:
                    warnings.append({"row": n, "warning": "ответственный «%s» не найден, поле пусто" % wname[:40]})
            key = (title.lower(), round(opp, 2))
            if skip_dups and key in seen:
                skipped.append({"row": n, "reason": "уже есть: название и сумма совпали"})
                continue
            flds, bad = {}, None
            rf = r.get("fields") if isinstance(r.get("fields"), dict) else {}
            if len(rf) > MAX_COLS:
                errors.append({"row": n, "error": "слишком много полей"})
                continue
            for code, val in rf.items():
                if not isinstance(code, str) or code not in labels:
                    bad = "неизвестное поле «%s»" % str(code)[:40]
                    break
                if val in (None, ""):
                    continue
                if isinstance(val, (dict, list)):
                    bad = "поле «%s»: значение должно быть текстом" % labels.get(code, code)
                    break
                val = str(val).strip()[:1000]
                ev, err = _enum_value(meta, code, val)
                if err:
                    bad = "поле «%s»: %s" % (labels.get(code, code), err)
                    break
                flds[code] = ev
            if bad:
                errors.append({"row": n, "error": bad})
                continue
            try:
                res = core.create_card(fid, stage, title, opp, who, flds)
            except Exception:      # noqa: BLE001
                traceback.print_exc(file=sys.stderr)
                errors.append({"row": n, "error": "ошибка создания карточки (детали в журнале сервера)"})
                continue
            if res.get("error"):
                errors.append({"row": n, "error": res["error"]})
                continue
            seen.add(key)
            created.append({"row": n, "id": res.get("id")})
        return {"ok": True, "created": len(created), "ids": [c["id"] for c in created], "skipped": skipped, "errors": errors, "warnings": warnings}
