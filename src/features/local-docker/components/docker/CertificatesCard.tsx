"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { LOCAL_DOCKER_CA_ENV } from "../../constants"
import type { LocalDockerSettings } from "../../schemas"

/** Certificados do PC: bundle de CAs do WSL montado nas prévias (redes com inspeção TLS). */
export function CertificatesCard({ form }: { form: UseFormReturn<LocalDockerSettings> }) {
    const errors = form.formState.errors
    const trust = useWatch({ control: form.control, name: "trustPcCertificates" })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4" aria-hidden /> Certificados do PC
                </CardTitle>
                <CardDescription>
                    Redes com inspeção TLS (ex.: FortiGate) trocam o certificado dos sites pelo da CA corporativa. O WSL confia nela, mas os containers não: o Clerk e outras chamadas HTTPS do servidor da prévia falham. Ligado, cada prévia no PC recebe o bundle de CAs do WSL (somente leitura) e as variáveis {LOCAL_DOCKER_CA_ENV.join(", ")}.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <FormToggleCard<LocalDockerSettings>
                    control={form.control}
                    name="trustPcCertificates"
                    id="local-docker-trust-certificates"
                    label="Confiar nas CAs do PC nas prévias"
                    description="O preparo do PC avisa quando a rede inspeciona o TLS e o bundle não existe"
                    onLabel="Sim"
                    offLabel="Não"
                />
                <Field id="local-docker-ca-bundle" label="Bundle de CAs no PC" error={errors.pcCaBundlePath?.message}>
                    <Input id="local-docker-ca-bundle" className="font-mono" disabled={!trust} {...form.register("pcCaBundlePath")} aria-invalid={errors.pcCaBundlePath ? true : undefined} />
                    <p className="text-xs text-muted-foreground">No Debian/Ubuntu (WSL), o bundle do sistema já inclui as CAs instaladas com update-ca-certificates</p>
                </Field>
            </CardContent>
        </Card>
    )
}
