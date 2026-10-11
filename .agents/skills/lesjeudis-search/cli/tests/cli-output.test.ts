import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runDetail } from "../src/commands/detail.js"
import { runSearch } from "../src/commands/search.js"
import { main } from "../src/cli.js"

const searchHtml = readFileSync(resolve(import.meta.dir, "fixtures/lesjeudis-search.html"), "utf8")
const detailHtml = readFileSync(resolve(import.meta.dir, "fixtures/lesjeudis-detail.html"), "utf8")
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

describe("LesJeudis CLI output", () => {
  test("renders contract JSON, table, plain, and detail from verified fixtures", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => new Response(String(input).endsWith("/offers") ? searchHtml : detailHtml,
      { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    const json = await capture(() => runSearch({ query: "technicien", page: 1, limit: 1, format: "json" }))
    expect(json.code).toBe(0)
    const parsed = JSON.parse(json.output)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.meta.sourceCount).toBe(12)
    expect(parsed.results[0]).toMatchObject({ company: expect.any(String), location: expect.any(String), date: null, url: expect.stringContaining("https://lesjeudis.com/offers/") })
    expect(parsed.meta.complete).toBe(false)
    expect((await capture(() => runSearch({ page: 1, limit: 2, format: "table" }))).output).toContain("TITLE")
    expect((await capture(() => runSearch({ page: 1, limit: 2, format: "plain" }))).output).toContain("id:")
    const detail = await capture(() => runDetail("developpeur-informatique-editique-f-h-f0d394df", "json"))
    expect(detail.code).toBe(0)
    expect(JSON.parse(detail.output).description).toContain("Description de l'entreprise")
  })

  test("accent-folds a query and reports a parser error instead of empty success on markup drift", async () => {
    globalThis.fetch = (async () => new Response(searchHtml, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    const matched = await capture(() => runSearch({ query: "developpeur", page: 1, limit: 20, format: "json" }))
    expect(matched.code).toBe(0)
    const parsed = JSON.parse(matched.output)
    expect(parsed.results.length).toBeGreaterThan(0)
    expect(parsed.results.every((job: { title: string }) => /développeur/i.test(job.title))).toBe(true)
    expect(parsed.meta.complete).toBe(false)

    let stderr = ""
    globalThis.fetch = (async () => new Response("<html>changed</html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    process.stderr.write = ((chunk: string | Uint8Array) => { stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk); return true }) as unknown as typeof process.stderr.write
    const drift = await capture(() => runSearch({ page: 1, limit: 5, format: "json" }))
    expect(drift.code).toBe(1)
    expect(drift.output).toBe("")
    expect(JSON.parse(stderr)).toMatchObject({ code: "PARSE_ERROR" })
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
})
