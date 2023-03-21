import { WhackoModule } from "./module";
import path from "node:path";
import fs from "node:fs";
import { parse } from "./parser";
import { assert, DiagnosticLevel } from "./util";
import { ModuleCollectionPass } from "./passes/ModuleCollectionPass";
import { ExportsPass } from "./passes/ExportsPass";
import { ImportsPass } from "./passes/ImportsPass";
import { ScopeCreationPass } from "./passes/ScopeCreationPass";
import {
  BuiltinFunction,
  BuiltinTypeFunction,
  DynamicTypeScopeElement,
  Scope,
  StaticTypeScopeElement,
} from "./types";
import { AstNode } from "langium";
import { registerDefaultBuiltins } from "./builtins";
import { CompilationPass } from "./passes/CompilationPass";
const stdlibFolder = path.join(__dirname, "../std");
import type {
  LLVMAttributeIndex,
  LLVMBasicBlockRef,
  LLVMBuilderRef,
  LLVMContextRef,
  LLVMModuleRef,
  LLVMMemoryBufferRef,
  LLVMVerifierFailureAction,
  LLVMTypeRef,
  LLVMValueRef,
  LLVMStringRef,
  Module,
} from "llvm-js";

export type LLVMJSUtil = typeof import("llvm-js");

export class WhackoProgram {
  llvmContext: LLVMContextRef;
  constructor(public LLVM: Module, public LLVMUtil: LLVMJSUtil) {
    registerDefaultBuiltins(this);
    this.llvmModule = LLVM._LLVMModuleCreateWithName(LLVMUtil.lower("whacko"));
    this.llvmContext = LLVM._LLVMContextCreate();
  }

  llvmModule: LLVMModuleRef;

  modules = new Map<string, WhackoModule>();
  globalScope = new Scope();
  builtins = new Map<string, BuiltinFunction>();
  builtinTypes = new Map<string, BuiltinTypeFunction>();
  names = new Map<AstNode, string>();

  addBuiltin(name: string, func: BuiltinFunction) {
    if (this.builtins.has(name)) {
      throw new Error("Builtin already defined.");
    }
    this.builtins.set(name, func);
  }

  addBuiltinType(name: string, func: BuiltinTypeFunction) {
    if (this.builtinTypes.has(name)) {
      throw new Error("Builtin already defined.");
    }
    this.builtinTypes.set(name, func);
  }

  addModule(
    modPath: string,
    from: string,
    entry: boolean,
    scope: Scope
  ): WhackoModule | null {
    const absoluteModPath = path.join(from, modPath);
    if (this.modules.has(absoluteModPath)) {
      return this.modules.get(absoluteModPath)!;
    }

    try {
      const contents = fs.readFileSync(absoluteModPath, "utf-8");
      const parsedContents = parse(contents, absoluteModPath);
      if (!parsedContents) return null;
      const mod = new WhackoModule(
        parsedContents.value,
        absoluteModPath,
        entry,
        scope
      );
      if (absoluteModPath.startsWith(stdlibFolder)) {
        const modName = path.basename(absoluteModPath, ".wo");
        this.modules.set("whacko:" + modName, mod);
      } else {
        this.modules.set(absoluteModPath, mod);
      }

      // Diagnostics from the parser get added at the module level
      for (const lexerDiagnostic of parsedContents.lexerErrors) {
        mod.diagnostics.push({
          level: DiagnosticLevel.Error,
          message: lexerDiagnostic.message,
          col: lexerDiagnostic.column!,
          line: lexerDiagnostic.line!,
        });
      }
      for (const parserDiagnostic of parsedContents.parserErrors) {
        mod.diagnostics.push({
          level: DiagnosticLevel.Error,
          message: parserDiagnostic.message,
          col: parserDiagnostic.token.startColumn!,
          line: parserDiagnostic.token.startLine!,
        });
      }

      // Module collection pass allows us to traverse imports as a first step
      const collectModules = new ModuleCollectionPass(this);
      collectModules.visitModule(mod);
      const dirname = path.dirname(absoluteModPath);
      for (const module of collectModules.modulesToAdd) {
        // this is where the child modules are added
        this.addModule(module, dirname, false, this.globalScope.fork());
      }
      return mod;
    } catch (ex) {
      console.error(ex);
      return null;
    }
  }

  compile(): Map<string, Buffer> {
    const exportsPass = new ExportsPass(this);
    for (const [, module] of this.modules) {
      exportsPass.visitModule(module);
    }

    const importsPass = new ImportsPass(this);
    for (const [, module] of this.modules) {
      importsPass.visitModule(module);
    }

    const scopeCreationPass = new ScopeCreationPass(this);
    for (const [, module] of this.modules) {
      scopeCreationPass.visitModule(module);
    }

    const compilationPass = new CompilationPass(this);

    const targetTriplePtr = this.LLVMUtil.lower("wasm32-wasi");
    const cpuPtr = this.LLVMUtil.lower("generic");
    const featuresPtr = this.LLVMUtil.lower("");
    const target = this.LLVM._LLVMGetTargetFromName(targetTriplePtr);
    const machine = this.LLVM._LLVMCreateTargetMachine(
      target,
      targetTriplePtr,
      cpuPtr,
      featuresPtr,
      this.LLVMUtil.LLVMCodeGenOptLevel.LLVMCodeGenLevelNone,
      this.LLVMUtil.LLVMRelocMode.LLVMRelocDefault,
      this.LLVMUtil.LLVMCodeModel.LLVMCodeModelLarge,
    );
    this.LLVM._LLVMSetTarget(this.llvmModule, targetTriplePtr);

    // TODO: Figure out why data layout is messing with things
    // const dataLayout = this.LLVM._LLVMCreateTargetDataLayout(machine);
    // this.LLVM._LLVMSetModuleDataLayout(this.llvmModule, dataLayout);

    const dataLayoutStrPtr = this.LLVM._LLVMGetDataLayoutStr(this.llvmModule);
    const dataLayoutStr = this.LLVMUtil.lift(dataLayoutStrPtr);
    this.LLVM._free(dataLayoutStrPtr);

    // compile the module
    compilationPass.compile(this);

    // post module creation
    const pm = this.LLVM._LLVMCreatePassManager();
    this.LLVM._LLVMFinalizeFunctionPassManager(pm);

    this.LLVM._free(targetTriplePtr);
    this.LLVM._LLVMDisposePassManager(pm);

    const strRef = this.LLVM._LLVMPrintModuleToString(this.llvmModule);
    const str = this.LLVMUtil.lift(strRef);
    console.error(str);

    const errorPointer = this.LLVM._malloc<LLVMStringRef[]>(4);
    this.LLVM._LLVMVerifyModule(
      this.llvmModule,
      1 as LLVMVerifierFailureAction,
      errorPointer
    );

    const stringPtr = this.LLVM.HEAPU32[errorPointer >>> 2] as LLVMStringRef;
    const errorString = stringPtr === 0 ? null : this.LLVMUtil.lift(stringPtr);
    console.error(errorString);

    const bufref = this.LLVM._LLVMWriteBitcodeToMemoryBuffer(this.llvmModule);
    const bufrefStart = this.LLVM.HEAPU32[bufref >>> 2];
    const bufrefEnd = this.LLVM.HEAPU32[(bufref >>> 2) + 1];

    this.LLVM._LLVMDisposeBuilder(compilationPass.builder);
    this.LLVM._LLVMDisposeModule(this.llvmModule);
    this.LLVM._LLVMDisposeTargetMachine(machine);
    this.LLVM._LLVMContextDispose(this.llvmContext);

    const messagePtr = this.LLVM._malloc<LLVMStringRef[]>(4);
    const objBufferPtr = this.LLVM._malloc<LLVMMemoryBufferRef[]>(4);
    // const objFileSuccess = this.LLVM._LLVMTargetMachineEmitToMemoryBuffer(
    //   machine,
    //   this.llvmModule,
    //   this.LLVMUtil.LLVMCodeGenFileType.LLVMObjectFile,
    //   // pointer to an error message
    //   messagePtr,
    //   objBufferPtr,
    // );

    // const derefObjBufferPtr = this.LLVM.HEAPU32[objBufferPtr >>> 2];
    // const objBufrefStart = this.LLVM.HEAPU32[derefObjBufferPtr >>> 2];
    // const objBufrefEnd = this.LLVM.HEAPU32[(derefObjBufferPtr >>> 2) + 1];

    const result = [
      ["test.bc", Buffer.from(this.LLVM.HEAPU8.buffer, bufrefStart, bufrefEnd - bufrefStart)],
      ["test.ll", Buffer.from(str)],
    ] as [string, Buffer][];

    this.LLVM._LLVMDisposeMemoryBuffer(bufref);
    // this.LLVM._LLVMDisposeMemoryBuffer(derefObjBufferPtr as any);
    this.LLVM._free(messagePtr);
    this.LLVM._free(objBufferPtr);

    // console.log(objFileSuccess)
    // if (objFileSuccess) {
    //   result.push(["test.o", Buffer.from(this.LLVM.HEAPU8.buffer, objBufrefStart, objBufrefEnd - objBufrefStart)]);
    // }
    return new Map(result);
  }
}
