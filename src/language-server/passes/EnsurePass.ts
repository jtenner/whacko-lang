import { WhackoVisitor } from "../WhackoVisitor";
import { reportErrorDiagnostic } from "../diagnostic";
import { ExternDeclaration } from "../generated/ast";
import { WhackoModule, WhackoProgram, buildExternFunction } from "../program";
import { getCallableType } from "../types";
import { hasDecorator, logNode } from "../util";

export class EnsurePass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }
  mod!: WhackoModule;

  visitModule(mod: WhackoModule) {
    this.mod = mod;
    this.visit(mod.ast);
  }

  override visitExternDeclaration(node: ExternDeclaration): void {
    if (hasDecorator(node, "ensure")) {
      const funcType = getCallableType(this.program, this.mod, node, null, []);
      if (funcType) {
        buildExternFunction(this.program, this.mod, funcType, node);
      } else {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          node.name,
          `Cannot ensure extern is compiled because it's type could not be resolved.`,
        );
      }
      super.visitExternDeclaration(node);
    }
  }
}
