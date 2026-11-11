/** Response of `GET /api/health`. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  /** ISO-8601 timestamp of when the response was produced. */
  timestamp: string;
}
