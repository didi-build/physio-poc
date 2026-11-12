import type { AppDependencies } from "../app.js";
import { safeDecodePathSegment } from "../safe-decode-path-segment.js";
import {
  PUBLIC_SHARE_LINK_UNAVAILABLE_BODY,
  ProgramPublishService,
} from "../../services/programs/program-publish-service.js";
import {
  servePublicShareLinkMediaBytes,
  publicShareLinkMediaNotFoundResponse,
} from "../../services/programs/public-share-link-media.js";
import type { PublicShareLinkMediaPhase } from "../../programs-api-paths.js";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

const PUBLIC_SHARE_LINK_JSON_PATH = /^\/api\/public\/share-links\/([^/]+)$/;
const PUBLIC_SHARE_LINK_MEDIA_PATH =
  /^\/api\/public\/share-links\/([^/]+)\/media\/([^/]+)\/(start|end)$/;

export function isPublicShareLinkApiPath(pathname: string): boolean {
  return (
    PUBLIC_SHARE_LINK_JSON_PATH.test(pathname) ||
    PUBLIC_SHARE_LINK_MEDIA_PATH.test(pathname)
  );
}

export async function handlePublicShareLinkRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }
  const url = new URL(request.url);
  const mediaMatch = PUBLIC_SHARE_LINK_MEDIA_PATH.exec(url.pathname);
  if (mediaMatch) {
    if (request.method === "HEAD") {
      return publicShareLinkMediaNotFoundResponse();
    }
    const tokenRaw = mediaMatch[1]!;
    const token = safeDecodePathSegment(tokenRaw);
    if (token === null) {
      return publicShareLinkMediaNotFoundResponse();
    }
    const exerciseVersionIdRaw = mediaMatch[2]!;
    const exerciseVersionId = safeDecodePathSegment(exerciseVersionIdRaw);
    if (exerciseVersionId === null) {
      return publicShareLinkMediaNotFoundResponse();
    }
    const phase = mediaMatch[3] as PublicShareLinkMediaPhase;
    return servePublicShareLinkMediaBytes(
      deps.sql,
      deps.objects,
      token,
      exerciseVersionId,
      phase,
    );
  }

  const match = PUBLIC_SHARE_LINK_JSON_PATH.exec(url.pathname);
  if (!match) {
    return null;
  }

  const tokenRaw = match[1]!;
  const token = safeDecodePathSegment(tokenRaw);
  if (token === null) {
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: JSON_HEADERS });
    }
    return new Response(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY, {
      status: 200,
      headers: JSON_HEADERS,
    });
  }
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
