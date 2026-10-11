import { fetchHtml, parseSearchPage, PortalError, writeError, type Job } from "../helpers.js"

export interface SearchOptions {
  query?: string
  page: number
  limit: number
  jobage?: number
  format: "json" | "table" | "plain"
}

function renderTable(jobs: Job[]): string {
  if (!jobs.length) return "No results."
  const header = `${"TITLE".padEnd(42)} ${"COMPANY".padEnd(24)} ${"LOCATION".padEnd(26)} DATE`
  return [header, "-".repeat(header.length), ...jobs.map((job) =>
    `${job.title.slice(0, 42).padEnd(42)} ${(job.company ?? "—").slice(0, 24).padEnd(24)} ${(job.location ?? "—").slice(0, 26).padEnd(26)} ${job.date ?? "—"}`)].join("\n")
}

export async function runSearch(options: SearchOptions): Promise<number> {
  if (options.page !== 1) {
    writeError("Only page 1 is verified on the public latest-offers page", "PAGE_UNSUPPORTED")
    return 1
  }
  if (options.jobage !== undefined) {
    writeError("The listing does not expose reliable dates for age filtering", "FILTER_UNSUPPORTED")
    return 1
  }
  try {
    const source = await fetchHtml("https://lesjeudis.com/offers")
    if (!source) throw new PortalError("Offers page not found", "NOT_FOUND")
    const found = parseSearchPage(source)
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR")
    const query = options.query ? normalize(options.query.trim()) : ""
    const filtered = query
      ? found.filter((job) => normalize(`${job.title} ${job.company ?? ""} ${job.location ?? ""}`).includes(query))
      : found
    const results = filtered.slice(0, options.limit)
    if (options.format === "table") process.stdout.write(`${renderTable(results)}\n`)
    else if (options.format === "plain") process.stdout.write(results.map((job) => `${job.title}\n  ${job.company ?? "—"} · ${job.location ?? "—"}\n  id: ${job.id}\n  ${job.url}`).join("\n\n") + "\n")
    else process.stdout.write(`${JSON.stringify({ meta: { count: results.length, page: 1, sourceCount: found.length, filtered: Boolean(query), complete: false }, results }, null, 2)}\n`)
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), error instanceof PortalError ? error.code : "SEARCH_FAILED")
    return 1
  }
}
