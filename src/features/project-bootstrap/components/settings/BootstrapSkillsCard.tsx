"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { AlertTriangle, ExternalLink, RefreshCw, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { AiSkillDto } from "@nandobfer/integracoes/modules/integrations/ia/ai/providers"
import { useAiSkills, useRefreshAiSkills } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi"
import { matchOpencodeSkill } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-skills"
import { OPENCODE_SKILLS_HREF } from "../../constants"
import type { ProjectBootstrapSettings } from "../../schemas"

/**
 * Skills do OpenCode do host que o Agente de Bootstrap usa: a sessão libera só as escolhidas. O conteúdo
 * das skills é editado na aba Skills do OpenCode (ou pelas ferramentas de recursos do OpenCode). As marcadas
 * "Só com ambiente" ficam fora (não exigidas, ativadas nem liberadas) quando o bootstrap não cria ambiente.
 */
export function BootstrapSkillsCard({ form }: { form: UseFormReturn<ProjectBootstrapSettings> }) {
    const skills = useAiSkills(true)
    const refresh = useRefreshAiSkills()
    const list = skills.data ?? []
    const environmentSkills = useWatch({ control: form.control, name: "environmentSkills" }) ?? []
    const isEnvironmentOnly = (name: string) => environmentSkills.some((item) => item.toLowerCase() === name.toLowerCase())
    const setEnvironmentOnly = (name: string, on: boolean) =>
        form.setValue("environmentSkills", on ? [...environmentSkills.filter((item) => item.toLowerCase() !== name.toLowerCase()), name] : environmentSkills.filter((item) => item.toLowerCase() !== name.toLowerCase()), { shouldDirty: true, shouldValidate: true })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Skills do agente
                </CardTitle>
                <CardDescription>Skills instaladas no OpenCode do host. A sessão do bootstrap nega as demais e ativa estas no começo da conversa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {skills.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                ) : skills.isError ? (
                    <ErrorState title="Não foi possível listar as skills do OpenCode" description={apiErrorMessage(skills.error, "Confira a conexão com o OpenCode.")} onRetry={() => void skills.refetch()} />
                ) : (
                    <Controller
                        control={form.control}
                        name="skills"
                        render={({ field }) => {
                            const selected: string[] = field.value
                            const toggle = (skill: AiSkillDto) => {
                                const current = selected.find((name) => matchOpencodeSkill(name, [skill]))
                                field.onChange(current ? selected.filter((name) => name !== current) : [...selected, skill.name])
                            }
                            return (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <div className="min-w-0 flex-1">
                                            <SearchPicker<AiSkillDto>
                                                trigger={<FieldTrigger id="bootstrap-skills" placeholder="Adicionar ou remover skills" value={selected.length ? `${selected.length} skill(s) escolhida(s)` : undefined} />}
                                                items={list}
                                                getKey={(skill) => skill.id}
                                                searchKeys={["name", "id", "description"]}
                                                selectedKeys={list.filter((skill) => selected.some((name) => matchOpencodeSkill(name, [skill]))).map((skill) => skill.id)}
                                                closeOnPick={false}
                                                renderItem={(skill) => (
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate font-medium">{skill.name}</span>
                                                        {skill.description && <span className="line-clamp-2 block text-xs text-muted-foreground">{skill.description}</span>}
                                                    </span>
                                                )}
                                                onPick={toggle}
                                                matchTriggerWidth
                                                searchLabel="Buscar skill"
                                                listLabel="Skills do OpenCode"
                                                emptyText="Nenhuma skill instalada no OpenCode do host"
                                                emptySearchText="Nenhuma skill encontrada"
                                            />
                                        </div>
                                        <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Atualizar lista de skills" title="Atualizar lista de skills" onClick={() => void refresh()}>
                                            <RefreshCw className="h-4 w-4" aria-hidden />
                                        </Button>
                                    </div>
                                    <ul className="space-y-2">
                                        <AnimatePresence initial={false}>
                                            {selected.map((name) => {
                                                const skill = matchOpencodeSkill(name, list)
                                                return (
                                                    <motion.li key={name} layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.16 }} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2" data-missing={skill ? undefined : true}>
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-medium">{skill?.name ?? name}</span>
                                                            {skill ? (
                                                                skill.description && <span className="line-clamp-2 block text-xs text-muted-foreground">{skill.description}</span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-xs text-warning">
                                                                    <AlertTriangle className="h-3 w-3" aria-hidden /> Não está instalada no OpenCode do host: o bootstrap não começa sem ela.
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-2">
                                                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Sem ambiente e container Docker, esta skill não é exigida, ativada nem liberada">
                                                                <Switch role="switch" aria-checked={isEnvironmentOnly(name)} checked={isEnvironmentOnly(name)} onCheckedChange={(on) => setEnvironmentOnly(name, on)} aria-label={`Só com ambiente: ${name}`} />
                                                                <span aria-hidden>Só com ambiente</span>
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7"
                                                                aria-label={`Tirar a skill ${name}`}
                                                                onClick={() => {
                                                                    field.onChange(selected.filter((item) => item !== name))
                                                                    if (isEnvironmentOnly(name)) setEnvironmentOnly(name, false)
                                                                }}
                                                            >
                                                                <X className="h-3.5 w-3.5" aria-hidden />
                                                            </Button>
                                                        </span>
                                                    </motion.li>
                                                )
                                            })}
                                        </AnimatePresence>
                                    </ul>
                                    {selected.length === 0 && <p className="text-xs text-muted-foreground">Sem skills: o agente segue só com as instruções.</p>}
                                </div>
                            )
                        }}
                    />
                )}
                <Link href={OPENCODE_SKILLS_HREF} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Gerenciar as skills do OpenCode <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
            </CardContent>
        </Card>
    )
}
