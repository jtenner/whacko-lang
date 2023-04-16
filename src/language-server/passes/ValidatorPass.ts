import { AstNode } from "langium";
import { WhackoVisitor } from "../WhackoVisitor";
import { reportErrorDiagnostic } from "../diagnostic";
import {
  BinaryExpression,
  BreakStatement,
  ClassDeclaration,
  ConstructorClassMember,
  ContinueStatement,
  IfElseStatement,
  ReturnStatement,
  WhileStatement,
  isConstructorClassMember,
  isFieldClassMember,
  isMemberAccessExpression,
  isThisLiteral,
} from "../generated/ast";
import { WhackoModule, WhackoProgram } from "../program";
import { assert, cleanNode, isAssignmentOperator } from "../util";
import { ScopeElementType, getElementInScope, getScope } from "../scope";

export interface ClassRulesStackItem {
  fields: Map<string, boolean>;
  shouldAdd: boolean;
}

export class ValidatorPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }

  inConstructor: boolean = false;
  setStack: ClassRulesStackItem[] = [];
  mod!: WhackoModule;
  loopStack: AstNode[] = [];

  visitModule(module: WhackoModule) {
    this.mod = module;
    this.visit(module.ast);
  }

  override visitClassDeclaration(node: ClassDeclaration): void {
    const constructorMembers = node.members.filter(isConstructorClassMember);
    if (constructorMembers.length !== 1) {
      reportErrorDiagnostic(
        this.program,
        this.mod,
        "type",
        node.name,
        "Classes must contain exactly one constructor.",
      );
      return;
    }

    const [constructor] = constructorMembers;

    this.visit(constructor);
  }

  override visitConstructorClassMember(node: ConstructorClassMember): void {
    this.setStack.push({
      fields: new Map(
        node.$container.members
          .filter(isFieldClassMember)
          .map((e) => [e.name.name, false]),
      ),
      shouldAdd: true,
    });

    this.inConstructor = true;
    super.visitConstructorClassMember(node);
    this.inConstructor = false;
    const result = this.setStack.pop()!;

    const fields = node.$container.members.filter(isFieldClassMember);
    for (const [name, isSet] of result.fields) {
      if (!isSet) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          assert(fields.find((e) => e.name.name === name)),
          `Field ${name} is not set in the constructor.`,
        );
      }
    }
  }

  override visitBinaryExpression(node: BinaryExpression): void {
    if (!this.inConstructor) return;

    const assignment = isAssignmentOperator(node);
    const stackItem = assert(this.setStack.at(-1));

    if (
      stackItem.shouldAdd &&
      assignment &&
      isMemberAccessExpression(node.lhs) &&
      isThisLiteral(node.lhs.memberRoot.root)
    ) {
      const property = node.lhs.member.name;
      const hasProperty = stackItem.fields.has(property);
      if (hasProperty && node.op === "=") {
        stackItem.fields.set(property, true);
      } else if (hasProperty) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          // @ts-ignore
          node.lhs.member,
          `Property ${property} is used before it has been set.`,
        );
      } else {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          // @ts-ignore
          node.lhs.member,
          `Property ${property} does not exist in this class.`,
        );
      }
    }
  }

  override visitIfElseStatement(node: IfElseStatement): void {
    if (!this.inConstructor) return;

    const currentItem = assert(this.setStack.at(-1));
    const ifSet: ClassRulesStackItem = {
      fields: new Map(currentItem.fields),
      shouldAdd: currentItem.shouldAdd,
    };

    const elseSet: ClassRulesStackItem = {
      fields: new Map(currentItem.fields),
      shouldAdd: currentItem.shouldAdd,
    };

    this.setStack.push(ifSet);
    this.visit(node.truthy);
    this.setStack.pop();

    if (node.falsy) {
      this.setStack.push(elseSet);
      this.visit(node.falsy);
      this.setStack.pop();

      for (const [item, isSet] of ifSet.fields) {
        if (isSet && elseSet.fields.get(item)) {
          currentItem.fields.set(item, true);
        }
      }

      if (!ifSet.shouldAdd) {
        for (const [item, isSet] of elseSet.fields) {
          currentItem.fields.set(item, true);
        }
      }

      currentItem.shouldAdd = ifSet.shouldAdd || elseSet.shouldAdd;
    }
  }

  override visitReturnStatement(node: ReturnStatement): void {
    if (!this.inConstructor) return;
    const lastItem = assert(this.setStack.at(-1));
    lastItem.shouldAdd = false;
    for (const [key, value] of lastItem.fields) {
      if (!value) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          node,
          `Field ${key} is not set when the constructor returns.`,
        );
      }
    }
  }

  override visitBreakStatement(node: BreakStatement): void {
    if (!this.loopStack.length) {
      reportErrorDiagnostic(
        this.program,
        this.mod,
        "type",
        node,
        `Cannot break outside of a loop.`,
      );
      return;
    }

    if (node.label) {
      const scope = assert(
        getScope(node),
        "The scope for this element must exist.",
      );
      const scopeElement = getElementInScope(scope, node.label.name);
      if (!scopeElement) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          node,
          `Label '${node.label.name}' does not exist.`,
        );
      }
      if (scopeElement && scopeElement.type !== ScopeElementType.Label) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          node,
          `'${node.label.name}' is not a label.`,
        );
      }
    }

    if (!this.inConstructor) return;
    const lastItem = assert(this.setStack.at(-1));
    lastItem.shouldAdd = false;
  }

  override visitContinueStatement(node: ContinueStatement): void {
    if (!this.loopStack.length) {
      reportErrorDiagnostic(
        this.program,
        this.mod,
        "type",
        node,
        `Cannot continue outside of a loop.`,
      );
      return;
    }

    if (node.label) {
      const scope = assert(
        getScope(node),
        "The scope for this element must exist.",
      );
      const scopeElement = getElementInScope(scope, node.label.name);
      if (!scopeElement) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          node,
          `Label '${node.label.name}' does not exist.`,
        );
      }
      if (scopeElement && scopeElement.type !== ScopeElementType.Label) {
        reportErrorDiagnostic(
          this.program,
          this.mod,
          "type",
          node,
          `'${node.label.name}' is not a label.`,
        );
      }
    }

    if (!this.inConstructor) return;
    const lastItem = assert(this.setStack.at(-1));
    lastItem.shouldAdd = false;
  }

  override visitWhileStatement(node: WhileStatement): void {
    this.loopStack.push(node);
    super.visitWhileStatement(node);
    this.loopStack.pop();
  }
}
