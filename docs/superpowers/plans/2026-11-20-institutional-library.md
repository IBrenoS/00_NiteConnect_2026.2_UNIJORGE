# Biblioteca institucional — plano de implementação

**Objetivo:** completar as lacunas do pedido de Biblioteca no backend existente, sem frontend, commits ou alterações em credenciais.

**Arquitetura:** a Biblioteca é uma perspectiva da raiz `MATERIAIS` já existente. Propriedade continua separada de localização e autoria; `INSTITUTION` não tem proprietário individual. ACLs `VIEW`/`EDIT`, herança, WOPI, versões, S3, lotes de Lixeira e expurgo continuam usando os serviços atuais. Relatórios consulta recursos institucionais/de projeto vinculados por ACL efetiva ou `created_for`, nunca recursos de propriedade `MEMBER`. Consulta administrativa; não cria permissões.

**Alternativas:** novo armazenamento/acervo duplicaria identidade e ACL; nova raiz deixaria os materiais existentes fora da Biblioteca. Reutilizar `MATERIAIS` preserva IDs e integrações. A escolha segue o requisito explícito de reutilização.

**Restrições:** main autorizada pelo usuário; preservar alterações locais; migrations append-only; PostgreSQL real; manter controles operacionais do expurgo e política de 30 dias; nenhuma dependência nova.

1. Escrever regressões HTTP para entrada institucional, mensagem, perfis, origem e consulta por integrante; executar antes da implementação.
2. Adicionar V44: mensagem de ACL e snapshot de origem na exclusão (inclusive projeto); manter histórico das migrations.
3. Expor entrada institucional reutilizando listagem e mutações; enriquecer compartilhamento de modo aditivo, inclusive troca de permissão.
4. Implementar consulta paginada para Relatórios com Nome, Modificado, Modificado por, Tamanho, Compartilhamento; usar vínculos existentes, sem nova tabela de arquivos.
5. Validar PostgreSQL, WOPI/ACL, isolamento, árvore restaurada, retenção e expurgo; revisar diff e documentar contratos e dependências.

**Foco de revisão:** permissões EDIT não autorizam renomear/excluir; Relatórios não revela arquivos pessoais; compartilhamento não duplica objetos; revogação remove acesso herdado; restauração é atômica por lote; origem histórica resiste a renomeações posteriores.
