import { assert, logNode } from "../util";
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
  resolveEnum,
  CompileTimeEnumReference,
  CompileTimeExternReference,
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
  ID,
  isEnumDeclaration,
  EnumDeclaration,
  TernaryExpression,
  ArrayAccessExpression,
  isExternDeclaration,
  ExternDeclaration,
  isParameter,
  isVariableDeclarator,
  ClassMember,
  SuperLiteral,
  isSuperLiteral,
  // TypeCastExpression,
} from "../generated/ast";
import { WhackoModule } from "../module";
import {
  ArrayType,
  BoolType,
  BuiltinFunction,
  CLASS_HEADER_OFFSET,
  CompileTimeArrayAccessReference,
  CompileTimeFieldReference,
  CompileTimeMethodReference,
  CompileTimeSuperReference,
  CompileTimeVariableReference,
  ConcreteClass,
  ConcreteFunction,
  ConcreteType,
  consumeDecorator,
  DynamicTypeScopeElement,
  EnumType,
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
import { ScopeCollectionPass } from "./ScopeCollectionPass";

export interface FunctionVisitParams {
  pass: CompilationPass;
  func: ConcreteFunction;
}


export function getIntegerPredicate(node: BinaryExpression, signed: boolean, pass: CompilationPass) {
  if (signed) {
    switch (node.op) {
      case ">":  return pass.program.LLVMUtil.LLVMIntPredicate.Sgt;
      case "_<":  return pass.program.LLVMUtil.LLVMIntPredicate.Slt;
      case "_<=": return pass.program.LLVMUtil.LLVMIntPredicate.Sle;
      case ">=": return pass.program.LLVMUtil.LLVMIntPredicate.Sge;
      case "==": return pass.program.LLVMUtil.LLVMIntPredicate.Eq;
      case "!=": return pass.program.LLVMUtil.LLVMIntPredicate.Ne;
    }
  } else {
    switch (node.op) {
      case ">":  return pass.program.LLVMUtil.LLVMIntPredicate.Ugt;
      case "_<":  return pass.program.LLVMUtil.LLVMIntPredicate.Ult;
      case "_<=": return pass.program.LLVMUtil.LLVMIntPredicate.Ule;
      case ">=": return pass.program.LLVMUtil.LLVMIntPredicate.Uge;
      case "==": return pass.program.LLVMUtil.LLVMIntPredicate.Eq;
      case "!=": return pass.program.LLVMUtil.LLVMIntPredicate.Ne;
    }
  }

  throw new Error("Invalid integer predicate.");
}

export function getRealPredicate(node: BinaryExpression, pass: CompilationPass) {
  switch (node.op) {
    case ">":  return pass.program.LLVMUtil.LLVMRealPredicate.Ogt;
    case "_<":  return pass.program.LLVMUtil.LLVMRealPredicate.Olt;
    case "_<=": return pass.program.LLVMUtil.LLVMRealPredicate.Ole;
    case ">=": return pass.program.LLVMUtil.LLVMRealPredicate.Oge;
    case "==": return pass.program.LLVMUtil.LLVMRealPredicate.Oeq;
    case "!=": return pass.program.LLVMUtil.LLVMRealPredicate.One;
  }
  throw new Error("Invalid real predicate.");
}

export function getBoolPredicate(node: BinaryExpression, pass: CompilationPass) {
  switch (node.op) {
    case "!=": return pass.program.LLVMUtil.LLVMIntPredicate.Ne;
    case "==": return pass.program.LLVMUtil.LLVMIntPredicate.Eq;
  }
  throw new Error("Invalid bool predicate.");
}

export function obtainValue(expression: AstNode, pass: CompilationPass) {
  const length = pass.ctx.stack.length;
  pass.visit(expression);
  if (pass.ctx.stack.length !== length + 1) {
    assert(false, "Stack should only have a single value more on the stack... something went wrong.");
  }
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
  node: FunctionDeclaration | DeclareFunction | ClassDeclaration | EnumDeclaration | ExternDeclaration,
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
  } else if (isDeclareFunction(node) || isEnumDeclaration(node) || isExternDeclaration(node)) {
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
    node: FunctionDeclaration | DeclareFunction | ClassDeclaration | MethodClassMember | ExternDeclaration,
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

    if (nodeTypeParameters.length !== typeParameters.length) {
      return null;
    }

    let name: string;
    if (isMethodClassMember(node)) {
      name = assert(classType, "Class should exist at this point.").getName()
        + "." 
        + node.name.name
        + (typeParameters.length ? `<${typeParameters.map(e => e.getName()).join(",")}>` : "");

    } else if (isExternDeclaration(node)) {
      const nameDecorator = consumeDecorator("name", node.decorators);
      if (nameDecorator && nameDecorator.parameters[0] && isStringLiteral(nameDecorator.parameters[0])) {
        name = nameDecorator.parameters[0].value
      } else {
        name = node.name.name;
      } 
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
      this,
      assert(getScope(node), "Scope must exist at this point"),
      map
    );
    
    // We need to evaluate the current function based on the current type parameters.
    // We also need to compile a function with the correct signature.
    // This requires getting the llvm types and parameter types for this function.
    const parameterNames = nodeParameters.map((e) => e.name.name);
    const parameterTypes = nodeParameters.map(
      (e) => this.ctx.resolve(e.type) ?? new InvalidType(e.type)
    );

    if (isFunctionDeclaration(node) || isDeclareFunction(node) || isExternDeclaration(node)) {
      nodeReturnType = ctx.resolve(node.returnType) ?? new InvalidType(node.returnType);
    } else if (isMethodClassMember(node)) {
      nodeReturnType = ctx.resolve(
        node.returnType,
        map,
        assert(getScope(node.returnType), "The scope must exist at this point")
      ) ?? new InvalidType(node.returnType);
    }

    nodeReturnType = assert(nodeReturnType, "Node return type must be defined at this point");

    // create the function/method type
    const funcType = isMethodClassMember(node) || isClassDeclaration(node)
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
      ctx.self = new ExecutionVariable(
        true,
        "&self",
        new RuntimeValue(
          this.LLVM._LLVMGetParam(func.funcRef, 0),
          classType!,
        ),
        classType!
      );
      // next we need to initialize the context with some parameter variables
      for (let i = 0; i < parameterNames.length; i++) {
        const parameter = nodeParameters[i];
        const parameterName = parameterNames[i];
        const parameterType = parameterTypes[i];
  
        // the rest of the parameters are at index + 1
        const ref = this.LLVM._LLVMGetParam(func.funcRef, i + 1);
  
        ctx.vars.set(
          parameter,
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
        const parameter = nodeParameters[i];
        const parameterName = parameterNames[i];
        const parameterType = parameterTypes[i];
  
        const ref = this.LLVM._LLVMGetParam(func.funcRef, i);
  
        ctx.vars.set(
          parameter,
          new ExecutionVariable(
            // self is always immutable
            false,
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

        

        if (isClassDeclaration(node)) {
          const constructorClassMember = (node as ClassDeclaration).members.find(e => isConstructorClassMember(e));
          // then we need to stack allocate for each field that requires some form of stack allocation
          const pass = new ScopeCollectionPass(this.program, this.ctx, this);

          // visit each member and visit the initializers if they exist to create some stack allocations for these expressions
          for (const member of node.members) {
            if (isFieldClassMember(member) && member.initializer) {
              pass.visit(member.initializer);
            }
          }
          // then visit the constructor if it exists
          if (constructorClassMember) pass.visit(constructorClassMember);
          // finally we can previsit 
          if (previsit) previsit({ pass: this, func });
          // .. and visit the constructor
          if (constructorClassMember) this.visit(constructorClassMember);
        } else {
          if (previsit) previsit({ pass: this, func });
          this.visit(node);
        }

        if (postvisit) postvisit({ pass: this, func });

        // if the function return type is void, we can add an implicit return void to the end of the current block
        if (isFunctionDeclaration(node) || isMethodClassMember(node)) {
          const terminator = this.LLVM._LLVMGetBasicBlockTerminator(this.currentBlock);
          if (!terminator && func.ty.returnType instanceof VoidType) {
            this.LLVM._LLVMBuildRetVoid(this.builder);
          }
        }

        if (this.queue.length === 0) break;
      } else if (isDeclareDeclaration(node)) {
        // TODO: Is there anything here we need to do?
      }
    }
  }

  override visitExpressionStatement(node: ExpressionStatement): void {
    this.visit(node.expression);
    assert(this.ctx.stack.length === 1, "There should be an item on the stack.");
    this.ctx.stack.pop();
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    const pass = new ScopeCollectionPass(this.program, this.ctx, this);
    pass.visit(node);
    super.visitFunctionDeclaration(node);
  }

  override visitMethodClassMember(node: MethodClassMember): void {
    const pass = new ScopeCollectionPass(this.program, this.ctx, this);
    pass.visit(node);
    super.visitMethodClassMember(node);
  }

  override visitIfElseStatement(node: IfElseStatement): void {
    // this.LLVM._LLVMBuildBr()
    const condition = this.ensureDereferenced(obtainValue(node.condition, this));

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
    this.currentBlock = truthyLabel;
    this.visit(node.truthy);
    this.LLVM._LLVMBuildBr(this.builder, nextLabel);

    // finally if there is a falsy statement, we compile it
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, falsyLabel);
    this.currentBlock = falsyLabel;
    if (node.falsy) this.visit(node.falsy);
    this.LLVM._LLVMBuildBr(this.builder, nextLabel);

    // finally start compiling the next block
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, nextLabel);
    this.currentBlock = nextLabel;
    this.LLVM._free(truthyLabelName);
    this.LLVM._free(falsyLabelName);
    this.LLVM._free(nextLabelName);
  }

  override visitVariableDeclarationStatement(
    node: VariableDeclarationStatement
  ): void {
    const { immutable, declarators } = node;
    for (let i = 0; i < declarators.length; i++) {
      const declarator = declarators[i];
      const { expression, name, type } = declarator;

      // the var should exist, but be unset
      const variable = assert(this.ctx.vars.get(declarator), "The variable must exist at this point.");

      if (variable.set) {
        // if it already exists, and has been set....
        this.error(
          "Semantic",
          name,
          `Element ${name.name} is already defined.`
        );
        continue;
      }
      variable.set = true;

      // we should always visit the expression
      const value = this.ensureDereferenced(obtainValue(expression, this));

      if (value instanceof CompileTimeVoid) {
        this.error(`Type`, value.ty.node, `Function returns void, cannot assign void to variable.`);
        continue;
      }
      let success = true;
      if (type) {
        const variableType = this.ctx.resolve(type);
        if (variableType) {
          if (value.ty.isAssignableTo(variableType!)) {
            // good we can store the variable
            variable.value = immutable ? value : this.ensureCompiled(value)
          } else {
            // bad, we store a compiletime invalid with the variableType
            const invalid = new CompileTimeInvalid(expression);
            variable.ty = variableType;
            variable.value = invalid;
            this.error("Type", type, "Invalid type, not assignable to variable type.");
            success = false;
          }
        } else {
          // bad, we couldn't resolve the type, set the variable to compile time invalid
          const invalid = new CompileTimeInvalid(expression);
          variable.ty = invalid.ty;
          variable.value = invalid;
          this.error("Type", type, "Invalid type expression for variable declaration.");
          success = false;
        }
      } else {
        // good, no type guard, assume the variable's type is equal to the expression's
        variable.value = immutable ? value : this.ensureCompiled(value);
        variable.ty = variable.value.ty;
      }

      if (success && !immutable) {
        assert(variable.value instanceof RuntimeValue, "Variable value must be a runtime value by now.");
        this.LLVM._LLVMBuildStore(
          this.builder,
          (variable.value as RuntimeValue).ref,
          variable.ptr!
        );
      }
    }
  }

  override visitFloatLiteral(expression: FloatLiteral): void {
    const floatValue = parseFloat(expression.value);
    this.ctx.stack.push(new CompileTimeFloat(floatValue, new FloatType(Type.f64, floatValue, expression)));
  }

  override visitRootIdentifier(expression: RootIdentifier): void {
    const scope = assert(getScope(expression), "The scope for this expression must exist.");
    if (isID(expression.root)) {
      const scopeItem = scope.get(expression.root.name);
      
      if (scopeItem) {
        this.pushScopeItemToStack(scopeItem, expression);
      } else {
        this.error("Semantic", expression, "Cannot find root expression.");
        this.ctx.stack.push(new CompileTimeInvalid(expression));
      }
    } else if (isThisLiteral(expression.root)) {
      this.visitThisLiteral(expression.root);
    } else if (isSuperLiteral(expression.root)) {
      this.visitSuperLiteral(expression.root);
    } else {
      // we didn't really find it
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  private pushScopeItemToStack(scopeItem: ScopeElement, expression: AstNode) {
    if (isParameter(scopeItem.node) || isVariableDeclarator(scopeItem.node)) {
      const variable = assert(this.ctx.getVariable(scopeItem.node), "The scope variable for this node must exist.");
      this.ctx.stack.push(new CompileTimeVariableReference(variable));
    } else if (isBuiltinDeclaration(scopeItem.node)) {
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
    } else if (isEnumDeclaration(scopeItem.node)) {
      this.ctx.stack.push(new CompileTimeEnumReference(scopeItem));
    } else if (isExternDeclaration(scopeItem.node)) {
      this.ctx.stack.push(new CompileTimeExternReference(scopeItem));
    } else {
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  override visitMemberAccessExpression(node: MemberAccessExpression): void {
    const rootValue = obtainValue(node.memberRoot, this);
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
      }

      return;
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

      const methodElement = ty.getMethodByName(node.member.name);

      if (methodElement) {
        this.ctx.stack.push(new CompileTimeMethodReference(methodElement, ty, ref));
        return;
      }
    } else if (rootValue instanceof CompileTimeEnumReference) {
      const name = node.member.name;
      // we need to push the compile time constant to the stack


      if ((rootValue.ty as EnumType).values.has(name)) {
        const enumMember = (rootValue.ty as EnumType).values.get(name)!;
        this.ctx.stack.push(new CompileTimeInteger(enumMember, rootValue.ty as EnumType));
      } else {
        this.ctx.stack.push(new CompileTimeInvalid(node.member));
        this.error("Semantic", node.member, `Cannot find enum member ${node.member.name} in ${(node.memberRoot.root as ID).name}`);
      }
      return;
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
        const compiledValue = this.ensureCompiled(obtainValue(node.expression, this));
        if (compiledValue.ty.isAssignableTo(returnType)) {
          this.LLVM._LLVMBuildRet(this.builder, compiledValue.ref);
        } else {
          logNode(node.expression);
          console.log(compiledValue);
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
    // we need to visit both sides and compile them to some kind of reference/value
    const lhs = obtainValue(node.lhs, this);
    // we always want to dereference the rhs, because we need to operate on deref values
    const rhs = this.ensureDereferenced(obtainValue(node.rhs, this));

    // first, we need to make sure that both sides are assignable to each other
    if (lhs.ty.isNumeric && !lhs.ty.isAssignableTo(rhs.ty)) {
      // uhoh, binary expressions require assignability if the lhs is numeric
      this.ctx.stack.push(new CompileTimeInvalid(node));
      this.error("Type", node, `Operation not supported, lhs and rhs binary operators are not assignable to each other.`);
      return;
    }

    let value: ExecutionContextValue | null = null;

    switch (node.op) {
      case "!=":
      case "%":
      case "%=":
      case "&":
      case "&&":
      case "&&=":
      case "&=":
      case "*":
      case "**":
      case "**=":
      case "*=":
      case "+":
      case "+=":
      case "-":
      case "-=":
      case "/":
      case "/=":
      case "_<":
      case "<<":
      case "<<=":
      case ">>>":
      case ">>>=":
      case "_<=":
      case "==":
      case ">":  
      case ">=":  
      case ">>":  
      case ">>=":
      case "^":
      case "^=":
      case "|":
      case "|=":
      case "||":
      case "||=":
        value = this.compileBinaryExpression(
          node,
          this.ensureDereferenced(lhs),
          rhs
        );
        break;
      case "=":
        value = rhs;
        break;
    }

    // if the value cannot be calculated because we don't support the operator...
    // then we need to invalidate the stack
    if (!value) {
      this.ctx.stack.push(new CompileTimeInvalid(node));
      this.error("Semantic", node, `Binary expression not supported.`);
      return;
    }

    // if we are an assignment operator we need to perform the assignment
    switch (node.op) {
      case "%=":
      case "&&=":
      case "&=":
      case "**=":
      case "*=":
      case "+=":
      case "-=":
      case "*=":
      case "/=":
      case "<<=":
      case ">>=":
      case "=":
      case "^=":
      case "|=":
      case "||=":
        this.compileAssignmentExpression(node, lhs, value);
    }

    // finally push value to the stack
    this.ctx.stack.push(value);
  }

  compileAssignmentExpression(node: AstNode, lhs: ExecutionContextValue, value: ExecutionContextValue) {
    if (lhs instanceof CompileTimeArrayAccessReference) {
      const ty = lhs.ty as ConcreteClass;
      assert(ty instanceof ConcreteClass, "The type of the array access expression must be a class.");

      const method = ty.getOperatorMethod("[]=");
      
      if (method) {
        if (method.typeParameters.length === 0 && method.parameters.length === 2) {
          // we are now safe to compile the method
          const func = assert(
            this.compileCallable(
              method,
              [],
              assert(getModule(method), "The module must exist at this point."),
              [],
              ty
            ),
            "The function must be compilable at this point."
          );

          assert(func.ty instanceof MethodType);
          const methodType = func.ty as MethodType;
          const root = lhs.root;
          const index = lhs.value;
          const compiledValue = this.ensureCompiled(value);

          if (methodType.returnType instanceof VoidType) {
            const callRefName = this.getTempNameRef();
            const loweredExpressions = this.program.LLVMUtil.lowerPointerArray([root.ref, index.ref, compiledValue.ref]);
            this.LLVM._LLVMBuildCall2(
              this.builder,
              methodType.llvmType(this.LLVM, this.program.LLVMUtil)!,
              func.funcRef,
              loweredExpressions,
              3,
              0 as LLVMStringRef
            );
            this.LLVM._free(callRefName);
            // this.LLVM._free(loweredExpressions);
          } else {
            this.error("Semnatic", node, `Assignment operator must return void.`);
          }
        } else {
          this.error("Sematic", node, `Assignment operator must have no generic type parameters, and only a single parameter.`);
        }
      } else {
        this.error("Sematic", node, `Cannot assign to class reference with no assignment operator.`);
      }
    } else if (lhs instanceof CompileTimeVariableReference) {
      const variable = lhs.value;
      if (variable.immutable) {
        this.error("Sematic", node, `Cannot assign to immutable variable.`);
      } else {
        const variableType = assert(variable.ty, "The variable type must be set.");
        if (value.ty.isAssignableTo(variableType)) {
          // we can actually perform the assignment
          variable.value = value;
          this.LLVM._LLVMBuildStore(
            this.builder,
            this.ensureCompiled(value).ref,
            variable.ptr!
          );
        } else {
          this.error("Type", node, `Cannot assign to variable ${variable.name}, invalid type.`);
        }
      }
    } else if (lhs instanceof CompileTimeFieldReference) {
      if (value.ty.isAssignableTo(lhs.value.ty)) {
        const compiledValue = this.ensureCompiled(value);
        // we can generate the store at the given offset
        this.LLVM._LLVMBuildStore(
          this.builder,
          compiledValue.ref,
          getPtrWithOffset(lhs.ref, CLASS_HEADER_OFFSET + lhs.value.offset, this),
        );
      } else {
        this.error("Type", node, `Cannot assign to property ${lhs.value.name}, invalid type.`);
      }
    } else {
      // TODO: Fix this
      this.error("Semantic", node, `Invalid left hand assignment, operation not supported.`);
    }
  }

  compileBinaryExpression(node: BinaryExpression, lhs: ExecutionContextValue, rhs: ExecutionContextValue): ExecutionContextValue {
    if (lhs.ty instanceof FloatType && rhs.ty instanceof FloatType) return this.compileBinaryFloatExpression(node, lhs, rhs);
    if (lhs.ty instanceof IntegerType && rhs.ty instanceof IntegerType) return this.compileBinaryIntegerExpression(node, lhs, rhs);
    if (lhs.ty instanceof BoolType && rhs.ty instanceof BoolType) return this.compileBinaryBoolExpression(node, lhs, rhs);
    if (lhs.ty instanceof ConcreteClass && rhs.ty instanceof ConcreteClass) return this.compileBinaryClassOverloadExpression(node, lhs, rhs);
    
    // TODO: Support operator overloads
    this.error("Type", node, `Invalid binary expression, operator not supported for this type.`);
    // This operation is not supported
    return new CompileTimeInvalid(node); 
  }

  compileBinaryClassOverloadExpression(node: BinaryExpression, lhs: ExecutionContextValue, rhs: ExecutionContextValue): ExecutionContextValue {
    this.error("Type", node, `Cannot compile operator ${node.op} for class ${lhs.ty.getName()}`);
    return new CompileTimeInvalid(node);
  }

  compileBinaryBoolExpression(node: BinaryExpression, lhs: ExecutionContextValue, rhs: ExecutionContextValue): ExecutionContextValue {
    assert(lhs.ty instanceof BoolType, "LHS must be bool type");
    assert(rhs.ty instanceof BoolType, "RHS must be bool type");

    // the types are equal!
    if (lhs instanceof CompileTimeBool && rhs instanceof CompileTimeBool) {
      let value: boolean | null = null;

      switch (node.op) {
        case "!=": value = lhs.value !== rhs.value; break;
        case "==": value = lhs.value === rhs.value; break;
        case "|":
        case "|=":
        case "||":
        case "||=": value = lhs.value || rhs.value; break;
        case "&":
        case "&=":
        case "&&":
        case "&&=": value = lhs.value && rhs.value; break;
      }

      if (value === null) {
        this.error("Type", node, `Invalid compile time bool operation.`);
        return new CompileTimeInvalid(node);
      }
      return new CompileTimeBool(value, node);
    }

    // TODO: Short circuit compile with some assumptions if either side is a compile time bool
    
    lhs = this.ensureCompiled(lhs);
    rhs = this.ensureCompiled(rhs);
    let operation: LLVMValueRef | null = null;
    const name = this.getTempNameRef();

    switch (node.op) {
      case "!=": 
      case "==":
        operation = this.LLVM._LLVMBuildICmp(
          this.builder,
          getBoolPredicate(node, this),
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case "|":
      case "|=":
        operation = this.LLVM._LLVMBuildOr(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case "&":
      case "&=":
        operation = this.LLVM._LLVMBuildAnd(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
    }

    this.LLVM._free(name);

    if (operation === null) {
      this.error("Type", node, `Invalid runtime bool operation.`);
      return new CompileTimeInvalid(node);
    }

    return new RuntimeValue(operation, new BoolType(null, node));
  }

  compileBinaryFloatExpression(node: BinaryExpression, lhs: ExecutionContextValue, rhs: ExecutionContextValue): ExecutionContextValue {
    // some things that need to be checked
    assert(lhs.ty instanceof FloatType, "LHS must be float type.");
    assert(rhs.ty instanceof FloatType, "RHS must be float type.");
    assert(lhs.ty.ty === rhs.ty.ty, "The float types must be equal at this point.");
  
    // we can perform a compile time operation
    if (lhs instanceof CompileTimeFloat && rhs instanceof CompileTimeFloat) {
      let value: number | null = null;
      switch (node.op) {
        case ">": return new CompileTimeBool(lhs.value > rhs.value, node);
        case "_<": return new CompileTimeBool(lhs.value < rhs.value, node);
        case "_<=": return new CompileTimeBool(lhs.value <= rhs.value, node);
        case ">=": return new CompileTimeBool(lhs.value >= rhs.value, node);
        case "==": return new CompileTimeBool(lhs.value == rhs.value, node);
        case "!=": return new CompileTimeBool(lhs.value != rhs.value, node);
        case "*":
        case "*=": value = lhs.value * rhs.value; break;
        case "**=":
        case "**": value = lhs.value ** rhs.value; break;
        case "+":
        case "+=": value = lhs.value + rhs.value; break;
        case "-":
        case "-=": value = lhs.value - rhs.value; break;
        case "/":
        case "/=": value = lhs.value / rhs.value; break;
      }

      if (value === null) {
        // not supported
        this.error("Type", node, `Compile time float operation not supported.`);
        return new CompileTimeInvalid(node);
      } else {
        return new CompileTimeFloat(value, new FloatType(lhs.ty as any, value, node));
      }
    }

    // we are definitely a runtime operation
    lhs = this.ensureCompiled(lhs);
    rhs = this.ensureCompiled(rhs);

    let operation: LLVMValueRef | null = null;
    const name = this.getTempNameRef();

    // create the instructions for each op
    switch (node.op) {
      case ">": 
      case "_<":
      case "_<=":
      case ">=":
      case "==":
      case "!=": {
        const result = new RuntimeValue(
          this.LLVM._LLVMBuildFCmp(
            this.builder,
            getRealPredicate(node, this),
            (lhs as RuntimeValue).ref,
            (rhs as RuntimeValue).ref,
            name,
          ),
          new BoolType(null, node)
        );
        this.LLVM._free(name);
        return result;
      }
      case "*":
      case "*=":
        operation = this.LLVM._LLVMBuildFMul(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
      case "**=":
      case "**":
        // TODO: Math pow
        // 1. Ensure libm double pow(double, double) is declared
        // 2. cast both sides to doubles
        // 3. Build a call instruction operation
        // 4. cast back to float type
        break; // not supported?
      case "+":
      case "+=":
        operation = this.LLVM._LLVMBuildFAdd(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
      case "-":
      case "-=":
        operation = this.LLVM._LLVMBuildFSub(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
      case "/":
      case "/=":
        operation = this.LLVM._LLVMBuildFDiv(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
    }

    this.LLVM._free(name);
    if (operation === null) {
      this.error("Type", node, `Runtime float operation not supported.`);
      return new CompileTimeInvalid(node);
    }

    return new RuntimeValue(operation, new FloatType(lhs.ty as any, null, node));
  }

  compileBinaryIntegerExpression(node: BinaryExpression, lhs: ExecutionContextValue, rhs: ExecutionContextValue): ExecutionContextValue {
    // some things that need to be checked
    assert(lhs.ty instanceof IntegerType, "LHS must be float type.");
    assert(rhs.ty instanceof IntegerType, "RHS must be float type.");
    assert(lhs.ty.ty === rhs.ty.ty, "The integer types must be equal at this point.");

    if (lhs instanceof CompileTimeInteger && rhs instanceof CompileTimeInteger) {
      let value: bigint | null = null;

      switch (node.op) {
        case "!=": return new CompileTimeBool(lhs.value !== rhs.value, node);
        case "==": return new CompileTimeBool(lhs.value === rhs.value, node);
        case "_<":  return new CompileTimeBool(lhs.value < rhs.value, node);
        case "_<=": return new CompileTimeBool(lhs.value <= rhs.value, node);
        case ">":  return new CompileTimeBool(lhs.value > rhs.value, node);
        case ">=": return new CompileTimeBool(lhs.value >= rhs.value, node);
        case "+":
        case "+=": value = lhs.value + rhs.value; break;
        case "-":
        case "-=": value = lhs.value - rhs.value; break;
        case "*":
        case "*=": value = lhs.value * rhs.value; break;
        case "/": 
        case "/=": {
          if (rhs.value === 0n) {
            this.error("Semantic", node, "Divide by zero.");
            return new CompileTimeInvalid(node);
          }
          value = lhs.value / rhs.value;
          break;
        }
        case "**":
        case "**=": {
          if (rhs.value < 0n) {
            this.error("Semantic", node, "Exponent cannot be negative.");
            return new CompileTimeInvalid(node);
          }
          value = lhs.value ** rhs.value;
          break;
        }
        case "&":
        case "&=": value = lhs.value & rhs.value; break;
        case "|":
        case "|=": value = lhs.value | rhs.value; break;
        case "%":
        case "%=": {
          if (rhs.value === 0n) {
            this.error("Semantic", node, "Divide by zero.");
            return new CompileTimeInvalid(node);
          }
          value = lhs.value % rhs.value;
          break;
        }
        case "<<":
        case "<<=": value = lhs.value << rhs.value; break;
        case ">>>":
        case ">>>=":
        case ">>":
        case ">>=": value = lhs.value >> rhs.value; break;
        case "^":
        case "^=": value = lhs.value ^ rhs.value; break;
      }

      if (value === null) {
        this.error("Type", node, `Invalid compile time integer operation, not supported.`);
        return new CompileTimeInvalid(node);
      }

      value = lhs.ty.isSigned
        ? BigInt.asIntN(Number(lhs.ty.size) * 8, value)
        : BigInt.asUintN(Number(lhs.ty.size) * 8, value);

      return new CompileTimeInteger(value, new IntegerType(lhs.ty.ty as any, value, node));
    }

    lhs = this.ensureCompiled(lhs);
    rhs = this.ensureCompiled(rhs);
    
    let operation: LLVMValueRef | null = null;
    let outputTy: ConcreteType = new IntegerType(lhs.ty.ty as any, null, node);
    const name = this.getTempNameRef();
    switch (node.op) {
      case "!=": 
      case "==": 
      case "_<":  
      case "_<=": 
      case ">":  
      case ">=":
        operation = this.LLVM._LLVMBuildICmp(
          this.builder,
          getIntegerPredicate(node, lhs.ty.isSigned, this),
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        outputTy = new BoolType(null, node);
        break;
      case "+":
      case "+=":
        operation = this.LLVM._LLVMBuildAdd(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
      case "-":
      case "-=":
        operation = this.LLVM._LLVMBuildSub(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
      case "*":
      case "*=":
        operation = this.LLVM._LLVMBuildMul(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name,
        );
        break;
      case "/":
      case "/=":
        operation = lhs.ty.isSigned
          ? this.LLVM._LLVMBuildSDiv(
              this.builder,
              (lhs as RuntimeValue).ref,
              (rhs as RuntimeValue).ref,
              name,
            )
          : this.LLVM._LLVMBuildUDiv(
            this.builder,
            (lhs as RuntimeValue).ref,
            (rhs as RuntimeValue).ref,
            name,
          );
        break;
      case "**":
      case "**=": {
        // TODO: Support integer power operation
        break;
      }
      case "&":
      case "&=":
        operation = this.LLVM._LLVMBuildAnd(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case "|":
      case "|=":
        operation = this.LLVM._LLVMBuildAnd(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case "%":
      case "%=":
        operation = lhs.ty.isSigned
          ? this.LLVM._LLVMBuildSRem(
              this.builder,
              (lhs as RuntimeValue).ref,
              (rhs as RuntimeValue).ref,
              name
            )
          : this.LLVM._LLVMBuildURem(
              this.builder,
              (lhs as RuntimeValue).ref,
              (rhs as RuntimeValue).ref,
              name
            );
        break;
      case "<<":
      case "<<=":
        operation = this.LLVM._LLVMBuildShl(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case ">>":
      case ">>=":
        operation = this.LLVM._LLVMBuildAShr(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case ">>>":
      case ">>>=":
        operation = this.LLVM._LLVMBuildLShr(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
      case "^":
      case "^=":
        operation = this.LLVM._LLVMBuildXor(
          this.builder,
          (lhs as RuntimeValue).ref,
          (rhs as RuntimeValue).ref,
          name
        );
        break;
    }

    this.LLVM._free(name);
    if (operation === null) {
      this.error("Type", node, "Runtime integer operation not supported.");
      return new CompileTimeInvalid(node);
    }

    return new RuntimeValue(operation, outputTy);
  }

  override visitCallExpression(node: CallExpression): void {
    const callRootValue = this.ensureDereferenced(obtainValue(node.callRoot, this));

    // evaluate each expression in the call expression
    const callParameterValues = [] as ExecutionContextValue[];
    for (const callParameterExpression of node.parameters) {
      const callParamaterValue = obtainValue(callParameterExpression, this);
      callParameterValues.push(callParamaterValue);
    }

    if (callRootValue instanceof CompileTimeSuperReference) {
      // special case where super is callable
      const superTypeConstructor = callRootValue.value.compileConstructor(this);
      if (
        superTypeConstructor
        && node.parameters.length === superTypeConstructor.ty.parameterTypes.length
        && node.typeParameters.length === 0
      ) {
        const selfValue = assert(this.ctx.self, "Self must exist!").value as RuntimeValue;
        assert(selfValue instanceof RuntimeValue, "Self value must be a RuntimeValue");
        const parameterValues = [selfValue.ref];
        for (let i = 0; i < callParameterValues.length; i++) {
          const parameter = callParameterValues[i];
          const signatureParameterType = superTypeConstructor.ty.parameterTypes[i];
          if (parameter.ty.isAssignableTo(signatureParameterType)) {
            const compiledParameter = this.ensureCompiled(parameter);
            parameterValues.push(compiledParameter.ref);
          } else {
            this.error("Type", node, "Parameter type is not assignable to signature parameter type.");
            this.ctx.stack.push(new CompileTimeInvalid(node));
            return;
          }
        }

        const loweredParameters = this.program.LLVMUtil.lowerPointerArray(parameterValues);
        this.LLVM._LLVMBuildCall2(
          this.builder,
          superTypeConstructor.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
          superTypeConstructor.funcRef,
          loweredParameters,
          parameterValues.length,
          0 as any,
        );
        this.LLVM._free(loweredParameters);
        this.ctx.stack.push(new CompileTimeVoid(node));
        return;
      }

      this.ctx.stack.push(new CompileTimeInvalid(node));
      this.error("Semantic", node, "Super call not supported.");
      return;
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

    const callRootValueFunctionMethodReference = callRootValue instanceof CompileTimeFunctionReference || callRootValue instanceof CompileTimeMethodReference;

    let func: MethodClassMember | FunctionDeclaration | null = null;

    if (callRootValue instanceof CompileTimeFunctionReference) {
      func = callRootValue.value.node as FunctionDeclaration;
    } else if (callRootValue instanceof CompileTimeMethodReference) {
      func = callRootValue.value;
    }

    // now we need to see what's on the stack and do type inference
    if (
      callRootValueFunctionMethodReference &&
      callTypeParameters.length === 0 &&
      assert(func, "The function must be set at this point.").typeParameters.length > 0
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

    let functionToBeCompiled: FunctionDeclaration | DeclareFunction | MethodClassMember | ExternDeclaration | null =
      null;
    let classType: ConcreteClass | null = null;
    let attributes: [string, string][] = [];
    let builtin: BuiltinFunction | null = null;

    if (
      callRootValue instanceof CompileTimeDeclareFunctionReference
      || callRootValue instanceof CompileTimeExternReference  
    ) {
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

      functionToBeCompiled = callRootValue.value.node as ExternDeclaration | DeclareFunction;
      elementParameters = functionToBeCompiled.parameters;

      const nameDecorator = consumeDecorator(
        "name",
        functionToBeCompiled.decorators
      );


      if (callRootValue instanceof CompileTimeDeclareFunctionReference) {
        attributes.push([
          "wasm-import-module",
          // @ts-ignore
          functionToBeCompiled.$container.namespace.value,
        ]);
        attributes.push([
          "wasm-import-name",
          // @ts-ignore
          (nameDecorator?.parameters[0] as StringLiteral)?.value ??
            functionToBeCompiled.name.name,
        ]);
      }
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

      if (callParameterValues.length !== elementParameters.length) {
        this.ctx.stack.push(new CompileTimeInvalid(node));
        this.error(
          "Type",
          node,
          `Call to ${functionToBeCompiled.name.name} must have ${functionToBeCompiled.parameters.length} parameters.`
        );
        return;
      }

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
          const callParameter = this.ensureCompiled(callParameterValues[i]);
          const callParameterTy = callParameter.ty;
          if (!callParameterTy.isAssignableTo(ty)) {
            this.ctx.stack.push(new CompileTimeInvalid(node));
            this.error(
              "Type",
              node,
              `Parameter ${callParameterTy.getName()} is not assignable to type ${ty.getName()}.`
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

      // we need to ensure that methods compiled via this method have the same signature all the way up the tree
      if (classType && isMethodClassMember(functionToBeCompiled)) {
        let current = classType.extendsClass;
        
        while (current) {
          const parentMethod = current.element.members
            .find(e => isMethodClassMember(e) && e.name.name === functionToBeCompiled!.name.name) as MethodClassMember | null ?? null;
          if (parentMethod) {
            if (functionToBeCompiled.typeParameters.length === parentMethod.typeParameters.length) {
              const compiledMethod = this.compileCallable(
                parentMethod,
                callTypeParameters,
                assert(getModule(parentMethod), "Module must exist at this point."),
                [],
                current,
              );
              if (compiledMethod) {
                const methodType = compiledMethod.ty;
                if (!methodType.isAssignableTo(func.ty)) {
                  console.log("we aren't assignable.");
                  this.error("Type", node, `Extending class does not match signature for method ${functionToBeCompiled.name.name}`);
                  this.ctx.stack.push(new CompileTimeInvalid(node));
                  return;
                }
              } else {
                this.error("Type", parentMethod, `Could not compile parent method.`);
                this.ctx.stack.push(new CompileTimeInvalid(parentMethod));
                return;
              }
            } else {
              this.error("Type", node, `Extending class does not match signature for method ${functionToBeCompiled.name.name}`);
              this.ctx.stack.push(new CompileTimeInvalid(node));
              return;
            }
          }
          current = current.extendsClass;
        }
      }

      // now that the function is garunteed to be compiled, we can make the llvm call
      const name = this.program.LLVMUtil.lower(this.getTempName());
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
      return;
    } else if (callRootValue instanceof RuntimeValue && callRootValue.ty instanceof FunctionType) {
      // this is the equivalent of call_indirect

      // we need to type check each parameter
      if (callRootValue.ty.parameterTypes.length !== callParameterValues.length) {
        this.ctx.stack.push(new CompileTimeInvalid(node));
        this.error("Type", node, "Call parameter length does not match function signature.");
        return;
      } else {
        // some type checks
        for (let i = 0; i < callParameterValues.length; i++) {
          // ensure each value is compiled first because if there are any function references
          // they need to be compiled here
          const callParameter = this.ensureCompiled(callParameterValues[i]);
          callParameterValues[i] = callParameter;

          if (!callParameter.ty.isAssignableTo(callRootValue.ty.parameterTypes[i])) {
            // we can't use this parameter
            this.ctx.stack.push(new CompileTimeInvalid(node));
            this.error("Type", callParameter.ty.node, "Call parameter does not match function parameter type.");
            return;
          } 
        }

        const parameters = this.program.LLVMUtil.lowerPointerArray(
          callParameterValues.map((e) => this.ensureCompiled(e).ref)
        );
        const parametersCount = callParameterValues.length;
        const callName = this.getTempNameRef();
        const result = this.LLVM._LLVMBuildCall2(
          this.builder,
          callRootValue.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
          callRootValue.ref,
          parameters,
          parametersCount,
          callName
        );
        this.LLVM._free(parameters);
        this.LLVM._free(callName);
        this.ctx.stack.push(new RuntimeValue(result, callRootValue.ty.returnType));
        return;
        //
      }
    }

    if (functionToBeCompiled === null) {
      console.error(callRootValue);
    }

    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, "Call expression not supported.");
  }

  getTempName() {
    return "tmp" + (this.tmp++).toString() + "~";
  }

  override visitNewExpression(node: NewExpression): void {
    const classElement = obtainValue(node.expression, this);
    if (classElement instanceof CompileTimeClassReference) {
      // we can resolve it!
      const scopeElement = classElement.value.node as ClassDeclaration;
      const constructorMember = scopeElement.members.find(isConstructorClassMember) as ConstructorClassMember | undefined;
      const constructorMemberParameters = constructorMember?.parameters ?? [];

      // evaluate the parameters
      const constructorParameterValues = [] as ExecutionContextValue[];
      for (const expression of node.parameters) {
        const value = obtainValue(expression, this);
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

      const classRef = this.compileClass(scopeElement, classParameterTypes);
      if (classRef) {
        const constructorFunc = classRef.compileConstructor(this);

        if (constructorFunc) {
          const runtimeParameters = [] as RuntimeValue[];
          for (const value of constructorParameterValues) {
            runtimeParameters.push(this.ensureCompiled(value));
          }

          const fullSize = classRef.offset + CLASS_HEADER_OFFSET;
          const mallocType = this.LLVM._LLVMArrayType(
            this.LLVM._LLVMInt8Type(),
            Number(fullSize)
          );
          const selfRefName = this.getTempNameRef(); 
          const ref = this.LLVM._LLVMBuildMalloc(
            this.builder,
            mallocType,
            selfRefName,
          );
          this.LLVM._free(selfRefName);

          const argsPtr = this.program.LLVMUtil.lowerPointerArray([ref, ...runtimeParameters.map(e => e.ref)]);
          const nameRef = this.getTempNameRef(); 

          // CompileCall2
          this.LLVM._LLVMBuildCall2(
            this.builder,
            constructorFunc.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
            constructorFunc.funcRef,
            argsPtr,
            runtimeParameters.length + 1,
            nameRef
          );

          this.LLVM._free(argsPtr);
          this.LLVM._free(nameRef);
          const resultValue = new RuntimeValue(ref, constructorFunc.ty.returnType);
          this.ctx.stack.push(resultValue);
          return;
        }
      }
    }

    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, `Constructors are not supported.`);
  }

  cachedClasses = new Map<string, ConcreteClass>();

  compileClass(element: ClassDeclaration, typeParameters: ConcreteType[]): ConcreteClass | null {
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
    let fields = [] as Field[];
    let extendsType: ConcreteClass | null = null;
    // get the extending class
    if (element.extends) {
      const scope = assert(getScope(element.extends), "The scope must exist!");
      extendsType = this.ctx.resolve(element.extends, typeMap, scope) as ConcreteClass | null;
      if (extendsType && extendsType instanceof ConcreteClass) {
        fields = extendsType.fields.slice();
        runningOffset = extendsType.offset;
      } else {
        this.error("Type", element.extends, "The resolved type of the class extension could not be resolved, or was not a class.");
        return null;
      };
    }

    // then for each member
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

    const classRef = new ConcreteClass(typeMap, extendsType, fields, element, runningOffset, this);

    return classRef;
  }

  compileArrayAccessSetOperator(concreteClass: ConcreteClass, member: MethodClassMember): void {
    const scope = assert(getScope(member), "The scope must exist at this point.");
    const module = assert(getModule(member), "The module must be defined at this point.");

    // first we need to make some assumptions about the set operator, it should only have a single parameter, and return void
    const returnType = this.ctx.resolve(member.returnType, concreteClass.typeParameters, scope);

    if (!returnType) {
      this.error("Type", member.returnType, `Could not resolve the return type of this method.`);
      return;
    }

    if (concreteClass.operators.has("[]=")) {
      this.error("Semantic", member.returnType, "Class already has an operator of type []=.");
      return;
    }

    // we must be a void return type
    if (!(returnType instanceof VoidType)) {
      this.error("Semantic", member.returnType, "Return type of ArrayAccessSet operator must be void.");
      return;
    }

    // single parameter
    if (member.parameters.length !== 1) {
      this.error("Semantic", member, `ArrayAccessSet operator must have a single parameter.`);
      return;
    }

    const func = assert(
      this.compileCallable(member, [], module, [], concreteClass),
      "The operator function should be compilable at this point."
    );
    concreteClass.operators.set("[]=", func);
  }

  compileArrayAccessGetOperator(concreteClass: ConcreteClass, member: MethodClassMember): void {
    const scope = assert(getScope(member), "The scope must exist at this point.");
    const module = assert(getModule(member), "The module must be defined at this point.");

    // first we need to make some assumptions about the set operator, it should only have a single parameter, and return void
    const returnType = this.ctx.resolve(member.returnType, concreteClass.typeParameters, scope);

    if (!returnType) {
      this.error("Type", member.returnType, `Could not resolve the return type of this method.`);
      return;
    }

    if (returnType instanceof VoidType) {
      this.error("Semantic", member.returnType, "Return type of ArrayAccessSet operator must not be void or invalid.");
      return;
    }

    // single parameter
    if (member.parameters.length !== 1) {
      this.error("Semantic", member, `ArrayAccessSet operator must have a single parameter.`);
      return;
    }

    const func = assert(
      this.compileCallable(member, [], module, [], concreteClass),
      "The operator function should be compilable at this point."
    );
    concreteClass.operators.set("[]", func);
  }

  ensureDereferenced(value: ExecutionContextValue): ExecutionContextValue {
    if (value instanceof CompileTimeVariableReference) {
      return assert(value.value.value, "Compile time varaible reference should be set at this point.");
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

      // we should always look for the `str` class
      const element = assert(this.program.globalScope.get("str"), "The str class must be defined.") as StaticTypeScopeElement;
      assert(isClassDeclaration(element.node), "The str class must be a class declaration.");
      assert(element instanceof StaticTypeScopeElement, "The scope element for the str class must be a StaticTypeScopeElement.");

      // if the class isn't created, we need to create it
      const strClass = assert(this.compileClass(element.node as ClassDeclaration, []), "The str class must be creatable at this point.");

      if (hasCompiledString) {
        constStrArray = this.compiledStringPtrs.get(value.value)!;
      } else {
        // then we we need to write the pre-computed data segment into static memory
        const stringLength = Buffer.byteLength(value.value);
        const int8Type = this.LLVM._LLVMInt8Type();
        const header = Buffer.alloc(8 + stringLength);
        header.writeUint32LE(stringLength);
        header.writeUint32LE(Number(strClass.id));
        header.write(value.value, 8, "utf-8");

        // lower the header values into LLVM
        const headerValues = Array.from(header);
        const loweredHeaderValues = this.program.LLVMUtil.lowerPointerArray(headerValues.map(e => this.LLVM._LLVMConstInt(int8Type, BigInt(e), 0)));

        // create a global
        const name = this.getTempNameRef();
        const global = this.LLVM._LLVMAddGlobal(
          this.program.llvmModule,
          this.LLVM._LLVMArrayType(this.LLVM._LLVMInt8Type(), header.length),
          name
        );

        // create a const array and then set it as the initializer
        const values = this.LLVM._LLVMConstArray(
          this.LLVM._LLVMInt8Type(),
          loweredHeaderValues,
          header.length
        );
        this.LLVM._LLVMSetInitializer(global, values);

        // free memory
        this.LLVM._free(name);
        this.LLVM._free(loweredHeaderValues);
        constStrArray = global;
        this.compiledStringPtrs.set(value.value, global);
      }

      return new RuntimeValue(constStrArray, strClass);
    } else if (value instanceof CompileTimeBool) {
      const ref = this.LLVM._LLVMConstInt(
        value.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
        value.value ? 1n : 0n,
        0
      );
      return new RuntimeValue(ref, new BoolType(null, value.ty.node));
    } else if (value instanceof CompileTimeVariableReference) {
      const loadedName = this.getTempNameRef();
      const loaded = this.LLVM._LLVMBuildLoad2(
        this.builder,
        value.ty.llvmType(this.program.LLVM, this.program.LLVMUtil)!,
        value.value.ptr!,
        loadedName
      );
      const result = new RuntimeValue(loaded, value.value.ty ?? new InvalidType(value.ty.node));
      this.LLVM._free(loadedName);
      return result;
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
    } else if (value instanceof CompileTimeFunctionReference) {
      const scopeItem = value.value;
      if (scopeItem instanceof StaticTypeScopeElement) {
        // we can compile it and push the pointer to the stack
        const func = assert(this.compileCallable(
          scopeItem.node as FunctionDeclaration,
          [],
          assert(getModule(scopeItem.node), "The module for this function must be known."),
          [
            ["target-features", "+simd128"]
          ],
        ), "The function must be in the queue to be compiled at this point.");

        // this.LLVM._LLVMBuildFPCast()
        return new RuntimeValue(func.funcRef, func.ty); 
      } else {
        this.error("Type", scopeItem.node, "Cannot pass around generic function references, they must be compilable without type parameters.");
      }
    } else if (value instanceof CompileTimeArrayAccessReference) {
      const ty = value.ty as ConcreteClass;
      assert(ty instanceof ConcreteClass, "The type of the array access expression must be a class.");

      const method = ty.getOperatorMethod("[]");
      if (method) {
        if (method.typeParameters.length === 0 && method.parameters.length === 1) {
          const func = this.compileCallable(method, [], getModule(method)!, [], ty);
          if (func) {
            const ty = func.ty as MethodType;
            const root = value.root;
            const index = value.value;

            assert(ty instanceof MethodType);
            const callRefName = this.getTempNameRef();
            const loweredExpressions = this.program.LLVMUtil.lowerPointerArray([root.ref, index.ref]);
            const callRef = this.LLVM._LLVMBuildCall2(
              this.builder,
              ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
              func.funcRef,
              loweredExpressions,
              2,
              callRefName
            );
            this.LLVM._free(callRefName);
            this.LLVM._free(loweredExpressions);

            return new RuntimeValue(callRef, ty.returnType);
          }
        }
      }
    } else if (value instanceof CompileTimeSuperReference) {
      const self = this.ctx.self;
      if (self) {
        const value = self.value;
        if (value instanceof RuntimeValue) {
          return value;
        } 
      }
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

  override visitTernaryExpression(node: TernaryExpression): void {
    // There are 3 paths we can take for this expression
    const condition = this.ensureDereferenced(obtainValue(node.condition, this));
  
    // CASE 1: The condition is a compile time constant
    if (condition instanceof CompileTimeBool || condition instanceof CompileTimeInteger) {
      // we eliminate the corresponding branch here
      this.ctx.stack.push(
        condition.value
          ? obtainValue(node.truthy, this)
          : obtainValue(node.falsy, this)
      );
      // We cannot do type checking of the truthy and falsy branches here because we don't actually
      // evaluate it.
      // TODO: develop some kind of type resolution for expressions that do not provide codegen
      return;
    }

    // Some basic type checking, the condition must be an integer or a bool
    const isBool = condition.ty instanceof BoolType;
    const isInt = condition.ty instanceof IntegerType;
    if (!isBool && !isInt) {
      // we can't do this. Push a compile time invalid to the stack
      this.error("Type", node, `Condition in ternary is not a bool or an int.`);
      this.ctx.stack.push(new CompileTimeInvalid(node));
      return;
    }

    // Since we cannot determine if the truthy and falsy sides of the expression are compile time constants,
    // at least not without potentially writing code to the current block, we cannot use a `select` instruction
    // here safely. The only viable alternative is to generate 3 labels, truthy, falsy and next
    
    const resultName = this.getTempNameRef();
    const truthyLabelName = this.getTempNameRef();
    const falsyLabelName = this.getTempNameRef();
    const nextLabelName = this.getTempNameRef();
    const storageSiteName = this.getTempNameRef();

    // first generate the truthy branch
    const truthyLabel = this.LLVM._LLVMAppendBasicBlockInContext(
      this.program.llvmContext,
      this.func.funcRef,
      truthyLabelName
    );
      
    // then generate the falsy branch
    const falsyLabel = this.LLVM._LLVMAppendBasicBlockInContext(
      this.program.llvmContext,
      this.func.funcRef,
      falsyLabelName
    );

    // and don't forget the next block
    const nextLabel = this.LLVM._LLVMAppendBasicBlockInContext(
      this.program.llvmContext,
      this.func.funcRef,
      nextLabelName
    );

    const storageSite = assert(
      this.ctx.storageSites.get(node),
      "The storage site for this expression should already exist."
    );

    // then create the brIf, ensuring the condition is compiled
    const compiledCondition = this.ensureCompiled(condition); 
    this.LLVM._LLVMBuildCondBr(
      this.builder,
      compiledCondition.ref,
      truthyLabel,
      falsyLabel
    );

    // first we visit the truthy branch
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, truthyLabel);
    this.currentBlock = truthyLabel;
    const truthyCompiledValue = this.ensureCompiled(obtainValue(node.truthy, this));
    this.LLVM._LLVMBuildStore(
      this.builder,
      truthyCompiledValue.ref,
      storageSite
    );
    this.LLVM._LLVMBuildBr(this.builder, nextLabel);

    // then we visit the falsy branch
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, falsyLabel);
    this.currentBlock = falsyLabel;
    const falsyCompiledValue = this.ensureCompiled(obtainValue(node.falsy, this));
    this.LLVM._LLVMBuildStore(
      this.builder,
      falsyCompiledValue.ref,
      storageSite
    );
    this.LLVM._LLVMBuildBr(this.builder, nextLabel);

    // now we can visit the next block and continue execution
    this.LLVM._LLVMPositionBuilderAtEnd(this.builder, nextLabel);
    this.currentBlock = nextLabel;

    // at this point we have the two compiled values, and we can safely type check them
    if (falsyCompiledValue.ty.isAssignableTo(truthyCompiledValue.ty)) {
      // we choose the truthy value's type no matter what it is
      const value = this.LLVM._LLVMBuildLoad2(
        this.builder,
        truthyCompiledValue.ty.llvmType(this.LLVM, this.program.LLVMUtil)!,
        storageSite,
        resultName
      );
      this.ctx.stack.push(new RuntimeValue(value, truthyCompiledValue.ty));
    } else {
      this.error("Type", node.falsy, `Falsy type in ternary is not assignable to truthy type.`);
      this.ctx.stack.push(new CompileTimeInvalid(node.falsy));
    }
    // free our memory
    this.LLVM._free(resultName);
    this.LLVM._free(storageSiteName);
    this.LLVM._free(truthyLabelName);
    this.LLVM._free(falsyLabelName);
    this.LLVM._free(nextLabelName);
  }

  override visitArrayAccessExpression(node: ArrayAccessExpression): void {
    const rootValue = obtainValue(node.arrayRoot, this);
    const indexExpression = obtainValue(node.indexExpression, this);

    // we should ensure the value is compiled
    const compiledRootValue = this.ensureCompiled(rootValue);
    const compiledIndexExpression = this.ensureCompiled(indexExpression);

    const ty = compiledRootValue.ty;
    if (ty instanceof ConcreteClass) {
      this.ctx.stack.push(new CompileTimeArrayAccessReference(ty, compiledRootValue, compiledIndexExpression));
      return;
    }

    this.ctx.stack.push(new CompileTimeInvalid(node));
    this.error("Semantic", node, `Array access is not supported for this expression.`);
  }

  override visitTrueLiteral(expression: TrueLiteral): void {
    this.ctx.stack.push(new CompileTimeBool(true, expression));
  }

  override visitFalseLiteral(expression: FalseLiteral): void {
    this.ctx.stack.push(new CompileTimeBool(false, expression));
  }

  override visitStringLiteral(expression: StringLiteral): void {
    this.ctx.stack.push(new CompileTimeString(expression.value, expression));
  }

  override visitLeftUnaryExpression(node: LeftUnaryExpression): void {
    const expr = obtainValue(node.expression, this);
    switch (node.op) {
      case "!": return this.compileLogicalNotExpression(node, expr);
    }

    this.error(`Type`, node, "Operation not supported.");
    this.ctx.stack.push(new CompileTimeInvalid(node));
  }

  override visitThisLiteral(expression: ThisLiteral): void {
    const self = this.ctx.self;
    if (self) {
      this.ctx.stack.push(new CompileTimeVariableReference(self));
    } else {
      this.error("Semantic", expression, `Cannot access this outside of a class context.`);
      this.ctx.stack.push(new CompileTimeInvalid(expression));
    }
  }

  override visitSuperLiteral(expression: SuperLiteral): void {
    const self = this.ctx.self;
    if (self) {
      const selfType = self.ty as ConcreteClass;
      assert(selfType instanceof ConcreteClass);
      const extendsType = selfType.extendsClass;
      if (extendsType) {
        this.ctx.stack.push(new CompileTimeSuperReference(extendsType));
      } else {
        this.error("Semantic", expression, `Cannot access super on class that does not extend.`);
        this.ctx.stack.push(new CompileTimeInvalid(expression));
      }
    } else {
      this.error("Semantic", expression, `Cannot access super outside of a class context.`);
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
