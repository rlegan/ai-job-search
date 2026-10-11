# APEC CLI

Zero runtime dependencies; run with Bun. Occasional personal use only, low
volume, no commercial or bulk use. APEC's terms restrict automated capture.
The supplied normal-browser captures parse offline, but the verified ordinary
direct GET returned 403; this CLI does not bypass that refusal and the skill
must remain disabled until normal CLI access is independently verified.

```sh
bun run src/cli.ts search --query "développeur backend Paris" --limit 3 --format json
bun run src/cli.ts detail 179520182W --format plain
bun test --timeout 30000
```

APEC is a professional/executive employment source, not a freelance mission
board. Annual salary and daily-rate fields are distinct; this connector does
not label APEC as a freelance source.
