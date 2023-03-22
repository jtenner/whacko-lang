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
  CompileTimeVoid,
  CompileTimeClassReference,
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
  LeftUnaryExpression,
  NewExpression,
  isClassDeclaration,
  ClassDeclaration,
  ConstructorClassMember,
  NamespaceDeclaration,
  isFieldClassMember,
  isConstructorClassMember,
  ThisLiteral,
  isThisLiteral,
  MethodClassMember,
  isMethodClassMember,
  // TypeCastExpression,
} from "../generated/ast";
import { WhackoModule } from "../module";
import {
  ArrayType,
  BoolType,
  BuiltinFunction,
  CLASS_HEADER_OFFSET,
  CompileTimeFieldReference,
  CompileTimeMethodReference,
  CompileTimeVariableReference,
  ConcreteClass,
  ConcreteFunction,
  ConcreteType,
  consumeDecorator,
  DynamicTypeScopeElement,
  Field,
  FloatType,
  FunctionType,
  getPtrWithOffset,
  getScope,
  IntegerEnumType,
  IntegerType,
  InvalidType,
  MethodType,
  NamespaceTypeScopeElement,
  PointerType,
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
import { getFileName, getRelativeFileName, getModule } from "./ModuleCollectionPass";
import { AstNode } from "langium";

export interface FunctionVisitParams {
  pass: CompilationPass;
}

export function obtainValue(expression: AstNode, pass: CompilationPass) {
  const length = pass.ctx.stack.length;
  pass.visit(expression);
  assert(pass.ctx.stack.length === length + 1, "Stack should only have a single value more on the stack... something went wrong.");
  return assert(pass.ctx.stack.pop(), "Value must exist on the stack at this point.");
}

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

export function getFullyQualifiedName(
  node: FunctionDeclaration | DeclareFunction | ClassDeclaration,
  typeParameters: ConcreteType[]
): string | null {
  let nodeName = node.name.name;
  let currentNode: AstNode = node;
  while (currentNode.$container) {
    const namespaceName = (currentNode.$container as NamespaceDeclaration)?.name?.name;
    if (namespaceName) {
      nodeName = namespaceName + "." + nodeName; 
    }
    currentNode = currentNode.$container;
  }

  if (isClassDeclaration(node)) {
    if (node.typeParameters.length === typeParameters.length) {
      return `${getRelativeFileName(node)}~${nodeName}${
        typeParameters.length
          ? "<" + typeParameters.map((e) => e.getName()) + ">"
          : ""
      }`;
    } else {
      return null;
    }
  } else if (isFunctionDeclaration(node)) {

    if (node.export && node.name.name === "main" && assert(getModule(node), "Module must be defined at this point").entry) {
      return "__main_void";
    }

    if (node.export && node.name.name === "_start" && assert(getModule(node), "Module must be defined at this point").entry) {
      return "_start";
    }

    if (node.typeParameters.length === typeParameters.length) {
      return `${getRelativeFileName(node)}~${nodeName}${
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
    return `${getRelativeFileName(node)}~${nodeName}`;
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
  node: FunctionDeclaration | ClassDeclaration | MethodClassMember;
  func: ConcreteFunction;
  typeParameters: ConcreteType[];
  module: WhackoModule;
  previsit: ((parms: FunctionVisitParams) => void) | null;
  postvisit: ((parms: FunctionVisitParams) => void) | null;
}

export class CompilationPass extends WhackoPass {
  ctx!: ExecutionContext;
  func!: ConcreteFunction;
  private entry!: LLVMBasicBlockRef;
  private currentBlock!: LLVMBasicBlockRef;
  builder!: LLVMBuilderRef;
  private compiledStringPtrs = new Map<string, LLVMValueRef>();
  cachedFunctions = new Map<string, ConcreteFunction>();
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
              if (node.name.name === "__main_void") {
                this.compileCallable(node, [], mod, []);
              } else {
                this.compileCallable(node, [], mod, [
                  ["target-features", "+simd128"]
                ]);
              }
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
  compileCallable(
    node: FunctionDeclaration | DeclareFunction | ClassDeclaration | MethodClassMember,
    typeParameters: ConcreteType[],
    module: WhackoModule,
    attributes: [string, string][],
    classType: ConcreteClass | null = null,
    previsit: ((previsitParams: FunctionVisitParams) => void) | null = null,
    postvisit: ((previsitParams: FunctionVisitParams) => void) | null = null,
  ): ConcreteFunction | null {
    const nodeTypeParameters = isFunctionDeclaration(node) || isClassDeclaration(node) || isMethodClassMember(node)
      ? node.typeParameters
      : [];
    let nodeParameters: Parameter[];
    let nodeReturnType!: ConcreteType;

    for (const decorator of node.decorators) {
      if (
        decorator.name.name === "attribute"
        && decorator.parameters.length === 2
        && isStringLiteral(decorator.parameters[0])
        && isStringLiteral(decorator.parameters[1])
      ) {
        attributes.push(decorator.parameters.map(e => (e as StringLiteral).value) as [string, string]);
      }
    }
    if (isClassDeclaration(node)) {
      // we are compiling a constructor that may or may not exist
      const constructorClassMember = (node.members.find(e => isConstructorClassMember(e)) ?? null) as ConstructorClassMember | null;
      if (constructorClassMember) {
        nodeParameters = constructorClassMember.parameters;
      } else {
        nodeParameters = [];
      }
      nodeReturnType = assert(classType, "The class type must be provided");
    } else {
      nodeParameters = node.parameters;
    }

    if (nodeTypeParameters?.length !== typeParameters.length) return null;

    let name: string;
    if (isMethodClassMember(node)) {
      console.log("Hit!");
      name = assert(classType, "Class should exist at this point.").getName()
        + "." 
        + node.name.name
        + (typeParameters.length ? `<${typeParameters.map(e => e.getName()).join(",")}>` : "");

    } else {
      name = getFullyQualifiedName(node, typeParameters)! + (isClassDeclaration(node) ? ".constructor" : "");
    }

    if (this.cachedFunctions.has(name)) return this.cachedFunctions.get(name)!;

    // splice the types into a map
    const map = isMethodClassMember(node)
      ? new Map(classType!.typeParameters)
      : new Map<string, ConcreteType>();

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
    const parameterNames = nodeParameters.map((e) => e.name.name);
    const parameterTypes = nodeParameters.map(
      (e) => this.ctx.resolve(e.type) ?? new InvalidType(e.type)
    );

    if (isFunctionDeclaration(node) || isDeclareFunction(node)) {
      nodeReturnType = this.ctx.resolve(node.returnType) ?? new InvalidType(node.returnType);
    } else if (isMethodClassMember(node)) {
      nodeReturnType = this.ctx.resolve(
        node.returnType,
        map,
        assert(getScope(node.returnType), "The scope must exist at this point")
      ) ?? new InvalidType(node.returnType);
    }

    nodeReturnType = assert(nodeReturnType, "Node return type must be defined at this point");

    // create the function/method type
    const funcType = isMethodClassMember(node)
      ? new MethodType(
        classType!,
        parameterTypes,
        parameterNames,
        nodeReturnType,
        node,
        node.name.name
      )
      : new FunctionType(
        parameterTypes,
        parameterNames,
        nodeReturnType,
        node,
        node.name.name
      );

    const llvmFuncType = funcType.llvmType(this.LLVM, this.program.LLVMUtil)!;
    const llvmFunc = this.LLVM._LLVMAddFunction(
      this.program.llvmModule,
      this.program.LLVMUtil.lower(name),
      llvmFuncType
    );
    const func = new ConcreteFunction(llvmFunc, funcType);

    if (isMethodClassMember(node)) {
      // first parameter is always this
      ctx.vars.set(
        "&self",
        new ExecutionVariable(
          true,
          "&self",
          new RuntimeValue(
            this.LLVM._LLVMGetParam(func.funcRef, 0),
            classType!,
          ),
          classType!,
        ),
      );
      // next we need to initialize the context with some parameter variables
      for (let i = 0; i < parameterNames.length; i++) {
        const parameterName = parameterNames[i];
        const parameterType = parameterTypes[i];
  
        // the rest of the parameters are at index + 1
        const ref = this.LLVM._LLVMGetParam(func.funcRef, i + 1);
  
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
    } else {
      // next we need to initialize the context with some parameter variables
      for (let i = 0; i < parameterNames.length; i++) {
        const parameterName = parameterNames[i];
        const parameterType = parameterTypes[i];
  
        const ref = this.LLVM._LLVMGetParam(func.funcRef, i);
  
        ctx.vars.set(
          parameterName,
          new ExecutionVariable(
            // self is always immutable
            parameterName === "&self",
            parameterName,
            new RuntimeValue(ref, parameterType),
            parameterType
          )
        );
      }
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

    if (isFunctionDeclaration(node) || isClassDeclaration(node) || isMethodClassMember(node)) {
      this.queue.push({
        ctx,
        func,
        node,
        typeParameters,
        module,
        previsit,
        postvisit,
      });
    }

    this.cachedFunctions.set(name, func);
    return func;
  }

  private queue: QueuedFunctionCompilation[] = [];

  private exhaustQueue() {
    while (true) {
      const { ctx, func, node, typeParameters, module, previsit, postvisit } = this.queue.pop()!;
      if (isFunctionDeclaration(node) || isClassDeclaration(node) || isMethodClassMember(node)) {
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

        if (previsit) previsit({ pass: this });
        if (isClassDeclaration(node)) {
          const constructorClassMember = (node as ClassDeclaration).members.find(e => isConstructorClassMember(e));

          if (constructorClassMember) {
            this.visit(constructorClassMember);
          }
        } else {
          this.visit(node);
        }

        if (postvisit) postvisit({ pass: this });

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
    const condition = assert(
      this.ctx.stack.pop(),
      "Condition must be on the stack."
    );

    if (condition instanceof CompileTimeVoid) {
      this.error(`Type`, node.condition, `Expression returns void, cannot be used as if condition.`);
      return;
    }

    if (
      condition instanceof CompileTimeBool ||
      condition instanceof CompileTimeInteger
    ) {
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
      !(compiledCondition.ty instanceof IntegerType) &&
      !(compiledCondition.ty instanceof BoolType)
    ) {
      this.error("Type", node, `Invalid conditional expression.`);
      return;
    }

    const truthyLabelName = this.program.LLVMUtil.lower(this.getTempName());
    const truthyLabel = this.LLVM._LLVMAppendBasicBlockInContext(
      this.program.llvmContext,
      this.func.funcRef,
      truthyLabelName
    );

    const falsyLabelName = this.program.LLVMUtil.lower(this.getTempName());
    const falsyLabel = this.LLVM._LLVMAppendBasicBlockInContext(
      this.program.llvmContext,
      this.func.funcRef,
      falsyLabelName
    );

    const nextLabelName = this.program.LLVMUtil.lower(this.getTempName());
    const nextLabel = this.LLVM._LLVMAppendBasicBlockInContext(
      this.program.llvmContext,
      this.func.funcRef,
      falsyLabelName
    );

    // now we can create the jump instruction
    this.LLVM._LLVMBuildCondBr(
      this.builder,
      compiledCondition.ref,
      truthyLabel,
      falsyLabel
    );

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

      if (value instanceof CompileTimeVoid) {
        this.error(`Type`, value.ty.node, `Function returns void, cannot assign void to variable.`);
        continue;
      }

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
    const scope = getScope(expression)!;

    if (isID(expression.root)) {
      const variable = this.ctx.vars.get(expression.root.name);

      if (variable) {
        this.ctx.stack.push(new CompileTimeVariableReference(variable));
      } else if (scope.has(expression.root.name)) {
        const scopeItem = scope.get(expression.root.name);
        if (scopeItem) {
          this.pushScopeItemToStack(scopeItem, expression);
        } else {
          this.ctx.stack.push(new CompileTimeInvalid(expression));
        }
      }
    } else if (isThisLiteral(expression.root)) {
      this.visitThisLiteral(expression.root);
    } else {
      console.error(expression.root);
      console.error(scope);
      // we didn't really find it
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
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
    } else if (isClassDeclaration(scopeItem.node)) {
      this.ctx.stack.push(new CompileTimeClassReference(scopeItem));
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
    } else if (rootValue.ty instanceof ConcreteClass) {
      // we should ensure the value is compiled
      const compiledRootValue = this.ensureCompiled(rootValue);
      const ref = compiledRootValue.ref;
      const ty = rootValue.ty as ConcreteClass;

      const fieldReference = ty.fields.find(e => e.name === node.member.name);

      if (fieldReference) {
        this.ctx.stack.push(new CompileTimeFieldReference(fieldReference, compiledRootValue.ref));
        return;
      }

      const methodElement = ty.element.members
        .find(e => e.$type === "MethodClassMember" && e.name.name === node.member.name) as MethodClassMember | undefined;

      if (methodElement) {
        this.ctx.stack.push(new CompileTimeMethodReference(methodElement, ty, ref));
        return;
      }
    }

    this.error("Semantic", node, `Member access not supported.`);
    this.ctx.stack.push(new CompileTimeInvalid(node));
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
            assert(
              returnType.llvmType(this.LLVM, this.program.LLVMUtil),
              "Must have valid LLVM type"
            )
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
      case "||":
        return this.compileLogicalExpression(node);
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
      const paramValue = this.ctx.stack.pop();
      const callParamaterValue = assert(
        paramValue,
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
      (callRootValue instanceof CompileTimeFunctionReference || callRootValue instanceof CompileTimeMethodReference) &&
      callTypeParameters.length === 0 &&
      ((callRootValue.value as ScopeTypeElement).node as FunctionDeclaration)
        .typeParameters.length > 0
    ) {
      const element = callRootValue.value as ScopeTypeElement;
      const functionDeclaration = element.node as FunctionDeclaration;

      outer: for (
        let i = 0;
        i < functionDeclaration.typeParameters.length;
        i++
      ) {
        // for each type parameter, we need to find a type provided by the signature
        const typeParameter = functionDeclaration.typeParameters[i];

        for (let j = 0; j < functionDeclaration.parameters.length; j++) {
          const parameter = functionDeclaration.parameters[j];
          if (
            isID(parameter.type) &&
            parameter.type.name === typeParameter.name
          ) {
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

    if (callRootValue instanceof CompileTimeMethodReference) {
      // we need to replace the type map
      assert(callRootValue.ty instanceof ConcreteClass, "The type must be a concrete class");
      splicedTypeMap = new Map((callRootValue.ty as ConcreteClass).typeParameters);
    }

    let functionToBeCompiled: FunctionDeclaration | DeclareFunction | MethodClassMember | null =
      null;
    let classType: ConcreteClass | null = null;
    let attributes: [string, string][] = [];
    let builtin: BuiltinFunction | null = null;

    if (callRootValue instanceof CompileTimeDeclareFunctionReference) {
      // type parameters are invalid for declare functions
      if (callTypeParameters.length > 0) {
        this.ctx.stack.push(new CompileTimeInvalid(node));
        this.error(
          "Semantic",
          node,
          "Calls to declared functions should have no type parameters."
        );
        return;
      }

      functionToBeCompiled = callRootValue.value.node as DeclareFunction;
      elementParameters = functionToBeCompiled.parameters;

      const nameDecorator = consumeDecorator(
        "name",
        functionToBeCompiled.decorators
      );
      attributes.push([
        "wasm-import-module",
        functionToBeCompiled.$container.namespace.value,
      ]);
      attributes.push([
        "wasm-import-name",
        // @ts-ignore
        (nameDecorator?.parameters[0] as StringLiteral)?.value ??
          functionToBeCompiled.name.name,
      ]);
    }

    if (callRootValue instanceof CompileTimeFunctionReference) {
      const element = callRootValue.value as ScopeTypeElement;

      if (element instanceof DynamicTypeScopeElement) {
        // type parameters are invalid for declare functions
        if (callTypeParameters.length !== element.typeParameters.length) {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error(
            "Semantic",
            node,
            "Type parameter count does not match signature."
          );
          return;
        }

        // add each type here to the new type map because they need to be re-used
        for (let i = 0; i < callTypeParameters.length; i++) {
          splicedTypeMap.set(element.typeParameters[i], callTypeParameters[i]);
        }
      } else {
        // static scope type elements don't have type parameters
        if (callTypeParameters.length > 0) {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error(
            "Semantic",
            node,
            "Calls to functions with no type parameters should have no type parameters."
          );
          return;
        }
      }

      functionToBeCompiled = element.node as FunctionDeclaration;
      elementParameters = functionToBeCompiled.parameters;
      builtin = element.builtin;
    }

    let selfParameter: LLVMValueRef = 0 as LLVMValueRef;
    if (callRootValue instanceof CompileTimeMethodReference) {
      functionToBeCompiled = callRootValue.value;
      classType = callRootValue.ty as ConcreteClass;
      elementParameters = functionToBeCompiled.parameters;
      selfParameter = callRootValue.ref;

      // add each type here to the new type map because they need to be re-used
      for (let i = 0; i < callTypeParameters.length; i++) {
        const name = functionToBeCompiled.typeParameters[i].name;
        splicedTypeMap.set(name, callTypeParameters[i]);
      }
    }
    
    if (elementParameters && functionToBeCompiled) {
      // we are good for parameter type checking
      for (let i = 0; i < elementParameters.length; i++) {
        const elementParameter = elementParameters[i];
        const scope = assert(getScope(elementParameter));
        const ty = this.ctx.resolve(
          elementParameter.type,
          splicedTypeMap,
          scope
        );
        if (ty) {
          if (!callParameterValues[i].ty.isAssignableTo(ty)) {
            this.ctx.stack.push(new CompileTimeInvalid(node));
            this.error(
              "Type",
              node,
              "Parameter is not assignable to expression type."
            );
            return;
          }
        } else {
          this.ctx.stack.push(new CompileTimeInvalid(elementParameter));
          this.error(
            "Type",
            elementParameter,
            "Could not resolve parameter type."
          );
          return;
        }
      }
      
      const returnType = this.ctx.resolve(
        functionToBeCompiled.returnType,
        splicedTypeMap,
        assert(getScope(functionToBeCompiled.returnType), "Scope must exist at this point."),
      );

      if (returnType instanceof InvalidType || returnType === null) {
        this.error(`Type`, functionToBeCompiled.returnType, `Invalid return type.`);
        this.ctx.stack.push(new CompileTimeInvalid(functionToBeCompiled.returnType));
        return;
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
        const last = assert(this.ctx.stack.at(-1), "There must be an item on the top.");
        if (!last.ty.isAssignableTo(returnType)) {
          this.error("Type", node, `Builtin call did not result in the expected type.`);
        }
        return;
      }

      // now that all the type checking is good, we can generate the llvm function
      const callable = this.compileCallable(
        functionToBeCompiled,
        callTypeParameters,
        assert(getModule(functionToBeCompiled), "Module must exist"),
        attributes,
        classType,
      );
      if (!callable) {
        console.log(classType);
      }
      const func = assert(
        callable,
        "The function should be compiled at this point."
      );

      let loweredExpressions;
      let loweredExpressionsLength: number = 0;
      if (selfParameter) {
        loweredExpressions = this.program.LLVMUtil.lowerPointerArray(
          [selfParameter].concat(
            callParameterValues.map((e) => this.ensureCompiled(e).ref)
          )
        );
        loweredExpressionsLength = callParameterValues.length + 1;
      } else {
        loweredExpressions = this.program.LLVMUtil.lowerPointerArray(
          callParameterValues.map((e) => this.ensureCompiled(e).ref)
        );
        loweredExpressionsLength = callParameterValues.length;
      }

      const name = this.program.LLVMUtil.lower(this.getTempName());
      
      // now that the function is garunteed to be compiled, we can make the llvm call
      const ref = this.LLVM._LLVMBuildCall2(
        this.builder,
        func.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
        func.funcRef,
        loweredExpressions,
        loweredExpressionsLength,
        func.ty.returnType instanceof VoidType ? (0 as LLVMStringRef) : name
      );
      this.LLVM._free(loweredExpressions);
      this.LLVM._free(name);
      //
      if (func.ty.returnType instanceof VoidType) {
        this.ctx.stack.push(new CompileTimeVoid(node));
      } else {
        this.ctx.stack.push(new RuntimeValue(ref, func.ty.returnType));
      }

      // this.LLVM._LLVMSetAlignment(ref, Number(func.ty.returnType.size));
      return;
    }

    if (functionToBeCompiled === null) {
      console.error(callRootValue);
    }

    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, "Call expression not supported.");
    // TODO: Redo calls because lots of things could be on the stack
  }

  private compileAssignmentExpression(node: BinaryExpression) {
    const lhs = obtainValue(node.lhs, this);
    const rhs = obtainValue(node.rhs, this);
    if (lhs instanceof CompileTimeFieldReference) {
      // we are performing a store
      
      const storePtr = getPtrWithOffset(lhs.ref, lhs.value.offset + CLASS_HEADER_OFFSET, this);
      const compiledRhs = this.ensureCompiled(rhs);

      if (compiledRhs.ty.isAssignableTo(lhs.ty)) {
        const stackElement = this.LLVM._LLVMBuildStore(this.builder, compiledRhs.ref, storePtr);
        this.ctx.stack.push(new RuntimeValue(stackElement, compiledRhs.ty));
      } else {
        this.error("Type", node.rhs, `Invalid rhs type, not assignable to field type.`);
        this.ctx.stack.push(compiledRhs);
      }
    } else if (lhs instanceof CompileTimeVariableReference) {
      const variable = lhs.value;
      const compiledRhs = this.ensureCompiled(rhs);
      if (variable.immutable) {
        // we can't support storing the variable
        this.error("Semantic", node.lhs, `Variable is immutable, cannot store value.`);
      } else {
        variable.value = compiledRhs;
      }
      this.ctx.stack.push(compiledRhs);
    } else {
      this.error("Semantic", node, `Operation is not supported.`);
      this.ctx.stack.push(new CompileTimeInvalid(node));
    }
  }

  private compileAdditionExpression(node: BinaryExpression) {
    // compile both sides and return the expressions
    super.visitBinaryExpression(node);
    // rhs is on top
    const rhs = this.ensureDereferenced(
      assert(this.ctx.stack.pop(), "Value must exist on the stack")
    );
    const lhs = this.ensureDereferenced(
      assert(this.ctx.stack.pop(), "Value must exist on the stack")
    );
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
    return "tmp" + (this.tmp++).toString() + "~";
  }

  override visitNewExpression(node: NewExpression): void {
    this.visit(node.expression);
    const classElement = assert(this.ctx.stack.pop(), "The class element must exist at this point.");
    if (classElement instanceof CompileTimeClassReference) {
      // we can resolve it!
      const scopeElement = classElement.value.node as ClassDeclaration;
      const constructorMember = scopeElement.members.find(e => e.$type === "ConstructorClassMember") as ConstructorClassMember;
      const constructorMemberParameters = constructorMember?.parameters ?? [];

      // evaluate the parameters
      const constructorParameterValues = [] as ExecutionContextValue[];
      for (const expression of node.parameters) {
        this.visit(expression);
        const value = assert(this.ctx.stack.pop(), "Paramater expression must exist on the stack.");
        constructorParameterValues.push(value);
      }

      if (constructorMemberParameters.length !== constructorParameterValues.length) {
        this.error("Semantic", node, "Constructor parameter count does match class signature.");
        this.ctx.stack.push(new CompileTimeInvalid(node));
        return;
      }

      // 
      const classParameterTypes = [] as ConcreteType[];
      for (const typeExpression of node.typeParameters) {
        const typeParameterType = this.ctx.resolve(typeExpression);
        if (typeParameterType) {
          classParameterTypes.push(typeParameterType);
        } else {
          this.error("Type", typeExpression, `Cannot resolve type.`);
          this.ctx.stack.push(new CompileTimeInvalid(typeExpression));
          return;
        }
      }

      if (
        constructorMember
          && node.typeParameters.length === 0
          && scopeElement.typeParameters.length > 0
      ) {
        // we need to infer the types potentially
        outer: for (let i = 0; i < scopeElement.typeParameters.length; i++) {
          const typeParameterName = scopeElement.typeParameters[i].name;
          for (let j = 0; j < constructorMemberParameters.length; j++) {
            const parameter = constructorMemberParameters[j];
            if (isID(parameter.type) && parameter.type.name === typeParameterName) {
              classParameterTypes.push(constructorParameterValues[j].ty);
              continue outer;
            }
          }

          // we didn't find it
          this.error("Type", scopeElement.typeParameters[i], `Cannot resolve type.`);
          this.ctx.stack.push(new CompileTimeInvalid(scopeElement.typeParameters[i]));
          return;
        }
      }

      // we can now validate type parameter length
      if (scopeElement.typeParameters.length !== classParameterTypes.length) {
        this.error("Semantic", node, `Type parameter count does not match class type parameter count.`);
        this.ctx.stack.push(new CompileTimeInvalid(node));
        return;
      }

      const classRef = this.createClass(scopeElement, classParameterTypes);
      if (classRef) {
        const constructorFunc = classRef.compileConstructor(this);

        if (constructorFunc) {
          const runtimeParameters = [] as RuntimeValue[];
          for (const value of constructorParameterValues) {
            runtimeParameters.push(this.ensureCompiled(value));
          }

          const argsPtr = this.program.LLVMUtil.lowerPointerArray(runtimeParameters.map(e => e.ref));
          const nameRef = this.getTempNameRef(); 
          // CompileCall2
          const callRef = this.LLVM._LLVMBuildCall2(
            this.builder,
            constructorFunc.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
            constructorFunc.funcRef,
            argsPtr,
            runtimeParameters.length,
            nameRef
          );

          this.LLVM._free(argsPtr);
          this.LLVM._free(nameRef);
          const resultValue = new RuntimeValue(callRef, constructorFunc.ty.returnType);
          this.ctx.stack.push(resultValue);
          return;
        }
      }
    }

    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, `Constructors are not supported.`);
  }

  cachedClasses = new Map<string, ConcreteClass>();

  createClass(element: ClassDeclaration, typeParameters: ConcreteType[]): ConcreteClass | null {
    if (element.typeParameters.length != typeParameters.length) {
      return null;
    }

    const name = getFullyQualifiedName(element, typeParameters);
    if (!name) return null;

    if (this.cachedClasses.has(name)) return this.cachedClasses.get(name)!;
    
    const typeMap = new Map<string, ConcreteType>();
    for (let i = 0; i < typeParameters.length; i++) {
      const typeParameter = typeParameters[i];
      const typeParameterName = element.typeParameters[i].name;
      if (typeParameter instanceof InvalidType) return null;
      typeMap.set(typeParameterName, typeParameter);
    }

    // for each field
    let runningOffset = 0n;
    const fields = [] as Field[];
    for (const member of element.members) {
      if (isFieldClassMember(member)) {
        const ty = this.ctx.resolve(member.type, typeMap, getScope(member)!);
        if (ty) {
          const field = new Field(member.name.name, member.initializer ?? null, ty, runningOffset);
          runningOffset += ty.size;
          fields.push(field);
        } else return null;
      }
    }

    const classRef = new ConcreteClass(typeMap, fields, element, runningOffset);
    return classRef;
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
            ref = this.LLVM._LLVMGetPoison(
              lhs.ty.llvmType(this.LLVM, this.program.LLVMUtil)!
            );
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

  ensureDereferenced(value: ExecutionContextValue): ExecutionContextValue {
    if (value instanceof CompileTimeVariableReference) {
      return value.value.value;
    } else if (value instanceof CompileTimeFieldReference) {
      return this.ensureCompiled(value);
    }
    return value;
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
      const hasCompiledString = this.compiledStringPtrs.has(value.value);
      let constStrArray: LLVMValueRef;

      if (hasCompiledString) {
        constStrArray = this.compiledStringPtrs.get(value.value)!;
      } else {
        const lowered = this.program.LLVMUtil.lower(value.value);
        const inst = this.LLVM._LLVMBuildGlobalStringPtr(
          this.builder,
          lowered,
          lowered
        );
        this.compiledStringPtrs.set(value.value, inst);
        this.LLVM._free(lowered);
        constStrArray = inst;
      }

      const byteLength = Buffer.byteLength(value.value);
      const charType = new IntegerType(Type.i8, null, value.ty.node);
      const int32Type = new IntegerType(Type.i32, null, value.ty.node);
      const charPointerType = new PointerType(charType, value.ty.node);
      const arrayType = new ArrayType(charType, byteLength, value.ty.node, "");
      const arrayLength = this.LLVM._LLVMConstInt(
        int32Type.llvmType(this.LLVM, this.program.LLVMUtil)!,
        BigInt(byteLength),
        0
      );
      // Steps:
      // 1. malloc array of proper length
      // 2. bitcast result to char*
      // 3. perform memcopy
      // 4. push runtime value on stack 

      // MALLOC

      const resultPtrName = this.getTempNameRef();
      const resultPtr = this.LLVM._LLVMBuildArrayMalloc(
        this.builder,
        arrayType.llvmType(this.LLVM, this.program.LLVMUtil)!,
        arrayLength,
        resultPtrName,
      );
      this.LLVM._free(resultPtr);


      // memcopy
      const memcpy = this.LLVM._LLVMBuildMemCpy(
        this.builder,
        resultPtr,
        1,
        constStrArray,
        1,
        arrayLength,
      );

      return new RuntimeValue(resultPtr, new StringType(null, value.ty.node));
    } else if (value instanceof CompileTimeBool) {
      const ref = this.LLVM._LLVMConstInt(
        value.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
        value.value ? 1n : 0n,
        0
      );
      return new RuntimeValue(ref, new BoolType(null, value.ty.node));
    } else if (value instanceof CompileTimeVariableReference) {
      return this.ensureCompiled(value.value.value);
    } else if (value instanceof CompileTimeFieldReference) {
      // we need to create a load here and push it to the stack
      const field = value.value;
      const offset = getPtrWithOffset(value.ref, field.offset + CLASS_HEADER_OFFSET, this);
      const name = this.getTempNameRef();
      const ref = this.LLVM._LLVMBuildLoad2(
        this.builder,
        field.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
        offset,
        name,
      );
      this.LLVM._free(name);
      return new RuntimeValue(ref, field.ty);
    }
  
    this.error(
      "Type",
      value.ty.node,
      `Cannot ensure expression is compiled, expression is not supported.`
    );
    return new RuntimeValue(
      this.LLVM._LLVMGetPoison(
        value.ty.llvmType(this.LLVM, this.program.LLVMUtil)!
      ),
      value.ty
    );
  }

  override visitTrueLiteral(expression: TrueLiteral): void {
    this.ctx.stack.push(new CompileTimeBool(true, expression));
  }

  override visitFalseLiteral(expression: FalseLiteral): void {
    this.ctx.stack.push(new CompileTimeBool(false, expression));
  }

  private compileLogicalExpression(node: BinaryExpression) {
    this.visit(node.lhs);
    const lhsValue = assert(
      this.ctx.stack.pop(),
      "LHS must exist on the stack."
    );
    this.visit(node.rhs);
    const rhsValue = assert(
      this.ctx.stack.pop(),
      "RHS must exist on the stack."
    );
    // If any values are invalid, the top of the stack should be invalid
    if (
      lhsValue instanceof CompileTimeInvalid ||
      rhsValue instanceof CompileTimeInvalid
    ) {
      this.ctx.stack.push(new CompileTimeInvalid(node));
      return;
    }

    if (
      (lhsValue instanceof CompileTimeInteger ||
        lhsValue instanceof CompileTimeBool) &&
      (rhsValue instanceof CompileTimeInteger ||
        rhsValue instanceof CompileTimeBool)
    ) {
      let result: boolean;
      switch (node.op) {
        case "&&":
          result = Boolean(lhsValue.value) && Boolean(rhsValue.value);
          break;
        case "||":
          result = Boolean(lhsValue.value) || Boolean(rhsValue.value);
          break;
        default: {
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error("Semantic", node, `Operation not supported.`);
          return;
        }
      }
      this.ctx.stack.push(new CompileTimeBool(result, node));
      return;
    }
    // we need to check the types if either of them are runtime
    if (
      (lhsValue instanceof RuntimeValue || rhsValue instanceof RuntimeValue) &&
      (lhsValue.ty instanceof IntegerType || lhsValue.ty instanceof BoolType) &&
      (rhsValue.ty instanceof IntegerType || rhsValue.ty instanceof BoolType)
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
        this.LLVM._LLVMConstInt(
          lhsValue.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
          0n,
          0
        ),
        lhsNE0Name
      );
      const rhsNE0 = this.LLVM._LLVMBuildICmp(
        this.builder,
        this.program.LLVMUtil.LLVMIntPredicate.Ne,
        compiledRHS.ref,
        this.LLVM._LLVMConstInt(
          rhsValue.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
          0n,
          0
        ),
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
        lhsCastName
      );
      const rhsCast = this.LLVM._LLVMBuildIntCast2(
        this.builder,
        rhsNE0,
        boolType.llvmType(this.LLVM, this.program.LLVMUtil)!,
        0,
        rhsCastName
      );

      // finally perform and
      const resultName = this.program.LLVMUtil.lower(this.getTempName());
      let result: LLVMValueRef;
      switch (node.op) {
        case "&&": {
          result = this.LLVM._LLVMBuildAnd(
            this.builder,
            lhsCast,
            rhsCast,
            resultName
          );
          break;
        }
        case "||": {
          result = this.LLVM._LLVMBuildOr(
            this.builder,
            lhsCast,
            rhsCast,
            resultName
          );
          break;
        }
        default:
          this.ctx.stack.push(new CompileTimeInvalid(node));
          this.error("Semantic", node, `Operation not supported.`);
          return;
        // not supported!
      }

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

  override visitStringLiteral(expression: StringLiteral): void {
    this.ctx.stack.push(new CompileTimeString(expression.value, expression));
  }

  override visitLeftUnaryExpression(node: LeftUnaryExpression): void {
    this.visit(node.expression);
    const expr = assert(this.ctx.stack.pop(), "Expression must exist at this point.");
    switch (node.op) {
      case "!": return this.compileLogicalNotExpression(node, expr);
    }

    this.error(`Type`, node, "Operation not supported.");
    this.ctx.stack.push(new CompileTimeInvalid(node));
  }

  override visitThisLiteral(expression: ThisLiteral): void {
    const self = this.ctx.vars.get("&self");
    if (self) {
      this.ctx.stack.push(new CompileTimeVariableReference(self));
    } else {
      this.error("Semantic", expression, `Cannot access this outside of a class context.`);
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  compileLogicalNotExpression(node: LeftUnaryExpression, expr: ExecutionContextValue) {
    if (expr instanceof CompileTimeBool) {
      this.ctx.stack.push(new CompileTimeBool(!expr.value, node));
    } else if (expr instanceof RuntimeValue && expr.ty instanceof BoolType) {
      const notName = this.program.LLVMUtil.lower(this.getTempName());
      const notRef = this.LLVM._LLVMBuildNot(this.builder, expr.ref, notName);
      this.LLVM._free(notName);
      this.ctx.stack.push(new RuntimeValue(notRef, new BoolType(null, node)));
    } else {
      this.error(`Type`, node, "Operation not supported.");
      this.ctx.stack.push(new CompileTimeInvalid(node));
    }
  }

  getTempNameRef(): LLVMStringRef {
    return this.program.LLVMUtil.lower(this.getTempName());
  }
  // override visitTypeCastExpression(node: TypeCastExpression): void {
  //   this.visit(node.expression);
  //   const value = assert(this.ctx.stack.pop(), "Value must be on the stack.");
  //   const type = this.ctx.resolve(node.type);
  //   if (type && value.ty.isAssignableTo(type)) {
  //     // TODO: compile time casting, simd casting
  //     
  //   }
  //   this.ctx.stack.push(new CompileTimeInvalid(node));
  //   this.error("Type", node, "Invalid cast.");
  //   
  // }
}
