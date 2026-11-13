# NITE Connect — Compartilhamento documental interno

**Base:** `main`, continuação do estado local B05.3. Nenhum commit foi criado.  
**Estado:** APIs e autorização implementadas; suíte focada passou. A suíte completa e homologação operacional externa ainda precisam ser concluídas.

## Arquitetura e decisões

- V30 estende `document_grants` com `folder_id` e `permission`, preservando `document_id`, `can_edit`, UUIDs, `granted_by`, timestamps e linhas históricas existentes. Cada mudança revoga a concessão anterior e insere uma nova linha. Índices únicos parciais permitem um grant ativo por destinatário e alvo.
- `document_share_events` registra concessão, alteração e revogação com evento append-only. Grants antigos de edição são convertidos para `EDIT`; a rota legada permanece e mapeia os mesmos dados.
- `DocumentSharingRepository` avalia o maior acesso efetivo entre grant direto e grants ancestrais, ignorando imediatamente destinatários inativos. `DocumentCoreService` usa a mesma decisão para leitura, download, edição e abertura WOPI. A biblioteca usa grants para navegação e detalhes.
- Pastas compartilhadas aparecem como alvos virtuais de `/me/shared-with-me`; IDs, arquivos e objetos S3 continuam sendo os originais. Metadados de pastas ancestrais são omitidos na fronteira do compartilhamento. Em compartilhamento pontual de arquivo de projeto para pessoa externa à equipe, `projectId`, `folderId`, nome da pasta e o ID do projeto em `WOPI CheckFileInfo.OwnerId` são ocultados.
- Destinatários de pasta de projeto precisam pertencer ao projeto. Arquivos de projeto podem ser concedidos individualmente a qualquer integrante ativo. Compartilhar pastas administrativas segue autorização administrativa e o grant é por integrante.
- `EDIT` em pasta permite acrescentar arquivo e subpasta `CUSTOM`; não permite renomear/mover, arquivar/restaurar ou gerir grants. Para impedir expansão silenciosa de acesso, movimentos de pasta envolvidos em hierarquia com grants ativos são bloqueados; arquivos não podem ser movidos para dentro de pasta compartilhada. A movimentação dentro do mesmo diretório e a renomeação sem troca de pai seguem o fluxo existente.
- Revogação/rebaixamento bloqueia documentos afetados com `FOR UPDATE`, revoga sessões WOPI do destinatário e remove locks associados. Os callbacks WOPI revalidam escrita depois de adquirir o lock SQL do documento, fechando a corrida de alteração de permissão contra salvamento. Como o lock WOPI é por documento, outro editor autorizado pode precisar adquiri-lo novamente.

## Matriz de permissões

| Ator / permissão | Ler, baixar, detalhes e atividade | Editar DOCX / adicionar conteúdo | Mover, arquivar, restaurar | Compartilhar/alterar grants |
|---|---|---|---|---|
| Proprietário pessoal | Sim | Sim; `EDIT` inerente ao proprietário | Organiza apenas a própria árvore; arquivamento/restauração seguem privilégio administrativo | Sim, em arquivos e pastas do próprio espaço |
| Integrante com `VIEW` direto ou herdado | Sim dentro da fronteira compartilhada | Não | Não | Não |
| Integrante com `EDIT` direto em arquivo | Sim apenas no arquivo | Edita DOCX via WOPI | Não | Não |
| Integrante com `EDIT` em pasta | Sim para descendentes | Edita DOCX e acrescenta arquivos/subpastas `CUSTOM` | Não | Não |
| Gestor do projeto | Acesso do projeto sob gestão | Conforme gestão do projeto | Operações administrativas existentes do projeto | Sim no acervo do projeto; sem acesso às pastas pessoais de terceiros |
| Coordenador/gestor geral | Conforme autoridade administrativa | Conforme autoridade administrativa | Privilégios administrativos existentes | Administra grants dentro do escopo administrativo |
| Destinatário inativo | Não; acesso negado em cada operação | Não | Não | Grant precisa ser revogado por proprietário/administrador; ativação posterior não restaura sessão revogada |

Grants diretos não são substituídos por grants herdados. A autorização calcula a união de concessões e prevalece o maior nível; retirar uma concessão direta ainda pode deixar acesso herdado válido (e vice-versa).

## Contratos para a interface

| Operação | Contrato |
|---|---|
| Buscar destinatário | `GET /api/v1/library/share-recipients?search=<2+ chars>&limit=<1–50>`; retorna `id`, `name` de integrantes ativos, sem e-mail |
| Ver grants diretos do arquivo | `GET /api/v1/library/documents/{id}/shares` |
| Compartilhar arquivo | `POST /api/v1/library/documents/{id}/shares` com `memberId`, `permission` (`VIEW`/`EDIT`) |
| Ver grants diretos da pasta | `GET /api/v1/library/folders/{id}/shares` |
| Compartilhar pasta | `POST /api/v1/library/folders/{id}/shares` com `memberId`, `permission` |
| Alterar grant | `PATCH /api/v1/library/shares/{shareId}` com `permission`; retorna novo grant e ID |
| Revogar grant | `DELETE /api/v1/library/shares/{shareId}`; 204 |
| Itens recebidos | `GET /api/v1/me/shared-with-me?limit=<1–100>&cursor=...`; cursor opaco, keyset estável por data/ID |
| Navegar pasta recebida | `GET /api/v1/library/folders/{folderId}`; a pasta de fronteira retorna `parentId: null`, descendentes não revelam pais externos |

Os grants retornados contêm `id`, `documentId` ou `folderId`, `memberId`, `memberName`, `permission`, `grantedBy`, `grantedByName` e `createdAt`. `/shared-with-me` retorna alvo original, tipo, nome, permissão, titular, concessor e datas; não retorna caminho privado. A interface deve substituir o ID após um `PATCH`, pois alteração cria linha histórica nova.

## Validação e limites

- `.\mvnw.cmd --batch-mode verify` executado após a implementação: BUILD SUCCESS, 336 testes, 0 falhas, 0 erros e 0 ignorados.
- `DocumentLibraryTest`: 20 testes passaram em PostgreSQL 17/Testcontainers, incluindo `VIEW` somente leitura, `EDIT` por WOPI, herança, maior permissão direta/herdada, revogação, locks, destinatário inativo, pasta pessoal privada, documento de projeto externo à equipe, pesquisa de destinatário e corrida de concessão duplicada.
- `DocumentLibraryMigrationTest`: upgrade V27→V30 passou preservando documento, versão e object ID legados e convertendo grant existente para `EDIT`.
- A validação S3 executou `DocumentS3IntegrationTest` com SeaweedFS em container e passou. Isso valida o adaptador S3 no ambiente de teste, não a instância institucional.
- As chamadas WOPI e a invalidação de sessões/locks foram exercitadas por MockMvc. Não foi feita sessão real de edição/salvamento/reabertura no Collabora nem homologação com usuários reais.
- A pesquisa de destinatários é por nome, exige dois caracteres, limita 50 e não retorna e-mail. Regras institucionais futuras de visibilidade da lista de integrantes podem reduzir esse catálogo sem alterar o contrato de grants.
- Operação de movement em áreas compartilhadas é intencionalmente restritiva para evitar propagação inesperada; movimentação com grants ativos requer revogar ou reavaliar os compartilhamentos antes de mover.
