# Relatórios institucionais — integração

V44 identifica vínculos, não o tipo de documento. Evolução aditiva: classificação explícita GENERAL/REPORT em documentos, GENERAL para todos os existentes; nenhuma inferência por nome, ACL ou modelo. Gestão classifica na Biblioteca, com evento documental. Classificação não cria ACL. Relatórios usa a consulta V44 com filtro reportsOnly e apresenta apenas documentos REPORT vinculados e pastas existentes que os contêm; exclui espaço pessoal.

1. Cobrir classificação, autorização, isolamento e navegação em PostgreSQL real.
2. V45 e filtro compatível na consulta V44; incluir capacidades efetivas e mimeType.
3. Rotas reais /relatorios e /relatorios/[memberId], busca e paginação, grid e ícones compartilhados com Meus arquivos; abertura e retorno pelo editor existente.
4. Ação explícita de classificação na Biblioteca, sem pastas/cópias automáticas.
5. Testes pertinentes de API, páginas e contratos, lint/typecheck/test/build do web e inspeção responsiva quando possível. Sem commit.
