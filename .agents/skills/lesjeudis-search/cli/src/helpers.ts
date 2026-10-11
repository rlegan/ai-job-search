export const SEARCH_URL = "https://lesjeudis.com/offers"
export const HOST = "lesjeudis.com"
export const PATH_PREFIX = "/offers"
const USER_AGENT = "Mozilla/5.0 (compatible; lesjeudis-search-cli/1.0)"

export class PortalError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = "PortalError"
  }
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

export interface Salary {
  min: number | null
  max: number | null
  currency: string | null
  unit: "annual" | "daily" | "other"
  rawUnit: string | null
}

export function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é",
    Eacute: "É", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê",
    ndash: "–", mdash: "—", hellip: "…", euro: "€",
  }
  return value
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
      if (token[0] === "#") {
        const hex = token[1]?.toLowerCase() === "x"
        const cp = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10)
        return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
      }
      return named[token] ?? entity
    })
}

export function textContent(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/[\t\r\n ]+/g, " ").trim()
}

export function richText(value: string): string {
  return decodeHtml(value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|ul|ol|div|h[1-6]|section)>/gi, "\n\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/[\t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
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

export function parseFrenchDate(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return parseIsoDate(value)
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null
  return `${year}-${month}-${day}`
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

function validateUrl(raw: string, host: string, pathPrefix: string): URL {
  validateRawPath(raw)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new PortalError("Invalid URL", "BAD_URL")
  }
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(url.pathname)
  } catch {
    throw new PortalError("Malformed URL path", "BAD_URL")
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== host ||
      url.username || url.password || (url.port && url.port !== "443") ||
      !decodedPath.startsWith(pathPrefix) || decodedPath.includes("\\") ||
      decodedPath.split("/").some((part) => part === "." || part === "..")) {
    throw new PortalError("URL is outside the verified LesJeudis offer host/path", "BAD_URL")
  }
  return url
}

export async function fetchHtml(raw: string): Promise<string> {
  let current = validateUrl(raw, HOST, PATH_PREFIX)
  for (let redirect = 0; redirect <= 3; redirect++) {
    let delay = 300
    let response: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(current, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          redirect: "manual",
          signal: AbortSignal.timeout(12000),
        })
      } catch (error) {
        const timedOut = error instanceof Error && /timeout|timed out/i.test(error.name + error.message)
        throw new PortalError(timedOut ? "Request timed out" : "Request failed", timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR")
      }
      if (response.status !== 429 && response.status < 500) break
      if (attempt === 2) {
        const code = response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR"
        throw new PortalError(`Request failed with HTTP ${response.status}`, code)
      }
      await new Promise((resolve) => setTimeout(resolve, delay + Math.floor(Math.random() * 200)))
      delay = Math.min(delay * 2, 2000)
    }
    if (!response) throw new PortalError("No response received", "NETWORK_ERROR")
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location")
      if (!location || redirect === 3) throw new PortalError("Redirect limit exceeded", "REDIRECT_REJECTED")
      validateRawPath(location)
      current = validateUrl(new URL(location, current).href, HOST, PATH_PREFIX)
      continue
    }
    if (response.status === 401 || response.status === 403) throw new PortalError("Portal denied public access", "ACCESS_DENIED")
    if (response.status === 404) return ""
    if (!response.ok) throw new PortalError(`Request failed with HTTP ${response.status}`, "HTTP_ERROR")
    const type = response.headers.get("content-type") ?? ""
    if (type && !/html|text\//i.test(type)) throw new PortalError("Unexpected non-HTML response", "BAD_CONTENT_TYPE")
    const body = await response.text()
    const first = body.slice(0, 1800)
    if (/<title[^>]*>[^<]*(?:captcha|access denied|verify you are human|security check)/i.test(first) ||
        /cf-chl-|g-recaptcha|captcha-container/i.test(first)) {
      throw new PortalError("Portal returned a challenge page", "ACCESS_CHALLENGE")
    }
    return body
  }
  throw new PortalError("Redirect limit exceeded", "REDIRECT_REJECTED")
}

export function parseSearchPage(html: string): Job[] {
  const heading = html.search(/id=["']dernieres-offres["']/i)
  if (heading < 0) throw new PortalError("Offers page did not contain the verified latest-offers marker", "PARSE_ERROR")
  const listStart = html.indexOf("<ul", heading)
  const listEnd = listStart < 0 ? -1 : html.indexOf("</ul>", listStart)
  if (listEnd < 0) throw new PortalError("Latest-offers list was incomplete", "PARSE_ERROR")
  const list = html.slice(listStart, listEnd)
  const jobs: Job[] = []
  for (const li of list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const card = li[1]
    const link = card.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    let url: URL
    try {
      const href = decodeHtml(link[1])
      validateRawPath(href)
      url = validateUrl(new URL(href, SEARCH_URL).href, HOST, PATH_PREFIX)
    }
    catch { continue }
    const path = url.pathname.replace(/\/$/, "")
    const slug = path.slice(PATH_PREFIX.length + 1)
    if (!/^[a-z0-9-]+-[a-f0-9]{8}$/i.test(slug)) continue
    const title = textContent(link[2])
    if (!title) continue
    const after = card.slice((link.index ?? 0) + link[0].length)
    const companyLocation = textContent(after.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "")
    const [company = "", ...locationParts] = companyLocation.split(/\s+·\s+/)
    const location = locationParts.join(" · ").trim() || null
    jobs.push({
      id: slug, title, company: company.trim() || null, employer: company.trim() || null,
      recruiter: null, location, date: null, url: `${url.origin}${path}`,
      employmentType: null, contractTypeRaw: null, salaryAnnual: null, tjm: null,
    })
  }
  if (jobs.length === 0) throw new PortalError("Latest-offers marker contained no verified offer cards", "PARSE_ERROR")
  return jobs
}

function findJobPosting(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root: unknown = JSON.parse(match[1].trim())
      const values = Array.isArray(root) ? root : [root]
      for (const value of values) {
        if (!value || typeof value !== "object") continue
        const object = value as Record<string, unknown>
        if (object["@type"] === "JobPosting") return object
        const graph = object["@graph"]
        if (Array.isArray(graph)) {
          const found = graph.find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>)["@type"] === "JobPosting")
          if (found) return found as Record<string, unknown>
        }
      }
    } catch { /* ignore malformed JSON-LD blocks independently */ }
  }
  return null
}

function salaryData(raw: unknown): { annual: Salary | null; daily: Salary | null } {
  if (!raw || typeof raw !== "object") return { annual: null, daily: null }
  const base = raw as Record<string, unknown>
  const value = (base.value && typeof base.value === "object" ? base.value : {}) as Record<string, unknown>
  const rawUnit = typeof value.unitText === "string" ? value.unitText : null
  const numeric = (raw: unknown): number | null => typeof raw === "number" && Number.isFinite(raw) ? raw : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : null
  const min = numeric(value.minValue)
  const max = numeric(value.maxValue)
  const single = numeric(value.value)
  const parsed: Salary = { min: min ?? single, max: max ?? single, currency: typeof base.currency === "string" ? base.currency : null,
    unit: /day|daily/i.test(rawUnit ?? "") ? "daily" : /year|annual/i.test(rawUnit ?? "") ? "annual" : "other", rawUnit }
  return parsed.unit === "daily" ? { annual: null, daily: parsed } : parsed.unit === "annual" ? { annual: parsed, daily: null } : { annual: null, daily: null }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function parseDetail(html: string, id: string, url: string): Job {
  const data = findJobPosting(html)
  if (!data) throw new PortalError("Posting has no readable JobPosting JSON-LD", "PARSE_ERROR")
  const organization = data.hiringOrganization && typeof data.hiringOrganization === "object"
    ? data.hiringOrganization as Record<string, unknown> : {}
  const location = data.jobLocation && typeof data.jobLocation === "object"
    ? (data.jobLocation as Record<string, unknown>).address as Record<string, unknown> | undefined : undefined
  const rawContract = stringValue(data.employmentType)
  const normalizedContract = rawContract?.toUpperCase() ?? ""
  const salary = salaryData(data.baseSalary)
  const description = stringValue(data.description)
  return {
    id,
    title: stringValue(data.title) ?? "",
    company: stringValue(organization.name),
    employer: stringValue(organization.name),
    recruiter: null,
    location: stringValue(location?.addressLocality),
    date: parseIsoDate(data.datePosted),
    url,
    employmentType: /^CDI$/.test(normalizedContract) ? "CDI" : /^FREELANCE$/.test(normalizedContract) ? "Freelance" : null,
    contractTypeRaw: rawContract,
    salaryAnnual: salary.annual,
    tjm: salary.daily,
    description: description ? richText(description) : null,
    validThrough: parseIsoDate(data.validThrough),
  }
}

export function normalizeDetailUrl(input: string): { id: string; url: string } | null {
  if (input !== input.trim() || /\s/.test(input)) return null
  const trimmed = input
  let url: URL
  try {
    if (/^https?:\/\//i.test(trimmed)) url = validateUrl(trimmed, HOST, PATH_PREFIX)
    else if (/^[a-z0-9-]+-[a-f0-9]{8}$/.test(trimmed)) url = validateUrl(`${SEARCH_URL}/${trimmed}`, HOST, PATH_PREFIX)
    else return null
  } catch { return null }
  if (url.search || url.hash) return null
  const id = url.pathname.slice(PATH_PREFIX.length + 1).replace(/\/$/, "")
  if (!/^[a-z0-9-]+-[a-f0-9]{8}$/.test(id)) return null
  return { id, url: `${url.origin}${url.pathname.replace(/\/$/, "")}` }
}

export function writeError(error: string, code: string): void {
  process.stderr.write(`${JSON.stringify({ error, code })}\n`)
}
