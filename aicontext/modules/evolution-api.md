# Evolution API (WhatsApp)

Integração `evolution-api` (OPE-192): o Opex fala com a Evolution API v2.3.8 que já está no ar (ambiente
`evolution-api` do módulo Ambientes) para conectar o WhatsApp do dono. É a base do Agente Secretário
(`secretary-agent.md`). Tela: `/integracoes/evolution-api` (página genérica de integração, ramo próprio no
`IntegrationEditor` → `EvolutionEditorForm`).

Código: `src/features/evolution-api/` (puros: `constants.ts`, `evolution-dto.ts`, `schemas.ts`, `message.ts`,
`webhook-parse.ts`, `prefill.ts`, `types.ts`; servidor em `server/`; telas em `components/`; hooks em
`hooks/useEvolution.ts`). Rotas em `src/app/api/evolution/**` e `src/app/api/integrations/evolution-api/prefill`.

## Configuração (aba Geral)

- Campos públicos: `internalUrl` (obrigatório, rede `evolution-network`, ex.: `http://evolution-api:8080`),
  `publicUrl` (links e o Manager em `/manager`), `defaultInstance` (instância usada pelo Opex) e `version`
  (informativo, vindo do ambiente).
- Privado: `apiKey` (chave global `AUTHENTICATION_API_KEY`, cifrada).
- Gravados só pelas rotas da integração (`group: "card"`): `webhookUrl` e o privado `webhookSecret` (gerado no
  servidor com `randomBytes`, nunca exibido).
- Nenhum campo declara `env` (configuração só pela tela). Debug pelo Pusher (`streamsDebugOverPusher`).
- **Pré-preenchimento**: sem configuração salva, `GET /api/integrations/evolution-api/prefill` lê o ambiente
  `evolution-api` NO SERVIDOR (`resolveEnvironmentRef` + `envVarsOf`) e devolve URL interna
  (`http://evolution-api:<SERVER_PORT|8080>`), URL pública (`SERVER_URL`), versão (`EVOLUTION_VERSION`),
  `keyAvailable` e a URL padrão do webhook. **A chave nunca é devolvida**: a tela mostra "Chave disponível no
  ambiente" e, ao salvar, `POST` na mesma rota grava o formulário e a chave lida de novo do ambiente
  (`updateIntegration`). Com a integração já salva, o ambiente não é lido.
- **Testar**: `GET /` (alcance e versão) e `GET /instance/fetchInstances` (chave válida). Amarelo quando a
  instância padrão não existe, está desconectada ou não tem o webhook do Opex.

## Instância (aba Instância)

- Criar (`instance/create`, com `syncFullHistory`) ou escolher a instância (vira a `defaultInstance`).
- Estado ao vivo: **Desconectada** / **Aguardando leitura** / **Conectada** (`connectionStateOf`), com
  consulta a cada 8 s e o evento `evolution-updated`.
- **Conectar** registra antes o webhook (registro automático) e chama `instance/connect`:
  - QR code: imagem com contagem regressiva (`EVOLUTION_QR_TTL_MS`), renovada pelos eventos `QRCODE_UPDATED` até
    o limite (`EVOLUTION_QR_LIMIT`); no limite a tela volta para Desconectada com "Gerar novo QR";
  - código de pareamento: o dono informa o número (DDI + DDD) e o código aparece em fonte grande.
- Perfil conectado (foto, nome, número), **Reiniciar** (`POST instance/restart`), **Desconectar**
  (`DELETE instance/logout`) e **Excluir instância** (`DELETE instance/delete`), cada um com confirmação.
- Opções (`settings/set`): rejeitar chamadas, ignorar grupos, sempre online, sincronizar histórico completo e ler
  status. **Ler mensagens fica sempre desligada e travada** ("O Agente Secretário controla a leitura das
  mensagens"): o Opex sempre envia `readMessages: false`.

## Webhook

- Entrada: `POST /api/evolution/webhook` (em `PUBLIC_ROUTES`), autenticada **só** pelo header
  `x-opex-webhook-secret` (`timingSafeEqual`); sem ele ou errado → 401. Responde 204 na hora e processa em
  `runAfterResponse`.
- URL padrão pela rede Docker: `http://opex-<PORT>:<PORT>/api/evolution/webhook` (alias `opex-${PORT}` do
  serviço `app` na rede `evolution-network`, ver `deployment.md`); pode ser trocada pela pública na aba Webhook.
  A URL fica salva: uma prévia (mesmo banco) registra a mesma URL da produção.
- **Registrar na instância** chama `webhook/set/{instance}` com os eventos `CONNECTION_UPDATE`, `QRCODE_UPDATED`,
  `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONTACTS_UPSERT`, `CONTACTS_UPDATE`, `CHATS_UPSERT`, `CHATS_UPDATE` e o
  header com o segredo. A aba mostra se o registro bate com o esperado e o último evento recebido (data, evento,
  resultado).
- Mensagem repetida (mesmo `<instância>:<id>`) é descartada pela coleção `evolution_seen_events` (TTL 7 dias);
  instância desconhecida é ignorada e logada. O `apikey` que a Evolution manda no corpo nunca é logado nem
  gravado.
- Mensagens novas vão para o Agente Secretário (`handleIncomingMessage`, importado sob demanda).

## Contatos e operações (aba Operações)

- Cache `evolution_contacts` (nome, pushName, foto, grupo, se tem conversa e última mensagem), alimentado pelos
  eventos de contatos/conversas, pelas mensagens recebidas e por **Sincronizar fotos e nomes**
  (`findContacts`, `fetchAllGroups`, `findChats`). Serve aos seletores com foto (`ConversationPicker`, sobre o
  `AvatarLabel` compartilhado com o GitHub), à aba Conversas do Secretário e aos rótulos dos canais de memória.
- Enviar mensagem de teste (número + texto; o texto não vai para a auditoria), listar conversas, contatos e
  grupos com foto, e consultar se um número tem WhatsApp (`chat/whatsappNumbers`).

## Debug, auditoria e tempo real

- Aba **Debug** monta o `IntegrationDebugConsole` (o botão do cabeçalho continua). As chamadas passam por
  `debugFetch` sem URL, corpo ou erro cru (a chave nunca aparece).
- Auditoria (`entidade: EvolutionApi`) em criar/excluir instância, conectar, reiniciar, desconectar, opções,
  registro do webhook, sincronização e mensagem de teste.
- Evento `evolution-updated` (`{ type, instance }`) em `private-app`; a imagem do QR não vai no payload.
- Coleções: `evolution_instances` (estado, perfil, QR/código, último evento, registro do webhook),
  `evolution_seen_events`, `evolution_contacts`.
