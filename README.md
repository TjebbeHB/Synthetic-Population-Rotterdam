# Synthetic Population Rotterdam

The standalone **GGD-styled population generator and Rotterdam map**, extracted from [Synthetic-Pandemic-Sim](https://github.com/TjebbeHB/Synthetic-Pandemic-Sim) at commit `155beb36ba55077270912516389b8e6e826201de`.

## Included

- Synthetic people for Rotterdam, a selected province, or the Netherlands, using CBS open data for **2022–2025**.
- Optional household, school, work, income, education, car and event features; activity diaries and reproducible seeds.
- Research ZIP exports with people, clusters, memberships, quality checks, metadata, methods and a data dictionary.
- Rotterdam wijk/buurt mapping, synthetic household locations, person details, activity agendas and fullscreen mode.
- Approximate sewage catchment assignment; Translink aggregate reference profiles and an optional local NS stations connector.

Only these two current views are included. The older network dashboards, scenario atlas, cellular models, Android app and hackathon workspaces remain in the original repository. Shared attendance and map-state helpers are retained; the old epidemic simulation engine is omitted.

## Run locally

Use Node.js **22.12 or later** (Node 24 LTS recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Generate a Rotterdam population, then select **Rotterdamse kaart**. Population generation runs in a browser worker; downloads stay on your computer. CBS 2024 snapshots are bundled; other years and source refreshes require internet access. Map tiles also require internet access.

```sh
npm test
npm run build
npm run preview
```

Deploy `dist/` to a static host at the domain root. The app has no required backend, database or API key. No machine-specific tunnel credentials or hosting configuration are included.

## Research downloads

Create datasets from the UI, or use the same generator from the command line:

```sh
npm run export:research -- --scope rotterdam --count 5000 --activities --translink --out output/rotterdam.zip
npm run export:research -- --scope national --year 2022 --count 100000 --out output/netherlands-2022.zip
npm run export:research -- --scope province --province PV28 --year 2024 --count 5000 --out output/zuid-holland.zip
npm run export:research -- --scope national --full --out output/netherlands-full.zip
```

Generated datasets are excluded from Git. A full Netherlands export needs substantial free disk space. Browser exports above 250,000 people require desktop Chrome/Edge direct-to-file support; the CLI is the alternative. Activity exports are capped at 100,000 people in the UI. The standalone app has no links to pre-generated files that are absent from the repository.

See [methods](docs/research-methods.md) and the [data dictionary](docs/research-data-dictionary.md). These documents are also included in research ZIPs and copied into the built site automatically.

## Optional NS station context

Register at [the NS API portal](https://apiportal.ns.nl/) and obtain access to its station API product. Set `NS_API_KEY` in your local process environment, then run:

```sh
node scripts/fetch-ns-stations.mjs
```

Import `output/ns-stations.json` in the generator. Keep the key outside the frontend and repository. Station context and Translink aggregate profiles do not reconstruct individual travel or calibrate movement automatically.

## Interpretation and attribution

This is a research prototype, not an official GGD dashboard or a validated reconstruction of real individuals. GGD styling and the existing logo are retained; branding does not imply endorsement. Household positions are fictional. Rotterdam geometry is a clearly labelled **2024 reference**, including when population statistics use another year. Sewage catchment assignments are approximate and use the included historical geometry. Synthetic relationships and activity schedules include explicit assumptions, documented in the methods and quality reports.

Source metadata is bundled with the CBS, geographic and mobility snapshots. The original Apache-2.0 code license and data/documentation attribution notice are retained in [LICENSE](LICENSE) and [LICENSE-DATA](LICENSE-DATA). Upstream data and trademarks retain their respective terms.
