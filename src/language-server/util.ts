import { AstNode } from "langium";

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

export function assert<T>(
  condition: T,
  message: string = "No message provided"
) {
  if (!condition) throw new Error(message);
  return condition;
}

export function logNode(node: AstNode) {
  console.log(cleanNode(node))
}

export function cleanNode(node: AstNode): any {
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, entry]) => key === "$type" || !key.startsWith("$"))
      .map(([key, obj]) => [key, (obj.constructor === Object ? cleanNode(obj) : obj) as any])
  );
}
