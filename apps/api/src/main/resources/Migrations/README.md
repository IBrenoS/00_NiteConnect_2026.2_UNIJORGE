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
| V24 | [`V24__meetings_module.sql`](V24__meetings_module.sql) | Novo domínio de reuniões Teams: calendário Microsoft, convites internos, operações idempotentes, notificações, histórico e preparação para relatórios de participação; não altera Agenda/B04/B06. |

## Aplicação

O Spring Boot executa essas versões pelo Flyway. Os testes de upgrade configuram a mesma localização explicitamente. Não execute os arquivos manualmente em bancos já gerenciados pelo Flyway nem renumere versões aplicadas.
