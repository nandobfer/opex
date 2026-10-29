import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { findSection, normalizeDocDir, normalizeDocPath, parseHeadings, searchDocs, sliceLines } from '@/features/opex-agent/app-docs'
import { findOpexTool } from '@/features/opex-agent/server/tools/registry'

const context = { sessionId: 's1', actorId: 'local' }
const run = (name: string, input: unknown) => {
  const tool = findOpexTool(name)!
  return tool.execute(tool.input.parse(input), context)
}

const DOC = ['# Tarefas', '', 'Intro.', '', '## Criar tarefa', 'Clique em Nova tarefa.', '### Anexos', 'Até 10 MB.', '', '## Horas', 'Inicie o timer.', '```', '## não é título', '```'].join('\n')

describe('documentação do app (puro)', () => {
  it('caminho seguro: recusa subir de pasta, absoluto, byte nulo e não-.md', () => {
    expect(normalizeDocPath('modules/opex-agent.md')).toBe('modules/opex-agent.md')
    expect(normalizeDocPath('./README.md')).toBe('README.md')
    expect(normalizeDocPath('aicontext/modules/tasks.md')).toBe('modules/tasks.md')
    expect(normalizeDocPath('modules\\tasks.md')).toBe('modules/tasks.md')
    expect(normalizeDocPath('../AGENTS.md')).toBeNull()
    expect(normalizeDocPath('modules/../../.env.md')).toBeNull()
    expect(normalizeDocPath('/etc/passwd.md')).toBeNull()
    expect(normalizeDocPath('modules/x.txt')).toBeNull()
    expect(normalizeDocPath('a\0.md')).toBeNull()
    expect(normalizeDocDir('modules/')).toBe('modules')
    expect(normalizeDocDir('../')).toBeNull()
  })

  it('títulos ignoram blocos de código; a seção vai até o próximo título de nível igual ou acima', () => {
    expect(parseHeadings(DOC).map((heading) => heading.text)).toEqual(['Tarefas', 'Criar tarefa', 'Anexos', 'Horas'])
    expect(findSection(DOC, 'criar TAREFA')).toMatchObject({ start: 5, end: 9 })
    expect(findSection(DOC, '## horas')).toMatchObject({ start: 10, end: 14 })
    expect(findSection(DOC, 'inexistente')).toBeNull()
  })

  it('janela de linhas numeradas, cortada por linhas e por caracteres', () => {
    expect(sliceLines(DOC, 5, 2)).toMatchObject({ startLine: 5, endLine: 6, totalLines: 14, truncated: true, text: '5: ## Criar tarefa\n6: Clique em Nova tarefa.' })
    expect(sliceLines(DOC, 13, 50)).toMatchObject({ endLine: 14, truncated: false })
    expect(sliceLines(DOC, 1, 50, 20).endLine).toBe(2)
  })

  it('busca sem acento e caixa, ordenada pelas palavras encontradas, com a seção', () => {
    const files = [
      { path: 'modules/tasks.md', content: DOC },
      { path: 'modules/time.md', content: '# Horas\n## Apontar\nO timer aponta as horas da tarefa.' },
    ]
    const hits = searchDocs(files, 'TIMER aponta horas')
    expect(hits[0]).toMatchObject({ path: 'modules/time.md', line: 3, section: 'Apontar' })
    expect(searchDocs(files, 'ate 10 mb')[0]).toMatchObject({ path: 'modules/tasks.md', line: 8, section: 'Anexos' })
    expect(searchDocs(files, 'tarefa', 1)).toHaveLength(1)
    expect(searchDocs(files, 'x')).toEqual([])
  })
})

describe('ferramentas de documentação (aicontext/ em disco)', () => {
  let cwd: string
  let outside: string

  beforeAll(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'opex-docs-'))
    outside = mkdtempSync(path.join(tmpdir(), 'opex-outside-'))
    mkdirSync(path.join(cwd, 'aicontext', 'modules'), { recursive: true })
    writeFileSync(path.join(cwd, 'aicontext', 'README.md'), '# Índice\n## Módulos\nVeja modules/.')
    writeFileSync(path.join(cwd, 'aicontext', 'modules', 'tasks.md'), DOC)
    writeFileSync(path.join(cwd, 'aicontext', 'modules', 'big.md'), Array.from({ length: 900 }, (_, i) => `linha ${i + 1}`).join('\n'))
    writeFileSync(path.join(cwd, 'aicontext', 'modules', 'notas.txt'), 'não é markdown')
    writeFileSync(path.join(outside, 'segredo.md'), '# Segredo')
    symlinkSync(path.join(outside, 'segredo.md'), path.join(cwd, 'aicontext', 'modules', 'link.md'))
  })

  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(process, 'cwd').mockReturnValue(cwd)
  })

  it('list_app_docs lista só os .md, com título e seções, e filtra por pasta', async () => {
    const all = (await run('list_app_docs', {})) as { docs: { path: string; title: string; sections: string[] }[] }
    expect(all.docs.map((doc) => doc.path)).toEqual(['README.md', 'modules/big.md', 'modules/tasks.md'])
    expect(all.docs.find((doc) => doc.path === 'modules/tasks.md')).toMatchObject({ title: 'Tarefas', sections: ['Criar tarefa', 'Horas'] })
    const modules = (await run('list_app_docs', { dir: 'modules' })) as { total: number }
    expect(modules.total).toBe(2)
  })

  it('read_app_doc lê a seção ou em janelas (truncated + totalLines)', async () => {
    expect(await run('read_app_doc', { path: 'modules/tasks.md', section: 'Criar tarefa' })).toMatchObject({ section: 'Criar tarefa', startLine: 5, endLine: 9, truncated: false })
    expect(await run('read_app_doc', { path: 'modules/big.md' })).toMatchObject({ startLine: 1, endLine: 200, totalLines: 900, truncated: true })
    expect(await run('read_app_doc', { path: 'modules/big.md', startLine: 850, maxLines: 100 })).toMatchObject({ endLine: 900, truncated: false })
    await expect(run('read_app_doc', { path: 'modules/tasks.md', section: 'Nada' })).rejects.toThrow(/Seções: Tarefas/)
  })

  it('recusa caminho fora da pasta, symlink para fora e arquivo inexistente', async () => {
    await expect(run('read_app_doc', { path: '../package.json' })).rejects.toThrow(/Caminho inválido/)
    await expect(run('read_app_doc', { path: 'modules/link.md' })).rejects.toThrow(/fora da documentação/)
    await expect(run('read_app_doc', { path: 'modules/nada.md' })).rejects.toThrow(/não encontrado/)
  })

  it('search_app_docs devolve trechos com arquivo, linha e seção', async () => {
    const result = (await run('search_app_docs', { query: 'nova tarefa' })) as { hits: { path: string; line: number; section: string | null }[] }
    expect(result.hits[0]).toMatchObject({ path: 'modules/tasks.md', line: 6, section: 'Criar tarefa' })
  })

  it('sem a pasta aicontext: erro acionável em pt-BR', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(outside)
    await expect(run('list_app_docs', {})).rejects.toThrow(/Documentação do app indisponível/)
  })
})

describe('instruções salvas (migrateOpexInstructions)', () => {
  it('acrescenta a regra da documentação depois da frase padrão de criação de tarefa, uma vez só', async () => {
    const { migrateOpexInstructions } = await import('@/features/opex-agent/server/settings')
    const { OPEX_CREATE_TASK_INSTRUCTION, OPEX_DOCS_INSTRUCTION } = await import('@/features/opex-agent/constants')
    const saved = `Linha A\n${OPEX_CREATE_TASK_INSTRUCTION}\nLinha B`
    const migrated = migrateOpexInstructions(saved)
    expect(migrated).toBe(`Linha A\n${OPEX_CREATE_TASK_INSTRUCTION}\n${OPEX_DOCS_INSTRUCTION}\nLinha B`)
    expect(migrateOpexInstructions(migrated)).toBe(migrated)
    // Texto editado à mão (sem a frase exata) fica como está.
    expect(migrateOpexInstructions('Crie tarefas do meu jeito')).toBe('Crie tarefas do meu jeito')
  })
})
