# Bloco 05.7B — contratos documentais do backend

Todos os endpoints abaixo exigem JWT de integrante ativo. A autorização é recalculada no backend em cada requisição; IDs, links e capacidades retornadas não são credenciais. Recursos na Lixeira ou descartados não são resolvidos pelas rotas normais.

## Perspectivas e acesso

| Método e rota | Uso |
| --- | --- |
| `GET /api/v1/me/library` | Árvore pessoal, inclusive conteúdo disponibilizado pela gestão. |
| `GET /api/v1/me/shared-with-me` | Grants recebidos, com deduplicação do recurso compartilhado. |
| `GET /api/v1/me/shared-by-me?search=&recipientId=&permission=&cursor=&limit=` | Alvos com grants ativos concedidos pelo integrante e ainda sob sua autoridade de compartilhamento. Cursor estável por data de compartilhamento e ID. |
| `GET /api/v1/library/{documents\|folders}/{id}/access` | Permissão efetiva, capacidades e grants diretos/herdados com origem, concedente e destinatário. Grants de terceiros só aparecem a quem pode gerenciar o compartilhamento. |
| `GET /api/v1/library/{documents\|folders}/{id}/info` | Identidade, datas, localização autorizada, capacidades, acesso e atividade. Em pastas, contagem e tamanho agregados são calculados em uma consulta recursiva. |
| `GET /api/v1/library/links/{document\|folder}/{id}` | URL interna relativa e rota de consulta do recurso original. A abertura exige autenticação e acesso atual. |

As rotas existentes `POST/PATCH/DELETE /api/v1/library/.../shares` continuam gerenciando grants. A revogação invalida sessões e locks WOPI afetados.

## Pesquisa transversal descontinuada

O endpoint `GET /api/v1/library/search` e a interface de Pesquisa avançada foram removidos no Bloco 10.0B. Permanecem as pesquisas simples e os filtros locais de cada explorador documental, que continuam usando suas rotas e autorizações próprias.

## Solicitação de arquivos

| Método e rota | Uso |
| --- | --- |
| `POST /api/v1/file-requests` | Corpo `{targetFolderId, recipientIds, dueAt?}`. O solicitante deve poder adicionar à pasta; destinatários devem estar ativos. |
| `GET /api/v1/me/file-requests?role=REQUESTED\|RECEIVED&limit=&offset=` | Solicitações feitas ou recebidas. |
| `GET /api/v1/file-requests/{id}` | Detalhes, uploads e eventos visíveis ao solicitante ou destinatário. O destinatário não recebe o destino nem os demais destinatários e uploads. |
| `POST /api/v1/file-requests/{id}/cancel` | Cancelamento pelo solicitante. |
| `POST /api/v1/file-requests/{id}/uploads` | Multipart `title` e `file` do destinatário autenticado. Usa o pipeline documental existente, registra origem `FILE_REQUEST_UPLOAD` e autoria do remetente. Não concede navegação da pasta. |

Limites atuais: 50 destinatários, 100 arquivos e 32 MiB por solicitação, 8 MiB por arquivo. Nome e hash iguais em reenvio retornam o upload anterior. O upload revalida estado, prazo, destinatário e capacidade atual do solicitante sobre o destino.

## Histórico de versões

| Método e rota | Uso |
| --- | --- |
| `GET /api/v1/documents/{id}/versions?beforeRevision=&limit=` | Revisões imutáveis, em ordem decrescente. |
| `GET /api/v1/documents/{id}/versions/{versionId}/download` | Bytes de revisão autorizada, com verificação de tamanho e SHA-256. |
| `POST /api/v1/documents/{id}/versions/{versionId}/restore` | Requer edição; cria nova revisão e novo objeto, mantém as anteriores e invalida sessões WOPI incompatíveis. |

Versões descartadas ou em quarentena não são oferecidas. A atividade documental registra `VERSION_RESTORED` separadamente da lista de versões.

## Persistência e segurança

V37 adiciona solicitações, destinatários, uploads e eventos imutáveis, além do índice de grants ativos por concessor. Não altera migrations anteriores. O descarte automático e o worker de produção continuam sujeitos à configuração operacional existente.
