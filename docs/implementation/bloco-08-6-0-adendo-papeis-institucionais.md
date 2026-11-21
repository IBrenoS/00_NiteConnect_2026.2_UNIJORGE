# B08.6-0 — Adendo funcional: papéis institucionais e liderança

Decisão de 21/11/2026. Este adendo substitui somente a interpretação anterior de que gestor de projeto é exclusivamente contextual; os documentos históricos de Blocos 01 e 02 permanecem preservados.

## Modelo e autorização

- `INTEGRANTE` é o papel efetivo básico de todo membro `ATIVO`; não exige linha em `role_assignments`.
- `GESTOR_PROJETO`, `GESTOR_GERAL` e `COORDENADOR` são papéis institucionais persistidos em `role_assignments`. Uma pessoa pode ter mais de um papel.
- Apenas `GESTOR_GERAL` e `COORDENADOR` concedem administração global. `GESTOR_PROJETO` identifica elegibilidade institucional para liderança; não cria participação, liderança nem acesso a outro projeto.
- Para iniciar um período de liderança, o membro deve estar ativo, participar atualmente do projeto e possuir `GESTOR_PROJETO`, `GESTOR_GERAL` ou `COORDENADOR`. Somente administração global realiza a transferência explícita. `project_memberships` e `project_leadership_history` continuam como fontes de participação e liderança.
- Afastamento ou desligamento suspende a autoridade operacional sem apagar o período histórico. Revogação do último papel elegível exige encerrar ou transferir todas as lideranças vigentes primeiro. Revogação do último papel administrativo global de um membro ativo exige outro administrador global ativo.

## Pontos de autorização auditados

| Área | Regra mantida após B08.6-0 |
| --- | --- |
| Identidade, integrantes, convites, auditoria | `/me` expõe os papéis institucionais; administração de membros, convites e auditoria exige administração global. |
| Projetos, participação, propostas | Administração global vê/gerencia todos conforme capacidades anteriores. Gestor de projeto sem liderança vê apenas projetos em que participa; com liderança gerencia apenas o projeto do período vigente. Criar projeto, mudar situação e transferir liderança seguem globais. |
| Atividades e planejamento | Consultas globais e planejamento global seguem restritos à administração global; liderança vigente autoriza somente o projeto correspondente. |
| Documentos e Biblioteca institucional | Capacidade global exige administração global; solicitações e capacidades contextuais continuam vinculadas ao projeto. A revalidação SQL de expurgo foi restringida aos dois papéis globais. |
| Frequência, agenda, analytics, contratos e dados acadêmicos | Permissões administrativas globais continuam limitadas a gestor geral/coordenador; acesso pessoal e contextual permanece dependente de titularidade, participação ou liderança. A projeção do papel de quem abriu a lista prioriza o papel global quando há múltiplos. |
| Navegação web | Links institucionais seguem condicionados aos dois papéis globais; o rótulo da conta reconhece `GESTOR_PROJETO`. O backend continua sendo a autoridade. |

## Migration e reconciliação

`V47__institutional_project_manager_role.sql` amplia a restrição de `role_assignments`, inventaria líderes com período vigente sem qualquer papel elegível e concede `GESTOR_PROJETO` somente a esses membros. Preserva atribuições superiores e todas as linhas de participação e liderança. Cada concessão técnica registra `granted_by` como a autoridade que iniciou o período vigente mais antigo e motivo `Regularização técnica B08.6-0...`; cria também evento imutável `ROLE_GRANTED` com a mesma origem. A migration adiciona triggers de integridade para inserção de liderança e revogação do último papel elegível.

Inventário somente leitura da base PostgreSQL local antes da migration: **2 registros de liderança vigente com `GESTOR_GERAL`; 0 sem papel superior**. Esse retrato não representa outros ambientes. Para revisar qualquer ambiente antes de aplicar V47:

```sql
SELECT l.member_id, m.status,
       count(DISTINCT l.project_id) AS projetos_vigentes,
       array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL) AS papeis
FROM nite_connect.project_leadership_history l
JOIN nite_connect.members m ON m.id = l.member_id
LEFT JOIN nite_connect.role_assignments r ON r.member_id = l.member_id
WHERE l.ended_at IS NULL
GROUP BY l.member_id, m.status
ORDER BY l.member_id;
```

Após V47, conferir que todo líder vigente possui ao menos um papel elegível e que nenhuma linha de liderança ou participação foi reescrita. O fluxo de envio de convites e as novas interfaces de Integrantes ficam para a próxima etapa.
