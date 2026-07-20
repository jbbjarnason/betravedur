# @betravedur/site

The Betra Veður static site — a Vite + TypeScript single-page app with an interactive
MapLibre map of Iceland rendered from a self-hosted PMTiles basemap (no API keys).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev -w site` | Vite dev server (base `/`) |
| `npm run build -w site` | Production build → `dist/` (base `/betravedur/`) |
| `npm run preview -w site` | Serve the production build locally |
| `npm run e2e -w site` | Playwright E2E against the **production preview build** |
| `npm run copy-data -w site` | Refresh `public/data/` from the `data` branch |

## Base path

The site deploys to GitHub **project** Pages at `/betravedur/`. `vite.config.ts` sets
`base: "/betravedur/"`; runtime asset URLs (the `pmtiles://` basemap URL and `fetch`
strings) are prefixed with `import.meta.env.BASE_URL`. The E2E suite drives the
**preview** build (which honours `base`) — not the dev server — because the historical
maplibre-gl × Vite worker breakage was production-only.

## Basemap: `public/iceland.pmtiles`

A one-time Iceland extract from the Protomaps daily planet build, committed as a plain
blob (NOT Git LFS — Pages won't serve LFS pointers).

```bash
go install github.com/protomaps/go-pmtiles@v1.31.1   # or: brew install protomaps/tap/pmtiles
go-pmtiles extract \
  https://build.protomaps.com/<YYYYMMDD>.pmtiles \
  site/public/iceland.pmtiles \
  --bbox=-26,62.5,-12,67.5 --maxzoom=9 --download-threads=4
```

- **Extracted:** from `20260719.pmtiles` at `--maxzoom=9`.
- **Measured size:** **7,675,569 bytes (7.3 MiB)** — well under the GitHub Pages
  100 MB/file and 1 GB/site limits. The `--bbox` matches the map's `maxBounds`.
- MapLibre overzooms basemap tiles past maxzoom 9 up to the map's maxZoom 12, so the
  small extract still reads cleanly at street zoom.

## Sample data: `public/data/`

The committed sample is the **interim SW-corner subset** — Reykjavík (#1) and
Keflavíkurflugvöllur (#1350) only — copied from the `data` branch so the site builds
and deploys standalone. The full national dataset arrives via Phase 8's
pipeline/deploy. Only `stations.json`, `manifest.json`, and the content-hashed
`derived/*.json` files ship; `raw/` is never copied (PIPELINE.md ship rule).

Markers are added in Plans 02/03 — this plan is the shell + basemap foundation.
