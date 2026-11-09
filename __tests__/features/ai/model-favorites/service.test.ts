import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { memoryModel } from '../../../helpers/memory-model'

const store = vi.hoisted(() => ({ model: null as unknown, publish: vi.fn(), audit: vi.fn() }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: store.audit, AcaoAuditoria: { CRIAR: 'CRIAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/db/models/AiModelFavorite', async () => {
  const { memoryModel: make } = await import('../../../helpers/memory-model')
  store.model = make()
  return { AiModelFavorite: store.model }
})
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: store.publish }))

import { addModelFavorite, listModelFavorites, removeModelFavorite } from '@/features/ai/model-favorites/server/service'

const model = () => store.model as ReturnType<typeof memoryModel>

beforeEach(() => {
  model().docs.splice(0)
  store.publish.mockReset()
  store.audit.mockReset()
})

describe('modelos favoritos (serviço)', () => {
  it('favorita, lista por usuário em ordem de criação e publica o evento com payload mínimo', async () => {
    await addModelFavorite({ provider: 'opencode', model: 'anthropic/opus' }, 'local')
    const result = await addModelFavorite({ provider: 'gemini', model: 'gemini-2.5-flash' }, 'local')
    await addModelFavorite({ provider: 'gemini', model: 'gemini-2.5-pro' }, 'outro')
    expect(result.favorites).toEqual([
      { provider: 'opencode', model: 'anthropic/opus' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
    ])
    expect(store.publish).toHaveBeenCalledWith('ai-model-favorites-updated', { provider: 'opencode', model: 'anthropic/opus', action: 'added' })
    expect(store.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'local', entidade: 'ModelosFavoritos', acao: 'CRIAR', entidadeId: 'opencode:anthropic/opus' }))
  })

  it('favoritar duas vezes é idempotente: um registro, uma auditoria e um evento', async () => {
    await addModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    const again = await addModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    expect(again.favorites).toEqual([{ provider: 'gemini', model: 'flash' }])
    expect(model().docs).toHaveLength(1)
    expect(store.audit).toHaveBeenCalledTimes(1)
    expect(store.publish).toHaveBeenCalledTimes(1)
  })

  it('o mesmo id em provedores diferentes são favoritos distintos', async () => {
    await addModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    await addModelFavorite({ provider: 'opencode', model: 'flash' }, 'local')
    const after = await removeModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    expect(after.favorites).toEqual([{ provider: 'opencode', model: 'flash' }])
  })

  it('remover favorito inexistente devolve a lista sem auditar nem publicar', async () => {
    await addModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    store.audit.mockReset()
    store.publish.mockReset()
    const result = await removeModelFavorite({ provider: 'gemini', model: 'nao-existe' }, 'local')
    expect(result.favorites).toEqual([{ provider: 'gemini', model: 'flash' }])
    expect(store.audit).not.toHaveBeenCalled()
    expect(store.publish).not.toHaveBeenCalled()
  })

  it('remover registra a auditoria e publica "removed"', async () => {
    await addModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    const result = await removeModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    expect(result.favorites).toEqual([])
    expect(store.audit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'EXCLUIR', antes: { provider: 'gemini', model: 'flash' } }))
    expect(store.publish).toHaveBeenLastCalledWith('ai-model-favorites-updated', { provider: 'gemini', model: 'flash', action: 'removed' })
    expect(await listModelFavorites('local')).toEqual({ favorites: [] })
  })

  it('corrida no índice único (E11000) conta como já favoritado', async () => {
    const create = vi.spyOn(model(), 'create').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
    const result = await addModelFavorite({ provider: 'gemini', model: 'flash' }, 'local')
    expect(result.favorites).toEqual([])
    expect(store.publish).not.toHaveBeenCalled()
    create.mockRestore()
  })
})
