import type { ReactNode } from "react";
import { ProjectAdministrationPreviewShell } from "../../../components/dev/project-administration-preview-shell";

export default function ProjectAdministrationPreviewLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ProjectAdministrationPreviewShell>{children}</ProjectAdministrationPreviewShell>;
}
