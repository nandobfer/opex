"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { useAdoptProject } from "../hooks/useEnvironments"
import { adoptInputSchema, type AdoptInput } from "../schemas"
import type { UnmanagedProjectDto } from "../types"
import { slugify } from "../view"

/** Adotar um projeto descoberto: nome e slug (pasta, arquivos e máquina vêm dos labels). */
export function AdoptDialog({ project, onClose }: { project: UnmanagedProjectDto | null; onClose: () => void }) {
    const adopt = useAdoptProject()
    const form = useForm<AdoptInput>({ resolver: zodResolver(adoptInputSchema), mode: "onChange" })
    useEffect(() => {
        if (project) form.reset({ machine: project.machine, projectName: project.projectName, name: project.projectName, slug: slugify(project.projectName) })
    }, [project, form])
    const errors = form.formState.errors
    const submit = form.handleSubmit((values) => adopt.mutate(values, { onSuccess: onClose }))
    return (
        <Dialog open={project !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <form onSubmit={(event) => void submit(event)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Adotar {project?.projectName}</DialogTitle>
                        <DialogDescription>
                            {project?.machine === "pc" ? "No PC" : "No servidor"}, em {project?.workingDir}. {project?.git ? "Com git: o redeploy pode fazer git pull (editar depois)." : "Sem git: o redeploy só refaz o build."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className={FORM_GRID}>
                        <Field id="adopt-name" label="Nome" error={errors.name?.message}>
                            <Input id="adopt-name" {...form.register("name")} />
                        </Field>
                        <Field id="adopt-slug" label="Slug" error={errors.slug?.message}>
                            <Input id="adopt-slug" className="font-mono" {...form.register("slug")} />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={adopt.isPending || !form.formState.isValid}>
                            Adotar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
