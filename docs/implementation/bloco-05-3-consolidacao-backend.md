# Consolidação do backend Meus Arquivos

**Base:** `main`, a partir de `c2161cc` (Bloco 05.2).  
**Estado desta implementação:** `mvnw verify` concluído com sucesso; aguarda homologação funcional do ciclo completo no Collabora e decisões operacionais de S3/órfãos.

## Decisões técnicas

1. **Raiz é contextual.** `moveToRoot=true` resolve para a pasta pessoal, de projeto ou raiz institucional de origem. Movimentações validam a identidade do escopo mesmo para pastas vazias; raízes institucionais diferentes não são tratadas como intercambiáveis.
2. **Organização pessoal sem administração.** Integrante ativo pode criar subpastas, renomear/mover pastas `CUSTOM` e mover arquivos no próprio escopo. O modelo estrutural pessoal permanece protegido; arquivamento/restauração permanece administrativo. Gestores de projeto não ganham acesso pessoal dos integrantes.
3. **Histórico legado por migração aditiva.** V28 permanece imutável. V29 provisiona pasta para titular inativo apenas quando há documento pessoal legado e associa os registros sem alterar IDs, revisões ou chaves dos objetos.
4. **Provisionamento em lotes.** O contrato novo usa paginação por UUID e limita cada chamada a 100 integrantes e 100 projetos. O endpoint antigo preserva a sincronização integral, processando páginas de até 100 por transação; integrações que precisam exibir progresso devem usar o contrato batch enquanto `hasMore=true`.
5. **Paginação keyset.** Listagem usa desempate por UUID e cursor vinculado à pasta, filtros e ordenação. O limite de arquivo por item continua 8 MiB; upload hierárquico aceita até 100 itens/32 MiB totais por requisição para limitar memória e duração da transação.
6. **Compensação S3.** Escritas de lote registram compensação para exclusão do objeto se a transação PostgreSQL fizer rollback. Falha de processo após `PutObject` e antes da confirmação ainda pode deixar órfão; a solução não tenta varrer/remover objetos sem um reconciliador seguro e política operacional.

## Matriz de aderência

| Capacidade | Estado | Evidência / limite |
|---|---|---|
| Isolamento pessoal, administrativo e de projeto | Implementado | Autorização no serviço; testes existentes e regressão pessoal/projeto. |
| Mover pasta para raiz sem cruzar escopo | Implementado | Raiz resolvida a partir da hierarquia e escopo sempre comparado, inclusive sem conteúdo. |
| Integrante criar/renomear/mover conteúdo próprio | Implementado | Só pastas `CUSTOM` e arquivos na própria árvore; sem arquivamento/restauração. |
| Arquivamento lógico e restauração administrativa | Implementado anteriormente | Reutiliza eventos, lotes de arquivamento e versões imutáveis existentes. |
| Preservar documento pessoal de integrante inativo na V28 | Implementado via V29 | Teste de upgrade V27→V28→V29 preserva documento, versão e object ID. V28 não foi reescrita. |
| Provisionamento seguro/idempotente/escalável | Implementado com limite | Pasta idempotente e operação batch por cursores; modelos distribuídos reutilizam chave versão+destinatário. Requer consumir todos os lotes. |
| Upload de arquivo individual | Implementado anteriormente | Formatos e máximo 8 MiB preservados; nomes duplicados retornam conflito. |
| Upload múltiplo e hierárquico | Implementado | Multipart `files` + `paths`; rollback PostgreSQL e tentativa de remover blobs no rollback. Não elimina janela de crash de processo. |
| Pesquisa, tipo, ordenação e paginação estável | Implementado | Busca por título, filtro MIME, nome/data/tamanho, keyset por UUID; pastas irmãs continuam listadas sem paginação. |
| Metadados de arquivo/pasta | Implementado | Usa relações e timestamps persistidos, nomes de responsáveis, localização e contagem de concessões/distribuições reais. |
| Detalhe e atividade autorizada | Implementado com limite paginado | Histórico keyset, 1–100 eventos por chamada, ator e evento persistidos; nenhum compartilhamento público foi introduzido. |
| Importação, download, versões e WOPI/Collabora | Compatibilidade preservada; ciclo E2E pendente | Core WOPI não foi alterado. O endpoint de discovery do Collabora local respondeu HTTP 200 e anunciou DOCX, mas edição/salvamento/reabertura com usuário não foram executados. |
| PostgreSQL real | Verificado | `mvnw verify` migrou bancos Testcontainers PostgreSQL 17 até V29 e executou a suíte de integração. |
| S3 compatível | Verificado parcialmente | `DocumentS3IntegrationTest` passou com SeaweedFS em Testcontainers. A instância S3 institucional não foi exercitada. Reconciliação de órfãos continua pendente. |

## Contrato frontend

Consultar `docs/implementation/bloco-05-2-api.md`, seção **Extensões compatíveis de Meus Arquivos**. Os contratos antigos continuam operacionais; listagens preservam as chaves originais e acrescentam metadados/paginação. Novas operações: `POST /api/v1/library/folders/{folderId}/upload-tree`, `GET /api/v1/library/documents/{id}`, `/activity`, `/api/v1/library/folders/{id}/activity` e `POST /api/v1/library/provision-existing/batch`.

## Pendências reais

- Validar a instância S3 privada institucional, incluindo indisponibilidade e procedimento de reconciliação de objetos órfãos.
- Validar importação, download, edição, salvamento e reabertura DOCX em Collabora/WOPI após a consolidação.
- Definir, com operação institucional, retenção/reconciliação de órfãos e volume esperado por lote; os limites atuais são controles técnicos, não política institucional.
- Verificação TypeScript do frontend não foi executada; nenhuma alteração de frontend foi feita e o contrato foi documentado de forma aditiva.

## Validação executada

- `.\mvnw.cmd --batch-mode verify` em `apps/api`: **BUILD SUCCESS**, 329 testes em 64 classes, sem falhas após ajustar contagens de migração que esperavam V28.
- Testes direcionados de `DocumentLibraryTest`, `DocumentLibraryMigrationTest`, `Block04FrequencyMigrationTest` e `Block04RetirementMigrationTest`: passaram com PostgreSQL 17/Testcontainers.
- `DocumentS3IntegrationTest`: passou usando SeaweedFS/Testcontainers.
- `GET http://127.0.0.1:9980/hosting/discovery`: HTTP 200, resposta XML com ação DOCX.
- `git diff --check`: sem erros.
