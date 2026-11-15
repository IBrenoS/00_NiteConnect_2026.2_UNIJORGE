# NITE Connect — Bloco 05.6.0: contrato funcional documental (revisão v1.1)

**Estado:** contrato funcional revisado em 14/11/2026, com decisões de produto de retenção e descarte definidas pelo responsável pelo NITE Connect. O registro operacional de vigência e a habilitação do worker ainda pertencem ao Bloco 05.6.3B. **Escopo:** núcleo documental único para Meus Arquivos e Biblioteca do NITE, com Collabora Online (CODE) e WOPI preservados. **Governança:** o NITE é autogerido por seus integrantes; a UniJorge não aprova políticas internas de descarte nem opera o NITE Connect. **Precedência:** esta revisão substitui as propostas históricas incompatíveis de 30/60 dias, dupla aprovação e dependência de autorização da UniJorge.

**Limite da política:** a autonomia operacional do NITE não dispensa eventual obrigação legal, contratual ou direito de terceiro efetivamente aplicável a um documento específico. Tais situações exigem classificação ou hold específico, não bloqueio genérico de toda a categoria acadêmica.

## 1. Fontes, rastreabilidade e linguagem de estado

- **[D] Definido pelo produto:** regras e autoridades aprovadas funcionalmente nesta revisão: 30 dias de Lixeira para todas as categorias elegíveis, descarte manual antecipado para autorizados, coordenação/gestão geral como autoridades de descarte institucional, e ausência de aprovação externa ou dupla assinatura obrigatória.
- **[I-H] Implementação histórica verificada no documento original:** migrações V6/V27–V31, serviços documentais e frontend, conforme auditoria da versão inicial de 05.6.0. Trata-se da linha de base histórica, não da descrição do checkout atual.
- **[I-R] Implementado conforme relatórios de execução do Codex, ainda sem verificação independente deste arquivo:** V32 (identidade/capacidades), V33 (Lixeira/restauração), V34 (infraestrutura de descarte assíncrono). Worker e política de descarte ainda desativados; 05.6.3B não implementado. O código do workspace decide a condição operacional real.
- **[R] Recomendação técnica:** comportamento a implementar nos próximos blocos; não autoriza execução em produção. **[P/T] Pendente técnico/operacional:** registro e vigência da política interna, testes no S3 real, backup/restore e validação de integração. Nenhuma aprovação da UniJorge é pré-requisito do fluxo interno.

**Regra de leitura:** as evidências V6–V31 abaixo descrevem a base auditada na redação original. O estado incremental V32–V34 é relatado separadamente, e as regras [D] desta revisão são o alvo para reconciliar eventuais diferenças com esses blocos.

### Evidências técnicas principais

| Evidência atual | Consequência para o contrato |
|---|---|
| V6 `documents` tem `context`, `owner_id` pessoal, `created_by`, `official`, `current_version_id`; `document_versions`, `document_events` e `document_pdfs` têm linhas imutáveis. V28 adiciona `folder_id`, `modified_by`, `modified_at`, `document_folders` e distribuição de modelos. | Titular do espaço, criador e último modificador já são parcialmente distinguíveis. Não há proprietário explícito de recurso `CUSTOM`, estado de Lixeira ou descarte. `official` isolado não identifica toda distribuição protegida. |
| `DocumentCoreService.requireAccess/canWrite`, `DocumentLibraryService.requireRead/requireOrganize/requireAddContent/requireManage/requireShareManage` e `DocumentSharingRepository` aplicam papéis, escopo e grants em pontos diferentes. | A autorização funciona para os fluxos atuais, mas não há resposta central de capacidades efetivas nem regra de exclusão por criador/proteção. |
| `archiveFile/archiveFolder` exigem `requireManage`; `restoreFile/restoreFolder` exigem administrador. V28 usa `archived_at` e `archive_batch_id`; `GET /api/v1/library/archived` é administrativo. | Arquivamento institucional existente não é Lixeira pessoal. `DELETE /api/v1/library/...` atual deve manter sua semântica até uma transição versionada/documentada. |
| V30 mantém grants `VIEW`/`EDIT` diretos e herdados, eventos de share imutáveis e listagem `/api/v1/me/shared-with-me`; B05.4 revoga sessões WOPI ao retirar acesso. | Compartilhamento é uma referência ao recurso original, não cópia. Grant não concede administração, descarte ou redistribuição. |
| V27/V31, `DocumentWopiService`, `DocumentRepository` e `S3DocumentObjectStore` guardam sessão, lock, revisão e objeto privado. `PutFile` verifica permissão atual, lock, integridade DOCX e só promove revisão após gravação. | Preservar WOPI/Collabora; lixeira e descarte precisam invalidar sessões, respeitar locks e tratar a não atomicidade entre PostgreSQL e S3. |
| `/documentos` tem visões pessoal e recebida por `view=shared`; `/biblioteca` é a interface administrativa. A navegação global tem Meus arquivos e Biblioteca, sem Lixeira. | Compartilhado continua visão interna de `/documentos`; Lixeira receberá rota própria em Meu espaço. |

## 2. Modelo de domínio e responsabilidades

**[R] Identidades separadas, estáveis por recurso:**

| Conceito | Significado e regra |
|---|---|
| Titular do espaço (`spaceOwnerId`) | Integrante a quem a árvore `PERSONAL` pertence. Determina a perspectiva Meus arquivos e o acesso pessoal de base. Não implica autoria ou direito de excluir cada item. Em `PROJECT`, o contexto é o projeto; em raízes institucionais, o responsável lógico é o próprio NITE, não a UniJorge. |
| Proprietário do recurso (`resourceOwner`) | Responsável lógico e estável pelo item: integrante criador de conteúdo pessoal próprio, projeto/NITE para conteúdo sob controle da gestão, ou proprietário de origem em casos controlados. Deve ser explícito para documento **e pasta**, com `ownerKind` e identificador; não deduzir exclusivamente do pai. Mudança de contexto não altera proprietário tacitamente. Transferência exigirá operação administrativa específica e trilha. |
| Criador (`createdBy`) | Pessoa que materializou o item; imutável. Ao criar por conta de terceiro, registrar também `createdFor`/origem quando aplicável. Distribuição de modelo mantém emissor gestor como criador e destinatário como titular; a origem institucional vincula a versão do modelo. |
| Último modificador (`modifiedBy`) | Pessoa da última alteração de conteúdo/metadados; `lastOpenedBy` é separado. Edição, inclusive por grant, nunca altera proprietário, criador ou capacidade de excluir. |
| Autoridade administrativa | Gestor geral e coordenador exercem autoridade interna sobre o acervo do NITE; gestor de projeto exerce competências de projeto e pode solicitar descarte de material institucional no seu escopo. Competência não transfere propriedade; gestor de projeto não administra pastas pessoais alheias. |
| Proteção (`protection`) | Estado/razão explícitos: modelo/distribuição oficial do NITE, vínculo acadêmico interno/evidência, hold ou restrição específica. A proteção impede exclusão por integrante sem autoridade, mas **não é veto perpétuo ao coordenador ou gestor geral**: estes podem descartar recursos do NITE se não houver hold ou referência técnica impeditiva. A classificação e a liberação de hold exigem trilha auditável; não inferir somente de nome, pasta ou `official`. |
| Grant | Direito temporário/revogável `VIEW` ou `EDIT` sobre alvo original, direto ou herdado. A maior permissão de leitura/escrita vence para conteúdo; nenhum grant amplia capacidades de organizar, compartilhar, excluir, restaurar ou expurgar. |

### Classificação documental do NITE — [D]

| Categoria | Exemplo interno | Direito de descarte | Prazo de Lixeira |
|---|---|---|---|
| `PERSONAL` | Arquivo/pasta própria, sem proteção | Proprietário autorizado | 30 dias |
| `INSTITUTIONAL_OPERATIONAL` | Organização e planejamento do Núcleo | Coordenador ou gestor geral; gestor de projeto solicita no seu projeto | 30 dias |
| `INSTITUTIONAL_OFFICIAL` | Modelos e materiais oficiais do NITE | Coordenador ou gestor geral | 30 dias |
| `ACADEMIC_NITE` | Diário, Plano AV3, evidência e entrega geridos internamente pelo NITE | Coordenador ou gestor geral; gestor de projeto solicita no seu projeto | 30 dias |
| `UNKNOWN` / `HELD` | Sem classificação segura ou hold explícito | Bloqueado até classificação/liberação por autoridade interna | Prazo de referência 30 dias, mas sem descarte enquanto bloqueado |

As categorias orientam a autoridade, não introduzem prazos de Lixeira diferentes. `ACADEMIC_NITE` não atribui guarda documental à UniJorge. A classificação `HELD` representa um impedimento específico, não um tipo de documento permanentemente indisponível.

**[R] Serviço único de política:** introduzir, no módulo `documents`, avaliador `effectiveCapabilities(actor, resource, context)` usado por todos os serviços, WOPI e DTOs. Retorno mínimo: `canView`, `canDownload`, `canEdit`, `canAddChild`, `canRename`, `canMove`, `canCopy`, `canShare`, `canDeleteToTrash`, `canRestore`, `canPermanentlyDelete`, `canArchiveInstitutionally`, `canManageProtection`, cada um com motivo público estável quando falso (`PROTECTED`, `NOT_CREATOR`, `OUT_OF_SCOPE`, `GRANT_ONLY`, `LOCKED`, `HELD`, `STATE`, `PARENT_BOUNDARY`). O frontend só apresenta ações desse contrato; o backend recalcula na mutação, sem aceitar capacidades fornecidas pelo cliente. Respostas de listagem podem trazer capacidades resumidas; detalhes/trash trazem a versão completa. Incluir `policyVersion`/ETag para atualizar a interface, sem confiar nela para autorizar.

**[R] Fronteiras:** `DocumentCoreService` continua responsável por bytes/revisões/WOPI, `DocumentLibraryService` por árvore, busca e operações; repositórios armazenam fatos e não fazem decisões de papel. O avaliador único consulta `AccessService`, `ProjectAccess`, grants e proteção. A Biblioteca e Meus arquivos reutilizam esses serviços e IDs; nenhuma segunda tabela de arquivos ou cópia de autorização no frontend.

## 3. Matriz de autorização de referência

Legenda: **S** permitido se ativo e elegível; **C** condicionado a autorização contextual e integridade; **N** negado. **Excluir** é enviar à Lixeira; **descartar** é eliminar permanentemente conteúdo elegível. Arquivar permanece operação distinta. A política é **[D]**; divergências técnicas dos blocos já entregues devem ser reconciliadas no 05.6.3B.

| Ator e recurso | Ver/editar | Organizar/compartilhar | Excluir → Lixeira | Restaurar | Descartar permanentemente |
|---|---|---|---|---|---|
| Qualquer integrante, conteúdo pessoal **próprio**, sem hold ou restrição impeditiva | S, conforme capacidade | S, no escopo autorizado | **S** | S | **S, inclusive antes de 30 dias**, mediante confirmação e prévia |
| Titular de espaço com item criado pela gestão ou por terceiro | C, conforme concessão | C; não adquire controle por estar em sua pasta | **N** para o titular | N, salvo competência específica | N |
| Destinatário de grant `VIEW` ou `EDIT` | C, conforme grant | Não recebe gerência/exclusão por grant | **N** sobre o item alheio | N | N |
| Gestor de projeto, conteúdo pessoal próprio | S | S no próprio escopo | **S** | S | **S**, se elegível |
| Gestor de projeto, material institucional/oficial/acadêmico do projeto | S no seu projeto | C conforme gestão do projeto | **Solicitar** ação à coordenação/gestão geral; não executar descarte institucional diretamente | Solicitar, se não tiver capacidade específica de restauração | **Solicitar**; não aprovar/executar por conta própria |
| Coordenador ou gestor geral, material institucional, oficial ou acadêmico **do NITE** | S | S no escopo administrativo | **S** diretamente, mesmo sendo oficial/acadêmico | **S**, com consistência de destino | **S, inclusive antes de 30 dias**, se em Lixeira e sem impedimento técnico/hold |
| Legado `UNKNOWN` ou item com hold | C, segundo ACL | C apenas operações não destrutivas seguras | N até classificação/liberação do hold | C, respeitando escopo/hold | **N** até classificação/liberação |
| Integrante inativo | N | N | N | N | N |

**Sem dupla aprovação obrigatória.** Coordenador ou gestor geral pode aprovar individualmente uma solicitação de gestor de projeto e pode iniciar ação própria, com confirmação e auditoria. Não há fluxo de autorização da UniJorge. A categoria *acadêmico do NITE* não equivale automaticamente a documento oficial sob custódia da universidade.

**Separar responsabilidades:** `createdBy`, `resourceOwner`, `spaceOwnerId` e `modifiedBy` são fatos diferentes. Editar nunca transfere propriedade nem direito de excluir; pertencer à pasta de alguém não implica direito de eliminar item criado pela gestão. Operações de projeto exigem escopo vigente.

**Proteção versus impedimento:** classificações `INSTITUTIONAL`, `OFFICIAL` e `ACADEMIC_NITE` restringem o integrante comum, mas não impedem por si só o coordenador/gestor geral. Holds explícitos, referência técnica pendente, origem indeterminada ou obrigação externa concretamente identificada bloqueiam até resolução auditada. Uma proteção institucional legada não deve ser removida automaticamente; implementar decisão explícita da autoridade do NITE e migrar regras de modo conservador.

### Pastas mistas e operações recursivas

Cada filho conserva proprietário, criador, grants, versões e proteção próprios. Qualquer exclusão, restauração, movimentação ou cópia recursiva deve elaborar plano integral autorizado. Se um descendente não for elegível ou estiver sob hold, a operação inteira falha, sem exclusão parcial oculta nem exposição de nomes de itens privados. A gestão pode resolver a dependência/classificação previamente e executar novamente; não pode contornar integridade referencial por papel.

Movimentar preserva IDs, autoria e grants, mas reavalia a herança e o contexto. Copiar/duplicar cria IDs, objetos e revisões independentes, sem herdar grants por padrão. Cópia de itens institucionais para áreas menos restritas exige autoridade e não deve eliminar proteções implicitamente.

## 4. Contratos funcionais por operação

Toda mutação requer integrante ativo, recurso visível, capacidade recalculada, validação de nome/formato/limites, detecção de conflito e evento auditável. Respostas não expõem caminhos de ancestrais privados; `404` para recurso não visível, `403` para ação negada em recurso visível, `409` para conflito de estado/nome/versão/lock, `400/413` para entrada/limite, `503` para dependência indisponível. Repetição segura de requisições em lote ou assíncronas requer chave de idempotência e resultado recuperável.

| Operação | Estado atual **[I]** | Contrato alvo **[R]**: pré-condições, efeitos e integridade |
|---|---|---|
| Criar pasta; upload simples, múltiplo e diretório | Pastas `CUSTOM`, upload DOCX/PDF/PNG/JPEG; lote hierárquico até 100 itens/32 MiB por requisição, item até 8 MiB; colisões verificadas. | Manter validação, limite e atomicidade por lote; preencher proprietário/proteção por origem e destino. `paths` saneados, sem traversal, profundidade/ciclo e colisões conferidos. Arquivo novo tem ID e revisão 1; upload repetido não cria duplicata por acidente. Diretório vazio precisa contrato explícito. |
| Renomear, mudar cor, mover | Endpoints de pasta/documento; mesmo contexto, sem ciclos; movimentos em fronteiras compartilhadas bloqueados. | Preservar ID, versão de conteúdo, proprietário e grants; atualizar `modifiedBy/At` e evento. Reavaliar subárvore e herança. Cor só pasta; proteção/raiz estrutural bloqueiam alterações sem autoridade. |
| Copiar e duplicar | Só cópia de modelo oficial para destinatário, idempotente por versão+destinatário. | Contrato novo para cópia geral; duplicar = copiar no mesmo pai. Plano recursivo e limite de volume; sem herdar grants; autoria e proveniência novas; colisão com nome sugerido explícito. Nunca reutilizar referência S3 como se fosse objeto independentemente descartável sem contagem/retenção. |
| Download individual, múltiplo, pasta | Download autenticado individual. | ZIP gerado no servidor ou job de exportação, com manifesto, nomes saneados, limites, streaming, expiração e autorização por item no momento da leitura; todos autorizados ou falha atômica informativa. Não conceder URL S3 pública. |
| Favoritos; operações em lote | Favoritos e mutações de lote não implementados. | Favorito é preferência por usuário sobre ID original, invisível se acesso revogado; não é grant nem versão. Lote com IDs deduplicados, limite, prévia de autorização e semântica atômica para move/delete; ações independentes como favorito podem retornar resultado por item. |
| Metadados, pesquisa, filtros, ordenação, atividade | Detalhes, última abertura/modificação, pesquisa por nome/tipo, ordenação e cursor; atividade paginada. | Estender filtros por origem, titular, criador, proteção, data, compartilhamento e estado, sempre após ACL; cursor ligado a filtros e ordem. Histórico de atividade é distinto de histórico de revisões; novo contrato para listar/baixar/restaurar revisões, com autorização e revisão nova ao restaurar conteúdo. |
| Compartilhar e gerir acesso | Grants diretos/herdados `VIEW`/`EDIT`, CRUD e revogação de WOPI; destinatários ativos. | Reutilizar; expor origem efetiva (direto/herdado), fronteira e capacidades. Redistribuição negada ao recebedor. Revogar/baixar acesso impede novas leituras/salvamentos; grants de item na Lixeira ficam inativos e só se reativam mediante revisão explícita ao restaurar. |
| Link interno | URL autenticada sem grant. | Link aponta para ID estável, valida ACL a cada abertura; não contém token de acesso; item excluído mostra indisponibilidade. Link público não faz parte deste contrato. |
| Solicitação de arquivos | Placeholder desabilitado. | Contrato novo: solicitante, destino, destinatários, prazo opcional, estado, uploads autorizados, quota, cancelamento e auditoria. Não criar grant amplo na pasta por inferência; upload por capacidade específica de pedido, sem leitura dos demais filhos. O prazo de uma solicitação de arquivos é decisão própria do recurso, distinta do prazo de 30 dias da Lixeira; respeitar escopo e integridade. |

## 5. Compartilhado e navegação

**[D]** `/documentos` possui três perspectivas internas: **Meus arquivos**, **Com você**, **Por você**. Não adicionar Compartilhado à navegação global. **[R]** Lixeira usa rota própria `/documentos/lixeira` no grupo **Meu espaço**. Biblioteca do NITE continua visão administrativa da mesma árvore, sem serviço documental paralelo.

| Perspectiva | Fonte e metadados | Filtros/permissões |
|---|---|---|
| Meus arquivos | Descendentes da raiz pessoal do titular, inclusive itens de gestão disponibilizados ali; exibir criador, proprietário, origem institucional, proteção, última modificação, tamanho, localização e capacidades. | Busca/tipo/data/ordem/estado de compartilhamento; acesso pessoal não implica excluir item alheio/protegido. |
| Com você | Alvos originais de grants recebidos, diretos ou herdados, deduplicados na fronteira visível; `sharedBy`, `sharedAt`, permissão efetiva, origem `GRANT` e localização **somente autorizada**. Conteúdo institucional distribuído na pasta pessoal deve aparecer em Meus arquivos com origem `INSTITUTIONAL_DISTRIBUTION`, sem fingir que recebeu grant. | Busca/tipo/autor/data/permissão; `VIEW`/`EDIT` não trazem gestão. Se produto quiser também uma visão unificada de “disponibilizados”, adicionar filtro de origem claramente rotulado, sem alterar a semântica de grants. |
| Por você | Grants ativos concedidos sob autoridade do usuário, agrupados pelo alvo original e destinatários; distinguir `grantedBy` de proprietário. Administração que concedeu em nome da instituição aparece com origem administrativa, não como propriedade pessoal do gestor. | Busca/tipo/destinatário/permissão/data/escopo; somente quem mantém capacidade atual de gerir share pode alterar/revogar. Revogação de autoridade não deixa gestão residual ao concessor histórico. |

**[I]** Há `/me/shared-with-me` e grants diretos, mas não endpoint/listagem “Por você” nem metadado de proveniência suficiente para classificar todas as distribuições na interface. **[R]** Propor `GET /api/v1/me/shared-by-me` ou filtro equivalente no núcleo, com paginação keyset e autorização; complementar DTOs com `origin`, `protection`, `capabilities`, sem mudar IDs. A semântica “por você” deve ser testada para share herdado e ação de administrador em nome de outro.

## 6. Ciclo de vida: Lixeira, retenção e descarte

**[I-R] Estado relatado dos Blocos 05.6.2 e 05.6.3A:** V33 introduz `ACTIVE`/`TRASHED`, exclusão recuperável e restauração por item/batch, mantendo arquivamento separado; V34 acrescenta `PURGE_PENDING`/`PURGED`, operações, tombstones, worker, prévias e idempotência. No 05.6.3A, **não há política ativa e o worker está desativado por padrão**. Esses registros foram apresentados pelo Codex, não comprovados por execução independente nesta revisão.

**[D] Ciclo alvo:** `ACTIVE → TRASHED → (ACTIVE por restauração | PURGE_PENDING → PURGED)`. `ARCHIVED_INSTITUTIONALLY` continua independente; exclusão não cria revisão do conteúdo. Quando permitido, registrar ator, motivo, horário, batch e localização anterior. Em `TRASHED`, revogar sessões WOPI e negar leitura/edição normal; na restauração, não reativar grants revogados.

| Ação | Contrato funcional e estado esperado |
|---|---|
| Excluir | O responsável pessoal pode enviar seus recursos próprios elegíveis à Lixeira; coordenador/gestor geral podem fazê-lo nos materiais institucionais, oficiais e acadêmicos do NITE. Gestor de projeto solicita a exclusão de material institucional do projeto. Subárvore mista exige autorização integral. Manter semântica do arquivamento legado. |
| Consultar Lixeira | Visões pessoais e administrativas escopadas, com `createdBy`, `deletedBy`, `deletedAt`, tamanho, localização autorizada, `purgeAfter` e capacidades. A categoria não determina, isoladamente, expurgo proibido. |
| Restaurar | Preservar ID, versões e autoria; revalidar destino e colisões (`409`). Não restabelecer grants revogados nem reviver item já descartado. A gestão pode restaurar seus recursos do NITE; gestor de projeto pode solicitar conforme escopo. |
| Descarte permanente manual | **Permitido antes do 30º dia** para conteúdo pessoal próprio e para recursos do NITE sob autoridade de coordenador/gestor geral, quando `TRASHED`, sem hold ou referência impeditiva, após prévia e confirmação. Usar os endpoints de prévia/solicitação com `Idempotency-Key` existentes no 05.6.3A; não reaproveitar `DELETE` administrativo de arquivamento. |
| Esvaziar Lixeira | Prévia de elegíveis/bloqueados, confirmação, processamento assíncrono idempotente e progresso por item; não tratar um item bloqueado como autorização para apagar outro sem rastreabilidade. |
| Descarte automático | O candidato entra em processamento quando `trashedAt + 30 dias` é alcançado, se política interna vigente, worker operacionalmente habilitado e item ainda elegível. Mudança de política não reinicia relógio nem reabilita documentos sob hold. |
| Solicitação de gestor de projeto | Nova operação auditável com contexto e motivação, encaminhada à gestão geral/coordenação, com aprovação/rejeição por **uma** autoridade competente. Solicitação não confere permissão destrutiva ao solicitante. |

### Política de retenção do NITE Connect v1.0 — [D]

**Governança:** o acervo é administrado pelo NITE, independente de aprovação da UniJorge. Gestor geral e coordenador podem colocar em vigor a política interna, modificar sua configuração por nova versão e autorizar descarte institucional. **Não se exige dupla aprovação.** A vigência deve ser registrada pelo sistema com ator, data e versão, e não apenas inferida da existência da migration.

**Prazo único:** **30 dias** após `trashedAt` para *todas* as categorias elegíveis: pessoal, institucional operacional, institucional oficial e acadêmico **do NITE**. Não há categoria automaticamente submetida a 60 dias ou retenção indefinida por ser chamada de oficial/acadêmica. O prazo é uma janela de restauração padrão, não carência obrigatória para descarte manual autorizado.

**Descarte antecipado:** permitido ao proprietário do conteúdo pessoal elegível; e ao coordenador/gestor geral para recursos institucionais, oficiais e acadêmicos do NITE, com confirmação, registro e checagem de integridade. O gestor de projeto solicita descarte institucional no seu projeto. `UNKNOWN` e holds exigem classificação/liberação formal interna antes de descarte. Não se elimina obrigação específica legal/contratual ou conteúdo de terceiro que seja comprovadamente aplicável.

**Integrante inativo:** desativação corta acessos, não apaga automaticamente a árvore ativa; a Lixeira segue sua contagem e o sistema precisa respeitar propriedade e dependências técnicas durante a execução.

**Ativação operacional:** mesmo com a política funcional definida, o worker permanece desabilitado até aprovação interna registrada e homologação controlada de S3, versionamento, backup/restore e reconciliação; habilitação deve ser explícita, reversível e auditável. Descarte agendado nunca é executado por mera migração de banco.

**[R] Integridade PostgreSQL/S3:** persistir intenção/eventos em transação PostgreSQL, remover bytes depois por worker idempotente. Enumerar versões, derivados, modelos e referências antes de excluir objetos compartilhados; referências ativas devem ser desvinculadas ou resolvidas pelo procedimento autorizado, não ignoradas. Retentativas, tombstones, falhas, bloqueios, backup e reconciliação devem impedir tanto perda inadvertida quanto reintrodução de bytes já descartados. Não registrar conteúdo, tokens WOPI ou caminhos privados em logs.

## 7. Editor documental e formatos

**[I]** DOCX passa por `DocumentController` → sessão WOPI → `DocumentWopiService`/Collabora CODE. WOPI `CheckFileInfo`, `GetFile`, `PutFile` e locks usam token temporário com hash armazenado; a API revalida permissão e salva nova revisão apenas para bytes DOCX alterados. V31 associa lock a ator para revogação mais segura. Objetos S3 são privados; PostgreSQL guarda metadados e hash. PDF, PNG e JPEG são anexos aceitos para leitura/download; não há edição WOPI destes formatos no fluxo atual. Ícones de Excel/PowerPoint no frontend não comprovam suporte; formatos permanecem desabilitados. Tabela `document_pdfs` histórica não equivale a conversão/exportação PDF operacional.

**[R] Adequações:** editor deve escolher modo de visualização ou edição pela capacidade atual, manter `VIEW` sem `PutFile`, negar sessão nova em Lixeira/arquivo arquivado, revalidar em cada callback e no commit sob lock SQL, revogar sessões ao excluir/rebaixar grant, preservar tratamento de conflito WOPI `409` e identidade da revisão. Testar abrir → visualizar → editar → salvar → fechar → reabrir com DOCX que contenha tabelas, imagens e formatação, inclusive dois editores, revogação durante sessão, lock vencido e falha S3. Download deve recuperar bytes/hash da revisão atual; histórico de versões e restauração são contratos novos. **[P/T]** Homologar CODE com modelos reais e infraestrutura institucional antes de declarar fidelidade ou suporte oficial a PDF em visualização/exportação; PDF original pode ser baixado hoje, mas a experiência de preview/conversão requer evolução e prova separadas. Não substituir CODE por ONLYOFFICE.

## 8. Aderência, decisões e sequência de implementação

| Área | Base relatada e reutilizável | Próximo trabalho |
|---|---|---|
| Identidades e autorização | **05.6.1 / V32**: `DocumentCapabilityService`, propriedade, origem, proteção, capacidades | Reconciliar `PROTECTED` e limites do gestor de projeto com a autoridade definida nesta v1.1, preservando proteção a integrantes |
| Lixeira | **05.6.2 / V33**: exclusão recuperável, restauração, eventos e subárvore atômica | Alinhar operações institucionais e solicitudes de gestor de projeto; não confundir `trash` com `archive` |
| Purge | **05.6.3A / V34**: prévia, solicitação, worker idempotente, tombstones, flag desabilitada | **05.6.3B**: política interna 30 dias, manual antecipado, autoridades, solicitações de gestor, scheduler de elegibilidade, ativação controlada |
| Arquivos e frontend | Exploração pessoal/recebida, grants, Collabora | **05.7**: operações de arquivo, Compartilhado “Por você”, favoritos, ZIP, detalhes e interface da Lixeira; UI condicionada às capacidades |
| Editor e operação | DOCX/WOPI/Collabora CODE, PostgreSQL/S3 | **05.8**: homologação real, concorrência, formatos e backup/restore; não trocar o editor |

### Decisões arquiteturais aprovadas para a implementação

1. **Autonomia do NITE:** gestor geral e coordenador são autoridades internas para os recursos oficiais/acadêmicos do NITE. Não há aprovação obrigatória da UniJorge, nem dupla assinatura obrigatória.
2. **Retenção unificada:** 30 dias para todas as categorias elegíveis. Descarte manual autorizado pode ocorrer antes desse prazo; descarte automático só após ele.
3. **Escopo de gestores de projeto:** podem solicitar descarte de acervo institucional do próprio projeto e administrar apenas o que lhes for permitido; não se tornam administradores globais ou proprietários de arquivos pessoais de terceiros.
4. **Hold e integridade:** bloqueio por `UNKNOWN`, hold, referência ativa ou obrigação externa identificada é resolvido explicitamente; “oficial”/“acadêmico do NITE” por si só não proíbe descarte pela gestão.
5. **Semântica independente:** `TRASHED` e `ARCHIVED_INSTITUTIONALLY` permanecem distintos; purge usa intenções duráveis e descarte S3 fora da transação SQL.
6. **Collabora Online (CODE):** continua provedor oficial WOPI, sem migração para ONLYOFFICE.

### Plano e gates

| Bloco | Situação | Critério para prosseguir |
|---|---|---|
| **05.6.0** | **Atualizado nesta revisão** | Produto definido e diferenças com V32–V34 registradas |
| **05.6.1** | Implementado conforme relatório Codex | Regressões e política de capacidades ajustadas sem ampliação a integrantes |
| **05.6.2** | Implementado conforme relatório Codex | Exclusão/restauração preservadas; eventuais divergências de autoridade corrigidas no 05.6.3B |
| **05.6.3A** | Implementado conforme relatório Codex, worker off | Reaproveitar preflight, tombstones, idempotência e S3 de teste |
| **05.6.3B** | **Próximo bloco** | Versão e aprovação internas, 30 dias, descarte antecipado autorizado, solicitações de gestores, scheduler seguro, tests e ativação default off |
| **05.7** | Planejado | Meus Arquivos + Lixeira + operações e perspectivas consumindo capacidades reais |
| **05.8** | Planejado | E2E com CODE, PostgreSQL/S3 e perfis reais de homologação; procedimentos de recuperação |

**Gate de produção:** a política funcional definida **não é ativação operacional automática**. O sistema precisa registrar aprovação por uma autoridade interna, executar testes destrutivos exclusivamente em ambiente isolado e homologar S3/backup/restore antes de habilitar worker no ambiente real. Esta revisão é documental: não altera migrations nem aplica a política ao banco.
