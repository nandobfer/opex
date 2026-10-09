import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * Fronteira cliente/servidor: nenhum módulo `"use client"` pode alcançar (transitivamente, por
 * imports estáticos ou dinâmicos) código de servidor como Mongoose, o banco, o logger Pino ou o
 * SDK do Pusher servidor. O bundler do navegador falha nesses casos (`Can't resolve 'net'`), e o
 * Vitest/tsc não percebem — este teste pega antes do build.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const SERVER_PACKAGES = ['mongoose', 'mongodb', 'pino', 'pusher', 'node:', 'fs', 'crypto']
const SERVER_PATHS = ['src/lib/db/', 'src/lib/logger', 'src/lib/pusher/server', 'src/lib/integrations/store', 'src/lib/crypto/']
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const TYPE_ONLY = /^\s*(?:import|export)\s+type\s/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.(tsx?)$/.test(name) ? [path] : []
  })
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
  if (!base) return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specs: string[] = []
  for (const line of source.split('\n')) {
    if (TYPE_ONLY.test(line)) continue
    for (const match of line.matchAll(IMPORT)) specs.push((match[1] ?? match[2])!)
  }
  // imports de várias linhas: captura `from '...'` que não começou na mesma linha
  for (const match of source.matchAll(/^\}\s*from\s+['"]([^'"]+)['"]/gm)) {
    const start = source.lastIndexOf('import', match.index)
    if (!/^import\s+type\s/.test(source.slice(start))) specs.push(match[1]!)
  }
  return specs
}

const isServerPackage = (spec: string) => SERVER_PACKAGES.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`) || (pkg.endsWith(':') && spec.startsWith(pkg)))
const isServerPath = (file: string) => SERVER_PATHS.some((path) => relative(ROOT, file).startsWith(path))

describe('fronteira cliente/servidor', () => {
  it('nenhum componente/hook "use client" alcança código de servidor', () => {
    const clientFiles = walk(SRC).filter((file) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')))
    expect(clientFiles.length).toBeGreaterThan(20)
    const offenders = new Set<string>()
    for (const entry of clientFiles) {
      const seen = new Set<string>()
      const stack: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [relative(ROOT, entry)] }]
      while (stack.length) {
        const { file, chain } = stack.pop()!
        if (seen.has(file)) continue
        seen.add(file)
        for (const spec of importsOf(file)) {
          if (isServerPackage(spec)) {
            offenders.add(`${chain.join(' → ')} → ${spec}`)
            continue
          }
          const next = resolveLocal(file, spec)
          if (!next) continue
          if (isServerPath(next)) {
            offenders.add(`${chain.join(' → ')} → ${relative(ROOT, next)}`)
            continue
          }
          stack.push({ file: next, chain: [...chain, relative(ROOT, next)] })
        }
      }
    }
    expect([...offenders]).toEqual([])
  })
})
