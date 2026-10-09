# Módulo: Go! Sipal (integração e sessão)

Conexão do app com o **Go! Sipal** (`https://go.sipal.com.br`, código em
`~/code/sap-painel-lancamento`), usada pelo módulo Tarefas (tarefas e timers do Centro de
Desenvolvimento). Toda configuração fica em **Integrações › Go! Sipal**; **não há fallback do
`.env`**.

## Contrato da plataforma (rotas internas da UI, conferidas no código)

| Rota | Uso | Respostas relevantes |
|---|---|---|
| `POST /api/auth/send-code` `{ email }` | Envia código de 6 dígitos (vale 15 min) | 400 e-mail inválido · 403 domínio não autorizado · 503/500 indisponível |
| `POST /api/auth/verify-code` `{ email, code }` | Troca o código pelo JWT | `{ token, user }` · 400 código inválido/expirado/inexistente · 404 usuário · 403 inativo |
| `GET /api/auth/me` (Bearer) | Usuário da sessão | `{ user }` · 401 token inválido/expirado · 404 inativo |
| `/api/dev-center/*` (Bearer) | Tarefas e timers | 403 sem `isDeveloper`/`isDevLeader`/admin |

- Pedir um código substitui o anterior (inclusive um pedido pelo navegador). JWTs já emitidos
  continuam válidos.
- JWT `{ userId, email, name, userType, exp }`, **28 dias**, sem refresh nem logout na plataforma.

## Configuração (catálogo `go_sipal`)

- Campos editáveis: **URL da plataforma** (`baseUrl`, padrão `https://go.sipal.com.br`, só
  origem), **E-mail** (`email`, obrigatório) e **Aviso de expiração** (`expiryWarningDays`, padrão
  3, 1–27 dias).
- Campos de card (`group: "card"`, fora do PATCH genérico): segredo `token` (JWT, cifrado) e
  `GO_SIPAL_SESSION_FIELDS` (nome, e-mail, tipo, `isDeveloper`, `isDevLeader`, conectado em,
  login pendente: e-mail e horário do pedido).

## Sessão (`src/features/go-sipal/session/`)

- `getGoSipalSession()` → `GoSipalSessionDto` (nunca o token): `status` (`disconnected`,
  `connected`, `expiring` quando faltam ≤ `expiryWarningDays` dias, `expired`), usuário, conectado
  em, `expiresAt` (lido do `exp` do JWT sem verificar assinatura, `jwt.ts`), `daysLeft`
  (arredondado para cima) e `pending` (login aguardando código; pode coexistir com sessão ativa =
  renovação).
- `sendGoSipalCode`: exige e-mail salvo (409), espera de 60 s entre pedidos (429), repassa os
  erros da plataforma (403 domínio → 403; 4xx → 400; indisponível → 502). Grava o login pendente.
- `verifyGoSipalCode(code)`: exige login pendente (409) e não expirado (400, 15 min). Grava o JWT
  cifrado (`secretValues.token`; sem `INTEGRATIONS_ENCRYPTION_KEY` → 409) e os dados do usuário,
  apaga o pendente e roda o teste de conexão em segundo plano. Código inválido mantém o pendente.
- `cancelGoSipalCode`: apaga só o pendente. `disconnectGoSipal`: grava `token = null` e apaga os
  dados da sessão.
- Auditoria (`entidade: "Integracao"`, `entidadeId: "go_sipal"`): pedido de código (`EXECUTAR`),
  `LOGIN` e `LOGOUT` — nunca o token nem o código. Evento Pusher `session-updated` (payload vazio)
  em `private-integration-go_sipal`.

## Cliente (`src/features/go-sipal/client.ts`, somente servidor)

- `goSipalRequest(path, { method, body, formData, auth, token, signal, label })`: URL e JWT da
  integração (`formData` = multipart, ex.: anexos da tarefa),
  timeout 30 s, `redirect: "manual"`, debug só com método/URL/status (nunca o corpo).
- Erros `GoSipalError` com `code`: `NOT_CONFIGURED` (sem sessão), `UNAUTHENTICATED` (401 com
  Bearer → "Sessão … expirada ou inválida"), `FORBIDDEN` (403, mensagem da plataforma),
  `REJECTED` (outros 4xx), `UNAVAILABLE` (rede, timeout, 3xx, 5xx).
- `GoSipalError.body` guarda o JSON da recusa (ex.: `requiresCommitUrl` ao mover tarefa).
- Usado pelos módulos Tarefas (`modules/tasks.md`) e Controle de horas (`modules/time.md`).

## Teste de conexão (status da integração)

`GET /api/auth/me`: 🔴 sem token, expirado ou 401; 🟡 (`warnResult`) usuário sem perfil de
desenvolvedor ou faltando ≤ `expiryWarningDays` dias; 🟢 caso contrário. O health check dos Crons
(a cada 5 min) mantém o status atualizado.

## Tela — card "Sessão Go! Sipal" (`src/features/go-sipal/components/`)

Primeiro card da página da integração (`GoSipalSessionCard`):

- **Desconectado**: e-mail salvo + **Enviar código** (bloqueado com tooltip se o formulário tem
  alterações não salvas ou não há e-mail).
- **Aguardando código** (`GoSipalCodeForm`): contagem dos 15 min, campo único de 6 dígitos
  (`autoComplete="one-time-code"`, aceita colar com espaços) que **confirma sozinho** ao completar;
  erro no próprio campo com tremida e campo limpo; **Reenviar** (após 60 s) e **Cancelar**.
- **Conectado** (`GoSipalSessionInfo`): nome, e-mail, tipo, perfil, conectado em e expiração
  ("faltam N dias"; amarelo em `expiring`, vermelho em `expired`); **Desconectar** (confirmação),
  **Verificar agora** (teste de conexão com toast) e **Renovar sessão**/**Entrar novamente**.
- Hooks: `useGoSipalSession` (refetch a cada 60 s), `useGoSipalSessionLive` (Pusher) e as
  mutações em `src/features/go-sipal/hooks/useGoSipalSession.ts`.

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/integrations/go_sipal/session` | Situação da sessão |
| `DELETE /api/integrations/go_sipal/session` | Desconecta |
| `POST /api/integrations/go_sipal/session/code` | Envia o código para o e-mail salvo |
| `DELETE /api/integrations/go_sipal/session/code` | Cancela o código pendente |
| `POST /api/integrations/go_sipal/session/verify` | `{ code }` (6 dígitos) → grava a sessão |

## Testes

`__tests__/features/go-sipal/session-service.test.ts` (estados, envio/espera, domínio recusado,
confirmação com JWT cifrado e auditoria sem token, código inválido/expirado, desconectar, tester
verde/amarelo/vermelho) e `__tests__/features/go-sipal/GoSipalSessionCard.test.tsx`.
