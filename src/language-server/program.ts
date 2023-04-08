import {
  LLVMBuilderRef,
  LLVMContextRef,
  LLVMModuleRef,
  LLVMValueRef,
  Module as LLVMModule,
  Module,
} from "llvm-js";
import { dirname, join, relative } from "node:path";
import {
  Scope,
  createNewScope,
  ScopeElement,
  ScopeElementType,
  createChildScope,
} from "./scope";
import { readFile } from "node:fs/promises";
import {
  Diagnostic,
  DiagnosticLevel,
  reportErrorDiagnostic,
} from "./diagnostic";
import { parse } from "./parser";
import {
  ConstructorSentinel,
  assert,
  getFullyQualifiedCallableName,
  getFullyQualifiedTypeName,
  getNameDecoratorValue,
  idCounter,
  theConstructorSentinel,
} from "./util";
import { AstNode } from "langium";
import { parseArgs } from "node:util";
import { ModuleCollectionPass } from "./passes/ModuleCollectionPass";
import { ScopePopulationPass } from "./passes/ScopePopulationPass";
import { ImportCollectionPass } from "./passes/ImportCollectionPass";
import {
  BuiltinDeclaration,
  ConstructorClassMember,
  FunctionDeclaration,
  isConstructorClassMember,
  isFunctionDeclaration,
  isMethodClassMember,
  isStringLiteral,
  MethodClassMember,
  StringLiteral,
} from "./generated/ast";
import {
  ClassType,
  ConcreteType,
  EnumType,
  FunctionType,
  getCallableType,
  getConstructorType,
  MethodType,
  TypeMap,
} from "./types";
import {
  BlockContext,
  BlockInstruction,
  CallableFunctionContext,
  WhackoMethodContext,
  WhackoFunctionContext,
  Value,
  createVariableReference,
} from "./ir";
import { FunctionContextResolutionPass } from "./passes/FunctionContextResolutionPass";
import { registerDefaultBuiltins } from "./builtins";
import { inspect } from "node:util";
import { ClassRulesPass } from "./passes/ClassRulesPass";
import { codegen } from "./codegen";

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

export interface WhackoProgram {
  LLVM: LLVMModule;
  LLVMUtil: Awaited<typeof import("llvm-js")>;
  globalScope: Scope;
  llvmModule: LLVMModuleRef;
  llvmCtx: LLVMContextRef;
  llvmBuilder: LLVMBuilderRef;
  diagnostics: Diagnostic[];
  staticLibraries: Set<string>;
  enums: Map<string, EnumType>;
  /** Absolute path to module. */
  modules: Map<string, WhackoModule>;
  baseDir: string;
  functions: Map<string, CallableFunctionContext>;
  queue: WhackoFunctionContext[];
  builtinTypeFunctions: Map<string, BuiltinTypeFunction>;
  builtinFunctions: Map<string, BuiltinFunction>;
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
  scope: Scope,
): Promise<WhackoModule | null> {
  const absolutePath = join(absoluteBaseFolder, modulePath);
  const relativePath = relative(program.baseDir, absolutePath);
  if (program.modules.has(absolutePath)) {
    return program.modules.get(absolutePath)!;
  }

  let mod: WhackoModule = {
    absolutePath,
    ast: null,
    contents: "",
    entry,
    exports: new Map(),
    relativePath,
    scope,
  };
  scope.module = mod;
  program.modules.set(absolutePath, mod);

  try {
    const contents = await readFile(absolutePath, "utf8");
    const parsedAst = assert(
      parse(contents, absolutePath),
      `Unable to parse contents of file ${modulePath}.`,
    );
    mod.contents = contents;

    for (const lexerError of parsedAst.lexerErrors) {
      reportErrorDiagnostic(program, mod, "lexer", null, lexerError.message);
    }

    for (const parserError of parsedAst.parserErrors) {
      reportErrorDiagnostic(
        program,
        mod,
        parserError.name,
        null,
        parserError.message,
      );
    }
    mod.ast = parsedAst.value;
  } catch (e: unknown) {
    const err = e as Error;
    reportErrorDiagnostic(program, mod, err.name, null, err.message);
    return null;
  }

  const moduleCollector = new ModuleCollectionPass(program);
  moduleCollector.visit(mod.ast);
  const modulesToAdd = moduleCollector.modulesToAdd;

  const childModules = [] as Array<Promise<WhackoModule | null>>;
  const dirnameOfModule = dirname(mod.absolutePath);

  for (const moduleToAdd of modulesToAdd) {
    childModules.push(
      addModuleToProgram(
        program,
        moduleToAdd,
        dirnameOfModule,
        false,
        createChildScope(program.globalScope),
      ),
    );
  }

  await Promise.all(childModules);
  return mod;
}

export function addStaticLibraryToProgram(
  program: WhackoProgram,
  filename: string,
  dirname: string,
) {
  const absolutePath = join(dirname, filename);
  program.staticLibraries.add(absolutePath);
}

export interface CompilationOutput {
  bitcode?: Buffer;
  object?: Buffer;
  textIR?: Buffer;
}

export function compile(program: WhackoProgram): CompilationOutput {
  const { LLVM, LLVMUtil } = program;
  const scopePopulationPass = new ScopePopulationPass(program);
  const modules = Array.from(program.modules.values());
  for (const module of modules) {
    scopePopulationPass.visitModule(module);
  }

  const importCollectionPass = new ImportCollectionPass(program);
  for (const module of modules) {
    importCollectionPass.visitModule(module);
  }

  const classRulesPass = new ClassRulesPass(program);
  for (const module of modules) {
    classRulesPass.visitModule(module);
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

  registerDefaultBuiltins(program);

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

  const { bitcode, textIR } = codegen(program);

  return {
    bitcode,
    textIR,
  };
}

export function churnQueue(program: WhackoProgram) {
  const pass = new FunctionContextResolutionPass(program);

  while (program.queue.length) {
    const func = assert(program.queue.pop());

    if (!program.functions.has(func.name)) {
      program.functions.set(func.name, func);
      pass.visitWhackoFunction(func);
    }
  }
}

export function ensureCallableCompiled(
  program: WhackoProgram,
  module: WhackoModule,
  callableAst: MethodClassMember | FunctionDeclaration,
  thisType: ClassType | null,
  typeParameters: ConcreteType[],
  typeMap: TypeMap,
): WhackoFunctionContext | null {
  const contextType = getCallableType(
    program,
    module,
    callableAst,
    thisType,
    typeParameters,
  );
  if (!contextType) return null;

  const ctx: WhackoFunctionContext = {
    attributes: [],
    blocks: new Map(),
    entry: null,
    funcRef: null,
    id: 0,
    instructions: new Map(),
    module,
    node: callableAst,
    name:
      module.entry && isFunctionDeclaration(callableAst) && callableAst.export
        ? callableAst.name.name
        : getFullyQualifiedCallableName(callableAst, contextType),
    type: contextType,
    typeMap,
    stackAllocationSites: new Map(),
    isWhackoFunction: true,
    isWhackoMethod: isMethodClassMember(callableAst),
  };

  if (isMethodClassMember(callableAst)) {
    const method = ctx as WhackoMethodContext;
    method.thisType = assert(
      thisType,
      "The class type for this method must exist.",
    );
  }

  program.queue.push(ctx);
  return ctx;
}

export function ensureConstructorCompiled(
  module: WhackoModule,
  concreteClass: ClassType,
  constructorType: MethodType,
  constructor: ConstructorClassMember,
): WhackoMethodContext {
  const ctx: WhackoMethodContext = {
    attributes: [],
    blocks: new Map(),
    entry: null,
    funcRef: null,
    id: idCounter.value++,
    instructions: new Map(),
    isWhackoFunction: true,
    isWhackoMethod: true,
    module,
    name: "placeholder hack",
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
  });

  ctx.name = getFullyQualifiedCallableName(ctx.node, ctx.type);

  // okay
  program.functions.FOOOSETMEHEHEHE;
  return ctx;
}
