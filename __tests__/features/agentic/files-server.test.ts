import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

/**
 * Anexos da mesa no servidor (MT-21): envio em duas fases no Storage S3 (em memória), vínculo à mesa,
 * montagem dos anexos do prompt (conteúdo + links) e limpeza. Banco e storage falsos.
 */

const store = vi.hoisted(() => ({ files: null as unknown, s3: null as unknown }))
vi.mock('@/lib/storage/s3', async () => (store.s3 = (await import('../../helpers/s3-memory')).s3Memory()))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/db/models/Agentic', () => {
  store.files = memoryModel()
  return { AgenticFile: store.files }
})

import {
  claimAgenticFiles,
  cleanupPendingAgenticFiles,
  completeAgenticFile,
  deletePendingAgenticFile,
  deleteWorkbenchFiles,
  loadClaimableFiles,
  promptFilesFor,
  reserveAgenticFile,
} from '@/features/agentic/server/files'
import type { S3Memory } from '../../helpers/s3-memory'

type Model = ReturnType<typeof memoryModel>
const files = () => store.files as Model
const s3 = () => store.s3 as S3Memory
const WORKBENCH = 'b'.repeat(24)
const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname.replace('/bucket/', ''))

/** Fluxo do navegador: reserva → PUT na URL assinada → confirmação. */
async function upload(name: string, type: string, content: string | Uint8Array = 'conteúdo') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const reservation = await reserveAgenticFile({ name, size: bytes.byteLength, mediaType: type })
  s3().put(keyOf(reservation.url), bytes, type)
  return completeAgenticFile(reservation.id)
}

beforeEach(() => {
  files().docs.length = 0
  s3().reset()
})

describe('envio em duas fases', () => {
  it('reserva, confirma e promove para a chave definitiva', async () => {
    const dto = await upload('tela.png', 'image/png')
    expect(dto).toMatchObject({ name: 'tela.png', kind: 'image', url: `/api/agentic/files/${dto.id}` })
    expect([...s3().objects.keys()]).toEqual([`agentic/files/${dto.id}/tela.png`])
    expect(files().docs[0]).toMatchObject({ ready: true, workbenchId: null, uploadKey: null })
  })

  it('acima de 100 MB recusa já na reserva', async () => {
    await expect(reserveAgenticFile({ name: 'big.bin', size: 101 * 1024 * 1024 })).rejects.toMatchObject({ status: 413, code: 'AGENTIC_FILE_TOO_LARGE' })
  })

  it('confirmação sem o PUT descarta a reserva; storage indisponível preserva', async () => {
    const lost = await reserveAgenticFile({ name: 'a.txt', size: 3, mediaType: 'text/plain' })
    await expect(completeAgenticFile(lost.id)).rejects.toMatchObject({ status: 400, code: 'AGENTIC_FILE_NOT_UPLOADED' })
    expect(files().docs).toHaveLength(0)

    const kept = await reserveAgenticFile({ name: 'b.txt', size: 3, mediaType: 'text/plain' })
    s3().fail.head = Object.assign(new Error('timeout'), { $metadata: { httpStatusCode: 503 } })
    await expect(completeAgenticFile(kept.id)).rejects.toMatchObject({ status: 502 })
    expect(files().docs).toHaveLength(1)
  })

  it('arquivo já enviado numa mensagem não pode mais ser removido pelo chip', async () => {
    const dto = await upload('a.txt', 'text/plain')
    await claimAgenticFiles([{ id: dto.id, name: dto.name, mediaType: dto.mediaType, size: dto.size }], { workbenchId: WORKBENCH })
    await expect(deletePendingAgenticFile(dto.id)).rejects.toMatchObject({ status: 409 })
  })
})

describe('vínculo à mesa', () => {
  it('aceita só confirmados, sem dono ou desta mesa; recusa os demais', async () => {
    const ok = await upload('a.txt', 'text/plain')
    const refs = await loadClaimableFiles([ok.id], WORKBENCH)
    expect(refs).toEqual([{ id: ok.id, name: 'a.txt', mediaType: 'text/plain', size: ok.size }])
    await claimAgenticFiles(refs, { workbenchId: WORKBENCH, forkId: 'f1' })
    expect(files().docs[0]).toMatchObject({ workbenchId: WORKBENCH, forkId: 'f1' })
    // Retomada da mesma mesa (ex.: espera por vaga) continua aceitando; outra mesa não.
    expect(await loadClaimableFiles([ok.id], WORKBENCH)).toHaveLength(1)
    await expect(loadClaimableFiles([ok.id], 'c'.repeat(24))).rejects.toMatchObject({ status: 400, code: 'AGENTIC_FILE_NOT_FOUND' })

    const pending = await reserveAgenticFile({ name: 'p.txt', size: 3 })
    await expect(loadClaimableFiles([pending.id], WORKBENCH)).rejects.toMatchObject({ status: 400 })
    await expect(loadClaimableFiles(['x'], WORKBENCH)).rejects.toMatchObject({ status: 400 })
    await expect(loadClaimableFiles(Array.from({ length: 11 }, (_, i) => String(i).padStart(24, 'a')), WORKBENCH)).rejects.toMatchObject({ code: 'AGENTIC_TOO_MANY_FILES' })
  })

  it('sem anexos, nada a conferir', async () => {
    expect(await loadClaimableFiles(undefined, null)).toEqual([])
  })
})

describe('anexos do prompt', () => {
  it('imagem e texto vão como data: URI; zip só pelo link; todos na seção com link de 24 h', async () => {
    const image = await upload('tela.png', 'image/png', new Uint8Array([1, 2, 3]))
    const text = await upload('nota.md', 'text/markdown', '# oi')
    const zip = await upload('dados.zip', 'application/zip', 'PK')
    const { files: attached, section } = await promptFilesFor([image.id, text.id, zip.id], { downloadDir: '/tmp/opex-anexos/MT-21' })
    expect(attached).toEqual([
      { name: 'tela.png', uri: 'data:image/png;base64,AQID' },
      { name: 'nota.md', uri: `data:text/markdown;base64,${Buffer.from('# oi').toString('base64')}` },
    ])
    expect(section).toContain('`dados.zip`')
    expect(section).toContain('não vai anexado')
    expect(section).toContain('X-Amz-Expires=86400')
    expect(section).toContain('/tmp/opex-anexos/MT-21')
  })

  it('melhor esforço: storage fora no download deixa o arquivo só com o link', async () => {
    const image = await upload('tela.png', 'image/png', new Uint8Array([1]))
    s3().fail.get = Object.assign(new Error('fora'), { $metadata: { httpStatusCode: 503 } })
    const { files: attached, section } = await promptFilesFor([image.id], { downloadDir: '/tmp/x' })
    expect(attached).toEqual([])
    expect(section).toContain('`tela.png`')
  })

  it('sem ids, sem seção', async () => {
    expect(await promptFilesFor([], { downloadDir: '/tmp/x' })).toEqual({ files: [], section: '' })
  })
})

describe('limpeza', () => {
  it('apaga os anexos da mesa e os pendentes com mais de 24 h (mantém os recentes)', async () => {
    const used = await upload('a.txt', 'text/plain')
    await claimAgenticFiles([{ id: used.id, name: 'a.txt', mediaType: 'text/plain', size: used.size }], { workbenchId: WORKBENCH })
    const fresh = await upload('b.txt', 'text/plain')
    const stale = await upload('c.txt', 'text/plain')
    const staleDoc = files().docs.find((doc) => String(doc._id) === stale.id)!
    staleDoc.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000)

    expect(await cleanupPendingAgenticFiles()).toEqual({ removed: 1, failed: 0 })
    await deleteWorkbenchFiles(WORKBENCH)
    expect(files().docs.map((doc) => String(doc._id))).toEqual([fresh.id])
    expect([...s3().objects.keys()]).toEqual([`agentic/files/${fresh.id}/b.txt`])
  })
})
