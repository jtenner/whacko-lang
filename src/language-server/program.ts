// import { Scope } from "langium";
import {
  LLVMBuilderRef,
  LLVMContextRef,
  LLVMModuleRef,
  LLVMValueRef,
  Module as LLVMModule,
} from "llvm-js";
import { dirname, join, relative } from "node:path";
import { Scope, createNewScope, ScopeElement, ScopeElementType } from "./scope";
import { readFile } from "node:fs/promises";
import { Diagnostic, reportErrorDiagnostic } from "./diagnostic";
import { parse } from "./parser";
import { assert } from "./util";
import { AstNode } from "langium";
import { parseArgs } from "node:util";
import { ModuleCollectionPass } from "./passes/ModuleCollectionPass";
import { ScopePopulationPass } from "./passes/ScopePopulationPass";
import { ImportCollectionPass } from "./passes/ImportCollectionPass";
import { isFunctionDeclaration } from "./generated/ast";
import { ConcreteType, EnumType, FunctionType, MethodType } from "./types";

export interface ConcreteFunction {
  funcType: FunctionType;
  funcRef: LLVMValueRef;
}

export interface ConcreteMethod {
  funcType: MethodType;
  funcRef: LLVMValueRef;
}

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
  functions: Map<string, ConcreteFunction>;
  builtinTypeFunctions: Map<string, BuiltinTypeFunction>;
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
  program.modules.set(absolutePath, mod);

  try {
    const contents = await readFile(absolutePath, "utf8");
    const parsedAst = assert(
      parse(contents, absolutePath),
      `Unable to parse contents of file ${modulePath}.`,
    );
    mod.contents = contents;

    for (const lexerError of parsedAst.lexerErrors) {
      reportErrorDiagnostic(program, "lexer", null, mod, lexerError.message);
    }

    for (const parserError of parsedAst.parserErrors) {
      reportErrorDiagnostic(
        program,
        parserError.name,
        null,
        mod,
        parserError.message,
      );
    }
    mod.ast = parsedAst.value;
  } catch (e: unknown) {
    const err = e as Error;
    reportErrorDiagnostic(program, err.name, null, mod, err.message);
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
        createNewScope(program.globalScope),
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

export function compile(program: WhackoProgram) {
  const scopePopulationPass = new ScopePopulationPass(program);
  const modules = Array.from(program.modules.values());
  for (const module of modules) {
    scopePopulationPass.visitModule(module);
  }

  const importCollectionPass = new ImportCollectionPass(program);
  for (const module of modules) {
    importCollectionPass.visitModule(module);
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
        "initialization",
        startFunction,
        module,
        "Found multiple exported _start functions.",
      );
    }
    return;
  } else if (mainModuleMaybe.length === 0) {
    reportErrorDiagnostic(
      program,
      "initialization",
      null,
      null,
      "Could not find an exported _start function.",
    );
    return;
  }
}

