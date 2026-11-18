export type {
  DiagnosticArea,
  DiagnosticData,
  DiagnosticEntry,
} from './lib/diagnostic-entry';
export { Diagnostics, REPEAT_EVERY, worthLogging } from './lib/diagnostics';
export {
  DiagnosticsExport,
  type ExportOutcome,
} from './lib/diagnostics-export';
export { diagnosticsInterceptor } from './lib/diagnostics-interceptor';
export { provideDiagnostics } from './lib/provide-diagnostics';
