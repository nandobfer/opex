import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Dependências de execução no standalone (OPE-176): o `@ai-sdk/provider-utils` carrega o `undici` por
 * `createRequire` dinâmico (fetch protegido do OAuth da `@ai-sdk/mcp`), o rastreamento do Next não o levava
 * à imagem e o "Autorizar" dos MCPs do Agente Opex falhava com "Cannot find module 'undici'". O script roda
 * no build da imagem, copia o pacote e para o build quando ele não carrega.
 */

const SCRIPT = path.resolve('scripts/standalone-runtime-deps.mjs')
const dirs: string[] = []

// Sem NODE_PATH: o pnpm/Vitest o preenche com a pasta dos pacotes içados, e o undici seria achado por lá.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_PATH'))
const run = (standalone: string, repo = process.cwd()) => spawnSync(process.execPath, [SCRIPT, standalone, repo], { env: cleanEnv(), encoding: 'utf8', timeout: 60_000 })

/** Carrega `undici` como o chunk empacotado do servidor faz (processo novo, sem NODE_PATH). */
const requireFromChunk = (standalone: string) =>
  spawnSync(
    process.execPath,
    ['-e', `const { createRequire } = require("node:module"); const u = createRequire(process.argv[1])("undici"); process.stdout.write(typeof u.Agent)`, path.join(standalone, '.next', 'server', 'chunks', 'chunk.js')],
    { env: cleanEnv(), encoding: 'utf8', timeout: 30_000 },
  )

/** Árvore como o standalone ficava: chunks do servidor e nenhum `node_modules/undici`. */
function standaloneLike(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'opex-standalone-deps-'))
  dirs.push(root)
  writeFileSync(path.join(root, 'package.json'), '{}')
  mkdirSync(path.join(root, '.next', 'server', 'chunks'), { recursive: true })
  writeFileSync(path.join(root, '.next', 'server', 'chunks', 'chunk.js'), '')
  mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  return root
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('scripts/standalone-runtime-deps.mjs', () => {
  it('reproduz o problema: sem o script, o chunk do servidor não acha o undici', () => {
    const result = requireFromChunk(standaloneLike())
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Cannot find module 'undici'")
  })

  it('copia o undici do @ai-sdk/provider-utils e ele carrega a partir dos chunks', () => {
    const standalone = standaloneLike()
    const result = run(standalone)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toMatch(/undici \d+\.\d+\.\d+ disponível no standalone/)
    expect(existsSync(path.join(standalone, 'node_modules', 'undici', 'package.json'))).toBe(true)
    const loaded = requireFromChunk(standalone)
    expect(loaded.status, loaded.stderr).toBe(0)
    expect(loaded.stdout).toBe('function')
  })

  it('rodar de novo substitui a cópia sem duplicar', () => {
    const standalone = standaloneLike()
    expect(run(standalone).status).toBe(0)
    writeFileSync(path.join(standalone, 'node_modules', 'undici', 'lixo.txt'), 'parcial')
    expect(run(standalone).status).toBe(0)
    expect(existsSync(path.join(standalone, 'node_modules', 'undici', 'lixo.txt'))).toBe(false)
    expect(readdirSync(path.join(standalone, 'node_modules'))).toEqual(['undici'])
  })

  it('falha com mensagem em pt-BR quando a árvore de origem não tem a @ai-sdk/mcp', () => {
    const emptyRepo = mkdtempSync(path.join(tmpdir(), 'opex-empty-repo-'))
    dirs.push(emptyRepo)
    writeFileSync(path.join(emptyRepo, 'package.json'), '{}')
    const result = run(standaloneLike(), emptyRepo)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Dependência de execução ausente na imagem')
    expect(result.stderr).toContain('@ai-sdk/mcp')
  })

  it('falha quando a pasta do standalone não existe', () => {
    const result = run(path.join(tmpdir(), 'opex-nao-existe-standalone'))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('não existe')
  })
})
