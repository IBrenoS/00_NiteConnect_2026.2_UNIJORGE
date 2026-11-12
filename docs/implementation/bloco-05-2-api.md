# NITE CONNECT — Entrega 05.2: biblioteca documental

## Princípios

- Biblioteca única: `Meus arquivos` e `Biblioteca do NITE` são visões dos mesmos documentos e objetos S3.
- A migração **V28** acrescenta pastas e metadados sem substituir UUIDs e versões da fundação WOPI (V27). `Integrantes`, `Projetos`, `Materiais institucionais` e `Modelos oficiais` são raízes institucionais, não pastas rígidas.
- Cada integrante ativo possui pasta `PERSONAL`; projetos possuem pasta `PROJECT`; pastas `CUSTOM` podem ser aninhadas, renomeadas, movidas, recoloridas e arquivadas. Nomes de pastas irmãs são únicos com normalização de maiúsculas e espaços nas bordas. Movimentações com conteúdo entre domínios de permissão são bloqueadas.
- Integrante: leitura/edição DOCX e upload na própria área; **não pode excluir nem administrar pastas**. Gestor de projeto: administração de arquivos apenas de seus projetos; vínculo não concede acesso à pasta pessoal dos membros. Gestão Geral e Coordenação: administração institucional.
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
| `PATCH /library/documents/{id}` | Mover/renomear documento dentro do mesmo contexto, somente gestor autorizado |
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

O catálogo geral e solicitações de ingresso em projetos pertencem à evolução do Bloco 02, não a 05.2. O histórico detalhado, coedição avançada e recuperação institucional completa pertencem à 05.3; integração das versões à avaliação acadêmica pertence à 05.4. Este módulo não reintroduz contabilização de horas. Arquivos históricos mantêm seus objetos e UUIDs originais. O editor Collabora/SeaweedFS permanece auto-hospedado e gratuito.
