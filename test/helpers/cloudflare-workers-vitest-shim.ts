export type WorkflowEvent<T> = {
  payload: Readonly<T>;
  timestamp: Date;
  instanceId: string;
};

export type WorkflowStep = {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

export class NonRetryableError extends Error {
  override readonly name = "NonRetryableError";
}

export class WorkflowEntrypoint<Env = unknown> {
  protected readonly env: Env;
  protected readonly ctx: { waitUntil(): void };
  constructor(ctx: { waitUntil(): void }, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  run(): Promise<unknown> {
    return Promise.resolve();
  }
}
