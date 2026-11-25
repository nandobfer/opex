/** Marca da legenda no desenho do Console: barrinha vertical cheia (séries) ou pontilhada (teto mensal). */
export function LegendBar({ color, dotted = false }: { color: string; dotted?: boolean }) {
    if (dotted) {
        return (
            <span className="inline-flex h-3 w-[3px] shrink-0 flex-col justify-between" aria-hidden>
                {[0, 1, 2].map((index) => (
                    <span key={index} className="block h-[2px] w-[3px] rounded-full" style={{ backgroundColor: color }} />
                ))}
            </span>
        )
    }
    return <span className="inline-block h-3 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
}
