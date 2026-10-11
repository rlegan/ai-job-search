---
name: silkhom-search
version: 1.0.0
description: >
  Search public French IT and engineering recruitment listings on Silkhom.
  Triggers: Silkhom, mission freelance, offres freelance, emploi informatique,
  développeur, recherche de mission, freelance IT France.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/silkhom-search/cli/src/cli.ts *)
---

# Silkhom Search

Personal-use-only, occasional, low-volume use despite the portal's stated
database-extraction restriction. No commercial or bulk use. This connector
does not submit applications and does not bypass access controls.

The verified public offers archive embeds a list with title, location,
contract, publication date, numeric listing ID, and exact detail URL. Search
term and `--jobage` filters are client-side. Only page 1 is used: the supplied
capture's `rel="next"` link does not establish that page 2 returns a distinct
result set, so `--page 2` and higher are rejected as unverified.

## Commands

- `search [-q|--query <terms>] [--page 1] [--limit <n>] [--jobage <days>] [--format json|table|plain]`
- `detail <id|url> [--format json|plain]`

For `detail <id>`, the CLI resolves the exact URL from page 1's observed
listing data. If the ID is not on page 1, pass the full URL returned by search.
Employer names are not exposed in the verified listing/detail; the source is
labelled as recruiter `Silkhom` rather than presented as the employer.

## Examples

- `bun run .agents/skills/silkhom-search/cli/src/cli.ts search -q "développeur Python" --limit 5 --format json`
- `bun run .agents/skills/silkhom-search/cli/src/cli.ts search -q "DevOps" --jobage 14 --format table`
- `bun run .agents/skills/silkhom-search/cli/src/cli.ts search --page 1 --limit 3 --format plain`
- `bun run .agents/skills/silkhom-search/cli/src/cli.ts detail 519343 --format plain`
- `bun run .agents/skills/silkhom-search/cli/src/cli.ts detail https://www.silkhom.com/annonce/developpeur-python-systemes-embarques/`

## Output

| Format | Description |
| --- | --- |
| `json` | `{ meta: { count, page, ... }, results: [...] }` |
| `table` | Compact result table |
| `plain` | Human-readable result blocks |

## Notes

- The archive's inline `markerz` data is the observed source; no API or filter
  endpoint is assumed. Results are limited to one verified page and report
  incomplete scope in `meta.complete: false`; page 2 is unverified and fails
  explicitly.
- Dates are parsed from the source's French `DD/MM/YYYY` values; missing or
  invalid dates remain `null` and are excluded from an age-filtered result.
- Detail pages use Schema.org `JobPosting` JSON-LD. Anonymous clients remain
  `employer: null`; `recruiter` is `Silkhom`.
- HTTP 403, 429, challenges, hostile redirects, and timeouts fail explicitly.
