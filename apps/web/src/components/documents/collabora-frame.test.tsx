import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollaboraFrame } from "./collabora-frame";

describe("CollaboraFrame imersivo", () => {
  it("mantém o POST WOPI no iframe e ocupa o viewport sem moldura externa", () => {
    const html = renderToStaticMarkup(
      <CollaboraFrame actionUrl="https://collabora.example/browser/action" token="wopi-capability-token" ttl={1234} title="Ata.docx" />,
    );

    expect(html).toContain('method="POST"');
    expect(html).toContain('target="nite-collabora-editor"');
    expect(html).toContain('name="access_token" value="wopi-capability-token"');
    expect(html).toContain('name="access_token_ttl" value="1234"');
    expect(html).toContain('title="Editar Ata.docx"');
    expect(html).toContain('class="block h-full w-full border-0"');
    expect(html).not.toContain("75vh");
    expect(html).not.toContain("min-h-[520px]");
    expect(html).not.toContain("rounded-control border");
  });
});
