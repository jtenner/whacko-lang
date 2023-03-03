import assert from "assert";
import { AstNode } from "langium";
import {
  ClassDeclaration,
  DeclareDeclaration,
  ExportDeclarator,
  FunctionDeclaration,
  ID,
  NamespaceDeclaration,
  Program,
  TypeDeclaration,
} from "../generated/ast";
import {
  DynamicTypeScopeElement,
  NamespaceTypeScopeElement,
  ScopeTypeElement,
  ScopeElement,
  StaticTypeScopeElement,
  Scope,
} from "../types";
import { WhackoPass } from "./WhackoPass";

interface Declaration extends AstNode {
  export: boolean;
  name: ID;
  typeParameters?: ID[];
}

interface Exportable {
  exports: Map<string, ScopeElement>;
  scope: Scope;
}

export class ExportsPass extends WhackoPass {
  stack: Exportable[] = [];
  override visitProgram(node: Program): void {
    this.stack.push(this.currentMod!);
    super.visitProgram(node);
    this.stack.pop();
    assert(this.stack.length === 0, "Stack must be zero by this point.");
  }

  override visitClassDeclaration(node: ClassDeclaration): void {
    this.defineExportableType(node);
  }

  // declare "module" "method" (...params): returnType;
  override visitDeclareDeclaration(node: DeclareDeclaration): void {
    this.defineExportableType(node);
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    this.defineExportableType(node);
  }

  // type A<b> = Map<string, b>;
  override visitTypeDeclaration(node: TypeDeclaration): void {
    this.defineExportableType(node);
  }

  override visitNamespaceDeclaration(node: NamespaceDeclaration): void {
    const element = this.defineExportableType(node);

    this.stack.push(element as NamespaceTypeScopeElement);
    super.visitNamespaceDeclaration(node);
    this.stack.pop();
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
    let element: ScopeTypeElement;
    const scope = this.stack.at(-1)!.scope;

    if (node.$type === "NamespaceDeclaration") {
      element = new NamespaceTypeScopeElement(node, scope);
      const newScope = (element as NamespaceTypeScopeElement).scope;
      this.currentMod!.scopes.set(node, newScope);
    } else {
      element = node.typeParameters?.length
        ? new DynamicTypeScopeElement(
            node,
            node.typeParameters.map((e) => e.name)
          )
        : new StaticTypeScopeElement(node);
    }

    const name = node.name.name;
    if (scope.has(name)) {
      this.error(
        `Semantic`,
        node.name,
        `Element ${name} already defined in this scope.`
      );
    } else {
      scope.add(name, element);
      if (node.export) {
        const exports = this.stack.at(-1)!.exports;
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
    return element;
  }
}
