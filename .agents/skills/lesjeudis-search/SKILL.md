---
name: lesjeudis-search
version: 1.0.0
description: >
  Search public LesJeudis technology and IT job offers in France. Triggers:
  LesJeudis, emploi informatique, offres d'emploi tech, recherche emploi,
  développeur, mission freelance, job search France.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/lesjeudis-search/cli/src/cli.ts *)
---

# LesJeudis Search

Personal-use-only, occasional, low-volume use despite the portal's stated
automation restriction. No commercial or bulk use. This connector does not
submit applications and does not bypass access controls.

Searches the changing, incomplete latest-offers subset exposed by the public
`/offers` page. The captured response contained 12 cards; that count is a
snapshot, not a completeness claim. The portal's search filters and
pagination transport have not been verified, so `--query` is filtered
locally, `--page` supports only page 1, and `--jobage` is rejected because the
listing has no reliable publication date.

## Commands

- `search [-q|--query <terms>] [--page 1] [--limit <n>] [--format json|table|plain]`
- `detail <id|url> [--format json|plain]`

The search `id` is the exact offer slug returned by search. A full detail URL
must use `https://lesjeudis.com/offers/<slug>`.

## Examples

- `bun run .agents/skills/lesjeudis-search/cli/src/cli.ts search -q "développeur backend" --limit 3 --format json`
- `bun run .agents/skills/lesjeudis-search/cli/src/cli.ts search -q "data engineer" --format table`
- `bun run .agents/skills/lesjeudis-search/cli/src/cli.ts search --page 1 --format plain`
- `bun run .agents/skills/lesjeudis-search/cli/src/cli.ts detail ingenieur-securite-digital-workplace-h-f-ecc4abb1 --format plain`

## Output

| Format | Description |
| --- | --- |
| `json` | `{ meta: { count, page, ... }, results: [...] }` |
| `table` | Compact result table |
| `plain` | Human-readable result blocks |

## Notes

- Search reads the current public latest-offers subset; the captured fixture
  contains 12 real cards, but the live list may change and is not complete.
  Company and location are parsed from visible card text. Publication date is
  `null` when not present.
- Detail reads the posting's public Schema.org `JobPosting` JSON-LD.
- CLI requests use an honest tool User-Agent. HTTP 403, 429, challenges,
  hostile redirects, and timeouts fail explicitly.
