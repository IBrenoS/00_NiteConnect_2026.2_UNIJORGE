# Reuniões — contrato backend

**Escopo:** Etapa 2, backend. Sem frontend visual, mudança no shell, migração de Agenda ou integração com presença B04.

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

Para localhost, a API pode continuar em `http://localhost:8080` e o callback existente do web app não muda. O OBO é backend-to-backend e não exige novo redirect URI. A API precisa estar registrada como cliente confidencial, com `Calendars.ReadWrite` **delegada** no Microsoft Graph e credencial válida fornecida por variável segura. Na referência Graph consultada, esse escopo delegado não exige consentimento administrativo por definição; políticas de consentimento da UniJorge ainda podem bloquear consentimento individual e exigir grant institucional. A UniJorge precisa verificar o App Registration, a política de consentimento e disponibilizar a credencial; nenhuma configuração Entra foi alterada neste trabalho.

Relatórios usam, somente quando explicitamente habilitados, `OnlineMeetingArtifact.Read.All` **delegada** via OBO. A permissão delegada também não exige admin consent por definição na referência Graph atual; política do tenant pode exigir aprovação. Não se solicita permissão de aplicação, `OnlineMeetings.Read` ou acesso autônomo. Sem escopo autorizado, licença/caixa do organizador ou capacidade `teamsForBusiness`, a operação não é confirmada.

## Estados

### Reunião

- `CRIACAO_PENDENTE`: operação local gravada, criação Microsoft sem confirmação.
- `AGENDADA`: Graph confirmou evento, ID e link Teams HTTPS; não afirma que a chamada ocorreu.
- `SINCRONIZACAO_PENDENTE`: atualização/cancelamento está em processamento ou aguarda reconciliação.
- `CANCELADA`: cancelamento Microsoft confirmado.
- `FALHA_PROVEDOR`: criação foi rejeitada definitivamente; não existe reunião confirmada.

`plannedDurationMinutes/plannedEndsAt` são previstos. `actualStartsAt/actualEndsAt/actualDurationSeconds` permanecem nulos até relatório real. O fim do horário previsto nunca altera sozinho o estado para encerrada. Calendário Graph não fornece sinal de chamada ao vivo; `HORARIO_DE_INICIO` e `FIM_PREVISTO` são apenas tipos previstos do esquema e não há despachante de lembretes nesta etapa.

### Operações e convites

Operações persistidas: `PROCESSANDO`, `CONFIRMADA`, `FALHA_PROVEDOR`, `RESULTADO_INDETERMINADO`. Na resposta `202`, `PROCESSANDO` é exposto como `PENDENTE`; o identificador, `retryAfter` e `retryable` orientam a repetição. O cliente deve repetir exatamente o mesmo comando com a mesma `Idempotency-Key` após `retryAfter`; a criação reaproveita o mesmo `transactionId` Graph. Não há worker automático de reconciliação nesta etapa.

Resposta interna de convite: `PENDENTE`, `ACEITO`, `RECUSADO`, `REVOGADO`, com versão individual. `calendarResponseStatus` é campo independente e fica `NAO_SINCRONIZADO` até uma leitura Graph comprovada. Responder no NITE Connect não responde no Outlook/Teams.

Notificações internas implementadas: convite recebido, resposta aceita/recusada, reunião alterada e reunião cancelada. As notificações são gravadas depois da confirmação da operação externa correspondente; Graph já pode enviar o e-mail de calendário, então o NITE não duplica esses e-mails. Não há sincronização de respostas Outlook. Notificações de horário previsto/encerramento ainda não são emitidas.

## Endpoints

Prefixo `/api/v1`; paginação começa em zero, `size` padrão 20 e máximo 100. Listas retornam `{items,page,size,total}`. Os DTOs de reunião não incluem e-mail de integrante, tokens ou `joinUrl`.

| Método | Caminho | Contrato |
|---|---|---|
| `GET` | `/meetings/invitees?q=&page=&size=` | Integrante ativo; pesquisa literal por nome entre ativos; somente `id,name`. |
| `POST` | `/meetings` | Integrante ativo; `Idempotency-Key`; cria imediata/agendada. `201` após confirmação Graph e gravação local; `202` se operação pendente/incerta. |
| `GET` | `/meetings?scope=upcoming\|past&page=&size=` | Organizador ou convidado ativo não revogado; inclui `SINCRONIZACAO_PENDENTE`; classes por fim previsto vs. instante atual, sem inferir realização. |
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

`IMMEDIATE` usa `Clock.instant()` do servidor e assume duração prevista de 60 minutos se omitida. `startsAt` deve ser nulo. Isso não encerra automaticamente a chamada. `SCHEDULED` exige `startsAt` ISO-8601 com offset e duração prevista positiva. Instantes são persistidos em UTC; apresentação institucional deve usar `America/Bahia`.

Ambos os modos criam evento em `/me/events` do organizador com `isOnlineMeeting=true`, `onlineMeetingProvider=teamsForBusiness`, convidados de calendário e `transactionId`. O backend primeiro consulta `/me/calendar.allowedOnlineMeetingProviders`. Só confirma a reunião depois de obter `event.id`, `isOnlineMeeting`, provider Teams e `onlineMeeting.joinUrl` HTTPS, e persistir a referência local. Mesmo key e corpo repetido retornam a operação/reunião anterior; corpo diferente com a mesma key gera `409`.

A API Graph independente `POST /me/onlineMeetings` também é viável com `OnlineMeetings.ReadWrite` delegado, mas cria uma reunião sem evento no calendário Outlook. Ela não foi escolhida: adicionaria uma permissão e uma segunda integração para o modo imediato, enquanto o evento de calendário suporta os dois modos e prepara o Calendário transversal. Só adotar essa alternativa para `IMMEDIATE` se a prova real demonstrar que o tenant não aceita evento iniciado no instante corrente; manter o mesmo agregado NITE e persistir claramente que essa reunião não possui evento Outlook.

O uso de evento de calendário para início imediato ainda depende de prova no tenant: o Graph exige início e fim e o tenant precisa aceitar evento iniciado no instante corrente. Se a criação atual falhar nesse caso, comparar com `POST /me/onlineMeetings` delegado apenas para `IMMEDIATE`, mantendo o mesmo agregado interno; não criar duas experiências locais.

## Atualização, cancelamento e respostas

PATCH recebe corpo completo dos campos alteráveis e `expectedVersion`. A versão é bloqueada antes da chamada externa; atualizações concorrentes em versão antiga recebem `409`. Alterações aos convidados atualizam attendees Graph e os registros internos; convites removidos são marcados `REVOGADO`. A confirmação local e as notificações acontecem após Graph confirmar. Respostas internas não atualizam o calendário.

Cancelamento chama `POST /me/events/{eventId}/cancel` e muda o status local somente após resposta Graph. `401/403` ou rejeição definitiva são erro explícito; `429` respeita `Retry-After`; `5xx`, timeout ou falha após Graph sem confirmação local deixam operação recuperável e respondem `202`, nunca um falso sucesso. Repetir uma operação usa a mesma key/payload. Sem worker automático, o chamador deve iniciar essa repetição.

## Relatórios de participação

Com `MEETINGS_GRAPH_ATTENDANCE_ENABLED=true`, `GET /attendance` consulta `/me/onlineMeetings/{onlineMeetingId}/attendanceReports` e, quando há relatório, `/attendanceRecords`, incluindo paginação. O escopo adicional único é `OnlineMeetingArtifact.Read.All` delegado. O Graph gera relatório após o término, lista até os 50 relatórios mais recentes e documenta retenção de um ano a partir da reunião. `200` sem relatório é `PENDENTE`; falta de consentimento, permissão, meeting ID ou acesso é `INDISPONIVEL`; erros transitórios não escrevem tempos. A retenção da cópia NITE ainda exige decisão de privacidade institucional.

Só valores fornecidos pelo Graph alimentam os campos reais. O backend guarda início/fim/tempo efetivo, registros e intervalos; vincula uma pessoa NITE somente quando o `tenantId` e o object ID Graph correspondem a identidade conhecida. Dados sem associação permanecem sem `memberId`; e-mail e nome externo não são copiados. O snapshot importado é para consulta do organizador. Não cria `attendance_records`, listas de Frequência ou evidências B03/B06.

## Persistência e convivência

- `V24__meetings_module.sql`: agregado independente, convites, operações, histórico append-only, notificações e tabelas de relatório.
- `V25__meetings_mutation_versions.sql`: versão otimista por convite e índice de exclusão mútua de mutação Graph.
- `joinUrl`, IDs Graph, estados Outlook e NITE ficam separados; tokens e payload bruto de relatório não são persistidos.
- Operações externas não participam da transação PostgreSQL. Criação usa chave local e `transactionId` estável; operações de alteração guardam versão/hash e permanecem recuperáveis para repetição idempotente.
- `Agenda` e suas rotas/tabelas permanecem intocadas. B04 mantém referências existentes a `calendar_events`; B06 e B03 continuam independentes. A navegação poderá trocar Agenda por Reuniões sem retirar contratos de Agenda. Futuro Calendário poderá consumir projeções dos dois domínios sem copiar nem migrar registros históricos.
- Nenhuma reunião é contabilizada como presença B04, atividade B03 ou evidência B06.

Compartilhamento WhatsApp é iniciado manualmente pelo cliente com o link NITE Connect; a rota web deverá autenticar usuário, verificar vínculo e então seguir para o redirect Teams. O texto retornado não inclui e-mail nem lista de convidados. Esta etapa não implementa envio, web page ou frontend.

## Limites de validação institucional

O adaptador Graph e a fronteira de aquisição de token têm testes locais com HTTP e aquisição substituíveis: verificam assertion/escopos, uso do token Graph nas chamadas e ausência do bearer NITE nas requisições Graph. A classe MSAL OBO está implementada, mas seu intercâmbio real, cache/renovação e consentimento não foram validados contra Entra. Nenhuma chamada Graph real foi feita neste checkout: `MEETINGS_GRAPH_ENABLED` está desligado por padrão, não há `ENTRA_API_CLIENT_SECRET` disponível e o App Registration/consentimento/licença do tenant não foram verificados. A prova com usuário de teste precisa confirmar capacidade Teams, evento futuro, início no instante atual, link de entrada, convite, update, cancelamento e visibilidade Outlook. A licença, lobby e admissão continuam sob política Microsoft.

## Referências Microsoft

- [OBO flow — Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
- [Create event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0)
- [Online meetings with Outlook calendar events](https://learn.microsoft.com/en-us/graph/outlook-calendar-online-meetings)
- [Create onlineMeeting — Graph v1.0, reunião independente do calendário](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0)
- [Update event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0)
- [Cancel event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/event-cancel?view=graph-rest-1.0)
- [List attendance reports — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list?view=graph-rest-1.0)
- [Attendance report resource and retention — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/meetingattendancereport?view=graph-rest-1.0)
- [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference?view=graph-rest-1.0)
