import { AstNode } from "langium";
import { Program } from "./generated/ast";
import { Scope, ScopeElement } from "./types";
import { DiagnosticLevel, IDiagnostic } from "./util";

export class WhackoModule {
  exports = new Map<string, ScopeElement>();
  scopes = new Map<AstNode, Scope>();
  constructor(
    public ast: Program,
    public path: string,
    public entry: boolean = false,
    public scope: Scope,
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

  getScope(node: AstNode): Scope | null {
    while (true) {
      const scope = this.scopes.get(node);
      if (scope) return scope;

      // we need to go up the tree
      if (node.$container) {
        node = node.$container;
        continue;
      }
      return null;
    }
  }
}
