"""Stage exact git objects and the locally served Python runtime."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
RUNTIME = PUBLIC / "runtime"
RUNTIME.mkdir(parents=True, exist_ok=True)
runtime_source = ROOT / "node_modules/pyodide"
for name in ("pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"):
    shutil.copyfile(runtime_source / name, RUNTIME / name)
lock = json.loads((runtime_source / "pyodide-lock.json").read_text())
wheel = lock["packages"]["pyyaml"]
path = RUNTIME / wheel["file_name"]
if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != wheel["sha256"]:
    url = "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/" + path.name
    data = urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != wheel["sha256"]:
        raise ValueError("PyYAML hash mismatch")
    path.write_bytes(data)

def include(archive, repo, revision, patterns):
    directory = ROOT.parent / repo
    def git(*args):
        return subprocess.check_output(["git", "-C", str(directory), *args])
    paths = git("ls-tree", "-r", "--name-only", revision, "src").decode().splitlines()
    from pathlib import PurePosixPath
    for name in paths:
        relative = PurePosixPath(name).relative_to("src")
        if any(relative.match(pattern) for pattern in patterns):
            entry = zipfile.ZipInfo(str(relative))
            archive.writestr(entry, git("show", revision + ":" + name), zipfile.ZIP_DEFLATED)

with zipfile.ZipFile(PUBLIC / "engine.zip", "w") as archive:
    include(archive, "changes", "f01e7923fd8b2cb394e8f478db673f96ef753156", [
        *["changes/"+name+".py" for name in (
            "__init__ app_settings chord_engine chord_parser chord_realization digitone_backend "
            "emiuet_resolver_core harmonic_context key_signature no_chord note song_filter ui_pipeline voice_leading voicing"
        ).split()], "changes/models/*.py", "changes/rendering/*.py", "changes/editor/*.py",
        *["changes/importers/"+name+".py" for name in ("__init__","compact_progression","form_expander","import_bundle","musicxml")],
        "changes/exporters/__init__.py", "changes/exporters/digitone_events.py",
        *["changes/digitone/"+name+".py" for name in ("__init__","bundle_planner","linear_split_planner",
            "note_encoding","pattern_name_policy","planner")]])
    include(archive, "digitone-syx-toolkit", "c162be40f8fd7e6938b39dd7e108a35958050a51", [
        *["digitone_syx_toolkit/"+name+".py" for name in ("__init__","errors","events_to_syx","events_yaml")], "digitone2/*.py", "resources/__init__.py",
        "resources/digitone2/__init__.py", "resources/digitone2/BASE_EMPTY.syx"])
    for name in ("engine.py", "fm_parts.py"):
        archive.writestr(zipfile.ZipInfo(name), (ROOT / name).read_bytes())
shutil.copyfile(ROOT / "worker.mjs", PUBLIC / "worker.mjs")
shutil.copyfile(ROOT / "LICENSE", PUBLIC / "LICENSE.txt")

# This archive is built from the exact inputs used here. Only the explicit
# application sources, pinned engine files and converter sources enter it.
with zipfile.ZipFile(PUBLIC / "changes-source.zip", "w", zipfile.ZIP_DEFLATED) as source:
    def add(path, name):
        source.writestr(zipfile.ZipInfo(str(name)), path.read_bytes(), zipfile.ZIP_DEFLATED)
    for name in ("README.md","LICENSE","package.json","package-lock.json","stage.py","engine.py",
                 "fm_parts.py","app.js","studio.js","worker.mjs","midi.js","fm_library.js","library.js","import_files.js",
                 "index.html","style.css","verify.mjs","verify-midi.mjs","parity.mjs","verify-fm.mjs","verify-studio.mjs"):
        add(ROOT/name,name)
    for path in sorted((ROOT/"vendor").rglob("*")):
        if path.is_file(): add(path,path.relative_to(ROOT).as_posix())
    add(PUBLIC/"engine.zip","engine.zip")
    converter = ROOT/"node_modules/@music-i18n/ireal-musicxml"
    for path in sorted((converter/"src").rglob("*")):
        if path.is_file(): add(path,"ireal-musicxml/"+path.relative_to(converter).as_posix())
    for name in ("package.json","LICENSE.txt","build/ireal-musicxml.mjs.map"):
        add(converter/name,"ireal-musicxml/"+name)
    for name in ("@zip.js/zip.js","chord-symbol","fast-diff","jstoxml","promise","asap"):
        directory=ROOT/"node_modules"/name
        for path in sorted(directory.rglob("*")):
            if path.is_file() and "node_modules" not in path.relative_to(directory).parts and (
                path.suffix in (".js",".ts",".json") or path.name.lower().startswith(("license","copying"))):
                add(path,"npm/"+name+"/"+path.relative_to(directory).as_posix())
    add(RUNTIME/"pyodide-lock.json","runtime/pyodide-lock.json")
    source.writestr(zipfile.ZipInfo("runtime/SOURCES.txt"),
        "Pyodide v0.29.3 MPL-2.0: https://github.com/pyodide/pyodide/tree/0.29.3\n"
        "The exact Python and PyYAML packages are identified in pyodide-lock.json.\n")

