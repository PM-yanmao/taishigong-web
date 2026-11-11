import json
p = r"tools\art-batch-map.json"
m = json.load(open(p, encoding="utf-8"))
for item in m:
    if item.get("id") == "L1":
        item.pop("skip", None)
        item["target_p50"] = 0.20
json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("L1 included")
