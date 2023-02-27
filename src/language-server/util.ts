export const enum DiagnosticLevel {
  Info,
  Warning,
  Error,
}

export interface IDiagnostic {
  level: DiagnosticLevel;
  message: string;
  line: number;
  col: number;
}
