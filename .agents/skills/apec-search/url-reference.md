# APEC URL reference

Source: public normal-browser fixtures captured 2026-10-10; hashes are in the
provided `fixtures/index.json` and `details-index.json`.

| Purpose | Observed URL / pattern | Notes |
| --- | --- | --- |
| Search | `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=backend` | Ordinary command-line GET returned HTTP 403. The query parameter is visible in the supplied browser capture URL. |
| Search page | `page=0` in a result link | Page is zero-indexed in the observed detail link; the CLI accepts 1-indexed pages. Higher-page behavior is not live-certified. |
| Detail | `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/179520182W` | The normal-browser result card links to this public detail route; ID pattern is nine digits plus uppercase letter. |
| Robots | `https://www.apec.fr/robots.txt` | Ordinary GET returned HTTP 403. |

Search card anchors use `/candidat/recherche-emploi.html/emploi/detail-offre/<id>`;
the visible card contains `.card-offer__company`, `.card-title`, `<ul
class="details-offer">` salary, and `<ul class="details-offer
important-list">` contract, location and publication date. Detail captures expose
a Schema.org `JobPosting` JSON-LD block. No API/XHR method or payload was
verified and none is used. The direct 403 remains fail-closed: no browser
headers, cookies, proxies, or alternate endpoints.

Search query and page mapping are documented from the observed public URL and
result link, but their command-line accessibility has not been certified due
to the 403. The skill is `enabled: false` until an ordinary bounded CLI search
and matching detail fetch succeed.
