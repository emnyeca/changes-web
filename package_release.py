"""Package only Vite's static output with stable archive timestamps."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root=Path(__file__).resolve().parent
output=root/"release"
output.mkdir(exist_ok=True)
with ZipFile(output/"changes-web.zip","w") as archive:
    for path in sorted((root/"dist").rglob("*")):
        if path.is_file():
            name=path.relative_to(root/"dist").as_posix()
            archive.writestr(ZipInfo(name),path.read_bytes(),ZIP_DEFLATED)
