# Credits

Copyright (c) 2026 thirtynine. The code in this repository is MIT licensed. See [LICENSE](LICENSE).

The npm package ships `dist/`, `README.md`, and `LICENSE` only. Photographs, the generated silk image, and the fonts below are documentation and benchmark assets. They are not part of the npm tarball.

## Photographs

The photographs are CC0 files on Wikimedia Commons. `scripts/fetch-backdrops.py` downloads them, stops if the Commons API does not report `LicenseShortName` `CC0`, cover-crops them, and writes WebP with no metadata chunk.

Rechecked against the Commons API on 2026-10-15 (`action=query`, `prop=imageinfo`, `iiprop=url|extmetadata|mime`). Each of the four files reported `LicenseShortName` `CC0`, `License` `cc0`, `LicenseUrl` `http://creativecommons.org/publicdomain/zero/1.0/deed.en`, and `UsageTerms` `Creative Commons Zero, Public Domain Dedication`. The Unsplash URLs below are the ones Commons stores in each file's credit field.

| File | Commons file | Creator (Commons Artist field) | Unsplash URL recorded by Commons |
| --- | --- | --- | --- |
| `docs/public/img/glacier.webp` | [Iceberg reflection in Jokulsarlon (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Iceberg_reflection_in_J%C3%B6kuls%C3%A1rl%C3%B3n_(Unsplash).jpg) | Jeremy Bishop tidesinourveins | https://unsplash.com/photos/h7bQ8VEZtws |
| `docs/public/img/lake.webp` and `bench/pages/lake.webp` (same bytes) | [Turquoise mountain lake 1 (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Turquoise_mountain_lake_1_(Unsplash).jpg) | Markus Spiske markusspiske | https://unsplash.com/photos/PyEFH3UWXOA |
| `docs/public/img/city.webp` | [Neon streets (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Neon_streets_(Unsplash).jpg) | JINDONG H jindong | https://unsplash.com/photos/qQwxU7NJWTI |
| `docs/public/img/fruit.webp` | [Collection of fruits (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Collection_of_fruits_(Unsplash).jpg) | Luke Michael lukemichael | https://unsplash.com/photos/1cWZgnBhZRs |

License for all four: [CC0 1.0 Universal](http://creativecommons.org/publicdomain/zero/1.0/deed.en), as reported by Commons (`LicenseShortName: CC0`). Commons files these under the Unsplash review category. The Unsplash template on Commons is CC0 for photographs published on Unsplash before 5 June 2017. License verified via the Wikimedia Commons API on 2026-10-15. Wayback snapshots of those pages, fetched on 2026-10-15, show a Published on date before that cutoff:

| Photo | Published on (text on the snapshot) | Wayback snapshot |
| --- | --- | --- |
| Iceberg, `h7bQ8VEZtws` | May 12, 2017 | https://web.archive.org/web/20170623173738/https://unsplash.com/photos/h7bQ8VEZtws |
| Mountain lake, `PyEFH3UWXOA` | August 15, 2016 | https://web.archive.org/web/20170706053020/https://unsplash.com/photos/PyEFH3UWXOA |
| Neon streets, `qQwxU7NJWTI` | September 25, 2015 | https://web.archive.org/web/20170425055442/https://unsplash.com/photos/qQwxU7NJWTI |
| Fruit, `1cWZgnBhZRs` | July 24, 2015 | https://web.archive.org/web/20170504014507/https://unsplash.com/photos/1cWZgnBhZRs |

## Docs site recordings

`docs/media/controls.webp` is a screenshot of this repository's docs site, captured by `tests/readme/capture.mjs` and encoded with ffmpeg. The photograph in it is `docs/public/img/glacier.webp` (Jeremy Bishop, CC0, listed above). The glass, type, and controls are the docs site itself. It is a documentation asset and is not part of the npm tarball.

`docs/media/player-lens.gif` is a frame-by-frame recording of the docs hero (headless Chromium, 60 fps capture, cut to 25 fps with gifski). It shows the same glacier photograph, the hero lens, and the hero player. The player's cover art is drawn as SVG by `docs/src/player-data.ts`, and its track and artist names are invented. Playback in the player is simulated and silent. Like the still above, it is a documentation asset and is not part of the npm tarball.

## Generated image

`docs/public/img/silk.webp` is drawn by `make_silk()` in `scripts/fetch-backdrops.py`. It is an original file in this repository and is covered by the MIT license. Copyright (c) 2026 thirtynine.

## Fonts

The docs site does not load fonts from Google, and it does not ship Inter or JetBrains Mono. Display, interface, and code type are self-hosted under `docs/src/fonts/`, via Fontsource 5.3.0 (Google Fonts subsets). Each `.woff2` is a Latin subset. The name table of each file carries an OFL URL (`https://scripts.sil.org/OFL`, or `http://scripts.sil.org/OFL` for IBM Plex). The OFL texts beside the files are the upstream licenses. The Fraunces copyright year matches the font name table (2020). SF Pro, SF Mono, and SF Symbols are named in font stacks only. Their files are not in this repository.

| Files | Upstream | What is in the file | License |
| --- | --- | --- | --- |
| `fraunces-roman.woff2`, `fraunces-italic.woff2`, `OFL-Fraunces.txt` | [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces) | Variable Roman and Italic, axes `opsz` and `wght`. Name-table version `1.000;[b76b70a41]`. Name-table copyright 2020. | SIL Open Font License 1.1. Copyright 2020 The Fraunces Project Authors. |
| `outfit.woff2`, `OFL-Outfit.txt` | [Outfitio/Outfit-Fonts](https://github.com/Outfitio/Outfit-Fonts), OFL text from [google/fonts ofl/outfit](https://github.com/google/fonts/tree/main/ofl/outfit) | Variable weight, axis `wght` 100-900. Name-table version `1.100;gftools[0.9.27]`. | SIL Open Font License 1.1. Copyright 2021 The Outfit Project Authors. |
| `ibm-plex-mono-normal-400.woff2`, `ibm-plex-mono-normal-500.woff2`, `OFL-IBMPlex.txt` | [IBM/plex](https://github.com/IBM/plex) | Static IBM Plex Mono Regular and Medium, name-table version 2.3. | SIL Open Font License 1.1. Copyright 2017 IBM Corp. Reserved Font Name "Plex". |

## Icons

`docs/src/icons.ts` is original artwork in this repository (MIT).

The docs header links to the repository with the GitHub Invertocat, the official pictogram from the [GitHub logo guidelines](https://github.com/logos). The path is `GitHub_Invertocat_Black.svg` from the [GitHub Logos](https://brand.github.com/GitHub_Logos.zip) package, used inline with `fill="currentColor"` so it stays black on paper and white over a photo. The geometry is unchanged. GitHub, the GitHub logo, the Invertocat, and the Octocat are trademarks of GitHub, Inc.

## Benchmark bundles

`bench/competitor/dom.bundle.js` and `bench/competitor/react.bundle.js` are built locally by `npm run bench:competitor` from the public MIT npm package `@glass-sdk/liquid-glass` 0.0.2, plus React and React DOM. They are not committed and not published in the glassy-liquid npm package. Locked licenses for that package are MIT, ISC, and BSD-3-Clause. The React bundle keeps the React MIT header (Copyright Meta Platforms, Inc. and affiliates).

## Example wallpapers

These files are byte copies of the CC0 photographs above, so the runnable examples show the same licensed backdrops:

| Copy | Source |
| --- | --- |
| `examples/vanilla-cdn/public/wallpaper.webp`, `examples/react/public/wallpaper.webp` | `docs/public/img/glacier.webp` |
| `examples/vue/public/wallpaper.webp` | `docs/public/img/fruit.webp` |
| `examples/svelte/public/wallpaper.webp` | `docs/public/img/city.webp` |

## Mark

`docs/public/favicon.svg` and `docs/public/favicon.ico` are original artwork in this repository (MIT).
