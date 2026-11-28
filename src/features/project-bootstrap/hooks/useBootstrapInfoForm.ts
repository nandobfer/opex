"use client"

import { useEffect, useMemo, useRef } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { apiErrorMessage } from "@/lib/api"
import { submitBlockReason } from "../form-state"
import { defaultBootstrapDirectory, isValidRepoName, isValidRepoOwner, parseRepoInput, repoFullName } from "../repo-name"
import { projectBootstrapStartSchema, type ProjectBootstrapStartInput, type ProjectBootstrapStartValues } from "../schemas"
import { detectTechnologies } from "../tech-detect"
import { useDebouncedValue } from "./useDebouncedValue"
import { useBootstrapPrefill, useDirectoryCheck, useRepoCheck, useRepoOwners, useTechCatalog } from "./useProjectBootstrap"

const CHECK_DELAY_MS = 500

/**
 * Estado do formulário da etapa 1: valores iniciais (repositório vindo da Nova central, conta do token,
 * colunas do último vínculo, pasta padrão), as conferências ao vivo e as tecnologias reconhecidas.
 */
export function useBootstrapInfoForm(initialRepo: string) {
    const parsed = useMemo(() => parseRepoInput(initialRepo), [initialRepo])
    const form = useForm<ProjectBootstrapStartInput, unknown, ProjectBootstrapStartValues>({
        resolver: zodResolver(projectBootstrapStartSchema),
        mode: "onChange",
        defaultValues: { owner: parsed.owner ?? "", name: parsed.name, visibility: "private", context: "", directory: "", entryColumnKey: "", closedColumnKey: null, withEnvironment: true },
    })
    const prefill = useBootstrapPrefill()
    const owners = useRepoOwners()
    const catalog = useTechCatalog()
    const board = useTaskBoard()
    const [owner, name, context, directory, visibility] = useWatch({ control: form.control, name: ["owner", "name", "context", "directory", "visibility"] })
    const directoryEdited = useRef(false)
    const columnsApplied = useRef(false)

    // Sem `owner/` no nome digitado, o padrão é a conta pessoal do token.
    useEffect(() => {
        if (!form.getValues("owner") && owners.data?.viewer) form.setValue("owner", owners.data.viewer, { shouldValidate: true })
    }, [owners.data, form])
    useEffect(() => {
        if (!prefill.data || columnsApplied.current) return
        columnsApplied.current = true
        if (prefill.data.entryColumnKey) form.setValue("entryColumnKey", prefill.data.entryColumnKey, { shouldValidate: true })
        form.setValue("closedColumnKey", prefill.data.closedColumnKey)
    }, [prefill.data, form])
    // A pasta acompanha o nome até o dono editá-la.
    useEffect(() => {
        if (!prefill.data || directoryEdited.current) return
        form.setValue("directory", name ? defaultBootstrapDirectory(prefill.data.codeRoot, name.trim()) : "", { shouldValidate: Boolean(name) })
    }, [prefill.data, name, form])

    const repoReady = isValidRepoOwner(owner.trim()) && isValidRepoName(name.trim())
    const repoKey = repoReady ? `${owner.trim()}/${name.trim()}` : null
    const debouncedRepo = useDebouncedValue(repoKey, CHECK_DELAY_MS)
    const [checkOwner, checkName] = debouncedRepo ? debouncedRepo.split("/") : [null, null]
    // A visibilidade entra na conferência: a organização pode permitir só privados ou só públicos.
    const repoCheck = useRepoCheck(checkOwner ?? null, checkName ?? null, visibility)
    const repoPending = repoKey !== debouncedRepo
    const fullName = repoReady ? repoFullName(owner.trim(), name.trim()) : null
    const dirKey = directory && fullName && !form.formState.errors.directory ? `${directory}\n${fullName}` : null
    const debouncedDir = useDebouncedValue(dirKey, CHECK_DELAY_MS)
    const [checkPath, checkRepo] = debouncedDir ? debouncedDir.split("\n") : [null, null]
    const dirCheck = useDirectoryCheck(checkPath ?? null, checkRepo ?? null)
    const dirPending = dirKey !== debouncedDir

    const detected = useMemo(() => detectTechnologies(context, catalog.data?.technologies ?? [], catalog.data?.groups ?? []), [context, catalog.data])
    const blockers = prefill.data?.blockers ?? []
    const blockReason = submitBlockReason({
        blockers: blockers.length,
        repo: { loading: !repoReady ? false : repoPending || repoCheck.isFetching, check: repoReady ? (repoCheck.data ?? null) : null, error: repoCheck.error ? apiErrorMessage(repoCheck.error, "Não foi possível conferir o nome no GitHub") : !repoReady ? "Informe o dono e um nome de repositório válido." : null },
        directory: { loading: dirPending || dirCheck.isFetching, check: dirCheck.data ?? null, error: dirCheck.error ? apiErrorMessage(dirCheck.error, "Não foi possível conferir a pasta no host") : null },
    })

    return {
        form,
        prefill,
        owners,
        board,
        detected,
        blockers,
        blockReason,
        repoCheck: { data: repoReady ? repoCheck.data : undefined, isFetching: repoReady && repoCheck.isFetching, error: repoCheck.error },
        repoPending: repoReady && repoPending,
        dirCheck: { data: dirCheck.data, isFetching: dirCheck.isFetching, error: dirCheck.error },
        dirPending: Boolean(dirKey) && dirPending,
        markDirectoryEdited: () => {
            directoryEdited.current = true
        },
    }
}
