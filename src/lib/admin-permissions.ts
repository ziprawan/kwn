export type AdminSource = "env" | "db";

export interface RevokeAdminParams {
  actorEmail: string;
  actorSource: AdminSource;
  targetEmail: string;
  targetAddedBy: string | null | undefined;
}

export function canRevokeDbAdmin({
  actorEmail,
  actorSource,
  targetEmail,
  targetAddedBy,
}: RevokeAdminParams): boolean {
  const normalizedActor = actorEmail.trim().toLowerCase();
  const normalizedTarget = targetEmail.trim().toLowerCase();

  if (!normalizedActor || normalizedActor === normalizedTarget) {
    return false;
  }

  if (actorSource === "env") {
    return true;
  }

  const normalizedAddedBy = targetAddedBy?.trim().toLowerCase() || "";
  return normalizedAddedBy.length > 0 && normalizedAddedBy === normalizedActor;
}
