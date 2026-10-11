import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runDetail } from "../src/commands/detail.js"
import { runSearch } from "../src/commands/search.js"
import { main } from "../src/cli.js"

const searchHtml = readFileSync(resolve(import.meta.dir, "fixtures/apec-search-browser.html"), "utf8")
const detailHtml = readFileSync(resolve(import.meta.dir, "fixtures/apec-detail-browser.html"), "utf8")
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

describe("APEC offline CLI output", () => {
  test("renders documented formats from supplied fixture without live access", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => new Response(String(input).includes("detail-offre") ? detailHtml : searchHtml,
      { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    const json = await capture(() => runSearch({ query: "backend", page: 1, limit: 3, format: "json" }))
    expect(json.code).toBe(0)
    const parsed = JSON.parse(json.output)
    expect(parsed.results.some((job: { id: string }) => job.id === "179520182W")).toBe(true)
    expect(parsed.results.every((job: { tjm: unknown }) => job.tjm === null)).toBe(true)
    expect((await capture(() => runSearch({ query: "backend", page: 1, limit: 1, format: "table" }))).output).toContain("TITLE")
    expect((await capture(() => runSearch({ query: "backend", page: 1, limit: 1, format: "plain" }))).output).toContain("id:")
    const detail = await capture(() => runDetail("179520182W", "json"))
    expect(detail.code).toBe(0)
    expect(JSON.parse(detail.output).tjm).toBeNull()
    expect(JSON.parse(detail.output).description).toContain("Backend Developer")
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
