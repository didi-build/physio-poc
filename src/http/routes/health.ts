import { getHealth, type HealthDependencies } from "../../services/health.js";

export async function handleHealthRequest(deps: HealthDependencies): Promise<Response> {
  const payload = await getHealth(deps);
  return Response.json(payload, { status: 200 });
}
