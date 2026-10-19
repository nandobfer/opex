import { describe, expect, it } from 'vitest'
import { applyLiveLine, closeRunningTools, partsText } from '@/features/opex-agent/live-message'
import { redactToolCalls, selectHistory, stripPastReasoning, withTurnContext } from '@/features/opex-agent/history'
import { clampWords, fallbackTitle, parseTitleOutput } from '@/features/opex-agent/title'
import { closeTab, openTab, pruneTabs, OPEX_DRAFT_TAB } from '@/features/opex-agent/hooks/useOpexTabs'
import { reduceStream, splitLines } from '@/features/opex-agent/hooks/useOpexStream'
import { buildChatItems } from '@/features/opex-agent/components/chat/OpexMessageList'
import { searchSessions } from '@/features/opex-agent/components/OpexSessionsPanel'
import { isOpexShortcut } from '@/features/opex-agent/constants'
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema } from '@/features/opex-agent/schemas'
import type { OpexLiveMessage, OpexMessageDto, OpexSessionDto } from '@/features/opex-agent/types'

const live = (): OpexLiveMessage => ({ id: 'm1', parts: [], startedAt: '2026-10-19T12:00:00.000Z', thinking: false })

describe('resposta ao vivo (applyLiveLine)', () => {
  it('junta textos e raciocínios consecutivos e acompanha a ferramenta do início ao fim', () => {
    let state: OpexLiveMessage | null = applyLiveLine(null, { type: 'turn-start', messageId: 'm1', startedAt: 'agora' })
    state = applyLiveLine(state, { type: 'reasoning-delta', text: 'pensa' })
    expect(state?.thinking).toBe(true)
    state = applyLiveLine(state, { type: 'reasoning-delta', text: 'ndo' })
    state = applyLiveLine(state, { type: 'tool-start', id: 't1', name: 'list_tasks', group: 'tasks', label: 'Listar tarefas' })
    state = applyLiveLine(state, { type: 'tool-start', id: 't1', name: 'list_tasks', group: 'tasks', label: 'Listar tarefas' })
    state = applyLiveLine(state, { type: 'tool-input', id: 't1', input: '{}' })
    state = applyLiveLine(state, { type: 'tool-end', id: 't1', state: 'done', output: '[]', error: null, confirmation: null, durationMs: 12 })
    state = applyLiveLine(state, { type: 'text-delta', text: 'Olá ' })
    state = applyLiveLine(state, { type: 'text-delta', text: 'mundo' })
    expect(state?.thinking).toBe(false)
    expect(state?.parts).toEqual([
      { type: 'reasoning', text: 'pensando' },
      { type: 'tool', id: 't1', name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', state: 'done', input: '{}', output: '[]', error: null, confirmation: null, durationMs: 12 },
      { type: 'text', text: 'Olá mundo' },
    ])
    expect(partsText(state!.parts)).toBe('Olá mundo')
    expect(applyLiveLine(state, { type: 'turn-end', messageId: 'm1', status: 'complete', error: null })).toBeNull()
  })

  it('linhas sem turno ativo são ignoradas e o snapshot substitui o estado', () => {
    expect(applyLiveLine(null, { type: 'text-delta', text: 'x' })).toBeNull()
    expect(applyLiveLine(live(), { type: 'snapshot', status: 'idle', live: null })).toBeNull()
  })

  it('ferramentas rodando viram erro quando o turno é interrompido', () => {
    const parts = closeRunningTools([{ type: 'tool', id: 't', name: 'n', group: null, label: 'n', state: 'running', input: null, output: null, error: null, confirmation: null, durationMs: null }], 'Interrompido')
    expect(parts[0]).toMatchObject({ state: 'error', error: 'Interrompido' })
  })
})

describe('histórico (selectHistory)', () => {
  const turn = (role: 'user' | 'assistant', size: number) => ({ role, modelMessages: [{ role, content: 'x'.repeat(size) }] })

  it('manda tudo enquanto cabe no orçamento', () => {
    const result = selectHistory([turn('user', 10), turn('assistant', 10)], 'resumo', 1000)
    expect(result.omitted).toBe(0)
    expect(result.messages).toHaveLength(2)
  })

  it('corta os turnos antigos, sempre começa pelo usuário e põe o resumo no lugar', () => {
    const stored = [turn('user', 500), turn('assistant', 500), turn('user', 100), turn('assistant', 100), turn('user', 100)]
    const result = selectHistory(stored, 'Usuário pediu tarefas do CRM', 450)
    expect(result.omitted).toBe(2)
    expect(result.messages[0]).toEqual({ role: 'user', content: expect.stringContaining('Usuário pediu tarefas do CRM') })
    expect(result.messages[2]).toMatchObject({ role: 'user' })
  })

  it('a mensagem mais recente entra mesmo acima do orçamento', () => {
    expect(selectHistory([turn('user', 5000)], '', 10).messages).toHaveLength(1)
  })

  it('troca a entrada das chamadas de ferramenta pela versão sem segredos', () => {
    const messages = redactToolCalls(
      [{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'update_integration', input: { secret: 'abc' } }, { type: 'text', text: 'ok' }] }, { role: 'user', content: 'oi' }],
      (name, input) => (name === 'update_integration' ? { secret: '[segredo omitido]' } : input),
    )
    expect(messages[0]).toEqual({ role: 'assistant', content: [{ type: 'tool-call', toolName: 'update_integration', input: { secret: '[segredo omitido]' } }, { type: 'text', text: 'ok' }] })
    expect(messages[1]).toEqual({ role: 'user', content: 'oi' })
  })
})

describe('histórico enviado (raciocínio e contexto do turno)', () => {
  it('tira o raciocínio do assistente e descarta a mensagem que só tinha raciocínio', () => {
    const messages = stripPastReasoning([
      { role: 'user', content: [{ type: 'text', text: 'oi' }] },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'x' }, { type: 'text', text: 'olá' }] },
      { role: 'assistant', content: [{ type: 'redacted-reasoning', data: 'y' }] },
      { role: 'assistant', content: 'texto puro' },
    ])
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'oi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'olá' }] },
      { role: 'assistant', content: 'texto puro' },
    ])
  })

  it('acrescenta o contexto só à última mensagem do usuário, com texto ou partes', () => {
    const history = [{ role: 'user', content: 'antes' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: [{ type: 'image', image: 'x' }] }]
    const messages = withTurnContext(history, 'agora')
    expect(messages[0]).toEqual({ role: 'user', content: 'antes' })
    expect(messages[2]).toEqual({ role: 'user', content: [{ type: 'image', image: 'x' }, { type: 'text', text: '(agora)' }] })
    expect(withTurnContext([{ role: 'user', content: 'oi' }], 'agora')).toEqual([{ role: 'user', content: [{ type: 'text', text: 'oi' }, { type: 'text', text: '(agora)' }] }])
    expect(history[2]).toEqual({ role: 'user', content: [{ type: 'image', image: 'x' }] })
  })
})

describe('título e resumo', () => {
  it('lê o JSON do subagente mesmo com cercas de código, cortando nos limites', () => {
    const parsed = parseTitleOutput('```json\n{"title": "\\"Criar tarefa do CRM.\\"", "summary": "Pediu uma tarefa."}\n```')
    expect(parsed).toEqual({ title: 'Criar tarefa do CRM', summary: 'Pediu uma tarefa.' })
    expect(parseTitleOutput('sem json')).toBeNull()
    expect(parseTitleOutput('{"title": ""}')).toBeNull()
  })

  it('corta em limite de palavra e usa a mensagem do usuário como reserva', () => {
    expect(clampWords('uma frase bem longa para cortar', 15)).toBe('uma frase bem…')
    expect(fallbackTitle('   ')).toBe('Nova sessão')
    expect(fallbackTitle('Quanto apontei hoje?')).toBe('Quanto apontei hoje?')
  })
})

describe('abas de sessão', () => {
  it('abrir ativa e não duplica; fechar a ativa passa para a vizinha ou para a nova sessão', () => {
    let state = openTab({ open: [], active: OPEX_DRAFT_TAB }, 'a')
    state = openTab(state, 'b')
    state = openTab(state, 'a')
    expect(state).toEqual({ open: ['a', 'b'], active: 'a' })
    state = closeTab(state, 'a')
    expect(state).toEqual({ open: ['b'], active: 'b' })
    expect(closeTab(state, 'b')).toEqual({ open: [], active: OPEX_DRAFT_TAB })
  })

  it('remove abas de sessões excluídas', () => {
    expect(pruneTabs({ open: ['a', 'b'], active: 'b' }, [{ id: 'a' }])).toEqual({ open: ['a'], active: 'a' })
    const same = { open: ['a'], active: 'a' }
    expect(pruneTabs(same, [{ id: 'a' }])).toBe(same)
  })
})

describe('stream e lista do chat', () => {
  it('divide o NDJSON e guarda a resposta recém-terminada até a gravada chegar', () => {
    const { lines, rest } = splitLines('{"type":"turn-start","messageId":"m1","startedAt":"x"}\n{"type":"text-delta","text":"oi"}\n{"type":"pi')
    expect(rest).toBe('{"type":"pi')
    let state = lines.reduce(reduceStream, { live: null, settled: null, status: null, connected: true })
    expect(state.status).toBe('running')
    state = reduceStream(state, { type: 'turn-end', messageId: 'm1', status: 'complete', error: null })
    expect(state.live).toBeNull()
    expect(state.settled?.parts).toEqual([{ type: 'text', text: 'oi' }])

    const message = { id: 'u1', role: 'user' } as OpexMessageDto
    expect(buildChatItems([message], null, state.settled).map((item) => item.kind)).toEqual(['message', 'live'])
    // A gravada chegou: a recém-terminada some (mesmo id).
    expect(buildChatItems([message, { id: 'm1', role: 'assistant' } as OpexMessageDto], null, state.settled)).toHaveLength(2)
  })
})

describe('busca de sessões e atalho', () => {
  const session = (id: string, title: string, summary: string, archived = false) => ({ id, title, summary, archived }) as OpexSessionDto

  it('busca tolerante por título e resumo, separando as arquivadas', () => {
    const list = [session('1', 'Tarefa do CRM', 'campo de e-mail'), session('2', 'Horas de hoje', 'apontamentos'), session('3', 'CRM antigo', '', true)]
    expect(searchSessions(list, 'crn', false).map((item) => item.id)).toEqual(['1'])
    expect(searchSessions(list, 'apontamento', false).map((item) => item.id)).toEqual(['2'])
    expect(searchSessions(list, '', true).map((item) => item.id)).toEqual(['3'])
  })

  it('Ctrl+Shift+O (ou ⌘+Shift+O) abre o agente', () => {
    expect(isOpexShortcut({ key: 'O', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBe(true)
    expect(isOpexShortcut({ key: 'o', ctrlKey: false, metaKey: true, shiftKey: true, altKey: false })).toBe(true)
    expect(isOpexShortcut({ key: 'o', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe(false)
  })
})

describe('schema da configuração', () => {
  it('ativo exige provedor e modelo do agente principal; o subagente pode usar o mesmo', () => {
    expect(opexAgentSettingsSchema.safeParse(DEFAULT_OPEX_AGENT_SETTINGS).success).toBe(true)
    const enabled = opexAgentSettingsSchema.safeParse({ ...DEFAULT_OPEX_AGENT_SETTINGS, enabled: true })
    expect(enabled.success).toBe(false)
    expect(enabled.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['main.provider', 'main.model'])
    expect(opexAgentSettingsSchema.safeParse({ ...DEFAULT_OPEX_AGENT_SETTINGS, enabled: true, main: { ...DEFAULT_OPEX_AGENT_SETTINGS.main, provider: 'gemini', model: 'gemini-3' } }).success).toBe(true)
  })

  it('o OpenCode não é aceito (não executa as ferramentas do app)', () => {
    expect(opexAgentSettingsSchema.safeParse({ ...DEFAULT_OPEX_AGENT_SETTINGS, main: { ...DEFAULT_OPEX_AGENT_SETTINGS.main, provider: 'opencode' } }).success).toBe(false)
  })
})
