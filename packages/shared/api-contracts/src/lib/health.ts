/** Response of `GET /api/health`. It answers 503 when the database is unavailable. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  /** The SQLite database answers queries. */
  db: 'ok';
  /** ISO-8601 timestamp of when the response was produced. */
  timestamp: string;
}
