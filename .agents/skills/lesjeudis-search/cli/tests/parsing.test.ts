import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { normalizeDetailUrl, parseDetail, parseIsoDate, parseSearchPage, parseFrenchDate } from "../src/helpers.js"
import { parseArguments } from "../src/cli.js"

const fixtures = resolve(import.meta.dir, "fixtures")
const searchHtml = readFileSync(resolve(fixtures, "lesjeudis-search.html"), "utf8")
const detailHtml = readFileSync(resolve(fixtures, "lesjeudis-detail.html"), "utf8")

describe("LesJeudis fixture parsing", () => {
  test("extracts only real latest-offer cards with nullable fields", () => {
    const jobs = parseSearchPage(searchHtml)
    expect(jobs).toHaveLength(12)
    expect(jobs.every((job) => job.url.startsWith("https://lesjeudis.com/offers/"))).toBe(true)
    expect(jobs[0]).toHaveProperty("date", null)
    expect(jobs[0].id).toMatch(/-[a-f0-9]{8}$/i)
    expect(jobs[0].title).not.toMatch(/&(?:amp|#)/)
  })

  test("reads employer, ISO date and readable paragraphs from JSON-LD", () => {
    const job = parseDetail(detailHtml, "developpeur-informatique-editique-f-h-f0d394df", "https://lesjeudis.com/offers/developpeur-informatique-editique-f-h-f0d394df")
    expect(job.title).toContain("Développeur informatique")
    expect(job.employer).toBe("Talan")
    expect(job.date).toBe("2026-10-10")
    expect(job.description).toContain("Description de l'entreprise")
    expect(job.description).toContain("\n\n")
    expect(job.salaryAnnual).toBeNull()
    expect(job.tjm).toBeNull()
  })

  test("rejects foreign hosts, userinfo, unsafe schemes and malformed IDs", () => {
    for (const value of [
      "https://lesjeudis.com.evil.test/offers/a-b-c-d-12345678",
      "https://lesjeudis.com@evil.test/offers/a-b-c-d-12345678",
      "javascript:alert(1)",
      "https://lesjeudis.com.evil.test/offers/foo",
      "not-an-offer",
      " developpeur-informatique-editique-f-h-f0d394df",
      "https://lesjeudis.com/offers/Developpeur-informatique-editique-f-h-f0d394df",
      "https://lesjeudis.com/offers/%2e%2e/offers/developpeur-informatique-editique-f-h-f0d394df",
    ]) expect(normalizeDetailUrl(value)).toBeNull()
    expect(normalizeDetailUrl("developpeur-informatique-editique-f-h-f0d394df")?.url)
      .toBe("https://lesjeudis.com/offers/developpeur-informatique-editique-f-h-f0d394df")
  })

  test("fails closed when the search markup or recognized card list is missing", () => {
    let missingMarker: unknown
    let emptyList: unknown
    try { parseSearchPage("<html>markup changed</html>") } catch (error) { missingMarker = error }
    try { parseSearchPage('<h2 id="dernieres-offres"></h2><ul></ul>') } catch (error) { emptyList = error }
    expect(missingMarker).toMatchObject({ code: "PARSE_ERROR" })
    expect(emptyList).toMatchObject({ code: "PARSE_ERROR" })
  })

  test("does not treat schema.org FULL_TIME as a verified CDI type", () => {
    const html = '<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","employmentType":"FULL_TIME"}</script>'
    const job = parseDetail(html, "engineer-f0d394df", "https://lesjeudis.com/offers/engineer-f0d394df")
    expect(job.employmentType).toBeNull()
    expect(job.contractTypeRaw).toBe("FULL_TIME")
  })

  test("parses strict French dates without accepting invalid calendar days", () => {
    expect(parseFrenchDate("06/10/2026")).toBe("2026-10-06")
    expect(parseFrenchDate("31/02/2026")).toBeNull()
    expect(parseFrenchDate("not a date")).toBeNull()
    expect(parseIsoDate("2026-02-31")).toBeNull()
  })
})

describe("strict CLI arguments", () => {
  test("accepts documented flags and rejects unknown, malformed, and ambiguous arguments", () => {
    expect(typeof parseArguments(["search", "-q", "backend", "--page", "1", "--limit=3"])).toBe("object")
    expect(parseArguments(["search", "--bogus", "x"])).toContain("BAD_ARG")
    expect(parseArguments(["search", "--page", "1.5"])).toContain("BAD_ARG")
    expect(parseArguments(["search", "--query"])).toContain("BAD_ARG")
    expect(parseArguments(["detail", "a", "b"])).toContain("BAD_ARG")
  })
})
