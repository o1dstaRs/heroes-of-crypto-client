"""Restore the pinned compact release without overwriting existing profiles."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile


def sha256(filename):
    digest = hashlib.sha256()
    with filename.open("rb") as source:
        for chunk in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("downloads", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--drive", type=Path, required=True, help="Existing shared heroesofcrypto folder")
    args = parser.parse_args()
    manifests = [Path(__file__).parent.parent / "asset-release-archives.json", Path(__file__).parent / "asset-release-archives.json"]
    manifest = json.loads(next(path for path in manifests if path.is_file()).read_text())
    destination = args.destination.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise SystemExit("Use an empty destination; existing local profiles must never be overwritten.")
    def safe(root, relative):
        target = (root / relative).resolve()
        if not target.is_relative_to(root.resolve()):
            raise SystemExit("Unsafe release path: " + relative)
        return target

    for record in manifest["archives"]:
        source = args.downloads / record["file"]
        if source.stat().st_size != record["bytes"] or sha256(source) != record["sha256"]:
            raise SystemExit("Archive checksum mismatch: " + source.name)
        with zipfile.ZipFile(source) as archive:
            for entry in archive.infolist():
                safe(destination, entry.filename)
                if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                    raise SystemExit("Unexpected symbolic link: " + entry.filename)
    # Check all reused bytes before writing anything. Cloud filenames alone do not identify a revision.
    checked = set()
    for relative, record in manifest["files"].items():
        safe(destination, relative)
        if record["source"] != "drive" or record["path"] in checked:
            continue
        source = safe(args.drive, record["path"])
        if source.stat().st_size != record["bytes"] or sha256(source) != record["sha256"]:
            raise SystemExit("Shared Drive source differs: " + record["path"])
        checked.add(record["path"])
    destination.mkdir(parents=True, exist_ok=True)
    archives = {}
    try:
        for relative, record in manifest["files"].items():
            if record["source"] == "generated":
                continue
            target = safe(destination, relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            if record["source"] == "drive":
                shutil.copyfile(safe(args.drive, record["path"]), target)
            elif record["source"] == "archive":
                name = record["archive"]
                if name not in archives:
                    archives[name] = zipfile.ZipFile(args.downloads / name)
                with archives[name].open(record["path"]) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
            else:
                raise SystemExit("Unknown release source: " + record["source"])
            if target.stat().st_size != record["bytes"] or sha256(target) != record["sha256"]:
                raise SystemExit("Restored file differs: " + relative)
    finally:
        for archive in archives.values():
            archive.close()
    print("Base files verified. Restore portrait pages with the pinned client checkout:")
    print("bun game/core/scripts/restore_sidebar_portrait_pages.ts " + str(destination / "heroesofcrypto-assets"))
    print("Then run check:animation-release before building. See ANIMATION_RELEASE.md.")


if __name__ == "__main__":
    main()
