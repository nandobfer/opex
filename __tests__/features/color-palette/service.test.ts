import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { memoryModel } from '../../helpers/memory-model'

const store = vi.hoisted(() => ({ model: null as unknown, publish: vi.fn(), audit: vi.fn() }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: store.audit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/db/models/ColorPalette', async () => {
  const { memoryModel: make } = await import('../../helpers/memory-model')
  store.model = make()
  return { ColorPalette: store.model }
})
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: store.publish }))

import { addFavoriteColor, getColorPalette, removeFavoriteColor, updateFavoriteColor } from '@/features/color-palette/server/service'
import { addFavoriteColorSchema } from '@/features/color-palette/schemas'
import { COLOR_FAVORITES_MAX } from '@/features/color-palette/constants'

const docs = () => (store.model as ReturnType<typeof memoryModel>).docs

beforeEach(() => {
  docs().splice(0)
  store.publish.mockReset()
  store.audit.mockReset()
})

describe('cores favoritas', () => {
  it('mutações em paralelo não se perdem (fila em memória serializa ler → gravar)', async () => {
    await Promise.all([
      addFavoriteColor({ color: '#111111', name: null }, 'local'),
      addFavoriteColor({ color: '#222222', name: null }, 'local'),
      addFavoriteColor({ color: '#333333', name: null }, 'local'),
    ])
    const colors = (await getColorPalette()).favorites.map((item) => item.color)
    expect(colors.slice(-3)).toEqual(['#111111', '#222222', '#333333'])
    expect(colors).toHaveLength(13)
  })

  it('uma mutação recusada não trava a fila das seguintes', async () => {
    const results = await Promise.allSettled([
      addFavoriteColor({ color: '#38BDF8', name: null }, 'local'),
      removeFavoriteColor('#38BDF8', 'local'),
    ])
    expect(results[0]!.status).toBe('rejected')
    expect(results[1]!.status).toBe('fulfilled')
    expect((await getColorPalette()).favorites.some((item) => item.color === '#38BDF8')).toBe(false)
  })

  it('editar sem `name` mantém o nome atual; `null` limpa', async () => {
    await updateFavoriteColor('#A78BFA', { color: '#8B5CF6' }, 'local')
    expect((await getColorPalette()).favorites[0]).toEqual({ color: '#8B5CF6', name: 'Violeta' })
    await updateFavoriteColor('#8B5CF6', { color: '#8B5CF6', name: null }, 'local')
    expect((await getColorPalette()).favorites[0]).toEqual({ color: '#8B5CF6', name: null })
  })

  it('sem nada salvo, devolve as padrão (nomeadas)', async () => {
    const { favorites } = await getColorPalette()
    expect(favorites).toHaveLength(10)
    expect(favorites[1]).toEqual({ color: '#38BDF8', name: 'Azul' })
  })

  it('adiciona no fim, audita e avisa as abas depois de gravar', async () => {
    const result = await addFavoriteColor({ color: '#8000FF', name: 'Roxo Opex' }, 'local')
    expect(result.favorites.at(-1)).toEqual({ color: '#8000FF', name: 'Roxo Opex' })
    expect(result.favorites).toHaveLength(11)
    expect(store.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'CoresFavoritas', acao: 'ATUALIZAR' }))
    expect(store.publish).toHaveBeenCalledWith('color-palette-updated', { color: '#8000FF', action: 'added' })
    await expect(getColorPalette()).resolves.toEqual(result)
  })

  it('não repete a mesma cor (409)', async () => {
    await expect(addFavoriteColor({ color: '#A78BFA', name: null }, 'local')).rejects.toMatchObject({ status: 409 })
    expect(store.publish).not.toHaveBeenCalled()
  })

  it('respeita o limite de favoritas', async () => {
    docs().push({ key: 'favorites', colors: Array.from({ length: COLOR_FAVORITES_MAX }, (_, i) => ({ color: `#0000${i.toString(16).padStart(2, '0').toUpperCase()}`, name: null })) })
    await expect(addFavoriteColor({ color: '#FFFFFF', name: null }, 'local')).rejects.toMatchObject({ status: 409 })
  })

  it('remove; a lista vazia continua vazia (não volta às padrão); inexistente dá 404', async () => {
    docs().push({ key: 'favorites', colors: [{ color: '#8000FF', name: null }] })
    const result = await removeFavoriteColor('#8000FF', 'local')
    expect(result.favorites).toEqual([])
    expect(store.publish).toHaveBeenCalledWith('color-palette-updated', { color: '#8000FF', action: 'removed' })
    await expect(getColorPalette()).resolves.toEqual({ favorites: [] })
    await expect(removeFavoriteColor('#8000FF', 'local')).rejects.toMatchObject({ status: 404 })
  })

  it('valida o corpo: hex obrigatório, nome opcional', () => {
    expect(addFavoriteColorSchema.parse({ color: '#8000ff' })).toEqual({ color: '#8000FF', name: null })
    expect(addFavoriteColorSchema.parse({ color: '#8000FF', name: '  ' })).toEqual({ color: '#8000FF', name: null })
    expect(addFavoriteColorSchema.safeParse({ color: 'roxo' }).success).toBe(false)
  })

  describe('editar', () => {
    beforeEach(() => {
      docs().push({ key: 'favorites', colors: [{ color: '#A78BFA', name: 'Violeta' }, { color: '#38BDF8', name: 'Azul' }, { color: '#34D399', name: 'Verde' }] })
    })

    it('renomeia mantendo cor e posição, audita e avisa com a cor anterior', async () => {
      const result = await updateFavoriteColor('#38BDF8', { color: '#38BDF8', name: 'Céu' }, 'local')
      expect(result.favorites.map((item) => item.name)).toEqual(['Violeta', 'Céu', 'Verde'])
      expect(store.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'CoresFavoritas', acao: 'ATUALIZAR' }))
      expect(store.publish).toHaveBeenCalledWith('color-palette-updated', { color: '#38BDF8', previousColor: '#38BDF8', action: 'updated' })
      await expect(getColorPalette()).resolves.toEqual(result)
    })

    it('troca a cor na mesma posição', async () => {
      const result = await updateFavoriteColor('#38BDF8', { color: '#0369A1', name: 'Azul escuro' }, 'local')
      expect(result.favorites[1]).toEqual({ color: '#0369A1', name: 'Azul escuro' })
      expect(result.favorites).toHaveLength(3)
      expect(store.publish).toHaveBeenCalledWith('color-palette-updated', { color: '#0369A1', previousColor: '#38BDF8', action: 'updated' })
    })

    it('cor de outra favorita dá 409; favorita inexistente dá 404', async () => {
      await expect(updateFavoriteColor('#38BDF8', { color: '#34D399', name: null }, 'local')).rejects.toMatchObject({ status: 409 })
      await expect(updateFavoriteColor('#FFFFFF', { color: '#FFFFFF', name: null }, 'local')).rejects.toMatchObject({ status: 404 })
      expect(store.publish).not.toHaveBeenCalled()
    })

    it('sem mudança não grava, não audita nem publica', async () => {
      const result = await updateFavoriteColor('#A78BFA', { color: '#A78BFA', name: 'Violeta' }, 'local')
      expect(result.favorites).toHaveLength(3)
      expect(store.audit).not.toHaveBeenCalled()
      expect(store.publish).not.toHaveBeenCalled()
    })
  })
})
