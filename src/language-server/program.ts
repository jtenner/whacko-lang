import {
  LLVMBuilderRef,
  LLVMContextRef,
  LLVMModuleRef,
  LLVMValueRef,
  Module as LLVMModule,
  Module,
  LLVMTypeRef,
} from "llvm-js";
import path, { dirname, join, relative } from "node:path";
import {
  Scope,
  createNewScope,
  ScopeElement,
  ScopeElementType,
  createChildScope,
  addScopeElement,
  getScope,
} from "./scope";
import { readFile } from "node:fs/promises";
import {
  Diagnostic,
  DiagnosticLevel,
  reportErrorDiagnostic,
} from "./diagnostic";
import { parse } from "./parser";
import {
  UNREACHABLE,
  assert,
  getFullyQualifiedCallableName,
  getFullyQualifiedTypeName,
  getNameDecoratorValue,
  idCounter,
  lowerStringArray,
  LLVMJSUtil,
} from "./util";
import { AstNode } from "langium";
import { parseArgs } from "node:util";
import { ModuleCollectionPass } from "./passes/ModuleCollectionPass";
import { ScopePopulationPass } from "./passes/ScopePopulationPass";
import { ImportCollectionPass } from "./passes/ImportCollectionPass";
import {
  BuiltinDeclaration,
  ConstructorClassMember,
  ExternDeclaration,
  FunctionDeclaration,
  InterfaceMethodDeclaration,
  isConstructorClassMember,
  isDeclareDeclaration,
  isExternDeclaration,
  isFunctionDeclaration,
  isInterfaceMethodDeclaration,
  isMethodClassMember,
  isStringLiteral,
  MethodClassMember,
  StringLiteral,
} from "./generated/ast";
import {
  ClassType,
  ConcreteField,
  ConcreteType,
  ConcreteTypeKind,
  EnumType,
  FunctionType,
  getCallableType,
  getConstructorType,
  InterfaceType,
  isAssignable,
  MethodType,
  RawPointerType,
  TypeMap,
  VoidType,
} from "./types";
import {
  BlockContext,
  BlockInstruction,
  CallableFunctionContext,
  WhackoMethodContext,
  WhackoFunctionContext,
  Value,
  createVariableReference,
  CallableKind,
  TrampolineFunctionContext,
} from "./ir";
import { WIRGenPass } from "./passes/WIRGenPass";
import { registerDefaultBuiltins } from "./builtins";
import { inspect } from "node:util";
import { ValidatorPass } from "./passes/ValidatorPass";
import { codegen } from "./codegen";
import crypto from "node:crypto";
import { EnsurePass } from "./passes/EnsurePass";

export function addBuiltinTypeToProgram(
  program: WhackoProgram,
  name: string,
  builtinTypeFunc: BuiltinTypeFunction,
) {
  assert(
    !program.builtinTypeFunctions.has(name),
    `Builtin type '${name}' already exists in the program.`,
  );
  program.builtinTypeFunctions.set(name, builtinTypeFunc);
}

export type BuiltinTypeFunction = (ctx: {
  program: WhackoProgram;
  module: WhackoModule;
  scope: Scope;
  typeParameters: ConcreteType[];
  node: AstNode;
}) => ConcreteType;

export interface BuiltinFunctionParameters {
  args: Value[];
  caller: WhackoFunctionContext;
  funcType: FunctionType;
  module: WhackoModule;
  node: AstNode;
  program: WhackoProgram;
  typeParameters: ConcreteType[];
  getCurrentBlock: () => BlockContext;
  setCurrentBlock: (block: BlockContext) => void;
}

export type BuiltinFunction = (parameters: BuiltinFunctionParameters) => Value;

export function addBuiltinToProgram(
  program: WhackoProgram,
  name: string,
  builtinFunc: BuiltinFunction,
): void {
  assert(
    !program.builtinFunctions.has(name),
    `Builtin type '${name}' already exists in the program.`,
  );
  program.builtinFunctions.set(name, builtinFunc);
}

export function getBuiltinFunction(
  program: WhackoProgram,
  builtin: BuiltinDeclaration,
): BuiltinFunction | null {
  const builtinName = getNameDecoratorValue(builtin);
  if (!builtinName) return null;

  return program.builtinFunctions.get(builtinName) ?? null;
}

export interface LLVMFieldTrampolineDefinition {
  field: ConcreteField;
  name: string;
  funcRef: LLVMValueRef;
  typeRef: LLVMTypeRef;
  type: InterfaceType;
}

export interface WhackoProgram {
  stdLibModules: WhackoModule[];
  baseDir: string;
  builtinFunctions: Map<string, BuiltinFunction>;
  builtinTypeFunctions: Map<string, BuiltinTypeFunction>;
  classes: Map<string, ClassType>;
  classId: number;
  diagnostics: Diagnostic[];
  enums: Map<string, EnumType>;
  fieldTrampolines: Map<string, LLVMFieldTrampolineDefinition>;
  methodTrampolines: Map<TrampolineFunctionContext, Set<WhackoMethodContext>>;
  functions: Map<string, CallableFunctionContext>;
  globalScope: Scope;
  interfaces: Map<string, InterfaceType>;
  LLC: LLVMJSUtil;
  LLD: LLVMJSUtil;
  LLVM: LLVMModule;
  llvmBuilder: LLVMBuilderRef;
  llvmCtx: LLVMContextRef;
  llvmModule: LLVMModuleRef;
  LLVMUtil: Awaited<typeof import("llvm-js")>;
  stringType: ClassType | null;
  ptrType: RawPointerType;
  voidType: VoidType;
  /** Absolute path to module. */
  modules: Map<string, WhackoModule>;
  strings: Map<string, LLVMValueRef>;
  queue: (WhackoFunctionContext | TrampolineFunctionContext)[];
  staticLibraries: Map<string, Buffer>;
}

export interface WhackoModule {
  absolutePath: string;
  ast: AstNode | null;
  contents: string;
  entry: boolean;
  exports: Map<string, ScopeElement>;
  relativePath: string;
  scope: Scope;
}

export async function addModuleToProgram(
  program: WhackoProgram,
  modulePath: string,
  absoluteBaseFolder: string,
  entry: boolean,
): Promise<WhackoModule | null> {
  const absolutePath = join(absoluteBaseFolder, modulePath);
  const relativePath = relative(program.baseDir, absolutePath);
  if (program.modules.has(absolutePath)) {
    return program.modules.get(absolutePath)!;
  }

  const scope = createChildScope(program.globalScope);
  const module: WhackoModule = {
    absolutePath,
    ast: null,
    contents: "",
    entry,
    exports: new Map(),
    relativePath,
    scope,
  };

  scope.module = module;
  program.modules.set(absolutePath, module);

  try {
    const contents = await readFile(absolutePath, "utf8");
    const parsedAst = assert(
      parse(contents, absolutePath),
      `Unable to parse contents of file ${modulePath}.`,
    );
    module.contents = contents;

    for (const lexerError of parsedAst.lexerErrors) {
      reportErrorDiagnostic(program, module, "lexer", null, lexerError.message);
    }

    for (const parserError of parsedAst.parserErrors) {
      reportErrorDiagnostic(
        program,
        module,
        parserError.name,
        null,
        parserError.message,
      );
    }
    module.ast = parsedAst.value;
  } catch (e: unknown) {
    const err = e as Error;
    reportErrorDiagnostic(program, module, err.name, null, err.message);
    return null;
  }

  const moduleCollector = new ModuleCollectionPass(program);
  moduleCollector.visit(module.ast);
  const modulesToAdd = moduleCollector.modulesToAdd;

  const childModules = [] as Array<Promise<WhackoModule | null>>;
  const dirnameOfModule = dirname(module.absolutePath);

  for (const moduleToAdd of modulesToAdd) {
    childModules.push(
      addModuleToProgram(program, moduleToAdd, dirnameOfModule, false),
    );
  }

  await Promise.all(childModules);
  return module;
}

export async function addStaticLibraryToProgram(
  program: WhackoProgram,
  filename: string,
  dirname: string,
) {
  const absolutePath = join(dirname, filename);
  program.staticLibraries.set(absolutePath, await readFile(absolutePath));
}

export interface CompilationOutput {
  bitcode?: Buffer;
  object?: Buffer;
  textIR?: Buffer;
  wasm?: Buffer;
}

export function compile(program: WhackoProgram): CompilationOutput {
  const { LLVM, LLVMUtil, LLC, LLD } = program;
  const scopePopulationPass = new ScopePopulationPass(program);
  const modules = Array.from(program.modules.values());
  for (const module of modules) {
    scopePopulationPass.visitModule(module);
  }

  for (const module of program.stdLibModules) {
    for (const [name, element] of module.exports) {
      addScopeElement(program.globalScope, name, element);
    }
  }

  const importCollectionPass = new ImportCollectionPass(program);
  for (const module of modules) {
    importCollectionPass.visitModule(module);
  }

  const validatorPass = new ValidatorPass(program);
  for (const module of modules) {
    validatorPass.visitModule(module);
  }

  registerDefaultBuiltins(program);

  const ensurePass = new EnsurePass(program);
  for (const module of modules) {
    ensurePass.visitModule(module);
  }

  // if there are any errors at this point, we need to stop because codegen is unsafe
  if (
    program.diagnostics.filter(
      (diagnostic) => diagnostic.level === DiagnosticLevel.ERROR,
    ).length
  ) {
    return {};
  }

  const mainModuleMaybe = modules.filter((module) => {
    const startExport = module.exports.get("_start");
    return (
      startExport &&
      startExport.type === ScopeElementType.Function &&
      isFunctionDeclaration(startExport.node) &&
      startExport.node.typeParameters.length === 0
    );
  });

  if (mainModuleMaybe.length > 1) {
    for (const module of mainModuleMaybe) {
      const startFunction = module.exports.get("_start")!.node;
      reportErrorDiagnostic(
        program,
        module,
        "initialization",
        startFunction,
        "Found multiple exported _start functions.",
      );
    }
    return {};
  } else if (mainModuleMaybe.length === 0) {
    reportErrorDiagnostic(
      program,
      null,
      "initialization",
      null,
      "Could not find an exported _start function.",
    );
    return {};
  }

  const [mainModule] = mainModuleMaybe;
  mainModule.entry = true;

  ensureCallableCompiled(
    program,
    mainModule,
    mainModule.exports.get("_start")!.node as FunctionDeclaration,
    null,
    [],
    new Map(),
  );

  const cache = new WeakMap();
  const cleanIR = (obj: any) => {
    if (obj === null || typeof obj !== "object") return obj;

    const isArray = Array.isArray(obj);
    let result = isArray ? [] : {};

    if (cache.has(obj)) return cache.get(obj);
    cache.set(obj, result);

    if (isArray) (result as any[]).push(...obj.map(cleanIR));
    else
      Object.assign(
        result,
        Object.fromEntries(
          Object.entries(obj)
            .filter(
              ([k]) =>
                k !== "ast" && k !== "node" && k !== "contents" && k[0] !== "$",
            )
            .map(([k, v]) => [k, cleanIR(v)]),
        ),
      );

    return result;
  };

  churnQueue(program);

  // TODO: Make program.diagnostics an object with fields ".error", ".warn", ".info" maybe?
  //       Maybe. Or calculate diagnostic counts all the time.

  const errored = program.diagnostics.filter(
    (diagnostic) => diagnostic.level === DiagnosticLevel.ERROR,
  ).length;
  if (errored) return {};

  const { bitcode, textIR } = codegen(program);

  const tmpFileBase = crypto.randomBytes(16).toString("base64url");
  const tmpBCName = "/" + tmpFileBase + ".bc";
  const tmpOName = "/" + tmpFileBase + ".o";
  LLC.FS.writeFile(tmpBCName, bitcode);
  LLC.FS.chmod(tmpBCName, 0o444);

  // we need to free every one of these pointers after calling _main()
  const { arrayPtr: llcArgvPtr, ptrs: llcArgvPtrs } = lowerStringArray(LLC, [
    "llc",
    tmpBCName,
    "--march=wasm32",
    "-o",
    tmpOName,
    "-filetype=obj",
    "--experimental-debug-variable-locations",
    "--emit-call-site-info",
    "-O3",
  ]);
  LLC._main(llcArgvPtrs.length, llcArgvPtr);
  LLC._free(llcArgvPtr);
  for (const ptr of llcArgvPtrs) LLC._free(ptr);
  const object = LLC.FS.readFile(tmpOName);

  const staticLibFiles = [] as string[];
  for (const [staticLib, staticLibBuffer] of program.staticLibraries) {
    // const tmpFileBase = crypto.randomBytes(16).toString("base64url");
    const basename = path.basename(staticLib);
    const staticLibFile = "/" + basename;
    staticLibFiles.push(staticLibFile);
    LLD.FS.writeFile(staticLibFile, staticLibBuffer);
    LLD.FS.chmod(staticLibFile, 0o777);
  }

  const tmpWasmName = "/" + tmpFileBase + ".wasm";
  LLD.FS.writeFile(tmpOName, object);
  LLD.FS.chmod(tmpOName, 0o777);

  const lldArgs = [
    "wasm-ld",
    tmpOName,
    "-o",
    tmpWasmName,
    ...staticLibFiles,
    "--verbose",
    "-O3",
  ];
  const { arrayPtr: lldArrayPtr, ptrs: lldArrayPtrs } = lowerStringArray(
    LLD,
    lldArgs,
  );

  // LLD._main(lldArrayPtrs.length, lldArrayPtr);
  LLD._free(lldArrayPtr);
  for (const ptr of lldArrayPtrs) LLD._free(ptr);

  // const wasmFile = LLD.FS.readFile(tmpWasmName);
  return {
    bitcode,
    textIR,
    object,
    wasm: void 0,
  };
}

// Whenever we push a function/trampoline context to the queue, we should
// be adding it to program.functions, so let's never use program.queue
// directly.

// Uh, because churnQueue does something with it
export function pushToQueue(
  program: WhackoProgram,
  ctx: WhackoFunctionContext | TrampolineFunctionContext,
) {
  assert(
    !program.functions.has(ctx.name),
    "Callable context to be added to the queue was already cached.",
  );
  program.queue.push(ctx);
  program.functions.set(ctx.name, ctx);
}

export function churnQueue(program: WhackoProgram) {
  const pass = new WIRGenPass(program);

  while (program.queue.length) {
    while (program.queue.length) {
      const func = assert(program.queue.pop());

      if (func.kind === CallableKind.InterfaceMethod) {
        program.methodTrampolines.set(
          func as TrampolineFunctionContext,
          new Set(),
        );
        continue;
      }

      pass.visitWhackoFunction(func);
    }

    for (const [trampoline, membersList] of program.methodTrampolines) {
      const rawName = trampoline.node.name.name;

      for (const implementer of trampoline.thisType.implementers) {
        const methodDeclaration = assert(
          implementer.node.members.find(
            (member) =>
              isMethodClassMember(member) && member.name.name === rawName,
          ),
          "Implementers must implement every method that is declared on the interface.",
        ) as MethodClassMember;

        const scope = assert(
          getScope(methodDeclaration),
          "The scopes of method declarations must exist.",
        );
        const module = assert(scope.module);

        const callable = ensureCallableCompiled(
          program,
          module,
          methodDeclaration,
          implementer,
          trampoline.typeParameters,
          implementer.resolvedTypes,
        );

        if (!callable) {
          // ensureCallableCompiled emits diagnostics for us.
          continue;
        }

        assert(
          callable.kind === CallableKind.Method,
          "We royally screwed up. Trampoline functions should only be compiling class methods.",
        );

        if (!isAssignable(trampoline.type, callable.type)) {
          reportErrorDiagnostic(
            program,
            module,
            "type",
            assert(implementer.implements.get(trampoline.thisType)),
            `Method '${rawName}' is not compatible with the given interface.`,
          );
          continue;
        }

        membersList.add(callable as WhackoMethodContext);
      }
    }
  }
}

export function getCallableKindFromNode(node: AstNode): CallableKind {
  if (isConstructorClassMember(node)) return CallableKind.Constructor;
  else if (isFunctionDeclaration(node)) return CallableKind.Function;
  else if (isMethodClassMember(node)) return CallableKind.Method;
  else if (isInterfaceMethodDeclaration(node))
    return CallableKind.InterfaceMethod;
  else if (isExternDeclaration(node)) return CallableKind.Extern;
  else if (isDeclareDeclaration(node)) return CallableKind.Declare;
  else UNREACHABLE("INVALID CALLABLE KIND.");
}

export function ensureCallableCompiled(
  program: WhackoProgram,
  module: WhackoModule,
  callableAst:
    | MethodClassMember
    | InterfaceMethodDeclaration
    | FunctionDeclaration,
  thisType: ClassType | InterfaceType | null,
  typeParameters: ConcreteType[],
  typeMap: TypeMap,
): WhackoFunctionContext | TrampolineFunctionContext | null {
  const contextType = getCallableType(
    program,
    module,
    callableAst,
    thisType,
    typeParameters,
  );
  if (!contextType) return null;

  const name =
    module.entry && isFunctionDeclaration(callableAst) && callableAst.export
      ? callableAst.name.name
      : getFullyQualifiedCallableName(callableAst, contextType);

  if (program.functions.has(name)) {
    const ctx = assert(program.functions.get(name));
    assert(
      ctx.kind === CallableKind.Function ||
        ctx.kind === CallableKind.Method ||
        ctx.kind === CallableKind.InterfaceMethod,
    );
    return ctx as WhackoFunctionContext | TrampolineFunctionContext;
  }

  let ctx: WhackoFunctionContext | TrampolineFunctionContext;

  // This is extra verbose in case we forget to declare fields
  if (isFunctionDeclaration(callableAst)) {
    ctx = {
      attributes: [],
      blocks: new Map(),
      entry: null,
      funcRef: null,
      id: idCounter.value++,
      instructions: new Map(),
      kind: getCallableKindFromNode(callableAst),
      module,
      node: callableAst,
      name,
      type: contextType,
      typeMap,
      stackAllocationSites: new Map(),
    } as WhackoFunctionContext;
  } else if (isMethodClassMember(callableAst)) {
    assert(
      thisType && thisType.kind === ConcreteTypeKind.Class,
      "The method thisType must be a class type.",
    );
    const classThisType = thisType as ClassType;
    ctx = {
      attributes: [],
      blocks: new Map(),
      entry: null,
      funcRef: null,
      id: idCounter.value++,
      instructions: new Map(),
      kind: getCallableKindFromNode(callableAst),
      module,
      node: callableAst,
      name: getFullyQualifiedCallableName(callableAst, contextType),
      type: contextType as MethodType,
      thisType: classThisType,
      typeMap,
      stackAllocationSites: new Map(),
    } as WhackoMethodContext;

    ctx.stackAllocationSites.set(classThisType.node, {
      immutable: true,
      node: classThisType.node,
      type: classThisType,
      ref: null,
      value: null,
    });
  } else {
    assert(
      isInterfaceMethodDeclaration(callableAst),
      "At this point, it must be an interface method",
    );

    assert(
      contextType && contextType.kind === ConcreteTypeKind.Method,
      "The callable type must be a method type.",
    );

    assert(
      thisType && thisType.kind === ConcreteTypeKind.Interface,
      "The this type must be an interface type.",
    );

    const thisInterfaceType = thisType as InterfaceType;
    ctx = {
      attributes: [],
      funcRef: null,
      kind: CallableKind.InterfaceMethod,
      module,
      type: contextType as MethodType,
      id: idCounter.value++,
      typeParameters,
      thisType: thisInterfaceType,
      node: callableAst,
      name: getFullyQualifiedCallableName(callableAst, contextType),
    } as TrampolineFunctionContext;
  }

  pushToQueue(program, ctx);
  return ctx;
}

export function ensureConstructorCompiled(
  program: WhackoProgram,
  module: WhackoModule,
  concreteClass: ClassType,
  constructorType: MethodType,
  constructor: ConstructorClassMember,
): WhackoMethodContext {
  const name = getFullyQualifiedCallableName(constructor, constructorType);

  if (program.functions.has(name))
    return program.functions.get(name)! as WhackoMethodContext;

  const ctx: WhackoMethodContext = {
    attributes: [],
    blocks: new Map(),
    entry: null,
    funcRef: null,
    id: idCounter.value++,
    instructions: new Map(),
    kind: CallableKind.Method,
    module,
    name,
    node: constructor,
    typeMap: concreteClass.resolvedTypes,
    stackAllocationSites: new Map(),
    thisType: concreteClass,
    type: constructorType,
  };

  ctx.stackAllocationSites.set(concreteClass.node, {
    immutable: true,
    node: concreteClass.node,
    ref: null,
    type: concreteClass,
    value: null,
  });
  concreteClass.classConstructor = ctx;
  pushToQueue(program, ctx);
  return ctx;
}

export function createProgram(
  LLC: LLVMJSUtil,
  LLD: LLVMJSUtil,
  LLVM: LLVMModule,
  moduleName: string,
  LLVMUtil: typeof import("llvm-js"),
): WhackoProgram {
  const llvmModuleName = LLVMUtil.lower(moduleName);
  const result = {
    baseDir: process.cwd(),
    builtinFunctions: new Map(),
    builtinTypeFunctions: new Map(),
    classes: new Map(),
    classId: 1,
    diagnostics: [],
    enums: new Map(),
    fieldTrampolines: new Map(),
    functions: new Map(),
    globalScope: createNewScope(null),
    interfaces: new Map(),
    LLC,
    LLD,
    LLVM,
    llvmBuilder: LLVM._LLVMCreateBuilder(),
    llvmCtx: LLVM._LLVMContextCreate(),
    llvmModule: LLVM._LLVMModuleCreateWithName(llvmModuleName),
    LLVMUtil,
    methodTrampolines: new Map(),
    modules: new Map(),
    queue: [],
    staticLibraries: new Map(),
    stdLibModules: [],
    strings: new Map(),
    stringType: null,
    ptrType: {
      id: idCounter.value++,
      kind: ConcreteTypeKind.Pointer,
      llvmType: null,
    } as RawPointerType,
    voidType: {
      id: idCounter.value++,
      kind: ConcreteTypeKind.Void,
      llvmType: null,
    } as VoidType,
  };
  LLVM._free(llvmModuleName);
  return result;
}

export function buildExternFunction(
  program: WhackoProgram,
  module: WhackoModule,
  type: FunctionType,
  declaration: ExternDeclaration,
): CallableFunctionContext {
  const name = getNameDecoratorValue(declaration) ?? declaration.name.name;
  if (program.functions.has(name)) return program.functions.get(name)!;

  const result = {
    attributes: [],
    funcRef: null,
    id: idCounter.value++,
    kind: CallableKind.Extern,
    module,
    node: declaration,
    name,
    type,
  };
  program.functions.set(name, result);
  return result;
}
