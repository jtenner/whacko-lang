import { AstNode } from "langium";
import { WhackoModule } from "../module";
import { WhackoProgram } from "../program";
import { DiagnosticLevel } from "../util";
import { WhackoVisitor } from "../WhackoVisitor";

export class WhackoPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }

  visitModule(mod: WhackoModule) {
    this.currentMod = mod;
    this.visit(mod.ast);
  }

  currentMod: WhackoModule | null = null;

  error(type: string, node: AstNode, message: string) {
    const range = node.$cstNode!.range.start;
    this.currentMod!.diagnostics.push({
      col: range.character,
      level: DiagnosticLevel.Error,
      line: range.line,
      message: `[${type}]: ${message}`,
    });
  }
}
