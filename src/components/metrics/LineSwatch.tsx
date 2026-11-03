/** Amostra do traço da série (mesma cor e mesmo tracejado da linha), na legenda e no tooltip. */
export function LineSwatch({ color, dash }: { color: string; dash: string | undefined }) {
    return (
        <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0" aria-hidden data-swatch-color={color} data-swatch-dash={dash ?? ""}>
            <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
            <circle cx="8" cy="4" r="2" fill={color} />
        </svg>
    )
}
