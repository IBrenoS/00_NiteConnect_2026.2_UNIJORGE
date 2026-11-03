# Reuniões — contrato backend

**Escopo:** backend das Etapas 2 e 3. Sem frontend visual, mudança no shell, migração de Agenda ou integração com presença B04.

## Autenticação, configuração e permissões

As rotas exigem bearer Entra v2 destinado à API NITE. O backend resolve `(tid, oid)` pelo cadastro institucional e exige vínculo `ATIVO`; o cliente não escolhe o organizador. O token recebido é usado somente como assertion do fluxo On-Behalf-Of (OBO), nunca como bearer Graph.

O MSAL4J usa o registro confidencial da API (`ENTRA_AUDIENCE`) e aquisição delegada por OBO. O cache padrão da `ConfidentialClientApplication` permanece em memória no processo; tokens não são persistidos nem registrados em logs. Não há suporte implementado para certificado como credencial, somente client secret por ambiente.

| Variável | Uso | Padrão |
|---|---|---|
| `MEETINGS_GRAPH_ENABLED` | Liga criação/edição/cancelamento via Graph | `false` |
| `ENTRA_API_CLIENT_SECRET` | Credencial confidencial OBO da API | ausente/desliga o OBO |
| `ENTRA_TENANT_ID` | Tenant single-tenant usado pelo Resource Server/OBO | configuração Entra atual |
| `ENTRA_AUDIENCE` | Client ID da API usado como OBO client | configuração Entra atual |
| `MEETINGS_GRAPH_BASE_URL` | Base Graph v1.0, sobrescrevível para testes locais | `https://graph.microsoft.com/v1.0` |
| `MEETINGS_GRAPH_CONNECT_TIMEOUT` | Timeout de conexão | `PT5S` |
| `MEETINGS_GRAPH_REQUEST_TIMEOUT` | Timeout por chamada HTTP Graph | `PT20S` |
| `MEETINGS_GRAPH_ATTENDANCE_ENABLED` | Habilita leitura delegada de relatórios | `false` |

Para localhost, a API pode continuar em `http://localhost:8080` e o callback existente do web app não muda. O OBO é backend-to-backend e não exige novo redirect URI. A API precisa estar registrada como cliente confidencial, com `Calendars.ReadWrite` **delegada** no Microsoft Graph e credencial válida fornecida por variável segura. Na referência Graph, esse escopo delegado não exige consentimento administrativo por definição; a política de consentimento do tenant pode impedir que usuários o concedam individualmente.

### Diagnóstico institucional do OBO — 2026-11-02

Uma tentativa real de aquisição OBO chegou ao endpoint de tokens da UniJorge e retornou `AADSTS65001` (`invalid_grant`): o usuário ou administrador ainda não consentiu com a permissão Graph usada pela API. O token Graph não foi emitido; portanto, a chamada não chegou ao Graph e nenhum evento/reunião foi criado. Isso não comprova licença, capacidade Teams ou operação Graph.

No portal Entra, foi confirmado que o registro `NITE Connect API` declara `Calendars.ReadWrite` como permissão delegada, com “Admin consent required: No”. Não há grant delegado Graph efetivo para usuário ou administrador. Após autorização explícita, o manifesto da API foi atualizado para listar o App ID do Web em `knownClientApplications`; o Web já declarava `access_as_user` da API. O registro Web usa um App ID distinto da API. O login normal continua solicitando `openid profile email offline_access` e `access_as_user`; não solicita Graph. A conta desta inspeção não pôde verificar a política efetiva de consentimento da UniJorge.

O OBO não pode abrir uma tela de consentimento no backend. A alternativa sem grant administrativo tenant-wide é solicitar consentimento combinado no cliente Web para `api://<API_CLIENT_ID>/.default` com `openid`, sem misturar escopos dinâmicos nessa requisição. O API ID consta em `knownClientApplications` do backend e o Web declara `access_as_user` como recurso requerido. Isso permite combinar os grants, mas não contorna a política do tenant. A política gerenciada recomendada atualmente pela Microsoft exclui `Calendars.ReadWrite` do consentimento individual de usuário; se a UniJorge usar essa política, a mensagem de aprovação administrativa é esperada mesmo com o catálogo Graph dizendo “Admin consent required: No”. A política da UniJorge ainda precisa ser confirmada.

O fluxo local foi testado uma vez com `prompt=consent` e o Entra exibiu “Necessidade de aprovação de administrador”. Essa tela não discriminou as permissões e o usuário retornou sem autorizar. Como `prompt=consent` também aparece no diagnóstico oficial Microsoft, foi removido da repetição controlada. O link e o `.default` permanecem; a próxima execução só deve ser feita uma vez. Uma página de diagnóstico dev redireciona para uma consulta Graph somente de leitura depois do callback bem-sucedido.

Se o consentimento individual estiver bloqueado, as alternativas institucionais são (a) um administrador conceder consentimento **delegado** tenant-wide para `Calendars.ReadWrite`, mantendo o OBO limitado ao usuário autenticado; ou (b) um administrador definir uma política de consentimento mais restrita que autorize esse escopo para um grupo controlado e depois permitir consentimento individual nesse grupo. Reestruturar o Web e a API para um único registro não elimina a política de consentimento. Sem consentimento Graph, `TEAMS_LINK` permite que o organizador crie/edite/cancele a reunião manualmente no Teams, vincule o URL e mantenha convites e histórico internos no NITE. Essas ações externas não são sincronizadas automaticamente.

Relatórios usam, somente quando explicitamente habilitados, `OnlineMeetingArtifact.Read.All` **delegada** via OBO. A permissão delegada também não exige admin consent por definição na referência Graph atual; política do tenant pode exigir aprovação. Não se solicita permissão de aplicação, `OnlineMeetings.Read` ou acesso autônomo. Sem escopo autorizado, licença/caixa do organizador ou capacidade `teamsForBusiness`, a operação não é confirmada.

## Estados

### Reunião

- `CRIACAO_PENDENTE`: operação local gravada, criação Microsoft sem confirmação.
- `AGENDADA`: Graph confirmou evento, ID e link Teams HTTPS; não afirma que a chamada ocorreu.
- `SINCRONIZACAO_PENDENTE`: atualização/cancelamento está em processamento ou aguarda reconciliação.
- `CANCELADA`: cancelamento Microsoft confirmado.
- `FALHA_PROVEDOR`: criação foi rejeitada definitivamente; não existe reunião confirmada.
- `AGUARDANDO_TEAMS`: registro interno `TEAMS_LINK` aguardando criação inicial ou atualização manual no Teams; não há entrada disponível.

O campo `provider` é `GRAPH` ou `TEAMS_LINK`. `providerState` distingue `AGUARDANDO_CRIACAO_NO_TEAMS`, `LINK_CONFIRMADO_PELO_ORGANIZADOR`, `ATUALIZACAO_PENDENTE_NO_TEAMS` e `CANCELAMENTO_NAO_SINCRONIZADO`. O estado `AGENDADA` em `TEAMS_LINK` significa somente que o organizador vinculou um link oficial; não comprova que o evento Microsoft continua inalterado nem que a reunião ocorreu. `CANCELADA` em `TEAMS_LINK` é cancelamento interno e exige cancelamento separado no Teams.

`plannedDurationMinutes/plannedEndsAt` são previstos. `actualStartsAt/actualEndsAt/actualDurationSeconds` permanecem nulos até relatório real. O fim do horário previsto nunca altera sozinho o estado para encerrada. Calendário Graph não fornece sinal de chamada ao vivo; `HORARIO_DE_INICIO` e `FIM_PREVISTO` são apenas tipos previstos do esquema e não há despachante de lembretes nesta etapa.

### Operações e convites

Operações persistidas: `PROCESSANDO`, `CONFIRMADA`, `FALHA_PROVEDOR`, `RESULTADO_INDETERMINADO`. Na resposta `202`, `PROCESSANDO` é exposto como `PENDENTE`; o identificador, `retryAfter` e `retryable` orientam a repetição. O cliente deve repetir exatamente o mesmo comando com a mesma `Idempotency-Key` após `retryAfter`; a criação reaproveita o mesmo `transactionId` Graph. Não há worker automático de reconciliação nesta etapa.

Resposta interna de convite: `PENDENTE`, `ACEITO`, `RECUSADO`, `REVOGADO`, com versão individual. `calendarResponseStatus` é campo independente e fica `NAO_SINCRONIZADO` até uma leitura Graph comprovada. Responder no NITE Connect não responde no Outlook/Teams.

Notificações internas implementadas: convite recebido, resposta aceita/recusada, reunião alterada e reunião cancelada. As notificações são gravadas depois da confirmação da operação externa correspondente; Graph já pode enviar o e-mail de calendário, então o NITE não duplica esses e-mails. Não há sincronização de respostas Outlook. Notificações de horário previsto/encerramento ainda não são emitidas.

## Endpoints

Prefixo `/api/v1`; paginação começa em zero, `size` padrão 20 e máximo 100. Listas retornam `{items,page,size,total}`. Os DTOs de reunião não incluem e-mail de integrante, tokens ou `joinUrl`.

| Método | Caminho | Contrato |
|---|---|---|
| `GET` | `/meetings/calendar/capabilities` | Integrante ativo; executa OBO e consulta somente leitura `/me/calendar` para provedores online. `200` confirma OBO e Graph para o organizador autenticado; inclui provedores permitidos e padrão. Erros retornam somente status/código interno NITE. `Cache-Control` inclui `no-store`; não persiste dados. |
| `GET` | `/meetings/invitees?q=&page=&size=` | Integrante ativo; pesquisa literal por nome entre ativos; somente `id,name`. |
| `POST` | `/meetings` | Integrante ativo; `Idempotency-Key`; cria imediata/agendada. `201` após confirmação Graph e gravação local; `202` se operação pendente/incerta. |
| `GET` | `/meetings/{id}/teams-continuation` | Somente organizador de reunião `TEAMS_LINK` em espera. Retorna deep link oficial preenchido para agendamento ou instruções para Reunir agora/editar no Teams. Abrir o link não confirma criação. |
| `POST` | `/meetings/{id}/teams-link` | Somente organizador; `expectedVersion` e URL oficial Teams. Vincula o link e só então libera `join` e notificações internas. Repetir o mesmo link é idempotente. |
| `GET` | `/meetings?scope=upcoming\|past\|cancelled&page=&size=` | Organizador ou convidado ativo não revogado; canceladas são uma lista independente e não aparecem como compromisso futuro/anterior ativo. As listas `upcoming`/`past` usam o fim previsto, sem inferir realização. |
| `GET` | `/meetings/{id}` | Organizador vê convidados; convidado vê seus próprios dados de convite. |
| `PATCH` | `/meetings/{id}` | Organizador ativo; substitui título, início, duração e lista de convidados; exige `expectedVersion` e `Idempotency-Key`. `200` ou `202`. |
| `POST` | `/meetings/{id}/cancel` | Organizador ativo; `expectedVersion`, comentário opcional e `Idempotency-Key`. `200` após Graph; `202` incerto. |
| `PUT` | `/meetings/{id}/my-response` | Convidado ativo; resposta interna `ACEITO`/`RECUSADO` e versão do convite. |
| `GET` | `/meetings/{id}/join` | Organizador ou convidado ativo não revogado; `303` para o link oficial Teams; `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. |
| `GET` | `/meetings/{id}/share` | Retorna caminho web relativo `/reunioes/{id}/entrar` e texto para compartilhamento manual; não envia mensagem. |
| `GET` | `/meetings/{id}/attendance` | Somente organizador; lê/salva o último relatório se habilitado, senão retorna estado disponível localmente ou `INDISPONIVEL`. |
| `GET` | `/me/notifications?page=&size=` | Integrante ativo; somente notificações próprias. |
| `POST` | `/me/notifications/{notificationId}/read` | Proprietário autenticado marca leitura; operação idempotente. |

`404` oculta reunião/convite/notificação fora do contexto do solicitante. Organizador e convidado precisam permanecer ativos para operar. Teams mantém suas próprias regras de lobby, admissão e licença; o redirect NITE não promete acesso exclusivo nem substitui a aplicação Teams.

## Criação

```http
POST /api/v1/meetings
Authorization: Bearer <token-para-a-api-nite>
Idempotency-Key: <chave-opaca-estavel>
Content-Type: application/json
```

```json
{
  "mode": "IMMEDIATE",
  "title": "Revisão do protótipo",
  "startsAt": null,
  "plannedDurationMinutes": null,
  "inviteeIds": ["<member-uuid>"]
}
```

`provider` é opcional para retrocompatibilidade e assume `GRAPH`. `IMMEDIATE` usa `Clock.instant()` do servidor e assume duração prevista de 60 minutos se omitida. `startsAt` deve ser nulo. Isso não encerra automaticamente a chamada. `SCHEDULED` exige `startsAt` ISO-8601 com offset e duração prevista positiva. Instantes são persistidos em UTC; apresentação institucional deve usar `America/Bahia`.

Ambos os modos criam evento em `/me/events` do organizador com `isOnlineMeeting=true`, `onlineMeetingProvider=teamsForBusiness`, convidados de calendário e `transactionId`. O backend primeiro consulta `/me/calendar.allowedOnlineMeetingProviders`. Só confirma a reunião depois de obter `event.id`, `isOnlineMeeting`, provider Teams e `onlineMeeting.joinUrl` HTTPS, e persistir a referência local. Mesmo key e corpo repetido retornam a operação/reunião anterior; corpo diferente com a mesma key gera `409`.

Com `provider: "TEAMS_LINK"`, `201` cria somente o registro NITE, com `status=AGUARDANDO_TEAMS` e `providerState=AGUARDANDO_CRIACAO_NO_TEAMS`; não chama Graph nem confirma evento/link Microsoft. `GET /{id}/teams-continuation` para agendadas devolve `https://teams.microsoft.com/l/meeting/new` com assunto, instantes com offset `America/Bahia` e UPNs dos convidados ativos, codificados como `%20`. Portanto, ao abrir esse endereço, os UPNs selecionados são enviados à Microsoft e podem ser vistos pelo organizador no formulário. O NITE não envia e-mail; o Teams/Outlook pode enviar convites quando o organizador salvar. O organizador revisa e salva no Teams, copia o link oficial e o envia ao endpoint `teams-link`. Para imediatas, não existe deep link público documentado que inicie uma reunião e devolva o link; o endpoint direciona ao Teams com instruções para Calendário > Reunir agora > Obter um link para compartilhar.

O link manual precisa usar HTTPS, host exato `teams.microsoft.com` e rota de entrada reconhecida (`/meet/{id}?p=...` ou `/l/meetup-join/...?...context=...`). URLs arbitrárias, credenciais embutidas, fragmentos e domínios parecidos são rejeitados. NITE armazena o URL de entrada como segredo de reunião e não o expõe no DTO; `/join` redireciona somente organizador ou convidado ativo não revogado.

A API Graph independente `POST /me/onlineMeetings` também é viável com `OnlineMeetings.ReadWrite` delegado, mas cria uma reunião sem evento no calendário Outlook. Ela não foi escolhida: adicionaria uma permissão e uma segunda integração para o modo imediato, enquanto o evento de calendário suporta os dois modos e prepara o Calendário transversal. Só adotar essa alternativa para `IMMEDIATE` se a prova real demonstrar que o tenant não aceita evento iniciado no instante corrente; manter o mesmo agregado NITE e persistir claramente que essa reunião não possui evento Outlook.

O uso de evento de calendário para início imediato ainda depende de prova no tenant: o Graph exige início e fim e o tenant precisa aceitar evento iniciado no instante corrente. Se a criação atual falhar nesse caso, comparar com `POST /me/onlineMeetings` delegado apenas para `IMMEDIATE`, mantendo o mesmo agregado interno; não criar duas experiências locais.

## Atualização, cancelamento e respostas

PATCH recebe corpo completo dos campos alteráveis e `expectedVersion`. Para `GRAPH`, a versão é bloqueada antes da chamada externa; atualizações concorrentes em versão antiga recebem `409`. Alterações aos convidados atualizam attendees Graph e os registros internos; convites removidos são marcados `REVOGADO`. A confirmação local e as notificações acontecem após Graph confirmar. Respostas internas não atualizam o calendário.

Para `TEAMS_LINK`, PATCH é exclusivamente local: limpa o link liberado, passa para `AGUARDANDO_TEAMS/ATUALIZACAO_PENDENTE_NO_TEAMS`, atualiza os convidados e registra histórico; não altera o evento Teams. O organizador deve editar o evento existente no Teams e vincular novamente o link. Cancelar `TEAMS_LINK` muda o estado NITE para `CANCELADA/CANCELAMENTO_NAO_SINCRONIZADO`, preserva o histórico e notifica convidados, mas não cancela no Teams. São operações locais idempotentes por `Idempotency-Key` e controladas por versão.

Cancelamento chama `POST /me/events/{eventId}/cancel` e muda o status local somente após resposta Graph. `401/403` ou rejeição definitiva são erro explícito; `429` respeita `Retry-After`; `5xx`, timeout ou falha após Graph sem confirmação local deixam operação recuperável e respondem `202`, nunca um falso sucesso. Repetir uma operação usa a mesma key/payload. Sem worker automático, o chamador deve iniciar essa repetição.

## Relatórios de participação

Com `MEETINGS_GRAPH_ATTENDANCE_ENABLED=true`, `GET /attendance` consulta `/me/onlineMeetings/{onlineMeetingId}/attendanceReports` e, quando há relatório, `/attendanceRecords`, incluindo paginação. O escopo adicional único é `OnlineMeetingArtifact.Read.All` delegado. O Graph gera relatório após o término, lista até os 50 relatórios mais recentes e documenta retenção de um ano a partir da reunião. `200` sem relatório é `PENDENTE`; falta de consentimento, permissão, meeting ID ou acesso é `INDISPONIVEL`; erros transitórios não escrevem tempos. A retenção da cópia NITE ainda exige decisão de privacidade institucional.

Só valores fornecidos pelo Graph alimentam os campos reais. O backend guarda início/fim/tempo efetivo, registros e intervalos; vincula uma pessoa NITE somente quando o `tenantId` e o object ID Graph correspondem a identidade conhecida. Dados sem associação permanecem sem `memberId`; e-mail e nome externo não são copiados. O snapshot importado é para consulta do organizador. Não cria `attendance_records`, listas de Frequência ou evidências B03/B06.

## Persistência e convivência

- `V24__meetings_module.sql`: agregado independente, convites, operações, histórico append-only, notificações e tabelas de relatório.
- `V25__meetings_mutation_versions.sql`: versão otimista por convite e índice de exclusão mútua de mutação Graph.
- `V26__meeting_teams_link_provider.sql`: fornecedor explícito, estados de vínculo manual e suporte a operações locais sem `transactionId` Graph.
- `joinUrl`, IDs Graph, estados Outlook e NITE ficam separados; tokens e payload bruto de relatório não são persistidos.
- Operações externas não participam da transação PostgreSQL. Criação usa chave local e `transactionId` estável; operações de alteração guardam versão/hash e permanecem recuperáveis para repetição idempotente.
- `Agenda` e suas rotas/tabelas permanecem intocadas. B04 mantém referências existentes a `calendar_events`; B06 e B03 continuam independentes. A navegação poderá trocar Agenda por Reuniões sem retirar contratos de Agenda. Futuro Calendário poderá consumir projeções dos dois domínios sem copiar nem migrar registros históricos.
- Nenhuma reunião é contabilizada como presença B04, atividade B03 ou evidência B06.

Compartilhamento WhatsApp é iniciado manualmente pelo cliente com o link NITE Connect; a rota web deverá autenticar usuário, verificar vínculo e então seguir para o redirect Teams. O texto retornado não inclui e-mail nem lista de convidados. Esta etapa não implementa envio, web page ou frontend.

## Limites de validação institucional

O adaptador Graph e a fronteira de aquisição de token têm testes locais com HTTP e aquisição substituíveis: verificam assertion/escopos, uso do token Graph nas chamadas e ausência do bearer NITE nas requisições Graph. O OBO real foi tentado e o Entra respondeu `AADSTS65001`, antes de qualquer chamada Graph; criação automatizada Graph e permissões do organizador seguem sem prova real. Separadamente, a prova Teams Web manual em [2026-11-02-teams-link-prova-tenant.md](../auditorias/2026-11-02-teams-link-prova-tenant.md) confirmou evento salvo no calendário, geração de link Meet now e entrada do organizador em sala com áudio/vídeo desligados. O segundo perfil está aguardando autenticação manual da conta de teste; identidade, lobby e admissão não foram comprovados. Licença, mailbox, lobby e admissão de outras contas continuam sujeitos às políticas Microsoft.

## Referências Microsoft

- [OBO flow — Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
- [Manage app consent policies — Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies)
- [Create event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0)
- [Online meetings with Outlook calendar events](https://learn.microsoft.com/en-us/graph/outlook-calendar-online-meetings)
- [Create onlineMeeting — Graph v1.0, reunião independente do calendário](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0)
- [Update event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0)
- [Cancel event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/event-cancel?view=graph-rest-1.0)
- [List attendance reports — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list?view=graph-rest-1.0)
- [Attendance report resource and retention — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/meetingattendancereport?view=graph-rest-1.0)
- [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference?view=graph-rest-1.0)

## Consolidação Graph-first — 2026-11-03

O frontend autenticado envia `provider: "GRAPH"` em novas criações e usa exclusivamente as operações Graph para criar, agendar, editar e cancelar. O formulário só abre quando `GET /meetings/calendar/capabilities` confirma acesso delegado e `teamsForBusiness`; o endpoint de capacidades continua sendo uma consulta real ao OBO/Graph e não emite prompts de consentimento. O resultado seguro (estado, nunca token ou corpo bruto Microsoft) fica em `sessionStorage`, separado por integrante e com validade de cinco minutos. A ação “Verificar novamente” força uma nova consulta. A sessão institucional e as listas de reuniões não dependem do Graph.

Sem consentimento, configuração, sessão utilizável, mailbox/capacidade adequada ou serviço disponível, a página permanece acessível; criação, edição e cancelamento ficam indisponíveis com explicação contextual. Nenhuma reunião local é criada como fallback. `OBO_CONSENT_REQUIRED` e `OBO_ADMIN_APPROVAL_REQUIRED` são traduzidos em estado de conexão; códigos e mensagens brutas do provedor não chegam ao cliente. Um `403/503` de mutação também permanece explícito e não é tratado como sucesso.

`TEAMS_LINK` e seus estados, URLs protegidas, rotas e dados existentes são preservados para compatibilidade histórica. A interface nova não cria esse provedor, não solicita copiar/vincular link e não apresenta ações que alterem apenas o NITE enquanto deixam o Teams desatualizado. Registros antigos com link continuam oferecendo detalhes, entrada e compartilhamento autorizados; um cancelamento legado é identificado como cancelamento interno, sem afirmar que o evento Microsoft foi atualizado. Os endpoints legados permanecem nesta etapa para compatibilidade de contrato, não como caminho da nova experiência.

`scope=cancelled` foi adicionado sem migração. `upcoming` e `past` excluem `CANCELADA`; `cancelled` lista somente cancelamentos visíveis ao organizador ou ao convidado ativo não revogado, independentemente da data prevista. A passagem do fim previsto continua classificando apenas a data; não cria estado “realizada”. A interface não aciona o endpoint de relatórios de presença e não solicita `OnlineMeetingArtifact.Read.All`; somente exibe uma duração efetiva já persistida se ela existir.

### Ativação depois do consentimento institucional

1. No App Registration **API**, confirmar cliente confidencial e uma credencial válida fornecida via `ENTRA_API_CLIENT_SECRET` por ambiente seguro. `ENTRA_TENANT_ID` e `ENTRA_AUDIENCE` devem apontar para o tenant e o App ID da API já usados pelo OBO.
2. Confirmar `Calendars.ReadWrite` como permissão **delegada** Microsoft Graph para o App Registration da API. A política da UniJorge pode exigir que um administrador conceda consentimento; não se pede permissão de aplicação.
3. Confirmar que a relação combinada Web/API existente e o escopo `access_as_user` permanecem válidos. O login principal não passa a solicitar Graph.
4. Em ambiente isolado, habilitar `MEETINGS_GRAPH_ENABLED=true` e reiniciar a API. Não habilitar `MEETINGS_GRAPH_ATTENDANCE_ENABLED` nesta etapa.
5. Renovar a sessão institucional se necessário e usar “Verificar novamente”. Um resultado disponível só prova aquisição do token OBO e leitura de capacidades para aquela conta naquele momento; não prova licença completa nem sucesso de criação.
6. Com uma conta de teste licenciada e mailbox utilizável, confirmar `/me/calendar.allowedOnlineMeetingProviders` contém `teamsForBusiness`. Criar um evento futuro sem convidados, confirmar `event.id`, `onlineMeeting.joinUrl` HTTPS e visibilidade no Outlook.
7. Criar evento de teste começando no instante atual. O comportamento de “Iniciar reunião” pela Calendar API ainda não foi comprovado no tenant. Só avaliar `POST /me/onlineMeetings` se esse teste falhar; a API alternativa exige `OnlineMeetings.ReadWrite` delegado e cria reunião sem evento de calendário. Não trocar provedor nem pedir escopo extra automaticamente.
8. Testar convidados, alteração e cancelamento com eventos descartáveis identificados. Confirmar convite Microsoft, resposta, link Teams e calendário. Respostas internas NITE e respostas Outlook permanecem contratos independentes.
9. Não validar relatórios de presença nesta etapa. Eles dependem de autorização adicional, política/retensão e revisão institucional própria.

Até concluir os passos no tenant, Graph permanece **implementado e coberto por testes com adaptadores substituíveis**, mas a prova de criação real e de reunião imediata continua pendente. Consentimento, licença, mailbox, capacidade Teams, lobby e políticas de entrada são dependências institucionais.
