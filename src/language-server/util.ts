export const enum DiagnosticLevel {
  None,
  Info,
  Warning,
  Error,
}

export interface IDiagnostic {
  level: DiagnosticLevel,
  message: string,
  line: number,
  col: number,
}
