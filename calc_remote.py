"""Только чтение Битрикса: роботы и триггеры стадий (bizproc.workflow.template.list) для воронок сделок и смарт-процессов -> /tmp/procs_robots.json."""
import sys, types, os, json
os.chdir(os.path.expanduser("~/obzvon-app")); sys.path.insert(0, ".")
for m in ("login_journal", "vystavlenie", "pf_export", "bi_engine"):
    sys.modules[m] = types.ModuleType(m)
src = open("app.py").read().split("\n")
cut = next(i for i, l in enumerate(src) if l.startswith("threading.Thread(target=_warmup"))
code = "\n".join(src[:cut]).replace("app.logger.addHandler(handler)", "pass")
ns = {"__name__": "probe", "__file__": os.path.abspath("app.py")}
exec(compile(code, "app_copy", "exec"), ns)
bx = ns["bx_call"]


import json
calc, get_meta = ns["calc_realizatsiya_amounts"], ns["get_deal_fields"]
import base64
deals = json.loads(base64.b64decode(sys.argv[1]))
meta = get_meta()
out = {}
for did, deal in deals.items():
    try:
        fields, comment = calc(deal, meta)
        out[did] = {"fields": fields, "comment": comment}
    except Exception as e:
        out[did] = {"error": str(e)[:200]}
sys.stdout.write("\n@@JSON@@" + json.dumps(out, ensure_ascii=False))
