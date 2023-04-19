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
  CompilationOutput,
  compile,
  createProgram,
  WhackoModule,
  WhackoProgram,
} from "../language-server/program";
import {
  addScopeElement,
  createChildScope,
  createNewScope,
} from "../language-server/scope";
import { Module as LLVMModule } from "llvm-js";
import { DiagnosticLevel } from "../language-server/diagnostic";
import { printProgramToString } from "../language-server/ir";

const options = {};

export interface CompilerOutput {
  program: WhackoProgram;
  files: Record<string, Buffer | string>;
}

export default async function main(args: string[]): Promise<CompilerOutput> {
  const LLVMUtil = (await eval(
    `import("llvm-js")`,
  )) as typeof import("llvm-js");
  const LLVM = (await LLVMUtil.load()) as LLVMModule;
  const { default: loadLLC } = await eval(`import("llvm-js/build/llc.js")`);
  const LLC = await loadLLC();
  const { default: loadLLD } = await eval(`import("llvm-js/build/lld.js")`);
  const LLD = await loadLLD();
  const { values, positionals } = parseArgs({
    args,
    options: {
      outWASM: { type: "string" },
      outWIR: { type: "string" },
      outLL: { type: "string" },
      outBC: { type: "string" },
      outO: { type: "string" },
      outIR: { type: "string" },
    },
    allowPositionals: true,
  }) as any;

  const program: WhackoProgram = createProgram(
    LLC,
    LLD,
    LLVM,
    "whacko-module",
    LLVMUtil,
  );

  // first step in any program is registering the builtins
  const stdLibs = glob("std/*.wo", {
    absolute: true,
    root: __dirname,
  });

  await Promise.all(
    stdLibs.map(async (stdLib) => {
      const dirname = path.dirname(stdLib);
      const basename = path.basename(stdLib);
      const module = assert(
        await addModuleToProgram(program, basename, dirname, false),
      );
      program.stdLibModules.push(module);
    }),
  );

  // then we register static lib files
  const staticLibs = glob(
    [
      "std/link/*.a",
      "std/gc/wasi-sysroot/lib/wasm32-wasi/*.o",
      "std/gc/wasi-sysroot/lib/wasm32-wasi/*.a",
    ],
    {
      absolute: true,
      root: __dirname,
    },
  );

  for (const staticLib of staticLibs) {
    const dirname = path.dirname(staticLib);
    const basename = path.basename(staticLib);
    await addStaticLibraryToProgram(program, basename, dirname);
  }

  // whacko input.wo
  for (const positional of positionals) {
    await addModuleToProgram(program, positional, process.cwd(), true);
  }

  const result = {
    program,
    files: {},
  } as CompilerOutput;

  try {
    const {
      bitcode: bcFile,
      textIR: llFile,
      object: oFile,
      wasm: wasmFile,
    } = compile(program);

    if (values.outBC && bcFile) result.files[values.outBC] = bcFile;
    if (values.outLL && llFile)
      result.files[values.outLL] = llFile.toString("utf8");
    if (values.outO && oFile) result.files[values.outO] = oFile;
    if (values.outWIR)
      result.files[values.outWIR] = printProgramToString(program);
    if (values.outWASM && wasmFile) result.files[values.outWASM] = wasmFile;

    // if (values.outWasm) "Can't output wasm files yet"; // fs.writeFile("./out.wasm", wasmFile);
  } catch (ex) {
    console.error(ex);
  }

  for (const diagnostic of program.diagnostics) {
    let level!: string;

    if (diagnostic.level === DiagnosticLevel.INFO) level = "INFO";
    else if (diagnostic.level === DiagnosticLevel.WARNING) level = "WARNING";
    else if (diagnostic.level === DiagnosticLevel.ERROR) level = "ERROR";
    else assert(false, "Received an invalid diagnostic level");

    if (diagnostic.module) {
      const range = diagnostic.node?.$cstNode?.range;
      if (range) {
        console.error(
          `${diagnostic.module.relativePath}:${range.start.line + 1}:${
            range.start.character + 1
          } ->`,
          level,
          diagnostic.message,
        );
      } else {
        console.error(diagnostic.module.relativePath, "->", level, diagnostic);
      }
    } else {
      console.error(
        "(No Module) ->",
        diagnostic.level,
        diagnostic.type,
        diagnostic.message,
      );
    }
  }

  return result;
}
