# Módulo: Login, usuários e sessão

Tela inicial de login do Opex. O app pode ser publicado na internet e tem **dois tipos de sessão**:

- **dono** do Opex (o administrador), autenticado pelas credenciais `ADMIN_*` do `.env`;
- **usuário de cliente** (do portal de Orçamentos), autenticado por username/email + senha (**scrypt**)
  ou pela **URL com token** (`/cliente?t=…`).

Não há cadastro público, `companyId`, cargos nem permissões no app do dono. Usuários existem **apenas
para o portal do cliente** (`aicontext/modules/orcamentos.md`).

## Configuração (`.env`)

- `ADMIN_USER` / `ADMIN_EMAIL` — identificadores do dono (aceita qualquer um no login).
- `ADMIN_PASSWORD` — senha do dono.
- `AUTH_SECRET` — segredo que assina o cookie de sessão. `openssl rand -base64 32`.
- `APP_OWNER_NAME` — nome exibido no rodapé do menu e gravado na auditoria do dono.

Faltando usuário/email, senha ou `AUTH_SECRET`, o login do dono fica indisponível (**fail-closed**).
Não são integrações: vêm do `.env` (runtime, nunca no bundle), não da tela `/integracoes`.

> A antiga `APP_PASSWORD` (senha única) foi **removida**; migrar exige preencher os `ADMIN_*`.

## Fluxo

1. `/login` (fora do shell) mostra o cartão com o título **Opex** e o subtítulo **nandoburgos.dev**,
   os campos **Usuário ou email** e **Senha** (com mostrar/ocultar) e o botão **Entrar**, sobre um
   fundo animado de partículas (`@tsparticles`, receita "links") com as cores do tema.
2. O formulário (`LoginForm`, react-hook-form + `zodResolver` com `loginSchema`) envia
   `POST /api/auth/login` com `{ identifier, password }`.
3. A rota aplica **rate limit em memória** (5 tentativas / 15 min por IP) e decide:
   - **dono**: `identifier` casa com `ADMIN_USER`/`ADMIN_EMAIL` e a senha confere (comparação em
     tempo constante) → cookie `kind: "admin"`;
   - **usuário de cliente**: busca por `username`/`email`, confere o **scrypt** e emite o cookie
     `kind: "client"` com `userId` (e `clientId` quando o usuário tem **um só** cliente ativo).
   Resposta: `{ authenticated: true, redirectTo }` — `/dashboard` (dono) ou `/cliente` (cliente).
4. O cliente navega para `next` (se for caminho relativo do app) ou para o `redirectTo` do servidor.

Entrada por URL: `GET /api/auth/client-login?t=…` resolve o token (`usr_…` do usuário ou `cli_…` do
cliente → usuário padrão), grava o cookie de sessão e **redireciona** para `/cliente` (o token some da
URL). Token inválido leva ao `/login` com aviso.

## Sessão

- Cookie `opex_session`, `httpOnly`, `sameSite=lax`, `path=/` e `secure` **apenas quando a requisição
  chega por HTTPS de fato** — detectado por `x-forwarded-proto` (proxy que termina TLS) ou pelo
  protocolo da URL, **nunca** por `NODE_ENV`. Acesso direto por **HTTP** (ex.: prévia em
  `http://IP:porta`) recebe o cookie **sem** `Secure` (senão o navegador o descartaria e o login não
  teria efeito). Lógica em `server/cookie.ts` (`isHttpsRequest`/`sessionCookieOptions`).
- **Cookie de sessão** (sem `maxAge`): expira ao fechar o navegador. O token carrega um teto de
  **30 dias** (`SESSION_MAX_AGE_SECONDS`) como rede de segurança.
- Token **stateless**: `base64url(payload).base64url(HMAC-SHA256)` com **Web Crypto**
  (`src/features/auth/session.ts`), que roda tanto no runtime Edge do middleware quanto no Node.
  O payload é **mínimo**: `{ iat, exp, kind, userId?, clientId? }`. Cookie antigo (sem `kind`) é
  **recusado**, exigindo novo login.
- Trocar o cliente selecionado (`POST /api/auth/client-select`) reemite o cookie preservando a
  expiração original.

## Autorização (Node) e guarda (Edge)

- **Middleware** (`src/middleware.ts` + decisão pura em `src/features/auth/paths.ts`): só confere a
  assinatura/validade do cookie e o `kind`.
  - `kind: "admin"` → app completo **e** portal (pré-visualização);
  - `kind: "client"` → só o portal (`/cliente/*` e `/api/cliente/*`); página interna → redirect para
    `/cliente`, API interna → 401. Uma exceção explícita e testada: os **anexos**
    (`/api/attachments/**`, `CLIENT_ALLOWED_API_PREFIXES`) — compartilhados com o dono e o portal, com
    cada rota resolvendo o ator e autorizando o escopo (`resolveAttachmentActor`).
- **Papéis finos** são conferidos no servidor Node, em cada requisição, com acesso ao banco
  (`src/features/auth/server/context.ts`): `requireAdminSession`, `requireClientActor` (resolve
  usuário ativo + vínculo com o cliente + `isAdmin`) e `assertClientAdmin`. Editar/excluir usuário,
  desativar cliente ou perder o vínculo bloqueiam o acesso **na hora**; trocar senha/token **não**
  encerra sessões já emitidas (cookie stateless).

## Pré-visualização do dono

`GET /api/auth/preview-client?clientId=…` (só dono) grava o cookie `opex_preview_client` e abre
`/cliente/dashboard`. O layout do portal usa esse cookie para resolver o cliente quando a sessão é
`admin`; a barra de contexto mostra o aviso e o atalho de volta ao Opex. O cookie é limpo no logout.

## Guarda de acesso — rotas liberadas sem sessão

- `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/client-login`;
- `/cliente` (exato) — entrada do portal (resolve `?t=` e a escolha de cliente);
- `/api/v1/*` — API pública por token de sistema (`requireApiToken`);
- `/api/routines/*` — tick do agendador (token de cron);
- `/api/maddox/mcp/*` — servidor MCP do Opex chamado pelo OpenCode (Agente Maddox), autenticado pelo
  segredo derivado da chave das integrações e com o escopo conferido pela sessão (ver `maddox-agent.md`);
- `/api/openapi.json` e `/api/docs` — só o contrato OpenAPI, nenhum dado.

`next` é gravado sem o subcaminho público (`normalizePath` remove o `BASE_PATH`), e o formulário
descarta destino externo (open redirect).

## Sair

`LogoutButton` no rodapé do menu: no desktop fica dentro do **popover** aberto pelo avatar; na gaveta
do mobile fica inline. Chama `POST /api/auth/logout` (apaga o cookie de sessão e o de pré-visualização)
e recarrega para `/login`. Funciona igual no portal.

## Rate limit

`src/features/auth/server/rate-limit.ts` — contador por IP em memória (sem Redis). O sucesso limpa a
chave; a janela deslizante é de 15 min.

## Arquivos

- `src/app/login/page.tsx` — rota (metadata + `robots: noindex`, avisos de link do portal).
- `src/app/api/auth/{login,logout,client-login,client-select,preview-client}/route.ts`.
- `src/middleware.ts` — guarda (por tipo de sessão).
- `src/features/auth/` — `session.ts`, `paths.ts`, `schemas.ts`,
  `server/{auth-service,password,context,cookie,rate-limit}.ts`, `hooks/useLogin.ts`,
  `components/` (`LoginPage`, `LoginForm`, `LoginParticleBackground`, `LogoutButton`).
- `src/features/orcamentos/server/users.ts` — usuários de cliente (criação, vínculos, tokens).

## Testes

`__tests__/features/auth/`: `session`, `paths`, `paths-basepath`, `auth-service`, `password`,
`rate-limit`, `auth-routes`, `login-form`, `login-page`, `login-background`, `logout-button`.
`__tests__/features/orcamentos/portal-auth.test.ts` cobre a guarda do portal.
