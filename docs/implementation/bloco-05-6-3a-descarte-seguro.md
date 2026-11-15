# Bloco 05.6.3A — Infraestrutura de descarte seguro

**Status de ativação:** fechado por padrão. Nenhuma política de retenção aprovada é criada pela migration. O worker exige simultaneamente `DOCUMENTS_ENABLED=true`, `DOCUMENT_PURGE_WORKER_ENABLED=true`, uma política aprovada e vigente no PostgreSQL e uma operação validada e enfileirada. Não há geração automática de operações por prazo.

## Contratos

- `POST /api/v1/me/trash/{id}/purge/preview`: simula a elegibilidade, informa recurso, tipo, volume estimado e bloqueio.
- `POST /api/v1/me/trash/{id}/purge` com `Idempotency-Key`: registra a solicitação; sem política elegível ela fica `BLOCKED_POLICY`. Uma solicitação aprovada grava a outbox e muda o estado para `PURGE_PENDING` na mesma transação PostgreSQL.
- `GET /api/v1/me/trash/purge-operations/{operationId}`: consulta progresso, restrita ao solicitante ou à administração.
- `POST /api/v1/me/trash/empty/preview`: simula até 200 itens e indica truncamento.
- `POST /api/v1/me/trash/empty` com `Idempotency-Key`: cria uma operação em lote somente se todos os itens visíveis forem elegíveis; qualquer bloqueio impede o lote inteiro.

Os endpoints pessoais só revelam recursos do titular. Recursos de projeto ou institucionais não recebem política por inferência. Hold, proteção, propriedade indeterminada, referência acadêmica e referência a objeto fora do lote bloqueiam o descarte, inclusive para administração.

## Persistência e processamento

V34 cria políticas versionadas, operações idempotentes, itens, outbox de objetos e tombstones. Objetos e versões continuam referenciados no PostgreSQL para preservar autoria e histórico; o worker remove bytes S3 fora de transações SQL, registra cada tentativa com código de erro sanitizado e pode repetir `PROCESSING` abandonado após cinco minutos. Antes de cada remoção, revalida referências. Referências resolvidas podem ser reconciliadas e tentadas novamente.

O backend mantém `PURGE_PENDING` inacessível pelas rotas documentais normais. Apenas após todos os objetos elegíveis serem removidos marca recursos como `PURGED`, fecha a operação e grava o tombstone. Falha ou referência encontrada mantém a operação parcial e não declara conclusão. Arquivamento institucional continua usando `archived_at` e seu fluxo próprio.

## Segurança de armazenamento e recuperação

O método de descarte S3 percorre todas as versões e delete markers da chave exata e também remove a versão atual, tratando objeto ausente como sucesso idempotente. A validação automática executada aqui usa SeaweedFS sem versionamento habilitado; comportamento de `ListObjectVersions` e remoção de versões em S3 institucional ainda requer homologação no provedor real.

Antes de ativar em qualquer ambiente real, a operação deve confirmar: política institucional assinada e registrada com hash/revisão; backup recuperável do PostgreSQL e dos metadados necessários; retenção/versionamento/replicação S3 que permita cumprir a política; restauração que reaplique tombstones antes de reexpor objetos; e procedimento para falha parcial/reconciliação. Restore de backup sem reconciliação de tombstones pode reintroduzir conteúdo logicamente descartado.

`DOCUMENT_PURGE_WORKER_ENABLED` permanece `false` por padrão. Não ativar expurgo automático neste bloco. A tabela de políticas não deve ser preenchida em produção até homologação formal das classes, prazos, autoridades e holds acadêmicos.
