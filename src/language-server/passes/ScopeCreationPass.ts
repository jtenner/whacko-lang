import { assert } from "console";
import {
  AsyncBlockLiteral,
  BlockStatement,
  ClassDeclaration,
  FunctionDeclaration,
  FunctionLiteral,
  GetterClassMember,
  MethodClassMember,
  Program,
  SetterClassMember,
} from "../generated/ast";
import { NamespaceTypeScopeElement, Scope } from "../types";
import { WhackoPass } from "./WhackoPass";

export class ScopeCreationPass extends WhackoPass {
  scopes = [] as Array<Scope>;
  override visitProgram(node: Program): void {
    this.scopes.push(this.currentMod!.scope);
    super.visitProgram(node);
    this.scopes.pop();
    assert(this.scopes.length === 0);
  }

  get currentScope() {
    return this.scopes[this.scopes.length - 1];
  }

  override visitAsyncBlockLiteral(expression: AsyncBlockLiteral): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.forkTypes();
    this.currentMod!.scopes.set(expression, newScope);
    this.scopes.push(newScope);
    super.visitAsyncBlockLiteral(expression);
    this.scopes.pop();
  }

  override visitClassDeclaration(node: ClassDeclaration): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.forkTypes();
    this.currentMod!.scopes.set(node, newScope);
    this.scopes.push(newScope);
    super.visitClassDeclaration(node);
    this.scopes.pop();
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.forkTypes();
    this.currentMod!.scopes.set(node, newScope);
    this.scopes.push(newScope);
    super.visitFunctionDeclaration(node);
    this.scopes.pop();
  }

  override visitFunctionLiteral(expression: FunctionLiteral): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.forkTypes();
    this.currentMod!.scopes.set(expression, newScope);
    this.scopes.push(newScope);
    super.visitFunctionLiteral(expression);
    this.scopes.pop();
  }

  override visitGetterClassMember(node: GetterClassMember): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.forkTypes();
    this.currentMod!.scopes.set(node, newScope);
    this.scopes.push(newScope);
    super.visitGetterClassMember(node);
    this.scopes.pop();
  }

  override visitSetterClassMember(node: SetterClassMember): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.forkTypes();
    this.currentMod!.scopes.set(node, newScope);
    this.scopes.push(newScope);
    super.visitSetterClassMember(node);
    this.scopes.pop();
  }

  override visitBlockStatement(node: BlockStatement): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.fork();
    this.currentMod!.scopes.set(node, newScope);
    this.scopes.push(newScope);
    super.visitBlockStatement(node);
    this.scopes.pop();
  }

  override visitMethodClassMember(node: MethodClassMember): void {
    const oldScope = this.currentScope;
    const newScope = oldScope.fork();
    this.currentMod!.scopes.set(node, newScope);
    this.scopes.push(newScope);
    super.visitMethodClassMember(node);
    this.scopes.pop();
  }
}
