import { describe, expect, it } from 'vitest'
import { FrontmatterError } from '@/features/opencode-resources/frontmatter'
import { parseGithubSkillSource } from '@/features/opex-agent/skill-source'
import {
  buildSkillMarkdown,
  matchesSkillFilter,
  opexSkillCreateSchema,
  opexSkillDiscoverSchema,
  outdatedSkills,
  parseSkillMarkdown,
  skillsCatalogBlock,
  skillSourceLabel,
  skillVersionOf,
  skillWindow,
} from '@/features/opex-agent/skills'
import { opexSkillFormSchema, updateInputOf, createInputOf, EMPTY_OPEX_SKILL_FORM } from '@/features/opex-agent/skill-form-schemas'
import { findSkillFolders, folderBlobs, folderHashOf, looksBinary } from '@/features/opex-agent/server/skills/github'

/** Skills do Agente Opex (OPE-153): regras puras — SKILL.md, origem, hash, catálogo e formulário. */

describe('SKILL.md e frontmatter', () => {
  it('lê name, description, extras e corpo; monta de volta', () => {
    const parsed = parseSkillMarkdown('---\nname: revisar-pr\ndescription: Use ao revisar PR\nlicense: MIT\n---\n\n# Passos\n1. Ler o diff\n')
    expect(parsed).toEqual({ name: 'revisar-pr', description: 'Use ao revisar PR', extra: { license: 'MIT' }, body: '\n# Passos\n1. Ler o diff\n' })
    expect(parseSkillMarkdown(buildSkillMarkdown(parsed))).toMatchObject({ name: 'revisar-pr', description: 'Use ao revisar PR', extra: { license: 'MIT' } })
  })

  it('frontmatter inválido (sem description, nome fora da regra de pasta, YAML quebrado) vira FrontmatterError claro', () => {
    expect(() => parseSkillMarkdown('---\nname: ok\n---\ncorpo')).toThrow(/description/)
    expect(() => parseSkillMarkdown('---\nname: Nome Com Espaço\ndescription: x\n---\ncorpo')).toThrow(/name/)
    expect(() => parseSkillMarkdown('---\nname: [\n---\ncorpo')).toThrow(FrontmatterError)
    expect(() => parseSkillMarkdown('sem frontmatter')).toThrow(FrontmatterError)
  })

  it('criar: mesma regra de nome/pasta do OpenCode, corpo obrigatório, arquivos sem caminho repetido nem ..', () => {
    expect(opexSkillCreateSchema.safeParse({ name: 'revisar-pr', description: 'x', body: 'faça' }).success).toBe(true)
    expect(opexSkillCreateSchema.safeParse({ name: '-ruim', description: 'x', body: 'faça' }).success).toBe(false)
    expect(opexSkillCreateSchema.safeParse({ name: 'ok', description: 'x', body: '   ' }).success).toBe(false)
    expect(opexSkillCreateSchema.safeParse({ name: 'ok', description: 'x', body: 'b', files: [{ path: '../fora', content: '' }] }).success).toBe(false)
    expect(opexSkillCreateSchema.safeParse({ name: 'ok', description: 'x', body: 'b', files: [{ path: 'SKILL.md', content: '' }] }).success).toBe(false)
    expect(opexSkillCreateSchema.safeParse({ name: 'ok', description: 'x', body: 'b', files: [{ path: 'a.md', content: '' }, { path: 'a.md', content: '' }] }).success).toBe(false)
  })
})

describe('origem da instalação', () => {
  it('mesmas regras do OpenCode: sem espaços, começando por letra, número, @ ou .', () => {
    expect(opexSkillDiscoverSchema.safeParse({ source: 'dono/repo' }).success).toBe(true)
    expect(opexSkillDiscoverSchema.safeParse({ source: '-dono/repo' }).success).toBe(false)
    expect(opexSkillDiscoverSchema.safeParse({ source: 'dono / repo' }).success).toBe(false)
  })

  it('aceita dono/repo, URL do GitHub (.git) e /tree/<ref>/<pasta>; recusa o que não é GitHub', () => {
    expect(parseGithubSkillSource('Dono/Repo')).toEqual({ repo: 'dono/repo', ref: null, path: null })
    expect(parseGithubSkillSource('https://github.com/dono/repo.git')).toEqual({ repo: 'dono/repo', ref: null, path: null })
    expect(parseGithubSkillSource('https://github.com/dono/repo/tree/main/skills/revisar-pr')).toEqual({ repo: 'dono/repo', ref: 'main', path: 'skills/revisar-pr' })
    expect(parseGithubSkillSource('https://github.com/dono/repo/blob/main/skills/x/SKILL.md')).toEqual({ repo: 'dono/repo', ref: 'main', path: 'skills/x' })
    expect(parseGithubSkillSource('@escopo/pacote')).toBeNull()
    expect(parseGithubSkillSource('https://gitlab.com/dono/repo')).toBeNull()
    expect(parseGithubSkillSource('dono')).toBeNull()
  })
})

describe('descoberta no repositório', () => {
  const tree = {
    sha: 'raiz',
    truncated: false,
    entries: [
      { path: 'skills', type: 'tree' as const, sha: 't0' },
      { path: 'skills/a', type: 'tree' as const, sha: 'ta' },
      { path: 'skills/a/SKILL.md', type: 'blob' as const, sha: 'b1' },
      { path: 'skills/a/ref/guia.md', type: 'blob' as const, sha: 'b2' },
      { path: 'skills/a/interna/SKILL.md', type: 'blob' as const, sha: 'b3' },
      { path: 'skills/b/SKILL.md', type: 'blob' as const, sha: 'b4' },
      { path: '.github/skill/SKILL.md', type: 'blob' as const, sha: 'b5' },
      { path: 'node_modules/x/SKILL.md', type: 'blob' as const, sha: 'b6' },
    ],
  }

  it('uma pasta com SKILL.md é uma skill (não procura dentro dela); ignora ocultas e node_modules; filtra pela pasta da URL', () => {
    expect(findSkillFolders(tree)).toEqual(['skills/a', 'skills/b'])
    expect(findSkillFolders(tree, 'skills/b')).toEqual(['skills/b'])
    expect(findSkillFolders({ entries: [{ path: 'SKILL.md', type: 'blob', sha: 'x' }, { path: 'sub/SKILL.md', type: 'blob', sha: 'y' }] })).toEqual([''])
  })

  it('hash = SHA da árvore da pasta (raiz = árvore do repositório) e arquivos relativos à pasta', () => {
    expect(folderHashOf(tree, 'skills/a')).toBe('ta')
    expect(folderHashOf(tree, '')).toBe('raiz')
    expect(folderHashOf(tree, 'sumiu')).toBeNull()
    expect(folderBlobs(tree, 'skills/a').map((blob) => blob.path)).toEqual(['SKILL.md', 'ref/guia.md', 'interna/SKILL.md'])
  })

  it('binário: byte nulo ou UTF-8 inválido', () => {
    expect(looksBinary(Buffer.from('texto ção'))).toBe(false)
    expect(looksBinary(Buffer.from([0x50, 0x00, 0x01]))).toBe(true)
    expect(looksBinary(Buffer.from([0xff, 0xfe, 0xfd]))).toBe(true)
  })
})

describe('versão e filtros', () => {
  it('"Com atualização" compara o hash gravado com o disponível; criada no Opex não tem versão', () => {
    expect(skillVersionOf('abcdef1234', 'abcdef1234')).toEqual({ installed: 'abcdef1', available: 'abcdef1', outdated: false })
    expect(skillVersionOf('abcdef1234', '9999999999')).toEqual({ installed: 'abcdef1', available: '9999999', outdated: true })
    expect(skillVersionOf('abcdef1234', null)).toEqual({ installed: 'abcdef1', available: null, outdated: false })
    expect(skillVersionOf(null, '9999')).toBeNull()
  })

  it('"Atualizar todos" conta ligadas e desligadas com atualização; filtros da lista', () => {
    const on = { enabled: true, version: { installed: 'a', available: 'b', outdated: true } }
    const off = { enabled: false, version: { installed: 'a', available: 'b', outdated: true } }
    const created = { enabled: true, version: null }
    expect(outdatedSkills([on, off, created])).toEqual([on, off])
    expect([on, off, created].filter((skill) => matchesSkillFilter(skill, 'disabled'))).toEqual([off])
    expect([on, off, created].filter((skill) => matchesSkillFilter(skill, 'enabled'))).toEqual([on, created])
  })

  it('origem exibida', () => {
    expect(skillSourceLabel({ kind: 'opex', repo: null, ref: null, path: null })).toBe('Criada no Opex')
    expect(skillSourceLabel({ kind: 'github', repo: 'dono/repo', ref: null, path: 'skills/a' })).toBe('dono/repo/skills/a')
  })
})

describe('catálogo e leitura em janelas', () => {
  it('catálogo só com nome e descrição; vazio sem skills', () => {
    const block = skillsCatalogBlock([{ name: 'revisar-pr', description: 'Use ao\n revisar PR' }])
    expect(block).toContain('## Skills disponíveis')
    expect(block).toContain('- revisar-pr: Use ao revisar PR')
    expect(block).toContain('load_opex_skill')
    expect(skillsCatalogBlock([])).toBe('')
  })

  it('janela numerada para conteúdo grande', () => {
    const text = Array.from({ length: 1000 }, (_, index) => `linha ${index + 1}`).join('\n')
    const first = skillWindow(text)
    expect(first).toMatchObject({ startLine: 1, endLine: 400, totalLines: 1000 })
    expect(first.text.split('\n')[0]).toBe('1: linha 1')
    expect(skillWindow(text, 990, 50)).toMatchObject({ startLine: 990, endLine: 1000 })
  })
})

describe('formulário', () => {
  it('nome único entre as skills do Opex e caminhos sem repetição, em tempo real', () => {
    const schema = opexSkillFormSchema(['revisar-pr'])
    expect(schema.safeParse({ ...EMPTY_OPEX_SKILL_FORM, name: 'revisar-pr', description: 'x', body: 'b' }).success).toBe(false)
    expect(schema.safeParse({ ...EMPTY_OPEX_SKILL_FORM, name: 'nova', description: 'x', body: 'b' }).success).toBe(true)
    const file = { path: 'a.md', content: 'x', existing: false, binary: false, size: 0 }
    expect(schema.safeParse({ ...EMPTY_OPEX_SKILL_FORM, name: 'nova', description: 'x', body: 'b', files: [file, file] }).success).toBe(false)
  })

  it('editar envia só as mudanças: alterados com texto, removidos com null; os não carregados ficam', () => {
    const values = {
      name: 'a',
      description: 'd',
      body: 'b',
      files: [
        { path: 'mantido.md', content: null, existing: true, binary: false, size: 3 },
        { path: 'editado.md', content: 'novo', existing: true, binary: false, size: 3 },
        { path: 'novo.md', content: 'oi', existing: false, binary: false, size: 0 },
      ],
      removed: ['apagado.md'],
    }
    expect(updateInputOf(values)).toEqual({ description: 'd', body: 'b', files: [{ path: 'editado.md', content: 'novo' }, { path: 'novo.md', content: 'oi' }, { path: 'apagado.md', content: null }] })
    expect(createInputOf({ ...values, removed: [] }).files).toEqual([{ path: 'editado.md', content: 'novo' }, { path: 'novo.md', content: 'oi' }])
  })
})
