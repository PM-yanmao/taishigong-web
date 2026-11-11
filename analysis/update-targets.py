import json
p = r"tools\art-batch-map.json"
m = json.load(open(p, encoding="utf-8"))
targets = {"L2A":0.23, "L3":0.19, "A1":0.27, "A2":0.22, "A3":0.21}
for item in m:
    if item.get("id") in targets:
        item["target_p50"] = targets[item["id"]]
json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("targets updated")
