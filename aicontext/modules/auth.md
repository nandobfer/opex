# Módulo: Login e sessão

Tela inicial de login do Opex. O app pode ser publicado na internet, então passou a ter **uma
senha única** (`APP_PASSWORD`) — **sem usuários, sem cadastro e sem multiempresa**. É a primeira
(e, por ora, única) tela pública, e protege **todas as páginas e APIs internas**.

## Configuração (`.env`)

- `APP_PASSWORD` — a senha de acesso. Vazio ⇒ login indisponível (fail-closed).
- `AUTH_SECRET` — segredo que assina o cookie de sessão. `openssl rand -base64 32`. Vazio ⇒ login
  indisponível (fail-closed).

Não são integrações: vêm do `.env` (runtime, nunca no bundle), não da tela `/integracoes`.

## Fluxo

1. `/login` (fora do shell) mostra o cartão com o título **Opex** e o subtítulo **nandoburgos.dev**,
   o campo **Senha** (com mostrar/ocultar) e o botão **Entrar**, sobre um fundo animado de
   partículas (`@tsparticles`, receita "links") com as cores do tema.
2. O formulário (`LoginForm`, react-hook-form + `zodResolver` com `loginSchema`) envia
   `POST /api/auth/login`.
3. A rota valida a senha em **tempo constante** (`verifyPassword`, SHA-256 + `timingSafeEqual`),
   aplica **rate limit em memória** (5 tentativas / 15 min por IP) e, em caso de sucesso, emite o
   **cookie de sessão** e responde `{ authenticated: true }`.
4. O cliente navega para `next` (se for caminho relativo do app) ou `HOME_HREF`.

## Sessão

- Cookie `opex_session`, `httpOnly`, `sameSite=lax`, `path=/` e `secure` **apenas quando a requisição
  chega por HTTPS de fato** — detectado por `x-forwarded-proto` (proxy que termina TLS) ou pelo
  protocolo da URL, **nunca** por `NODE_ENV`. Acesso direto por **HTTP** (ex.: prévia em
  `http://IP:porta`) recebe o cookie **sem** `Secure`: impor `Secure` aí faria o navegador descartar
  o cookie (fora de `localhost`) e o login não teria efeito. Lógica em
  `server/cookie.ts` (`isHttpsRequest`/`sessionCookieOptions`), usada no login e no logout.
- **Cookie de sessão** (sem `maxAge`): expira ao fechar o navegador. O token carrega um teto de
  30 dias (`SESSION_MAX_AGE_SECONDS`) como rede de segurança.
- Token **stateless**: `base64url(payload).base64url(HMAC-SHA256)`, payload só com `iat`/`exp`
  (não há usuário). Assinado/verificado com **Web Crypto** (`src/features/auth/session.ts`), que
  roda tanto no runtime Edge do middleware quanto no Node.

## Guarda de acesso (`src/middleware.ts`)

A decisão é uma função pura (`resolveAuthAction`, em `src/features/auth/paths.ts`); o middleware só
aplica. Sem sessão: **página → redirect** para `/login?next=…`; **API interna → 401** (`ApiResponse`).

Rotas liberadas sem sessão:

- `/login`, `/api/auth/login`, `/api/auth/logout`;
- `/api/v1/*` — API pública por token de sistema (`requireApiToken`);
- `/cliente` e `/api/cliente/*` — portal do cliente de Orçamentos, autenticado pelo **token do
  cliente** (`requireClient`, `x-client-token` ou `?t=`; ver `modules/orcamentos.md`);
- `/api/routines/*` — tick do agendador (token de cron).

`next` é gravado sem o subcaminho público (`normalizePath` remove o `BASE_PATH`), e o formulário
descarta destino externo (open redirect).

## Sair

`LogoutButton` no rodapé do menu (`SidebarFooter`): no desktop fica dentro do **popover** aberto pelo
avatar do dono; na gaveta do mobile fica inline. Chama `POST /api/auth/logout` (apaga o cookie) e
recarrega para `/login`.

## Rate limit

`src/features/auth/server/rate-limit.ts` — contador por IP em memória (sem Redis, conforme a regra
do projeto). O sucesso limpa a chave; a janela deslizante é de 15 min.

## Arquivos

- `src/app/login/page.tsx` — rota (metadata + `robots: noindex`).
- `src/app/api/auth/{login,logout}/route.ts` — rotas de auth.
- `src/middleware.ts` — guarda.
- `src/features/auth/` — `session.ts`, `paths.ts`, `schemas.ts`, `server/`, `hooks/useLogin.ts`,
  `components/` (`LoginPage`, `LoginForm`, `LoginParticleBackground`, `LogoutButton`).

## Testes

`__tests__/features/auth/`: `session`, `paths`, `paths-basepath`, `auth-service`, `rate-limit`,
`login-form`, `login-background`, `logout-button`. Layout: `app-sidebar` cobre o "Sair" no popover do
avatar (desktop) e o "Sair" inline (mobile).
