# NITE Connect — Instruções para agentes

## Trabalho
- Implemente somente o solicitado e evite refatorações ou dependências sem necessidade.

## Git
- Verifique a branch e o estado do repositório antes de editar. Se a `main` estiver limpa, trabalhe nela.
- Se houver alterações locais na `main`, pergunte se deve continuar o trabalho na main preservando as alterações existente ou criar uma branch.
## Testes
- Execute os testes afetados e as verificações pertinentes à mudança; adicione ou ajuste testes para comportamentos novos.
- Se uma suíte ampla apresentar falhas pontuais, após a correção reexecute apenas os testes falhos e os diretamente relacionados — não a suíte inteira por padrão.
- Amplie a regressão quando houver impacto em código compartilhado, integrações, contratos, segurança ou configuração, ou quando o alcance da mudança for incerto.
- Relate exatamente o que foi executado e aprovado. Não declare a suíte completa verde se não foi reexecutada no estado final.

## Segurança e integridade
- Valide autorização no backend conforme perfil, vínculo e contexto; autenticação não implica permissão de acesso.
- Para mudanças no banco, crie novas migrações Flyway e valide-as em PostgreSQL real. Preserve auditoria quando a alteração envolver ações administrativas previstas.

## Entrega
- Resuma as alterações, os testes executados e eventuais pendências. Atualize a documentação somente se a mudança exigir.
