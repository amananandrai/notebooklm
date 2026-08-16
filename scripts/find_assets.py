import json, re, sys

with open(r'C:\Users\Rentorzo\.gemini\antigravity\brain\9ec32e1d-8672-407b-8e41-4bfe0cc48e8c\.system_generated\steps\2852\content.md', 'r', encoding='utf-8') as f:
    text = f.read()

# Find all asset IDs
ids = re.findall(r'"([a-z_0-9]+)":\{"(?:type|donated|name)', text)

keywords = ['chair', 'plant', 'pot', 'fern', 'lamp', 'book', 'desk', 'arm', 'sofa', 'couch', 'monitor', 'screen', 'speaker', 'shelf', 'stool', 'mic', 'studio', 'floor', 'panel']
for aid in ids:
    for kw in keywords:
        if kw in aid:
            print(aid)
            break
