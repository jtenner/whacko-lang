import { AstNode } from "langium";
import path from "node:path";
import { ImportDeclaration, Program } from "../generated/ast";
import { WhackoModule } from "../module";
import { WhackoProgram } from "../program";
import { WhackoPass } from "./WhackoPass";

const fileNames = new WeakMap<AstNode, string>();
const modules = new WeakMap<AstNode, WhackoModule>();

export function getRelativeFileName(node: AstNode) {
  return path.relative(process.cwd(), getFileName(node)!);
}

export function getFileName(node: AstNode) {
  while (node.$container) node = node.$container;
  const fileName = fileNames.get(node);
  return fileName;
}

export function getModule(node: AstNode) {
  while (node.$container) node = node.$container;
  return modules.get(node);
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
