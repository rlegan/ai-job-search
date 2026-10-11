import { fetchHtml, filterJobs, parseSearchPage, PortalError, writeError, type Job } from "../helpers.js"

export interface SearchOptions { query?: string; page: number; limit: number; jobage?: number; format: "json" | "table" | "plain" }

function renderTable(jobs: Job[]): string {
  if (!jobs.length) return "No results."
  const header = `${"TITLE".padEnd(42)} ${"CONTRACT".padEnd(12)} ${"LOCATION".padEnd(24)} DATE`
  return [header, "-".repeat(header.length), ...jobs.map((job) =>
    `${job.title.slice(0, 42).padEnd(42)} ${(job.contractTypeRaw ?? "—").slice(0, 12).padEnd(12)} ${(job.location ?? "—").slice(0, 24).padEnd(24)} ${job.date ?? "—"}`)].join("\n")
}

export async function runSearch(options: SearchOptions): Promise<number> {
  if (options.page !== 1) { writeError("Only page 1 is verified; page 2 behavior is not established", "PAGE_UNVERIFIED"); return 1 }
  const url = "https://www.silkhom.com/nos-offres-demploi/"
  try {
    const html = await fetchHtml(url, "/nos-offres-demploi")
    if (!html) throw new PortalError("Offers page not found", "NOT_FOUND")
    const source = parseSearchPage(html)
    if (source === null) throw new PortalError("Offers page did not contain the verified markerz list", "PARSE_ERROR")
    const filtered = filterJobs(source, options.query, options.jobage)
    const results = filtered.results.slice(0, options.limit)
    const meta = { count: results.length, page: options.page, sourceCount: source.length,
      filtered: Boolean(options.query || options.jobage !== undefined), dateUnknownExcluded: filtered.dateUnknownExcluded, complete: false }
    if (options.format === "table") process.stdout.write(`${renderTable(results)}\n`)
    else if (options.format === "plain") process.stdout.write(results.map((job) => `${job.title}\n  Recruiter: ${job.recruiter ?? "—"} · ${job.location ?? "—"} · ${job.contractTypeRaw ?? "—"} · ${job.date ?? "—"}\n  id: ${job.id}\n  ${job.url}`).join("\n\n") + "\n")
    else process.stdout.write(`${JSON.stringify({ meta, results }, null, 2)}\n`)
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), error instanceof PortalError ? error.code : "SEARCH_FAILED")
    return 1
  }
}
