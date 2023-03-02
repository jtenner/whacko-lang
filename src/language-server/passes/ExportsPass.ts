import { AstNode } from "langium";
import {
  ClassDeclaration,
  DeclareDeclaration,
  ExportDeclaration,
  ExportDeclarator,
  FunctionDeclaration,
  ID,
  TypeDeclaration,
} from "../generated/ast";
import { DynamicTypeScopeElement, StaticTypeScopeElement } from "../types";
import { WhackoPass } from "./WhackoPass";

interface Declaration extends AstNode {
  export: boolean;
  name: ID;
  typeParameters?: ID[];
}

export class ExportsPass extends WhackoPass {
  override visitClassDeclaration(node: ClassDeclaration): void {
    this.defineExportableType(node);
  }

  override visitDeclareDeclaration(node: DeclareDeclaration): void {
    this.defineExportableType(node);
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    this.defineExportableType(node);
  }

  override visitTypeDeclaration(node: TypeDeclaration): void {
    this.defineExportableType(node);
  }

  override visitExportDeclarator(node: ExportDeclarator): void {
    const name = node.name.name;
    const alias = node.alias?.name ?? node.name.name;
    const scope = this.currentMod!.scope;
    const exports = this.currentMod!.exports;

    if (scope.has(name)) {
      // we can export it
      if (exports.has(alias)) {
        // we can't name it as an export, semantic error
        this.error(
          `Semantic`,
          node,
          `Cannot export ${name} as ${alias} because ${alias} is already exported.`
        );
      } else {
        const element = scope.get(name)!;
        exports.set(alias, element);
      }
    } else {
      this.error(
        `Semantic`,
        node.name,
        `Cannot export ${name} because it's not defined in scope.`
      );
    }
  }

  defineExportableType(node: Declaration) {
    const element = node.typeParameters?.length
      ? new DynamicTypeScopeElement(
          node,
          node.typeParameters.map((e) => e.name)
        )
      : new StaticTypeScopeElement(node);
    const scope = this.currentMod!.scope;
    const name = node.name.name;
    if (scope.has(name)) {
      this.error(`Semantic`, node.name, `Element ${name} already defined.`);
    } else {
      scope.add(name, element);
      if (node.export) {
        const exports = this.currentMod!.exports;
        if (exports.has(name)) {
          this.error(
            `Semantic`,
            node.name,
            `An element ${name} has already been exported.`
          );
        } else {
          exports.set(name, element);
        }
      }
    }
  }
}
