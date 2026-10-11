export const SEARCH_URL = "https://www.apec.fr/candidat/recherche-emploi.html/emploi"
export const HOST = "www.apec.fr"
export const PATH_PREFIX = "/candidat/recherche-emploi.html/emploi"
const USER_AGENT = "Mozilla/5.0 (compatible; apec-search-cli/1.0)"

export class PortalError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "PortalError" }
}

export interface Salary {
  min: number | null
  max: number | null
  currency: string | null
  unit: "annual"
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
  employmentType: "CDI" | null
  contractTypeRaw: string | null
  salaryAnnual: Salary | null
  tjm: null
  description?: string | null
  validThrough?: string | null
}

const named: Record<string, string> = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é", Eacute: "É", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ndash: "–", mdash: "—", euro: "€", hellip: "…" }

export function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] === "#") {
      const hex = token[1]?.toLowerCase() === "x"
      const cp = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
    }
    return named[token] ?? entity
  })
}

export function textContent(value: string): string { return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/[\t\r\n ]+/g, " ").trim() }

export function richText(value: string): string {
  return decodeHtml(value.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(?:p|li|ul|ol|div|h[1-6]|section)>/gi, "\n\n").replace(/<[^>]*>/g, " "))
    .replace(/[\t ]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const raw = value.trim()
  const french = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (french) {
    const [, dd, mm, yyyy] = french
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
    if (date.getUTCDate() !== Number(dd) || date.getUTCMonth() !== Number(mm) - 1) return null
    return `${yyyy}-${mm}-${dd}`
  }
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/)
  if (!parts) return null
  const calendar = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00.000Z`)
  if (calendar.getUTCFullYear() !== Number(parts[1]) || calendar.getUTCMonth() + 1 !== Number(parts[2]) || calendar.getUTCDate() !== Number(parts[3])) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function validateUrl(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new PortalError("Invalid URL", "BAD_URL") }
  let path: string
  try { path = decodeURIComponent(url.pathname) } catch { throw new PortalError("Malformed URL path", "BAD_URL") }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== HOST || url.username || url.password ||
      (url.port && url.port !== "443") || !(path === PATH_PREFIX || path.startsWith(`${PATH_PREFIX}/`)) ||
      path.includes("\\") || path.split("/").some((part) => part === "." || part === "..")) {
    throw new PortalError("URL is outside the verified APEC host/path", "BAD_URL")
  }
  return url
}

export async function fetchHtml(raw: string): Promise<string> {
  let current = validateUrl(raw)
  for (let redirect = 0; redirect <= 3; redirect++) {
    let delay = 300
    let response: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(current, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(12000) })
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
      current = validateUrl(new URL(location, current).href)
      continue
    }
    if (response.status === 401 || response.status === 403) throw new PortalError("APEC denied ordinary public access; refusing any bypass", "ACCESS_DENIED")
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

function salaryText(raw: string | null): Salary | null {
  if (!raw || !/annuel|annual|par\s+an/i.test(raw) || !/€|EUR/i.test(raw)) return null
  const cleaned = raw.replace(/(\d)[\s\u00a0](?=\d{3}\b)/g, "$1")
  const values = [...cleaned.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", "."))).filter(Number.isFinite)
  if (!values.length) return null
  const multiplier = /\bk\s*€/i.test(raw) ? 1000 : 1
  return { min: values[0] * multiplier, max: (values.length > 1 ? values[1] : values[0]) * multiplier, currency: "EUR", unit: "annual", rawUnit: "annual" }
}

function contractType(raw: string | null): "CDI" | null { return raw && /^\s*CDI\s*$/i.test(raw) ? "CDI" : null }

function extractClass(chunk: string, className: string, tag: string): string | null {
  const safe = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = chunk.match(new RegExp(`<${tag}\\b[^>]*class=["'][^"']*\\b${safe}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match ? textContent(match[1]) || null : null
}

function extractListItem(chunk: string, marker: RegExp): string | null {
  for (const li of chunk.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    if (marker.test(li[0])) return textContent(li[1].replace(/<img\b[^>]*>/gi, " ")) || null
  }
  return null
}

export function parseSearchPage(html: string): Job[] | null {
  if (!/class=["'][^"']*container-result/i.test(html)) return null
  const jobs: Job[] = []
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']*detail-offre\/[0-9]{9}[A-Z][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL
    try { url = validateUrl(new URL(decodeHtml(anchor[1]), SEARCH_URL).href) } catch { continue }
    const id = url.pathname.match(/\/detail-offre\/(\d{9}[A-Z])$/)?.[1]
    if (!id) continue
    const chunk = anchor[2]
    const title = extractClass(chunk, "card-title", "h2")
    const company = extractClass(chunk, "card-offer__company", "p")
    if (!title) continue
    const contract = extractListItem(chunk, /alt=["']type de contrat/i)
    const location = extractListItem(chunk, /alt=["']localisation/i)
    const publication = extractListItem(chunk, /title=["']Date de publication/i)
    const salaryRaw = extractListItem(chunk, /alt=["']Salaire texte/i)
    const salary = salaryText(salaryRaw)
    jobs.push({ id, title, company, employer: null, recruiter: null, location,
      date: parseDate(publication), url: `${url.origin}${url.pathname}`,
      employmentType: contractType(contract), contractTypeRaw: contract,
      salaryAnnual: salary, tjm: null })
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
    } catch { /* continue through malformed blocks */ }
  }
  return null
}

function nullableString(raw: unknown): string | null { return typeof raw === "string" && raw.trim() ? raw.trim() : null }

function salarySchema(raw: unknown): Salary | null {
  if (!raw || typeof raw !== "object") return null
  const base = raw as Record<string, unknown>
  const value = base.value && typeof base.value === "object" ? base.value as Record<string, unknown> : {}
  const unitText = typeof value.unitText === "string" ? value.unitText : ""
  if (!/year|annual|annuel/i.test(unitText)) return null
  const asNumber = (item: unknown): number | null => typeof item === "number" ? item : typeof item === "string" && /^\d+(?:\.\d+)?$/.test(item) ? Number(item) : null
  const min = asNumber(value.minValue)
  const max = asNumber(value.maxValue)
  if (min === null && max === null) return null
  return { min, max, currency: nullableString(base.currency), unit: "annual", rawUnit: unitText }
}

export function parseDetail(html: string, id: string, url: string): Job {
  const data = findJobPosting(html)
  if (!data) throw new PortalError("Posting has no readable JobPosting JSON-LD", "PARSE_ERROR")
  const organization = data.hiringOrganization && typeof data.hiringOrganization === "object" ? data.hiringOrganization as Record<string, unknown> : {}
  const organizationName = nullableString(organization.name)
  const organizationDescription = nullableString(organization.description) ?? ""
  const recruiterKnown = /recrut|recruit|headhunt|cabinet de recrutement/i.test(organizationDescription)
  const locationData = data.jobLocation && typeof data.jobLocation === "object" ? data.jobLocation as Record<string, unknown> : {}
  const address = locationData.address && typeof locationData.address === "object" ? locationData.address as Record<string, unknown> : {}
  const rawContract = nullableString(data.employmentType)
  const visibleContract = extractListItem(html, /\b(?:CDI|CDD|alternance|int[eé]rim|freelance)\b/i)
  const contract = visibleContract ?? rawContract
  const salary = salarySchema(data.baseSalary)
  const description = nullableString(data.description)
  return {
    id, title: nullableString(data.title) ?? "",
    company: organizationName, employer: recruiterKnown ? null : organizationName,
    recruiter: recruiterKnown ? organizationName : null,
    location: nullableString(address.addressLocality), date: parseDate(data.datePosted), url,
    employmentType: contractType(contract), contractTypeRaw: contract,
    salaryAnnual: salary, tjm: null,
    description: description ? richText(description) : null,
    validThrough: parseDate(data.validThrough),
  }
}

export function normalizeDetailUrl(input: string): { id: string; url: string } | null {
  const trimmed = input.trim()
  if (/^\d{9}[A-Z]$/.test(trimmed)) return { id: trimmed, url: `${SEARCH_URL}/detail-offre/${trimmed}` }
  let url: URL
  try { url = validateUrl(trimmed) } catch { return null }
  if (url.search || url.hash) return null
  const id = url.pathname.match(/\/detail-offre\/(\d{9}[A-Z])$/)?.[1]
  return id ? { id, url: `${url.origin}${url.pathname}` } : null
}

export function buildSearchUrl(query: string, page: number): string {
  const url = new URL(SEARCH_URL)
  url.searchParams.set("motsCles", query)
  url.searchParams.set("page", String(page - 1))
  return url.href
}

export function filterJobs(jobs: Job[], jobage: number | undefined, now = new Date()): Job[] {
  if (jobage === undefined) return jobs
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - jobage + 1)).toISOString().slice(0, 10)
  return jobs.filter((job) => job.date !== null && job.date >= cutoff)
}

export function writeError(error: string, code: string): void { process.stderr.write(`${JSON.stringify({ error, code })}\n`) }
