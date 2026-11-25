/** Thrown by UI API clients when the server returns a non-OK response with a JSON body. */

export class HttpResponseError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(
    message: string,
    options: {
      code?: string;
      status: number;
    },
  ) {
    super(message);
    this.name = "HttpResponseError";
    this.code = options.code;
    this.status = options.status;
  }
}
