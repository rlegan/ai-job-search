import { fetchHtml, normalizeDetailUrl, parseDetail, parseSearchPage, PortalError, resolveId, writeError } from "../helpers.js"

export async function runDetail(input: string, format: "json" | "plain"): Promise<number> {
  const target = normalizeDetailUrl(input)
  if (!target) { writeError("Expected a numeric Silkhom listing ID or exact https://www.silkhom.com/annonce/<slug>/ URL", "BAD_ID"); return 1 }
  try {
    let url = target.url
    if (target.id) {
      const archive = await fetchHtml("https://www.silkhom.com/nos-offres-demploi/", "/nos-offres-demploi")
      const jobs = parseSearchPage(archive)
      if (!jobs) throw new PortalError("Offers page did not contain the verified markerz list", "PARSE_ERROR")
      url = resolveId(jobs, target.id) ?? ""
      if (!url) throw new PortalError("ID is not present on verified page 1; pass the exact detail URL", "NOT_FOUND")
    }
    const detailId = target.id ?? new URL(url).pathname.match(/^\/annonce\/([^/]+)/)?.[1] ?? ""
    const html = await fetchHtml(url, "/annonce")
    if (!html) throw new PortalError("Posting not found", "NOT_FOUND")
    const job = parseDetail(html, detailId, url)
    if (!job.title) throw new PortalError("Posting title is missing", "PARSE_ERROR")
    if (format === "plain") process.stdout.write(`${job.title}\nRecruiter: ${job.recruiter ?? "—"} · ${job.location ?? "—"}\nDate: ${job.date ?? "—"}\nEmployment: ${job.employmentType ?? job.contractTypeRaw ?? "—"}\n\n${job.description ?? "(no description)"}\n\nURL: ${job.url}\n`)
    else process.stdout.write(`${JSON.stringify(job, null, 2)}\n`)
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), error instanceof PortalError ? error.code : "DETAIL_FAILED")
    return 1
  }
}
