import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const CLI = resolve(import.meta.dir, "../src/cli.ts")

export function runCLI(...args: string[]) {
  return spawnSync("bun", ["run", CLI, ...args], { encoding: "utf8", timeout: 30000 })
}

export function parseJSON<T = unknown>(value: string): T {
  return JSON.parse(value) as T
}
