# Bloco 10.1D — Simplificação administrativa de Projetos

## Objetivo e limites

O bloco remove a exigência de justificativa manual nas operações administrativas de Projetos. As telas administrativas não exibem históricos nem versões internas do cadastro. As tabelas e vínculos que sustentam participação vigente, liderança, indicadores e integridade referencial permanecem; nenhum registro histórico é convertido ou excluído. Endpoints de leitura de histórico de situações, períodos de participação e períodos de liderança foram descontinuados por não possuírem consumidores ativos.

As autorizações, elegibilidade, transições de situação, controle otimista por `expectedVersion` e separação entre papel institucional, participação e liderança continuam sob validação da API.

## Contratos administrativos

As telas abaixo não pedem `reason`. A API ainda aceita esse campo como opcional para clientes existentes; valores em branco são tratados como ausentes.

| Operação | Contrato simplificado |
| --- | --- |
| Criar projeto | `title`, `description`, `startsOn`, `endsOn`, `initialStatus` |
| Editar projeto | `title`, `description`, `startsOn`, `endsOn`, `expectedVersion` |
| Alterar situação | `status`, `expectedVersion` |
| Adicionar integrante | `memberId`, `responsibility`, `expectedVersion` |
| Encerrar participação | `expectedVersion` no corpo de `DELETE /api/v1/projects/{id}/members/{memberId}` |
| Designar, transferir ou liberar liderança | `memberId` (nulo para vacância), `expectedVersion` |

Exemplo de transição: `PATCH /api/v1/projects/{id}/status` com `{"status":"ATIVO","expectedVersion":3}`. A API continua rejeitando transições inválidas e versões obsoletas.

Eventos de status e auditoria continuam registrando ator, ação, valores e data; a razão fica nula quando a ação administrativa rotineira não fornece uma justificativa. A V54 permite razão nula para eventos de `PROJECT` na auditoria compartilhada; os demais tipos continuam sob a restrição vigente, incluindo a exceção já existente para concessão e revogação de papéis. Aprovação de proposta continua fora deste contrato: uma conversão pode preservar a justificativa real da decisão da proposta.

## Histórico e persistência

As tabelas `project_status_history`, `project_memberships` e `project_leadership_history` continuam preservadas. A leitura de lideranças vigentes usa `GET /api/v1/me/projects/leadership`; endpoints de leitura de períodos encerrados ou de históricos administrativos não fazem parte mais do contrato.

Os registros continuam nas tabelas `project_status_history`, `project_memberships` e `project_leadership_history`. As tabelas de períodos mantêm IDs, atores, datas, chaves estrangeiras, unicidade do vínculo vigente e a regra de fechamento único. `ended_at` e a junção com `project_memberships` continuam sendo a fonte de participação e liderança atuais. A V54 torna as justificativas opcionais, mantendo intactas as razões históricas já registradas.

A nova consulta `GET /api/v1/me/projects/leadership` retorna somente `{ projectId, title }` para lideranças vigentes. Ela mantém a dependência do shell autenticado, seletores de workspace, Meus Projetos e consultas gerenciais de atividades sem usar períodos encerrados.

O histórico próprio de solicitações formais (`.../membership-requests/{requestId}/history`) permanece, pois descreve as decisões do fluxo de ingresso formal. As consultas de participação vigente e o resumo de workspace também permanecem.

## Ingresso e manifestações antigas

O ingresso novo segue somente solicitações formais:

- Disponível: `Solicitar acesso`.
- Solicitação pendente: `Aguardando análise`.
- Participação vigente: `Abrir workspace`.
- Indisponível: `Novas solicitações indisponíveis`.

O POST legado `/api/v1/projects/{id}/interest-signals` responde HTTP 410 e orienta o cliente a usar uma solicitação formal. Endpoints GET de manifestações foram removidos por não possuírem consumidores ativos. Registros antigos permanecem no banco, sem serem apagados ou tratados como solicitação formal.

## Dependências mantidas para o 10.1E

- A API permanece como autoridade final para papéis, liderança contextual, vínculo vigente e elegibilidade.
- IDs, períodos, transações, registros de status, auditoria, notificações, solicitações e eventos formais permanecem persistidos.
- O frontend mantém `expectedVersion` nos comandos, sem exibir versões internas.
- A interface administrativa deixa de exigir justificativas e de apresentar históricos ou versões internas; o fluxo formal de solicitações mantém seus eventos e decisões.
- As tabelas de manifestação antiga e histórico operacional não devem ser descartadas sem avaliar seus consumidores e os FKs de atividades/indicadores.

## Migração

`V56__simplify_project_administration_reasons.sql` remove as restrições que tornavam razões obrigatórias em eventos de situação e períodos de participação/liderança, e permite razão nula apenas para ações administrativas de Projeto listadas na própria constraint (`PROJECT_UPDATED`, `PROJECT_STATUS_CHANGED`, `PROJECT_MEMBER_JOINED`, `PROJECT_MEMBER_LEFT`, `PROJECT_LEADERSHIP_TRANSFERRED` e `PROJECT_DELETED`). Outros eventos de Projeto e os demais domínios continuam exigindo razão, exceto a regra existente para concessão/revogação de papéis. A migration conserva razões existentes e mantém coerência entre datas e atores de encerramento.
