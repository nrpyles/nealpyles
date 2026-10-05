# Homepage hero assets and facts

- Texas boundary: U.S. Census Bureau 2017 cartographic state boundaries, distributed by `us-atlas@3.0.1` (`states-10m.json`, state FIPS 48). Converted to inline SVG with `topojson-client@3.1.0`. The generated SVG needs no mapping library at runtime. License: `texas-map-LICENSE.txt`.
- Neal Pyles portrait: extracted from the original homepage's embedded photograph.
- Manrope, DM Serif Display (normal and italic), JetBrains Mono, and Archivo Black: Latin WOFF2 files from Fontsource version 5.3.0, self-hosted for reliable rendering. Each font's license is included under `fonts/`.
- Hub facts: **2020 decennial Census city-proper populations**, not current estimates, home prices, rates, or metropolitan populations. Each fact links to its Census QuickFacts `POP010220` table. Dallas: 1,304,379; Houston: 2,304,580; Austin: 961,855; San Antonio: 1,434,625; El Paso: 678,815. DFW intentionally displays the Dallas city figure with an explicit Dallas label.
- Population values are static. Keep the year, geography label, figure, and source consistent when updating. The live Census and reference websites were blocked during implementation; their pages were not independently retrieved in this environment.
- Map connecting lines are illustrative transitions between hubs, not roads or lending service boundaries. The map pins use approximate city-center coordinates.

## Second homepage revision

- The regional map uses Texas county meshes from the same U.S. Census 2017 data in `us-atlas@3.0.1`. Each hub has a geographic SVG viewBox, locally labeled communities, a cancelable zoom transition, and a statewide reset. Pins and labels maintain readable sizes while zooming.
- `texas-home-logo.png` is a transparent derivative of the user's attached Texas/house mark, prepared using Image Gen. An original transparent PNG or SVG can replace this derivative without changing the layout.
- D Magazine recognition: 2024, 2025, 2026, as already documented and pictured in the repository's award section. Those years are shown in the first screen and in the existing Person structured data. No new award or ranking claim is added.
- Regional facts and attractions link to the Kimbell Art Museum, NASA Johnson Space Center, Visit Austin, UNESCO, Texas Parks & Wildlife, and individual attraction sites. They are supplemental local context; mortgage guidance and application actions remain primary. These destination pages could not be fetched under the current network policy. The copy uses stable, well-known facts rather than invented statistics or current attendance/pricing claims.
- Mortgage-goal guidance is informational. It does not calculate rates or payments, prequalify a borrower, promise approval, or collect sensitive information.

## Readability revision

- Display headings: Barlow Condensed, weights 700/800, from `@fontsource/barlow-condensed@5.3.0`.
- Body and interface: Inter variable, from `@fontsource-variable/inter@5.3.0`.
- Latin WOFF2 files are self-hosted; licenses are under `fonts/`. Main narrative copy is 17–19 CSS pixels; controls, sources, and supporting labels use 14–17 pixels. SVG labels are sized in screen pixels using the current viewBox and displayed map dimensions, so zoom and responsive layouts retain readable labels.
