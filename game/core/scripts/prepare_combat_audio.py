#!/usr/bin/env python3
"""Master short combat SFX using Python's standard library and FFmpeg.

Run from any directory. Sources, alternate takes, and QA stay in core/tmp/audio;
only selected compressed sounds go to public/audio/combat. No generation API is
called here. Receipts are the saved ElevenLabs MCP status responses.
"""

import argparse
import array
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

CORE = Path(__file__).resolve().parents[1]
RATE = 48000
TARGET_LUFS = -20.0
PEAK_CEILING = -3.0
MAX_BYTES = 32768


def record_id(record):
    return record.get("generation_id") or record["source_id"]


def command(args, payload=None):
    result = subprocess.run(args, input=payload, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace")[-1800:])
    return result


def ffmpeg(*args, payload=None):
    return command(["ffmpeg", "-nostdin", "-hide_banner", "-threads", "1", *map(str, args)], payload)


def decode(path, filtered=False):
    args = ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", RATE]
    if filtered:
        args += ["-af", "highpass=f=70,lowpass=f=14000"]
    data = array.array("f")
    data.frombytes(ffmpeg(*args, "-f", "f32le", "pipe:1").stdout)
    if sys.byteorder != "little":
        data.byteswap()
    return data


def db(value):
    return 20 * math.log10(max(value, 1e-12))


def envelope(samples, window=240):
    return [math.sqrt(sum(x * x for x in samples[i:i + window]) / len(samples[i:i + window]))
            for i in range(0, len(samples), window)]


def trim_bounds(samples):
    """Find the first and last sustained sound; never remove internal silence."""
    levels = envelope(samples)
    if not levels or max(levels) < 10 ** (-55 / 20):
        raise ValueError("Empty or effectively silent take")
    threshold = max(10 ** (-52 / 20), max(levels) * 10 ** (-38 / 20))
    active = [i for i, value in enumerate(levels) if value >= threshold]
    # A single isolated click is insufficient to call an otherwise silent take usable.
    active_set = set(active)
    sustained = [i for i in active if i + 1 in active_set or i - 1 in active_set]
    if not sustained:
        raise ValueError("No sustained sound")
    start = max(0, sustained[0] * 240 - int(RATE * 0.004))
    end = min(len(samples), (sustained[-1] + 1) * 240 + int(RATE * 0.025))
    if (end - start) / RATE < 0.075:
        raise ValueError("Take is too short")
    return start, end


def fade_edges(samples):
    samples = array.array("f", samples)
    attack, release = min(144, len(samples)), min(960, len(samples))
    for i in range(attack):
        samples[i] *= i / max(1, attack - 1)
    for i in range(release):
        samples[-i - 1] *= i / max(1, release - 1)
    return samples


def write_wave(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = array.array("f", samples)
    if sys.byteorder != "little":
        data.byteswap()
    ffmpeg("-v", "error", "-y", "-f", "f32le", "-ar", RATE, "-ac", "1", "-i", "pipe:0",
           "-c:a", "pcm_f32le", path, payload=data.tobytes())


def loudness(path):
    # Repetition is measurement-only. R128 needs 400 ms blocks: a 150 ms one-shot
    # otherwise reports -inf. All clips use this same eight-repeat measurement,
    # without inserted padding. Runtime assets still contain exactly one event.
    # Decode once before repeating. Looping compressed containers can reintroduce
    # MP3 encoder padding on every pass and bias the measured average downward.
    # This measures the PCM that decodeAudioData actually plays.
    samples = decode(path) * 8
    if sys.byteorder != "little":
        samples.byteswap()
    result = ffmpeg("-f", "f32le", "-ar", RATE, "-ac", "1", "-i", "pipe:0", "-af",
                    "loudnorm=I=-20:TP=-3:LRA=11:print_format=json", "-f", "null", "-", payload=samples.tobytes())
    blocks = re.findall(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)
    if not blocks:
        raise ValueError("Cannot measure loudness")
    measured = json.loads(blocks[-1])
    value, peak = float(measured["input_i"]), float(measured["input_tp"])
    if not math.isfinite(value) or not math.isfinite(peak):
        raise ValueError("Non-finite loudness")
    return {"lufs": value, "true_peak_db": peak}


def quality(path):
    samples = decode(path, True)
    start, end = trim_bounds(samples)
    trimmed = samples[start:end]
    levels = envelope(trimmed)
    peak = max(abs(x) for x in trimmed)
    rms = math.sqrt(sum(x * x for x in trimmed) / len(trimmed))
    active = [v for v in levels if v >= max(levels) * 0.1]
    # Favor a sustained single event; flag separated bursts for audition rather
    # than joining them or blindly trimming in the middle of an attack.
    activity = "".join("1" if v >= max(levels) * 0.1 else "0" for v in levels)
    gaps = len(re.findall(r"(?<=1)0{16,}(?=1)", activity))
    score = len(active) / len(levels) - gaps * 0.2 - max(0, db(peak) - db(rms) - 18) * 0.025
    return samples, start, end, {"score": round(score, 4), "bursts_to_review": gaps,
                               "raw_duration_ms": round(len(samples) / RATE * 1000),
                               "leading_trim_ms": round(start / RATE * 1000),
                               "trailing_trim_ms": round((len(samples) - end) / RATE * 1000),
                               "raw_rms_db": round(db(rms), 2), "raw_peak_db": round(db(peak), 2)}


def collect_sources(receipts, units, raw_dir, only=None):
    prompts = {u[role]["prompt"]: (u, role) for u in units for role in ("attack", "hurt")}
    records = {}
    files = [receipts / "pilot-run.json", *sorted(receipts.glob("batch-*-complete.json"))]
    for path in files:
        if not path.exists():
            continue
        receipt = json.loads(path.read_text())
        run = receipt["run"]
        generations = {g["id"]: g for g in run.get("generations", [])}
        for media in run.get("media", []):
            gen = generations.get(media["generation_id"], {})
            prompt = gen.get("prompt", media.get("prompt"))
            if prompt not in prompts:
                continue
            u, role = prompts[prompt]
            if only and u["slug"] not in only:
                continue
            gid = media["generation_id"]
            destination = raw_dir / u["slug"] / role / (gid + ".mp3")
            records[gid] = {"unit": u["name"], "slug": u["slug"], "role": role,
                            "generation_id": gid, "path": destination,
                            "url": media.get("master_url") or media["url"]}

    def download(record):
        destination = record["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            # Downloads may be resumed; sound generation is never retried here.
            with urllib.request.urlopen(record["url"], timeout=60) as response:
                payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                raise ValueError("Unexpectedly large source")
            temporary = destination.with_suffix(".download")
            temporary.write_bytes(payload)
            temporary.replace(destination)
        return record

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        downloaded = list(executor.map(download, records.values()))
    groups = {}
    for record in downloaded:
        groups.setdefault(record["slug"] + "/" + record["role"], []).append(record)
    override_path = CORE / "audio/combat-sound-overrides.json"
    if override_path.exists():
        units_by_slug = {u["slug"]: u for u in units}
        for key, selected in json.loads(override_path.read_text()).items():
            slug, role = key.split("/")
            if slug not in units_by_slug or role not in ("attack", "hurt"):
                raise ValueError("Unknown selected sound: " + key)
            if only and slug not in only:
                continue
            relative = Path(selected["path"])
            source = (CORE / relative).resolve()
            if relative.is_absolute() or not source.is_relative_to((CORE / "tmp/audio").resolve()):
                raise ValueError("Selected source must be in local tmp/audio: " + key)
            if not source.is_file():
                raise FileNotFoundError("Restore the selected local source before remastering: " + str(relative))
            groups[key] = [{"path": source, "unit": units_by_slug[slug]["name"], "slug": slug, "role": role,
                            "source_id": selected["source_id"], "source": selected["source"]}]
    print(f"Local sources: {len(downloaded)} takes for {len(groups)} effects", flush=True)
    return groups


def master(key, records, work, output, max_duration_ms=1600):
    candidates, rejected = [], []
    for record in records:
        try:
            samples, start, end, metrics = quality(record["path"])
            candidates.append((metrics["score"], record, samples, start, end, metrics))
        except ValueError as error:
            rejected.append({"source_id": record_id(record), "reason": str(error)})
    if not candidates:
        raise ValueError(key + ": no usable takes: " + str(rejected))
    candidates.sort(key=lambda c: (-c[0], record_id(c[1])))
    _, record, samples, start, end, metrics = candidates[0]
    folder = work / "masters" / key
    folder.mkdir(parents=True, exist_ok=True)
    trimmed = folder / "trimmed.wav"
    mastered = folder / "master.wav"
    write_wave(trimmed, fade_edges(samples[start:end]))
    measured = loudness(trimmed)
    gain_db = TARGET_LUFS - measured["lufs"]
    limit_db = -4.0  # initial extra headroom for codec overshoot
    destination = output / key.replace("/", "_")
    output.mkdir(parents=True, exist_ok=True)
    duration = (end - start) / RATE
    encoded = {}
    for attempt in range(8):
        limiter = 10 ** (limit_db / 20)
        ffmpeg("-v", "error", "-y", "-i", trimmed, "-af",
               f"volume={gain_db}dB,aresample=192000,alimiter=limit={limiter}:level=false:attack=2:release=60:latency=true,aresample=48000",
               "-t", duration, "-c:a", "pcm_f32le", mastered)
        measurement = loudness(mastered)
        error = TARGET_LUFS - measurement["lufs"]
        # Gating can jump slightly on a very sharp, short impact. The final encoded
        # contract is 0.75 LUFS, so avoid oscillating around an unnecessarily tight
        # pre-encode threshold while the output already fits that contract.
        if abs(error) > 0.5:
            gain_db += error
            continue
        for codec, settings in [
            ("webm", ["-c:a", "libopus", "-b:a", "64k", "-vbr", "on", "-application", "audio"]),
            ("mp3", ["-c:a", "libmp3lame", "-b:a", "96k"]),
        ]:
            path = destination.with_suffix("." + codec)
            ffmpeg("-v", "error", "-y", "-i", mastered, "-map_metadata", "-1", "-ac", "1", "-ar", RATE,
                   *settings, path)
            pcm = decode(path)
            bounds = trim_bounds(pcm)
            encoded[codec] = {**loudness(path), "bytes": path.stat().st_size,
                              "duration_ms": round(len(pcm) / RATE * 1000),
                              "leading_quiet_ms": round(bounds[0] / RATE * 1000),
                              "trailing_quiet_ms": round((len(pcm) - bounds[1]) / RATE * 1000),
                              "rms_db": round(db(math.sqrt(sum(x * x for x in pcm) / len(pcm))), 2)}
        over = max(m["true_peak_db"] for m in encoded.values()) - PEAK_CEILING
        if over > 0:
            limit_db -= over + 0.3
            continue
        if all(abs(m["lufs"] - TARGET_LUFS) <= 0.75 for m in encoded.values()):
            break
        gain_db += TARGET_LUFS - sum(m["lufs"] for m in encoded.values()) / len(encoded)
    else:
        raise ValueError(key + ": loudness/peak target could not be met: " + str({"master": measurement, "encoded": encoded}))
    for codec, m in encoded.items():
        if m["bytes"] > MAX_BYTES or m["duration_ms"] > max_duration_ms or m["leading_quiet_ms"] > 25 or m["trailing_quiet_ms"] > 65:
            raise ValueError(key + ": encoded QA failed: " + str(m))
    pcm = decode(destination.with_suffix(".webm"))
    step = max(1, len(pcm) // 120)
    waveform = [round(max(abs(x) for x in pcm[i:i + step]), 4) for i in range(0, len(pcm), step)]
    result = {"unit": record["unit"], "slug": record["slug"], "role": record["role"],
              "source_file": str(record["path"].relative_to(CORE)),
              "selection": "Automated technical selection; subjective timbre remains auditionable.",
              "alternates": [{"source_id": record_id(c[1]), **c[5]} for c in candidates],
              "rejected": rejected, **metrics, "gain_db": round(gain_db, 2), "limiter_ceiling_db": round(limit_db, 2),
              "waveform": waveform, "encoded": encoded}
    if "generation_id" in record:
        result["generation_id"] = record["generation_id"]
    else:
        result.update({"source_id": record["source_id"], "source": record.get("source", {})})
    (folder / "qa.json").write_text(json.dumps(result, indent=2) + "\n")
    print(key + ": " + str(encoded["webm"]["duration_ms"]) + " ms, " + str(encoded["webm"]["lufs"]) + " LUFS", flush=True)
    return result


def write_review(work, results):
    design = json.loads((CORE / "audio/combat-sound-design.json").read_text())
    art_references = {u["slug"]: u.get("art_reference") for u in design["units"]}
    prompts = {u["slug"] + "/" + role: u[role]["prompt"] for u in design["units"] for role in ("attack", "hurt")}
    searches = {u["slug"] + "/" + role: u[role].get("library_query") for u in design["units"] for role in ("attack", "hurt")}
    for clip in results:
        key = clip["slug"] + "/" + clip["role"]
        clip["design_prompt"] = prompts.get(key) or clip.get("source", {}).get("prompt", "")
        clip["art_reference"] = art_references.get(clip["slug"])
        clip["library_query"] = searches.get(key)
        base = CORE / "public/audio/combat" / key.replace("/", "_")
        if base.with_suffix(".webm").exists() and base.with_suffix(".mp3").exists():
            clip["revision"] = hashlib.sha256(base.with_suffix(".webm").read_bytes()
                                               + base.with_suffix(".mp3").read_bytes()).hexdigest()[:10]
    data = json.dumps(results).replace("</", "<\\/")
    template = (CORE / "audio" / "combat-sound-review.html").read_text()
    (work / "review.html").write_text(template.replace("__COMBAT_AUDIO_DATA__", data))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, default=CORE / "tmp/audio")
    parser.add_argument("--output", type=Path, default=CORE / "public/audio/combat")
    parser.add_argument("--only", help="Comma-separated unit slugs for a pilot")
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    spec = json.loads((CORE / "audio/combat-sound-design.json").read_text())
    only = set(args.only.split(",")) if args.only else None
    groups = collect_sources(args.work, spec["units"], args.work / "raw", only)
    if args.download_only:
        return
    required = {u["slug"] + "/" + role for u in spec["units"] if not only or u["slug"] in only
                for role in ("attack", "hurt")}
    missing = required - groups.keys()
    if missing:
        raise ValueError("Missing generated sources: " + ", ".join(sorted(missing)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as executor:
        results = list(executor.map(lambda key: master(key, groups[key], args.work, args.output), sorted(required)))
    report = {"target_lufs": TARGET_LUFS, "loudness_method": "R128 integrated, eight repeats, no inserted silence",
              "true_peak_ceiling_db": PEAK_CEILING, "clips": results}
    (args.work / "mastering-report.json").write_text(json.dumps(report, indent=2) + "\n")
    write_review(args.work, results)
    if not only:
        # Keep credentials and short-lived download URLs out of tracked metadata.
        provenance = {"provider": spec["provider"], "model": spec["model"],
                      "selection": "Technical selection; see local audition report for aesthetic review.",
                      "mastering": {k: v for k, v in report.items() if k != "clips"},
                      "clips": [{k: c[k] for k in ("unit", "slug", "role", "generation_id", "source_id", "source", "encoded") if k in c}
                                for c in results]}
        if any(c.get("source", {}).get("kind") == "library" for c in results):
            provenance["provider"] = "Mixed: see individual clip sources"
        (CORE / "audio/combat-sound-provenance.json").write_text(json.dumps(provenance, indent=4) + "\n")
        manifest = {u["name"]: {"slug": u["slug"],
                    **{role: {"durationMs": next(c for c in results if c["slug"] == u["slug"] and c["role"] == role)["encoded"]["webm"]["duration_ms"],
                              "revision": hashlib.sha256((args.output / (u["slug"] + "_" + role + ".webm")).read_bytes() + (args.output / (u["slug"] + "_" + role + ".mp3")).read_bytes()).hexdigest()[:10]}
                       for role in ("attack", "hurt")}} for u in spec["units"]}
        (CORE / "src/ui/audio/combatSoundManifest.json").write_text(json.dumps(manifest, indent=4) + "\n")
    print(json.dumps({"effects": len(results), "bytes": {codec: sum(c["encoded"][codec]["bytes"] for c in results)
                                                        for codec in ("webm", "mp3")}}), flush=True)


if __name__ == "__main__":
    main()
