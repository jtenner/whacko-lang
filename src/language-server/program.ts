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
import crypto from "node:crypto";

export type LLVMJSUtil = typeof import("llvm-js");

export function lowerStringArray(mod: any, args: string[]) {
  const ptrs = [] as number[];

  for (const arg of args) {
    const size = Buffer.byteLength(arg) + 1;
    const ptr = mod._malloc(size);
    ptrs.push(ptr);
    mod.stringToUTF8(arg, ptr, size);
  }

  const arraySize = args.length * 4 + 1;
  const arrayPtr = mod._malloc(arraySize);
  for (let i = 0; i < ptrs.length; i++) {
    const ptr = ptrs[i];
    mod.HEAPU32[(arrayPtr >>> 2) + i] = ptr;
  }

  return { ptrs, arrayPtr };
}

export class WhackoProgram {
  llvmContext: LLVMContextRef;
  constructor(
    public LLVM: Module,
    public LLVMUtil: LLVMJSUtil,
    public LLC: any,
    public LLD: any
  ) {
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

  staticLibs = new Map<string, Buffer>();
  addStaticLibrary(libPath: string, from: string): this {
    const absoluteLibPath = path.join(from, libPath);
    this.staticLibs.set(libPath, fs.readFileSync(absoluteLibPath));
    return this;
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

  compile() {
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
    const bufsize = this.LLVM._LLVMGetBufferSize(bufref);
    const bufstart = this.LLVM._LLVMGetBufferStart(bufref);

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
    const bcFile = Buffer.from(this.LLVM.HEAPU8.buffer, bufstart, bufsize);
    const llFile = Buffer.from(str);

    this.LLVM._LLVMDisposeMemoryBuffer(bufref);
    // this.LLVM._LLVMDisposeMemoryBuffer(derefObjBufferPtr as any);
    this.LLVM._free(messagePtr);
    this.LLVM._free(objBufferPtr);

    // write the bcFile into the memfs so that we can turn it into a wasm .o file
    const tmpFileBase = crypto.randomBytes(16).toString('base64url');
    const tmpBCName = "/" + tmpFileBase + ".bc";
    const tmpOName = "/" + tmpFileBase + ".o";
    this.LLC.FS.writeFile(tmpBCName, bcFile);
    this.LLC.FS.chmod(tmpBCName, 0o444);

    // we need to free every one of these pointers after calling _main()
    const { arrayPtr: llcArgvPtr, ptrs: llcArgvPtrs } = lowerStringArray(this.LLC, [
      "llc",
      tmpBCName,
      "--march=wasm32",
      "-o", 
      tmpOName,
      "-filetype=obj",
      "--experimental-debug-variable-locations",
      "--emit-call-site-info",
      "-O3"
    ]);
    // process.stdout.write(JSON.stringify(Object.keys(this.LLC.FS)));
    this.LLC._main(llcArgvPtrs.length, llcArgvPtr);
    this.LLC._free(llcArgvPtr);
    for (const ptr of llcArgvPtrs) this.LLC._free(ptr);
    const oFile = this.LLC.FS.readFile(tmpOName);

    // now we link it against libc and libm
    const staticLibFiles = [] as string[];
    for (const [staticLib, staticLibBuffer] of this.staticLibs) {
      const tmpFileBase = crypto.randomBytes(16).toString('base64url');
      const staticLibFile = "/" + tmpFileBase + path.extname(staticLib);
      staticLibFiles.push(staticLibFile);
      this.LLD.FS.writeFile(staticLibFile, staticLibBuffer);
      this.LLD.FS.chmod(staticLibFile, 0o444);
    }
    
    const tmpWasmName = "/" + tmpFileBase + ".wasm";
    this.LLD.FS.writeFile(tmpOName, oFile);
    this.LLD.FS.chmod(tmpOName, 0o444);

    const lldArgs = [
      "wasm-ld",
      tmpOName,
      "-o",
      tmpWasmName,
      ...staticLibFiles,
      "--verbose",
      "-O3"
    ];
    const { arrayPtr: lldArrayPtr, ptrs: lldArrayPtrs } = lowerStringArray(this.LLD, lldArgs);

    this.LLD._main(lldArrayPtrs.length, lldArrayPtr);
    this.LLD._free(lldArrayPtr);
    for (const ptr of lldArrayPtrs) this.LLD._free(ptr);
    // const wasmFile = this.LLC.FS.readFile(tmpWasmName);

    return { llFile, bcFile, oFile };
  }
}
