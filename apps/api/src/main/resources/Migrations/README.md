# Catálogo de migrações PostgreSQL

Este diretório é a fonte de execução do Flyway, configurada em `application.yml` como `classpath:Migrations`. Cada arquivo `Vn__*.sql` é versionado e append-only: depois de aplicado, seu conteúdo não deve ser alterado. Mudanças posteriores devem entrar em uma nova versão.

| Versão | Arquivo SQL | Bloco/escopo relacionado |
|---|---|---|
| V1 | [`V1__initialize_schema.sql`](V1__initialize_schema.sql) | Fundação do schema `nite_connect`; reserva o início do histórico sem criar dados institucionais ou contas fictícias. |
| V2 | [`V2__identity_members_access_audit.sql`](V2__identity_members_access_audit.sql) | B01: membros, contas institucionais, convites, atribuições de papel, histórico de status e auditoria imutável. |
| V3 | [`V3__projects_proposals_memberships.sql`](V3__projects_proposals_memberships.sql) | B02: propostas, projetos, vínculos e históricos de liderança/status; amplia o contrato de auditoria. |
| V4 | [`V4__activities_assignments_evidence.sql`](V4__activities_assignments_evidence.sql) | B03: atividades, atribuições, eventos e evidências, com regras de preservação de histórico. |
| V5 | [`V5__agenda_attendance_work_logs.sql`](V5__agenda_attendance_work_logs.sql) | B04 histórico: criou Agenda, sessões, presença e o modelo misto de horas; V21 separa a presença e remove o escopo de horas. |
| V6 | [`V6__document_management.sql`](V6__document_management.sql) | Estruturas históricas de registros, versões e eventos; mantida porque consta no histórico de bancos já migrados. |
| V7 | [`V7__continuous_member_diaries.sql`](V7__continuous_member_diaries.sql) | Estrutura histórica complementar; mantida porque consta no histórico de bancos já migrados. |
| V8 | [`V8__academic_assessment.sql`](V8__academic_assessment.sql) | B06: períodos, políticas, matrículas, planos, evidências, avaliações, cálculos, homologações, revisões e eventos acadêmicos. |
| V9 | [`V9__academic_public_feedback.sql`](V9__academic_public_feedback.sql) | B06: campos de feedback público e índices de consulta para homologações e revisões. |
| V10 | [`V10__local_document_inspection.sql`](V10__local_document_inspection.sql) | Estrutura histórica de inspeção local; mantida porque consta no histórico de bancos já migrados. |
| V11 | [`V11__project_health_governance.sql`](V11__project_health_governance.sql) | B07: baseline inicial aprovada de criticidade por projeto, ajustes versionados e avaliações baseadas em atividade B03 imutáveis. |
| V12 | [`V12__attendance_governance_and_weekly_reviews.sql`](V12__attendance_governance_and_weekly_reviews.sql) | Migração histórica de exceções, dispensas/reposições e revisões, removidas do esquema ativo por V21. |
| V13 | [`V13__personal_participation_contracts.sql`](V13__personal_participation_contracts.sql) | Migração histórica de carga semanal, declarações e correções remotas, removidas do esquema ativo por V21. |
| V14 | [`V14__participation_load_policy_administration.sql`](V14__participation_load_policy_administration.sql) | Migração histórica da administração versionada de carga semanal, removida por V21. |
| V15 | [`V15__planned_participation_load_policy.sql`](V15__planned_participation_load_policy.sql) | Migração histórica de vigência planejada, removida por V21. |
| V16 | [`V16__private_justification_attachments.sql`](V16__private_justification_attachments.sql) | Migração histórica de metadados, auditoria e retenção de comprovantes, removida por V21. |
| V17 | [`V17__cap_justification_deletion_grace.sql`](V17__cap_justification_deletion_grace.sql) | Migração histórica de regra de descarte de comprovantes, removida por V21. |
| V18 | [`V18__audited_justification_retention_purge.sql`](V18__audited_justification_retention_purge.sql) | Migração histórica das tabelas de expurgo, removida por V21. |
| V19 | [`V19__justification_attachment_limits_and_minimum_grace.sql`](V19__justification_attachment_limits_and_minimum_grace.sql) | Migração histórica de limites/metadados de anexos, removida por V21. |
| V20 | [`V20__retire_work_hour_contracts_preserve_history.sql`](V20__retire_work_hour_contracts_preserve_history.sql) | Marco histórico que documentou a aposentadoria sem apagar dados; V21 executa a separação e remoção aprovadas. |
| V21 | [`V21__remove_retired_participation_scope.sql`](V21__remove_retired_participation_scope.sql) | Remove tabelas e dados legados de horas, políticas, solicitações, justificativas, comprovantes e auditorias B04; migra segmentos e auditoria de Agenda/presença para tabelas próprias. Falha se eventos de período não puderem ser classificados. |
| V22 | [`V22__frequency_attendance_lists.sql`](V22__frequency_attendance_lists.sql) | B04 Frequência: listas e snapshots imutáveis, QR temporário e handoff, trilha administrativa, corte oficial `activated_at` e suporte a eventos rápidos com término nulo. Preserva encontros e presenças legados, revogando QRs de sessão anteriores. |
| V23 | [`V23__frequency_handoff_retention_index.sql`](V23__frequency_handoff_retention_index.sql) | B04 Frequência: índice por expiração para o expurgo global, limitado e concorrente de handoffs após o período de retenção. |
| V25 | [`V25__meetings_mutation_versions.sql`](V25__meetings_mutation_versions.sql) | Reuniões: versão otimista por convite e índice de exclusão mútua para operações Graph em andamento/indeterminadas. |
| V26 | [`V26__meeting_teams_link_provider.sql`](V26__meeting_teams_link_provider.sql) | Reuniões: provedor `TEAMS_LINK`, preparação aguardando ação no Teams, vínculo manual do link oficial e estado explícito de sincronização local. |
| V24 | [`V24__meetings_module.sql`](V24__meetings_module.sql) | Novo domínio de reuniões Teams: calendário Microsoft, convites internos, operações idempotentes, notificações, histórico e preparação para relatórios de participação; não altera Agenda/B04/B06. |

| V27 | [`V27__document_wopi_foundation.sql`](V27__document_wopi_foundation.sql) | B05.1: sessões de acesso WOPI temporárias (hash do token) e bloqueios concorrentes por documento, preservando as versões históricas de V6/V7/V10. |
| V28 | [`V28__document_library.sql`](V28__document_library.sql) | B05.2: pastas, biblioteca única e metadados documentais, preservando UUIDs e versões históricas. |
| V29 | [`V29__preserve_historical_personal_documents.sql`](V29__preserve_historical_personal_documents.sql) | B05.3: provisiona pastas para integrantes inativos que possuem documentos pessoais legados e associa registros sem pasta, sem reescrever IDs/versões/objetos. |
| V30 | [`V30__document_sharing.sql`](V30__document_sharing.sql) | B05.4: estende grants existentes para arquivos e pastas com `VIEW`/`EDIT`, preserva o campo legado e registra eventos imutáveis de compartilhamento. |
| V31 | [`V31__track_wopi_lock_owner.sql`](V31__track_wopi_lock_owner.sql) | B05.5: identifica o integrante associado ao lock ativo para invalidar apenas locks da sessão/grant revogado. |
| V32 | [`V32__document_identity_capabilities.sql`](V32__document_identity_capabilities.sql) | B05.6.1: titular do espaço, proprietário por recurso, origem e proteção explícitos; backfill conservador sem alterar IDs, versões, grants ou objetos. |
| V33 | [`V33__document_trash_lifecycle.sql`](V33__document_trash_lifecycle.sql) | B05.6.2: estado recuperável da Lixeira, responsável, instante e batch de exclusão/restauração independentes do arquivamento institucional. |
| V34 | [`V34__document_purge_infrastructure.sql`](V34__document_purge_infrastructure.sql) | B05.6.3A: políticas versionadas sem aprovação inicial, operações e itens duráveis, tentativas de objetos, tombstones e estados `PURGE_PENDING`/`PURGED`; sem habilitar expurgo. |
| V35 | [`V35__document_internal_retention_policy.sql`](V35__document_internal_retention_policy.sql) | B05.6.3B: eventos da política interna, pedidos de gestores de projeto e operação automática. |
| V36 | [`V36__document_library_operations.sql`](V36__document_library_operations.sql) | B05.7A: favoritos e operações documentais em lote. |
| V37 | [`V37__document_queries_requests.sql`](V37__document_queries_requests.sql) | B05.7B: solicitações autenticadas de arquivos, destinatários, uploads e eventos. |
| V38 | [`V38__document_automations.sql`](V38__document_automations.sql) | B05.7D: regras, entregas duráveis e notificações documentais internas. |
| V39 | [`V39__document_automation_delivery.sql`](V39__document_automation_delivery.sql) | B05.7D: escopos explícitos, retentativa, índices e auditoria imutável das regras. |
| V40 | [`V40__activity_simplified_management.sql`](V40__activity_simplified_management.sql) | B08.1: início/prioridade opcionais, descrição vazia compatível e motivo opcional em eventos rotineiros de atividade; preserva registros e IDs existentes. |
| V41 | [`V41__permanent_activity_deletion.sql`](V41__permanent_activity_deletion.sql) | B08.1B: exclusão permanente autorizada pelo criador, reconciliação de referências históricas e outbox para remoção idempotente de evidências privadas. |
| V42 | [`V42__project_discovery_and_participation.sql`](V42__project_discovery_and_participation.sql) | B08.2: disponibilidade de ingresso, pedidos e manifestações de interesse, e notificações persistidas idempotentes, sem recriar vínculos ou armazenamentos de atividades/documentos. |
| V43 | [`V43__activity_planning_hierarchy.sql`](V43__activity_planning_hierarchy.sql) | B08.2B: agrupamentos de planejamento versionados e relação opcional/restritiva de tarefas existentes, mantendo escopo de projeto compatível e sem converter registros legados. |
| V44 | [`V44__institutional_library.sql`](V44__institutional_library.sql) | Biblioteca institucional: mensagem opcional nos grants, snapshot do caminho/projeto de origem na exclusão e índice para consulta institucional por integrante; preserva IDs, objetos e política de expurgo. |
| V45 | [`V45__document_report_classification.sql`](V45__document_report_classification.sql) | Classificação explícita GENERAL/REPORT, sem classificar registros existentes por inferência e sem novos arquivos ou armazenamento. |
| V46 | [`V46__narrow_audit_entity_types.sql`](V46__narrow_audit_entity_types.sql) | Restringe os tipos aceitos em `audit_entity_check`, preservando V43 imutável e aplicando a alteração em bancos já migrados. |
| V47 | [`V47__institutional_project_manager_role.sql`](V47__institutional_project_manager_role.sql) | B08.6-0: papel institucional `GESTOR_PROJETO`, regularização auditada de líderes vigentes sem papel superior e integridade entre papel e liderança. |
| V48 | [`V48__member_profile.sql`](V48__member_profile.sql) | B08.6A: atributos opcionais do cadastro de integrantes e referência à foto privada. |
| V49 | [`V49__optional_institutional_role_reason.sql`](V49__optional_institutional_role_reason.sql) | B08.6B: motivo opcional em atribuições de papel e eventos MEMBER de concessão/revogação; os demais eventos continuam exigindo motivo. |
| V50 | [`V50__invitations_and_last_access.sql`](V50__invitations_and_last_access.sql) | B08.7A: papel inicial, estado de envio Resend, vínculo Entra no aceite e último acesso efetivo. |
| V51 | [`V51__project_creation_covers_and_request_history.sql`](V51__project_creation_covers_and_request_history.sql) | B09.1A: associação de capas ao armazenamento documental e histórico imutável de solicitações de participação, preservando estados e manifestações existentes. |

## Aplicação

O Spring Boot executa essas versões pelo Flyway. Os testes de upgrade configuram a mesma localização explicitamente. Não execute os arquivos manualmente em bancos já gerenciados pelo Flyway nem renumere versões aplicadas.
