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
  ExecutionVariable,
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
  VariableDeclarationStatement,
  ID,
  isRootIdentifier,
  RootIdentifier,
} from "../generated/ast";
import { WhackoModule } from "../module";
import {
  ClassType,
  ConcreteType,
  DynamicTypeScopeElement,
  FloatType,
  getScope,
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
    typeParameters: ConcreteType[] | null,
    module: WhackoModule
  ) {
    this.currentMod = module;
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

    const funcScope = getScope(func.node)!;
    assert(funcScope, "Function scope should exist at this point.");

    const ctx = new ExecutionContext(funcScope);
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

    if (assignmentOps.has(node.op)) return this.compileAssignment(node);
    
    super.visitBinaryExpression(node);
    assert(ctx.stack.length >= 2, "Expected stack to have two items on it.");
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
        // we can operate on these two items and make a constant
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
            this.error("Semantic", node, "Compile time operator not supported " + node.op);
            ctx.stack.push(new CompileTimeInvalid(node));
            return;
          }
        }
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
            ctx.stack.push(new CompileTimeInvalid(node));
            return;
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

    if (isRootIdentifier(node.lhs)) {
      const local = ctx.vars.get(node.lhs.root.name)!;
      this.visit(node.rhs);

      // are we a constant variable, or a runtime variable
      if (local.immutable) {
        // compile time constant variable! We need to emit a diagnostic and push void to the stack
        this.error(
          "Semantic",
          node.lhs,
          "Invalid left hand side, variable is immutable."
        );
        ctx.stack.push(new CompileTimeInvalid(node));
      } else {
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
          // we already know that the assignment can't happen, but we can poison the variable here
          local.value = rhs;
        }
        // then push the calculated value to the stack
        ctx.stack.push(rhs);
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

  override visitVariableDeclarationStatement(
    node: VariableDeclarationStatement
  ): void {
    const immutable = node.immutable;
    const ctx = this.currentCtx;
    for (const declarator of node.declarators) {
      const name = declarator.name.name;
      // if the variable is already declared, then we should just continue, this error has already been reported
      if (ctx.vars.has(name)) continue;
      const { expression, type } = declarator;

      // compile the expression
      super.visit(expression);
      // the stack should have a single item at this point
      assert(ctx.stack.length === 1, "Stack must have one item on it.");
      const value = ctx.stack.pop()!;

      // if the typeguard exists, we must do type checking
      if (type) {
        const resolvedType = ctx.resolve(type);

        if (resolvedType) {
          // if the type isn't assignable, we have a problem
          if (!value.ty.isAssignableTo(resolvedType)) {
            this.error(
              "Type",
              node,
              `Expression is invalid type, cannot assign variable.`
            );
            // we are safe to do the assignment, because errors have reported, and the `value` can be a poison value
            const variable = new ExecutionVariable(immutable, name, value, resolvedType);
            ctx.vars.set(name, variable);
            continue;
          }
        } else {
          this.error("Type", node, `Unable to resolve type.`);
          const variable = new ExecutionVariable(immutable, name, value, new InvalidType(type));
          ctx.vars.set(name, variable);
          continue;
        }
      } else {
        const variable = new ExecutionVariable(immutable, name, value, value.ty);
        ctx.vars.set(name, variable);
        continue;
      }
    }
  }

  override visitRootIdentifier(expression: RootIdentifier): void {
    const ctx = this.currentCtx;
    const variable = ctx.vars.get(expression.root.name);
    console.log(variable);
    if (variable) {
      ctx.stack.push(variable.value);
    } else {
      this.error("Semantic", expression, `Cannot find variable named ${expression.root.name} in this context.`);
      ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }
}
