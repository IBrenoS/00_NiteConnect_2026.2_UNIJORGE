# Bloco 05.6.3B — política interna de retenção e descarte

Contrato funcional: revisão v1.1 de `bloco-05-6-0-contrato-funcional-documental.md`.
O NITE governa esta política internamente. Collabora Online (CODE) continua sendo o editor DOCX.

## Política e autorização

- A API cria rascunhos sucessivos da política `NITE_DOCUMENTS`, com prazo fixo de 30 dias e motivo. Coordenador ou gestor geral pode aprovar sozinho a versão mais recente; a anterior sai de vigência. V35 guarda autor, aprovação, datas, hash e eventos imutáveis.
- O expurgo automático continua sujeito à política vigente de 30 dias, à liberação operacional auditada, a `DOCUMENT_PURGE_WORKER_ENABLED=true` e a `DOCUMENT_PURGE_AUTOMATIC_ENABLED=true` (ambos falsos por padrão). O descarte voluntário de item pessoal próprio, criado pelo titular, sem proteção/hold/referência, não depende da política nem da liberação automática; exige prévia, confirmação `X-Confirm-Purge: true` e worker habilitado. O descarte manual institucional continua sujeito à política e ao prazo mínimo institucional.
- A varredura automática usa cursor PostgreSQL e só seleciona raízes da Lixeira após 30 dias. Revalida cada descendente, hold, proprietário e referências antes de enfileirar. O worker existente revalida novamente antes de remover bytes.
- Gestor de projeto solicita `TRASH` ou `PURGE` somente para recurso de propriedade `PROJECT` do projeto que gerencia. Coordenador ou gestor geral decide uma vez; a aprovação executa a ação na mesma transação de registro da decisão.
- `UNKNOWN`, hold e referências impeditivas bloqueiam a operação; grants `VIEW`/`EDIT` não conferem descarte. Proteção oficial/acadêmica do acervo identificado do NITE não constitui bloqueio permanente à gestão.

## Endpoints

- `GET/POST /api/v1/library/retention-policies`: versões e novo rascunho; `POST /api/v1/library/retention-policies/{id}/approval`: vigência interna.
- `GET/POST /api/v1/library/purge-activation`: consulta e liberação/revogação operacional com motivo e evidência das cinco verificações técnicas.
- `GET/POST /api/v1/library/project-action-requests`: pendências e novo pedido; `GET /api/v1/library/project-action-requests/{id}`: consulta escopada; `POST /api/v1/library/project-action-requests/{id}/decision`: decisão com motivo e confirmação.
- Endpoints existentes `/api/v1/me/trash/{id}/purge` e `/api/v1/me/trash/empty` passam a exigir `X-Confirm-Purge: true` além de `Idempotency-Key`.
- `GET /api/v1/me/trash/purge-operations/{operationId}` inclui estado agregado e estados/motivos por item do lote.

## Ativação operacional

O worker continua desligado por padrão e as migrations não inserem política aprovada nem liberação operacional. `DOCUMENT_PURGE_WORKER_ENABLED=true` processa pedidos voluntários e manuais já autorizados; não ativa a descoberta automática. Só `DOCUMENT_PURGE_AUTOMATIC_ENABLED=true` habilita filas `AUTO`, ainda protegidas pela política vigente, liberação operacional, prazo de 30 dias e validações de cada recurso. Antes de habilitar qualquer operação em ambiente definitivo, registrar via `purge-activation` teste de exclusão de todas as versões S3, backup/restauração, reconciliação PostgreSQL/S3, permissões de bucket e recuperação de falhas parciais. A liberação pode ser revogada; vigência de política isolada não aciona S3.

Nenhuma política de guarda específica externa é presumida. Obrigações comprovadas exigem hold ou referência explícita e resolução auditada antes do descarte.
