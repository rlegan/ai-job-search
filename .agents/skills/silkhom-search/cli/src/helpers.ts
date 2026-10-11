export const SEARCH_BASE = "https://www.silkhom.com/nos-offres-demploi/"
export const HOST = "www.silkhom.com"
const USER_AGENT = "Mozilla/5.0 (compatible; silkhom-search-cli/1.0)"

export class PortalError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "PortalError" }
}

export interface Salary {
  min: number | null
  max: number | null
  currency: string | null
  unit: "annual" | "daily" | "other"
  rawUnit: string | null
}

export interface Job {
  id: string
  title: string
  company: string | null
  employer: string | null
  recruiter: string | null
  location: string | null
  date: string | null
  url: string
  employmentType: "CDI" | "Freelance" | null
  contractTypeRaw: string | null
  salaryAnnual: Salary | null
  tjm: Salary | null
  description?: string | null
  validThrough?: string | null
}

const entities: Record<string, string> = {
  amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é", Eacute: "É",
  egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ndash: "–", mdash: "—",
  euro: "€", hellip: "…",
}

export function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] === "#") {
      const hex = token[1]?.toLowerCase() === "x"
      const cp = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
    }
    return entities[token] ?? entity
  })
}

export function textContent(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/[\t\r\n ]+/g, " ").trim()
}

export function richText(value: string): string {
  return decodeHtml(value.replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|ul|ol|div|h[1-6]|section)>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")).replace(/[\t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const raw = value.trim()
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/)
  if (!parts) return null
  const calendar = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00.000Z`)
  if (calendar.getUTCFullYear() !== Number(parts[1]) || calendar.getUTCMonth() + 1 !== Number(parts[2]) || calendar.getUTCDate() !== Number(parts[3])) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

export function parseFrenchDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const raw = value.trim()
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return parseIsoDate(raw)
  const [, dd, mm, yyyy] = m
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  if (date.getUTCDate() !== Number(dd) || date.getUTCMonth() !== Number(mm) - 1) return null
  return `${yyyy}-${mm}-${dd}`
}

function validateRawPath(raw: string): void {
  if (raw !== raw.trim() || /\s/.test(raw)) throw new PortalError("Whitespace is not allowed in URLs", "BAD_URL")
  let path = raw
  const absolute = raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i)
  const networkPath = raw.match(/^\/\/[^/?#]*(\/[^?#]*)?/)
  if (absolute) path = absolute[1] ?? "/"
  else if (networkPath) path = networkPath[1] ?? "/"
  else path = raw.split(/[?#]/, 1)[0] || "/"
  for (const segment of path.split("/")) {
    let decoded = segment
    for (let depth = 0; depth < 3; depth++) {
      try { decoded = decodeURIComponent(decoded) }
      catch { throw new PortalError("Malformed URL path", "BAD_URL") }
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
        throw new PortalError("Unsafe URL path segment", "BAD_URL")
      }
      if (!decoded.includes("%")) break
    }
  }
}

function validateUrl(raw: string, pathPrefix: string): URL {
  validateRawPath(raw)
  let url: URL
  try { url = new URL(raw) } catch { throw new PortalError("Invalid URL", "BAD_URL") }
  let path: string
  try { path = decodeURIComponent(url.pathname) } catch { throw new PortalError("Malformed URL path", "BAD_URL") }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== HOST || url.username || url.password ||
      (url.port && url.port !== "443") || !(path === pathPrefix || path.startsWith(`${pathPrefix}/`)) ||
      path.includes("\\") || path.split("/").some((part) => part === "." || part === "..")) {
    throw new PortalError("URL is outside the verified Silkhom host/path", "BAD_URL")
  }
  return url
}

export async function fetchHtml(raw: string, pathPrefix: string): Promise<string> {
  let current = validateUrl(raw, pathPrefix)
  for (let redirect = 0; redirect <= 3; redirect++) {
    let delay = 300
    let response: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(current, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          redirect: "manual", signal: AbortSignal.timeout(12000) })
      } catch (error) {
        const timeout = error instanceof Error && /timeout|timed out/i.test(error.name + error.message)
        throw new PortalError(timeout ? "Request timed out" : "Request failed", timeout ? "REQUEST_TIMEOUT" : "NETWORK_ERROR")
      }
      if (response.status !== 429 && response.status < 500) break
      if (attempt === 2) throw new PortalError(`Request failed with HTTP ${response.status}`, response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR")
      await new Promise((resolve) => setTimeout(resolve, delay + Math.floor(Math.random() * 200)))
      delay = Math.min(delay * 2, 2000)
    }
    if (!response) throw new PortalError("No response received", "NETWORK_ERROR")
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location")
      if (!location || redirect === 3) throw new PortalError("Redirect limit exceeded", "REDIRECT_REJECTED")
      validateRawPath(location)
      current = validateUrl(new URL(location, current).href, pathPrefix)
      continue
    }
    if (response.status === 401 || response.status === 403) throw new PortalError("Portal denied public access", "ACCESS_DENIED")
    if (response.status === 404) return ""
    if (!response.ok) throw new PortalError(`Request failed with HTTP ${response.status}`, "HTTP_ERROR")
    const type = response.headers.get("content-type") ?? ""
    if (type && !/html|text\//i.test(type)) throw new PortalError("Unexpected non-HTML response", "BAD_CONTENT_TYPE")
    const body = await response.text()
    const first = body.slice(0, 1800)
    if (/<title[^>]*>[^<]*(?:captcha|access denied|verify you are human|security check)/i.test(first) || /cf-chl-|g-recaptcha|captcha-container/i.test(first)) {
      throw new PortalError("Portal returned a challenge page", "ACCESS_CHALLENGE")
    }
    return body
  }
  throw new PortalError("Redirect limit exceeded", "REDIRECT_REJECTED")
}

function contractType(raw: unknown): "CDI" | "Freelance" | null {
  if (typeof raw !== "string") return null
  if (/^\s*CDI\s*$/i.test(raw)) return "CDI"
  if (/^\s*Freelance\s*$/i.test(raw)) return "Freelance"
  return null
}

export function parseSearchPage(html: string): Job[] | null {
  const match = html.match(/\bvar\s+markerz\s*=\s*(\[[\s\S]*?\])\s*;/i)
  if (!match) return null
  let records: unknown
  try { records = JSON.parse(match[1]) } catch { return null }
  if (!Array.isArray(records)) return null
  const jobs: Job[] = []
  const seenIds = new Set<string>()
  for (const record of records) {
    if (!record || typeof record !== "object") continue
    const item = record as Record<string, unknown>
    const id = typeof item.id === "number" || typeof item.id === "string" ? String(item.id) : ""
    const title = typeof item.titre === "string" ? textContent(item.titre) : ""
    const city = typeof item.mission_ville === "string" ? textContent(item.mission_ville) : ""
    const urlRaw = typeof item.url === "string" ? decodeHtml(item.url) : ""
    let url: URL
    try { url = validateUrl(urlRaw, "/annonce") } catch { continue }
    if (!/^\d+$/.test(id) || seenIds.has(id) || !title || !/^\/annonce\/[a-z0-9-]+\/?$/.test(url.pathname)) continue
    seenIds.add(id)
    const type = typeof item.mission_type_contrat === "string" ? textContent(item.mission_type_contrat) : null
    jobs.push({
      id, title, company: null, employer: null, recruiter: "Silkhom",
      location: city || null, date: parseFrenchDate(item.date), url: `${url.origin}${url.pathname}`,
      employmentType: contractType(type), contractTypeRaw: type,
      salaryAnnual: null, tjm: null,
    })
  }
  return jobs
}

function findJobPosting(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(match[1].trim())
      for (const value of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!value || typeof value !== "object") continue
        const item = value as Record<string, unknown>
        if (item["@type"] === "JobPosting") return item
        if (Array.isArray(item["@graph"])) {
          const found = item["@graph"].find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>)["@type"] === "JobPosting")
          if (found) return found as Record<string, unknown>
        }
      }
    } catch { /* malformed blocks do not hide later valid JSON-LD */ }
  }
  return null
}

function salaryData(raw: unknown): { annual: Salary | null; daily: Salary | null } {
  if (!raw || typeof raw !== "object") return { annual: null, daily: null }
  const base = raw as Record<string, unknown>
  const value = base.value && typeof base.value === "object" ? base.value as Record<string, unknown> : {}
  const unit = typeof value.unitText === "string" ? value.unitText : null
  const numeric = (item: unknown): number | null => typeof item === "number" && Number.isFinite(item) ? item : null
  const single = numeric(value.value)
  const parsed: Salary = { min: numeric(value.minValue) ?? single, max: numeric(value.maxValue) ?? single,
    currency: typeof base.currency === "string" ? base.currency : null,
    unit: /day|daily/i.test(unit ?? "") ? "daily" : /year|annual/i.test(unit ?? "") ? "annual" : "other", rawUnit: unit }
  return parsed.unit === "daily" ? { annual: null, daily: parsed } : parsed.unit === "annual" ? { annual: parsed, daily: null } : { annual: null, daily: null }
}

function nullableString(raw: unknown): string | null { return typeof raw === "string" && raw.trim() ? raw.trim() : null }

function mainDescription(html: string): string | null {
  const main = html.match(/<div\b[^>]*class=["'][^"']*\bcontenu-fiche\b[^"']*["'][^>]*>([\s\S]*?)(?=<i\b[^>]*\bid=["']reference-annonce\b|<div\b[^>]*class=["'][^"']*\bsidebar-fiche\b)/i)?.[1]
  return main ? nullableString(richText(main)) : null
}

function briefValue(html: string, icon: string): string | null {
  const match = html.match(new RegExp(`<p\\b[^>]*>\\s*<img\\b[^>]*src=["'][^"']*/${icon}\\.svg["'][^>]*\\s*\\/?>([\\s\\S]*?)<\\/p>`, "i"))
  return match ? nullableString(textContent(match[1])) : null
}

function briefSalary(raw: string | null): { annual: Salary | null; daily: Salary | null } {
  if (!raw) return { annual: null, daily: null }
  const unit = /\b(?:par\s+an|annuel(?:le)?|yearly|per\s+year)\b/i.test(raw) ? "annual"
    : /\b(?:par\s+jour|journalier(?:e)?|daily|per\s+day|tjm)\b/i.test(raw) ? "daily" : null
  if (!unit) return { annual: null, daily: null }
  const range = raw.match(/(\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*(?:-|–|à)\s*(\d[\d\s\u00a0]*(?:[.,]\d+)?)/i)
  if (!range) return { annual: null, daily: null }
  const amount = (value: string) => Number(value.replace(/[\s\u00a0]/g, "").replace(",", "."))
  const min = amount(range[1]); const max = amount(range[2])
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { annual: null, daily: null }
  const multiplier = /\bK\s*€/i.test(raw) ? 1000 : 1
  const salary: Salary = { min: min * multiplier, max: max * multiplier, currency: /€|EUR/i.test(raw) ? "EUR" : null,
    unit, rawUnit: raw.match(/(?:par\s+(?:an|jour)|annuel(?:le)?|yearly|per\s+year|journalier(?:e)?|daily|per\s+day|tjm)/i)?.[0] ?? null }
  return unit === "annual" ? { annual: salary, daily: null } : { annual: null, daily: salary }
}

export function parseDetail(html: string, id: string, url: string): Job {
  const data = findJobPosting(html)
  if (!data) throw new PortalError("Posting has no readable JobPosting JSON-LD", "PARSE_ERROR")
  const loc = data.jobLocation && typeof data.jobLocation === "object" ? data.jobLocation as Record<string, unknown> : {}
  const address = loc.address && typeof loc.address === "object" ? loc.address as Record<string, unknown> : {}
  const rawContract = nullableString(data.employmentType)
  const jsonLdSalary = salaryData(data.baseSalary)
  const visibleSalary = briefSalary(briefValue(html, "usd-circle-solid"))
  const description = mainDescription(html) ?? nullableString(data.description)
  const visibleDate = briefValue(html, "calendar-check-grey")
  return {
    id, title: nullableString(data.title) ?? "", company: null, employer: null,
    recruiter: "Silkhom", location: nullableString(address.addressLocality),
    date: parseFrenchDate(visibleDate) ?? parseIsoDate(data.datePosted), url,
    employmentType: contractType(rawContract), contractTypeRaw: rawContract,
    salaryAnnual: visibleSalary.annual ?? jsonLdSalary.annual, tjm: visibleSalary.daily ?? jsonLdSalary.daily,
    description: description ? richText(description) : null,
    validThrough: parseIsoDate(data.validThrough),
  }
}

export function normalizeDetailUrl(input: string): { id: string | null; url: string } | null {
  if (input !== input.trim() || /\s/.test(input)) return null
  const trimmed = input
  if (/^\d+$/.test(trimmed)) return { id: trimmed, url: "" }
  let url: URL
  try { url = validateUrl(trimmed, "/annonce") } catch { return null }
  if (url.search || url.hash || !/^\/annonce\/[a-z0-9-]+\/?$/.test(url.pathname)) return null
  return { id: null, url: `${url.origin}${url.pathname}` }
}

export function resolveId(jobs: Job[], id: string): string | null { return jobs.find((job) => job.id === id)?.url ?? null }

export function filterJobs(jobs: Job[], query: string | undefined, jobage: number | undefined, now = new Date()): { results: Job[]; dateUnknownExcluded: number } {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR")
  const needle = query ? normalize(query.trim()) : ""
  let results = jobs.filter((job) => !needle || normalize(`${job.title} ${job.location ?? ""} ${job.contractTypeRaw ?? ""}`).includes(needle))
  let dateUnknownExcluded = 0
  if (jobage !== undefined) {
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - jobage + 1)).toISOString().slice(0, 10)
    dateUnknownExcluded = results.filter((job) => job.date === null).length
    results = results.filter((job) => job.date !== null && job.date >= cutoff)
  }
  return { results, dateUnknownExcluded }
}

export function writeError(error: string, code: string): void { process.stderr.write(`${JSON.stringify({ error, code })}\n`) }
