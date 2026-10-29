import { handleRequest } from "../../http/handle-request.js";
import { resolveWebAppBaseUrl, type PhysioServerConfig } from "../../http/config.js";

export type PhysioMcpWorkerEnv = {
  WEB_APP_BASE_URL?: string;
};

function configFromEnv(env: PhysioMcpWorkerEnv): PhysioServerConfig {
  return {
    webAppBaseUrl: resolveWebAppBaseUrl(env.WEB_APP_BASE_URL),
  };
}

export default {
  fetch(request: Request, env: PhysioMcpWorkerEnv): Promise<Response> {
    return handleRequest(request, configFromEnv(env));
  },
};
