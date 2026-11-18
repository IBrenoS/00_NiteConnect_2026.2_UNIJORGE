"use client";
import Link from "next/link";
import { Button } from "../../../components/ui/button";
export default function ProjectError({ reset }: { reset: () => void }) {
  return <section role="alert" className="grid justify-items-start gap-4 p-8 text-nite-text-primary"><h2 className="font-display text-type-section-title">Não foi possível abrir os projetos</h2><p className="text-type-body-compact text-nite-text-secondary">Tente carregar a tela novamente.</p><Button onClick={reset}>Tentar novamente</Button><Link href="/meus-projetos" className="text-type-body-compact underline">Voltar para Meus projetos</Link></section>;
}
