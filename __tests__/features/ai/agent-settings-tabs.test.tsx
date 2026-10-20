/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Brain, Settings2, Wrench } from 'lucide-react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { AgentSettingsTabs } from '@/features/ai/components/AgentSettingsTabs'

type Section = 'geral' | 'ferramentas' | 'memorias'
const TABS = [
    { id: 'geral' as const, label: 'Geral', icon: Settings2 },
    { id: 'ferramentas' as const, label: 'Ferramentas', icon: Wrench },
    { id: 'memorias' as const, label: 'Memórias', icon: Brain },
]

/** Rascunho acima das seções, como nas abas dos agentes. */
function Harness() {
    const [draft, setDraft] = useState('')
    return (
        <AgentSettingsTabs<Section> tabs={TABS} fallback='geral' label='Seções do agente'>
            {(section, go) => (
                <>
                    {section === 'geral' && <input aria-label='Instruções' value={draft} onChange={(event) => setDraft(event.target.value)} />}
                    {section === 'ferramentas' && (
                        <button type='button' onClick={() => go('geral')}>
                            Salvar ({draft})
                        </button>
                    )}
                    {section === 'memorias' && <p>Lista de memórias</p>}
                </>
            )}
        </AgentSettingsTabs>
    )
}

afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/integracoes/ia?aba=agente-opex')
})

describe('seções da configuração de um agente', () => {
    it('troca de seção pela URL (?secao=) sem pedir descarte e mantém o rascunho', () => {
        window.history.replaceState(null, '', '/integracoes/ia?aba=agente-opex')
        render(<Harness />)
        expect(screen.getByRole('tab', { name: 'Geral' }).getAttribute('aria-selected')).toBe('true')
        fireEvent.change(screen.getByLabelText('Instruções'), { target: { value: 'novo' } })
        fireEvent.click(screen.getByRole('tab', { name: 'Ferramentas' }))
        expect(window.location.search).toBe('?aba=agente-opex&secao=ferramentas')
        expect(screen.queryByText('Descartar alterações?')).toBeNull()
        expect(screen.getByRole('button', { name: 'Salvar (novo)' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Salvar (novo)' }))
        expect(window.location.search).toBe('?aba=agente-opex')
        expect((screen.getByLabelText('Instruções') as HTMLInputElement).value).toBe('novo')
    })

    it('abre na seção pedida na URL; seção desconhecida cai na padrão', () => {
        window.history.replaceState(null, '', '/integracoes/ia?aba=agente-opex&secao=memorias')
        render(<Harness />)
        expect(screen.getByText('Lista de memórias')).toBeTruthy()
        cleanup()
        window.history.replaceState(null, '', '/integracoes/ia?aba=agente-opex&secao=roteiro')
        render(<Harness />)
        expect(screen.getByLabelText('Instruções')).toBeTruthy()
    })
})
