# Silkhom CLI

Zero runtime dependencies; run with Bun. Occasional personal use only, low
volume, no commercial or bulk use. The portal's terms restrict database
extraction; no publisher permission is implied.

```sh
bun run src/cli.ts search --query "développeur Python" --jobage 14 --limit 5 --format json
bun run src/cli.ts detail 519343 --format plain
bun test --timeout 30000
```

Search filters one verified archive page locally. Only page 1 is supported:
the observed `rel="next"` link does not prove that page 2 contains distinct
results, so `--page 2` and higher fail explicitly. `detail <id>` resolves
against page 1; pass an exact returned URL for other postings. Results expose
the recruiter as Silkhom and leave unknown employers null.
