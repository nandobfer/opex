import { describe, expect, it } from 'vitest'
import { agenticDownloadDir, agenticFileDelivery, attachmentsPromptSection, pickAttachedFiles, withAttachmentsSection } from '@/features/agentic/files'
import { fileIdsSchema, feedbackSchema, optionalFeedbackSchema } from '@/features/agentic/schemas'

/** Anexos da mesa (MT-21): regras puras de entrega ao agente, seção do prompt e contrato das ações. */

const MB = 1024 * 1024

describe('entrega dos anexos ao agente', () => {
  it('imagem, PDF e texto até 20 MB vão anexados; o resto (ou maior) só pelo link', () => {
    expect(agenticFileDelivery('image', 2 * MB)).toBe('attached')
    expect(agenticFileDelivery('pdf', 20 * MB)).toBe('attached')
    expect(agenticFileDelivery('text', 1000)).toBe('attached')
    expect(agenticFileDelivery('pdf', 20 * MB + 1)).toBe('link')
    expect(agenticFileDelivery('other', 10)).toBe('link')
    expect(agenticFileDelivery('video', 10)).toBe('link')
    expect(agenticFileDelivery('image', 0)).toBe('link')
  })

  it('respeita o teto da soma: o que passa de 50 MB fica só com o link', () => {
    const files = [
      { name: 'a', kind: 'pdf' as const, size: 20 * MB },
      { name: 'b', kind: 'other' as const, size: 1 },
      { name: 'c', kind: 'pdf' as const, size: 20 * MB },
      { name: 'd', kind: 'image' as const, size: 15 * MB },
      { name: 'e', kind: 'text' as const, size: 5 * MB },
    ]
    expect([...pickAttachedFiles(files)].map((file) => file.name)).toEqual(['a', 'c', 'e'])
  })
})

describe('seção do prompt', () => {
  it('lista cada arquivo com o link e manda baixar fora do worktree', () => {
    const section = attachmentsPromptSection(
      [
        { name: 'tela.png', mediaType: 'image/png', size: 2048, kind: 'image', attached: true, url: 'https://s3/x?sig' },
        { name: 'dados.zip', mediaType: 'application/zip', size: 4096, kind: 'other', attached: false, url: null },
      ],
      agenticDownloadDir('MT-21'),
    )
    expect(section).toContain('## Arquivos anexados pelo usuário')
    expect(section).toContain('`tela.png` (imagem, image/png')
    expect(section).toContain('já vai anexado a esta mensagem; link: https://s3/x?sig')
    expect(section).toContain('`dados.zip`')
    expect(section).toContain('link indisponível')
    expect(section).toContain('/tmp/opex-anexos/MT-21')
    expect(section).toContain('Nunca copie esses arquivos para o repositório')
  })

  it('sem anexos, o texto do prompt não muda', () => {
    expect(attachmentsPromptSection([], '/tmp/x')).toBe('')
    expect(withAttachmentsSection('prompt', '')).toBe('prompt')
    expect(withAttachmentsSection('prompt', 'S')).toBe('prompt\n\nS')
  })

  it('pasta de download por mesa e por fork, sem caracteres de caminho', () => {
    expect(agenticDownloadDir('MT-21', 2)).toBe('/tmp/opex-anexos/MT-21/fork-2')
    expect(agenticDownloadDir('../x y')).toBe('/tmp/opex-anexos/..-x-y')
  })
})

describe('contrato das ações com anexos', () => {
  it('aceita até 10 ids válidos; recusa id inválido e excesso', () => {
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    expect(feedbackSchema.parse({ text: 'Mude isso', fileIds: [id] }).fileIds).toEqual([id])
    expect(optionalFeedbackSchema.parse({}).fileIds).toBeUndefined()
    expect(fileIdsSchema.safeParse(['x']).success).toBe(false)
    expect(fileIdsSchema.safeParse(Array.from({ length: 11 }, () => id)).success).toBe(false)
  })

  it('o texto continua obrigatório nas correções mesmo com anexos', () => {
    expect(feedbackSchema.safeParse({ text: '', fileIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'] }).success).toBe(false)
  })
})
