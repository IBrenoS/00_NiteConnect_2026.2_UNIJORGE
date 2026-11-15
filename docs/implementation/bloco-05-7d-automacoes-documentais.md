# Bloco 05.7D — Automações documentais

## Escopo e origem dos eventos

As regras atuam somente por notificações internas. Não movem, excluem ou compartilham recursos e não enviam e-mail. Os eventos já persistidos pelo núcleo documental são a fonte de verdade:

| Regra | Alvo | Evento persistido | Destinatário |
|---|---|---|---|
| `NEW_FILE_IN_FOLDER` | `FOLDER` específica | `document_events.DOCUMENT_CREATED` de arquivo criado diretamente na pasta após a criação da regra | proprietário da regra, se ainda puder ver pasta e arquivo |
| `FILE_REQUEST_FULFILLED` | `REQUEST` específica | `document_file_request_events.UPLOADED` após a criação da regra | solicitante, se ainda puder adicionar ao destino e ver o arquivo |
| `DOCUMENT_SHARED_WITH_ME` | `SELF` | `document_share_events.SHARE_GRANTED` direto após a criação da regra | destinatário, se o grant direto ainda estiver ativo e ele puder ver o recurso |

A regra de compartilhamento é pessoal e global para novos recursos recebidos. Cada regra envia no máximo uma notificação por recurso; grants herdados não geram novos eventos para cada descendente, e um grant direto adicional no arquivo já coberto por um grant de pasta não gera outro aviso. Reativar uma regra não recupera eventos ocorridos enquanto ela estava desativada. Um upload confirmado ainda pode ser notificado se a solicitação for cancelada depois dele, desde que o solicitante mantenha acesso ao destino e ao arquivo. Recursos antigos ou regras anteriores à V39 com alvo `DOCUMENT` permanecem preservados, mas não executam um gatilho novo.

## Persistência e processamento

V38 contém regras, entregas e notificações. V39 acrescenta os escopos `REQUEST` e `SELF`, auditoria imutável de criação/alteração/remoção, índices, tipo de recurso e `next_attempt_at`. As migrations anteriores não foram reescritas.

O polling agendado (padrão: 10 segundos, `nite.documents.automation.poll-delay-ms`) descobre eventos confirmados e insere entregas `PENDING` em PostgreSQL. O trabalho de upload ou compartilhamento não espera pela entrega. Cada tentativa bloqueia a linha com `FOR UPDATE SKIP LOCKED`, revalida regra, vínculo ativo, capacidade de visualizar e grant direto quando aplicável. A notificação e a mudança para `DELIVERED` são transacionais. `event_key` e `delivery_id` únicos impedem duplicação no reprocessamento. Erros transitórios viram `FAILED` com retentativa progressiva de até cinco tentativas; perda de acesso ou desativação vira `SKIPPED`. O erro salvo é um código, sem conteúdo documental.

As notificações retornam somente ID, tipo de evento, tipo/ID de recurso e datas. A listagem filtra novamente os recursos que o integrante já não pode consultar. O histórico oculta o ID do recurso quando o acesso foi perdido. Notificações de reunião continuam no módulo de reuniões; seu esquema é específico de reuniões e não foi alterado.

## API autenticada

- `GET /api/v1/me/document-automations`
- `GET /api/v1/me/document-automations/options?targetType=FOLDER|REQUEST|SELF&targetId=<uuid>`
- `POST /api/v1/me/document-automations` com `targetType`, `targetId`, `eventType`
- `PATCH /api/v1/me/document-automations/{id}` com `enabled`
- `DELETE /api/v1/me/document-automations/{id}`
- `GET /api/v1/me/document-automations/{id}/history`
- `GET /api/v1/me/document-notifications`
- `POST /api/v1/me/document-notifications/{id}/read`

Todos exigem JWT e integrante ativo. A API devolve somente regras e histórico do próprio integrante. O frontend utiliza o proxy autenticado `/api/library/manage` e apresenta opções aceitas pela política do backend.

## Cenários para homologação 05.8

1. Configurar monitoramento de pasta pessoal, enviar arquivo e confirmar uma notificação, mesmo após reiniciar a API antes do polling.
2. Criar solicitação, configurar aviso, enviar como destinatário sem acesso à pasta e confirmar aviso somente ao solicitante.
3. Configurar avisos de compartilhamento, compartilhar documento e pasta, testar grants diretos, simultâneos, herdados e revogados.
4. Desativar/remover regra e verificar ausência de novas entregas; conferir histórico e auditoria.
5. Revogar acesso ou inativar integrante antes da entrega e verificar `SKIPPED` sem revelar metadados.
6. Simular falha temporária na persistência da notificação, recuperar o banco e confirmar uma única entrega.
7. Verificar filtros de permissão, navegação e leitura das notificações em navegador autenticado com CODE e armazenamento de homologação.

Não há integração externa nem alteração da retenção ou do descarte.
