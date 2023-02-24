import { ImportDeclaration } from "../generated/ast";
import { WhackoPass } from "./WhackoPass";

export class ModuleCollectionPass extends WhackoPass {
  modulesToAdd: string[] = [];

  constructor() {
    super();
  }

  override visitImportDeclaration(node: ImportDeclaration): void {
    this.modulesToAdd.push(node.path);
  }
}
