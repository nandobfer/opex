/**
 * Atributos do cookie de sessão e detecção de HTTPS do módulo de auth.
 *
 * O app pode ser acessado por HTTPS (domínio/proxy) **ou** por HTTP direto (prévia em
 * `http://IP:porta`). O atributo `Secure` do cookie é derivado do **protocolo real da requisição**
 * — nunca de `NODE_ENV`: em HTTP, um cookie `Secure` é descartado pelo navegador (exceto em
 * `localhost`), e o login deixa de ter efeito. Módulo **puro** (recebe primitivos), testável sem o
 * runtime do Next.
 */

export interface SessionCookieOptions {
    httpOnly: true
    sameSite: "lax"
    path: "/"
    secure: boolean
}

/**
 * `true` quando a requisição chega por HTTPS. Prefere o `x-forwarded-proto` (proxy que termina
 * TLS); sem ele, cai no protocolo da URL (`http:`/`https:`). Aceita lista (`"https, http"`), usando
 * o primeiro valor.
 */
export function isHttpsRequest(forwardedProto: string | null | undefined, protocol: string): boolean {
    const proto = (forwardedProto?.split(",")[0]?.trim() || protocol).toLowerCase().replace(/:$/, "")
    return proto === "https"
}

/** Atributos do cookie de sessão; `secure` vem de `isHttpsRequest`. */
export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
    return { httpOnly: true, sameSite: "lax", path: "/", secure }
}
