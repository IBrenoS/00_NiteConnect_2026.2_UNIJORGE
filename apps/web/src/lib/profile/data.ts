import "server-only";

import { getApiJson } from "../api/server";
import { parseMemberProfile } from "./contracts";

export const getOwnProfile = (bearer: string) => getApiJson("/api/v1/me/profile", bearer, parseMemberProfile);
