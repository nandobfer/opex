import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Roteamento por arquivos das rotas da central (OPE-212). Os testes de rota chamam o handler direto e não
 * passam pelo roteamento do Next: este teste lê `src/app/api` e aplica a regra de casamento do Next
 * (estático > dinâmico > catch-all > catch-all opcional) para garantir que cada URL chega ao arquivo certo.
 * Regressão: com `integrations/[...path]` (obrigatório), `GET /api/integrations` (a lista) caía fora da rota.
 */

const API_DIR = join(process.cwd(), 'src/app/api')

interface Node {
  dir: string
  hasRoute: boolean
  children: Map<string, Node>
}

function load(dir: string): Node {
  const node: Node = { dir, hasRoute: false, children: new Map() }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) node.children.set(entry, load(full))
    else if (entry === 'route.ts') node.hasRoute = true
  }
  return node
}

const kind = (name: string) =>
  name.startsWith('[[...') ? 'optional' : name.startsWith('[...') ? 'catchAll' : name.startsWith('[') ? 'dynamic' : name.startsWith('(') ? 'group' : 'static'

/** Arquivo que atende os segmentos, ou null (404). */
function resolve(node: Node, segments: string[]): string | null {
  if (segments.length === 0) {
    if (node.hasRoute) return node.dir
    for (const [name, child] of node.children) if (kind(name) === 'optional' && child.hasRoute) return child.dir
    return null
  }
  const [head, ...rest] = segments
  const children = [...node.children]
  const exact = node.children.get(head!)
  if (exact && kind(head!) === 'static') {
    const hit = resolve(exact, rest)
    if (hit) return hit
  }
  for (const [name, child] of children) {
    if (kind(name) !== 'dynamic') continue
    const hit = resolve(child, rest)
    if (hit) return hit
  }
  for (const [name, child] of children) if ((kind(name) === 'catchAll' || kind(name) === 'optional') && child.hasRoute) return child.dir
  return null
}

const tree = load(API_DIR)
const routeOf = (url: string) => {
  const hit = resolve(tree, url.replace(/^\/api\//, '').split('/').filter(Boolean))
  return hit ? relative(API_DIR, hit) : null
}

describe('roteamento por arquivos das rotas da central', () => {
  it('a raiz /api/integrations (lista da central) cai no catch-all opcional', () => {
    expect(routeOf('/api/integrations')).toBe('integrations/[[...path]]')
  })

  it('subcaminhos caem no catch-all de cada ponto de montagem', () => {
    expect(routeOf('/api/integrations/pusher')).toBe('integrations/[[...path]]')
    expect(routeOf('/api/integrations/github/links')).toBe('integrations/[[...path]]')
    expect(routeOf('/api/ai/providers/gemini/keys')).toBe('ai/[...path]')
    expect(routeOf('/api/opencode/quota/go')).toBe('opencode/[...path]')
    expect(routeOf('/api/command-code/usage')).toBe('command-code/[...path]')
  })

  it('rotas estáticas do app continuam com precedência sobre o catch-all', () => {
    expect(routeOf('/api/opencode/quota')).toBe('opencode/quota')
  })
})
