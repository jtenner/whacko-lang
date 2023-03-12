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
  RuntimeFunction,
  RuntimeArray,
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
  BlockStatement,
} from "../generated/ast";
import { WhackoModule } from "../module";
import {
  BoolType,
  ClassType,
  ConcreteFunction,
  ConcreteType,
  DynamicTypeScopeElement,
  FloatType,
  FunctionType,
  getScope,
  IntegerEnumType,
  IntegerType,
  InvalidType,
  Scope,
  ScopeTypeElement,
  StaticTypeScopeElement,
  StringType,
  Type,
} from "../types";
import { WhackoPass } from "./WhackoPass";
import { AstNode } from "langium";
import llvm, { LLVMBasicBlockRef, LLVMBuilderRef, LLVMFuncRef, LLVMTypeRef, LLVMValueRef, lower, lowerTypeArray } from "../../llvm/llvm";
import { WhackoProgram } from "../program";
import { ThemeIcon } from "vscode";
const LLVM = await (await llvm).ready();
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

export class CompiledString {
  constructor(
    public ref: LLVMValueRef,
    public value: string,
    public byteLength: number,
  ) {}
}

export interface QueuedFunctionCompilation {
  func: ScopeTypeElement;
  module: WhackoModule;
  typeParameters: Map<string, ConcreteType>;
}

export class CompilationPass extends WhackoPass {
  private ctx!: ExecutionContext;
  private func!: ConcreteFunction;
  private queue: QueuedFunctionCompilation[] = [];
  private entry!: LLVMBasicBlockRef;
  private currentBlock!: LLVMBasicBlockRef;
  private builder!: LLVMBuilderRef;
  private compiledStrings = new Map<string, CompiledString>();
  private cachedFunctions = new Map<string, ConcreteFunction>();
  private tmp: bigint = 0n;

  compile(program: WhackoProgram) {
    outer: for (const [,module] of program.modules) {
      for (const [exportName, element] of module.exports) {
        if (exportName === "main") {
          // we need to validate main is the right format
          if (element instanceof StaticTypeScopeElement && element.node.$type === "FunctionDeclaration") {
            this.queue.push({
              func: element,
              module,
              typeParameters: new Map(),
            });
          }
          break outer;
        }
      }
    }
    this.exhaustQueue();
  }

  private exhaustQueue() {
    while (this.queue.length > 0) {
      // there's a function declaration to compile
      const item = this.queue.shift()!;
      this.compileFunction(item);
    }
  }

  private compileFunction(item: QueuedFunctionCompilation) {
    const scope = getScope(item.func.node)!;
    assert(scope, "The scope must exist at this point.");
    const ctx = new ExecutionContext(scope, item.typeParameters);
    this.ctx = ctx;
    this.currentMod = item.module;
    this.visit(item.func.node);
    return this.func;
  }
  
  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    // we need to evaluate the current function based on the current type parameters
    // we also need to compile a function with the correct signature
    // this requires getting the llvm types and parameter types for this function
    const parameterNames = node.parameters.map(e => e.name.name);
    const parameterTypes = node.parameters.map(e => this.ctx.resolve(e.type) ?? new InvalidType(e.type));
    const returnType = this.ctx.resolve(node.returnType) ?? new InvalidType(node.returnType);
    const typeParameters = node.typeParameters.map(e => this.ctx.types.get(e.name)!);
    
    // check for a cached function... which means we need to get a function type
    const funcType = new FunctionType(
      typeParameters,
      parameterTypes,
      parameterNames,
      returnType,
      node,
      node.name.name,
    );
    const fullyQualifiedFuncName = funcType.getName();

    // if the function already exists, we compiled it!
    if (this.cachedFunctions.has(fullyQualifiedFuncName)) {
      this.func = this.cachedFunctions.get(fullyQualifiedFuncName)!
      return; // because we are already compiled
    }

    // next we need to define the function types in llvm and create a concrete function
    const llvmParameterTypes = parameterTypes.map(e => e.llvmType!);
    const llvmReturnType = returnType.llvmType!;
    const llvmFuncType = LLVM._LLVMFunctionType(llvmReturnType, lowerTypeArray(llvmParameterTypes), llvmParameterTypes.length, 0);
    const llvmFunc = LLVM._LLVMAddFunction(this.program.llvmModule, lower(node.name.name), llvmFuncType);
    this.func = new ConcreteFunction(llvmFunc, funcType);

    // next we need to initialize the context with some parameter variables
    for (let i = 0; i < parameterNames.length; i++) {
      const parameterName = parameterNames[i];
      const parameterType = parameterTypes[i];
    
      this.ctx.vars.set(
        parameterName,
        new ExecutionVariable(
          false,
          parameterName,
          this.getParameterLLVMRef(LLVM._LLVMGetParam(llvmFunc, i), parameterType),
          parameterType
        )
      );
    }

    this.entry = LLVM._LLVMAppendBasicBlock(llvmFunc, lower("entry"));
    this.currentBlock = this.entry;
    this.builder = LLVM._LLVMCreateBuilder();
    LLVM._LLVMPositionBuilderAtEnd(this.builder, this.entry);

    super.visitFunctionDeclaration(node);
  }
  
  private getParameterLLVMRef(i: number, ty: ConcreteType): RuntimeValue {
    const ref = LLVM._LLVMGetParam(this.func.funcRef, i);
    if (ty instanceof IntegerType) {
      return new RuntimeInteger(ref, ty);
    } else if (ty instanceof FloatType) {
      return new RuntimeFloat(ref, ty);
    } else if (ty instanceof StringType) {
      return new RuntimeString(ref, ty);
    } else if (ty instanceof FunctionType) {
      return new RuntimeFunction(ref, ty);
    } else if (ty instanceof BoolType) {
      return new RuntimeBool(ref, ty);
    } else if (ty instanceof InvalidType) {
      return new RuntimeInvalid(ty);
    } else if (ty instanceof RuntimeArray) {
      return new RuntimeArray(ref, ty);
    }
    return new RuntimeInvalid(new InvalidType(ty.node));
  }

  override visitVariableDeclarationStatement(node: VariableDeclarationStatement): void {
    const { immutable, declarators } = node;
    for (let i = 0; i < declarators.length; i++) {
      const { expression, name, type } = declarators[i];

      if (this.ctx.vars.has(name.name)) {
        // if it already exists, we can't even override the current variable
        this.error("Semantic", name, `Element ${name.name} is already defined.`);
        continue;
      }

      // we should always visit the expression
      this.visit(expression);
      const value = assert(this.ctx.stack.pop(), "Element must exist.");
      
      if (type) {
        const variableType = this.ctx.resolve(type);
        if (variableType) {
          if (value.ty.isAssignableTo(variableType!)) {
            // good we can store the variable
            const variable = new ExecutionVariable(immutable, name.name, value, variableType);
            this.ctx.vars.set(name.name, variable);
          } else {
            // bad, we store a compiletime invalid with the variableType
            const invalid = new CompileTimeInvalid(expression);
            const variable = new ExecutionVariable(immutable, name.name, invalid, invalid.ty);
            this.ctx.vars.set(name.name, variable);
          }
        } else {
          // bad, we couldn't resolve the type, set the variable to compile time invalid
          const invalid = new CompileTimeInvalid(type);
          const variable = new ExecutionVariable(immutable, name.name, invalid, invalid.ty);
          this.ctx.vars.set(name.name, variable);
        }
      } else {
        // good, no type guard, assume the variable's type is equal to the expression's
        const variable = new ExecutionVariable(immutable, name.name, value, value.ty);
        this.ctx.vars.set(name.name, variable);
      }
    }
  }

  override visitBlockStatement(node: BlockStatement): void {
    const nodeScope = assert(getScope(node), "Scope must be defined for this");
    const ctx = this.ctx;
    this.ctx = new ExecutionContext(nodeScope, new Map(ctx.types));
    this.ctx.parent = ctx;
    super.visitBlockStatement(node);
    this.ctx = ctx;
  }

  override visitIntegerLiteral(expression: IntegerLiteral): void {
    const value = BigInt(expression.value);
    if (value <= 9223372036854775807n && value > -9223372036854775808n) {
      this.ctx.stack.push(new CompileTimeInteger(value, new IntegerType(Type.i64, value, expression)));
    } else if (value >= BigInt(0) && value <= 18446744073709551615n) {
      this.ctx.stack.push(new CompileTimeInteger(value, new IntegerType(Type.u64, value, expression)));
    } else {
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  override visitBinaryExpression(node: BinaryExpression): void {
    switch (node.op) {
      case "+": return this.compileAdditionExpression(node);
      case "=": return this.compileAssignmentExpression(node);
      default: {
        this.visit(node.lhs);
        this.visit(node.rhs);
        this.ctx.stack.pop();
        this.ctx.stack.pop();
        this.ctx.stack.push(new CompileTimeInvalid(node));
        this.error("Type", node, `Operator not supported: "${node.op}"`);
      }
    }
  }

  private compileAssignmentExpression(node: BinaryExpression) {
    const { lhs, rhs } = node;
    if (isRootIdentifier(lhs)) {
      const name = lhs.root.name;
      const variable = this.ctx.vars.get(name);
      if (variable) {
        if (variable.immutable) {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error("Semantic", node, `Variable ${name} is immutable.`);
        } else {
          // we need to evaluate the rhs of the expression
          this.visit(rhs);
          const value = assert(this.ctx.stack.pop(), "There must be a value on the stack");
          if (value.ty.isAssignableTo(variable.type)) {
            const compiled = this.ensureCompiled(value);
            variable.value = compiled;
            this.ctx.stack.push(compiled);
          } else {
            this.ctx.stack.push(new CompileTimeInvalid(node));
            this.error("Type", node, `Cannot assign expression to variable.`);
          }
        }
      } else {
        this.ctx.stack.push(new CompileTimeInvalid(node));
        this.error("Semantic", node, `Invalid identifier ${name}.`);
      }
      return;
    }
    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Type", node, `Operation not supported.`);
  }

  private compileAdditionExpression(node: BinaryExpression) {
    // compile both sides and return the expressions
    super.visitBinaryExpression(node);
    // rhs is on top
    const rhs = assert(this.ctx.stack.pop(), "Value must exist on the stack");
    const lhs = assert(this.ctx.stack.pop(), "Value must exist on the stack");
    // if the types are equal, and the sides are valid
    if (lhs.ty.isEqual(rhs.ty) && rhs.valid && lhs.valid) {
      // we can perform the operation
      if (lhs instanceof CompileTimeInteger && rhs instanceof CompileTimeInteger) {
        // integer types are the same
        const ty = lhs.ty as IntegerType;
        const bits = ty.bits;
        const signed = ty.signed;
        const addedValue = lhs.value + rhs.value;
        const value = signed ? BigInt.asIntN(bits, addedValue) : BigInt.asUintN(bits, addedValue);
        this.ctx.stack.push(new CompileTimeInteger(value, new IntegerType(ty.ty as IntegerEnumType, value, node)));
        return;
      } else if (lhs instanceof CompileTimeFloat && rhs instanceof CompileTimeFloat) {
        // add the floats
        const value = lhs.value + rhs.value;
        this.ctx.stack.push(new CompileTimeFloat(value, new FloatType(value, lhs.ty.ty, node)));
        return
      } else if (lhs instanceof CompileTimeString && rhs instanceof CompileTimeString) {
        const value = lhs.value + rhs.value;
        // concatenate the strings manually
        this.ctx.stack.push(new CompileTimeString(value, node));
        return
      } else if (lhs instanceof RuntimeInteger || rhs instanceof RuntimeInteger) {
        const compiledlhs = this.ensureCompiled(lhs) as RuntimeValue;
        const compiledrhs = this.ensureCompiled(rhs) as RuntimeValue;
        const tmpname = "tmp" + (this.tmp++).toString();
        const inst = LLVM._LLVMBuildAdd(this.builder, compiledlhs.ref, compiledrhs.ref, lower(tmpname));
        this.ctx.stack.push(new RuntimeInteger(inst, new IntegerType(lhs.ty.ty as IntegerEnumType, null, node)));
        return;
      } else if (lhs instanceof RuntimeFloat || rhs instanceof RuntimeFloat) {
        const compiledlhs = this.ensureCompiled(lhs) as RuntimeValue;
        const compiledrhs = this.ensureCompiled(rhs) as RuntimeValue;
        const tmpname = "tmp" + (this.tmp++).toString();
        const inst = LLVM._LLVMBuildAdd(this.builder, compiledlhs.ref, compiledrhs.ref, lower(tmpname));
        this.ctx.stack.push(new RuntimeInteger(inst, new FloatType(lhs.ty.ty as any, null, node)));
        return;
      } 
    }
    this.error("Type", node, `Addition operation not supported.`);
    this.ctx.stack.push(new CompileTimeInvalid(node));
  }

  private ensureCompiled(expression: ExecutionContextValue): RuntimeValue | CompileTimeInvalid {
    if (expression instanceof RuntimeValue) { return expression; }
    else if (expression instanceof CompileTimeInteger) {
      const inst = LLVM._LLVMConstInt(assert(expression.ty.llvmType, "The llvm type for the expression must exist."), expression.value, 0);
      return new RuntimeInteger(inst, expression.ty);
    } else if (expression instanceof CompileTimeFloat) {
      const inst = LLVM._LLVMConstReal(assert(expression.ty.llvmType, "The llvm type for the expression must exist."), expression.value);
      return new RuntimeFloat(inst, expression.ty);
    } else if (expression instanceof CompileTimeString) {
      const compiledString = this.compiledStrings.get(expression.value);
      if (compiledString) return new RuntimeString(compiledString.ref, new StringType(expression.value, expression.ty.node));
      const lowered = lower(expression.value);
      const inst = LLVM._LLVMBuildGlobalStringPtr(this.builder, lowered, lowered);
      const newCompiledString = new CompiledString(inst, expression.value, Buffer.byteLength(expression.value));
      return new RuntimeString(inst, new StringType(expression.value, expression.ty.node));
    }
    this.error("Type", expression.ty.node, `Cannot ensure expression is compiled, expression is not supported.`);
    return new CompileTimeInvalid(expression.ty.node);
  }
}
