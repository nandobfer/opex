/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Ponto de estado do card (OPE-211): pulso animado só sem movimento reduzido. */
const motionState = vi.hoisted(() => ({ reduce: false, recorded: [] as { tag: string; props: Record<string, unknown> }[] }))
vi.mock('framer-motion', () => {
  const base = framerMotionMock()
  const recording = new Proxy(
    {},
    {
      get: (_, tag: string) =>
        function Motion(props: Record<string, unknown>) {
          motionState.recorded.push({ tag, props })
          const rest = { ...props }
          delete rest.animate
          delete rest.initial
          delete rest.transition
          const Inner = (base.motion as Record<string, React.FC<Record<string, unknown>>>)[tag]!
          return <Inner {...rest} />
        },
    },
  )
  return { ...base, motion: recording, useReducedMotion: () => motionState.reduce }
})

import { EnvironmentStateDot, StateDot } from '@/features/environments/components/card/EnvironmentStateDot'

const pulses = () => motionState.recorded.filter((item) => item.tag === 'span')

afterEach(() => {
  cleanup()
  motionState.recorded = []
})

describe('StateDot', () => {
  it('sem movimento reduzido: o ponto no ar pulsa (props da animação em loop)', () => {
    motionState.reduce = false
    render(<EnvironmentStateDot health="running" deploying={false} />)
    expect(pulses()).toHaveLength(1)
    const { animate, transition } = pulses()[0]!.props as { animate: { opacity: number; scale: number }; transition: { repeat: number; duration: number } }
    expect(animate).toEqual({ opacity: 0, scale: 2.2 })
    expect(transition.repeat).toBe(Infinity)
    expect(transition.duration).toBeGreaterThan(0)
  })

  it('implantando também pulsa; parado e nunca implantado não', () => {
    motionState.reduce = false
    render(<StateDot state="deploying" />)
    expect(pulses()).toHaveLength(1)
    motionState.recorded = []
    cleanup()
    render(
      <>
        <StateDot state="stopped" />
        <StateDot state="never" />
        <StateDot state="partial" />
      </>,
    )
    expect(pulses()).toHaveLength(0)
  })

  it('regressão (F6): com movimento reduzido, nenhum pulso (o ponto fica parado)', () => {
    motionState.reduce = true
    const { container } = render(<EnvironmentStateDot health="running" deploying={false} />)
    expect(pulses()).toHaveLength(0)
    expect(container.querySelectorAll('.bg-success')).toHaveLength(1)
  })
})
