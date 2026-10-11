# LesJeudis CLI

Zero runtime dependencies; run with Bun. Occasional personal use only, low
volume, no commercial or bulk use. The public terms restrict automated
collection; no publisher permission is implied.

```sh
bun run src/cli.ts search --query "développeur backend" --limit 3 --format json
bun run src/cli.ts detail <exact-offer-slug> --format plain
bun test --timeout 30000
```

The captured `/offers` response contained 12 cards. This is a changing,
incomplete latest-offers subset, not a complete catalogue. Search term
filtering is local. Other pages and date filtering fail explicitly because
neither was verified in the public response. Dates absent from source data
stay `null`.
