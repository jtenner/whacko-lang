import { ImportDeclaration } from "../generated/ast";
import { WhackoProgram } from "../program";
import { WhackoVisitor } from "../WhackoVisitor";

export class ModuleCollectionPass extends WhackoVisitor {
  public modulesToAdd: string[] = [];

  constructor(public program: WhackoProgram) {
    super();
  }

  override visitImportDeclaration(node: ImportDeclaration): void {
    this.modulesToAdd.push(node.path.value);
  }
}
