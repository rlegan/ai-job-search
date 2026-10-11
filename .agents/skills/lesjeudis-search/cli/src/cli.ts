import { runDetail } from "./commands/detail.js"
import { runSearch } from "./commands/search.js"
import { writeError } from "./helpers.js"

const WARNING = "Personal use only, occasional low volume; no commercial or bulk use. The portal's terms restrict automated collection."
const HELP = `LesJeudis Search CLI\n${WARNING}\n\nCommands:\n  search [-q|--query <terms>] [--page 1] [--limit <n>] [--jobage <days>] [--format json|table|plain]\n  detail <exact-offer-slug|url> [--format json|plain]\n\nThe changing latest-offers subset is incomplete; the captured page had 12 cards. --jobage is unsupported.\n`

type Parsed = { command: string; positionals: string[]; flags: Map<string, string> }

export function parseArguments(args: string[]): Parsed | string {
  const [command, ...rest] = args
  if (!command || command === "--help" || command === "-h" || command === "help") return HELP
  if (command !== "search" && command !== "detail") return `BAD_CMD: Unknown command "${command}"`
  const flags = new Map<string, string>()
  const positionals: string[] = []
  const aliases: Record<string, string> = { "-q": "--query" }
  const allowed = command === "search"
    ? new Set(["--query", "--page", "--limit", "--jobage", "--format"])
    : new Set(["--format"])
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (!token.startsWith("-")) { positionals.push(token); continue }
    const [rawKey, inline] = token.split(/=(.*)/s, 2)
    const key = aliases[rawKey] ?? rawKey
    if (!allowed.has(key)) return `BAD_ARG: Unknown argument "${rawKey}"`
    if (flags.has(key)) return `BAD_ARG: Duplicate argument "${key}"`
    const value = inline ?? rest[++i]
    if (value === undefined || value.startsWith("--")) return `BAD_ARG: ${key} requires a value`
    if (!value.trim()) return `BAD_ARG: ${key} cannot be empty`
    flags.set(key, value)
  }
  if (command === "search" && positionals.length) return `BAD_ARG: Unexpected positional argument "${positionals[0]}"`
  if (command === "detail" && positionals.length !== 1) return "BAD_ARG: detail requires exactly one <id|url>"
  if (flags.has("--format")) {
    const allowedFormats = command === "search" ? ["json", "table", "plain"] : ["json", "plain"]
    if (!allowedFormats.includes(flags.get("--format")!)) return "BAD_ARG: unsupported --format"
  }
  for (const key of ["--page", "--limit", "--jobage"]) {
    if (!flags.has(key)) continue
    const raw = flags.get(key)!
    const value = Number(raw)
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value)) return `BAD_ARG: ${key} must be a whole number >= 1`
  }
  return { command, positionals, flags }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const parsed = parseArguments(args)
  if (typeof parsed === "string") {
    if (parsed === HELP) { process.stdout.write(HELP); return 0 }
    const [code, ...message] = parsed.split(": ")
    writeError(message.join(": "), code)
    return 1
  }
  const fmt = parsed.flags.get("--format") ?? "json"
  if (parsed.command === "search") {
    return runSearch({
      query: parsed.flags.get("--query"),
      page: Number(parsed.flags.get("--page") ?? "1"),
      limit: Number(parsed.flags.get("--limit") ?? "20"),
      jobage: parsed.flags.has("--jobage") ? Number(parsed.flags.get("--jobage")) : undefined,
      format: fmt as "json" | "table" | "plain",
    })
  }
  return runDetail(parsed.positionals[0], fmt as "json" | "plain")
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((error: unknown) => {
    writeError(error instanceof Error ? error.message : String(error), "INTERNAL_ERROR")
    process.exit(1)
  })
}
