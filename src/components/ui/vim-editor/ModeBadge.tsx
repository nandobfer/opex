"use client"

import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { EDITOR_MODE_SHORTCUT_LABEL } from "@/features/editor-mode/shortcut"
import type { VimMode } from "./vim-setup"

const LABELS: Record<VimMode, string> = {
    normal: "NORMAL",
    insert: "INSERT",
    visual: "VISUAL",
    "visual-line": "V-LINE",
    "visual-block": "V-BLOCK",
    replace: "REPLACE",
}

/** Selo do modo atual do Vim; clicar volta ao campo normal. */
export function ModeBadge({ mode, onExit }: { mode: VimMode; onExit: () => void }) {
    return (
        <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onExit}
            title={`Voltar ao campo normal (${EDITOR_MODE_SHORTCUT_LABEL})`}
            aria-label={`Modo Vim: ${LABELS[mode]}. Voltar ao campo normal`}
            data-vim-mode={mode}
            className={cn(
                "absolute bottom-1 right-1 z-10 overflow-hidden rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none transition-colors",
                mode === "normal" ? "bg-muted text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground",
            )}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={mode} className="block" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
                    {LABELS[mode]}
                </motion.span>
            </AnimatePresence>
        </button>
    )
}
