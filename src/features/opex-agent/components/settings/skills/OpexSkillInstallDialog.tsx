"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResourceSourceField } from "@/components/resources/ResourceSourceField"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { opexSkillDiscoverSchema, type OpexSkillDiscoveryDto, type OpexSkillResultDto } from "../../../skills"
import { useDiscoverOpexSkills, useInstallOpexSkills } from "../../../hooks/useOpexSkills"

type Step = { kind: "source" } | { kind: "pick"; source: string; discovery: OpexSkillDiscoveryDto } | { kind: "result"; results: OpexSkillResultDto[] }

const fade = { initial: { opacity: 0, x: 8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 }, transition: { duration: 0.18 } }

function Results({ results }: { results: OpexSkillResultDto[] }) {
    return (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto" aria-label="Resultado da instalação">
            {results.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-sm">
                    {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />}
                    <span className="min-w-0">
                        <span className="font-mono">{item.name ?? (item.key || "raiz")}</span> — <span className={item.ok ? "text-muted-foreground" : "text-destructive"}>{item.message}</span>
                    </span>
                </li>
            ))}
        </ul>
    )
}

/**
 * Instalar do GitHub (D7): origem → as skills encontradas (pastas com SKILL.md) para marcar → resultado por
 * skill. Repositório com uma única skill instalável instala direto. O token da integração GitHub vale para
 * repositórios privados.
 */
export function OpexSkillInstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [step, setStep] = useState<Step>({ kind: "source" })
    const [picked, setPicked] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)
    const discover = useDiscoverOpexSkills()
    const install = useInstallOpexSkills()
    const form = useForm<{ source: string }>({ resolver: zodResolver(opexSkillDiscoverSchema), mode: "onChange", defaultValues: { source: "" } })
    const busy = discover.isPending || install.isPending

    const close = () => {
        if (busy) return
        form.reset()
        setStep({ kind: "source" })
        setPicked([])
        setError(null)
        onClose()
    }
    const runInstall = (source: string, paths: string[]) =>
        install.mutate({ source, paths }, { onSuccess: ({ results }) => setStep({ kind: "result", results }), onError: (failure) => setError(apiErrorMessage(failure, "Não foi possível instalar")) })
    const submitSource = ({ source }: { source: string }) => {
        setError(null)
        discover.mutate(source, {
            onSuccess: (discovery) => {
                const installable = discovery.skills.filter((skill) => !skill.error)
                if (discovery.skills.length === 1 && installable.length === 1) return runInstall(source, [installable[0]!.path])
                setPicked(installable.map((skill) => skill.path))
                setStep({ kind: "pick", source, discovery })
            },
            onError: (failure) => setError(apiErrorMessage(failure, "Não foi possível ler o repositório")),
        })
    }
    const toggle = (path: string, checked: boolean) => setPicked((current) => (checked ? [...current, path] : current.filter((item) => item !== path)))

    return (
        <Dialog open={open} onOpenChange={(next) => !next && close()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Instalar do GitHub</DialogTitle>
                    <DialogDescription>Baixa a pasta da skill pela integração GitHub (repositório privado usa o token dela) e grava no banco do Opex.</DialogDescription>
                </DialogHeader>
                {error ? (
                    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <AnimatePresence mode="wait" initial={false}>
                    {step.kind === "source" ? (
                        <motion.form key="source" {...fade} className="space-y-4" onSubmit={form.handleSubmit(submitSource)} noValidate>
                            <ResourceSourceField id="opex-skill-source" label="Repositório" placeholder="dono/repositorio ou https://github.com/dono/repositorio" error={form.formState.errors.source?.message} registration={form.register("source")} disabled={busy} />
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={busy || !form.formState.isValid}>
                                    {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                                    {install.isPending ? "Instalando…" : discover.isPending ? "Lendo o repositório…" : "Continuar"}
                                </Button>
                            </div>
                        </motion.form>
                    ) : step.kind === "pick" ? (
                        <motion.div key="pick" {...fade} className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                {step.discovery.skills.length} skill(s) em <span className="font-mono">{step.discovery.repo}</span>. Marque as que vão para o Opex.
                            </p>
                            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2" aria-label="Skills do repositório">
                                {step.discovery.skills.map((skill) => (
                                    <li key={skill.path} className={cn("flex items-start gap-2 rounded px-2 py-1.5", skill.error && "opacity-70")}>
                                        <Checkbox id={`skill-${skill.path}`} className="mt-0.5" checked={picked.includes(skill.path)} disabled={Boolean(skill.error) || busy} onCheckedChange={(checked) => toggle(skill.path, checked === true)} />
                                        <label htmlFor={`skill-${skill.path}`} className="min-w-0 flex-1 text-sm">
                                            <span className="block font-mono">{skill.name ?? (skill.path || "raiz")}</span>
                                            {skill.description ? <span className="block line-clamp-2 text-xs text-muted-foreground">{skill.description}</span> : null}
                                            {skill.error ? <span className="block text-xs text-destructive">{skill.error}</span> : null}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => setStep({ kind: "source" })} disabled={busy}>
                                    Voltar
                                </Button>
                                <Button type="button" disabled={busy || picked.length === 0} onClick={() => runInstall(step.source, picked)}>
                                    {install.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                                    {install.isPending ? "Instalando…" : `Instalar (${picked.length})`}
                                </Button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div key="result" {...fade} className="space-y-4">
                            <Results results={step.results} />
                            <div className="flex justify-end">
                                <Button type="button" onClick={close}>
                                    Concluir
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
