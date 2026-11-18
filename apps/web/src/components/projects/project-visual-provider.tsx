"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createVisualWorkspace, visualCatalog, visualRequests, type VisualRequest, type VisualWorkspace } from "../../lib/projects/visual-data";

type LocalParticipation = { kind: "request" | "interest"; message: string; state: "PENDENTE" };
type VisualState = {
  canAdminister: boolean; workspaces: VisualWorkspace[]; requests: VisualRequest[];
  participation: Record<string, LocalParticipation>; favorites: string[];
  setWorkspaces: React.Dispatch<React.SetStateAction<VisualWorkspace[]>>;
  setRequests: React.Dispatch<React.SetStateAction<VisualRequest[]>>;
  setParticipation: React.Dispatch<React.SetStateAction<Record<string, LocalParticipation>>>;
  setFavorites: React.Dispatch<React.SetStateAction<string[]>>;
};
const ProjectVisualContext = createContext<VisualState | null>(null);
export function ProjectVisualProvider({ children, canAdminister }: { children: ReactNode; canAdminister: boolean }) {
  const [workspaces, setWorkspaces] = useState(() => visualCatalog.map(createVisualWorkspace));
  const [requests, setRequests] = useState(visualRequests);
  const [participation, setParticipation] = useState<Record<string, LocalParticipation>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  return <ProjectVisualContext.Provider value={{ canAdminister, workspaces, requests, participation, favorites, setWorkspaces, setRequests, setParticipation, setFavorites }}>{children}</ProjectVisualContext.Provider>;
}
export function useProjectVisual() {
  const context = useContext(ProjectVisualContext);
  if (!context) throw new Error("ProjectVisualProvider é obrigatório.");
  return context;
}
