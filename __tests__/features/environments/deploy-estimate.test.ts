import { describe, expect, it } from 'vitest'
import { DEPLOY_ESTIMATE_WINDOW, estimateDeployDuration, median, type DeploySample } from '@/features/environments/deploy-estimate'

/** Ambientes: estimativa da duração do deploy pela mediana dos anteriores com sucesso (OPE-202). */

const min = (value: number) => value * 60_000
const deploys = (...minutes: number[]): DeploySample[] => minutes.map((value) => ({ kind: 'deploy', durationMs: min(value) }))
const moves = (...minutes: number[]): DeploySample[] => minutes.map((value) => ({ kind: 'move', durationMs: min(value) }))

describe('median', () => {
  it('ímpar: o do meio; par: a média dos dois do meio; vazio: null', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('estimateDeployDuration', () => {
  it('com 3+ do mesmo tipo usa só o mesmo tipo', () => {
    const estimate = estimateDeployDuration([...moves(20, 20, 20), ...deploys(3, 4, 5)], 'deploy')
    expect(estimate).toEqual({ estimateMs: min(4), sampleSize: 3, basis: 'kind', initial: false })
  })

  it('poucas do mesmo tipo: cai para qualquer tipo do ambiente', () => {
    const estimate = estimateDeployDuration([...deploys(2), ...moves(6, 8, 10)], 'deploy')
    expect(estimate).toEqual({ estimateMs: min(7), sampleSize: 4, basis: 'environment', initial: false })
  })

  it('1 ou 2 deploys com sucesso: estimativa inicial', () => {
    expect(estimateDeployDuration(deploys(4), 'deploy')).toEqual({ estimateMs: min(4), sampleSize: 1, basis: 'environment', initial: true })
    expect(estimateDeployDuration(deploys(4, 6), 'deploy')).toMatchObject({ estimateMs: min(5), sampleSize: 2, initial: true })
  })

  it('sem histórico (ou só durações inválidas): sem estimativa', () => {
    expect(estimateDeployDuration([], 'deploy')).toEqual({ estimateMs: null, sampleSize: 0, basis: null, initial: false })
    expect(estimateDeployDuration([{ kind: 'deploy', durationMs: 0 }, { kind: 'deploy', durationMs: -5 }], 'deploy').estimateMs).toBeNull()
  })

  it('só os 10 mais recentes contam e um outlier não distorce', () => {
    const recent = deploys(3, 3, 3, 3, 120, 3, 3, 3, 3, 3)
    const old = deploys(60, 60, 60, 60, 60)
    const estimate = estimateDeployDuration([...recent, ...old], 'deploy')
    expect(estimate.sampleSize).toBe(DEPLOY_ESTIMATE_WINDOW)
    expect(estimate.estimateMs).toBe(min(3))
  })
})
