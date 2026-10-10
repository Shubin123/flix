#!/usr/bin/env python3
"""Merge nine Kaggle movie datasets and fit an exportable TF-IDF / LSA model."""
import ast
import collections
import csv
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

import numpy as np
import sklearn
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
OUT = ROOT / "public/data"
LIMIT = 35000
DIMENSIONS = 96
TODAY = dt.date.today().isoformat()
csv.field_size_limit(10_000_000)
stats = collections.defaultdict(collections.Counter)
movies = []
by_tmdb, by_imdb, by_title = {}, {}, {}
blocked_ids = set()
tmdb_supplements = {}
top_rows = []


def read(source, filename):
    with (RAW / source / filename).open(encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def number(value, default=0):
    try:
        n = float(str(value).replace(",", ""))
        return n if math.isfinite(n) else default
    except (TypeError, ValueError):
        return default


def clean(value):
    return "" if value in (None, "nan", "NaN", "None") else re.sub(r"\s+", " ", str(value)).strip()


def ascii_text(value):
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()


def key(title, year):
    return (re.sub(r"[^a-z0-9]", "", ascii_text(title)), int(year))


def parsed(value):
    try:
        return ast.literal_eval(value) if value else []
    except (ValueError, SyntaxError):
        return []


def names(value):
    return [clean(x["name"]) for x in parsed(value) if isinstance(x, dict) and x.get("name")]


GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western"]
ALIASES = {
    "scifi": "Science Fiction", "sci-fi": "Science Fiction", "science fiction": "Science Fiction", "documentation": "Documentary",
    "documentaries": "Documentary", "documentary": "Documentary", "comedy": "Comedy", "comedies": "Comedy", "dramas": "Drama",
    "romantic movies": "Romance", "children & family movies": "Family", "kids": "Family", "horror movies": "Horror",
    "thrillers": "Thriller", "action & adventure": "Action", "sci-fi & fantasy": "Science Fiction", "animation": "Animation",
    "anime features": "Animation", "music & musicals": "Music", "romantic comedies": "Romance", "romantic dramas": "Romance",
    "suspense": "Thriller", "arts": "Music", "entertainment": "Music", "historical": "History", "history": "History",
}


def genres(values):
    result = []
    for value in values:
        value = clean(value).lower()
        g = ALIASES.get(value) or next((x for x in GENRES if x.lower() == value), None)
        if g and g not in result:
            result.append(g)
        if value in ("action & adventure", "sci-fi & fantasy"):
            result.append("Adventure" if value == "action & adventure" else "Fantasy")
    return list(dict.fromkeys(result))


def add(source, **r):
    stats[source]["movieRowsConsidered"] += 1
    title, year = clean(r.get("title")), int(number(r.get("year")))
    tmdb = str(r.get("tmdb") or "")
    imdb = str(r.get("imdb") or "")
    if not title or not 1870 <= year <= int(TODAY[:4]) or tmdb in blocked_ids:
        stats[source]["invalidOrExcluded"] += 1
        return None
    m = by_tmdb.get(tmdb) or by_imdb.get(imdb) or by_title.get(key(title, year))
    if m is None:
        m = {"title": title, "year": year, "genres": [], "cast": [], "directors": [], "keywords": [], "sources": [], "historicalPlatforms": []}
        movies.append(m)
        stats[source]["newMovies"] += 1
    else:
        stats[source]["mergedRows"] += 1
    if source not in m["sources"]:
        m["sources"].append(source)
    for field in ("genres", "cast", "directors", "keywords", "historicalPlatforms"):
        m[field] = list(dict.fromkeys(m[field] + [clean(x) for x in r.get(field, []) if clean(x)]))
    for field in ("tmdb", "imdb", "overview", "language", "poster", "backdrop", "runtime", "rating", "votes", "ratingSource", "certificate", "originalTitle"):
        if r.get(field) and not m.get(field):
            m[field] = r[field]
    if tmdb:
        by_tmdb[tmdb] = m
    if imdb:
        by_imdb[imdb] = m
    by_title[key(title, year)] = m
    if r.get("originalTitle"):
        by_title[key(r["originalTitle"], year)] = m
    return m


def merge_tmdb():
    global top_rows
    top_rows = list(read("tmdb-2026", "tmdb_top_10k_movies_2026.csv.csv"))
    wanted = {r["id"] for r in top_rows}
    print("Reading current TMDB snapshot...", flush=True)
    for r in read("tmdb-full", "TMDB_movie_dataset_v11.csv"):
        stats["tmdb-full"]["totalRowsRead"] += 1
        if r["id"] in wanted:
            tmdb_supplements[r["id"]] = r
        if r["adult"].lower() == "true":
            blocked_ids.add(r["id"])
            continue
        if r["status"] != "Released" or not r["release_date"] or r["release_date"] > TODAY:
            continue
        if number(r["vote_count"]) < 10:
            continue
        if number(r["runtime"]) < 40 or not r["overview"] or not r["genres"]:
            continue
        add("tmdb-full", title=r["title"], year=r["release_date"][:4], tmdb=r["id"], imdb=r["imdb_id"],
            originalTitle=r["original_title"], genres=genres(r["genres"].split(",")), overview=clean(r["overview"]),
            language=r["original_language"], runtime=int(number(r["runtime"])), rating=round(number(r["vote_average"]), 1),
            votes=int(number(r["vote_count"])), ratingSource="TMDB", poster=r["poster_path"], backdrop=r["backdrop_path"],
            keywords=r["keywords"].split(",")[:24])
    print(f"Current TMDB: {len(movies):,} eligible films", flush=True)
    for source, filename in [("movies", "movies_metadata.csv"), ("tmdb-5000", "tmdb_5000_movies.csv")]:
        for r in read(source, filename):
            stats[source]["totalRowsRead"] += 1
            if r.get("adult", "False").lower() == "true" or r.get("status") != "Released":
                continue
            if not r.get("release_date") or r["release_date"] > TODAY:
                continue
            add(source, title=r["title"], year=r["release_date"][:4], tmdb=r["id"], imdb=r.get("imdb_id"),
                originalTitle=r.get("original_title"), genres=genres(names(r["genres"])), overview=clean(r["overview"]),
                language=r["original_language"], runtime=int(number(r["runtime"])), rating=round(number(r["vote_average"]), 1),
                votes=int(number(r["vote_count"])), ratingSource="TMDB", poster=r.get("poster_path"), keywords=names(r.get("keywords")))
        if source == "movies":
            for r in read(source, "keywords.csv"):
                if m := by_tmdb.get(r["id"]):
                    m["keywords"] = list(dict.fromkeys(m["keywords"] + names(r["keywords"])))[:30]
        for r in read(source, "credits.csv" if source == "movies" else "tmdb_5000_credits.csv"):
            if m := by_tmdb.get(r.get("id") or r.get("movie_id")):
                m["cast"] = list(dict.fromkeys(m["cast"] + names(r["cast"])[:6]))[:8]
                m["directors"] = list(dict.fromkeys(m["directors"] + [x["name"] for x in parsed(r["crew"]) if x.get("job") == "Director"]))[:3]
        print(f"Merged {source}: {len(movies):,} unique films", flush=True)


def merge_recent():
    genre_ids = {}
    for row in read("movies", "movies_metadata.csv"):
        for genre in parsed(row["genres"]):
            if isinstance(genre, dict):
                genre_ids[genre.get("id")] = genre.get("name")
    for r in top_rows:
        stats["tmdb-2026"]["totalRowsRead"] += 1
        if not r["release_date"] or r["release_date"] > TODAY:
            continue
        full = tmdb_supplements.get(r["id"], {})
        m = add("tmdb-2026", title=r["title"], year=r["release_date"][:4], tmdb=r["id"], imdb=full.get("imdb_id"),
                genres=genres([genre_ids.get(g, "") for g in parsed(r["genre_ids"])]), overview=clean(r["overview"]),
                language=r["original_language"], runtime=int(number(full.get("runtime"))),
                poster=full.get("poster_path"), backdrop=full.get("backdrop_path"),
                keywords=full.get("keywords", "").split(","))
        if m:
            m.update(rating=round(number(r["vote_average"]), 1), votes=int(number(r["vote_count"])), ratingSource="TMDB")


def merge_awards():
    title_index = collections.defaultdict(list)
    for m in movies:
        title_index[key(m["title"], 0)[0]].append(m)
        if m.get("originalTitle"):
            title_index[key(m["originalTitle"], 0)[0]].append(m)
    for row in read("oscars", "the_oscar_award.csv"):
        stats["oscars"]["totalRowsRead"] += 1
        if (row.get("winner") or "").lower() != "true" or not row.get("film"):
            continue
        year = int(number(row["year_film"]))
        candidates = [m for m in title_index.get(key(row["film"], 0)[0], []) if abs(m["year"] - year) <= 1]
        if not candidates:
            stats["oscars"]["unmatchedWinnerRows"] += 1
            continue
        m = min(candidates, key=lambda m: (abs(m["year"] - year), -number(m.get("votes"))))
        award = {"ceremonyYear": int(number(row["year_ceremony"])), "category": row["canon_category"].title(),
                 "honorees": row["name"], "source": f"https://www.oscars.org/oscars/ceremonies/{row['year_ceremony']}"}
        if award not in m.setdefault("awards", []):
            m["awards"].append(award)
        if "oscars" not in m["sources"]:
            m["sources"].append("oscars")
        stats["oscars"]["matchedWinnerRows"] += 1


def merge_streaming():
    for source, filename, platform in [("netflix", "netflix_titles.csv", "Netflix"), ("prime", "amazon_prime_titles.csv", "Prime Video")]:
        for r in read(source, filename):
            stats[source]["totalRowsRead"] += 1
            if r["type"] != "Movie":
                continue
            add(source, title=r["title"], year=r["release_year"], genres=genres(r["listed_in"].split(",")),
                overview=clean(r["description"]), cast=r["cast"].split(","), directors=r["director"].split(","),
                runtime=int(number(r["duration"].split(" ")[0])) if "min" in r["duration"] else 0,
                certificate=r["rating"], historicalPlatforms=[platform])
    for source, platform in [("netflix-2022", "Netflix"), ("hbo", "HBO Max"), ("prime-2022", "Prime Video"), ("disney", "Disney+"), ("hulu", "Hulu")]:
        local = {}
        for r in read(source, "titles.csv"):
            stats[source]["totalRowsRead"] += 1
            if r["type"] != "MOVIE":
                continue
            local[r["id"]] = add(source, title=r["title"], year=r["release_year"], imdb=r["imdb_id"],
                genres=genres(parsed(r["genres"])), overview=clean(r["description"]), runtime=int(number(r["runtime"])),
                certificate=r["age_certification"], historicalPlatforms=[platform])
        for r in read(source, "credits.csv"):
            if m := local.get(r["id"]):
                field = "directors" if r["role"] == "DIRECTOR" else "cast"
                if r["name"] not in m[field] and len(m[field]) < (3 if field == "directors" else 8):
                    m[field].append(r["name"])
    for r in read("imdb-top", "imdb_top_1000.csv"):
        stats["imdb-top"]["totalRowsRead"] += 1
        # IMDb synopsis and image URLs are deliberately excluded from the public catalog.
        add("imdb-top", title=r["Series_Title"], year=r["Released_Year"], genres=genres(r["Genre"].split(",")),
            cast=[r[f"Star{i}"] for i in range(1, 5)], directors=[r["Director"]], runtime=int(number(r["Runtime"].split(" ")[0])),
            rating=number(r["IMDB_Rating"]), votes=int(number(r["No_of_Votes"])), ratingSource="IMDb", certificate=r["Certificate"])
    for r in read("platforms", "MoviesOnStreamingPlatforms.csv"):
        stats["platforms"]["totalRowsRead"] += 1
        if r.get("Type") != "0":
            continue
        add("platforms", title=r["Title"], year=r["Year"], historicalPlatforms=[x for x in ("Netflix", "Hulu", "Prime Video", "Disney+") if r[x] == "1"])


def document(m):
    return ascii_text(" ".join([
        m["title"], m.get("originalTitle", ""), m.get("overview", ""),
        (" ".join(m["genres"]) + " ") * 4,
        (" ".join(m["keywords"]) + " ") * 2,
        (" ".join(m["directors"]) + " ") * 2, " ".join(m["cast"]),
    ]))


def write_gzip(filename, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    with (OUT / filename).open("wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as z:
            z.write(raw)


def write_binary(filename, array):
    with (OUT / filename).open("wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as z:
            z.write(array.tobytes())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    merge_tmdb()
    merge_recent()
    merge_streaming()
    merge_awards()
    # Keep feature films with descriptive content. Favor well-supported metadata.
    eligible = [m for m in movies if m["genres"] and len(m.get("overview", "")) >= 25 and (40 <= m.get("runtime", 0) <= 360 or (m.get("runtime", 0) == 0 and "tmdb-2026" in m["sources"]))]
    # Reserve catalog space for recent releases and Academy winners instead of
    # letting historic vote totals crowd them out of the 35,000-film browser cap.
    selected = sorted(eligible, key=lambda m: (not (m["year"] >= 2024 or bool(m.get("awards"))), -number(m.get("votes")), -len(m["sources"]), m["title"], m["year"]))[:LIMIT]
    selected.sort(key=lambda m: (m["title"].casefold(), m["year"], m.get("tmdb", "")))
    for i, m in enumerate(selected):
        m["id"] = f"tmdb-{m['tmdb']}" if m.get("tmdb") else f"film-{hashlib.sha256(f'{m['title']}:{m['year']}'.encode()).hexdigest()[:14]}"
        m["index"] = i
        m["keywords"] = m["keywords"][:24]
        m["cast"] = m["cast"][:6]
        m["overview"] = m["overview"][:1800]
        for source in m["sources"]:
            stats[source]["moviesInModel"] += 1
    print(f"Fitting TF-IDF / {DIMENSIONS}-dimension LSA on {len(selected):,} films...", flush=True)
    vectorizer = TfidfVectorizer(max_features=18000, min_df=2, max_df=0.90, stop_words="english", sublinear_tf=True, dtype=np.float32, token_pattern=r"(?u)\b[a-z0-9][a-z0-9]+\b")
    documents = [document(m) for m in selected]
    matrix = vectorizer.fit_transform(documents)
    svd = TruncatedSVD(n_components=DIMENSIONS, n_iter=7, random_state=42)
    with threadpool_limits(limits=4):
        vectors = normalize(svd.fit_transform(matrix)).astype(np.float32)
    quantized = np.rint(vectors * 127).clip(-127, 127).astype(np.int8)
    projection = svd.components_.T.astype("<f4")
    terms = vectorizer.get_feature_names_out().tolist()
    vocab = {"terms": terms, "idf": vectorizer.idf_.astype(float).tolist(), "stopWords": sorted(vectorizer.get_stop_words())}
    write_gzip("catalog.json.gz", selected)
    write_gzip("vocabulary.json.gz", vocab)
    write_binary("embeddings.i8.gz", quantized)
    write_binary("projection.f32.gz", projection)
    # Retain the strongest original TF-IDF features as a precise retrieval signal.
    # This complements LSA when rare names or plot details distinguish similar genres.
    indices, values, offsets = [], [], [0]
    for i in range(matrix.shape[0]):
        row = matrix.getrow(i)
        order = np.argsort(row.data)[-80:]
        row_indices, row_values = row.indices[order], row.data[order]
        row_values = row_values / (np.linalg.norm(row_values) or 1)
        indices.extend(row_indices.tolist())
        values.extend(np.rint(row_values * 255).clip(0, 255).astype(np.uint8).tolist())
        offsets.append(len(indices))
    write_binary("features.indices.u16.gz", np.asarray(indices, dtype="<u2"))
    write_binary("features.values.u8.gz", np.asarray(values, dtype=np.uint8))
    write_binary("features.offsets.u32.gz", np.asarray(offsets, dtype="<u4"))
    receipts = json.loads((ROOT / "data/download-manifest.json").read_text())
    sources = [{**r, "statistics": dict(stats[r["id"]])} for r in receipts]
    (OUT / "sources.json").write_text(json.dumps(sources, indent=2) + "\n")
    report = {
        "schemaVersion": 1, "algorithm": "TF-IDF + truncated SVD (latent semantic analysis)",
        "trainedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "snapshotDate": TODAY,
        "movieCount": len(selected), "mergedMovieCount": len(movies), "eligibleMovieCount": len(eligible),
        "sourceCount": len(sources), "totalInputRows": sum(s["totalRowsRead"] for s in stats.values()),
        "vocabularySize": len(terms), "dimensions": DIMENSIONS, "randomSeed": 42,
        "sparseFeatures": {"maxPerMovie": 80, "nonzeroCount": len(indices), "quantizationScale": 255},
        "explainedVarianceRatio": float(svd.explained_variance_ratio_.sum()),
        "quantizationMeanCosine": float(np.mean(np.sum(vectors * normalize(quantized.astype(np.float32)), axis=1))),
        "yearRange": [min(m["year"] for m in selected), max(m["year"] for m in selected)],
        "releaseYearCounts": dict(sorted(collections.Counter(str(m["year"]) for m in selected).items())),
        "academyWinnerCount": sum(bool(m.get("awards")) for m in selected),
        "academyCeremonyThrough": max((a["ceremonyYear"] for m in selected for a in m.get("awards", [])), default=0),
        "historicalProviderCounts": dict(collections.Counter(p for m in selected for p in m["historicalPlatforms"])),
        "genres": GENRES, "languages": dict(collections.Counter(m.get("language", "unknown") for m in selected).most_common()),
        "software": {"python": "3.13", "scikit-learn": sklearn.__version__, "numpy": np.__version__},
        "ranking": "LSA and original TF-IDF cosine similarity to favorite films and prompt, lexical overlap, shared people, Bayesian quality prior, then a diversity reranker",
        "limitations": ["No held-out user preference evaluation; these are content similarities, not predicted user ratings.", "Sparse metadata, English plot text and vote counts bias coverage toward well-documented popular films.", "Streaming memberships are historical snapshots from 2021-2022 and are not current availability.", "Source ratings are not maturity ratings; this is not a parental-control filter."],
        "sourceStatistics": {s: dict(v) for s, v in stats.items()},
    }
    (OUT / "model.json").write_text(json.dumps(report, indent=2) + "\n")
    files = {p.name: {"bytes": p.stat().st_size, "sha256": hashlib.file_digest(p.open("rb"), "sha256").hexdigest()} for p in OUT.iterdir() if p.suffix in (".gz", ".json") and p.name != "artifacts.json"}
    (OUT / "artifacts.json").write_text(json.dumps(files, indent=2) + "\n")
    (ROOT / "docs/training-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"movieCount": len(selected), "totalRows": report["totalInputRows"], "vocabulary": len(terms), "explainedVariance": report["explainedVarianceRatio"], "artifactMB": sum(f["bytes"] for f in files.values()) / 1e6, "sources": report["sourceStatistics"]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
