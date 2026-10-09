"use client"

import { useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronDown, Loader2, Search, UserMinus, UserRoundCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { PersonRef } from "../types"
import { AssigneeAvatar } from "./TaskBadges"

interface TaskAssigneePickerProps {
    /** Responsável atual (`undefined` = várias tarefas, nenhum marcado). */
    value: PersonRef | null | undefined
    people: readonly PersonRef[]
    currentUserId: string | null
    onChange: (person: PersonRef | null) => void
    pending?: boolean
    disabled?: boolean
    /** Gatilho próprio (barra de ações); padrão = avatar + nome. */
    trigger?: ReactNode
    showName?: boolean
    highlight?: boolean
    align?: "start" | "end" | "center"
}

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/** Responsável com busca, "Atribuir a mim" e "Remover responsável": escolher aplica na hora. */
export function TaskAssigneePicker({ value, people, currentUserId, onChange, pending = false, disabled = false, trigger, showName = true, highlight = false, align = "start" }: TaskAssigneePickerProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const me = currentUserId ? people.find((person) => person.id === currentUserId) ?? null : null

    const filtered = useMemo(() => {
        const term = normalize(search.trim())
        return term ? people.filter((person) => normalize(`${person.name} ${person.email ?? ""}`).includes(term)) : people
    }, [people, search])

    const choose = (person: PersonRef | null) => {
        setOpen(false)
        setSearch("")
        onChange(person)
    }

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) setSearch("")
            }}
        >
            <PopoverTrigger asChild disabled={disabled || pending}>
                {trigger ?? (
                    <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        aria-label="Responsável: alterar"
                        className="inline-flex max-w-full items-center gap-1 rounded-md p-0.5 pr-1 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
                    >
                        <AssigneeAvatar person={value ?? null} highlight={highlight} showName={showName} />
                        {pending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-60" aria-hidden />}
                    </button>
                )}
            </PopoverTrigger>
            <PopoverContent align={align} className="w-72 p-1" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                <div className="mb-1 border-b p-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground opacity-60" aria-hidden />
                        <Input autoFocus placeholder="Buscar pessoa..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 pl-7 text-xs" aria-label="Buscar pessoa" />
                    </div>
                </div>
                <div className="flex gap-1 px-1 pb-1">
                    {me && value?.id !== me.id && (
                        <button type="button" onClick={() => choose(me)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary">
                            <UserRoundCheck className="h-3.5 w-3.5" aria-hidden /> Atribuir a mim
                        </button>
                    )}
                    {value !== null && (
                        <button type="button" onClick={() => choose(null)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive">
                            <UserMinus className="h-3.5 w-3.5" aria-hidden /> Remover responsável
                        </button>
                    )}
                </div>
                <div role="listbox" aria-label="Pessoas" className="custom-scrollbar max-h-[260px] space-y-0.5 overflow-y-auto">
                    <AnimatePresence initial={false}>
                        {filtered.length === 0 ? (
                            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 text-center text-xs italic text-muted-foreground">
                                Ninguém encontrado
                            </motion.p>
                        ) : (
                            filtered.map((person) => {
                                const selected = value?.id === person.id
                                return (
                                    <motion.button
                                        key={person.id}
                                        layout="position"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.12 }}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => choose(person)}
                                        className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent", selected && "bg-primary/10")}
                                    >
                                        <AssigneeAvatar person={person} highlight={person.id === currentUserId} showName />
                                        {person.id === currentUserId && <span className="text-[10px] text-muted-foreground">(eu)</span>}
                                        {selected && <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden />}
                                    </motion.button>
                                )
                            })
                        )}
                    </AnimatePresence>
                </div>
            </PopoverContent>
        </Popover>
    )
}
