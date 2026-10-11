import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { buildSearchUrl, filterJobs, normalizeDetailUrl, parseDate, parseDetail, parseSearchPage } from "../src/helpers.js"
import { parseArguments } from "../src/cli.js"

const fixtures = resolve(import.meta.dir, "fixtures")
const searchHtml = readFileSync(resolve(fixtures, "apec-search-browser.html"), "utf8")
const detailHtml = readFileSync(resolve(fixtures, "apec-detail-browser.html"), "utf8")

describe("APEC normal-browser fixtures", () => {
  test("parses card fields, exact detail IDs, annual salary and explicit CDI", () => {
    const jobs = parseSearchPage(searchHtml)
    expect(jobs).not.toBeNull()
    expect(jobs).toHaveLength(20)
    expect(new Set(jobs?.map((item) => item.id)).size).toBe(20)
    const job = jobs?.find((item) => item.id === "179520182W")
    expect(job).toMatchObject({ title: "Backend Developer F/H", company: "TEAMIS", location: "Paris 10 - 75", date: "2026-10-02", employmentType: "CDI", contractTypeRaw: "CDI", tjm: null })
    expect(job?.url).toBe("https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/179520182W")
    expect(job?.salaryAnnual).toMatchObject({ min: 70000, max: 80000, currency: "EUR", unit: "annual" })
    expect(job?.employer).toBeNull()
    expect(job?.recruiter).toBeNull()
  })

  test("reads readable detail JSON-LD and distinguishes the recruiter from the unknown employer", () => {
    const job = parseDetail(detailHtml, "179520182W", "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/179520182W")
    expect(job.title).toBe("Backend Developer F/H")
    expect(job.recruiter).toBe("TEAM.IS")
    expect(job.employer).toBeNull()
    expect(job.location).toBe("PARIS 10")
    expect(job.date).toBe("2026-10-02")
    expect(job.description).toContain("Backend Developer")
    expect(job.description).toContain("\n\n")
    expect(detailHtml).toContain("Descriptif du poste")
    expect(detailHtml).toContain("Profil recherché")
    expect(detailHtml).toContain("Compétences attendues")
    expect(detailHtml).not.toContain("postuler-a-une-offre")
    expect(job.salaryAnnual).toMatchObject({ min: 70000, max: 80000, unit: "annual" })
    expect(job.tjm).toBeNull()
  })

  test("maps only observed query/page parameters and filters by known dates", () => {
    const url = new URL(buildSearchUrl("backend", 1))
    expect(url.searchParams.get("motsCles")).toBe("backend")
    expect(url.searchParams.get("page")).toBe("0")
    const jobs = parseSearchPage(searchHtml) ?? []
    expect(filterJobs(jobs, 14, new Date("2026-10-11T12:00:00Z")).some((job) => job.id === "179520182W")).toBe(true)
    expect(parseDate("31/02/2026")).toBeNull()
    expect(parseDate("02/10/2026")).toBe("2026-10-02")
    expect(parseDate("2026-02-31")).toBeNull()
  })

  test("rejects foreign host, userinfo, wrong route, malformed IDs and unknown args", () => {
    for (const input of ["https://www.apec.fr@evil.test/candidat/recherche-emploi.html/emploi/detail-offre/179520182W",
      "https://www.apec.fr.evil.test/candidat/recherche-emploi.html/emploi/detail-offre/179520182W",
      "javascript:alert(1)", "https://www.apec.fr/other/179520182W", "179520182w", "179520182Wextra"]) {
      expect(normalizeDetailUrl(input)).toBeNull()
    }
    expect(normalizeDetailUrl("179520182W")?.url).toBe("https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/179520182W")
    expect(parseSearchPage("<html>incomplete</html>")).toBeNull()
    expect(parseArguments(["search", "-q", "backend", "--page", "1"])).toHaveProperty("command", "search")
    expect(parseArguments(["search", "--query", "backend", "--unknown", "x"])).toContain("BAD_ARG")
    expect(parseArguments(["search"])).toContain("BAD_ARG")
  })
})
