"""Generate npm license/version inventory from actual lockfile and installed metadata."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
lock=json.loads((root/'package-lock.json').read_text())
items=[]
for location,entry in sorted(lock['packages'].items()):
 if not location:continue
 package=root/location/'package.json'
 metadata=json.loads(package.read_text()) if package.exists()else{}
 name=metadata.get('name')or location.rsplit('node_modules/',1)[-1]
 items.append({'name':name,'version':entry['version'],'license':metadata.get('license',entry.get('license','Unknown: review upstream')),'development_only':bool(entry.get('dev',False)),'optional':bool(entry.get('optional',False)),'integrity':entry.get('integrity'),'repository':metadata.get('repository'),'metadata_source':'installed package + lock'if metadata else'lockfile only'})
(root/'dependency-inventory.json').write_text(json.dumps({'format':1,'items':items},indent=2,ensure_ascii=False)+'\n')
print(f'Inventoried {len(items)} resolved dependency entries')
