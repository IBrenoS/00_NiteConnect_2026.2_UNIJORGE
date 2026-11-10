"use client";

import { useState, type ChangeEvent } from "react";
import { importPersonalDocx } from "../../lib/documents/actions";
import { documentTitleFromFilename } from "../../lib/documents/title";

export function DocumentImportForm() {
  const [title, setTitle] = useState("");
  const [hasCustomTitle, setHasCustomTitle] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!hasCustomTitle) setTitle(file ? documentTitleFromFilename(file.name) : "");
  }

  return (
    <form action={importPersonalDocx} className="grid gap-4 rounded-control border border-nite-border-soft p-5">
      <label className="grid gap-2 text-type-body-compact text-nite-text-primary">
        Nome do documento
        <input
          name="title"
          value={title}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setHasCustomTitle(true);
          }}
          maxLength={190}
          placeholder="Preenchido pelo arquivo DOCX"
          aria-describedby="document-title-help"
          className="min-h-11 rounded-control border border-nite-border-control bg-nite-surface px-3"
        />
      </label>
      <p id="document-title-help" className="-mt-2 text-type-body-compact text-nite-text-secondary">
        O nome do arquivo será usado como título; você pode editá-lo antes de importar.
      </p>
      <label className="grid gap-2 text-type-body-compact text-nite-text-primary">
        Arquivo DOCX (até 8 MiB)
        <input
          name="file"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
          onChange={handleFileChange}
          className="min-h-11"
        />
      </label>
      <div>
        <button type="submit" className="min-h-11 rounded-control bg-nite-brand-primary px-4 font-medium text-white">
          Importar DOCX
        </button>
      </div>
    </form>
  );
}

