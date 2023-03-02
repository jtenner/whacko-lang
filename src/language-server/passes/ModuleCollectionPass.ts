import { ImportDeclaration } from "../generated/ast";
import { WhackoProgram } from "../program";
import { WhackoPass } from "./WhackoPass";

export class ModuleCollectionPass extends WhackoPass {
  modulesToAdd: string[] = [];

  constructor(program: WhackoProgram) {
    super(program);
  }

  override visitImportDeclaration(node: ImportDeclaration): void {
    this.modulesToAdd.push(node.path);
  }
}
