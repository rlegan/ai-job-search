import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { filterJobs, normalizeDetailUrl, parseDetail, parseFrenchDate, parseIsoDate, parseSearchPage, resolveId } from "../src/helpers.js"
import { parseArguments } from "../src/cli.js"

const fixtures = resolve(import.meta.dir, "fixtures")
const searchHtml = readFileSync(resolve(fixtures, "silkhom-search.html"), "utf8")
const detailHtml = readFileSync(resolve(fixtures, "silkhom-detail.html"), "utf8")
const jobs = parseSearchPage(searchHtml) ?? []

describe("Silkhom fixture parsing", () => {
  test("extracts observed markerz records with null employer and exact URLs", () => {
    expect(jobs.length).toBeGreaterThan(100)
    expect(new Set(jobs.map((job) => job.id)).size).toBe(jobs.length)
    expect(jobs.every((job) => job.url.startsWith("https://www.silkhom.com/annonce/") && job.recruiter === "Silkhom")).toBe(true)
    const freelance = jobs.find((job) => job.contractTypeRaw === "Freelance")
    expect(freelance?.employmentType).toBe("Freelance")
    expect(freelance?.employer).toBeNull()
    expect(freelance?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(resolveId(jobs, "519343")).toBe("https://www.silkhom.com/annonce/developpeur-python-systemes-embarques/")
  })

  test("keeps the complete main description and parses explicit visible date and annual salary", () => {
    const job = parseDetail(detailHtml, "519343", "https://www.silkhom.com/annonce/developpeur-c-qt-qml-secteur-de-laudiovisuel-professionnel/")
    expect(job.title).toContain("Développeur C++ QT/QML")
    expect(job.employer).toBeNull()
    expect(job.recruiter).toBe("Silkhom")
    expect(job.date).toBe("2026-10-10")
    expect(job.description).toContain("Créée en 2010")
    expect(job.description).toContain("\n\n")
    expect(job.description).toContain("Vos missions")
    expect(job.description).toContain("Profil recherché")
    expect(job.description).toContain("5 ans minimum")
    expect(job.description).toContain("Compléments")
    expect(job.description).toContain("40-55K€ selon profil")
    expect(job.description).toContain("Environnement technologique")
    expect(job.description).not.toContain("Offres similaires")
    expect(job.salaryAnnual).toMatchObject({ min: 45000, max: 60000, currency: "EUR", unit: "annual" })
    expect(job.tjm).toBeNull()
  })

  test("applies query and age filters locally and strictly", () => {
    const filtered = filterJobs(jobs, "développeur python", 14, new Date("2026-10-11T12:00:00Z"))
    expect(filtered.results.length).toBeGreaterThan(0)
    expect(filtered.results.every((job) => job.date !== null && job.date >= "2026-09-28")).toBe(true)
    expect(parseFrenchDate("31/02/2026")).toBeNull()
    expect(parseFrenchDate("06/10/2026")).toBe("2026-10-06")
    expect(parseIsoDate("2026-02-31")).toBeNull()
  })

  test("refuses unsafe hosts, URL userinfo, schemes, and unsupported path IDs", () => {
    for (const input of ["https://www.silkhom.com@evil.test/annonce/a/", "javascript:alert(1)",
      "https://www.silkhom.com.evil.test/annonce/a/", "https://www.silkhom.com/annonceevil/a/",
      " https://www.silkhom.com/annonce/developpeur-python-systemes-embarques/",
      "https://www.silkhom.com/annonce/Developpeur-python-systemes-embarques/",
      "https://www.silkhom.com/annonce/%2e%2e/target/"]) {
      expect(normalizeDetailUrl(input)).toBeNull()
    }
    expect(normalizeDetailUrl("519343")).toMatchObject({ id: "519343", url: "" })
    expect(normalizeDetailUrl("https://www.silkhom.com/annonce/developpeur-python-systemes-embarques/" )?.url)
      .toBe("https://www.silkhom.com/annonce/developpeur-python-systemes-embarques/")
  })

  test("rejects malformed embedded JSON and malformed CLI flags", () => {
    expect(parseSearchPage("<html>not a marker list</html>")).toBeNull()
    expect(parseArguments(["search", "--query", "backend", "--page", "2", "--limit", "3"])).toHaveProperty("command", "search")
    expect(parseArguments(["search", "--wat", "x"])).toContain("BAD_ARG")
    expect(parseArguments(["search", "--limit", "51"])).toContain("BAD_ARG")
    expect(parseArguments(["detail", "1", "2"])).toContain("BAD_ARG")
  })
})
