/** Troca de etapa na página do bootstrap: desliza; com movimento reduzido, só aparece (entra sem animação e sai esmaecendo). */
export function stepSwapMotion(reduceMotion: boolean | null) {
    return reduceMotion
        ? { initial: false as const, animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
        : { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -12 }, transition: { duration: 0.2 } }
}
