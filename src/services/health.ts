export type HealthPayload = {
  ok: true;
  service: "physio-poc";
};

export function getHealth(): HealthPayload {
  return { ok: true, service: "physio-poc" };
}
