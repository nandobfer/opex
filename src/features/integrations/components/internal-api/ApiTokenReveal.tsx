"use client"

import { SecretReveal } from "@/components/ui/secret-reveal"

/** O valor do token, que aparece UMA vez: copiar e o aviso de uso. */
export function ApiTokenReveal({ token }: { token: string }) {
    return (
        <SecretReveal
            value={token}
            hint={
                <>
                    Use no cabeçalho <code className="font-mono">Authorization: Bearer …</code>. Entregue só a quem vai usá-lo.
                </>
            }
        />
    )
}
