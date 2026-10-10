#!/usr/bin/env python3
"""Download pinned public Kaggle archives, validate ZIPs and record provenance."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "flix-reproducible-data/1.0"}), timeout=120)


def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def fetch(source):
    folder = RAW / source["id"]
    folder.mkdir(parents=True, exist_ok=True)
    receipt = folder / "receipt.json"
    archive = folder / "dataset.zip"
    if receipt.exists() and archive.exists():
        previous = json.loads(receipt.read_text())
        if previous["version"] == source["version"] and digest(archive) == previous["archiveSha256"]:
            print(f"Verified cache: {source['id']}", flush=True)
            return previous
    with request("https://www.kaggle.com/api/v1/datasets/view/" + source["ref"]) as response:
        meta = json.load(response)
    if meta["licenseName"] != source["expectedLicense"]:
        raise RuntimeError(f"License changed for {source['ref']}: {meta['licenseName']}")
    (folder / "metadata.json").write_text(json.dumps(meta, indent=2))
    url = f"https://www.kaggle.com/api/v1/datasets/download/{source['ref']}?datasetVersionNumber={source['version']}"
    print(f"Downloading {source['ref']} v{source['version']}", flush=True)
    partial = folder / "dataset.zip.part"
    for attempt in range(3):
        try:
            with request(url) as response, partial.open("wb") as f:
                while chunk := response.read(1024 * 1024):
                    f.write(chunk)
            if not zipfile.is_zipfile(partial):
                raise RuntimeError("Kaggle did not return a ZIP archive")
            partial.replace(archive)
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    files = []
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            name = Path(entry.filename).name
            # Do not extract or publish MovieLens user ratings / links.
            if not name.endswith(".csv") or name.startswith(("ratings", "links")):
                continue
            target = folder / name
            with z.open(entry) as src, target.open("wb") as dst:
                while chunk := src.read(1024 * 1024):
                    dst.write(chunk)
            files.append({"name": name, "bytes": target.stat().st_size, "sha256": digest(target)})
    result = {
        **source, "url": "https://www.kaggle.com/datasets/" + source["ref"],
        "title": meta["title"], "author": meta.get("creatorName", source["ref"].split("/")[0]),
        "license": meta["licenseName"], "datasetUpdatedAt": meta["lastUpdated"],
        "downloadedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "downloadUrl": url, "archiveBytes": archive.stat().st_size,
        "archiveSha256": digest(archive), "files": files,
    }
    receipt.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Downloaded {source['id']}: {archive.stat().st_size / 1e6:.1f} MB, {len(files)} CSV files", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    sources = json.loads((ROOT / "data/sources.json").read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        receipts = list(pool.map(fetch, sources))
    (ROOT / "data/download-manifest.json").write_text(json.dumps(receipts, indent=2) + "\n")
    print(f"Complete: {len(receipts)} pinned Kaggle datasets", flush=True)


if __name__ == "__main__":
    main()
