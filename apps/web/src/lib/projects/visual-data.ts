import type { PreviewTask } from "../../components/activity-planning-preview/activity-planning-preview";

// Temporary adapter for 08.4A. Never merge these records with API responses.
// Public discovery and private workspace data deliberately have separate shapes.
export type ProjectStatus = "PLANEJAMENTO" | "ATIVO" | "PAUSADO" | "CONCLUIDO";
export type CatalogProject = {
  id: string; title: string; publicSummary: string; status: ProjectStatus;
  imageUrl: null; leaderName: string | null; leadershipVacant: boolean;
  teamSize: number; acceptingMembers: boolean; startsOn: string | null; endsOn: string | null;
};
export type ProjectPerson = { id: string; name: string; responsibility: string; leader: boolean };
export type VisualTask = PreviewTask & { collaboratorIds?: string[] };
export type VisualPlanning = { id: string; projectId: string; title: string; description: string; tasks: VisualTask[] };
export type VisualWorkspace = { projectId: string; description: string; objectives: string[]; people: ProjectPerson[]; plannings: VisualPlanning[] };
export type VisualRequest = { id: string; projectId: string; memberName: string; message: string; state: "PENDENTE" | "APROVADA" | "REJEITADA"; version: number; decisionMessage: string | null };
export const projectStatusLabels: Record<ProjectStatus, string> = { PLANEJAMENTO: "Em planejamento", ATIVO: "Em andamento", PAUSADO: "Pausado", CONCLUIDO: "Concluído" };

export const visualCatalog: CatalogProject[] = [
  { id: "exemplo-nite-connect", title: "NITE Connect", publicSummary: "Tecnologia que aproxima pessoas, projetos e conhecimento. Uma plataforma feita com o núcleo, para o núcleo.", status: "ATIVO", imageUrl: null, leaderName: "Marina Oliveira", leadershipVacant: false, teamSize: 4, acceptingMembers: true, startsOn: "2026-08-03", endsOn: "2026-12-18" },
  { id: "exemplo-observatorio", title: "Observatório de dados", publicSummary: "Transformar dados abertos em informação acessível para a comunidade acadêmica e a sociedade.", status: "ATIVO", imageUrl: null, leaderName: "Pedro Santos", leadershipVacant: false, teamSize: 3, acceptingMembers: true, startsOn: "2026-08-10", endsOn: null },
  { id: "exemplo-acessibilidade", title: "Acessibilidade digital", publicSummary: "Experiências digitais mais inclusivas. Pesquisa e desenvolvimento de soluções para ampliar o acesso à informação.", status: "ATIVO", imageUrl: null, leaderName: "Camila Rocha", leadershipVacant: false, teamSize: 3, acceptingMembers: true, startsOn: "2026-09-01", endsOn: "2026-12-15" },
  { id: "exemplo-laboratorio", title: "Laboratório de inovação", publicSummary: "Um espaço de experimentação para conectar desafios reais a novas possibilidades de tecnologia.", status: "PAUSADO", imageUrl: null, leaderName: "Rafael Lima", leadershipVacant: false, teamSize: 2, acceptingMembers: false, startsOn: "2026-03-02", endsOn: null },
  { id: "exemplo-memoria", title: "Memória do núcleo", publicSummary: "Preservação e organização da trajetória do NITE, seus projetos e suas contribuições para a comunidade.", status: "ATIVO", imageUrl: null, leaderName: null, leadershipVacant: true, teamSize: 0, acceptingMembers: false, startsOn: null, endsOn: null },
  { id: "exemplo-conexao", title: "Conexão comunidade", publicSummary: "Oficinas de letramento digital que aproximaram estudantes e comunidade por meio da extensão universitária.", status: "CONCLUIDO", imageUrl: null, leaderName: "Ana Costa", leadershipVacant: false, teamSize: 5, acceptingMembers: false, startsOn: "2026-02-02", endsOn: "2026-07-24" },
];
export const visualParticipationIds = ["exemplo-nite-connect", "exemplo-observatorio"];
export function participationAction(project: CatalogProject): "request" | "interest" | null {
  if (project.status === "CONCLUIDO") return null;
  if (project.status === "PAUSADO" || project.leadershipVacant) return "interest";
  return project.acceptingMembers ? "request" : null;
}
export function selectProjects(projects: readonly CatalogProject[], query: string, status: string, availability: string) {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return projects.filter(p => (!normalized || `${p.title} ${p.publicSummary} ${p.leaderName ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized)) && (status === "all" || p.status === status) && (availability === "all" || (availability === "open" ? participationAction(p) === "request" : participationAction(p) === "interest")));
}
export function createVisualWorkspace(project: CatalogProject): VisualWorkspace {
  const people: ProjectPerson[] = project.teamSize === 0 ? [] : [
    { id: `${project.id}-lead`, name: project.leaderName ?? "Liderança não definida", responsibility: "Gestão do projeto", leader: true },
    { id: `${project.id}-ana`, name: "Ana Costa", responsibility: "Pesquisa e experiência", leader: false },
    { id: `${project.id}-lucas`, name: "Lucas Almeida", responsibility: "Desenvolvimento", leader: false },
    ...(project.teamSize >= 4 ? [{ id: `${project.id}-julia`, name: "Júlia Reis", responsibility: "Documentação", leader: false }] : []),
    ...(project.teamSize >= 5 ? [{ id: `${project.id}-bruno`, name: "Bruno Martins", responsibility: "Extensão", leader: false }] : []),
  ].slice(0, project.teamSize);
  const tasks: PreviewTask[] = people.length ? [
    { id: `${project.id}-task-1`, title: "Mapear necessidades da comunidade", description: "Consolidar as necessidades identificadas na pesquisa inicial.", status: "Concluída", priority: "Alta", ownerId: people[0].id, owner: people[0].name, start: "2026-11-02", due: "2026-11-13" },
    { id: `${project.id}-task-2`, title: "Validar a proposta com a equipe", description: "Revisar o escopo e registrar os pontos de atenção.", status: "Em andamento", priority: "Alta", ownerId: people[1]?.id ?? people[0].id, owner: people[1]?.name ?? people[0].name, start: "2026-11-16", due: "2026-11-23" },
    { id: `${project.id}-task-3`, title: "Organizar os próximos passos", description: "Preparar o planejamento do próximo ciclo de trabalho.", status: "Planejada", priority: "Média", ownerId: people[0].id, owner: people[0].name, start: "Sem data", due: "2026-11-27" },
  ] : [];
  return { projectId: project.id, description: project.publicSummary, objectives: ["Compreender as necessidades das pessoas envolvidas.", "Desenvolver e validar soluções em colaboração.", "Compartilhar os aprendizados com a comunidade."], people, plannings: [
    { id: `${project.id}-planning-1`, projectId: project.id, title: "Pesquisa e descoberta", description: "Do entendimento do problema à validação da proposta.", tasks },
    { id: `${project.id}-planning-2`, projectId: project.id, title: "Próximo ciclo", description: "Preparação das próximas entregas do projeto.", tasks: [] },
  ] };
}
export const visualRequests: VisualRequest[] = [
  { id: "exemplo-request-1", projectId: "exemplo-nite-connect", memberName: "Beatriz Souza", message: "Gostaria de contribuir com a pesquisa e com os testes de acessibilidade da plataforma.", state: "PENDENTE", version: 0, decisionMessage: null },
  { id: "exemplo-request-2", projectId: "exemplo-nite-connect", memberName: "Gabriel Lima", message: "Tenho interesse em colaborar com o desenvolvimento frontend e aprender com a equipe.", state: "PENDENTE", version: 0, decisionMessage: null },
];

