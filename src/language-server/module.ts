import { Program } from "./generated/ast";
import { WhackoPass } from "./passes/WhackoPass";
import { IDiagnostic } from "./util";

export class WhackoModule {
  constructor(
    public ast: Program,
  ) {}
  diagnostics: IDiagnostic[] = [];

  visit(pass: WhackoPass) {
    pass.visit(this.ast);
    this.diagnostics = this.diagnostics.concat(pass.diagnostics);
  }
}