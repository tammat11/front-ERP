"""Фича bulk: групповые действия, отмена/повтор, дублирование, избранное. Всё локально, в Битрикс ничего не пишется.

Отмена: перед каждым действием снимаем срез затронутых частей core.STATE (moves, fields, robot_keys, notes, deleted, created)
только для затронутых id. Откат подменяет эти части срезом и сам возвращает «обратный» срез для повтора.
Стек сессионный (живёт в памяти сервера), до 30 действий.
"""
import copy
import re
import threading
import time
import traceback

MAXN = 200
MAXH = 30
_ID = re.compile(r"^(?:\d{1,12}|L\d{1,9})$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SECT = (("move", "moves"), ("fields", "fields"), ("robot_keys", "robot_keys"), ("notes", "notes"), ("deleted", "deleted"))
_HL = threading.Lock()
UNDO, REDO = [], []
_SC = {}


def register(api, core):
    now = lambda: time.strftime("%Y-%m-%d %H:%M:%S")      # noqa: E731

    # ---------- срезы состояния и отмена ----------
    def part(st, i):
        p = {k: copy.deepcopy((st.get(sk) or {}).get(i)) for k, sk in _SECT}
        p["created"] = copy.deepcopy(next((c for c in (st.get("created") or []) if c.get("ID") == i), None))
        return p

    def capture(ids):
        with core._lock:
            st = core.load(core.STATE, {"moves": {}})
            return {i: part(st, i) for i in ids}

    def apply_parts(parts, expect=None):
        """Записать срез. Если задан expect, карточки, чьё состояние не равно expect[id], НЕ трогаем (изменены позже).
        Вернуть (applied: {id: состояние до записи}, skipped: [id])."""
        applied, skipped = {}, []
        with core._lock:
            st = core.load(core.STATE, {"moves": {}})
            for i, p in parts.items():
                cur = part(st, i)
                if expect is not None and cur != expect.get(i):
                    skipped.append(i)
                    continue
                applied[i] = cur
                for k, sk in _SECT:
                    d = st.setdefault(sk, {})
                    if p.get(k) is None:
                        d.pop(i, None)
                    else:
                        d[i] = copy.deepcopy(p[k])
                st["created"] = [c for c in (st.get("created") or []) if c.get("ID") != i]
                if p.get("created"):
                    st["created"].append(copy.deepcopy(p["created"]))
            if applied:
                core._save_state(st)
        return applied, skipped

    def hist(fid=None):
        with _HL:
            u, r = (UNDO[-1] if UNDO else None), (REDO[-1] if REDO else None)
            return {"undo": len(UNDO), "redo": len(REDO), "undoLabel": u["label"] if u else "", "redoLabel": r["label"] if r else "",
                    "undoF": u["fid"] if u else "", "redoF": r["fid"] if r else ""}

    def push(entry):
        with _HL:
            UNDO.append(entry)
            del UNDO[:-MAXH]
            del REDO[:]

    def swap(src, dst, event, fid):
        """→ (entry, applied_ids, skipped_ids) | (None, ...) если стек пуст | ("other", entry) если запись из другой воронки."""
        with _HL:
            if not src:
                return None, [], []
            entry = src[-1]
            if fid and entry["fid"] != fid:
                return "other", entry, []
            src.pop()
        try:
            applied, skipped = apply_parts(entry["parts"], entry["after"])
        except Exception:      # noqa: BLE001
            with _HL:
                src.append(entry)           # запись не теряем
            raise
        if applied:
            inv = {"label": entry["label"], "fid": entry["fid"], "parts": {i: entry["after"][i] for i in applied},
                   "after": {i: entry["parts"][i] for i in applied}}
            with _HL:
                dst.append(inv)
                del dst[:-MAXH]
            gone = [i for i in applied if (entry["parts"][i] or {}).get("created") is None and entry["after"][i].get("created")]
            if gone and event == "undo_local":
                keys = {"%s:%s" % (entry["fid"], i) for i in gone}
                core.feat_update("bulk", lambda d: d.__setitem__("favs", [k for k in (d.get("favs") or []) if k not in keys]))
        for i in applied:
            core.journal({"ts": now(), "event": event, "deal": i, "funnel": entry["fid"], "note": entry["label"], "text": "только локально"})
        return entry, sorted(applied), sorted(skipped)

    def reset_hook():
        with _HL:
            del UNDO[:]
            del REDO[:]

        def f(d):
            d["favs"] = [k for k in (d.get("favs") or []) if not k.split(":", 1)[-1].startswith("L")]
        core.feat_update("bulk", f)

    core.RESET_HOOKS.append(reset_hook)

    # ---------- проверка входа ----------
    def clean_ids(raw):
        if not isinstance(raw, list):
            return None, ["ids должен быть списком"]
        if len(raw) > 5000:
            return None, ["слишком длинный список"]
        seen, ids, bad = set(), [], []
        for x in raw:
            if isinstance(x, bool) or not isinstance(x, (str, int)):
                bad.append(str(x)[:20])
                continue
            s = str(x).strip()
            if not _ID.match(s):
                bad.append(s[:20])
                continue
            if s not in seen:
                seen.add(s)
                ids.append(s)
        return ids, bad

    def prep(req):
        """→ (ошибка|None, ctx). ctx: fid, ids (известные), unknown, invalid, index {id: (stage, deal)}, cur(id), snap."""
        b = req.body
        fid = b.get("f")
        if not isinstance(fid, str) or not fid or len(fid) > 40:
            return (400, {"error": "не указана воронка"}), None
        snap = core.snapshot()
        f = next((x for x in snap["funnels"] if x["id"] == fid), None)
        if not f:
            return (400, {"error": "нет такой воронки"}), None
        ids, bad = clean_ids(b.get("ids"))
        if ids is None:
            return (400, {"error": bad[0]}), None
        if not ids:
            return (400, {"error": "не выбрано ни одной карточки", "invalid": bad}), None
        if len(ids) > MAXN:
            return (400, {"error": "не больше %d карточек за раз (выбрано %d)" % (MAXN, len(ids))}), None
        index = {}
        for s in f["stages"]:
            for d in s["deals"]:
                index[d["ID"]] = (s["id"], d)
        moves = core.load(core.STATE, {}).get("moves") or {}
        known = [i for i in ids if i in index]
        unknown = [i for i in ids if i not in index]
        if not known:
            return (400, {"error": "ни одной известной карточки в этой воронке", "unknown": unknown, "invalid": bad}), None
        return None, {"fid": fid, "f": f, "ids": known, "unknown": unknown, "invalid": bad, "index": index, "snap": snap,
                      "cur": lambda i: (moves.get(i) or {}).get("to") or index[i][0]}

    def run(label, ctx, item):
        """Выполнить item(id) для каждой карточки с записью в историю отмены.
        item → {"error":..} | {"skip":..} | {"ok":True, "new":id?, "data":...}"""
        entry = {"label": label, "parts": capture(ctx["ids"])}
        done, errors, skipped, new, first = [], [], [], [], None
        for i in ctx["ids"]:
            try:
                r = item(i) or {}
            except Exception as e:      # noqa: BLE001
                traceback.print_exc()
                r = {"error": "сбой при выполнении"}
            if r.get("error"):
                errors.append({"id": i, "error": str(r["error"])[:160]})
            elif r.get("skip"):
                skipped.append({"id": i, "reason": str(r["skip"])[:80]})
            else:
                done.append(i)
                if first is None:
                    first = dict(r.get("data") or {}, id=i)
                if r.get("new"):
                    new.append(r["new"])
        if new:
            for n in new:
                entry["parts"][n] = {"move": None, "fields": None, "robot_keys": None, "notes": None, "deleted": None, "created": None}
        if done:
            entry["fid"] = ctx["fid"]
            entry["after"] = capture(list(entry["parts"]))
            push(entry)
        out = {"ok": True, "label": label, "done": len(done), "doneIds": done, "errors": errors, "skipped": skipped,
               "unknown": ctx["unknown"], "invalid": ctx["invalid"], "new": new, "first": first, "hist": hist(ctx["fid"])}
        if not done and not skipped:
            out.update(ok=False, error=(errors[0]["error"] if errors else "ничего не выполнено"))
            return 400, out
        return out

    def plural(n, a, b, c):
        n10, n100 = n % 10, n % 100
        return a if n10 == 1 and n100 != 11 else b if 2 <= n10 <= 4 and not 12 <= n100 <= 14 else c

    def cards(n):
        return "%d %s" % (n, plural(n, "карточка", "карточки", "карточек"))

    # ---------- групповые действия ----------
    @api.post("/api/bulk/move")
    def b_move(req):
        err, c = prep(req)
        if err:
            return err
        to = req.body.get("to")
        if not isinstance(to, str) or to not in {s["id"] for s in c["f"]["stages"]}:
            return (400, {"error": "нет такой стадии"})
        toname = next(s["name"] for s in c["f"]["stages"] if s["id"] == to)
        robots = [0]

        def item(i):
            if c["cur"](i) == to:
                return {"skip": "уже в этой стадии"}
            r = core.move(c["fid"], i, to, calc=len(c["ids"]) <= 3)
            if r.get("error"):
                return {"error": r["error"]}
            if r.get("changed"):
                robots[0] += 1
            return {"ok": True, "data": {"final": r.get("final"), "trace": r.get("trace") or [], "changed": r.get("changed") or {}}}
        res = run("Перенос: %s → «%s»" % (cards(len(c["ids"])), toname), c, item)
        body = res[1] if isinstance(res, tuple) else res
        body["robots"] = robots[0]
        return res

    @api.post("/api/bulk/assign")
    def b_assign(req):
        err, c = prep(req)
        if err:
            return err
        who = req.body.get("who")
        who = str(who).strip() if isinstance(who, (str, int)) and not isinstance(who, bool) else ""
        users = c["snap"]["users"]
        name = users.get(who) or "#" + who
        if not who or who not in users:
            return (400, {"error": "неизвестный ответственный"})

        def item(i):
            r = core.edit_card(c["fid"], i, {"ASSIGNED_BY_ID": who})
            return {"error": r["error"]} if r.get("error") else {"ok": True}
        return run("Ответственный «%s»: %s" % (name, cards(len(c["ids"]))), c, item)

    def schema(fid):
        t = _SC.get(fid)
        if t and time.time() - t[0] < 120:
            return t[1]
        s = core.card_schema(fid)
        _SC[fid] = (time.time(), s)
        return s

    @api.post("/api/bulk/field")
    def b_field(req):
        err, c = prep(req)
        if err:
            return err
        code, val = req.body.get("code"), req.body.get("value")
        sch = schema(c["fid"]) or {"fields": []}
        fl = next((x for x in sch["fields"] if x["code"] == code), None) if isinstance(code, str) else None
        if not fl:
            return (400, {"error": "такого поля нет в схеме воронки"})
        if isinstance(val, bool) or not isinstance(val, (str, int, float)):
            return (400, {"error": "значение должно быть текстом или числом"})
        val = str(val).strip()
        if len(val) > 500:
            return (400, {"error": "значение длиннее 500 символов"})
        if val:
            if fl["kind"] == "select" and val not in {str(o["v"]) for o in (fl.get("options") or [])}:
                return (400, {"error": "значения нет в списке поля"})
            if fl["kind"] == "number" and not core._NUMLIKE(val):
                return (400, {"error": "нужно число"})
            if fl["kind"] == "date" and not _DATE.match(val):
                return (400, {"error": "дата в формате ГГГГ-ММ-ДД"})

        def item(i):
            r = core.edit_card(c["fid"], i, {code: val})
            return {"error": r["error"]} if r.get("error") else {"ok": True}
        return run("Поле «%s»: %s" % (fl["label"], cards(len(c["ids"]))), c, item)

    @api.post("/api/bulk/note")
    def b_note(req):
        err, c = prep(req)
        if err:
            return err
        text = req.body.get("text")
        if not isinstance(text, str) or not text.strip():
            return (400, {"error": "пустая заметка"})
        if len(text) > 2000:
            return (400, {"error": "заметка длиннее 2000 символов"})

        def item(i):
            r = core.add_note(c["fid"], i, text)
            return {"error": r["error"]} if r.get("error") else {"ok": True}
        return run("Заметка: %s" % cards(len(c["ids"])), c, item)

    @api.post("/api/bulk/delete")
    def b_delete(req):
        err, c = prep(req)
        if err:
            return err

        def item(i):
            r = core.delete_card(c["fid"], i)
            return {"error": r["error"]} if r.get("error") else {"ok": True}
        return run("Удаление: %s" % cards(len(c["ids"])), c, item)

    @api.post("/api/bulk/duplicate")
    def b_dup(req):
        err, c = prep(req)
        if err:
            return err
        fid = c["fid"]
        items, _labels, _meta = core._field_catalog(fid)

        def item(i):
            stage, d = c["index"][i]
            st = core.load(core.STATE, {})
            doc = dict(items.get(i) or {})
            doc.update((st.get("fields") or {}).get(i) or {})
            title = str(doc.get("TITLE") or d.get("TITLE") or "")
            if not title.endswith("(копия)"):
                title = (title + " (копия)")[:200]
            flds = {}
            for k, v in doc.items():
                if not isinstance(k, str) or k.startswith("_") or not k.replace("_", "").isalnum() or core._TECH_RE.match(k):
                    continue
                if isinstance(v, (str, int, float)) and not isinstance(v, bool) and str(v) not in ("", "<none>"):
                    flds[k] = v
                elif isinstance(v, list) and v and all(isinstance(x, (str, int, float)) for x in v):
                    flds[k] = list(v)
            comp = c["snap"]["companies"].get(str(d.get("COMPANY_ID")), "") or doc.get("_COMPANY_TEXT") or ""
            if comp:
                flds["_COMPANY_TEXT"] = comp
            r = core.create_card(fid, c["cur"](i), title, doc.get("OPPORTUNITY", d.get("OPPORTUNITY", 0)),
                                 doc.get("ASSIGNED_BY_ID", d.get("ASSIGNED_BY_ID", "")), flds)
            if r.get("error"):
                return {"error": r["error"]}
            return {"ok": True, "new": r["id"]}
        return run("Дубликат: %s" % cards(len(c["ids"])), c, item)

    # ---------- отмена и повтор ----------
    def undo_redo(req, src, dst, event, empty, verb):
        fid = req.body.get("f")
        fid = fid if isinstance(fid, str) and len(fid) <= 40 else ""
        try:
            e, applied, skipped = swap(src, dst, event, fid)
        except Exception:      # noqa: BLE001
            traceback.print_exc()
            return (500, {"error": "не удалось выполнить откат, запись сохранена", "hist": hist(fid)})
        if e is None:
            return (400, {"error": empty, "hist": hist(fid)})
        if e == "other":
            return (409, {"error": "Это действие сделано в другой воронке. Откройте её, чтобы %s." % verb, "fid": applied.get("fid") if isinstance(applied, dict) else "", "hist": hist(fid)})
        return {"ok": True, "label": e["label"], "ids": applied, "skipped": skipped, "f": e["fid"], "hist": hist(fid)}

    @api.post("/api/bulk/undo")
    def b_undo(req):
        return undo_redo(req, UNDO, REDO, "undo_local", "нечего отменять", "отменить его")

    @api.post("/api/bulk/redo")
    def b_redo(req):
        return undo_redo(req, REDO, UNDO, "redo_local", "нечего повторять", "повторить его")

    @api.get("/api/bulk/history")
    def b_hist(req):
        return {"hist": hist()}

    # ---------- избранное ----------
    @api.get("/api/bulk/favs")
    def b_favs(req):
        return {"items": core.feat_load("bulk", {}).get("favs") or []}

    @api.post("/api/bulk/fav")
    def b_fav(req):
        err, c = prep(req)
        if err:
            return err
        on = req.body.get("on")
        if not isinstance(on, bool):
            return (400, {"error": "on должно быть true/false"})
        keys = ["%s:%s" % (c["fid"], i) for i in c["ids"]]

        def upd(data):
            cur = [k for k in (data.get("favs") or []) if k not in keys]
            if on:
                cur += keys
            data["favs"] = cur[-5000:]
            return data["favs"]
        return {"ok": True, "items": core.feat_update("bulk", upd)}
