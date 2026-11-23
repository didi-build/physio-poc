declare module "cloudflare:workers" {
  export type WorkflowEvent<T> = {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
  };

  export type WorkflowStepRetryConfig = {
    limit: number;
    delay?: string;
    backoff?: string;
  };

  export type WorkflowStepConfig = {
    retries?: WorkflowStepRetryConfig;
  };

  export type WorkflowStep = {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(
      name: string,
      config: WorkflowStepConfig,
      callback: () => Promise<T>,
    ): Promise<T>;
  };

  export class NonRetryableError extends Error {
    readonly name = "NonRetryableError";
  }

  export class WorkflowEntrypoint<Env = unknown, T = unknown> {
    protected readonly env: Env;
    protected readonly ctx: ExecutionContext;
    constructor(ctx: ExecutionContext, env: Env);
    run(event: WorkflowEvent<T>, step: WorkflowStep): Promise<unknown>;
  }
}
