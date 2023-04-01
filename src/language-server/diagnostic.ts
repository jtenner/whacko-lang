import { AstNode } from "langium";
import Module from "node:module";
import { WhackoModule, WhackoProgram } from "./program";

export const enum DiagnosticLevel {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
}

export interface Diagnostic {
  level: DiagnosticLevel;
  type: string;
  node: AstNode | null;
  message: string;
  module: WhackoModule | null;
}

const createDiagnosticReport =
  (level: DiagnosticLevel) =>
  (
    program: WhackoProgram,
    type: string,
    node: AstNode | null,
    module: WhackoModule | null,
    message: string,
  ) => {
    program.diagnostics.push({ level, type, node, module, message });
  };

export const reportInfoDiagnostic = createDiagnosticReport(
  DiagnosticLevel.INFO,
);

export const reportWarningDiagnostic = createDiagnosticReport(
  DiagnosticLevel.WARNING,
);

export const reportErrorDiagnostic = createDiagnosticReport(
  DiagnosticLevel.ERROR,
);

