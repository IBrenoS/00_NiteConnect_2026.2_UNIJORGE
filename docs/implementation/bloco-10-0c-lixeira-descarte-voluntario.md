# Bloco 10.0C — Lixeira, restauração e descarte voluntário

## Auditoria do fluxo existente

- `TrashExplorer` já consultava prévias e exigia `X-Confirm-Purge`, mas a prévia pessoal apresentava o bloqueio retornado pelo backend. `canPermanentlyDelete` também vinha de `DocumentLibraryService.trashCapabilities`; não era uma decisão local do frontend.
- `DocumentPurgeService.evaluate` avaliava todo item pela política operacional. `DocumentPurgeRepository.policyEligibility` exigia liberação operacional auditada, política NITE aprovada/vigente e verificava referências; o prazo de 30 dias era opcional na prévia manual. A ausência da política/liberação tornava até um arquivo pessoal recente inelegível.
- `DOCUMENT_PURGE_WORKER_ENABLED` é `false` por padrão. Mesmo uma operação autorizada não remove bytes sem esse worker. `DocumentPurgeWorker` usa o mesmo fluxo durável para objetos e executa a chamada ao `DocumentObjectStore` fora da transação SQL.
- A ativação do worker não deve iniciar a descoberta automática: `DOCUMENT_PURGE_AUTOMATIC_ENABLED` é um controle separado e fica `false` por padrão. O worker habilitado processa descarte voluntário, pedidos manuais `ITEM`/`EMPTY` com política vigente e, somente com o segundo controle ligado, operações `AUTO` também sujeitas à política e liberação operacional.
- Holds, propriedade `UNKNOWN`, proteção pessoal, referências acadêmicas/template e referências externas a objetos são bloqueios de segurança. A liberação operacional e a política de 30 dias governam retenção institucional/automática.
- A restauração pessoal já suportava arquivos e pastas; não havia autorização de restauração por gestor na lixeira contextual do projeto. Não foi localizado endpoint de quota/capacidade de armazenamento neste módulo.

## Alterações

- `VOLUNTARY` e `VOLUNTARY_EMPTY` registram pedidos de descarte pessoal distintos de `AUTO` e podem operar sem `policy_id`. Só são usados para conteúdo pessoal próprio, sem proteção, hold ou referência. O worker revalida titularidade, estado, hold e referências antes de remover bytes. Repetições com a mesma `Idempotency-Key` retornam a operação original, inclusive depois da transição para `PURGE_PENDING` ou da conclusão.
- Retenção automática permanece com política aprovada, liberação operacional, prazo de 30 dias e worker habilitado. Descarte institucional/manual preserva a política e o prazo; as solicitações de descarte de projetos continuam no fluxo de aprovação institucional.
- A lixeira de projeto permite ao gestor restaurar itens do próprio projeto; mantém os bloqueios de hold e propriedade desconhecida.
- O modal de descarte explicita irreversibilidade, tamanho, itens, bloqueios e exige confirmação acessível antes de enviar a operação.

## Operação

- `DOCUMENT_PURGE_WORKER_ENABLED=true` é necessário para processar remoção física e segue `false` por padrão. `DOCUMENT_PURGE_AUTOMATIC_ENABLED=false` impede que a habilitação necessária aos pedidos voluntários inicie a descoberta ou processamento `AUTO`.
- Em ambiente controlado, habilite o worker somente com PostgreSQL Testcontainers e bucket S3 descartável, confirme a remoção de versões/objetos, os tombstones e os retries e mantenha a automação desligada.
- Na Render/ambiente definitivo, habilite o worker apenas em um serviço com acesso restrito ao banco e bucket documental correto, após validar backup/restauração, versionamento e exclusão S3, reconciliação PostgreSQL/S3, permissões mínimas, métricas, alertas e retomada de falhas. Mantenha `DOCUMENT_PURGE_AUTOMATIC_ENABLED=false`; uma ativação futura exige aprovação operacional explícita, política vigente de 30 dias, liberação auditada e revisão da fila `AUTO` antes da mudança.
- Nenhuma política, liberação operacional, dado real, segredo ou serviço externo foi alterado nesta finalização.
