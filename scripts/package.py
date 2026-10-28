"""Deterministic source-only ZIP: sorted paths, fixed dates/modes, no secrets/caches.
Run from project root: python3 scripts/package.py [output-directory]
Manifest includes itself as a file with no self-referential hash.
"""
from pathlib import Path
import hashlib,json,sys,zipfile
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent
out.mkdir(parents=True,exist_ok=True)
excluded={'node_modules','dist','.git','.temp','test-results','playwright-report','coverage','site-output','__pycache__','.vite','evidence'}
def included(p):
 rel=p.relative_to(root)
 if any(x in excluded for x in rel.parts) and not (rel.parts[0]=='docs' and len(rel.parts)>1 and rel.parts[1]=='test-results'):return False
 if p.is_symlink():return False
 if p.name.startswith('.env') and p.name!='.env.example':return False
 if p.suffix in {'.zip','.mp4','.log','.pyc','.sha256'}:return False
 return p.is_file()
files=sorted(p for p in root.rglob('*') if included(p) and p.name!='MANIFEST.json')
records=[{'path':'manager/'+p.relative_to(root).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}for p in files]
records.append({'path':'manager/MANIFEST.json','sha256':None,'note':'Self listed; checksum intentionally omitted'})
manifest=root/'MANIFEST.json'
manifest.write_text(json.dumps({'format':1,'root':'manager/','source_distribution':True,'files':records},ensure_ascii=False,indent=2)+'\n')
files=sorted(files+[manifest])
archive=out/'manager-complete.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for p in files:
  name='manager/'+p.relative_to(root).as_posix();info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;mode=0o755 if p.parent==root/'scripts' and p.suffix=='' else 0o644;info.external_attr=(0o100000|mode)<<16;z.writestr(info,p.read_bytes(),compresslevel=9)
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'manager-complete.zip.sha256').write_text(digest+'  manager-complete.zip\n')
with zipfile.ZipFile(archive)as z:
 assert all(n.startswith('manager/')for n in z.namelist())
 assert z.testzip()is None
print(json.dumps({'zip':str(archive),'sha256':digest,'files':len(files),'bytes':archive.stat().st_size}))
