import {
  assert,
} from "../util";
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
  isMemberAccessExpression,
  MemberAccessExpression,
  VariableDeclarationStatement,
  isRootIdentifier,
  RootIdentifier,
  CallExpression,
  Parameter,
  TypeExpression,
  Expression,
  isBuiltinDeclaration,
} from "../generated/ast";
import { WhackoModule } from "../module";
import {
  ClassType,
  ConcreteType,
  DynamicTypeScopeElement,
  FloatType,
  FunctionType,
  getScope,
  IntegerType,
  InvalidType,
  Scope,
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

interface QueuedCompileElement {
  func: ScopeTypeElement;
  typeParameters: ConcreteType[] | null;
}

export class CompilationPass extends WhackoPass {
  executionStack: ExecutionContext[] = [];
  func!: FunctionDeclaration;

  get currentCtx() {
    const last = this.executionStack.at(-1)!;
    assert(last, `Expected context to exist.`);
    return last;
  }

  queue: QueuedCompileElement[] = [];
  queueCompileElement(
    func: ScopeTypeElement,
    typeParameters: ConcreteType[] | null,
  ): FunctionType {
    this.queue.push({ func, typeParameters });
    // TODO: Ensure that it returns a valid function type, even if the function body isn't compiled yet
    throw new Error("Not implemented.");
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
            this.error(
              "Semantic",
              node,
              "Compile time operator not supported " + node.op
            );
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
      const value = assert(ctx.stack.pop(), "Stack must have one item on it.");
      assert(ctx.stack.length === 0, "Stack is not empty after evaluating a variable declarator.");

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
            const variable = new ExecutionVariable(
              immutable,
              name,
              value,
              resolvedType
            );
            ctx.vars.set(name, variable);
            continue;
          }
        } else {
          this.error("Type", node, `Unable to resolve type.`);
          const variable = new ExecutionVariable(
            immutable,
            name,
            value,
            new InvalidType(type)
          );
          ctx.vars.set(name, variable);
          continue;
        }
      } else {
        const variable = new ExecutionVariable(
          immutable,
          name,
          value,
          value.ty
        );
        ctx.vars.set(name, variable);
        continue;
      }
    }
  }

  override visitRootIdentifier(expression: RootIdentifier): void {
    const ctx = this.currentCtx;
    const variable = ctx.vars.get(expression.root.name);
    if (variable) {
      ctx.stack.push(variable.value);
    } else {
      this.error(
        "Semantic",
        expression,
        `Cannot find variable named ${expression.root.name} in this context.`
      );
      ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  override visitCallExpression(node: CallExpression): void {
    const ctx = this.currentCtx;
    if (isRootIdentifier(node.callRoot)) {
      const scope = getScope(node)!;
      const funcName = node.callRoot.root.name;
      assert(scope, "Scope must exist already.");
      const scopeElement = scope.get(funcName)!;
      if (scopeElement) {
        if (scopeElement instanceof ScopeTypeElement) {
          if(isFunctionDeclaration(scopeElement.node)) {
            const nodeTypeParameters = node.typeParameters;
            // normalize the type parameters, there are none on StaticTypeScopeElements
            const scopeTypeParameters = scopeElement instanceof DynamicTypeScopeElement
              ? scopeElement.typeParameters
              : [];
  
            if (nodeTypeParameters.length === scopeTypeParameters.length) {
              if (node.parameters.length === scopeElement.node.parameters.length) {
                this.compileFunctionCall(ctx, funcName, scopeElement, node.parameters, nodeTypeParameters);
              } else {
                this.error("Type", node.callRoot, "Function parameters does not match signature");
              }
            } else {
              this.error("Type", node.callRoot, "Function type parameters does not match signature.");
            }
          } else if (isBuiltinDeclaration(scopeElement.node)) {
            const builtinNode = scopeElement.node;
            const builtin = scopeElement.builtin;
            if (builtin) {
              const concreteTypeParameters = [] as ConcreteType[];
              for (const typeParameter of node.typeParameters) {
                const concreteType = ctx.resolve(typeParameter);
                if (concreteType) {
                  // it resolved
                  concreteTypeParameters.push(concreteType);
                } else {
                  this.error("Type", typeParameter, `Cannot resolve type parameter.`);
                  concreteTypeParameters.push(new InvalidType(typeParameter));
                }
              }
  
              if (concreteTypeParameters.length !== builtinNode.typeParameters.length) {
                this.error("Type", node.callRoot, `Invalid call to builtin ${builtinNode.name.name}, invalid type parameters.`);
              }
  
              // name all the parameter types with their concrete alias
              const concreteTypesAlias = new Map(ctx.types);
              for (let i = 0; i < builtinNode.typeParameters.length; i++) {
                const builtinNodeTypeParameterName = builtinNode.typeParameters[i].name;
                const concreteTypeParameter = concreteTypeParameters[i];
                concreteTypesAlias.set(builtinNodeTypeParameterName, concreteTypeParameter);
              }
  
              const parameters = [] as ExecutionContextValue[];
              for (let i = 0; i < builtinNode.parameters.length; i++) {
                const builtinNodeParameter = builtinNode.parameters[i];
                const builtinNodeParameterType = builtinNodeParameter.type;
                const builtinNodeScope = assert(getScope(builtinNodeParameter), "Scope must exist at this point.");
                
                // visit this expression
                this.visit(node.parameters[i]);
                const value = assert(ctx.stack.pop(), "Stack must have a value at this point.");
                const concreteValueType = ctx.resolve(builtinNodeParameterType, concreteTypesAlias, builtinNodeScope);
                if (!concreteValueType) {
                  this.error("Type", builtinNodeParameterType, `Cannot resolve type for call expression.`);
                  parameters.push(new CompileTimeInvalid(builtinNodeParameter));
                } else if (!value.ty.isAssignableTo(concreteValueType)) {
                  this.error("Type", node.parameters[i], `Type does not match type parameter in function signature.`);
                  parameters.push(new CompileTimeInvalid(node.parameters[i]));
                } else {
                  parameters.push(value);
                }
              }
  
              builtin({
                ast: builtinNode,
                ctx,
                module: this.currentMod!,
                pass: this,
                program: this.program,
                parameters,
                typeParameters: concreteTypeParameters,
              });
            } else {
              this.error("Builtin", builtinNode, "Builtin not defined");
            }
          } else {
            this.error("Type", node.callRoot, `${funcName} is not a function.`);
          }
        } else if (ctx.vars.has(funcName)) {
          // we need to check vars because this could be a variable with a function expression
          const variable = ctx.vars.get(funcName)!;
          if (variable.type instanceof FunctionType) {
            // TODO: make call indirect
          } else {
            this.error("Type", node, "Invalid type, expression is not a function expression.");
          }
        }
      } else {
        this.error("Semantic", node.callRoot, "Element does not exist.");
      }
      if (scopeElement instanceof ScopeTypeElement) {
        if(isFunctionDeclaration(scopeElement.node)) {
          const nodeTypeParameters = node.typeParameters;
          // normalize the type parameters, there are none on StaticTypeScopeElements
          const scopeTypeParameters = scopeElement instanceof DynamicTypeScopeElement
            ? scopeElement.typeParameters
            : [];

          if (nodeTypeParameters.length === scopeTypeParameters.length) {
            if (node.parameters.length === scopeElement.node.parameters.length) {
              this.compileFunctionCall(ctx, funcName, scopeElement, node.parameters, nodeTypeParameters);
            } else {
              this.error("Type", node.callRoot, "Function parameters does not match signature");
            }
          } else {
            this.error("Type", node.callRoot, "Function type parameters does not match signature.");
          }
        } else if (isBuiltinDeclaration(scopeElement.node)) {
          const builtinNode = scopeElement.node;
          const builtin = scopeElement.builtin;
          if (builtin) {
            const concreteTypeParameters = [] as ConcreteType[];
            for (const typeParameter of node.typeParameters) {
              const concreteType = ctx.resolve(typeParameter);
              if (concreteType) {
                // it resolved
                concreteTypeParameters.push(concreteType);
              } else {
                this.error("Type", typeParameter, `Cannot resolve type parameter.`);
                concreteTypeParameters.push(new InvalidType(typeParameter));
              }
            }

            if (concreteTypeParameters.length !== builtinNode.typeParameters.length) {
              this.error("Type", node.callRoot, `Invalid call to builtin ${builtinNode.name.name}, invalid type parameters.`);
            }

            // name all the parameter types with their concrete alias
            const concreteTypesAlias = new Map(ctx.types);
            for (let i = 0; i < builtinNode.typeParameters.length; i++) {
              const builtinNodeTypeParameterName = builtinNode.typeParameters[i].name;
              const concreteTypeParameter = concreteTypeParameters[i];
              concreteTypesAlias.set(builtinNodeTypeParameterName, concreteTypeParameter);
            }

            const parameters = [] as ExecutionContextValue[];
            for (let i = 0; i < builtinNode.parameters.length; i++) {
              const builtinNodeParameter = builtinNode.parameters[i];
              const builtinNodeParameterType = builtinNodeParameter.type;
              const builtinNodeScope = assert(getScope(builtinNodeParameter), "Scope must exist at this point.");
              
              // visit this expression
              this.visit(node.parameters[i]);
              const value = assert(ctx.stack.pop(), "Stack must have a value at this point.");
              const concreteValueType = ctx.resolve(builtinNodeParameterType, concreteTypesAlias, builtinNodeScope);
              if (!concreteValueType) {
                this.error("Type", builtinNodeParameterType, `Cannot resolve type for call expression.`);
                parameters.push(new CompileTimeInvalid(builtinNodeParameter));
              } else if (!value.ty.isAssignableTo(concreteValueType)) {
                this.error("Type", node.parameters[i], `Type does not match type parameter in function signature.`);
                parameters.push(new CompileTimeInvalid(node.parameters[i]));
              } else {
                parameters.push(value);
              }
            }

            builtin({
              ast: builtinNode,
              ctx,
              module: this.currentMod!,
              pass: this,
              program: this.program,
              parameters,
              typeParameters: concreteTypeParameters,
            });
          } else {
            this.error("Builtin", builtinNode, "Builtin not defined");
          }
        } else {
          this.error("Type", node.callRoot, `${funcName} is not a function.`);
        }
      } else if (ctx.vars.has(funcName)) {
        // we need to check vars because this could be a variable with a function expression
        const variable = ctx.vars.get(funcName)!;
        if (variable.type instanceof FunctionType) {
          // TODO: make call indirect
        } else {
          this.error("Type", node, "Invalid type, expression is not a function expression.");
        }
      }
    }
  }
  
  private compileFunctionCall(ctx: ExecutionContext, funcName: string, scopeElement: ScopeTypeElement, parameters: Expression[], nodeTypeParameters: TypeExpression[]) {
    // we need to resolve all the call type expressions on the function call
    const nodeTypeParameterTypes = [] as ConcreteType[];
    for (const nodeTypeParameter of nodeTypeParameters) {
      const resolvedNodeTypeParameter = ctx.resolve(nodeTypeParameter);
      if (resolvedNodeTypeParameter) {
        nodeTypeParameterTypes.push(resolvedNodeTypeParameter);
      } else {
        this.error("Type", nodeTypeParameter, "Cannot resolve type.");
        nodeTypeParameterTypes.push(new InvalidType(nodeTypeParameter));
      }
    }

    // now we need to alias the types for the type expressions to be resolved in the other scope
    const concreteTypesAlias = new Map(ctx.types);
    for (let i = 0; i < nodeTypeParameterTypes.length; i++) {
      const nodeTypeName = (scopeElement.node as FunctionDeclaration).typeParameters[i].name;
      concreteTypesAlias.set(nodeTypeName, nodeTypeParameterTypes[i]);
    }
    // fn myFunc<a, b, c>(a, b, c)

    // store all the runtime values
    const parameterValues = [] as ExecutionContextValue[];

    // evaluate all the parameters on the stack and pop them off one by one
    for (let i = 0; i < parameters.length; i++) {
      // first get the parameter
      const parameter = parameters[i];
      // then get the parameter's type
      const typeParameter = (scopeElement.node as FunctionDeclaration).parameters[i].type;

      // the parameter's type exists in another scope, so we actually need to get that scope to resolve the type
      const scope = getScope(typeParameter)!;
      assert(scope, `Scope must be defined at this point for function parameters.`);
      const concreteParameterType = ctx.resolve(typeParameter, concreteTypesAlias, scope);
      if (concreteParameterType) {
        // now we pop the parameter's expression off the stack
        this.visit(parameter);
        const value = assert(ctx.stack.pop(), `Evaluating function parameter did not result in item on the top of the stack.`);
  
        // The last thing to do is evaluate and compare the types of the 
        // parameter expressions vs the type parameters of the function
        if (value.ty.isAssignableTo(concreteParameterType)) {
          // the parameter is good!
          parameterValues.push(this.ensureCompiled(value));
        } else {
          this.error("Type", parameter, "Parameter expression is not assignable to the parameter type.");
          parameterValues.push(new CompileTimeInvalid(parameter));
        }
      } else {
        // the parameter type could not be resolved
        this.error("Type", typeParameter, "Could not resolve type parameter.");
      }
    }

    // now we can resolve the function and call it
    const func = this.queueCompileElement(scopeElement, nodeTypeParameterTypes);


  }
}
