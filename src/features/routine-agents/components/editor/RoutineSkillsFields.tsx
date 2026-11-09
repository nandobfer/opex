"use client"

import type { ReactNode } from "react"
import { Controller, type UseFormReturn } from "react-hook-form"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SearchableCheckList } from "@/components/ui/check-list/SearchableCheckList"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useOpexSkillOptions, useOpexSkillsRealtime } from "@/features/opex-agent/hooks/useOpexSkills"
import type { RoutineAgentInput } from "../../schemas"
import type { RoutineOpencodeOptionsDto } from "../../types"
import { ROUTINE_SKILLS_LIST_SKELETON } from "./routine-tools-layout"

function SkillsCard({ description, children }: { description: string; children: ReactNode }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" aria-hidden /> Skills
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}

/** Motor Opex: todas as skills do Agente Opex (D2), com a situação do switch só como informação. */
export function RoutineOpexSkillsCard({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const skills = useOpexSkillOptions()
    useOpexSkillsRealtime()
    return (
        <SkillsCard description="Skills de Agente Opex › Skills que este agente pode carregar (nenhuma por padrão). Vale a seleção daqui, mesmo que a skill esteja desligada nas conversas do dono.">
            {skills.isLoading ? (
                <Skeleton className={ROUTINE_SKILLS_LIST_SKELETON} />
            ) : skills.isError ? (
                <ErrorState title="Não foi possível listar as skills" description={apiErrorMessage(skills.error, "Tente novamente.")} onRetry={() => void skills.refetch()} />
            ) : (
                <Controller
                    control={form.control}
                    name="opex.enabledSkills"
                    render={({ field }) => (
                        <SearchableCheckList
                            ariaLabel="Skills do Agente Opex"
                            items={(skills.data ?? []).map((skill) => ({
                                key: skill.name,
                                label: skill.name,
                                description: skill.description,
                                meta: (
                                    <Badge variant="outline" className="text-[11px] font-normal" title="Situação nas conversas do dono (informativo)">
                                        {skill.enabled ? "Ligada no Agente Opex" : "Desligada no Agente Opex"}
                                    </Badge>
                                ),
                            }))}
                            value={field.value ?? []}
                            onChange={field.onChange}
                            searchPlaceholder="Buscar skill"
                            emptyText="Nenhuma skill cadastrada em Agente Opex › Skills."
                        />
                    )}
                />
            )}
        </SkillsCard>
    )
}

/**
 * Motor OpenCode (D8): skills globais e nativas do host. As não liberadas ficam bloqueadas na sessão.
 * OpenCode fora do ar: aviso com "Tentar novamente" e a seleção salva continua visível.
 */
export function RoutineOpencodeSkillsCard({ form, options, loading, onRetry }: { form: UseFormReturn<RoutineAgentInput>; options: RoutineOpencodeOptionsDto | undefined; loading: boolean; onRetry: () => void }) {
    const unavailable = !loading && !options?.available
    return (
        <SkillsCard description="Skills globais e nativas do OpenCode no host liberadas para este agente (nenhuma por padrão); as demais ficam bloqueadas na sessão.">
            {loading ? (
                <Skeleton className={ROUTINE_SKILLS_LIST_SKELETON} />
            ) : (
                <div className="space-y-3">
                    {unavailable ? <ErrorState title="Não foi possível listar as skills do host" description={options?.reason ?? "Serviço OpenCode indisponível."} onRetry={onRetry} /> : null}
                    <Controller
                        control={form.control}
                        name="opencode.enabledSkills"
                        render={({ field }) => (
                            <SearchableCheckList
                                ariaLabel="Skills do host"
                                items={(options?.skills ?? []).map((skill) => ({
                                    key: skill.name,
                                    label: skill.name,
                                    description: skill.description,
                                    meta: skill.native ? (
                                        <Badge variant="secondary" className="text-[11px] font-normal">
                                            Nativa
                                        </Badge>
                                    ) : null,
                                }))}
                                value={field.value ?? []}
                                onChange={field.onChange}
                                missingLabel={unavailable ? "(salva; OpenCode indisponível)" : "(não encontrada)"}
                                searchPlaceholder="Buscar skill"
                                emptyText={unavailable ? "A lista volta quando o OpenCode responder." : "Nenhuma skill global no OpenCode do host."}
                            />
                        )}
                    />
                </div>
            )}
        </SkillsCard>
    )
}
