import type { AppDependencies } from "../app.js";
import {
  PUBLIC_SHARE_LINK_UNAVAILABLE_BODY,
  ProgramPublishService,
} from "../../services/programs/program-publish-service.js";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

const PUBLIC_SHARE_LINK_PATH = /^\/api\/public\/share-links\/([^/]+)$/;

export function isPublicShareLinkApiPath(pathname: string): boolean {
  return PUBLIC_SHARE_LINK_PATH.test(pathname);
}

export async function handlePublicShareLinkRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }
  const url = new URL(request.url);
  const match = PUBLIC_SHARE_LINK_PATH.exec(url.pathname);
  if (!match) {
    return null;
  }

  const token = decodeURIComponent(match[1]!);
  const publishService = new ProgramPublishService(deps.sql, deps.config.webAppBaseUrl);
  const view = await publishService.getPublicShareLinkByToken(token);
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: JSON_HEADERS });
  }
  if (view.availability === "unavailable") {
    return new Response(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY, {
      status: 200,
      headers: JSON_HEADERS,
    });
  }
  return Response.json(view, { headers: JSON_HEADERS });
}
