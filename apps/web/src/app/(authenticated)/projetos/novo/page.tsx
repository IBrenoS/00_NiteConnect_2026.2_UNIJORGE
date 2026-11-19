import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getProjectAuthority } from "../../../../lib/projects/data";
import { ProjectDetailsForm } from "../../../../components/projects/project-administration";
import { ProjectIssue } from "../../../../components/projects/project-ui";
import styles from "../../../../components/projects/projects.module.css";
export const metadata = { title: "Novo projeto" };
export default async function NewProjectPage() {
 const session = await requireAuthenticatedNiteSession();
 const authority = await getProjectAuthority(session.bearer);
 if (authority.issue) return <ProjectIssue issue={authority.issue}/>;
 if (!authority.data.canCreate) return <ProjectIssue issue="access"/>;
 return <div className={styles.page}><header className={styles.pageHeader}><h1>Novo projeto</h1><Link className={styles.button} href="/projetos">Voltar ao catálogo</Link></header><section className={styles.adminCreate}><ProjectDetailsForm/></section></div>;
}
