import { sync as glob } from "glob";
import path from "node:path";
// @ts-ignore
import { parseArgs } from "node:util";
// import { WhackoProgram } from "../language-server/program";
import { assert } from "../language-server/util";
// import { WhackoProgram } from "../compiler";
import fs from "node:fs/promises";
import {
  addModuleToProgram,
  addStaticLibraryToProgram,
  compile,
  WhackoModule,
  WhackoProgram,
} from "../language-server/program";
import { createNewScope } from "../language-server/scope";
import { Module as LLVMModule } from "llvm-js";
import { DiagnosticLevel } from "../language-server/diagnostic";
import { inspect } from "node:util";

const options = {};

export default async function main(args: string[]): Promise<void> {
  const LLVMUtil = (await eval(
    `import("llvm-js")`
  )) as typeof import("llvm-js");
  const LLVM = (await LLVMUtil.load()) as LLVMModule;
  const { default: loadLLC } = await eval(`import("llvm-js/build/llc.js")`);
  const LLC = await loadLLC();
  const { default: loadLLD } = await eval(`import("llvm-js/build/lld.js")`);
  const LLD = await loadLLD();
  const { values, positionals } = parseArgs({
    args,
    options: {
      outWasm: { type: "string" },
      outLL: { type: "string" },
      outBC: { type: "string" },
      outO: { type: "string" },
    },
    allowPositionals: true,
  }) as any;

  const moduleName = LLVMUtil.lower("whacko-module");
  const program: WhackoProgram = {
    baseDir: process.cwd(),
    builtinTypeFunctions: new Map(),
    enums: new Map(),
    diagnostics: [],
    functions: new Map(),
    globalScope: createNewScope(),
    LLVM,
    llvmBuilder: LLVM._LLVMCreateBuilder(),
    llvmCtx: LLVM._LLVMContextCreate(),
    llvmModule: LLVM._LLVMModuleCreateWithName(moduleName),
    LLVMUtil,
    modules: new Map(),
    staticLibraries: new Set(),
  };
  LLVM._free(moduleName);

  // first step in any program is registering the builtins
  const stdLibs = glob("std/*.wo", {
    absolute: true,
    root: __dirname,
  });

  const stdLibModules = await Promise.all(
    stdLibs.map(async (stdLib) => {
      const dirname = path.dirname(stdLib);
      const basename = path.basename(stdLib);
      const module = await addModuleToProgram(
        program,
        basename,
        dirname,
        false,
        program.globalScope
      );
      return assert(module, `std lib ${stdLib} failed to create a module.`);
    })
  );

  // then we register static lib files
  const staticLibs = glob("std/*.a", {
    absolute: true,
    root: __dirname,
  });

  for (const staticLib of staticLibs) {
    const dirname = path.dirname(staticLib);
    const basename = path.basename(staticLib);
    addStaticLibraryToProgram(program, basename, dirname);
  }

  // whacko input.wo
  for (const positional of positionals) {
    await addModuleToProgram(
      program,
      positional,
      process.cwd(),
      true,
      createNewScope(program.globalScope)
    );
  }

  try {
    compile(program);
    // const { bcFile, llFile, oFile } = program.compile();
    // if (values.outWasm) "Can't output wasm files yet"; // fs.writeFile("./out.wasm", wasmFile);
    // if (values.outLL) await fs.writeFile("./out.ll", llFile);
    // if (values.outBC) await fs.writeFile("./out.bc", bcFile);
    // if (values.outO) await fs.writeFile("./out.o", oFile);
  } catch (ex) {
    console.error(ex);
  }

  for (const diagnostic of program.diagnostics) {
    let level: string;

    if (diagnostic.level === DiagnosticLevel.INFO) level = "INFO";
    else if (diagnostic.level === DiagnosticLevel.WARNING) level = "WARNING";
    else if (diagnostic.level === DiagnosticLevel.ERROR) level = "ERROR";
    else assert(false, "Received an invalid diagnostic level");

    console.error(
      diagnostic.module?.relativePath ?? "(no module)",
      "->",
      diagnostic.level,
      diagnostic.type,
      diagnostic.message
    );
  }
}
