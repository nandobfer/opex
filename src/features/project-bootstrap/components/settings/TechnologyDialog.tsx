"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChipInput } from "@/components/ui/chip-input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Input } from "@/components/ui/input"
import { SearchPicker } from "@/components/ui/search-picker"
import { useSaveTechnology } from "../../hooks/useProjectBootstrap"
import { technologyInputSchema, type TechnologyInput } from "../../schemas"
import { techDotStyle } from "../../tech-colors"
import type { TechGroupDto, TechnologyDto } from "../../types"

interface TechnologyDialogProps {
    open: boolean
    technology: TechnologyDto | null
    groups: readonly TechGroupDto[]
    /** Grupo sugerido na criação. */
    defaultGroupId?: string | null
    onClose: () => void
}

function GroupLabel({ group }: { group: TechGroupDto }) {
    return (
        <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" style={techDotStyle(group.color)} aria-hidden />
            {group.name}
        </span>
    )
}

/** Criar ou editar uma tecnologia: nome, variantes reconhecidas no texto e o grupo. */
export function TechnologyDialog({ open, technology, groups, defaultGroupId, onClose }: TechnologyDialogProps) {
    const save = useSaveTechnology()
    const form = useForm<TechnologyInput>({ resolver: zodResolver(technologyInputSchema), mode: "onChange", defaultValues: { name: "", aliases: [], groupId: "" } })
    useEffect(() => {
        if (open) form.reset(technology ? { name: technology.name, aliases: technology.aliases, groupId: technology.groupId } : { name: "", aliases: [], groupId: defaultGroupId ?? groups[0]?.id ?? "" })
    }, [open, technology, defaultGroupId, groups, form])
    const errors = form.formState.errors
    return (
        <Dialog open={open} onOpenChange={(next) => !next && !save.isPending && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void form.handleSubmit(async (values) => {
                            const saved = await save.mutateAsync({ ...values, id: technology?.id ?? null }).catch(() => null)
                            if (saved) onClose()
                        })()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{technology ? `Editar ${technology.name}` : "Nova tecnologia"}</DialogTitle>
                        <DialogDescription>O nome e as variantes são reconhecidos no contexto do projeto, sem acento nem caixa.</DialogDescription>
                    </DialogHeader>
                    <Field id="technology-name" label="Nome" error={errors.name?.message}>
                        <Input id="technology-name" placeholder="Ex.: Next.js" {...form.register("name")} aria-invalid={errors.name ? true : undefined} />
                    </Field>
                    <Field id="technology-aliases" label="Variantes reconhecidas" error={errors.aliases?.message}>
                        <Controller control={form.control} name="aliases" render={({ field }) => <ChipInput id="technology-aliases" value={field.value} onChange={field.onChange} placeholder="Ex.: next, nextjs (Enter adiciona)" />} />
                    </Field>
                    <Field id="technology-group" label="Grupo" error={errors.groupId?.message}>
                        <Controller
                            control={form.control}
                            name="groupId"
                            render={({ field }) => {
                                const selected = groups.find((group) => group.id === field.value)
                                return (
                                    <SearchPicker<TechGroupDto>
                                        trigger={<FieldTrigger id="technology-group" placeholder="Escolha o grupo" invalid={Boolean(errors.groupId)} value={selected ? <GroupLabel group={selected} /> : undefined} />}
                                        items={groups}
                                        getKey={(group) => group.id}
                                        searchKeys={["name"]}
                                        renderItem={(group) => <GroupLabel group={group} />}
                                        onPick={(group) => field.onChange(group.id)}
                                        matchTriggerWidth
                                        searchLabel="Buscar grupo"
                                        listLabel="Grupos"
                                        emptyText="Crie um grupo antes"
                                        emptySearchText="Nenhum grupo encontrado"
                                    />
                                )
                            }}
                        />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || !form.formState.isValid}>
                            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
