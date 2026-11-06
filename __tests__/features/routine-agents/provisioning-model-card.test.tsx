/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'
import { routineAgentSettingsSchema } from '@/features/routine-agents/schemas'

/**
 * Card "Subagente de provisionamento" da aba Rotineiros (OPE-130). A aba fica dentro do `<form>` do
 * `AiEditorForm`: o card não pode ter `<form>` próprio (aninhado, o HTML o descarta e "Salvar modelo"
 * enviava o formulário de fora, recarregando a página). O seletor de provedor/modelo é simulado.
 */

const mocks = vi.hoisted(() => ({
  saved: { provider: null as string | null, model: '', variant: null as string | null, agent: null as string | null },
  mutateAsync: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/routine-agents/hooks/useRoutineAgents', () => ({
  useRoutineAgentSettings: () => ({ data: mocks.saved, isLoading: false }),
  useSaveRoutineAgentSettings: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiProviderStatuses: () => ({ providers: [] }) }))
vi.mock('@/features/ai/components/shared/ProviderModelCard', () => ({
  ProviderModelCard: ({ form, onProviderChange }: { form: UseFormReturn<{ provider: string | null; model: string }>; onProviderChange: (provider: string) => void }) => {
    const model = useWatch({ control: form.control, name: 'model' })
    const error = form.formState.errors.model?.message
    return (
      <div>
        <button type="button" onClick={() => onProviderChange('anthropic')}>Escolher Anthropic</button>
        <button type="button" onClick={() => form.setValue('model', 'claude-sonnet', { shouldDirty: true, shouldValidate: true })}>Escolher modelo</button>
        <span data-testid="model">{model}</span>
        {error && <p role="alert">{error}</p>}
      </div>
    )
  },
}))

import { RoutineProvisioningModelCard } from '@/features/routine-agents/components/settings/RoutineProvisioningModelCard'

const outerSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())

function renderInsideOuterForm() {
  return render(
    <form onSubmit={outerSubmit} aria-label="AiEditorForm">
      <RoutineProvisioningModelCard />
    </form>,
  )
}

const saveButton = () => screen.getByRole('button', { name: /Salvar modelo/ }) as HTMLButtonElement
const undoButton = () => screen.getByRole('button', { name: /Desfazer/ }) as HTMLButtonElement

beforeEach(() => {
  mocks.saved = { provider: null, model: '', variant: null, agent: null }
  mocks.mutateAsync.mockReset()
  mocks.mutateAsync.mockImplementation(async (values: unknown) => values)
  outerSubmit.mockClear()
})
afterEach(() => cleanup())

describe('RoutineProvisioningModelCard', () => {
  it('regressão: dentro do formulário do AiEditorForm, "Salvar modelo" salva o modelo e não envia o formulário de fora', async () => {
    const { container } = renderInsideOuterForm()
    expect(container.querySelectorAll('form form')).toHaveLength(0)
    expect(saveButton().getAttribute('type')).toBe('button')
    fireEvent.click(screen.getByText('Escolher Anthropic'))
    fireEvent.click(screen.getByText('Escolher modelo'))
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-sonnet', variant: null, agent: null }))
    expect(outerSubmit).not.toHaveBeenCalled()
    await waitFor(() => expect(saveButton().disabled).toBe(true))
  })

  it('sem alteração, Salvar e Desfazer ficam desativados; Desfazer volta ao valor salvo', async () => {
    mocks.saved = { provider: 'anthropic', model: 'claude-haiku', variant: null, agent: null }
    renderInsideOuterForm()
    await waitFor(() => expect(screen.getByTestId('model').textContent).toBe('claude-haiku'))
    expect(saveButton().disabled).toBe(true)
    expect(undoButton().disabled).toBe(true)
    fireEvent.click(screen.getByText('Escolher modelo'))
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())
    await waitFor(() => expect(screen.getByTestId('model').textContent).toBe('claude-haiku'))
    expect(saveButton().disabled).toBe(true)
  })

  it('provedor sem modelo mostra "Escolha o modelo" e não salva', async () => {
    renderInsideOuterForm()
    fireEvent.click(screen.getByText('Escolher Anthropic'))
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Escolha o modelo'))
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
    expect(outerSubmit).not.toHaveBeenCalled()
  })
})

describe('routineAgentSettingsSchema', () => {
  it('com provedor, o modelo é obrigatório; sem provedor, salvar desliga o provisionamento', () => {
    const missing = routineAgentSettingsSchema.safeParse({ provider: 'anthropic', model: '', variant: null, agent: null })
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]).toMatchObject({ path: ['model'], message: 'Escolha o modelo' })
    expect(routineAgentSettingsSchema.safeParse({ provider: null, model: '', variant: null, agent: null }).success).toBe(true)
    expect(routineAgentSettingsSchema.safeParse({ provider: 'anthropic', model: 'claude-sonnet', variant: null, agent: null }).success).toBe(true)
  })
})
