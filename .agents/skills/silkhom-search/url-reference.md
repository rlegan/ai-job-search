# Silkhom URL reference

Source: public fixtures captured 2026-10-10; exact source hashes are in the
provided `fixtures/index.json` and `fixtures/details-index.json`.

| Purpose | Verified URL / pattern | Notes |
| --- | --- | --- |
| Offers page 1 | `https://www.silkhom.com/nos-offres-demploi/` | HTML archive; inline `var markerz = [...]` records expose `titre`, `mission_ville`, `mission_type_contrat`, `date`, numeric `id`, and absolute `url`. |
| Detail | `https://www.silkhom.com/annonce/<slug>/` | Exact URLs are supplied in `markerz`; JSON-LD has `JobPosting`, description, organization (Silkhom), location, contract and salary when present. |
| Robots | `https://www.silkhom.com/robots.txt` | HTTP 200 in the supplied fixture; it does not override the terms restriction. |

No query or location request parameter was verified. Although page 1 links to
a `/page/2/` URL, distinct page-2 results were not verified; the CLI therefore
rejects page numbers above 1. Search terms and age are filtered against one
page of public `markerz` records locally. Dates are strict French calendar
dates. The observed detail JSON-LD organization is Silkhom,
which is represented as `recruiter`, not the unknown client/employer. Public
terms restriction and the user's limited personal-use choice are disclosed in
`SKILL.md`; no publisher permission or technical bypass is implied.
