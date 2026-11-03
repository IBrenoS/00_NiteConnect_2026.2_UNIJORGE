import { notFound } from "next/navigation";
import { GraphAuthorizationPreview } from "../../../components/meetings/graph-authorization-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prévia sintética de erro Graph 403" };

export default function GraphAuthorizationPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GraphAuthorizationPreview />;
}
