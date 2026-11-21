export const WORKER_FAKE_DEEPINFRA_PROVIDER_LOG_EVENT =
  "physio_worker_fake_deepinfra_provider";

export const WORKER_FAKE_DEEPINFRA_PROVIDER_MISSING_SECRET_NAME =
  "PHYSIO_DEEPINFRA_API_KEY";

let workerFakeDeepinfraProviderLogged = false;

export function logWorkerFakeDeepinfraProviderOnce(): void {
  if (!workerFakeDeepinfraProviderLogged) {
    console.log(
      JSON.stringify({
        event: WORKER_FAKE_DEEPINFRA_PROVIDER_LOG_EVENT,
        missing_secret_name: WORKER_FAKE_DEEPINFRA_PROVIDER_MISSING_SECRET_NAME,
      }),
    );
    workerFakeDeepinfraProviderLogged = true;
  }
}

export function resetWorkerFakeDeepinfraProviderLogForTests(): void {
  workerFakeDeepinfraProviderLogged = false;
}
