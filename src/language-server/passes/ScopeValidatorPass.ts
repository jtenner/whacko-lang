import assert from "assert";
import {
  BlockStatement,
  Expression,
  VariableDeclarator,
  CallExpression,
  MemberAccessExpression,
} from "../generated/ast";
import { DiagnosticLevel } from "../util";
import { WhackoPass } from "./WhackoPass";

class Scope {
  elements = new Map<string, Expression>();

  defineElement(name: string, ast: Expression) {
    // at this point, we know that the element hasn't been defined
    assert(!this.elements.has(name));
    // set the element
    this.elements.set(name, ast);
  }

  getElement(name: string): Expression | null {
    return this.elements.get(name) ?? null;
  }

  copy() {
    const scope = new Scope();
    scope.elements = new Map(scope.elements);
    return scope;
  }
}

export class ScopeValidatorPass extends WhackoPass {
  globalScope = new Scope();
  currentScope = new Scope();

  constructor() {
    super();
  }

  override visitVariableDeclarator(node: VariableDeclarator): void {
    // here we can define a variable
    const {
      name: { name },
      expression,
      $cstNode,
    } = node;

    // if the element is already defined
    if (this.currentScope.getElement(name)) {
      this.diagnostics.push({
        col: $cstNode!.range.start.character,
        line: $cstNode!.range.start.line,
        level: DiagnosticLevel.Error,
        message: `${name} is already defined.`,
      });
    } else {
      // Visit first, then define
      super.visitVariableDeclarator(node);
      this.currentScope.defineElement(name, expression);
    }
  }

  override visitBlockStatement(node: BlockStatement): void {
    let scope = this.currentScope.copy();
    this.currentScope = scope;
    super.visitBlockStatement(node);
    this.currentScope = scope;
  }

  override visitMemberAccessExpression(expression: MemberAccessExpression) {}
}
