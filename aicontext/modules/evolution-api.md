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
- **Testar** (inclusive a verificação periódica): `GET /instance/fetchInstances` confere o alcance e a chave (rota
  local da Evolution, só Postgres); depois, `GET /` só para a versão, com timeout de 5 s (`VERSION_TIMEOUT_MS`), e
  a falha dela vira "Versão indisponível agora", sem mudar o resultado. O `GET /` da 2.3.8 consulta
  `web.whatsapp.com` a cada chamada (sem timeout) e trava quando essa consulta externa demora, mesmo com a Evolution
  no ar; por isso não serve de teste de alcance. Amarelo quando a instância padrão não existe, está desconectada
  ou não tem o webhook do Opex.

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
- **Prévia e não lidas** (OPE-197, aba Conversas do Secretário): cada `MESSAGES_UPSERT` grava em `evolution_contacts`
  a prévia da última mensagem (`lastMessage`: texto com o marcador da mídia, até 200 caracteres, o tipo e se é do
  dono) e as não lidas (`unreadCount`): recebida soma 1 (fora da conversa consigo mesmo), `fromMe` zera (como o
  WhatsApp ao responder) e `CHATS_UPSERT`/`CHATS_UPDATE` e o `findChats` da sincronização gravam o
  `unreadMessages`/`unreadCount` que a Evolution mandar. Reação e protocolo não mexem na prévia. A prévia nunca vai
  para log, auditoria nem evento. O Opex nunca marca como lida por causa da tela (decisão do dono D6, 26/11/2026).
- Depois de gravar o cache (e antes do turno do Secretário, que espera o agrupamento), `MESSAGES_UPSERT`,
  `MESSAGES_UPDATE` (status de entrega/leitura, edição) e o `CHATS_UPDATE` com não lidas publicam
  `secretary-chat-updated` (`{ chatId }`) quando a instância é a do Secretário (`publishSecretaryChatUpdated`).
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
- Enviar mensagem de teste (número + texto; o texto não vai para a auditoria; o id fica em `secretary_sent`, com
  `origin: "test"`, para que a volta como `fromMe` não pause a conversa no Agente Secretário e a aba Conversas não
  ponha nela o selo "Secretário"), listar conversas, contatos e
  grupos com foto, e consultar se um número tem WhatsApp (`chat/whatsappNumbers`).

## Conversa (aba Conversas do Secretário, OPE-197)

Parte genérica de WhatsApp da conversa do Secretário (ver `secretary-agent.md`, "Conversas"):

- `chat-message.ts` (puro): mensagens da Evolution no formato da conversa (`ChatMessageDto`): texto, mídia (tipo,
  mimetype, nome, duração, voz), citação (id, trecho e autor), localização, contatos (número do vCard), reações
  agregadas na mensagem alvo (a última de cada autor vale; vazia remove), edição aplicada, revogada vira "Mensagem
  apagada", status (`SERVER_ACK` enviada, `DELIVERY_ACK` entregue, `READ`/`PLAYED` lida, `ERROR` falha) e registros
  técnicos fora. Campo ausente vira neutro. O `parseEvolutionMessage` do turno continua separado. Reação, edição ou
  apagar cujo alvo está em outra página sai em `effects` da página (`buildChatPage`) e o cliente reaplica ao juntar
  as páginas (`applyChatEffects`).
- Rota de mídia (`mediaResponseHeaders`): o tipo vem do remetente, então só imagem JPG/PNG/WEBP/GIF, vídeo e áudio saem
  inline; qualquer outro (HTML, SVG, PDF…) vai como `application/octet-stream` em `attachment`, sempre com
  `X-Content-Type-Options: nosniff` e `Content-Security-Policy: sandbox; default-src 'none'`.
- `chat-media-rules.ts` (puro, cópia das regras do Atendimento do Zaturno CRM, sem figurinha): foto JPG/PNG até 5 MB,
  vídeo MP4/3GP até 16 MB, áudio (inclui o `audio/webm` gravado no navegador) até 16 MB e documento (PDF, Office, TXT,
  CSV) até 100 MB, até 10 por envio, com as mensagens de recusa em pt-BR.
- `server/chat.ts`: página da linha do tempo pelo `findMessages` (50 por página, sem cópia das mensagens no Opex),
  por cursor de data (`fetchConversationMessages`: lê cada `remoteJid` da conversa até o cursor, junta em ordem
  decrescente, descarta ids repetidos — a Evolution grava linhas duplicadas — e corta em 50; o cursor seguinte é o
  segundo da mais antiga, recuando 1 s se não andou), o histórico recente do turno e da Simulação do Secretário
  (`recentConversationMessages`), envios (`sendText` com citação, `sendReaction`, `sendLocation`, `sendContact`, `sendMedia` em base64 e
  `sendWhatsAppAudio`, que converte para voz) e o binário da mídia (`getBase64FromMediaMessage`).
- O corpo dos anexos passa pelo middleware: `experimental.proxyClientMaxBodySize` vale `101mb` no `next.config.ts`
  (o padrão de 10 MB cortaria os documentos).

## Endereçamento por LID (OPE-207)

Quando o WhatsApp passa a endereçar um contato pelo `<lid>@lid`, a Evolution 2.3.8 grava as mensagens novas nesse
`remoteJid` (com o número em `remoteJidAlt`, quando vem) e as antigas continuam no número; o `findMessages` só filtra
por `remoteJid` exato, e as tabelas `Contact`, `Chat` e `IsOnWhatsapp` da Evolution não guardam a correspondência.

- `lidAliasOf` (puro, `message.ts`): `@lid` com `remoteJidAlt` de número gera `{ lid, pn }`.
- O contato do número guarda `lidJid` (`evolution_contacts`, índice `instance_lid`), aprendido no webhook
  (`MESSAGES_UPSERT`) e preenchido pelo **Sincronizar** a partir da `lastMessage` de cada conversa do `findChats`
  (`server/lid.ts`, `rememberLidAliases`, que também marca o contato do número como conversa, `hasChat`). Conversas cuja última mensagem não traz o `remoteJidAlt` só ganham a
  correspondência na próxima mensagem que trouxer.
- O webhook troca o `chatJid` de uma mensagem `@lid` **sem** `remoteJidAlt` pelo número quando a correspondência já é
  conhecida (ex.: resposta do dono pelo celular): prévia, não lidas, evento da conversa e turno do Secretário ficam na
  conversa do número. O mesmo vale para os JIDs de `MESSAGES_UPDATE`.
- `conversationJids` devolve as duas metades (número primeiro); a linha do tempo e o histórico do Secretário leem as
  duas. `lidAliases` devolve LID → número, para a lista de conversas juntar a metade LID na do número. A análise de
  personalidade ainda lê cada conversa pelo próprio JID (pendência).

## Debug, auditoria e tempo real

- Aba **Debug** monta o `IntegrationDebugConsole` (o botão do cabeçalho continua). As chamadas passam por
  `debugFetch` sem URL, corpo ou erro cru (a chave nunca aparece).
- Auditoria (`entidade: EvolutionApi`) em criar/excluir instância, conectar, reiniciar, desconectar, opções,
  registro do webhook, sincronização e mensagem de teste.
- Evento `evolution-updated` (`{ type, instance }`) em `private-app`; a imagem do QR não vai no payload.
- Coleções: `evolution_instances` (estado, perfil, QR/código, último evento, registro do webhook),
  `evolution_seen_events`, `evolution_contacts`.
