import { describe, expect, it } from 'vitest'
import { chatDisabledReason, chatRailStatus, routineChatInstructions, runDisabledReason } from '@/features/routine-agents/chat'

/** Regras puras da conversa com um agente rotineiro (OPE-160). */

const AGENT = { status: 'active', provisioning: { status: 'ok' as const }, engine: 'opex', opex: { provider: 'openai' } }

describe('prompt de sistema da conversa', () => {
  it('leva só as memórias, o catálogo das skills e os nomes dos segredos', () => {
    const text = routineChatInstructions({
      memoryBlock: '## Memórias\n- Fato',
      skillsBlock: '## Skills disponíveis\n- revisar: Use ao revisar',
      secrets: [{ name: 'API_KEY', description: 'Chave', allowedHosts: ['api.example.com'] }],
    })
    expect(text).toContain('- Fato')
    expect(text).toContain('- revisar: Use ao revisar')
    expect(text).toContain('- API_KEY — Chave (só em api.example.com)')
    for (const banned of ['Objetivo', 'Como trabalhar', 'finish', 'hibernate', 'request_confirmation', 'Você é']) expect(text).not.toContain(banned)
  })

  it('sem memórias, skills nem segredos, o prompt fica vazio (só o que o dono digitar)', () => {
    expect(routineChatInstructions({ memoryBlock: '  ', skillsBlock: '', secrets: null })).toBe('')
  })
})

describe('disponibilidade', () => {
  it('mesmo tratamento do "Executar agora" e só no motor Opex', () => {
    expect(chatDisabledReason(AGENT)).toBeNull()
    expect(chatDisabledReason({ ...AGENT, status: 'paused' })).toBe('Retome o agente para conversar')
    expect(chatDisabledReason({ ...AGENT, provisioning: { status: 'running' } })).toBe('Provisionando')
    expect(chatDisabledReason({ ...AGENT, engine: 'opencode' })).toMatch(/só no motor Opex/)
    expect(chatDisabledReason({ ...AGENT, opex: { provider: null } })).toMatch(/OpenCode/)
    expect(runDisabledReason({ ...AGENT, engine: 'opencode' })).toBeNull()
  })
})

describe('situação da conversa recolhida', () => {
  const sessions = [
    { id: 'a', status: 'idle' as const },
    { id: 'b', status: 'error' as const },
  ]
  it('confirmação pendente vence, depois respondendo; erro só o da sessão ativa', () => {
    expect(chatRailStatus(sessions, 'a')).toBe('idle')
    expect(chatRailStatus(sessions, 'b')).toBe('error')
    expect(chatRailStatus([...sessions, { id: 'c', status: 'running' }], 'b')).toBe('running')
    expect(chatRailStatus([...sessions, { id: 'c', status: 'running' }, { id: 'd', status: 'awaiting_confirmation' }], 'a')).toBe('awaiting_confirmation')
  })
})
