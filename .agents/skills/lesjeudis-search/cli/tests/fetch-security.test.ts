import { afterEach, describe, expect, test } from "bun:test"
import { fetchHtml, PortalError } from "../src/helpers.js"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe("bounded public fetch", () => {
  test("rejects hostile initial URL before network", async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; throw new Error("unexpected") }) as unknown as typeof fetch
    await expect(fetchHtml("https://lesjeudis.com@evil.test/offers")).rejects.toMatchObject({ code: "BAD_URL" })
    expect(called).toBe(false)
  })

  test("rejects raw and encoded dot segments before URL normalization", async () => {
    let calls = 0
    globalThis.fetch = (async () => { calls++; throw new Error("unexpected") }) as unknown as typeof fetch
    for (const path of ["/offers/./slug", "/offers/../offers/slug", "/offers/%2e%2e/offers/slug", "/offers/%252e%252e/offers/slug", "/offers/%2Fslug"]) {
      await expect(fetchHtml(`https://lesjeudis.com${path}`)).rejects.toMatchObject({ code: "BAD_URL" })
    }
    await expect(fetchHtml("https://lesjeudis.com/offers ")).rejects.toMatchObject({ code: "BAD_URL" })
    expect(calls).toBe(0)
  })

  test("rejects a cross-host redirect without following it", async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: "https://evil.test/offers/x" } })
    }) as unknown as typeof fetch
    let caught: unknown
    try { await fetchHtml("https://lesjeudis.com/offers") } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(PortalError)
    expect((caught as PortalError).code).toBe("BAD_URL")
    expect(calls).toBe(1)
  })

  test("rejects a traversal redirect before URL resolution", async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: "/offers/%2e%2e/offers/target" } })
    }) as unknown as typeof fetch
    await expect(fetchHtml("https://lesjeudis.com/offers")).rejects.toMatchObject({ code: "BAD_URL" })
    expect(calls).toBe(1)
  })

  test("maps 403 and challenge pages to explicit errors", async () => {
    globalThis.fetch = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch
    await expect(fetchHtml("https://lesjeudis.com/offers")).rejects.toMatchObject({ code: "ACCESS_DENIED" })
    globalThis.fetch = (async () => new Response("<title>Captcha challenge</title>", {
      status: 200, headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch
    await expect(fetchHtml("https://lesjeudis.com/offers")).rejects.toMatchObject({ code: "ACCESS_CHALLENGE" })
  })

  test("returns empty text for 404 and maps timeouts explicitly", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(fetchHtml("https://lesjeudis.com/offers")).resolves.toBe("")
    globalThis.fetch = (async () => { throw new DOMException("request timed out", "TimeoutError") }) as unknown as typeof fetch
    await expect(fetchHtml("https://lesjeudis.com/offers")).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" })
  })
})
