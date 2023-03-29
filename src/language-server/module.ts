import { AstNode } from "langium";
import { Program } from "./generated/ast";
import { WhackoProgram } from "./program";
import { Scope, ScopeElement } from "./types";
import { DiagnosticLevel, IDiagnostic } from "./util";

export class WhackoModule {
  exports = new Map<string, ScopeElement>();
  constructor(
    public ast: Program,
    public path: string,
    public entry: boolean = false,
    public scope: Scope
  ) {}
  diagnostics: IDiagnostic[] = [];

  error(type: string, node: AstNode, message: string) {
    const range = node.$cstNode!.range.start;
    this.diagnostics.push({
      col: range.character,
      level: DiagnosticLevel.Error,
      line: range.character,
      message: `[${type}] ${message}`,
    });
  }

  info(type: string, node: AstNode, message: string) {
    const range = node.$cstNode!.range.start;
    this.diagnostics.push({
      col: range.character,
      level: DiagnosticLevel.Info,
      line: range.character,
      message: `[${type}] ${message}`,
    });
  }

  warning(type: string, node: AstNode, message: string) {
    const range = node.$cstNode!.range.start;
    this.diagnostics.push({
      col: range.character,
      level: DiagnosticLevel.Warning,
      line: range.character,
      message: `[${type}] ${message}`,
    });
  }
}
