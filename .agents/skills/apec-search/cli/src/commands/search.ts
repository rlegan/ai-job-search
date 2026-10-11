import { buildSearchUrl, fetchHtml, filterJobs, parseSearchPage, PortalError, writeError, type Job } from "../helpers.js"

export interface SearchOptions { query: string; page: number; limit: number; jobage?: number; format: "json" | "table" | "plain" }

function renderTable(jobs: Job[]): string {
  if (!jobs.length) return "No results."
  const header = `${"TITLE".padEnd(42)} ${"COMPANY".padEnd(24)} ${"LOCATION".padEnd(24)} ${"CONTRACT".padEnd(10)} DATE`
  return [header, "-".repeat(header.length), ...jobs.map((job) =>
    `${job.title.slice(0, 42).padEnd(42)} ${(job.company ?? "—").slice(0, 24).padEnd(24)} ${(job.location ?? "—").slice(0, 24).padEnd(24)} ${(job.contractTypeRaw ?? "—").slice(0, 10).padEnd(10)} ${job.date ?? "—"}`)].join("\n")
}

export async function runSearch(options: SearchOptions): Promise<number> {
  try {
    const html = await fetchHtml(buildSearchUrl(options.query, options.page))
    if (!html) throw new PortalError("Search page not found", "NOT_FOUND")
    const source = parseSearchPage(html)
    if (source === null) throw new PortalError("Response did not contain the observed APEC result-card container", "PARSE_ERROR")
    const filtered = filterJobs(source, options.jobage)
    const results = filtered.slice(0, options.limit)
    const meta = { count: results.length, page: options.page, sourceCount: source.length,
      ageFiltered: options.jobage !== undefined, dateUnknownExcluded: options.jobage === undefined ? 0 : source.filter((job) => job.date === null).length, complete: false }
    if (options.format === "table") process.stdout.write(`${renderTable(results)}\n`)
    else if (options.format === "plain") process.stdout.write(results.map((job) => `${job.title}\n  ${job.company ?? "—"} · ${job.location ?? "—"} · ${job.contractTypeRaw ?? "—"} · ${job.date ?? "—"}\n  id: ${job.id}\n  ${job.url}`).join("\n\n") + "\n")
    else process.stdout.write(`${JSON.stringify({ meta, results }, null, 2)}\n`)
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), error instanceof PortalError ? error.code : "SEARCH_FAILED")
    return 1
  }
}
