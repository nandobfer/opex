import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Verificação do compilador de plugins na árvore da imagem (OPE-172, OPE-173): o standalone do Next
 * levava o JS do Rolldown sem o binário nativo e o Tailwind sem as folhas de estilo, e a mesa Plugin
 * falhava ao compilar. O script roda no build da imagem e para o build quando algo falta.
 */

const SCRIPT = path.resolve('scripts/plugin-runtime-check.mjs')
const REPO_MODULES = path.resolve('node_modules')
const dirs: string[] = []

// Sem NODE_PATH: o pnpm/Vitest o preenche com a pasta dos pacotes içados, e o binário seria achado por lá.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_PATH'))
const run = (root: string, cwd = process.cwd()) => spawnSync(process.execPath, [SCRIPT, root], { cwd, env: cleanEnv(), encoding: 'utf8', timeout: 60_000 })

/** Árvore como o standalone deixava: Rolldown e Tailwind no layout do pnpm, sem binário e sem CSS. */
function standaloneLike(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'opex-plugin-runtime-'))
  dirs.push(root)
  writeFileSync(path.join(root, 'package.json'), '{}')
  const store = path.join(root, 'node_modules', '.pnpm')
  const rolldown = path.join(store, 'rolldown@1.3.3', 'node_modules')
  mkdirSync(path.join(rolldown, '@rolldown'), { recursive: true })
  mkdirSync(path.join(rolldown, '@oxc-project'), { recursive: true })
  cpSync(path.join(REPO_MODULES, '.pnpm', 'rolldown@1.3.3', 'node_modules', 'rolldown'), path.join(rolldown, 'rolldown'), { recursive: true, dereference: true })
  cpSync(path.join(REPO_MODULES, '.pnpm', 'rolldown@1.3.3', 'node_modules', '@rolldown', 'pluginutils'), path.join(rolldown, '@rolldown', 'pluginutils'), { recursive: true, dereference: true })
  const tailwind = path.join(store, 'tailwindcss@4.3.3', 'node_modules', 'tailwindcss')
  mkdirSync(tailwind, { recursive: true })
  cpSync(path.join(REPO_MODULES, 'tailwindcss', 'dist'), path.join(tailwind, 'dist'), { recursive: true, dereference: true })
  cpSync(path.join(REPO_MODULES, 'tailwindcss', 'package.json'), path.join(tailwind, 'package.json'))
  return root
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('scripts/plugin-runtime-check.mjs', () => {
  it('passa na árvore completa (Rolldown com binário e Tailwind com as folhas de estilo)', () => {
    const result = run('.')
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^Compilador de plugins OK \(Rolldown 1\.3\.3, Tailwind\)/)
  })

  it('falha em pt-BR quando falta o binário nativo do Rolldown (o caso da OPE-173)', () => {
    const result = run(standaloneLike())
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/^Compilador de plugins indisponível na imagem: o Rolldown não carregou \(Cannot find native binding/)
  }, 60_000)

  it('com o binário copiado, falha porque o Tailwind ficou sem as folhas de estilo; com o pacote inteiro, passa', () => {
    const root = standaloneLike()
    const binding = path.join('node_modules', '.pnpm', 'rolldown@1.3.3', 'node_modules', '@rolldown')
    for (const name of ['binding-linux-x64-gnu', 'binding-linux-x64-musl', 'binding-darwin-arm64', 'binding-darwin-x64']) {
      try {
        cpSync(path.join(REPO_MODULES, '.pnpm', 'rolldown@1.3.3', 'node_modules', '@rolldown', name), path.join(root, binding, name), { recursive: true, dereference: true })
      } catch {
        // Só o binário desta plataforma está instalado.
      }
    }
    // Só o layout do pnpm (sem node_modules/tailwindcss): a resolução a partir da raiz falha.
    const missing = run(root)
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('Compilador de plugins indisponível na imagem: o Tailwind não carregou')

    symlinkSync(path.join(root, 'node_modules', '.pnpm', 'tailwindcss@4.3.3', 'node_modules', 'tailwindcss'), path.join(root, 'node_modules', 'tailwindcss'))
    const noCss = run(root)
    expect(noCss.status).toBe(1)
    expect(noCss.stderr).toContain('as folhas de estilo do Tailwind não foram encontradas')

    rmSync(path.join(root, 'node_modules', 'tailwindcss'))
    cpSync(path.join(REPO_MODULES, 'tailwindcss'), path.join(root, 'node_modules', 'tailwindcss'), { recursive: true, dereference: true })
    const ok = run(root)
    expect(ok.stderr).toBe('')
    expect(ok.status).toBe(0)
  }, 60_000)
})
