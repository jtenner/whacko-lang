import { assert } from "console";
import { AstNode } from "langium";
import {
  CompileTimeBool,
  CompileTimeValue,
  CompileTimeFloat,
  CompileTimeInteger,
  CompileTimeInvalid,
  CompileTimeString,
  ExecutionContext,
  ExecutionContextValue,
  RuntimeValue,
  RuntimeInvalid,
  RuntimeBool,
  RuntimeString,
  RuntimeFloat,
  RuntimeInteger,
} from "../execution-context";
import {
  BinaryExpression,
  BinaryLiteral,
  ExpressionStatement,
  FloatLiteral,
  FunctionDeclaration,
  HexLiteral,
  IntegerLiteral,
  isFunctionDeclaration,
  StringLiteral,
  isID,
  isMemberAccessExpression,
  MemberAccessExpression,
} from "../generated/ast";
import {
  ClassType,
  ConcreteType,
  DynamicTypeScopeElement,
  FloatType,
  IntegerType,
  InvalidType,
  ScopeTypeElement,
  StaticTypeScopeElement,
  Type,
} from "../types";
import { WhackoPass } from "./WhackoPass";

const assignmentOps = new Set<string>([
  "=",
  "%=",
  "&&=",
  "&=",
  "**=",
  "*=",
  "+=",
  "-=",
  "/=",
  "<<=",
  ">>=",
  "^=",
  "|=",
  "||=",
]);

export class CompilationPass extends WhackoPass {
  executionStack: ExecutionContext[] = [];
  func!: FunctionDeclaration;

  get currentCtx() {
    const last = this.executionStack.at(-1)!;
    assert(last, `Expected context to exist.`);
    return last;
  }

  compileElement(
    func: ScopeTypeElement,
    typeParameters: ConcreteType[] | null
  ) {
    assert(
      isFunctionDeclaration(func.node),
      `Expected function in FunctionCompilationPass.`
    );
    const funcNode = func.node as FunctionDeclaration;
    if (func instanceof StaticTypeScopeElement) {
      if (typeParameters?.length) {
        this.error("Semantic", func.node, "Expected no type parameters.");
        return;
      }
    } else if (func instanceof DynamicTypeScopeElement) {
      if (typeParameters?.length !== func.typeParameters.length) {
        this.error(
          "Semantic",
          func.node,
          `Expected ${func.typeParameters.length} parameters.`
        );
        return;
      }
    }
    const ctx = new ExecutionContext();
    if (typeParameters) {
      for (let i = 0; i < typeParameters.length; i++) {
        ctx.types.set(funcNode.typeParameters[i].name, typeParameters[i]);
      }
    }
    this.func = funcNode;
    this.executionStack.push(ctx);
    this.visit(funcNode);
  }

  override visitExpressionStatement(node: ExpressionStatement): void {
    super.visitExpressionStatement(node);
    const ctx = this.currentCtx;
    assert(ctx.stack.length === 1);
    ctx.stack.pop();
  }

  override visitStringLiteral(expression: StringLiteral): void {
    const ctx = this.currentCtx;
    ctx.stack.push(new CompileTimeString(expression.value, expression));
  }

  override visitIntegerLiteral(expression: IntegerLiteral): void {
    const value = BigInt(expression.value);
    if (
      value <= 9_223_372_036_854_775_807n &&
      value >= -9_223_372_036_854_775_808n
    ) {
      this.currentCtx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.i64, value, expression)
        )
      );
    } else if (value >= 0n && value <= 18_446_744_073_709_551_615n) {
      this.currentCtx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.u64, value, expression)
        )
      );
    } else {
      this.error(
        "Semantic",
        expression,
        "Invalid number, must be a valid i64 or u64."
      );
    }
  }

  override visitFloatLiteral(expression: FloatLiteral): void {
    const value = parseFloat(expression.value);
    this.currentCtx.stack.push(
      new CompileTimeFloat(value, new FloatType(Type.f64, value, expression))
    );
  }

  override visitBinaryLiteral(expression: BinaryLiteral): void {
    const value = BigInt(expression.value);
    if (
      value <= 9_223_372_036_854_775_807n &&
      value >= -9_223_372_036_854_775_808n
    ) {
      this.currentCtx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.i64, value, expression)
        )
      );
    } else if (value >= 0n && value <= 18_446_744_073_709_551_615n) {
      this.currentCtx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.u64, value, expression)
        )
      );
    } else {
      this.error(
        "Semantic",
        expression,
        "Invalid number, must be a valid i64 or u64."
      );
    }
  }

  override visitHexLiteral(expression: HexLiteral): void {
    const value = BigInt(expression.value);
    if (
      value <= 9_223_372_036_854_775_807n &&
      value >= -9_223_372_036_854_775_808n
    ) {
      this.currentCtx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.i64, value, expression)
        )
      );
    } else if (value >= 0n && value <= 18_446_744_073_709_551_615n) {
      this.currentCtx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.u64, value, expression)
        )
      );
    } else {
      this.error(
        "Semantic",
        expression,
        "Invalid number, must be a valid i64 or u64."
      );
    }
  }

  override visitBinaryExpression(node: BinaryExpression): void {
    const ctx = this.currentCtx;
    assert(ctx.stack.length >= 2, "Expected stack to have two items on it.");
    if (assignmentOps.has(node.op)) return this.compileAssignment(node);

    super.visitBinaryExpression(node);
    const right = ctx.stack.pop()!;
    const left = ctx.stack.pop()!;

    if (right instanceof InvalidType || left instanceof InvalidType) {
      ctx.stack.push(new CompileTimeInvalid(node));
      return;
    }

    if (left.ty.isAssignableTo(right.ty)) {
      if (
        left instanceof CompileTimeValue &&
        right instanceof CompileTimeValue
      ) {
        // we can concatenate the two items
        this.currentCtx.stack.push(
          new CompileTimeBool(left.value === right.value, node)
        );
      } else {
        const compiledLeft = this.ensureCompiled(left);
        const compiledRight = this.ensureCompiled(right);
        // TODO: use compiledLeft and compiledRight to emit a instruction in llvm
        switch (node.op) {
          case "!=":
          case "%":
          case "&":
          case "&&":
          case "*":
          case "**":
          case "+":
          case "-":
          case "/":
          case "<":
          case "<<":
          case "<=":
          case "==":
          case ">":
          case ">>":
          case "^":
          case "|":
          case "||":
          default: {
            this.error("Semantic", node, "Operator not supported " + node.op);
          }
        }
        const compiledValue = 0 as any as RuntimeValue;
        this.currentCtx.stack.push(compiledValue);
      }
    } else {
      this.currentCtx.stack.push(new CompileTimeInvalid(node));
    }
  }

  private compileAssignment(node: BinaryExpression): void {
    const ctx = this.currentCtx;

    if (isID(node.lhs)) {
      const local = ctx.vars.get(node.lhs.name)!;
      this.visit(node.rhs);

      // are we a constant variable, or a runtime variable
      if (local instanceof RuntimeValue) {
        assert(local, "Local not found");
        // pop the rhs off the stack
        const rhs = ctx.stack.pop()!;
        assert(rhs);

        if (rhs.valid) {
          // perform an assignment using local.ref and rhs
          switch (node.op) {
            // TODO: What goes here?
            case "=":
            case "%=":
            case "&&=":
            case "&=":
            case "**=":
            case "*=":
            case "+=":
            case "-=":
            case "/=":
            case "<<=":
            case ">>=":
            case "^=":
            case "|=":
            case "||=":
            default:
          }
        } else {
          // we already know that the assignment can't happen
          ctx.vars.set(
            node.lhs.name,
            new RuntimeInvalid(new InvalidType(node))
          );
        }

        // then push the calculated value to the stack
        ctx.stack.push(rhs);
      } else {
        // compile time constant variable! We need to emit a diagnostic and push void to the stack
        this.error(
          "Semantic",
          node.lhs,
          "Invalid left hand side, variable is constant."
        );
        ctx.stack.push(new CompileTimeInvalid(node));
      }
    } else if (isMemberAccessExpression(node.lhs)) {
      const mas = node.lhs as MemberAccessExpression;
      this.visit(mas.memberRoot);
      const rootElement = this.currentCtx.stack.pop()!;
      assert(
        rootElement,
        "Could not pop context stack element because the stack was exhausted."
      );
      this.visit(node.rhs);
      const valueElement = this.currentCtx.stack.pop()!;
      assert(
        valueElement,
        "Could not pop context stack element because the stack was exhausted."
      );
      const propname = mas.member.name;
      if (rootElement.ty instanceof ClassType) {
        const classType = rootElement.ty;
        // TODO: obtain field information from class type
      } else {
        this.error(
          "Type",
          mas.member,
          `Invalid type, ${rootElement.ty.name} is not a class.`
        );
      }
    } else {
      // this.visit(node.lhs);
      this.visit(node.rhs);
      this.error(
        "Semantic",
        node.lhs,
        "Invalid left hand side, invalid expression."
      );
      ctx.stack.pop();
      ctx.stack.push(new CompileTimeInvalid(node));
    }
  }

  private ensureCompiled(value: ExecutionContextValue): RuntimeValue {
    // TODO: turn compile time constants into runtime values
    if (value instanceof RuntimeValue) return value;
    else if (value instanceof CompileTimeBool) {
      return new RuntimeBool(0, value.ty);
    } else if (value instanceof CompileTimeString) {
      return new RuntimeString(0, value.ty);
    } else if (value instanceof CompileTimeFloat) {
      return new RuntimeFloat(0, value.ty);
    } else if (value instanceof CompileTimeInteger) {
      return new RuntimeInteger(0, value.ty);
    } else if (value instanceof CompileTimeInvalid) {
      return new RuntimeInvalid(value.ty);
    }
    throw new Error("Method not implemented.");
  }
}
