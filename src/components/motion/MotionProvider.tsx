"use client"

import type { ReactNode } from "react"
import { MotionConfig } from "framer-motion"

/** Todas as animações respeitam `prefers-reduced-motion` do usuário. */
export function MotionProvider({ children }: { children: ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
