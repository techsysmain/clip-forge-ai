/** Error with a user-safe message. `recoverable` failures are retried by the queue. */
export class PipelineError extends Error {
  constructor(
    message: string,
    public recoverable = false,
  ) {
    super(message);
  }
}
