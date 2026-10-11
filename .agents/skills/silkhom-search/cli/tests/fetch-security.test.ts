import { afterEach, describe, expect, test } from "bun:test"
import { fetchHtml, PortalError } from "../src/helpers.js"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe("bounded public fetch", () => {
  test("rejects unverified initial URL before network", async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; throw new Error("unexpected") }) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com@evil.test/annonce/x/", "/annonce")).rejects.toMatchObject({ code: "BAD_URL" })
    expect(called).toBe(false)
  })

  test("rejects raw and encoded dot segments before URL normalization", async () => {
    let calls = 0
    globalThis.fetch = (async () => { calls++; throw new Error("unexpected") }) as unknown as typeof fetch
    for (const path of ["/annonce/./slug/", "/annonce/../annonce/slug/", "/annonce/%2e%2e/annonce/slug/", "/annonce/%252e%252e/annonce/slug/", "/annonce/%2Fslug/"]) {
      await expect(fetchHtml(`https://www.silkhom.com${path}`, "/annonce")).rejects.toMatchObject({ code: "BAD_URL" })
    }
    await expect(fetchHtml("https://www.silkhom.com/annonce/slug/ ", "/annonce")).rejects.toMatchObject({ code: "BAD_URL" })
    expect(calls).toBe(0)
  })

  test("rejects cross-host redirects without following them", async () => {
    let calls = 0
    globalThis.fetch = (async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://evil.test/annonce/x/" } }) }) as unknown as typeof fetch
    let caught: unknown
    try { await fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce") } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(PortalError)
    expect((caught as PortalError).code).toBe("BAD_URL")
    expect(calls).toBe(1)
  })

  test("rejects a traversal redirect before URL resolution", async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: "/annonce/%2e%2e/annonce/target/" } })
    }) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce")).rejects.toMatchObject({ code: "BAD_URL" })
    expect(calls).toBe(1)
  })

  test("detects 403, 429 and HTML challenges", async () => {
    globalThis.fetch = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce")).rejects.toMatchObject({ code: "ACCESS_DENIED" })
    globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce")).rejects.toMatchObject({ code: "RATE_LIMITED" })
    globalThis.fetch = (async () => new Response("<title>Security check</title>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce")).rejects.toMatchObject({ code: "ACCESS_CHALLENGE" })
  })

  test("returns empty text for 404 and maps timeouts explicitly", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce")).resolves.toBe("")
    globalThis.fetch = (async () => { throw new DOMException("request timed out", "TimeoutError") }) as unknown as typeof fetch
    await expect(fetchHtml("https://www.silkhom.com/annonce/x/", "/annonce")).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" })
  })
})
