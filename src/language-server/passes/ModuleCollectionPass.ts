import { AstNode } from "langium";
import { ImportDeclaration, Program } from "../generated/ast";
import { WhackoModule } from "../module";
import { WhackoProgram } from "../program";
import { WhackoPass } from "./WhackoPass";

const fileNames = new WeakMap<AstNode, string>();
const modules = new WeakMap<AstNode, WhackoModule>();

export function getFileName(node: AstNode) {
  return fileNames.get(node.$document!.parseResult.value);
}

export function getModule(node: AstNode) {
  return modules.get(node.$document!.parseResult.value);
}

export class ModuleCollectionPass extends WhackoPass {
  modulesToAdd: string[] = [];

  constructor(program: WhackoProgram) {
    super(program);
  }

  override visitProgram(node: Program): void {
    const path = this.currentMod!.path;
    modules.set(node, this.currentMod!);
    fileNames.set(node, this.currentMod!.path);
    super.visitProgram(node);
  }

  override visitImportDeclaration(node: ImportDeclaration): void {
    this.modulesToAdd.push(node.path);
  }
}
