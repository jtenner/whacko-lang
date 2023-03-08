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

export function assert<T>(condition: T, message: string = "No message provided") {
  if (!condition) throw new Error(message);
  return condition;
}
