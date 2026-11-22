# Bloco 08.6B — Diretório administrativo de Integrantes

## Contratos reutilizados

- `members` continua sendo o único cadastro. V48 fornece curso, área, nascimento e referência privada de foto. `GET /api/v1/members/{id}/photo` entrega a foto autenticada; administradores globais também podem vê-la na ficha de integrantes inativos.
- `AccessService.requireAdministrator` exige integrante ativo com `GESTOR_GERAL` ou `COORDENADOR`. `GESTOR_PROJETO` é papel institucional de liderança de projeto e não concede acesso global.
- `PATCH /api/v1/members/{id}/status` mantém versão otimista, motivo obrigatório, autorização, proteção do último administrador e histórico transacional. A interface apenas oferece as transições administrativas já suportadas. Ingresso pendente continua pelo convite.
- `member_status_history` guarda ingresso, ativação e alterações de situação. `audit_events` guarda concessões e revogações de papéis. A ficha combina somente esses eventos, com paginação e nome atual do responsável.

## Extensões

| Rota | Resposta e proteção |
| --- | --- |
| `GET /api/v1/administrative/members?q=&status=&page=0&size=20` | Página de `id`, nome, e-mail, situação, papéis e presença de foto. Busca escapada por nome ou e-mail; filtros e limites validados no servidor. Sem nascimento. |
| `GET /api/v1/administrative/members/{id}` | Ficha com os campos da lista, curso, área, data de nascimento e versão. Restrita à administração global. |
| `GET /api/v1/administrative/members/{id}/history?page=0&size=20` | Página de ingresso/ativação/situação e concessão/revogação de papéis. Inclui data, nome do responsável e motivo opcional. Regularização técnica é marcada e não apresenta responsável humano. |

V49 permite `reason = NULL` nas atribuições de papéis e nos eventos `ROLE_GRANTED`/`ROLE_REVOKED` do membro. A API de concessão/revogação ainda exige motivo até o bloco de Acessos e Convites. Eventos existentes e a regularização da V47 não são reescritos. `PATCH /api/v1/members/{id}` agora rejeita mudança de e-mail institucional vinculado ao Entra.

## Interface

`/gestao/integrantes` pesquisa e filtra com paginação; `/gestao/integrantes/[memberId]` mostra dados cadastrais, vínculo e histórico. Alterações de situação pedem motivo e confirmação. Acesso pela navegação institucional apenas para gestão global; a API valida novamente. A foto usa o proxy autenticado já existente. Não há edição de papéis, convites ou e-mail.

## Validação de 21/11/2026

- PostgreSQL 17 via Testcontainers: `.\mvnw.cmd -q '-Dtest=AdministrativeMemberDirectoryTest,MemberProfileTest' test` passou após V49. `.\mvnw.cmd -q verify` executou 481 testes, mas falhou em 3 expectativas de contagem de migrations afetadas pela V49. Após corrigir essas expectativas, `.\mvnw.cmd -q '-Dtest=AdministrativeMemberDirectoryTest,Block04FrequencyMigrationTest,Block04RetirementMigrationTest,InstitutionalProjectRoleMigrationTest' test` passou (6 testes). Os relatórios finais somam 481 testes, 0 falhas, 0 erros; a suíte completa **não** foi reexecutada após a correção dos testes de upgrade.
- Web após o ajuste mobile: `npm run lint`, `npm run typecheck`, `npm run test` (107 arquivos, 505 testes) e `npm run build` passaram. `git diff --check` passou.
- Inspeção autenticada no ambiente local: diretório e ficha com dados reais, busca vazia, desktop/mobile e temas claro/escuro. A API local foi reconstruída e reiniciada com a V49. A interface de mudança de situação não foi acionada na base local, que apresentava apenas um administrador; autorização, persistência e histórico dessa operação foram testados no PostgreSQL isolado.
