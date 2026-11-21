# Biblioteca institucional do NITE — backend

## Auditoria e contrato

A Biblioteca reutiliza a raiz `MATERIAIS` de V28. Não cria um novo catálogo, bucket, cópias físicas ou outra raiz. A designação histórica da raiz permanece compatível com os consumidores existentes.

| Dimensão | Contrato preservado |
| --- | --- |
| Propriedade | `resource_owner_kind`: MEMBER, INSTITUTION, PROJECT ou UNKNOWN; INSTITUTION não é propriedade do criador. |
| Localização | `folder_id`/`parent_id` e contexto PERSONAL, PROJECT ou ADMINISTRATIVE; movimento entre contextos continua bloqueado. |
| Autoria | `created_by` e `modified_by` identificam integrantes, independentemente do proprietário e do papel atual. |
| Destinatário | ACL explícita em `document_grants`, direta ou herdada de pasta; `created_for` também vincula registros institucionais preexistentes ao integrante. |
| Capacidades | `DocumentCapabilityService` permanece autoridade para leitura, edição, organização, compartilhamento, Lixeira e WOPI. VIEW/EDIT não transferem propriedade. |
| Herança | Compartilhar uma pasta concede VIEW/EDIT aos descendentes. Em área institucional, EDIT permite editar documentos existentes; não cria capacidade de organizar, excluir ou adicionar conteúdo. |
| Auditoria | Eventos existentes imutáveis de documentos, pastas, compartilhamentos, restauração e expurgo. Grants históricos preservam a mensagem ao mudar a permissão. |

Gestores gerais e coordenadores ativos usam as capacidades administrativas já existentes. Integrantes ativos acessam conteúdo institucional por ACL e não podem renomear, mover, compartilhar ou excluir esses itens. Arquivos MEMBER continuam privados por padrão; o acesso administrativo preexistente às árvores pessoais foi preservado, sem expansão de permissões.

## Reaproveitado

- `DocumentLibraryService`, suas mutações, pesquisa/paginação, upload hierárquico, bloqueios e validações de contexto.
- Busca de integrantes ativos por nome em `GET /api/v1/library/share-recipients?search=...`.
- ACLs diretas/herdadas, revogação imediata de sessões WOPI e listagem `GET /api/v1/me/shared-with-me`.
- S3 privado, DOCX/PDF/PNG/JPEG, limite de 8 MiB, compensação de upload, Collabora/WOPI e versões imutáveis.
- Lixeira existente, restauração transacional por lote, detecção de conflito e proteção das pastas estruturais.
- Política de trinta dias, política aprovada, ativação operacional, scan automático, worker, reconciliação de referências e tombstones.

## Alterações e endpoints

`GET /api/v1/library/institutional` fornece a listagem administrativa da raiz `MATERIAIS`. Aceita `folderId`, `search`, `mimeType`, `sortBy`, `direction`, `cursor` e `limit` (padrão 50, máximo 500). `folderId` fora dessa árvore retorna 404. Integrante sem perfil administrativo recebe 403. Criação, upload, renomeação, movimento, compartilhamento e exclusão/restauração usam os endpoints documentais existentes e suas capacidades.

`POST /api/v1/library/{documents|folders}/{id}/shares` aceita `message` opcional, com até 1000 caracteres. O grant mantém o mesmo recurso; não há cópia de documento nem de objeto. A mensagem é devolvida em shares, acesso efetivo e `shared-with-me`. A listagem recebida inclui `sourceLabel` (Biblioteca do NITE, Documentos do projeto ou Meus arquivos) e a identidade existente. A mensagem é metadado do grant; esta etapa não envia e-mail nem notificação.

As listagens de Lixeira recebem `originalLocation: {path, rootKey, projectId, projectTitle}` por item. V44 captura o caminho completo e o projeto ao entrar em TRASHED; renomeações posteriores dos ancestrais não alteram esse registro. `item.deletedBy` é o integrante autenticado e `item.deletedByName` vem de `members.name`, nunca do papel. O nome acompanha o cadastro atual, como no contrato anterior. A origem de itens já excluídos antes de V44 é reconstruída pela árvore disponível na migração; não é possível reconstruir renomeações históricas não registradas nesse snapshot.

A Lixeira de projeto filtra o projeto da localização original, preservando também registros de propriedade INSTITUTION localizados naquele projeto. Na consulta de Relatórios, `projectId` também representa localização e não é derivado do proprietário.

Restauração preserva o lote/árvore e rejeita conflito de nome ou ancestral indisponível. Mantém o comportamento atual de revogar grants diretos na exclusão, sem reativá-los automaticamente na restauração; grants herdados de ancestrais ativos continuam sujeitos à política existente. O compartilhamento direto pode ser recriado pela gestão.

O mínimo de 30 dias também se aplica ao expurgo manual de recursos INSTITUTION sem espaço pessoal, tanto na solicitação quanto na revalidação do worker. Comportamentos manuais preexistentes de arquivos pessoais e de projeto foram preservados. Nenhuma configuração operacional de produção é ativada pela migração.

## Consulta para Relatórios

`GET /api/v1/library/members/{memberId}/documents` é uma perspectiva administrativa dos mesmos IDs, com `parentId` opcional, `type=FOLDER|DOCUMENT`, `limit` (1–100, padrão 50) e `offset` não negativo. Retorna `memberId`, `items`, `limit`, `offset`, `hasMore`, em ordem estável por nome e UUID. Sem `parentId`, lista os recursos vinculados em todos os níveis; com `type=FOLDER`, lista apenas pastas. Não cria ACL nem vínculo novo.

| Coluna futura | Campo |
| --- | --- |
| Nome | `name`, `id`, `type`, `parentId` |
| Modificado | `modifiedAt` |
| Modificado por | `modifiedBy`, `modifiedByName` |
| Tamanho | `size`, em bytes; pastas somam versões atuais de documentos ativos descendentes |
| Compartilhamento | `sharing[]`: grant, destinatário/nome, VIEW/EDIT, mensagem, origem DIRECT/INHERITED, pasta fonte e profundidade |

Somente recursos ativos INSTITUTION/PROJECT vinculados ao integrante por `created_for` ou ACL direta/herdada são incluídos. Recursos MEMBER e raízes estruturais pessoais/de projeto são excluídos. Participação em projeto, isoladamente, não vira um vínculo individual de relatório. Integrantes inativos podem ter registros históricos consultados pela gestão, sem reativar seu acesso. Integrantes comuns não podem consultar esse endpoint, mesmo para o próprio UUID.

## Próximas etapas e limites

- **Relatórios:** consumir essa consulta, os metadados e as capacidades dos endpoints documentais existentes; decidir futuramente classificação/período/tipo de relatório se necessários. Não inferir capacidade pelo fato de um registro estar na lista. Paginação por offset pode refletir inserções concorrentes; não é snapshot de exportação. O enriquecimento de grants é limitado à página, com consultas por recurso; avaliar lotes se o volume justificar.
- **Atividades e Entregas:** ainda não há vínculo de evidência documental nesse novo contrato. Uma futura integração deve referenciar document UUID/versão e atividade/entrega existente, validar perfil/vínculo/contexto, auditar e registrar referência de preservação antes de permitir descarte. Não transformar evidências/arquivos existentes nem criar outro armazenamento nesta etapa.
- **Operação:** aplicar V44 via Flyway; manter Collabora/S3 configurados. Expurgo exige política interna aprovada, liberação operacional e worker habilitado. A tarefa não altera `.env`, credenciais ou produção.
- Sem frontend, dependências novas ou commit; alterações locais anteriores preservadas.

## Validação

Execuções em `apps/api`, com PostgreSQL 17 real via Testcontainers. O teste `DocumentPurgeExecutionIntegrationTest` também executou remoção de bytes em SeaweedFS/S3 real. Nos testes HTTP, discovery do Collabora e object store são stubs; o protocolo WOPI e o versionamento foram exercitados, sem navegador/servidor Collabora real.

**Após a última alteração de código:** sete testes, zero falhas/erros/ignorados, exit code 0:

```powershell
mvn -q '-Dtest=InstitutionalLibraryTest#sharingKeepsOneItemMessageAndInheritedEditWithoutStructuralPermissions+reportsExcludePrivateFilesAndFollowRevocationAndPagination+projectTrashIncludesProjectIdentityAndOriginalFullPath,ProjectDocumentWorkspaceTest#institutionalDeletionNeedsApprovalAndProjectTrashStaysIsolated,DocumentLibraryTest#personalDocumentCanBeTrashedAndRestoredWithoutChangingItsIdentityVersionOrObject+recursiveTrashRestoresTheOriginalFolderTreeAndEveryDocument+grantsAreRevokedOnTrashAndAreNotReactivatedByRestore' test
```

**Verificações anteriores que continuam válidas:** 81 outros cenários aprovados, sem repetir os que não foram afetados pelo último ajuste de consulta. Total: 88 cenários únicos aprovados entre as execuções, em 16 classes; não corresponde à suíte completa em uma única execução.

| Classe | Cenários únicos aprovados |
| --- | ---: |
| DocumentCapabilityTest | 6 |
| DocumentFoundationTest | 4 |
| DocumentInternalRetentionPolicyTest | 5 |
| DocumentLibraryMigrationTest | 1 |
| DocumentLibraryOperationsTest | 12 |
| DocumentLibraryTest | 29 |
| DocumentPurgeExecutionIntegrationTest | 1 |
| DocumentPurgeWorkerTest | 5 |
| DocumentQueriesRequestsTest | 5 |
| InstitutionalLibraryTest | 7 |
| ProjectDocumentWorkspaceTest | 5 |
| InstitutionalLibraryMigrationTest | 1 |
| DocumentPurgeCapabilityTest | 4 |
| DocumentPurgeInfrastructureMigrationTest | 1 |
| Block04FrequencyMigrationTest | 1 |
| Block04RetirementMigrationTest | 1 |

Comandos anteriores e seus resultados, incluindo falhas intermediárias corrigidas:

```powershell
mvn -q -Dtest=InstitutionalLibraryTest test
# Inicial: 3 falhas esperadas por endpoint ausente (404); primeira implementação: 3 aprovados.

mvn -q '-Dtest=InstitutionalLibraryTest,DocumentCapabilityTest,DocumentLibraryTest,DocumentFoundationTest,ProjectDocumentWorkspaceTest,DocumentLibraryOperationsTest,DocumentQueriesRequestsTest,DocumentInternalRetentionPolicyTest,DocumentPurgeWorkerTest,DocumentPurgeExecutionIntegrationTest,DocumentLibraryMigrationTest' test
# 80 testes: 79 aprovados; 1 erro no novo fixture de ativação, corrigido.
# Houve antes uma tentativa com erro de compilação no enriquecimento de SharedItem; corrigida antes dessa execução de 80 testes.

mvn -q '-Dtest=InstitutionalLibraryTest,InstitutionalLibraryMigrationTest,DocumentPurgeCapabilityTest,DocumentInternalRetentionPolicyTest,DocumentPurgeWorkerTest,DocumentPurgeExecutionIntegrationTest,DocumentPurgeInfrastructureMigrationTest' test
# 24 testes: 21 aprovados; corrigidos fixture sem official, expectativa BLOCKED_POLICY e versão esperada V44.

mvn -q '-Dtest=InstitutionalLibraryTest#institutionalTreePurgesOnlyAfterThirtyDaysThroughExistingWorker,InstitutionalLibraryMigrationTest,DocumentPurgeInfrastructureMigrationTest,Block04FrequencyMigrationTest,Block04RetirementMigrationTest' test
# Quatro testes de upgrade aprovados; ajustado o teste que chamava novamente uma operação já COMPLETED.

mvn -q '-Dtest=InstitutionalLibraryTest#institutionalTreePurgesOnlyAfterThirtyDaysThroughExistingWorker' test
# 1 aprovado: retenção manual/automática, árvore, remoção de bytes, tombstones e impossibilidade de restauração após expurgo.

mvn -q '-Dtest=InstitutionalLibraryTest#sharingKeepsOneItemMessageAndInheritedEditWithoutStructuralPermissions+reportsExcludePrivateFilesAndFollowRevocationAndPagination+projectTrashIncludesProjectIdentityAndOriginalFullPath' test
# 2 aprovados; o novo caso de propriedade INSTITUTION em projeto expôs a omissão na Lixeira de projeto.
# O filtro foi corrigido e todos os três cenários passaram no comando final de sete testes acima.
```

Os três testes existentes com versão/contagem fixa de migrations foram ajustados para V44 e reexecutados com aprovação. As falhas descritas são deste desenvolvimento/atualização de fixtures e expectativas, sem atribuição a defeitos preexistentes não demonstrados. A omissão de propriedade institucional na Lixeira de projeto foi demonstrada pelo teste antes da correção.

`git diff --check` nos arquivos modificados por esta tarefa também passou. Suíte geral do backend, empacotamento e testes de frontend não foram executados: a regressão foi direcionada ao módulo documental, às integrações afetadas e aos testes de migração dependentes da versão atual. Não há verificação necessária conhecida pendente dentro desse escopo; homologação visual do Collabora e ativação operacional de produção pertencem à operação posterior.
