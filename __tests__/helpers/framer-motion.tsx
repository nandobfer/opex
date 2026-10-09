import React from 'react'

/**
 * Mock de `framer-motion` para os testes (padrão do Smart Desk): `motion.*` vira a tag HTML
 * sem as props de animação e `AnimatePresence` só renderiza os filhos.
 *
 * Uso: `vi.mock('framer-motion', () => framerMotionMock())`
 */
const MOTION_PROPS = new Set([
  'initial', 'animate', 'exit', 'variants', 'transition', 'whileTap', 'whileHover', 'whileDrag',
  'layout', 'layoutId', 'drag', 'dragConstraints', 'onAnimationComplete',
])

export function framerMotionMock() {
  const cache: Record<string, React.FC<Record<string, unknown>>> = {}
  const passthrough = (tag: string) =>
    function Motion({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
      const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
      return React.createElement(tag, domProps, children)
    }
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: new Proxy({}, { get: (_, tag: string) => (cache[tag] ??= passthrough(tag)) }),
    useReducedMotion: () => true,
    useMotionValue: (value: unknown) => ({ get: () => value, set: () => {} }),
    animate: () => ({ stop: () => {} }),
  }
}
