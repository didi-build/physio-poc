declare module "cloudflare:workers" {
  export type WorkflowEvent<T> = {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
  };

  export type WorkflowStep = {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  };

  export class WorkflowEntrypoint<Env = unknown, T = unknown> {
    protected readonly env: Env;
    protected readonly ctx: ExecutionContext;
    constructor(ctx: ExecutionContext, env: Env);
    run(event: WorkflowEvent<T>, step: WorkflowStep): Promise<unknown>;
  }
}
