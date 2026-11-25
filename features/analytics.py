"""Фича analytics: поиск возможных дублей карточек воронки + «не дубль» (локально, в Битрикс ничего не пишем)."""
import hashlib
import re

MAX_GROUPS = 200
MAX_COMPARISONS = 1_000_000
MAX_CARDS = 300_000
MAX_NOTDUPE = 5000
MAX_SHOW = 12          # карточек в группе в ответе
RULES = ("title", "company_sum", "title_company")
_QUOTES = re.compile(r"[«»\"'`“”„‟‘’]")
_WS = re.compile(r"\s+")


def norm(s):
    return _WS.sub(" ", _QUOTES.sub("", str(s or "")).lower()).strip()


def register(api, core):
    def _gkey(ids):
        return hashlib.sha1(",".join(sorted(ids)).encode()).hexdigest()[:16]

    def _hidden(fid):
        st = core.feat_load("analytics", {})
        return set((st.get("notdupe") or {}).get(fid) or [])

    @api.get("/api/analytics/dupes")
    def dupes(req):
        fid = req.arg("f", "")
        rules = [r for r in req.arg("rules", "title").split(",") if r in RULES]
        if not rules:
            return (400, {"error": "нужно выбрать хотя бы одно правило: " + ", ".join(RULES)})
        snap = core.snapshot()
        f = next((x for x in snap["funnels"] if x["id"] == fid), None)
        if not f:
            return (404, {"error": "нет такой воронки"})
        st = core.load(core.STATE, {})
        ov, moves = st.get("fields") or {}, st.get("moves") or {}
        stage_names = {s["id"]: s["name"] for s in f["stages"]}
        cards, scanned_all = [], 0
        for s in f["stages"]:
            for d in s["deals"]:
                scanned_all += 1
                if len(cards) >= MAX_CARDS:
                    continue
                o = ov.get(d["ID"]) or {}
                sid = (moves.get(d["ID"]) or {}).get("to") or s["id"]
                company = snap["companies"].get(str(d.get("COMPANY_ID")), "") or o.get("_COMPANY_TEXT", "")
                cards.append({
                    "id": d["ID"], "title": o.get("TITLE") or d.get("TITLE") or "",
                    "stageId": sid, "stageName": stage_names.get(sid, sid),
                    "sum": round(core._money(o.get("OPPORTUNITY") or d.get("OPPORTUNITY"))),
                    "company": company, "who": snap["users"].get(str(d.get("ASSIGNED_BY_ID")), ""),
                    "created": (d.get("DATE_CREATE") or "")[:10]})
        total_in_funnel = sum(s.get("count", 0) for s in f["stages"])
        hidden = _hidden(fid)
        by_set, comparisons, truncated = {}, 0, False

        def add_group(rule, members):
            nonlocal comparisons, truncated
            k = len(members)
            if k < 2:
                return
            comparisons += k * (k - 1) // 2
            ids = sorted(m["id"] for m in members)
            key = _gkey(ids)
            g = by_set.get(key)
            if g is None:
                by_set[key] = {"key": key, "rules": [rule], "size": k, "ids": ids, "members": members}
            elif rule not in g["rules"]:
                g["rules"].append(rule)

        for rule in rules:
            buckets = {}
            for c in cards:
                if rule == "title":
                    t = norm(c["title"])
                    k = t if t else None
                elif rule == "company_sum":
                    co = norm(c["company"])
                    k = (co, c["sum"]) if co and c["sum"] > 0 else None
                else:
                    t, co = norm(c["title"]), norm(c["company"])
                    k = (t, co) if t and co else None
                if k is not None:
                    buckets.setdefault(k, []).append(c)
            for members in buckets.values():
                if comparisons > MAX_COMPARISONS:
                    truncated = True
                    break
                add_group(rule, members)
            if truncated:
                break
        groups = [g for g in by_set.values() if g["key"] not in hidden]
        hidden_n = len(by_set) - len(groups)
        groups.sort(key=lambda g: (-g["size"], g["ids"][0]))
        if len(groups) > MAX_GROUPS:
            truncated = True
            groups = groups[:MAX_GROUPS]
        for g in groups:
            g["members"] = sorted(g["members"], key=lambda m: m["created"])[:MAX_SHOW]
            g["more"] = g["size"] - len(g["members"])
            g["ids"] = g["ids"][:500]
        return {"ok": True, "f": fid, "rules": rules, "groups": groups, "hidden": hidden_n, "scanned": len(cards),
                "in_snapshot": scanned_all, "total": total_in_funnel, "comparisons": comparisons, "truncated": truncated}

    @api.post("/api/analytics/notdupe")
    def notdupe(req):
        fid, key = str(req.body.get("f") or ""), str(req.body.get("key") or "")
        if not fid or len(fid) > 40 or not re.fullmatch(r"[0-9a-f]{16}", key):
            return (400, {"error": "нужны f и key"})
        if not any(x["id"] == fid for x in core.snapshot()["funnels"]):
            return (404, {"error": "нет такой воронки"})
        undo = bool(req.body.get("undo"))
        full = []

        def upd(st):
            lst = st.setdefault("notdupe", {}).setdefault(fid, [])
            if undo:
                if key in lst:
                    lst.remove(key)
            elif key not in lst:
                if len(lst) >= MAX_NOTDUPE:
                    full.append(1)
                    return
                lst.append(key)
        core.feat_update("analytics", upd, {})
        if full:
            return (400, {"error": "слишком много скрытых групп, сначала покажите скрытые"})
        return {"ok": True}

    @api.post("/api/analytics/notdupe/reset")
    def reset(req):
        fid = str(req.body.get("f") or "")
        if not fid or len(fid) > 40:
            return (400, {"error": "нужна f"})

        def upd(st):
            (st.get("notdupe") or {}).pop(fid, None)
        core.feat_update("analytics", upd, {})
        return {"ok": True}
