/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setWorkbenchModel: vi.fn() }))

const MODELS = [
  { id: 'anthropic/opus', name: 'Claude Opus', group: 'Anthropic', variants: ['low', 'high'] },
  { id: 'openai/gpt-5', name: 'GPT-5', group: 'OpenAI', variants: [] },
]

vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: MODELS, isLoading: false, isError: false, error: null }) }))
/** Busca simplificada: o gatilho, um botão por modelo e o rodapé (o popover real não roda no jsdom). */
vi.mock('@/features/agentic/components/settings/ModelSearchPicker', () => ({
  ModelSearchPicker: ({ trigger, models, onPick, footer }: { trigger: React.ReactElement; models: { data: typeof MODELS }; onPick: (model: (typeof MODELS)[number]) => void; footer?: React.ReactNode }) => (
    <div>
      {trigger}
      {models.data.map((model) => (
        <button key={model.id} type="button" onClick={() => onPick(model)}>
          escolher {model.name}
        </button>
      ))}
      {footer}
    </div>
  ),
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => (
    <select aria-label="Variante" value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="__default__">Padrão do modelo</option>
      <option value="low">low</option>
      <option value="high">high</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useSetWorkbenchModel: () => ({ mutate: mocks.setWorkbenchModel, isPending: false }) }))

import { ModelOverridePicker } from '@/features/agentic/components/workbench/ModelOverridePicker'
import { WorkbenchModelPicker } from '@/features/agentic/components/workbench/WorkbenchModelPicker'
import type { WorkbenchDto } from '@/features/agentic/types'

const onChange = vi.fn()

beforeEach(() => vi.clearAllMocks())

describe('ModelOverridePicker', () => {
  it('mostra o modelo do papel como padrão e troca pelo escolhido (variante zerada)', () => {
    render(<ModelOverridePicker id="m" label="Modelo do Plano" choice={{ model: 'anthropic/opus', variant: 'high', overridden: false }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Modelo do Plano: Claude Opus \(high\) \(padrão\)/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'escolher GPT-5' }))
    expect(onChange).toHaveBeenCalledWith({ model: 'openai/gpt-5', variant: null })
  })

  it('trocado: mostra "(trocado)", troca a variante e volta ao padrão', () => {
    render(<ModelOverridePicker id="m" label="Modelo" choice={{ model: 'anthropic/opus', variant: null, overridden: true }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Modelo: Claude Opus \(trocado\)/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Variante'), { target: { value: 'high' } })
    expect(onChange).toHaveBeenCalledWith({ model: 'anthropic/opus', variant: 'high' })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }))
    expect(onChange).toHaveBeenLastCalledWith({ model: null, variant: null })
  })

  it('escolher o mesmo modelo não envia nada; modelo sem variantes não mostra a variante', () => {
    render(<ModelOverridePicker id="m" label="Modelo" choice={{ model: 'openai/gpt-5', variant: null, overridden: true }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'escolher GPT-5' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Variante')).toBeNull()
  })
})

describe('WorkbenchModelPicker', () => {
  const models = {
    planning: { model: 'anthropic/opus', variant: null, overridden: false },
    implementation: { model: 'openai/gpt-5', variant: null, overridden: true },
    build: { model: null, variant: null, overridden: false },
    pr: { model: null, variant: null, overridden: false },
  }
  const workbench = (patch: Partial<WorkbenchDto>) => ({ id: 'w1', taskId: 't1', stage: 'plan_review', runState: 'idle', models, ...patch }) as WorkbenchDto

  it('troca o modelo do papel da etapa atual (Mudanças pedidas = Plano)', () => {
    render(<WorkbenchModelPicker workbench={workbench({ stage: 'changes_requested' })} />)
    expect(screen.getByRole('button', { name: /Modelo do Plano: Claude Opus/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'escolher GPT-5' }))
    expect(mocks.setWorkbenchModel).toHaveBeenCalledWith({ role: 'planning', model: 'openai/gpt-5', variant: null })
  })

  it('com o agente respondendo continua disponível (vale no próximo turno)', () => {
    render(<WorkbenchModelPicker workbench={workbench({ stage: 'implementing', runState: 'running' })} />)
    const trigger = screen.getByRole('button', { name: /Modelo da Implementação: GPT-5 \(trocado\)/ }) as HTMLButtonElement
    expect(trigger.disabled).toBe(false)
  })

  it('oculto em Concluída e sem os modelos da central', () => {
    const { container, unmount } = render(<WorkbenchModelPicker workbench={workbench({ stage: 'done' })} />)
    expect(container.innerHTML).toBe('')
    unmount()
    const other = render(<WorkbenchModelPicker workbench={workbench({ models: null })} />)
    expect(other.container.innerHTML).toBe('')
  })
})
