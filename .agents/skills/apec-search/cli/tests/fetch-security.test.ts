import { afterEach, describe, expect, test } from "bun:test"
import { fetchHtml, PortalError } from "../src/helpers.js"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe("fail-closed APEC fetch", () => {
  test("returns explicit ACCESS_DENIED on the ordinary public 403", async () => {
    let calls = 0
    globalThis.fetch = (async () => { calls++; return new Response("Forbidden", { status: 403 }) }) as unknown as typeof fetch
    let caught: unknown
    try { await fetchHtml("https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=backend") } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(PortalError)
    expect((caught as PortalError).code).toBe("ACCESS_DENIED")
    expect(calls).toBe(1)
  })

  test("rejects cross-host redirects and non-HTML responses", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: "https://evil.test/candidat/recherche-emploi.html/emploi" } })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=backend")).rejects.toMatchObject({ code: "BAD_URL" })
    globalThis.fetch = (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=backend")).rejects.toMatchObject({ code: "BAD_CONTENT_TYPE" })
  })

  test("returns empty text for 404 and maps timeouts explicitly", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=backend")).resolves.toBe("")
    globalThis.fetch = (async () => { throw new DOMException("request timed out", "TimeoutError") }) as unknown as typeof fetch
    await expect(fetchHtml("https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=backend")).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" })
  })
})
