export type MemberProfile = {
  id: string;
  name: string;
  institutionalEmail: string;
  course: string | null;
  practiceArea: string | null;
  birthDate: string | null;
  hasPhoto: boolean;
  version: number;
};

export function parseMemberProfile(value: unknown): MemberProfile | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || typeof data.name !== "string" || typeof data.institutionalEmail !== "string"
    || !(data.course === null || typeof data.course === "string")
    || !(data.practiceArea === null || typeof data.practiceArea === "string")
    || !(data.birthDate === null || typeof data.birthDate === "string")
    || typeof data.hasPhoto !== "boolean" || typeof data.version !== "number") return null;
  return {
    id: data.id, name: data.name, institutionalEmail: data.institutionalEmail,
    course: data.course, practiceArea: data.practiceArea, birthDate: data.birthDate,
    hasPhoto: data.hasPhoto, version: data.version,
  };
}
