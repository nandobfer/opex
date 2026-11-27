/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from "../../helpers/framer-motion"
import { apiKeyDto } from "../../helpers/ai-api-keys"

/** OPE-203: diálogo do plano de cobrança da chave — modalidades, validação pelo schema da API e envio. */

const mocks = vi.hoisted(() => ({ save: vi.fn(async (...args: unknown[]) => args) }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAiApiKeys', () => ({ useUpdateAiKeyBilling: () => ({ mutateAsync: mocks.save, isPending: false }) }))

import { ApiKeyBillingDialog, billingDefaults } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/components/api-keys/ApiKeyBillingDialog"

beforeEach(() => mocks.save.mockClear())
afterEach(cleanup)

describe('ApiKeyBillingDialog', () => {
  it('troca de modalidade mostra os campos de cada uma e salva a assinatura', async () => {
    const onOpenChange = vi.fn()
    render(<ApiKeyBillingDialog provider="opencode-go" target={apiKeyDto('key_aaaaaaaaaaaaaaaaaa', 'Go')} open onOpenChange={onOpenChange} />)
    expect(screen.getByText('O custo efetivo é o custo de tabela de cada chamada.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Assinatura' }))
    expect(screen.getByText('Mensalidade *')).toBeTruthy()
    expect(screen.getByText('Dia de renovação *')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Créditos' }))
    expect(screen.getByText('Valor de face (US$) *')).toBeTruthy()
    expect(screen.getByText('Validade')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Assinatura' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar plano' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0]).toEqual({ id: 'key_aaaaaaaaaaaaaaaaaa', billing: expect.objectContaining({ mode: 'subscription', amount: 10, currency: 'USD' }) })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('dia de renovação fora de 1–31 é recusado com a mensagem do schema, sem enviar', async () => {
    render(<ApiKeyBillingDialog provider="deepseek" target={apiKeyDto('key_aaaaaaaaaaaaaaaaaa', 'DS', true, true, { billing: { mode: 'subscription', amount: 10, currency: 'USD', renewalDay: 5, iofPercent: null } })} open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Dia de renovação *'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar plano' }))
    await waitFor(() => expect(screen.getByText('Use um dia de 1 a 31')).toBeTruthy())
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('valores iniciais: mantém o plano salvo da mesma modalidade', () => {
    const saved = { mode: 'credits' as const, faceValueUsd: 50, paidAmount: 10, paidCurrency: 'BRL' as const, startsAt: null, expiresAt: null, exhaustedAt: null }
    expect(billingDefaults('credits', saved)).toBe(saved)
    expect(billingDefaults('usage', saved)).toEqual({ mode: 'usage' })
  })
})
