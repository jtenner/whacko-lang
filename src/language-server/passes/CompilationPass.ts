import { assert } from "../util";
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
  ExecutionVariable,
  CompileTimeFunctionReference,
  CompileTimeDeclareDeclarationReference,
  CompileTimeNamespaceDeclarationReference,
  CompileTimeDeclareFunctionReference,
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
  ReturnStatement,
  isID,
  isDeclareDeclaration,
  DeclareDeclaration,
  DeclareFunction,
  isDeclareFunction,
  isStringLiteral,
  isNamespaceDeclaration,
  isCallExpression,
  IfElseStatement,
  TrueLiteral,
  FalseLiteral,
} from "../generated/ast";
import { WhackoModule } from "../module";
import {
  BoolType,
  BuiltinFunction,
  ClassType,
  ConcreteFunction,
  ConcreteType,
  consumeDecorator,
  DynamicTypeScopeElement,
  FloatType,
  FunctionType,
  getScope,
  IntegerEnumType,
  IntegerType,
  InvalidType,
  NamespaceTypeScopeElement,
  ScopeElement,
  ScopeTypeElement,
  StaticTypeScopeElement,
  StringType,
  Type,
  VoidType,
} from "../types";
import { WhackoPass } from "./WhackoPass";
import type {
  LLVMAttributeIndex,
  LLVMBasicBlockRef,
  LLVMBuilderRef,
  LLVMVerifierFailureAction,
  LLVMTypeRef,
  LLVMValueRef,
  LLVMStringRef,
  Module,
} from "llvm-js";
import { WhackoProgram } from "../program";
import { getFileName, getModule } from "./ModuleCollectionPass";
import { AstNode } from "langium";

export function getAttributesForDeclareDeclaration(
  decl: DeclareFunction
): [string, string][] {
  const namespace = decl.$container.namespace.value;
  const nameDecorator = consumeDecorator("name", decl.decorators);
  let name: string;

  if (
    nameDecorator &&
    nameDecorator.parameters.length === 1 &&
    isStringLiteral(nameDecorator.parameters[0])
  ) {
    name = (nameDecorator.parameters[0] as StringLiteral).value;
  } else {
    name = decl.name.name;
  }
  return [
    ["wasm-import-module", namespace],
    ["wasm-import-name", name],
  ];
}

export function getFullyQualifiedFunctionName(
  node: FunctionDeclaration | DeclareFunction,
  typeParameters: ConcreteType[]
): string | null {
  if (isFunctionDeclaration(node)) {
    if (node.typeParameters.length === typeParameters.length) {
      return `${getFileName(node)}~${node.name.name}${
        typeParameters.length
          ? "<" + typeParameters.map((e) => e.getName()) + ">"
          : ""
      }`;
    } else {
      return null;
    }
  } else if (isDeclareFunction(node)) {
    assert(
      typeParameters.length === 0,
      "There should be no type parameters here."
    );
    return `${getFileName(node)}~${node.$container.name.name}.${
      node.name.name
    }`;
  } else return null;
}

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
    public byteLength: number
  ) {}
}

export interface QueuedFunctionCompilation {
  ctx: ExecutionContext;
  node: FunctionDeclaration;
  func: ConcreteFunction;
  typeParameters: ConcreteType[];
  module: WhackoModule;
}

export class CompilationPass extends WhackoPass {
  ctx!: ExecutionContext;
  func!: ConcreteFunction;
  private entry!: LLVMBasicBlockRef;
  private currentBlock!: LLVMBasicBlockRef;
  builder!: LLVMBuilderRef;
  private compiledStrings = new Map<string, CompiledString>();
  private cachedFunctions = new Map<string, ConcreteFunction>();
  private tmp: bigint = 0n;
  LLVM!: Module;

  /**
   * Compile a program.
   */
  compile(program: WhackoProgram) {
    this.LLVM = program.LLVM;
    this.builder = this.LLVM._LLVMCreateBuilder();

    for (const [name, mod] of program.modules) {
      if (mod.entry) {
        for (const [exportName, moduleExport] of mod.exports) {
          const { node, mod } = moduleExport;
          if (isFunctionDeclaration(node)) {
            if (moduleExport instanceof StaticTypeScopeElement) {
              this.compileFunction(node, [], mod, []);
            } else {
              mod.warning(
                "Type",
                node,
                `Cannot export generic function ${node.name.name}.`
              );
            }
          }
        }
      }
    }

    this.exhaustQueue();
    const strRef = this.LLVM._LLVMPrintModuleToString(this.program.llvmModule);
    const str = this.program.LLVMUtil.lift(strRef);
    console.log(str);

    const errorPointer = this.LLVM._malloc<LLVMStringRef[]>(4);
    this.LLVM._LLVMVerifyModule(
      this.program.llvmModule,
      1 as LLVMVerifierFailureAction,
      errorPointer
    );

    const stringPtr = this.LLVM.HEAPU32[errorPointer >>> 2] as LLVMStringRef;
    const errorString =
      stringPtr === 0 ? null : this.program.LLVMUtil.lift(stringPtr);
    console.error(errorString);
  }

  /**
   * Despite the name, this method merely adds a function to the queue to be compiled.
   * It returns a concrete function ref so that the LLVMValueRef can be referenced for
   * function calls despite the fact that the function hasn't been compiled yet.
   *
   * @param node
   * @param typeParameters
   * @param module
   * @returns
   */
  compileFunction(
    node: FunctionDeclaration | DeclareFunction,
    typeParameters: ConcreteType[],
    module: WhackoModule,
    attributes: [string, string][]
  ): ConcreteFunction | null {
    const nodeTypeParameters = isFunctionDeclaration(node)
      ? node.typeParameters
      : [];
    const nodeParameters = node.parameters;
    if (nodeTypeParameters?.length !== typeParameters.length) return null;

    const name = getFullyQualifiedFunctionName(node, typeParameters)!;
    if (this.cachedFunctions.has(name)) return this.cachedFunctions.get(name)!;

    // splice the types into a map
    const map = new Map<string, ConcreteType>();

    for (let i = 0; i < typeParameters.length; i++) {
      const nodeTypeParameter = nodeTypeParameters[i].name;
      map.set(nodeTypeParameter, typeParameters[i]);
    }

    const ctx = new ExecutionContext(
      assert(getScope(node), "Scope must exist at this point"),
      map
    );
    this.ctx = ctx;

    // We need to evaluate the current function based on the current type parameters.
    // We also need to compile a function with the correct signature.
    // This requires getting the llvm types and parameter types for this function.
    const parameterNames = node.parameters.map((e) => e.name.name);
    const parameterTypes = node.parameters.map(
      (e) => this.ctx.resolve(e.type) ?? new InvalidType(e.type)
    );
    const returnType =
      this.ctx.resolve(node.returnType) ?? new InvalidType(node.returnType);

    // check for a cached function... which means we need to get a function type
    const funcType = new FunctionType(
      parameterTypes,
      parameterNames,
      returnType,
      node,
      node.name.name
    );

    // next we need to define the function types in llvm and create a concrete function
    const llvmParameterTypes = parameterTypes.map(
      (e) => e.llvmType(this.LLVM!, this.program.LLVMUtil)!
    );
    const llvmReturnType = returnType.llvmType(this.LLVM, this.program.LLVMUtil)!;
    const llvmFuncType = this.LLVM._LLVMFunctionType(
      llvmReturnType,
      // this is the problem here
      this.program.LLVMUtil.lowerPointerArray<LLVMTypeRef>(llvmParameterTypes),
      llvmParameterTypes.length,
      0
    );
    const llvmFunc = this.LLVM._LLVMAddFunction(
      this.program.llvmModule,
      this.program.LLVMUtil.lower(name),
      llvmFuncType
    );
    const func = new ConcreteFunction(llvmFunc, funcType);

    // next we need to initialize the context with some parameter variables
    for (let i = 0; i < parameterNames.length; i++) {
      const parameterName = parameterNames[i];
      const parameterType = parameterTypes[i];

      const ref = this.LLVM._LLVMGetParam(func.funcRef, i);
      // const strRef = this.LLVM._LLVMPrintValueToString(ref);
      // const str = this.program.LLVMUtil.lift(strRef);
      // console.log(str);

      ctx.vars.set(
        parameterName,
        new ExecutionVariable(
          false,
          parameterName,
          new RuntimeValue(ref, parameterType),
          parameterType
        )
      );
    }

    for (let i = 0; i < attributes.length; i++) {
      const [key, value] = attributes[i];
      const keyRef = this.program.LLVMUtil.lower(key);
      const valueRef = this.program.LLVMUtil.lower(value);

      this.LLVM._LLVMAddTargetDependentFunctionAttr(
        func.funcRef,
        keyRef,
        valueRef
      );
    }

    if (isFunctionDeclaration(node)) {
      this.queue.push({
        ctx,
        func,
        node,
        typeParameters,
        module,
      });
    }

    this.cachedFunctions.set(name, func);
    return func;
  }

  private queue: QueuedFunctionCompilation[] = [];

  private exhaustQueue() {
    while (true) {
      const { ctx, func, node, typeParameters, module } = this.queue.pop()!;

      if (isFunctionDeclaration(node)) {
        this.entry = this.LLVM._LLVMAppendBasicBlockInContext(
          this.program.llvmContext,
          func.funcRef,
          this.program.LLVMUtil.lower("entry")
        );
        this.currentBlock = this.entry;

        this.LLVM._LLVMPositionBuilderAtEnd(this.builder, this.entry);
        this.ctx = ctx;
        this.func = func;
        this.currentMod = module;
        this.visit(node);

        // TODO: Function finalization

        if (this.queue.length === 0) break;
      } else if (isDeclareDeclaration(node)) {
        // TODO: Is there anything here we need to do?
      }
    }
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    for (let i = 0; i < node.parameters.length; i++) {
      const parameter = node.parameters[i];
      const name = parameter.name.name;
      const ty = this.ctx.resolve(parameter.type)!;
      const getParam = this.LLVM._LLVMGetParam(this.func.funcRef, i);

      const variable = new ExecutionVariable(
        false,
        name,
        new RuntimeValue(getParam, ty),
        ty
      );
      this.ctx.vars.set(name, variable);
    }
    super.visitFunctionDeclaration(node);
  }

  override visitIfElseStatement(node: IfElseStatement): void {
    // this.LLVM._LLVMBuildBr()
    this.visit(node.condition);
    const condition = assert(this.ctx.stack.pop(), "Condition must be on the stack.");

    if (condition instanceof CompileTimeBool || condition instanceof CompileTimeInteger) {
      // we can just visit the falsy or the truthy branches without jumps
      if (condition.value) {
        this.visit(node.truthy);
      } else {
        if (node.falsy) this.visit(node.falsy);
      }
      return;
    }

    // while we are on the current block
    const compiledCondition = this.ensureCompiled(condition);

    if (
      !(compiledCondition.ty instanceof IntegerType)
      && !(compiledCondition.ty instanceof BoolType)
    ) {
      this.error("Type", node, `Invalid conditional expression.`);
      return;
    }

    const truthyLabelName = this.program.LLVMUtil.lower(this.getTempName());
    const truthyLabel = this.LLVM._LLVMAppendBasicBlockInContext(this.program.llvmContext, this.func.funcRef, truthyLabelName);

    const falsyLabelName = this.program.LLVMUtil.lower(this.getTempName());
    const falsyLabel = this.LLVM._LLVMAppendBasicBlockInContext(this.program.llvmContext, this.func.funcRef, falsyLabelName);

    const nextLabelName = this.program.LLVMUtil.lower(this.getTempName());
    const nextLabel = this.LLVM._LLVMAppendBasicBlockInContext(this.program.llvmContext, this.func.funcRef, falsyLabelName);

    // now we can create the jump instruction
    this.LLVM._LLVMBuildCondBr(this.builder, compiledCondition.ref, truthyLabel, falsyLabel);
 
    // next we position the builder and compile all the truthy statements
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, truthyLabel);
    this.visit(node.truthy);
    this.LLVM._LLVMBuildBr(this.builder, nextLabel);

    // finally if there is a falsy statement, we compile it
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, falsyLabel);
    if (node.falsy) this.visit(node.falsy);
    this.LLVM._LLVMBuildBr(this.builder, nextLabel);

    // finally start compiling the next block
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, nextLabel);

    this.LLVM._free(truthyLabelName);
    this.LLVM._free(falsyLabelName);
    this.LLVM._free(nextLabelName);
  }

  override visitVariableDeclarationStatement(
    node: VariableDeclarationStatement
  ): void {
    const { immutable, declarators } = node;
    for (let i = 0; i < declarators.length; i++) {
      const { expression, name, type } = declarators[i];

      if (this.ctx.vars.has(name.name)) {
        // if it already exists, we can't even override the current variable
        this.error(
          "Semantic",
          name,
          `Element ${name.name} is already defined.`
        );
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
            const variable = new ExecutionVariable(
              immutable,
              name.name,
              immutable ? value : this.ensureCompiled(value),
              variableType
            );
            this.ctx.vars.set(name.name, variable);
          } else {
            // bad, we store a compiletime invalid with the variableType
            const invalid = new CompileTimeInvalid(expression);
            const variable = new ExecutionVariable(
              immutable,
              name.name,
              invalid,
              invalid.ty
            );
            this.ctx.vars.set(name.name, variable);
          }
        } else {
          // bad, we couldn't resolve the type, set the variable to compile time invalid
          const invalid = new CompileTimeInvalid(type);
          const variable = new ExecutionVariable(
            immutable,
            name.name,
            invalid,
            invalid.ty
          );
          this.ctx.vars.set(name.name, variable);
        }
      } else {
        // good, no type guard, assume the variable's type is equal to the expression's
        const variable = new ExecutionVariable(
          immutable,
          name.name,
          immutable ? value : this.ensureCompiled(value),
          value.ty
        );
        this.ctx.vars.set(name.name, variable);
      }
    }
  }

  override visitRootIdentifier(expression: RootIdentifier): void {
    const variable = this.ctx.vars.get(expression.root.name);

    if (variable) {
      this.ctx.stack.push(variable.value);
      return;
    } else if (this.ctx.scope.has(expression.root.name)) {
      const scopeItem = this.ctx.scope.get(expression.root.name);
      if (scopeItem) {
        this.pushScopeItemToStack(scopeItem, expression);
      } else {
        this.ctx.stack.push(new CompileTimeInvalid(expression));
      }
      return;
    }
    // we didn't really find it
    this.ctx.stack.push(new CompileTimeInvalid(expression));
  }

  private pushScopeItemToStack(scopeItem: ScopeElement, expression: AstNode) {
    if (isBuiltinDeclaration(scopeItem.node)) {
      this.ctx.stack.push(new CompileTimeFunctionReference(scopeItem));
    } else if (isFunctionDeclaration(scopeItem.node)) {
      this.ctx.stack.push(new CompileTimeFunctionReference(scopeItem));
    } else if (isDeclareDeclaration(scopeItem.node)) {
      this.ctx.stack.push(
        new CompileTimeDeclareDeclarationReference(scopeItem)
      );
    } else if (isNamespaceDeclaration(scopeItem.node)) {
      this.ctx.stack.push(
        new CompileTimeNamespaceDeclarationReference(scopeItem)
      );
    } else if (isDeclareFunction(scopeItem.node)) {
      this.ctx.stack.push(new CompileTimeDeclareFunctionReference(scopeItem));
    } else {
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  override visitMemberAccessExpression(node: MemberAccessExpression): void {
    this.visit(node.memberRoot);
    const rootValue = assert(
      this.ctx.stack.pop(),
      "There must be an item on the stack at this point."
    );

    if (
      rootValue instanceof CompileTimeNamespaceDeclarationReference ||
      rootValue instanceof CompileTimeDeclareDeclarationReference
    ) {
      // we are referencing an export inside
      const scopeElement = rootValue.value;

      assert(
        scopeElement instanceof NamespaceTypeScopeElement,
        "At this point, we must be a namespace type scope element."
      );

      const exportedElement = (
        scopeElement as NamespaceTypeScopeElement
      ).exports.get(node.member.name);
      if (exportedElement) {
        this.pushScopeItemToStack(exportedElement, node);
      } else {
        this.error(
          "Semantic",
          node,
          `Cannot find exported scope element ${node.member.name}.`
        );
        this.ctx.stack.push(new CompileTimeInvalid(node));
        return;
      }
    }
  }

  override visitReturnStatement(node: ReturnStatement): void {
    const returnType = this.func.ty.returnType;
    if (returnType instanceof VoidType) {
      if (node.expression) {
        this.error(
          "Semantic",
          node.expression,
          "Function signature is void, invalid return."
        );
      }
      this.LLVM._LLVMBuildRetVoid(this.builder);
    } else {
      if (node.expression) {
        this.visit(node.expression);
        const value = assert(
          this.ctx.stack.pop(),
          "Return value must be on the stack at this point."
        );
        const compiledValue = this.ensureCompiled(value) as RuntimeValue;
        if (value.ty.isAssignableTo(returnType)) {
          this.LLVM._LLVMBuildRet(this.builder, compiledValue.ref);
        } else {
          this.error(
            "Type",
            node.expression,
            "Invalid type, return type must match function signature."
          );
          this.LLVM._LLVMBuildRet(
            this.builder,
            this.LLVM._LLVMGetPoison(
              assert(
                returnType.llvmType(this.LLVM, this.program.LLVMUtil),
                "Must have valid LLVM type"
              )
            )
          );
        }
      } else {
        this.error("Type", node, "Expected expression for return.");
        this.LLVM._LLVMBuildRet(
          this.builder,
          this.LLVM._LLVMGetPoison(
            assert(returnType.llvmType(this.LLVM, this.program.LLVMUtil), "Must have valid LLVM type")
          )
        );
      }
    }
  }

  override visitBlockStatement(node: BlockStatement): void {
    const nodeScope = assert(getScope(node), "Scope must be defined for this");
    const ctx = this.ctx;
    this.ctx = new ExecutionContext(
      nodeScope,
      new Map(ctx.types),
      new Map(ctx.vars)
    );
    this.ctx.parent = ctx;
    super.visitBlockStatement(node);
    this.ctx = ctx;
  }

  override visitIntegerLiteral(expression: IntegerLiteral): void {
    const value = BigInt(expression.value);
    if (value <= 9223372036854775807n && value > -9223372036854775808n) {
      this.ctx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.i64, value, expression)
        )
      );
    } else if (value >= BigInt(0) && value <= 18446744073709551615n) {
      this.ctx.stack.push(
        new CompileTimeInteger(
          value,
          new IntegerType(Type.u64, value, expression)
        )
      );
    } else {
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  override visitBinaryExpression(node: BinaryExpression): void {
    switch (node.op) {
      case "+":
        return this.compileAdditionExpression(node);
      case "-":
      case "/":
      case "*":
      case "**":
        return this.compileMathExpresion(node);
      case "=":
        return this.compileAssignmentExpression(node);
      case "&&":
        return this.compileLogicalAndExpression(node);
      case "||":
        return this.compileLogicalOrExpression(node);
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

  override visitCallExpression(node: CallExpression): void {
    this.visit(node.callRoot);
    const callRootValue = assert(
      this.ctx.stack.pop()!,
      "The call root value must exist."
    );

    const callParameterValues = [] as ExecutionContextValue[];
    for (const callParameterExpression of node.parameters) {
      this.visit(callParameterExpression);
      const callParamaterValue = assert(
        this.ctx.stack.pop(),
        "The call parameter expression must exist."
      );
      callParameterValues.push(callParamaterValue);
    }

    // if there are any type parameters we can resolve them
    const callTypeParameters = [] as ConcreteType[];
    for (const typeParameter of node.typeParameters) {
      const parameterType = this.ctx.resolve(typeParameter);
      if (parameterType) {
        callTypeParameters.push(parameterType);
      } else {
        // we could not validate the type parameter
        this.error("Type", typeParameter, `Could not resolve type parameter.`);
        this.ctx.stack.push(new CompileTimeInvalid(typeParameter));
        return;
      }
    }

    // now we need to see what's on the stack and do type inference
    if (
      callRootValue instanceof CompileTimeFunctionReference
      && callTypeParameters.length === 0
      && ((callRootValue.value as ScopeTypeElement).node as FunctionDeclaration).typeParameters.length > 0
    ) {
      const element = callRootValue.value as ScopeTypeElement;
      const functionDeclaration = element.node as FunctionDeclaration;
      
      outer: for (let i = 0; i < functionDeclaration.typeParameters.length; i++) {
        // for each type parameter, we need to find a type provided by the signature
        const typeParameter = functionDeclaration.typeParameters[i];

        for (let j = 0; j < functionDeclaration.parameters.length; j++) {
          const parameter = functionDeclaration.parameters[j];
          if (isID(parameter.type) && parameter.type.name === typeParameter.name) {
            // we found it, now we need to use the j index
            callTypeParameters.push(callParameterValues[j].ty);
            continue outer;
          } 
        }

        // we didn't find it
        this.error("Type", typeParameter, `Could not infer type parameter.`);
        this.ctx.stack.push(new CompileTimeInvalid(typeParameter));
        return;
      }
    }

    // now we need to do parameter type checking, first let's obtain the element parameters
    let elementParameters: Parameter[] | null = null;
    let splicedTypeMap = new Map<string, ConcreteType>();
    let functionToBeCompiled: FunctionDeclaration | DeclareFunction | null = null;
    let attributes: [string, string][] = [];
    let builtin: BuiltinFunction | null = null;

    if (callRootValue instanceof CompileTimeDeclareFunctionReference) {
      // type parameters are invalid for declare functions
      if (callTypeParameters.length > 0) {
        this.ctx.stack.push(new CompileTimeInvalid(node));
        this.error("Semantic", node, "Calls to declared functions should have no type parameters.");
        return;
      }

      functionToBeCompiled = (callRootValue.value.node as DeclareFunction)
      elementParameters = functionToBeCompiled.parameters;

      const nameDecorator = consumeDecorator("name", functionToBeCompiled.decorators);
      attributes.push(["wasm-import-module", functionToBeCompiled.$container.namespace.value]);
      // @ts-ignore
      attributes.push(["wasm-import-name", (nameDecorator?.parameters[0] as StringLiteral)?.value ?? functionToBeCompiled.name.name]);
    }

    if (callRootValue instanceof CompileTimeFunctionReference) {
      const element = callRootValue.value as ScopeTypeElement;

      if (element instanceof DynamicTypeScopeElement) {
        // type parameters are invalid for declare functions
        if (callTypeParameters.length !== element.typeParameters.length) {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error("Semantic", node, "Type parameter count does not match signature.");
          return;
        }

        // add each type here to the new type map because they need to be re-used
        for (let i = 0; i < callTypeParameters.length; i++) {
          splicedTypeMap.set(element.typeParameters[i], callParameterValues[i].ty);
        }

      } else {
        // static scope type elements don't have type parameters
        if (callTypeParameters.length > 0) {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error("Semantic", node, "Calls to functions with no type parameters should have no type parameters.");
          return;
        }
      }
      
      functionToBeCompiled = element.node as FunctionDeclaration;
      elementParameters = functionToBeCompiled.parameters;
      builtin = element.builtin;
    }

    if (elementParameters && functionToBeCompiled) {
      // we are good for parameter type checking
      for (let i = 0; i < elementParameters.length; i++) {
        const elementParameter = elementParameters[i];
        const scope = assert(getScope(elementParameter));
        const ty = this.ctx.resolve(elementParameter.type, splicedTypeMap, scope);
        if (ty) {
          if (!callParameterValues[i].ty.isAssignableTo(ty)) {
            this.ctx.stack.push(new CompileTimeInvalid(node));
            this.error("Type", node, "Parameter is not assignable to expression type.");
            return;
          }
        } else {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error("Type", node, "Could not resolve parameter type.");
          return;
        }
      }

      // if we are a builtin, we need to call the builtin and return, because there's no function compilation
      if (builtin) {
        builtin({
          ast: node,
          ctx: this.ctx,
          module: this.currentMod!,
          parameters: callParameterValues,
          typeParameters: callTypeParameters,
          pass: this,
          program: this.program,
        });
        return;
      }

      // now that all the type checking is good, we can generate the llvm function
      const func = assert(
        this.compileFunction(
          functionToBeCompiled,
          callTypeParameters,
          assert(getModule(functionToBeCompiled), "Module must exist"),
          attributes,
        ),
        "The function should be compiled at this point.",
      );

      const loweredExpressions = this.program
        .LLVMUtil
        .lowerPointerArray(
          callParameterValues.map(e => this.ensureCompiled(e).ref)
        );
      const name = this.program.LLVMUtil.lower(this.getTempName());
      // now that the function is garunteed to be compiled, we can make the llvm call
      const ref = this.LLVM._LLVMBuildCall2(
        this.builder,
        func.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
        func.funcRef,
        loweredExpressions,
        callParameterValues.length,
        name,
      );
      this.LLVM._free(loweredExpressions);
      this.LLVM._free(name);
      this.ctx.stack.push(new RuntimeValue(ref, func.ty.returnType));
      return;
    }


    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, "Call expression not supported.");
    // TODO: Redo calls because lots of things could be on the stack
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
          const value = assert(
            this.ctx.stack.pop(),
            "There must be a value on the stack"
          );
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
    } else {
      this.ctx.stack.push(new CompileTimeInvalid(node));
      this.error("Type", node, `Operation not supported.`);
    }
  }

  private compileAdditionExpression(node: BinaryExpression) {
    // compile both sides and return the expressions
    super.visitBinaryExpression(node);
    // rhs is on top
    const rhs = assert(this.ctx.stack.pop(), "Value must exist on the stack");
    const lhs = assert(this.ctx.stack.pop(), "Value must exist on the stack");
    // if the types are equal, and the sides are valid
    if (lhs.ty.isEqual(rhs.ty) && rhs.valid && lhs.valid && lhs.ty.isNumeric) {
      // we can perform the operation
      if (
        lhs instanceof CompileTimeInteger &&
        rhs instanceof CompileTimeInteger
      ) {
        // integer types are the same
        const ty = lhs.ty as IntegerType;
        const bits = ty.bits;
        const signed = ty.signed;
        const addedValue = lhs.value + rhs.value;
        const value = signed
          ? BigInt.asIntN(bits, addedValue)
          : BigInt.asUintN(bits, addedValue);
        this.ctx.stack.push(
          new CompileTimeInteger(
            value,
            new IntegerType(ty.ty as IntegerEnumType, value, node)
          )
        );
        return;
      } else if (
        lhs instanceof CompileTimeFloat &&
        rhs instanceof CompileTimeFloat
      ) {
        // add the floats
        const value = lhs.value + rhs.value;
        this.ctx.stack.push(
          new CompileTimeFloat(value, new FloatType(value, lhs.ty.ty, node))
        );
        return;
      } else if (
        lhs instanceof CompileTimeString &&
        rhs instanceof CompileTimeString
      ) {
        const value = lhs.value + rhs.value;
        // concatenate the strings manually
        this.ctx.stack.push(new CompileTimeString(value, node));
        return;
      } else if (lhs instanceof RuntimeValue || rhs instanceof RuntimeValue) {
        if (lhs.ty instanceof StringType) {
          this.error("Type", node, `Addition operation not supported.`);
          this.ctx.stack.push(new CompileTimeInvalid(node));
          return;
        } else {
          const compiledlhs = this.ensureCompiled(lhs) as RuntimeValue;
          const compiledrhs = this.ensureCompiled(rhs) as RuntimeValue;
          const lhsType = this.LLVM._LLVMTypeOf(compiledlhs.ref);
          const rhsType = this.LLVM._LLVMTypeOf(compiledlhs.ref);
          assert(lhsType === rhsType, "Types do not match at this point.");
          const tmpname = this.getTempName();

          // const lhsStrRef = this.LLVM._LLVMPrintValueToString(compiledlhs.ref);
          // const rhsStrRef = this.LLVM._LLVMPrintValueToString(compiledrhs.ref);
          // const lhsStr = this.program.LLVMUtil.lift(lhsStrRef);
          // const rhsStr = this.program.LLVMUtil.lift(rhsStrRef);
          const inst =
            compiledlhs.ty instanceof FloatType
              ? this.LLVM._LLVMBuildFAdd(
                  this.builder,
                  compiledlhs.ref,
                  compiledrhs.ref,
                  this.program.LLVMUtil.lower(tmpname)
                )
              : this.LLVM._LLVMBuildAdd(
                  this.builder,
                  compiledlhs.ref,
                  compiledrhs.ref,
                  this.program.LLVMUtil.lower(tmpname)
                );
          const addedValue = new RuntimeValue(inst, lhs.ty);
          this.ctx.stack.push(addedValue);
          return;
        }
      }
    }
    this.error("Type", node, `Addition operation not supported.`);
    this.ctx.stack.push(new CompileTimeInvalid(node));
  }

  getTempName() {
    return "tmp" + (this.tmp++).toString();
  }

  private compileMathExpresion(node: BinaryExpression) {
    // compile both sides and return the expressions
    super.visitBinaryExpression(node);
    // rhs is on top
    const rhs = assert(this.ctx.stack.pop(), "Value must exist on the stack");
    const lhs = assert(this.ctx.stack.pop(), "Value must exist on the stack");
    // if the types are equal, and the sides are valid
    if (lhs.ty.isEqual(rhs.ty) && rhs.valid && lhs.valid && lhs.ty.isNumeric) {
      // we can perform the operation
      if (
        lhs instanceof CompileTimeInteger &&
        rhs instanceof CompileTimeInteger
      ) {
        // integer types are the same
        const ty = lhs.ty as IntegerType;
        const bits = ty.bits;
        const signed = ty.signed;
        let intValue: bigint = 0n;
        switch (node.op) {
          case "-":
            intValue = lhs.value - rhs.value;
            break;
          case "*":
            intValue = lhs.value * rhs.value;
            break;
          case "/":
            intValue = lhs.value / rhs.value;
            break;
          case "**":
            intValue = lhs.value ** rhs.value;
          default:
            assert(false, "Invalid call to compile math expression.");
        }
        const value = signed
          ? BigInt.asIntN(bits, intValue)
          : BigInt.asUintN(bits, intValue);
        this.ctx.stack.push(
          new CompileTimeInteger(
            value,
            new IntegerType(ty.ty as IntegerEnumType, value, node)
          )
        );
      } else if (
        lhs instanceof CompileTimeFloat &&
        rhs instanceof CompileTimeFloat
      ) {
        // add the floats
        let value: number = 0;
        switch (node.op) {
          case "-":
            value = lhs.value - rhs.value;
            break;
          case "*":
            value = lhs.value * rhs.value;
            break;
          case "/":
            value = lhs.value / rhs.value;
            break;
          case "**":
            value = lhs.value ** rhs.value;
            break;
          default:
            assert(false, "Invalid call to compile math expression.");
        }
        this.ctx.stack.push(
          new CompileTimeFloat(value, new FloatType(value, lhs.ty.ty, node))
        );
      } else if (lhs instanceof RuntimeValue || rhs instanceof RuntimeValue) {
        const compiledlhs = this.ensureCompiled(lhs) as RuntimeValue;
        const compiledrhs = this.ensureCompiled(rhs) as RuntimeValue;
        const tmpname = this.getTempName();

        let ty: ConcreteType = new InvalidType(node);
        if (lhs.ty instanceof FloatType) {
          ty = new FloatType(lhs.ty.ty as Type.f32 | Type.f64, null, node);
        } else if (lhs.ty instanceof IntegerType) {
          ty = new IntegerType(lhs.ty.ty as IntegerEnumType, null, node);
        } else {
          this.error("Type", node, "Invalid add type.");
        }
        let ref: LLVMValueRef;
        switch (node.op) {
          case "-":
            ref =
              lhs.ty instanceof FloatType
                ? this.LLVM._LLVMBuildFSub(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  )
                : this.LLVM._LLVMBuildSub(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  );
            break;
          case "*":
            ref =
              lhs.ty instanceof FloatType
                ? this.LLVM._LLVMBuildFMul(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  )
                : this.LLVM._LLVMBuildMul(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  );
            break;
          case "/":
            ref =
              lhs.ty instanceof FloatType
                ? this.LLVM._LLVMBuildFDiv(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  )
                : compiledlhs.ty.isSigned
                ? this.LLVM._LLVMBuildSDiv(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  )
                : this.LLVM._LLVMBuildUDiv(
                    this.builder,
                    compiledlhs.ref,
                    compiledrhs.ref,
                    this.program.LLVMUtil.lower(this.getTempName())
                  );
            break;
          case "**":
          default:
            ref = this.LLVM._LLVMGetPoison(lhs.ty.llvmType(this.LLVM, this.program.LLVMUtil)!);
        }

        this.ctx.stack.push(
          new RuntimeValue(ref, new FloatType(lhs.ty.ty as any, null, node))
        );
      }
    } else {
      this.error("Type", node, `Math operation not supported.`);
      this.ctx.stack.push(new CompileTimeInvalid(node));
    }
  }

  ensureCompiled(value: ExecutionContextValue): RuntimeValue {
    if (value instanceof RuntimeValue) {
      return value;
    } else if (value instanceof CompileTimeInteger) {
      const inst = this.LLVM._LLVMConstInt(
        assert(
          value.ty.llvmType(this.LLVM, this.program.LLVMUtil),
          "The llvm type for the expression must exist."
        ),
        value.value,
        0
      );
      return new RuntimeValue(inst, value.ty);
    } else if (value instanceof CompileTimeFloat) {
      const inst = this.LLVM._LLVMConstReal(
        assert(
          value.ty.llvmType(this.LLVM, this.program.LLVMUtil),
          "The llvm type for the expression must exist."
        ),
        value.value
      );
      return new RuntimeValue(inst, value.ty);
    } else if (value instanceof CompileTimeString) {
      const compiledString = this.compiledStrings.get(value.value);
      if (compiledString)
        return new RuntimeValue(
          compiledString.ref,
          new StringType(value.value, value.ty.node)
        );
      const lowered = this.program.LLVMUtil.lower(value.value);
      const inst = this.LLVM._LLVMBuildGlobalStringPtr(
        this.builder,
        lowered,
        lowered
      );
      const newCompiledString = new CompiledString(
        inst,
        value.value,
        Buffer.byteLength(value.value)
      );
      return new RuntimeValue(inst, new StringType(value.value, value.ty.node));
    } else if (value instanceof CompileTimeBool) {
      const ref = this.LLVM._LLVMConstInt(value.ty.llvmType(this.LLVM, this.program.LLVMUtil)!, value.value ? 1n : 0n, 0);
      return new RuntimeValue(ref, new BoolType(null, value.ty.node));
    }
    this.error(
      "Type",
      value.ty.node,
      `Cannot ensure expression is compiled, expression is not supported.`
    );
    return new RuntimeValue(
      this.LLVM._LLVMGetPoison(value.ty.llvmType(this.LLVM, this.program.LLVMUtil)!),
      value.ty
    );
  }

  override visitTrueLiteral(expression: TrueLiteral): void {
    this.ctx.stack.push(new CompileTimeBool(true, expression));
  }

  override visitFalseLiteral(expression: FalseLiteral): void {
    this.ctx.stack.push(new CompileTimeBool(false, expression));
  }

  private compileLogicalAndExpression(node: BinaryExpression) {
    this.visit(node.lhs);
    const lhsValue = assert(this.ctx.stack.pop(), "LHS must exist on the stack.");
    this.visit(node.rhs);
    const rhsValue = assert(this.ctx.stack.pop(), "RHS must exist on the stack.");
    // If any values are invalid, the top of the stack should be invalid
    if (
      lhsValue instanceof CompileTimeInvalid
      || rhsValue instanceof CompileTimeInvalid
    ) {
      this.ctx.stack.push(new CompileTimeInvalid(node));
      return;
    }

    if (
      (lhsValue instanceof CompileTimeInteger || lhsValue instanceof CompileTimeBool) 
      && (rhsValue instanceof CompileTimeInteger || rhsValue instanceof CompileTimeBool)
    ) {
      const result = Boolean(lhsValue.value) && Boolean(rhsValue.value);
      this.ctx.stack.push(new CompileTimeBool(result, node));
      return;
    }
    // we need to check the types if either of them are runtime
    if (
      (lhsValue instanceof RuntimeValue || rhsValue instanceof RuntimeValue)
      && (lhsValue.ty instanceof IntegerType || lhsValue.ty instanceof BoolType)
      && (rhsValue.ty instanceof IntegerType || rhsValue.ty instanceof BoolType)
    ) {
      const compiledLHS = this.ensureCompiled(lhsValue);
      const compiledRHS = this.ensureCompiled(rhsValue);

      const lhsNE0Name = this.program.LLVMUtil.lower(this.getTempName());
      const rhsNE0Name = this.program.LLVMUtil.lower(this.getTempName());

      // check if the value equals 0
      const lhsNE0 = this.LLVM._LLVMBuildICmp(
        this.builder,
        this.program.LLVMUtil.LLVMIntPredicate.Ne,
        compiledLHS.ref,
        this.LLVM._LLVMConstInt(lhsValue.ty.llvmType(this.LLVM, this.program.LLVMUtil)!, 0n, 0),
        lhsNE0Name
      );
      const rhsNE0 = this.LLVM._LLVMBuildICmp(
        this.builder,
        this.program.LLVMUtil.LLVMIntPredicate.Ne,
        compiledRHS.ref,
        this.LLVM._LLVMConstInt(rhsValue.ty.llvmType(this.LLVM, this.program.LLVMUtil)!, 0n, 0),
        rhsNE0Name
      );

      // next we need to cast to int1
      const lhsCastName = this.program.LLVMUtil.lower(this.getTempName());
      const rhsCastName = this.program.LLVMUtil.lower(this.getTempName());
      const boolType = new BoolType(null, node);
      const lhsCast = this.LLVM._LLVMBuildIntCast2(
        this.builder,
        lhsNE0,
        boolType.llvmType(this.LLVM, this.program.LLVMUtil)!,
        0,
        lhsCastName,
      );
      const rhsCast = this.LLVM._LLVMBuildIntCast2(
        this.builder,
        rhsNE0,
        boolType.llvmType(this.LLVM, this.program.LLVMUtil)!,
        0,
        rhsCastName,
      );

      // finally perform and
      const resultName = this.program.LLVMUtil.lower(this.getTempName());
      const result = this.LLVM._LLVMBuildAnd(
        this.builder,
        lhsCast,
        rhsCast,
        resultName
      );

      this.ctx.stack.push(new RuntimeValue(result, new BoolType(null, node)));
      this.LLVM._free(lhsNE0Name);
      this.LLVM._free(rhsNE0Name);
      this.LLVM._free(lhsCastName);
      this.LLVM._free(rhsCastName);
      this.LLVM._free(resultName);
      return;
    }
    

    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, `Operation not supported.`);
  }

  private compileLogicalOrExpression(node: BinaryExpression) {
    this.visit(node.lhs);
    const lhsValue = assert(this.ctx.stack.pop(), "LHS must exist on the stack.");
    this.visit(node.rhs);
    const rhsValue = assert(this.ctx.stack.pop(), "RHS must exist on the stack.");

    // If any values are invalid, the top of the stack should be invalid
    if (lhsValue instanceof CompileTimeInvalid || rhsValue instanceof CompileTimeInvalid) {
      this.ctx.stack.push(new CompileTimeInvalid(node));
      return;
    }

    // TODO: Body of logical or


    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, `Operation not supported.`);
  }
}
