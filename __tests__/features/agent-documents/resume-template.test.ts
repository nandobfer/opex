import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPACT_REPLACEMENTS, renderResumeHtml, resumeCss } from '@/features/agent-documents/server/resume/template'
import { REFERENCE_RESUME_CONTENT } from '../../fixtures/resume/sample-content'

const ENTITIES: Record<string, string> = { middot: '·', ndash: '–', mdash: '—', rarr: '→', ecirc: 'ê' }

/** Entidades nomeadas viram o caractere (o modelo escreve o texto em Unicode) e os espaços entre tags são normalizados. */
const normalize = (html: string) =>
  html
    .replace(/&(middot|ndash|mdash|rarr|ecirc);/g, (_, name: string) => ENTITIES[name]!)
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim()

const reference = readFileSync(join(__dirname, '../../fixtures/resume/curriculo-fernando-burgos-2026-11-15.html'), 'utf8')

describe('modelo do currículo aprovado (OPE-210)', () => {
  it('reproduz literalmente o HTML de referência (curriculo-fernando-burgos-2026-11-15)', () => {
    expect(normalize(renderResumeHtml(REFERENCE_RESUME_CONTENT, 'padrao'))).toBe(normalize(reference))
  })

  it('o CSS padrão é o da referência, linha a linha', () => {
    const css = /<style>\n([\s\S]*?)\n<\/style>/.exec(reference)![1]!
    expect(resumeCss('padrao')).toBe(css)
  })

  it('a densidade compacta troca só os 4 valores registrados', () => {
    const compact = resumeCss('compacto')
    expect(compact).toContain('@page{size:A4;margin:9mm 12mm}')
    expect(compact).toContain('font-size:8.25pt;line-height:1.22;')
    expect(compact).toContain('padding-bottom:2px;margin:6px 0 4px}')
    let restored = compact
    for (const [from, to] of COMPACT_REPLACEMENTS) restored = restored.replace(to, from)
    expect(restored).toBe(resumeCss('padrao'))
    expect(compact.split('\n').filter((line, index) => line !== resumeCss('padrao').split('\n')[index])).toHaveLength(3)
  })

  it('escapa o conteúdo e usa os títulos em pt-BR', () => {
    const html = renderResumeHtml({ ...REFERENCE_RESUME_CONTENT, nome: 'Ana <script>', idioma: 'pt-BR' }, 'padrao')
    expect(html).toContain('<h1>Ana &lt;script&gt;</h1>')
    expect(html).not.toContain('<script>')
    for (const title of ['Perfil', 'Competências', 'Experiência', 'Trabalhos em destaque', 'Formação e idiomas', 'Antes:', 'Idiomas:']) expect(html).toContain(title)
    expect(html).not.toContain('<h2>Profile</h2>')
  })

  it('seções vazias somem e o local entra na linha da empresa', () => {
    const html = renderResumeHtml({ ...REFERENCE_RESUME_CONTENT, destaques: [], experiencias: [{ cargo: 'Dev', empresa: 'Acme', periodo: '2024', local: 'Remote', topicos: [] }] }, 'padrao')
    expect(html).not.toContain('Selected AI work')
    expect(html).toContain('<div class="co">Acme &middot; Remote</div>')
  })
})
