import { fetchHtml, normalizeDetailUrl, parseDetail, PortalError, writeError } from "../helpers.js"

export async function runDetail(input: string, format: "json" | "plain"): Promise<number> {
  const target = normalizeDetailUrl(input)
  if (!target) {
    writeError("Expected an exact LesJeudis offer slug or https://lesjeudis.com/offers/<slug>", "BAD_ID")
    return 1
  }
  try {
    const source = await fetchHtml(target.url)
    if (!source) throw new PortalError("Posting not found", "NOT_FOUND")
    const job = parseDetail(source, target.id, target.url)
    if (!job.title) throw new PortalError("Posting title is missing", "PARSE_ERROR")
    if (format === "plain") process.stdout.write(`${job.title}\n${job.company ?? "—"} · ${job.location ?? "—"}\nDate: ${job.date ?? "—"}\nEmployment: ${job.employmentType ?? job.contractTypeRaw ?? "—"}\n\n${job.description ?? "(no description)"}\n\nURL: ${job.url}\n`)
    else process.stdout.write(`${JSON.stringify(job, null, 2)}\n`)
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), error instanceof PortalError ? error.code : "DETAIL_FAILED")
    return 1
  }
}
