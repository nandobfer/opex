import { describe, expect, it } from 'vitest'
import { dockLayout, DELETING_REASON, PENDING_REASON, requestsLabel, workbenchActionItems, type ActionItemsInput } from '@/features/agentic/workbench-action-items'
import { workbenchActions } from '@/features/agentic/logic'
import { workbenchNotices } from '@/features/agentic/workbench-notices'
import { keyboardInset } from '@/features/agentic/hooks/useKeyboardInset'
import { scrollEdges } from '@/features/agentic/components/workbench/WorkbenchTabs'
import type { WorkbenchDto } from '@/features/agentic/types'

const input = (patch: Partial<ActionItemsInput>): ActionItemsInput => ({ actions: [], failed: false, pending: false, prOpen: false, deleting: false, implementBlockReason: null, ...patch })
const ids = (patch: Partial<ActionItemsInput>) => workbenchActionItems(input(patch)).map((item) => item.id)

describe('workbenchActionItems — descritor único da barra (desktop e celular, OPE-166)', () => {
  it('Abrir fork sempre primeiro; prévia e decisões do adversário ficam fora da linha', () => {
    expect(ids({ actions: workbenchActions('preview', 'idle', true) })).toEqual(['fork', 'request-correction', 'approve'])
    expect(ids({ actions: workbenchActions('adversarial_blocked', 'idle', false) })).toEqual(['fork'])
  })

  it('rótulos: correção vira "Voltar ao planejamento" na mesa com falha; aprovar com PR aberto é só "Aprovar"', () => {
    const failed = workbenchActionItems(input({ actions: ['request-correction'], failed: true }))[1]
    expect(failed.label).toBe('Voltar ao planejamento')
    expect(failed.iconOnly).toBe(true)
    expect(workbenchActionItems(input({ actions: ['approve'], prOpen: true }))[1].label).toBe('Aprovar')
    expect(workbenchActionItems(input({ actions: ['approve'] }))[1].label).toBe('Aprovar e abrir PR')
  })

  it('bloqueios em texto: ação em andamento, anexo subindo no Implementar e mesa em exclusão', () => {
    const busy = workbenchActionItems(input({ actions: ['implement', 'revise-plan'], pending: true }))
    expect(busy.map((item) => item.disabledReason)).toEqual([null, PENDING_REASON, PENDING_REASON])
    const uploading = workbenchActionItems(input({ actions: ['implement'], implementBlockReason: 'Aguarde o envio dos anexos' }))[1]
    expect([uploading.disabledReason, uploading.title]).toEqual(['Aguarde o envio dos anexos', 'Aguarde o envio dos anexos'])
    expect(workbenchActionItems(input({ deleting: true }))[0].disabledReason).toBe(DELETING_REASON)
    // Reconectar continua clicável mesmo com outra ação em andamento (tenta na hora).
    expect(workbenchActionItems(input({ actions: ['reconnect'], pending: true }))[1].disabledReason).toBeNull()
  })
})

describe('dockLayout — ação principal do dock do celular (OPE-166)', () => {
  const items = (actions: Parameters<typeof workbenchActions>) => workbenchActionItems(input({ actions: workbenchActions(...actions), failed: actions[1] === 'failed' }))

  it('a ação que leva a mesa adiante é a principal; o resto vai para "Mais ações" sem repetir', () => {
    const plan = dockLayout({ items: items(['plan_review', 'idle', false]), requestCount: 0, adversarialBlocked: false })
    expect(plan.primary).toMatchObject({ type: 'item', item: { id: 'implement' } })
    expect(plan.secondary.map((item) => item.id)).toEqual(['fork', 'revise-plan'])
    expect(dockLayout({ items: items(['preview', 'idle', true]), requestCount: 0, adversarialBlocked: false }).primary).toMatchObject({ item: { id: 'approve' } })
    expect(dockLayout({ items: items(['implementing', 'failed', false]), requestCount: 0, adversarialBlocked: false }).primary).toMatchObject({ item: { id: 'retry' } })
    expect(dockLayout({ items: items(['implementing', 'running', false]), requestCount: 0, adversarialBlocked: false }).primary).toMatchObject({ item: { id: 'interrupt' } })
    expect(dockLayout({ items: items(['done', 'idle', false]), requestCount: 0, adversarialBlocked: false }).primary).toMatchObject({ item: { id: 'reopen' } })
  })

  it('pedido do agente esperando vence tudo; depois a decisão do bloqueio do adversário', () => {
    const running = items(['implementing', 'running', false])
    const requests = dockLayout({ items: running, requestCount: 2, adversarialBlocked: false })
    expect(requests.primary).toEqual({ type: 'requests', count: 2 })
    expect(requests.secondary.map((item) => item.id)).toEqual(['fork', 'interrupt'])
    expect(requestsLabel(1)).toBe('Responder pedido')
    expect(requestsLabel(2)).toBe('Responder pedidos (2)')
    expect(dockLayout({ items: items(['adversarial_blocked', 'idle', false]), requestCount: 0, adversarialBlocked: true }).primary).toEqual({ type: 'adversarial' })
  })

  it('sem ação da etapa (ex.: PR aberto parado) não há botão principal', () => {
    const layout = dockLayout({ items: items(['pr_open', 'idle', false]), requestCount: 0, adversarialBlocked: false })
    expect(layout.primary).toBeNull()
    expect(layout.secondary.map((item) => item.id)).toEqual(['fork'])
  })
})

describe('workbenchNotices — avisos da barra em ordem de importância', () => {
  const base = { stage: 'pr_open', runState: 'idle', error: null, slotQueue: null, buildQueuePosition: null } as unknown as WorkbenchDto

  it('erro primeiro, depois reconexão; o PR acompanhado só com a mesa parada e sem fila', () => {
    const notices = workbenchNotices({ ...base, runState: 'failed', stage: 'implementing', error: 'caiu' }, { failed: true, reconnectNotice: 'Tentando reconectar…' })
    expect(notices.map((notice) => [notice.key, notice.tone])).toEqual([['error', 'error'], ['reconnect-notice', 'muted']])
    expect(workbenchNotices(base, { failed: false, reconnectNotice: null }).map((notice) => notice.key)).toEqual(['watching'])
    expect(workbenchNotices({ ...base, slotQueue: { action: 'implement', position: 2 } } as unknown as WorkbenchDto, { failed: false, reconnectNotice: null }).map((notice) => notice.text)).toEqual([
      expect.stringContaining('posição #2'),
    ])
  })
})

describe('utilitários do celular', () => {
  it('keyboardInset: só conta como teclado acima do limite (a barra de endereço que some não conta)', () => {
    expect(keyboardInset(800, 480)).toBe(320)
    expect(keyboardInset(800, 480, 20)).toBe(300)
    expect(keyboardInset(800, 740)).toBe(0)
  })

  it('scrollEdges: esmaecido no início/fim só quando há abas escondidas daquele lado', () => {
    expect(scrollEdges(0, 300, 300)).toEqual({ start: false, end: false })
    expect(scrollEdges(0, 300, 600)).toEqual({ start: false, end: true })
    expect(scrollEdges(300, 300, 600)).toEqual({ start: true, end: false })
  })
})
