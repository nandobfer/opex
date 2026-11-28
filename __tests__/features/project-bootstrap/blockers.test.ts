import { beforeEach, describe, expect, it, vi } from 'vitest'

/** O que bloqueia o envio da etapa 1 (OPE-215): cada motivo isolado, com o caminho para resolver. */

const mocks = vi.hoisted(() => ({
    settings: { enabled: true, agent: { agent: null, model: 'anthropic/claude', variant: null, fallbacks: [] } } as Record<string, unknown>,
    available: { available: true, reason: null as string | null },
    github: { token: 'ghp_x' } as { token?: string } | null,
}))

vi.mock('@/features/ai/server/settings', () => ({
    loadFeature: vi.fn(async (_feature: string, _schema: unknown, defaults: Record<string, unknown>) => ({ settings: { ...defaults, ...mocks.settings }, isDefault: false, updatedAt: null })),
    availability: vi.fn(async () => mocks.available),
    assertCatalog: vi.fn(),
    persistFeature: vi.fn(),
}))
vi.mock('@/lib/integrations/runtime', () => ({ getIntegrationConfig: vi.fn(async () => mocks.github) }))

import { projectBootstrapBlockers } from '@/features/project-bootstrap/server/settings'

beforeEach(() => {
    mocks.settings = { enabled: true, agent: { agent: null, model: 'anthropic/claude', variant: null, fallbacks: [] } }
    mocks.available = { available: true, reason: null }
    mocks.github = { token: 'ghp_x' }
})

describe('projectBootstrapBlockers', () => {
    it('tudo certo: nenhum bloqueio', async () => {
        expect(await projectBootstrapBlockers()).toEqual([])
    })

    it('agente desativado', async () => {
        mocks.settings = { ...mocks.settings, enabled: false }
        expect(await projectBootstrapBlockers()).toEqual([{ message: 'O Agente de Bootstrap está desativado.', href: '/integracoes/ia?aba=agente-bootstrap', action: 'Configurar o Agente de Bootstrap' }])
    })

    it('agente sem modelo', async () => {
        mocks.settings = { ...mocks.settings, agent: { agent: null, model: null, variant: null, fallbacks: [] } }
        expect(await projectBootstrapBlockers()).toEqual([expect.objectContaining({ message: 'O Agente de Bootstrap está sem modelo.', action: 'Escolher o modelo' })])
    })

    it('OpenCode desconectado', async () => {
        mocks.available = { available: false, reason: 'O OpenCode não respondeu.' }
        expect(await projectBootstrapBlockers()).toEqual([{ message: 'O OpenCode não respondeu.', href: '/integracoes/ia/opencode', action: 'Abrir o OpenCode' }])
    })

    it('token do GitHub ausente (ou a integração sem configuração)', async () => {
        mocks.github = { token: '' }
        expect(await projectBootstrapBlockers()).toEqual([{ message: 'O token do GitHub não está configurado.', href: '/integracoes/github', action: 'Configurar o GitHub' }])
        mocks.github = null
        expect(await projectBootstrapBlockers()).toHaveLength(1)
    })
})
