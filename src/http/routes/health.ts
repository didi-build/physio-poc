import { getHealth } from "../../services/health.js";

export async function handleHealthRequest(): Promise<Response> {
  const payload = getHealth();
  return Response.json(payload, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
