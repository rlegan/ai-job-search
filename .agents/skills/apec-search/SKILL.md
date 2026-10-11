---
name: apec-search
version: 1.0.0
description: >
  Search public APEC executive and professional job listings in France.
  Triggers: APEC, emploi cadre, offres d'emploi, recherche emploi, poste cadre,
  job search France, CDI Paris.
context: fork
enabled: false
allowed-tools: Bash(bun run .agents/skills/apec-search/cli/src/cli.ts *)
---

# APEC Search

Personal-use-only, occasional, low-volume use despite the portal's stated
restriction on automated capture. No commercial or bulk use. This connector
does not submit applications and does not bypass access controls.

APEC is represented as a source of French professional/executive employment
offers, not as a freelance-mission source. Search and detail parsers are based
on supplied normal-browser public captures. The observed ordinary direct GET
returned HTTP 403; no alternate endpoint, browser impersonation, cookie, login,
or access-control bypass is used. The CLI currently fails closed with
`ACCESS_DENIED` on 403 and this skill stays disabled until an ordinary public
CLI request succeeds without bypassing a refusal.

## Commands

- `search -q|--query <terms> [--page <n>] [--limit <n>] [--jobage <days>] [--format json|table|plain]`
- `detail <id|url> [--format json|plain]`

The observed search path uses `motsCles` and a zero-indexed `page` parameter;
the CLI accepts a 1-indexed page. Age filtering is client-side from the visible
publication date. Location is not a separate verified search parameter; add a
city to `--query`.

## Examples

- `bun run .agents/skills/apec-search/cli/src/cli.ts search -q "développeur backend Paris" --limit 3 --format json`
- `bun run .agents/skills/apec-search/cli/src/cli.ts search -q "data engineer" --jobage 14 --format table`
- `bun run .agents/skills/apec-search/cli/src/cli.ts search -q "chef de projet informatique" --page 2 --format plain`
- `bun run .agents/skills/apec-search/cli/src/cli.ts detail 179520182W --format plain`
- `bun run .agents/skills/apec-search/cli/src/cli.ts detail https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/179520182W`

## Output

| Format | Description |
| --- | --- |
| `json` | `{ meta: { count, page, ... }, results: [...] }` |
| `table` | Compact result table |
| `plain` | Human-readable result blocks |

## Notes

- The visible offer card exposes company text, title, location, publication
  date, contract label and salary text. Missing values are `null`.
- Detail parsing reads the page's Schema.org `JobPosting` JSON-LD. A recruiting
  firm described as recruiting is recorded as `recruiter`; the actual employer
  remains `null` when the posting does not identify it.
- Annual compensation is kept separate from daily rates. APEC is not described
  or advertised here as a freelance source; `tjm` remains `null`.
- HTTP 403, 429, challenges, hostile redirects, and timeouts fail explicitly.
