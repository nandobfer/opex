import { describe, expect, it } from 'vitest'
import { MEMORY_CONSUMERS, MEMORY_SUBSCRIPTION_TARGETS, contextChannelsFor, fixedMemoryChannels, isOpexMemoryAgent, listOfChannel, memoryChannelOf, subscriptionTargetsFor, writableListsFor } from '@/features/ai/agents'
import { memoriesSection, memoryCacheNotice } from '@/features/ai/memories-prompt'
import { LEGACY_NAMESPACE } from '@/features/engramind/channel-namespace'

/** OPE-104: listas de memórias ↔ canais do Engramind e o que cada agente lê e grava em cada turno. */

const C = 'a'.repeat(24)
const K = 'b'.repeat(24)
/** Dono antes da migração B (nomes antigos) e as instâncias com o nome do app (OPE-206). */
const L = LEGACY_NAMESPACE
const OWNER = { app: 'opex', prefixed: true }
const ALF = { app: 'alfredopex', prefixed: true }

describe('mapeamento lista ↔ canal', () => {
  it('cada lista tem o canal dela; as com escopo exigem um id válido', () => {
    expect(memoryChannelOf('app-global', {}, L)).toBe('opex')
    expect(memoryChannelOf('opex-owner', {}, L)).toBe('agentes/opex/dono')
    expect(memoryChannelOf('adversarial', {}, L)).toBe('agentes/adversario')
    expect(memoryChannelOf('developer-central', { centralId: C }, L)).toBe(`agentes/desenvolvedor/central/${C}`)
    expect(memoryChannelOf('maddox-client-specific', { clientId: K }, L)).toBe(`agentes/maddox/clientes/${K}`)
    expect(memoryChannelOf('developer-central', {}, L)).toBeNull()
    expect(memoryChannelOf('opex-client-specific', { clientId: 'x' }, L)).toBeNull()
  })

  it('OPE-206: com o nome do app, a raiz vira o app e as listas ganham o app na frente', () => {
    expect(memoryChannelOf('app-global', {}, OWNER)).toBe('opex')
    expect(memoryChannelOf('opex-owner', {}, OWNER)).toBe('opex/agentes/opex/dono')
    expect(memoryChannelOf('app-global', {}, ALF)).toBe('alfredopex')
    expect(memoryChannelOf('developer-central', { centralId: C }, ALF)).toBe(`alfredopex/agentes/desenvolvedor/central/${C}`)
    expect(subscriptionTargetsFor('maddox', ALF)).toEqual(['alfredopex', 'alfredopex/agentes/maddox/*'])
  })

  it('canal → lista (webhook); canal fora do mapeamento é null', () => {
    expect(listOfChannel('opex', L)).toEqual({ agentId: 'app-global' })
    expect(listOfChannel('agentes/maddox/cliente', L)).toEqual({ agentId: 'maddox-client' })
    expect(listOfChannel(`agentes/desenvolvedor/central/${C}`, L)).toEqual({ agentId: 'developer-central', centralId: C })
    expect(listOfChannel(`agentes/opex/clientes/${K}`, L)).toEqual({ agentId: 'opex-client-specific', clientId: K })
    expect(listOfChannel('eng/global', L)).toBeNull()
    expect(listOfChannel('agentes/desenvolvedor/central/nao-e-id', L)).toBeNull()
    expect(listOfChannel(null, L)).toBeNull()
    // OPE-206: o nome real com o app volta à lista; o canal de outra instância fica de fora.
    expect(listOfChannel('alfredopex/agentes/maddox/cliente', ALF)).toEqual({ agentId: 'maddox-client' })
    expect(listOfChannel('agentes/maddox/cliente', ALF)).toBeNull()
    expect(listOfChannel('opex/agentes/maddox/cliente', ALF)).toBeNull()
  })

  it('canais fixos: o "opex" de todos e as listas sem escopo; todo consumidor assina o "opex" (o Mentor só onde grava)', () => {
    expect(fixedMemoryChannels(L).map((item) => item.slug)).toEqual(['opex', 'agentes/opex/global', 'agentes/opex/dono', 'agentes/opex/cliente', 'agentes/maddox/global', 'agentes/maddox/dono', 'agentes/maddox/cliente', 'agentes/adversario', 'agentes/arquiteto', 'agentes/desenvolvedor/global', 'agentes/rotineiros/global', 'agentes/secretario/global'])
    expect(fixedMemoryChannels(ALF).map((item) => item.slug).slice(0, 2)).toEqual(['alfredopex', 'alfredopex/agentes/opex/global'])
    // O Agente Secretário (OPE-192) não assina as Memórias do Opex: só os canais dele.
    for (const consumer of MEMORY_CONSUMERS) if (consumer !== 'secretario') expect(MEMORY_SUBSCRIPTION_TARGETS[consumer][0]).toBe('opex')
    expect(MEMORY_SUBSCRIPTION_TARGETS.secretario).toEqual(['agentes/secretario/*'])
    expect(MEMORY_SUBSCRIPTION_TARGETS.mentor).toEqual(['agentes/adversario', 'agentes/desenvolvedor/*'])
    expect(MEMORY_SUBSCRIPTION_TARGETS.adversario).toEqual(['opex', 'agentes/adversario'])
    expect(MEMORY_SUBSCRIPTION_TARGETS.arquiteto).toEqual(['opex', 'agentes/arquiteto'])
    expect(MEMORY_SUBSCRIPTION_TARGETS.desenvolvedor).toEqual(['opex', 'agentes/desenvolvedor/*'])
  })

  it('agente de memórias do Opex (selo da aba Identidades), só no app da instância', () => {
    expect(isOpexMemoryAgent('opex', 'opex/desenvolvedor', 'opex')).toBe(true)
    expect(isOpexMemoryAgent('opex', 'opex/mentor', 'opex')).toBe(true)
    expect(isOpexMemoryAgent('opex', 'outro', 'opex')).toBe(false)
    expect(isOpexMemoryAgent('crm', 'opex/maddox', 'opex')).toBe(false)
    expect(isOpexMemoryAgent('alfredopex', 'alfredopex/maddox', 'alfredopex')).toBe(true)
    expect(isOpexMemoryAgent('opex', 'opex/maddox', 'alfredopex')).toBe(false)
  })
})

describe('canais do turno', () => {
  it('dono: Memórias do Opex, globais e do dono; portal: globais, do cliente (todos) e as do cliente da sessão', () => {
    expect(contextChannelsFor('opex', { kind: 'owner' }, L)).toEqual(['opex', 'agentes/opex/global', 'agentes/opex/dono'])
    expect(contextChannelsFor('maddox', { kind: 'client', clientId: K }, L)).toEqual(['opex', 'agentes/maddox/global', 'agentes/maddox/cliente', `agentes/maddox/clientes/${K}`])
    expect(contextChannelsFor('opex', { kind: 'owner' }, ALF)).toEqual(['alfredopex', 'alfredopex/agentes/opex/global', 'alfredopex/agentes/opex/dono'])
  })

  it('Adversário lê só a lista dele; desenvolvedor lê as globais e as da central (sem central, só as globais)', () => {
    expect(contextChannelsFor('adversario', { kind: 'review' }, L)).toEqual(['opex', 'agentes/adversario'])
    expect(contextChannelsFor('desenvolvedor', { kind: 'central', centralId: C }, L)).toEqual(['opex', 'agentes/desenvolvedor/global', `agentes/desenvolvedor/central/${C}`])
    expect(contextChannelsFor('desenvolvedor', { kind: 'central', centralId: null }, L)).toEqual(['opex', 'agentes/desenvolvedor/global'])
  })

  it('no portal o agente grava só na lista do cliente da sessão; com o dono, em todas as dele', () => {
    expect(writableListsFor('opex', { kind: 'client', clientId: K })).toEqual(['opex-client-specific'])
    expect(writableListsFor('opex', { kind: 'owner' })).toEqual(['app-global', 'opex-global', 'opex-owner', 'opex-client', 'opex-client-specific'])
    expect(writableListsFor('adversario', { kind: 'review' })).toEqual(['app-global', 'adversarial'])
    expect(writableListsFor('desenvolvedor', { kind: 'central', centralId: C })).toEqual(['app-global', 'developer-global', 'developer-central'])
  })
})

describe('seção das memórias no prompt', () => {
  it('o bloco do Engramind entra sem alteração depois do cabeçalho; vazio não gera seção', () => {
    expect(memoriesSection('- A\n- B')).toBe('\n## Memórias e instruções permanentes\nSiga sempre estas memórias:\n\n- A\n- B')
    expect(memoriesSection('  ')).toBe('')
  })

  it('aviso do turno: cache com a data, ou turno sem memórias', () => {
    expect(memoryCacheNotice({ source: 'live', cachedAt: null })).toBeNull()
    expect(memoryCacheNotice({ source: 'cache', cachedAt: '2026-10-30T12:00:00Z' }, () => '30/10/2026 09:00')).toBe('Memórias carregadas do cache de 30/10/2026 09:00 (Engramind indisponível)')
    expect(memoryCacheNotice({ source: 'none', cachedAt: null })).toBe('Engramind indisponível: turno sem memórias')
  })
})
