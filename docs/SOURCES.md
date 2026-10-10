# Data sources and human credits

Retrieved 10 October 2026 through the public Kaggle API. Dataset versions are pinned in `data/sources.json`. Creator names below are the publishers named in Kaggle metadata, written as published (e.g. **asaniczka** by handle, **David Lu!!** with his own punctuation, **DHRITI SISODIA** in her published capitalization). No legal name is inferred.

| Dataset and creator | Version / updated | Kaggle license label | Contribution |
| --- | --- | --- | --- |
| [Full TMDB Movies Dataset 2024 (1M Movies)](https://www.kaggle.com/datasets/asaniczka/tmdb-movies-dataset-2023-930k-movies) — [asaniczka](https://www.kaggle.com/asaniczka) | 1085 / 2026-10-10 | ODC Attribution License (ODC-By) | Current TMDB titles, plots, genres, ratings, runtimes, languages and poster paths |
| [The Movies Dataset](https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset) — [Rounak Banik](https://www.kaggle.com/rounakbanik) | 7 / 2017-11-10 | CC0: Public Domain | TMDB movie metadata, cast, directors and plot keywords; MovieLens ratings and links are excluded |
| [TMDB 5000 Movie Dataset](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata) — [Sohier Dane / The Movie Database](https://www.kaggle.com/tmdb) | 2 / 2017-09-28 | Other (specified in description) | TMDB movie metadata, cast, directors and plot keywords |
| [IMDB Movies Dataset](https://www.kaggle.com/datasets/harshitshankhdhar/imdb-dataset-of-top-1000-movies-and-tv-shows) — [Harshit Shankhdhar](https://www.kaggle.com/harshitshankhdhar) | 1 / 2021-02-01 | CC0: Public Domain | Top-film genres, cast, directors, ratings and runtime |
| [Netflix Movies and TV Shows](https://www.kaggle.com/datasets/shivamb/netflix-shows) — [Shivam Bansal](https://www.kaggle.com/shivamb) | 5 / 2021-09-27 | CC0: Public Domain | Movie-only catalog descriptions, cast, directors, genres and runtime; historical Netflix snapshot |
| [Netflix TV Shows and Movies](https://www.kaggle.com/datasets/victorsoeiro/netflix-tv-shows-and-movies) — [Victor Soeiro](https://www.kaggle.com/victorsoeiro) | 2 / 2022-07-26 | CC0: Public Domain | Movie-only genres, descriptions, cast and directors from a July 2022 US JustWatch snapshot |
| [Movies on Netflix, Prime Video, Hulu and Disney+](https://www.kaggle.com/datasets/ruchi798/movies-on-netflix-prime-video-hulu-and-disney) — [Ruchi Bhatia](https://www.kaggle.com/ruchi798) | 5 / 2021-12-16 | CC0: Public Domain | Movie titles, years and historical catalog membership; no live availability claims |
| [Amazon Prime Movies and TV Shows](https://www.kaggle.com/datasets/shivamb/amazon-prime-movies-and-tv-shows) — [Shivam Bansal](https://www.kaggle.com/shivamb) | 1 / 2021-10-12 | CC0: Public Domain | Movie-only descriptions, cast, directors, genres and runtime; historical Prime Video snapshot |
| [HBO Max TV Shows and Movies](https://www.kaggle.com/datasets/victorsoeiro/hbo-max-tv-shows-and-movies) — [Victor Soeiro](https://www.kaggle.com/victorsoeiro) | 1 / 2022-05-19 | CC0: Public Domain | Movie-only genres, descriptions, cast and directors from a May 2022 US JustWatch snapshot |
| [TMDB Top Rated 10000 MOVIES DATASET 2026](https://www.kaggle.com/datasets/dhritisisodia/tmdb-top-10000-movies-dataset-2026) — [DHRITI SISODIA](https://www.kaggle.com/dhritisisodia) | 1 / 2026-02-16 | CC0: Public Domain | A 2026 TMDB snapshot to extend recent movie metadata and refresh ratings |
| [The Oscar Award, 1927 - 2026](https://www.kaggle.com/datasets/unanimad/the-oscar-award) — [David Lu!!](https://www.kaggle.com/unanimad) (also: unanimad; David Lu (DLu/oscar_data); lopcio, acknowledged in the dataset card) | 13 / 2026-05-11 | CC0: Public Domain | Academy Award winners, categories and credited honorees through the 2026 ceremony |
| [Amazon Prime TV Shows and Movies](https://www.kaggle.com/datasets/victorsoeiro/amazon-prime-tv-shows-and-movies) — [Victor Soeiro](https://www.kaggle.com/victorsoeiro) | 1 / 2022-05-14 | CC0: Public Domain | Movie-only metadata and cast from a May 2022 US Prime Video / JustWatch snapshot |
| [Disney+ TV Shows and Movies](https://www.kaggle.com/datasets/victorsoeiro/disney-tv-shows-and-movies) — [Victor Soeiro](https://www.kaggle.com/victorsoeiro) | 1 / 2022-05-13 | CC0: Public Domain | Movie-only metadata and cast from a May 2022 US Disney+ / JustWatch snapshot |
| [Hulu TV Shows and Movies](https://www.kaggle.com/datasets/victorsoeiro/hulu-tv-shows-and-movies) — [Victor Soeiro](https://www.kaggle.com/victorsoeiro) | 1 / 2022-05-19 | CC0: Public Domain | Movie-only metadata and cast from a May 2022 US Hulu / JustWatch snapshot |

## Original providers and artwork

- **The Movie Database (TMDB) and its contributor community:** movie metadata, plots, keywords, vote statistics and imagery used by the TMDB datasets. Kaggle identifies **Sohier Dane** as the creator of the TMDB 5000 release, published under the TMDB account. [TMDB attribution and noncommercial terms](https://developer.themoviedb.org/docs/faq), [approved logos](https://www.themoviedb.org/about/logos-attribution).
- **JustWatch:** Victor Soeiro identifies [JustWatch US](https://www.justwatch.com/us) as the original provider for his Netflix, HBO Max, Prime Video, Disney+ and Hulu catalogs (May–July 2022, US). His [collection code](https://github.com/victor-soeiro/WebScraping-Projects/tree/main/justwatch) documents that work.
- **Academy of Motion Picture Arts and Sciences:** Oscar winner data in *The Oscar Award, 1927 – 2026* was scraped from the [official Academy Awards database](https://awardsdatabase.oscars.org) and is maintained with [David Lu's oscar_data](https://github.com/DLu/oscar_data); the dataset card also thanks **lopcio** for fixes. Each in-app award links to its ceremony page on oscars.org and lists the human honorees as recorded. Winner rows are matched to films by normalized title and film year (±1); 305 winner rows (mostly shorts and titles outside the catalog) did not match and are not shown.
- **IMDb:** Harshit Shankhdhar collected top-film facts from IMDb. The app retains source labels for IMDb ratings when used. IMDb synopsis text and image URLs are excluded from the public catalog. [IMDb conditions](https://www.imdb.com/conditions).
- **GroupLens:** Rounak Banik identifies GroupLens as the provider of the MovieLens movie list, ratings and links bundled with his dataset. This app uses his TMDB metadata, cast and keywords. MovieLens user ratings and link tables are excluded from extraction, training and publication. [Original collection](https://grouplens.org/datasets/movielens/latest/).
- **Original film studios, creators and artwork rights holders:** movie posters and backdrops remain their copyrighted artwork. Images load remotely from TMDB rather than being relicensed or included in the repository. Per-film TMDB links and source citations appear in the movie details.
- **TMDB logo:** the unmodified approved blue long logo comes from [TMDB logos and attribution](https://www.themoviedb.org/about/logos-attribution). It identifies the source and implies no endorsement.
- **Fonts:** DM Sans by Colophon Foundry and Instrument Serif by Rodrigo Fuenzalida are served through Google Fonts under their font licenses. [DM Sans source and license](https://github.com/google/fonts/tree/main/ofl/dmsans), [Instrument Serif source and license](https://github.com/google/fonts/tree/main/ofl/instrumentserif).

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Terms and transformations

The app is a **noncommercial discovery demo**. The original application code is MIT licensed. Third-party data, database rights, plots, posters and trademarks are separate from that code license. Kaggle uploader license labels do not remove the original providers' rights.

Contains information from **Full TMDB Movies Dataset 2024 (1M Movies)** by **asaniczka**, made available here under the [Open Data Commons Attribution License (ODC-By) v1.0](https://opendatacommons.org/licenses/by/1-0/). ODC-By applies to database rights and does not itself license every individual description or image.

The published database is a transformed subset: movie-only rows are normalized; records are joined by TMDB ID, IMDb ID or normalized title/year; duplicates are merged; adult-flagged TMDB records and unreleased records are excluded; feature films with plots, genres and suitable runtimes are retained; then 35,000 films are selected, with 2024–2026 releases and Academy Award winners kept first and the rest ranked by source vote counts. The catalog is not an unmodified copy of any original dataset. The model learns TF-IDF / LSA weights from this subset.

Rounak Banik, Harshit Shankhdhar, Shivam Bansal, Victor Soeiro, Ruchi Bhatia, DHRITI SISODIA and David Lu!! publish the selected releases with Kaggle's [CC0: Public Domain label](https://creativecommons.org/publicdomain/zero/1.0/). TMDB 5000 instead specifies TMDB's terms in its dataset description. These labels are recorded as supplied, with upstream provider notes above.

Streaming membership fields are historical snapshots from **2021–2022**, do not cover all countries, and do not establish current availability. The catalog covers **1911–2026**. Recent coverage is thinner than older years: 2024 (219 films), 2025 (149) and 2026 (5) come mainly from DHRITI SISODIA's early-2026 TMDB top-rated snapshot, because the full TMDB snapshot carries very low vote counts for recent rows and those rows are filtered out as unreliable. A few recent films have no runtime in their source; the app shows "Runtime unavailable". Academy Award wins are included through the **2026 ceremony**.

## Reproducibility and citation files

- [Download manifest](../data/download-manifest.json): stable dataset URLs, author names, pinned versions, source update timestamps, retrieval timestamps, archive sizes, archive SHA-256 and extracted-file SHA-256.
- [Training report](training-report.json): counts, software versions, vocabulary size, dimensions, compression fidelity, contribution counts and limitations.
- [Browser artifact manifest](../public/data/artifacts.json): byte lengths and SHA-256 hashes checked before deployment.
- [Browser source ledger](../public/data/sources.json): full receipts plus actual contributions to the model.

Raw archives are stored locally in ignored `data/raw/` and are not pushed to GitHub. No dataset authors are added as repository collaborators merely for citation; credit is documented here and in the app.
