#!/usr/bin/env python3
"""Import and master provided game effects with the combat audio mastering engine.

Initial import: --source-dir "$HOME/Downloads". Later runs reuse ignored local
originals. No provider API is called. All paths written to metadata are portable.
"""

import argparse
import hashlib
import json
from pathlib import Path
import shutil

from prepare_combat_audio import CORE, MAX_BYTES, PEAK_CEILING, RATE, TARGET_LUFS, ffmpeg, master, quality, write_wave


def tempo_filter(factor):
    """Preserve pitch while staying within each atempo filter's conservative range."""
    filters = []
    while factor > 2:
        filters.append("atempo=2")
        factor /= 2
    filters.append(f"atempo={factor:.8f}")
    return ",".join(filters)


def prepare(item, source, work, output):
    samples, start, end, original = quality(source)
    folder = work / "event-masters" / item["id"]
    folder.mkdir(parents=True, exist_ok=True)
    trimmed = folder / "trimmed.wav"
    prepared = folder / "prepared.wav"
    write_wave(trimmed, samples[start:end])
    target_seconds = item["target_duration_ms"] / 1000
    factor = max(1.0, ((end - start) / RATE) / target_seconds)
    ffmpeg("-v", "error", "-y", "-i", trimmed, "-af", tempo_filter(factor),
           "-c:a", "pcm_f32le", prepared)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    # The shared mastering engine accepts an opaque take ID. This identifies an
    # imported file, and is never represented as a provider generation in provenance.
    result = master(item["id"], [{"path": prepared, "unit": item["label"],
                    "slug": item["id"], "role": "event", "source_id": "import-" + source_hash[:12]}],
                    work, output, max_duration_ms=item["max_duration_ms"])
    result.update({"id": item["id"], "source_file": str(source.relative_to(CORE)),
                   "source": {"kind": "user-provided", "filename": item["source_filename"],
                              "sha256": source_hash, **original},
                   "time_stretch_factor": round(factor, 4),
                   "max_duration_ms": item["max_duration_ms"],
                   "leading_trim_ms": original["leading_trim_ms"],
                   "trailing_trim_ms": original["trailing_trim_ms"],
                   "asset_base": str((output / item["id"]).relative_to(CORE))})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Initial local source folder; subsequent runs use cached originals")
    args = parser.parse_args()
    work = CORE / "tmp/audio"
    raw = work / "raw/events"
    output = CORE / "public/audio/events"
    raw.mkdir(parents=True, exist_ok=True)
    spec = json.loads((CORE / "audio/game-sound-design.json").read_text())
    sources = {}
    # Check all requested inputs before replacing any runtime assets.
    for item in spec["sounds"]:
        source = (args.source_dir or raw) / item["source_filename"]
        if not source.is_file():
            raise FileNotFoundError("Missing provided audio: " + str(source))
        sources[item["id"]] = source
    if args.source_dir:
        for item in spec["sounds"]:
            destination = raw / item["source_filename"]
            if sources[item["id"]].resolve() != destination.resolve():
                shutil.copyfile(sources[item["id"]], destination)
            sources[item["id"]] = destination
    # Master to ignored staging, and promote only once every encoded file passes QA.
    staged = work / "staged-events"
    results = [prepare(item, sources[item["id"]], work, staged) for item in spec["sounds"]]
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for result in results:
        for codec in ("webm", "mp3"):
            filename = result["id"] + "." + codec
            shutil.copyfile(staged / filename, output / filename)
        revision = hashlib.sha256((output / (result["id"] + ".webm")).read_bytes()
                                  + (output / (result["id"] + ".mp3")).read_bytes()).hexdigest()[:10]
        manifest[result["id"]] = {"durationMs": result["encoded"]["webm"]["duration_ms"], "revision": revision}
        result["revision"] = revision
        result["asset_base"] = str((output / result["id"]).relative_to(CORE))
    provenance = {"provider": "User-provided recordings", "mastering": {"target_lufs": TARGET_LUFS,
                  "loudness_method": "R128 integrated, eight decoded PCM repeats, no inserted silence",
                  "true_peak_ceiling_db": PEAK_CEILING, "max_bytes_per_codec": MAX_BYTES},
                  "sounds": [{k: r[k] for k in ("id", "source", "time_stretch_factor", "max_duration_ms", "encoded")}
                             for r in results]}
    (CORE / "audio/game-sound-provenance.json").write_text(json.dumps(provenance, indent=4) + "\n")
    (CORE / "src/ui/audio/gameSoundManifest.json").write_text(json.dumps(manifest, indent=4) + "\n")
    (work / "game-sound-report.json").write_text(json.dumps(results, indent=2) + "\n")
    template = (CORE / "audio/combat-sound-review.html").read_text()
    template = template.replace("Combat sound audition", "Game event sound audition")
    template = template.replace("Original short attack and damage reactions for every creature.", "Provided spellbook, placement, healing, and resurrection sounds.")
    template = template.replace('<option value="attack">Attacks</option>', '<option value="event">Game events</option>')
    template = template.replace('<option value="hurt">Damage received</option>', "")
    data = json.dumps(results).replace("</", "<\\/")
    (work / "game-sound-review.html").write_text(template.replace("__COMBAT_AUDIO_DATA__", data))
    print(json.dumps({"effects": len(results), "bytes": {codec: sum(r["encoded"][codec]["bytes"] for r in results)
                                                       for codec in ("webm", "mp3")}}))


if __name__ == "__main__":
    main()
