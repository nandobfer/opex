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
  servidor com `randomBytes`, nunca exibido). A criação do segredo é condicional (`server/webhook-secret.ts`: só
  grava se ainda não existe e relê o vencedor), então chamadas simultâneas ou outra instância do app no mesmo banco
  terminam com um único segredo, o mesmo registrado na Evolution.
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
- Perfil conectado no card "Conexão · Conectada" (`ConnectedProfile`, sobre o `AvatarLabel`): avatar (foto ou
  inicial), em cima o nome do WhatsApp (sem nome: "WhatsApp sem nome de exibição") e embaixo `@usuário · número`
  (só o número quando não há usuário), com a máscara de `formatPhoneNumber` (`phone.ts`, puro): celular BR
  `+55 (41) 9 8455-6795`, fixo BR `+55 (41) 3333-4444`, outros países `+<dígitos>`. Nome e foto vêm do
  `fetchInstances`; com a instância conectada, o `POST chat/fetchProfile` do número do dono completa nome, foto e o
  `username` quando a Evolution devolve (relido a cada 10 min, `EVOLUTION_PROFILE_REFRESH_MS`; falha só é logada) e,
  sem nome, vale o `pushName` do cache de contatos. Os eventos `CONNECTION_UPDATE` e o `fetchInstances` só gravam os
  campos de perfil que vieram preenchidos (`filledProfileFields`): um evento sem o nome não apaga o nome salvo. O
  skeleton do card tem o avatar e as duas linhas. **Reiniciar** (`POST instance/restart`), **Desconectar**
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
- Mensagem do próprio dono (`fromMe`) num grupo com endereçamento por LID ensina o `ownerLid` da instância
  (`ownerLidOf`): menções e citações por `<lid>@lid` passam a contar como menção ao dono.

## Contatos e operações (aba Operações)

- Cache `evolution_contacts` (nome, pushName, foto, grupo, se tem conversa e última mensagem), alimentado pelos
  eventos de contatos/conversas, pelas mensagens recebidas e por **Sincronizar fotos e nomes**
  (`findContacts`, `fetchAllGroups`, `findChats`; `POST /api/evolution/contacts`). A ação é o componente
  compartilhado `EvolutionSyncAction` (botão com carregamento, toast e as contagens), usado também na aba Conversas
  vazia do Secretário e ao lado dos seletores de conversa vazios (`ConversationPickerField`); sem instância
  escolhida, mostra um link para a aba Instância. Serve aos seletores com foto (`ConversationPicker`, sobre o
  `AvatarLabel` compartilhado com o GitHub), à aba Conversas do Secretário e aos rótulos dos canais de memória.
- Enviar mensagem de teste (número + texto; o texto não vai para a auditoria; o id fica em `secretary_sent` para que
  a volta como `fromMe` não pause a conversa no Agente Secretário), listar conversas, contatos e
  grupos com foto, e consultar se um número tem WhatsApp (`chat/whatsappNumbers`).

## Debug, auditoria e tempo real

- Aba **Debug** monta o `IntegrationDebugConsole` (o botão do cabeçalho continua). As chamadas passam por
  `debugFetch` sem URL, corpo ou erro cru (a chave nunca aparece).
- Auditoria (`entidade: EvolutionApi`) em criar/excluir instância, conectar, reiniciar, desconectar, opções,
  registro do webhook, sincronização e mensagem de teste.
- Evento `evolution-updated` (`{ type, instance }`) em `private-app`; a imagem do QR não vai no payload.
- Coleções: `evolution_instances` (estado, perfil, QR/código, último evento, registro do webhook),
  `evolution_seen_events`, `evolution_contacts`.
