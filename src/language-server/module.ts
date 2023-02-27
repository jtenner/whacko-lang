import { Program } from "./generated/ast";
import { WhackoPass } from "./passes/WhackoPass";
import { IDiagnostic } from "./util";

export class WhackoModule {
  constructor(public ast: Program) {}
  diagnostics: IDiagnostic[] = [];

  visit(pass: WhackoPass) {
    pass.visit(this.ast);

    for (const diagnostic of pass.diagnostics) {
      this.diagnostics.push(diagnostic);
    }
  }
}
