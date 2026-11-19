# NITE Connect — Bloco 08.4B-2

Implementação local de 18/11/2026, na main por autorização já existente. Sem commit ou push. Refinamento visual do Bloco 08.4B-1 preservado.

## Integrações realizadas

- Catálogo autenticado e apresentação usam exclusivamente a projeção pública da API: nome, resumo, situação, gestor, contagem, datas, disponibilidade e capacidades. A apresentação não chama a leitura privada de projeto/workspace. O backend continua sem imagem cadastrada; fallback com iniciais preservado.
- As coleções paginadas são carregadas integralmente em páginas de até 100 registros, com validação de integridade da paginação. Pesquisa, filtros e ordenação continuam imediatos sobre os registros reais recebidos; a interface apresenta até 20 projetos por página. Falha em uma página não vira coleção vazia nem resposta parcial silenciosa.
- Meus Projetos consulta os vínculos vigentes em /me/projects. Acompanhamento administrativo é uma perspectiva separada, sem apresentar acesso global como participação. A liderança exibida no vínculo pessoal vem do histórico vigente de liderança, não do papel global.
- Solicitações, interesse e disponibilidade usam Server Actions autenticadas, com validação de entrada e capacidades reconsultadas. Decisões enviam expectedVersion da solicitação; disponibilidade envia a versão do workspace. Sucesso só é apresentado após resposta confirmada da API. Erros de acesso, indisponibilidade, ausência de registro, dados inválidos e concorrência têm mensagens explícitas.
- Visão geral usa descrição, liderança, equipe e activity-stats reais. Objetivos e próximos passos demonstrativos foram retirados: o contrato atual não fornece esses conteúdos. Nenhum substituto foi inventado.
- Equipe e responsabilidades são retornadas pelo backend. A fila é carregada somente com canDecideRequests. Nomes dos solicitantes são enriquecidos no backend depois da autorização, sem ampliar acesso ao cadastro institucional.
- Planejamentos e tasks reutilizam ActivityPlanningWorkspace, PlanningForm, TaskEditor, movimentação, exclusão e concorrência do Bloco 08.3. A listagem usa o endpoint contextual do projeto; não confunde a coleção pessoal filtrada com a coleção completa autorizada do projeto. projectId e planningId do snapshot são conferidos antes de renderizar tarefas ou consultar capacidades.
- O provider demonstrativo saiu do layout autenticado. Seus arquivos remanescentes ficam sem consumidores nas áreas integradas. Documentos permanece com a implementação temporária, dados e avisos existentes, conforme o Bloco 08.4B-3.
- Favoritos de projetos não têm contrato persistente existente (favoritos documentais aceitam documentos/pastas). Os controles visuais foram preservados desabilitados; nenhuma operação local foi apresentada como persistida.
- Bearer continua somente no servidor. Nenhum token, credencial ou sessão pública foi ampliado. Não foram adicionadas dependências.

## Contratos utilizados e extensões necessárias

| Contrato | Uso |
| --- | --- |
| GET /api/v1/project-catalog | Catálogo público autenticado paginado |
| GET /api/v1/project-catalog/{id} | Nova leitura por ID da mesma projeção sanitizada, sem expor descrição privada, equipe nominal ou atividades |
| GET /api/v1/me/projects | Participações vigentes |
| GET /api/v1/me/projects/leadership/history | Liderança contextual vigente |
| GET /api/v1/projects/{id}/workspace | Descrição privada autorizada, métricas, versão e capacidades |
| GET /api/v1/projects/{id}/members | Equipe e responsabilidades |
| GET /api/v1/me/project-membership-requests | Acompanhamento dos pedidos próprios |
| POST /api/v1/projects/{id}/membership-requests | Solicitação de ingresso |
| GET /api/v1/projects/{id}/membership-requests | Fila autorizada da gestão |
| POST /api/v1/projects/{id}/membership-requests/{requestId}/decision | Aprovação/rejeição com versão |
| POST /api/v1/projects/{id}/interest-signals | Interesse futuro idempotente, sem ingresso |
| GET /api/v1/me/project-interest-signals | Nova leitura paginada dos interesses do próprio ator, sem acesso a terceiros |
| PATCH /api/v1/projects/{id}/availability | Disponibilidade com expectedVersion |
| GET /api/v1/projects/{id}/activity-plannings e /activity-stats | Coleção e indicadores completos no contexto autorizado |
| /api/v1/activity-plannings e /api/v1/activities | Criação, leitura, capacidades e mutações canônicas existentes V43 |

Extensões aditivas comprovadas: duas leituras acima; memberName nullable na solicitação; canDecideRequests, canCreatePlanning e canTransferLeadership no workspace. Flags canManageAvailability e canExpressInterest foram alinhados às autorizações já existentes: participante comum não administra disponibilidade, e projeto concluído não recebe interesse. Nenhuma regra nova de aprovação foi inventada.

## V43: bloqueio encontrado e restauração

A reconstrução da API revelou divergência preexistente: checksum aplicado 630061813 contra 1408322960 no arquivo versionado. O banco preservava PERIOD, JUSTIFICATION, CORRECTION e WORK_LOG_CORRECTION_RESPONSE, omitidos no arquivo atual. A reposição exata de duas linhas reproduziu o checksum aplicado.

V43 foi restaurada ao conteúdo já aplicado. Não houve repair, edição de flyway_schema_history, reaplicação da migration ou DDL manual. A API voltou a iniciar e /actuator/health retornou 200. Os quatro eventos históricos ATTENDANCE_SEGMENT continuam presentes. Nenhuma migration nova foi criada.

Ambientes que eventualmente tenham aplicado a variante divergente 1408322960 exigem análise específica antes de publicar essa restauração; não foram verificados nesta sessão. Não executar repair automaticamente.

## Homologação com sessão institucional real

O usuário autorizou criar dados de teste identificados no PostgreSQL local, que estava sem projetos. Foram usados os endpoints existentes e a sessão real de Gestão Geral, sem criar integrantes, identidades ou credenciais.

Foram persistidos três projetos com prefixo HOMOLOGAÇÃO 08.4B-2: Workspace (ATIVO, com participação e liderança do integrante autenticado), Interesse (PAUSADO, acompanhamento administrativo) e Concluído (CONCLUIDO, acompanhamento administrativo). Também foram criados um planejamento, uma task canônica e um interesse. Os registros permanecem no banco local, identificados como testes.

- Interesse confirmado pela API, recarregamento completo e reapresentação do interesse registrado em Meus pedidos/apresentação.
- Planejamento criado com projectId fixo e navegação pelo ID retornado.
- Task criada no planejamento, editada para Em andamento e mantida após recarregamento. A mesma task apareceu na perspectiva pessoal e na perspectiva do projeto.
- PostgreSQL confirmou um único registro activities: ee3e7ca3-d204-4f14-aeb1-21cf7cafd9ec, projeto f37a8643-5aaa-4a2a-884d-fbede9bdec57, planejamento 3e95c082-58a4-4d8c-b803-2250c38b42d3, status EM_EXECUCAO, versão 2.
- Disponibilidade de ingresso aberta pela capacidade contextual e preservada após recarregar. Vínculo permaneceu separado dos dois projetos de acompanhamento.
- Catálogo, consulta, filtro por situação, pesquisa sem resultados e limpeza de filtros exercitados. Equipe e fila autorizada vazia conferidas.
- As quatro áreas do workspace foram visitadas. Documentos manteve avisos e operações temporários; nenhuma operação documental real foi executada.
- Claro/escuro em 1440 × 1000 e 390 × 844; verificações adicionais em 1024 × 768 e viewport baixa. Nenhum overflow horizontal de página nas medições. Tabelas e abas preservam rolagem interna; sticky e limites da viewport permanecem no CSS aprovado, com fallback estático nos layouts menores.
- Durante a troca de props em HMR houve um TypeError transitório na árvore antiga. Após recarga e início da homologação real, nenhum novo erro ou warning foi capturado. Preferência Sistema e viewport original restauradas.

A ferramenta de desenvolvimento usada apenas para preparar os registros foi retirada das rotas antes do build final. Seu código, sem segredos, está preservado em homologacao-helper.tsx.txt para revisão do procedimento.

## Validações e alcance

### Após a última alteração de implementação

Em apps/web:

- npm run lint: aprovado, exit 0, zero warnings de ESLint.
- npm run typecheck: aprovado, exit 0.
- npm run build: aprovado, exit 0; compilação, TypeScript e geração de rotas. A ferramenta temporária de homologação não consta do build.
- npm run test -- src/components/projects/projects.test.tsx 'src/app/(authenticated)/meus-projetos/[id]/layout.test.tsx': 2 arquivos / 12 testes aprovados após a última alteração funcional da interface.
- Impeccable detect --json nos componentes de Projetos e no workspace compartilhado: nenhuma ocorrência. É um detector mecânico, não substitui inspeção visual.
- git diff --check: aprovado. Avisos CRLF/LF são de normalização de EOL.

No backend, após restaurar V43:

mvn -f apps/api/pom.xml '-Dtest=ProjectDiscoveryParticipationTest,ActivityPlanningTaskMutationTest' test -q

16 testes aprovados (9 de descoberta/participação/auditoria e 7 de mutação de tasks), sem falhas, erros ou skips. PostgreSQL 17 real via Testcontainers, com as 43 migrations aplicadas. A regressão observou red na rejeição indevida de PERIOD e green após restauração; também confirma os demais tipos históricos e rejeita relações inválidas.

### Verificações anteriores que continuam válidas

- npm run test: 81 arquivos / 378 testes aprovados. Depois disso houve pequenos ajustes de apresentação/feedback, identificação da liderança e guarda da navegação por capacidade; os 12 testes diretamente relacionados foram reexecutados. Não se declara uma nova execução integral da suíte no estado final.
- Testes direcionados de transporte, parsers, ações, contexto de atividades, paginação incompleta, planejamento crossproject, tasks com projectId/planningId incompatíveis e criação fixada passaram antes da suíte ampla, que os inclui.
- Backend: mvn -f apps/api/pom.xml '-Dtest=ProjectDiscoveryParticipationTest,ProjectsBoundaryTest,ProjectMemberDiscoveryTest,ActivityPlanningTest,ActivityPlanningTaskMutationTest' test -q aprovou 39 testes. Após a restauração da allowlist, as duas classes afetadas foram reexecutadas (16 acima); os 24 testes das outras três classes permanecem válidos, sem mudança funcional nesses serviços.

### Cenários simulados versus reais

Os testes frontend usam doubles de transporte/estado onde necessário. Os testes backend executam Spring Boot, serviços, autorização, transações e PostgreSQL reais; MockMvc e JWT de teste simulam o transporte/identidade institucional. Cobrem integrante comum, líder contextual, administração, isolamento, anônimo/inativo, decisões, concorrência e persistência no banco efêmero.

A homologação no navegador usa autenticação institucional real, API Docker e PostgreSQL local. Há somente um integrante institucional ativo nesse banco. Portanto ingresso, aprovação/rejeição e negativas entre identidades institucionais distintas não foram homologados manualmente; esses cenários foram verificados nos testes de integração descritos. Não foram criadas identidades artificiais para contornar essa limitação.

Não foram executadas exclusões permanentes nem arraste manual no navegador. Exclusão/movimentação e concorrência reutilizam os handlers e testes reais do domínio existente. Não foi executada a suíte completa do backend nem upgrade V42→V43 com dados históricos preexistentes; a regressão da allowlist final foi exercitada em PostgreSQL migrado desde V1. Infraestrutura documental e outros navegadores ficam fora deste bloco.

## Arquivos e preservação

A lista completa dos arquivos de implementação/testes desta etapa está em `output/08-4b-2/arquivos.txt`. Grupos principais: contratos/loaders/actions em lib/projects; rotas autenticadas; componentes de Projetos; extensão opcional projectContext no workspace canônico e retorno contextual de exclusão; endpoint contextual em lib/activities/data; serviço/controller/security/testes do backend; restauração de V43.

As alterações anteriores em activity-list.tsx, activity-planning-preview.tsx e project-documents.tsx pertencem ao 08.4B-1 e foram preservadas. next-env.d.ts foi regenerado pelas ferramentas Next e restaurado ao conteúdo preexistente de desenvolvimento ao encerrar. Não houve commit, push, alteração de .env, credenciais ou infraestrutura documental.

## Evidências

- comparativo.html: sete comparações de composição 08.4B-1/08.4B-2 e galeria de 51 capturas.
- persistencia-postgres.json e verificar-persistencia.sql: consulta somente leitura dos registros persistidos, vínculo, IDs canônicos, versão, interesse e V43.
- homologacao-browser.json, responsive.json e sticky.json: alcance e medições do navegador.
- arquivos.txt: arquivos de implementação e testes desta etapa.
- api-rebuild.log: reconstrução da API local após restauração da migration.
- Logs Maven ignorados em apps/api/target/project-integration-verification.log, project-final-verification.log e project-migration-{red,green}.log.
