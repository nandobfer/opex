import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ deleteTechGroup: vi.fn(async () => {}), saveSettings: vi.fn(async (input: { skills: string[] }) => ({ settings: input })) }))

vi.mock('@/features/project-bootstrap/server/catalog', () => ({ deleteTechGroup: mocks.deleteTechGroup, getTechCatalog: vi.fn() }))
vi.mock('@/features/project-bootstrap/server/settings', () => ({
    loadProjectBootstrapSettings: async () => ({ settings: { enabled: true, skills: ['bootstrap-docker'], agent: {}, timeoutMinutes: 60, instructions: '' } }),
    saveProjectBootstrapSettings: mocks.saveSettings,
}))

import { projectBootstrapTools } from '@/features/opex-agent/server/tools/project-bootstrap'
import { OPEX_TOOL_GROUPS, OPEX_TOOL_GROUP_LABELS } from '@/features/opex-agent/constants'

const tool = (name: string) => projectBootstrapTools.find((item) => item.name === name)!

describe('ferramentas do Agente de Bootstrap no Agente Opex', () => {
    it('remover do catálogo é destrutivo; as leituras não pedem confirmação', () => {
        expect(tool('delete_bootstrap_tech_group').risk).toBe('destructive')
        expect(tool('delete_bootstrap_technology').risk).toBe('destructive')
        expect(tool('list_bootstrap_tech_catalog').risk).toBe('read')
        expect(tool('get_project_bootstrap').risk).toBe('read')
    })

    it('não há ferramenta para iniciar, retomar ou cancelar um bootstrap', () => {
        const names = projectBootstrapTools.map((item) => item.name)
        expect(names.filter((name) => /start|retry|cancel|resume|reconnect/.test(name))).toEqual([])
    })

    it('o grupo é registrado com rótulo e a troca de skills grava pela configuração do agente', async () => {
        expect(OPEX_TOOL_GROUPS).toContain('project-bootstrap')
        expect(OPEX_TOOL_GROUP_LABELS['project-bootstrap'].label).toBe('Agente de Bootstrap')
        const result = await tool('set_bootstrap_agent_skills').execute({ skills: ['bootstrap-aicontext'] }, { sessionId: '', actorId: 'local' })
        expect(result).toEqual(['bootstrap-aicontext'])
        expect(mocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, skills: ['bootstrap-aicontext'] }), 'local')
    })
})
