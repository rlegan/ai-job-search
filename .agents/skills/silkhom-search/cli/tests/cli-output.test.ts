import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runDetail } from "../src/commands/detail.js"
import { runSearch } from "../src/commands/search.js"
import { main } from "../src/cli.js"

const searchHtml = readFileSync(resolve(import.meta.dir, "fixtures/silkhom-search.html"), "utf8")
const detailHtml = readFileSync(resolve(import.meta.dir, "fixtures/silkhom-detail.html"), "utf8")
const originalFetch = globalThis.fetch
const originalWrite = process.stdout.write
const originalErrorWrite = process.stderr.write
afterEach(() => { globalThis.fetch = originalFetch; process.stdout.write = originalWrite; process.stderr.write = originalErrorWrite })

async function capture(run: () => Promise<number>): Promise<{ code: number; output: string }> {
  let output = ""
  process.stdout.write = ((chunk: string | Uint8Array) => { output += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk); return true }) as unknown as typeof process.stdout.write
  const code = await run()
  return { code, output }
}

describe("Silkhom CLI output", () => {
  test("renders JSON, table, plain, and ID-resolved detail using mock fetch only", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => new Response(String(input).includes("/annonce/") ? detailHtml : searchHtml,
      { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    const json = await capture(() => runSearch({ query: "développeur python", page: 1, limit: 2, format: "json" }))
    expect(json.code).toBe(0)
    const parsed = JSON.parse(json.output)
    expect(parsed.results.length).toBeGreaterThan(0)
    expect(parsed.results[0]).toMatchObject({ company: null, employer: null, recruiter: "Silkhom", date: expect.any(String), url: expect.stringContaining("https://www.silkhom.com/annonce/") })
    expect(parsed.meta.complete).toBe(false)
    expect((await capture(() => runSearch({ page: 1, limit: 1, format: "table" }))).output).toContain("CONTRACT")
    expect((await capture(() => runSearch({ page: 1, limit: 1, format: "plain" }))).output).toContain("Recruiter: Silkhom")
    const detail = await capture(() => runDetail("519343", "json"))
    expect(detail.code).toBe(0)
    expect(JSON.parse(detail.output).description).toContain("Créée en 2010")
  })

  test("writes malformed-argument errors as JSON to stderr without network or stdout", async () => {
    let calls = 0
    let stdout = ""
    let stderr = ""
    globalThis.fetch = (async () => { calls++; throw new Error("should not fetch") }) as unknown as typeof fetch
    process.stdout.write = ((chunk: string | Uint8Array) => { stdout += String(chunk); return true }) as unknown as typeof process.stdout.write
    process.stderr.write = ((chunk: string | Uint8Array) => { stderr += String(chunk); return true }) as unknown as typeof process.stderr.write
    expect(await main(["search", "--unknown", "x"])).toBe(1)
    expect(JSON.parse(stderr)).toMatchObject({ code: "BAD_ARG" })
    expect(stdout).toBe("")
    expect(calls).toBe(0)
  })

  test("rejects unverified page 2 without a network request", async () => {
    let calls = 0
    let stderr = ""
    globalThis.fetch = (async () => { calls++; throw new Error("should not fetch") }) as unknown as typeof fetch
    process.stderr.write = ((chunk: string | Uint8Array) => { stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk); return true }) as unknown as typeof process.stderr.write
    expect(await runSearch({ page: 2, limit: 3, format: "json" })).toBe(1)
    expect(JSON.parse(stderr)).toMatchObject({ code: "PAGE_UNVERIFIED" })
    expect(calls).toBe(0)
  })
})
