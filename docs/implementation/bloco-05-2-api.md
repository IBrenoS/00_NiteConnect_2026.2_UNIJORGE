# NITE CONNECT — Entrega 05.2: biblioteca documental

## Princípios

- Biblioteca única: `Meus arquivos` e `Biblioteca do NITE` são visões dos mesmos documentos e objetos S3.
- A migração **V28** acrescenta pastas e metadados sem substituir UUIDs e versões da fundação WOPI (V27). `Integrantes`, `Projetos`, `Materiais institucionais` e `Modelos oficiais` são raízes institucionais, não pastas rígidas.
- Cada integrante ativo possui pasta `PERSONAL`; projetos possuem pasta `PROJECT`; pastas `CUSTOM` podem ser aninhadas, renomeadas, movidas, recoloridas e arquivadas. Nomes de pastas irmãs são únicos com normalização de maiúsculas e espaços nas bordas. Movimentações com conteúdo entre domínios de permissão são bloqueadas.
- Integrante: leitura/edição DOCX, upload e organização de pastas/arquivos `CUSTOM` na própria árvore; **não pode arquivar nem restaurar**. Gestor de projeto: administração de arquivos apenas de seus projetos; vínculo não concede acesso à pasta pessoal dos membros. Gestão Geral e Coordenação: administração institucional.
- DOCUMENTO DOCX: WOPI/Collabora CODE existente. PDF/PNG/JPEG: anexos privados, leitura/download sem edição WOPI. Metadados de última abertura são distintos dos de modificação.
- Modelos: apenas administração cria/publica/retira; cada distribuição produz cópia pessoal própria e imutável no ato da criação, sem reescrever documentos já preenchidos. Uma combinação versão+destinatário é idempotente.
- Arquivamento: **não é exclusão física de versões ou objetos**. A administração pode restaurar pastas e documentos; a restauração de subárvore usa um identificador de lote e verifica colisões.

## Contratos HTTP

Todos os endpoints `/api/v1` dependem de autenticação institucional e autorização realizada no serviço, não na interface.

| Rota | Finalidade |
|---|---|
| `GET /me/library[?folderId]` | Navegação da pasta pessoal e subpastas do próprio integrante |
| `GET /projects/{id}/library[?folderId]` | Navegação dos arquivos de projeto acessível |
| `GET /projects/{id}/library/tree` | Árvore do projeto para organização contextual |
| `GET /library/roots` | Raízes institucionais; administração |
| `GET /library/tree` | Árvore institucional ativa; administração |
| `GET /library/folders/{id}` | Pasta e arquivos sujeitos a autorização |
| `GET /library/archived` | Itens recuperáveis; administração |
| `POST /library/folders` | Criar pasta com `parentId`, `name`, `color` |
| `PATCH /library/folders/{id}` | Renomear, recolorir e mover; `parentId`, `name`, `color`, `moveToRoot` |
| `DELETE /library/folders/{id}[?recursive=true]` | Arquivamento recuperável; administração/gestor no projeto; requer escolha explícita para conteúdo |
| `POST /library/folders/{id}/restore` | Recuperar pasta/subárvore; administração |
| `POST /library/folders/{id}/files` | Upload multipart `file`, `title`, máximo 8 MiB |
| `PATCH /library/documents/{id}` | Mover/renomear documento dentro do mesmo contexto; integrante na própria pasta pessoal ou gestor autorizado do projeto |
| `DELETE /library/documents/{id}` | Arquivar documento, nunca permitir ao integrante comum |
| `POST /library/documents/{id}/restore` | Recuperar documento; administração |
| `PUT /library/documents/{id}/edit-grants/{memberId}` | Conceder/revogar edição em documento de projeto, sem conceder leitura fora do projeto |
| `GET /library/templates` | Modelos oficiais ativos, com versões; administração também vê aposentados |
| `POST /library/templates` | Cadastrar modelo DOCX; `title`, `autoAssignOnJoin`, multipart `file` |
| `POST /library/templates/{id}/versions` | Publicar nova versão do modelo sem atualizar documentos existentes |
| `POST /library/templates/{id}/distribute` | Criar cópias para `memberIds` ativos |
| `POST /me/library/templates/{id}/create` | Criar cópia pessoal a partir da versão oficial atual |
| `POST /library/provision-existing` | Provisionamento idempotente de pastas/modelos para integrantes ativos e pastas de projetos |

Os contratos originais `/api/v1/me/documents`, `/api/v1/documents/{id}`, seus downloads/sessões e `/wopi/files/{id}` continuam válidos. O proxy autenticado `/api/library/download/{id}` mantém os tokens institucionais no servidor Next.

## Telas

- `/documentos`: **Meus arquivos**, documentos pessoais e modelos disponíveis.
- `/biblioteca`: **Biblioteca do NITE**, pastas institucionais, modelos, distribuição, sincronização de integrantes e restauração.
- `/meus-projetos`: seleção dos projetos já vinculados.
- `/projetos/{id}/arquivos`: arquivos de um projeto acessível.

## Limites da entrega

O catálogo geral e solicitações de ingresso em projetos pertencem à evolução do Bloco 02, não a 05.2. Coedição avançada e recuperação institucional completa continuam fora deste contrato; integração das versões à avaliação acadêmica pertence à 05.4. Este módulo não reintroduz contabilização de horas. Arquivos históricos mantêm seus objetos e UUIDs originais. O editor Collabora/SeaweedFS permanece auto-hospedado e gratuito.

## Extensões compatíveis de Meus Arquivos

- As três listagens de pasta (`GET /me/library`, `GET /library/folders/{id}` e `GET /projects/{id}/library`) aceitam `search`, `mimeType`, `sortBy` (`name`, `createdAt`, `modifiedAt`, `size`), `direction` (`asc`, `desc`), `limit` (1–500) e `cursor`. A resposta preserva `folder`, `folders` e `files`, acrescentando `totalFiles`, `nextCursor` e `hasMore`. A ordenação usa o UUID como desempate; o cursor fica vinculado à pasta e aos filtros/ordenação da página anterior.
- Itens de arquivo acrescentam `createdAt`, `createdBy`, `createdByName`, `modifiedBy`, `modifiedByName`, `folderName`, `sharedWithCount` e `lastOpenedBy`. Objetos de pasta acrescentam `ownerName`, `projectTitle`, `createdAt`, `createdByName`, `modifiedByName` e IDs de autoria. `sharedWithCount` reflete apenas distribuições documentais e concessões persistidas; não existe compartilhamento público.
- `GET /api/v1/library/documents/{id}` retorna o detalhe autorizado do arquivo. `GET /api/v1/library/documents/{id}/activity` e `GET /api/v1/library/folders/{id}/activity` retornam eventos em cursor descendente por horário/UUID; aceitam `limit` (1–100) e `cursor`, com `items`, `nextCursor` e `hasMore`.
- `POST /api/v1/library/folders/{folderId}/upload-tree` recebe pares multipart repetidos `files` e `paths` (caminhos relativos com `/`) e cria a hierarquia abaixo da pasta alvo. Limites por lote: até 100 arquivos e 32 MiB somados; permanece 8 MiB por arquivo e os formatos DOCX/PDF/PNG/JPEG. Erro em qualquer item reverte os registros e aciona compensação da gravação S3.
- `POST /api/v1/library/provision-existing/batch?afterMemberId=…&afterProjectId=…&limit=…` processa lotes de até 100 integrantes e projetos por chamada e retorna `membersProcessed`, `projectsProcessed`, os dois cursores e `hasMore`. O endpoint legado `/library/provision-existing` preserva a sincronização integral e percorre lotes limitados em transações separadas; retorna o total de integrantes provisionados.

### Permissões pessoais após consolidação

O integrante ativo pode criar subpastas, renomear/mover pastas `CUSTOM` e mover arquivos somente dentro da própria árvore pessoal. Não pode alterar a pasta pessoal estrutural nem arquivar/restaurar pastas ou documentos. Gestores de projeto continuam restritos ao escopo de projeto. `moveToRoot=true` significa raiz do escopo atual (pasta pessoal, raiz do projeto ou raiz institucional de origem), nunca a raiz global do banco.

## Compartilhamento interno (B05.4)

- `GET /api/v1/library/share-recipients?search=...&limit=20` localiza por nome integrantes ativos, exclui o próprio solicitante e retorna somente UUID/nome; exige pelo menos dois caracteres e limita a 50 resultados.
- `POST` e `GET /api/v1/library/documents/{id}/shares` e `/api/v1/library/folders/{id}/shares` criam ou listam grants diretos. O `POST` recebe `{"memberId":"<uuid>","permission":"VIEW|EDIT"}` e retorna o grant (`id`, `targetType`, alvo, destinatário, permissão, concessor e data).
- `PATCH /api/v1/library/shares/{shareId}` recebe `{"permission":"VIEW|EDIT"}`. A alteração revoga a linha anterior e devolve novo `id`, preservando o histórico. `DELETE /api/v1/library/shares/{shareId}` revoga o grant e responde 204.
- `GET /api/v1/me/shared-with-me?limit=50&cursor=...` retorna `items`, `nextCursor` e `hasMore`, com grants diretos para arquivos ou pastas. Para navegar em pasta recebida, use seu ID original em `GET /api/v1/library/folders/{id}`; o pai externo à fronteira compartilhada não é devolvido.
- `VIEW` dá leitura, detalhes, atividade e download. `EDIT` também permite edição DOCX no WOPI; em grants de pasta, permite acrescentar arquivos e subpastas `CUSTOM`. Nenhum grant autoriza arquivamento, restauração, movimentação, renomeação, concessão ou redistribuição.
- Grants diretos e grants de pasta são linhas distintas. A avaliação combina o grant direto e todos os grants de pastas ancestrais e usa o nível maior (`EDIT` > `VIEW`). Uma pasta compartilhada fora da equipe do projeto é rejeitada; documento de projeto pode ser compartilhado pontualmente com integrante ativo externo à equipe.
- A rota legada `PUT /api/v1/library/documents/{id}/edit-grants/{memberId}` continua convertendo `canEdit=true` em `EDIT` e `false` em revogação direta. O grant legado de projeto é migrado para `EDIT` na V30.
- Rebaixar ou revogar invalida sessões WOPI do destinatário nos documentos afetados e limpa locks; callbacks consultam o acesso atual e bloqueiam escrita após a mudança. Sessões de outros editores podem precisar readquirir lock após a limpeza.

Consulte [bloco-05-4-compartilhamento.md](bloco-05-4-compartilhamento.md) para a matriz detalhada e os limites operacionais.
