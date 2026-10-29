import { handleRequest, type AppDependencies } from "../http/app.js";

/**
 * Cloudflare Workers entry. Bindings (D1, R2) are injected in a later ticket via deps factory.
 */
export default {
  fetch(request: Request): Promise<Response> {
    const deps: AppDependencies = {
      sql: {
        async run() {
          throw new Error("SqlStoragePort binding not configured");
        },
        async all() {
          throw new Error("SqlStoragePort binding not configured");
        },
        async first() {
          throw new Error("SqlStoragePort binding not configured");
        },
      },
      objects: {
        async put() {
          throw new Error("ObjectStoragePort binding not configured");
        },
        async get() {
          throw new Error("ObjectStoragePort binding not configured");
        },
        async head() {
          throw new Error("ObjectStoragePort binding not configured");
        },
        async delete() {
          throw new Error("ObjectStoragePort binding not configured");
        },
      },
    };
    return handleRequest(request, deps);
  },
};
