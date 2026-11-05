import { describe, expect, it } from 'vitest'
import { catalogRepoOf, isCatalogProse } from '@/features/routine-agents/memory-cleanup'

/** Seleção da limpeza do catálogo em prosa (critério aprovado OPE-130, D16). */

describe('isCatalogProse', () => {
  it('seleciona catálogo sem chave (título "catalogo: dono/nome" ou JSON com repo)', () => {
    expect(isCatalogProse({ id: 'm1', text: 'catalogo: nandobfer/petify\nApp de pets em Next.js' })).toBe(true)
    expect(isCatalogProse({ id: 'm2', text: '{"repo": "nandobfer/petify.api", "stack": ["NestJS"]}' })).toBe(true)
    expect(isCatalogProse({ id: 'm3', text: 'Resumo do repo', title: 'catalogo: nandobfer/burgos-use-visible-callback' })).toBe(true)
  })

  it('seleciona a prosa gravada pelo Indexador antes da chave (título "dono/nome: …" e texto "Repositório dono/nome")', () => {
    expect(isCatalogProse({ id: 'm7', title: 'nandobfer/petify: app móvel React Native + Expo', text: 'Repositório nandobfer/petify (público): aplicativo…' })).toBe(true)
    expect(isCatalogProse({ id: 'm8', title: null, text: 'Catálogo: nandobfer/petify.api é uma API HTTP em TypeScript' })).toBe(true)
    expect(isCatalogProse({ id: 'm9', title: null, text: 'Repositório público nandobfer/auto_backup (https://github.com/nandobfer/auto_backup)' })).toBe(true)
    expect(isCatalogProse({ id: 'm10', title: null, text: 'O repositório nandobfer/burgos-use-visible-callback é um hook React' })).toBe(true)
  })

  it('não seleciona memória comum, entrada com chave nem arquivada', () => {
    expect(isCatalogProse({ id: 'm4', text: 'O token público só alcança api.github.com' })).toBe(false)
    expect(isCatalogProse({ id: 'm5', text: '{"repo": "nandobfer/petify"}', key: 'catalogo-nandobfer-petify' })).toBe(false)
    expect(isCatalogProse({ id: 'm6', text: 'catalogo: nandobfer/petify', status: 'archived' })).toBe(false)
    expect(isCatalogProse({ id: 'm11', key: 'indexador-estado', title: 'Indexador: estado da execução seq 7', text: 'Estado do Indexador… Catálogo: 35 repositórios' })).toBe(false)
  })

  it('catalogRepoOf extrai o repositório', () => {
    expect(catalogRepoOf({ id: 'm', text: '{"repo": "nandobfer/petify.api"}' })).toBe('nandobfer/petify.api')
    expect(catalogRepoOf({ id: 'm', text: 'catalogo: nandobfer/petify — app' })).toBe('nandobfer/petify')
    expect(catalogRepoOf({ id: 'm', title: 'nandobfer/mov.camera: app', text: 'Repositório nandobfer/mov.camera' })).toBe('nandobfer/mov.camera')
    expect(catalogRepoOf({ id: 'm', text: 'nada' })).toBeNull()
  })
})
