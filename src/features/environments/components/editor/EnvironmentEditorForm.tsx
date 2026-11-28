"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useWatch } from "react-hook-form"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertCircle, Boxes, CheckCircle2, Gauge, GitBranch, KeyRound, Loader2, Server, Tag, type LucideIcon } from "lucide-react"
import { FormPageHeader } from "@/components/form-page/FormPageHeader"
import { FormSectionNav, scrollToSection } from "@/components/form-page/FormSectionNav"
import { useUnsavedChangesGuard } from "@/components/form-page/useUnsavedChangesGuard"
import { Button } from "@/components/ui/button"
import { FormFooter } from "@/components/ui/form-footer"
import { ENVIRONMENTS_PATH } from "../../constants"
import { dirtySections, EDITOR_SECTION_LABELS, EDITOR_SECTIONS as SECTIONS, editorStatus, errorSections, sectionAnchor, type EditorSection, type EditorStatus } from "../../editor-sections"
import { EDITOR_GRID, EDITOR_SECTIONS } from "../../environment-editor-layout"
import { ComposeReadProvider } from "../../hooks/useFormComposeRead"
import { useEnvironmentEditor } from "../../hooks/useEnvironmentEditor"
import type { Machine } from "../../schemas"
import type { EnvironmentDto, HostCapacityDto } from "../../types"
import { MACHINE_SUBJECT } from "../../view"
import { ComposeDialog } from "../ComposeDialog"
import { EditorNotices } from "./EditorNotices"
import { ExecutionSection } from "./ExecutionSection"
import { IdentitySection } from "./IdentitySection"
import { ResourcesSection } from "./ResourcesSection"
import { ServicesSection } from "./ServicesSection"
import { SourceSection } from "./SourceSection"
import { VariablesSection } from "./VariablesSection"

const SECTION_ICONS: Record<EditorSection, LucideIcon> = { identidade: Tag, origem: GitBranch, execucao: Server, variaveis: KeyRound, recursos: Gauge, servicos: Boxes }

/** Status ao lado do Salvar (o de erro leva à primeira seção com erro). */
function StatusText({ status, onGoTo }: { status: EditorStatus; onGoTo: (section: EditorSection) => void }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span key={status.kind === "saved" ? "saved" : status.text} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }} role="status" className="text-xs">
                {status.kind === "error" ? (
                    <button type="button" className="flex items-center gap-1.5 text-destructive hover:underline" onClick={() => onGoTo(status.section)}>
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {status.text}
                    </button>
                ) : status.kind === "dirty" ? (
                    <span className="text-muted-foreground">{status.text}</span>
                ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Tudo salvo
                    </span>
                )}
            </motion.span>
        </AnimatePresence>
    )
}

interface Props {
    env: EnvironmentDto | null
    pcAvailable: boolean
    pcReason: string | null
    hosts: Record<Machine, HostCapacityDto | null>
}

/**
 * Formulário da página Novo/Editar ambiente (OPE-211): índice das seções à esquerda (no `lg`) e as seções em
 * cards (Identificação, Origem, Execução, Variáveis extras, Recursos e Serviços do compose). Salvar e Cancelar
 * no cabeçalho e no rodapé; sair com alterações pede confirmação.
 */
export function EnvironmentEditorForm({ env, pcAvailable, pcReason, hosts }: Props) {
    const router = useRouter()
    const reduced = useReducedMotion()
    const editor = useEnvironmentEditor(env)
    const { form } = editor
    const { dirtyFields, errors } = form.formState
    const runOn = useWatch({ control: form.control, name: "runOn" }) ?? "server"
    const [composeOpen, setComposeOpen] = useState(false)
    const dirty = dirtySections(dirtyFields)
    const withErrors = errorSections(errors)
    const status = editorStatus({ dirty, errors: withErrors, creating: !env })
    const saving = editor.save.isPending
    const { guard, dialog } = useUnsavedChangesGuard(dirty.length > 0 && !saving)
    const goTo = (section: EditorSection) => scrollToSection(sectionAnchor(section), { smooth: !reduced, focusInvalid: true })
    const canSave = !saving && editor.envStatus === "ready"
    const actions = (
        <>
            <Button type="button" variant="outline" disabled={saving} onClick={() => guard(() => router.push(ENVIRONMENTS_PATH))}>
                Cancelar
            </Button>
            <Button type="submit" form="environment-editor" disabled={!canSave}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                {env ? "Salvar" : "Criar ambiente"}
            </Button>
        </>
    )
    const navItems = SECTIONS.map((section) => ({ id: sectionAnchor(section), label: EDITOR_SECTION_LABELS[section], icon: SECTION_ICONS[section], dirty: dirty.includes(section), error: withErrors.includes(section) }))
    const host = hosts[runOn]
    const machine = MACHINE_SUBJECT[runOn]

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
            <FormPageHeader
                backHref={ENVIRONMENTS_PATH}
                backLabel="Ambientes"
                title={env ? `Editar ${env.name}` : "Novo ambiente"}
                description={env ? "As mudanças valem no próximo deploy." : "O ambiente é criado sem implantar; faça o deploy depois, na lista ou aqui."}
                status={<StatusText status={status} onGoTo={goTo} />}
                actions={actions}
            />
            <EditorNotices env={env} changedElsewhere={editor.changedElsewhere} onReload={editor.reload} onKeep={editor.keepEditing} savedAt={editor.savedAt} onDismissSaved={editor.dismissSaved} />
            <form id="environment-editor" noValidate onSubmit={(event) => void editor.submit(event)}>
                <ComposeReadProvider form={form} env={env}>
                    <div className={EDITOR_GRID}>
                        <FormSectionNav items={navItems} label="Seções do ambiente" />
                        <div className={EDITOR_SECTIONS}>
                            <IdentitySection form={form} editing={Boolean(env)} />
                            <SourceSection form={form} env={env} onOpenCompose={() => setComposeOpen(true)} />
                            <ExecutionSection form={form} pcAvailable={pcAvailable} pcReason={pcReason} />
                            <VariablesSection form={form} status={editor.envStatus} onRetry={() => void editor.envValues.refetch()} />
                            <ResourcesSection form={form} env={env} host={host} machine={machine} />
                            <ServicesSection form={form} env={env} host={host} machine={machine} />
                            <FormFooter>{actions}</FormFooter>
                        </div>
                    </div>
                </ComposeReadProvider>
            </form>
            {env?.source.kind === "managed" && <ComposeDialog env={composeOpen ? env : null} onClose={() => setComposeOpen(false)} />}
            {dialog}
        </motion.div>
    )
}
