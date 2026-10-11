# LesJeudis URL reference

Source: public fixtures captured 2026-10-10; hashes are recorded in the
provided `fixtures/index.json` and `fixtures/details-index.json`.

| Purpose | Verified URL / pattern | Notes |
| --- | --- | --- |
| Latest offers | `https://lesjeudis.com/offers` | HTML page; `h2#dernieres-offres` followed by a list containing 12 cards in the supplied capture. The live latest-offers subset changes and is incomplete. |
| Detail | `https://lesjeudis.com/offers/<slug>` | Exact relative offer link from search card; detail includes a Schema.org `JobPosting` JSON-LD object. |
| Robots | `https://lesjeudis.com/robots.txt` | HTTP 200 in the supplied fixture; this is not permission to ignore the portal's terms. |

No query, location, date, or pagination parameter was verified. Search filters
are therefore local to the fetched latest-offers list; `--jobage` and pages
other than 1 return an explicit error. Result dates are `null` because the
verified list does not expose them. Detail metadata includes `datePosted`,
`validThrough`, `hiringOrganization`, `jobLocation`, `employmentType`, and
`baseSalary` when present. The public terms restriction is disclosed in
`SKILL.md`; this user-authorized personal-use connector does not imply publisher
permission.
