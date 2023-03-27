import { sync as glob } from "glob";
import path from "node:path";
// @ts-ignore
import { parseArgs } from "node:util";
import { WhackoProgram } from "../language-server/program";
import { assert } from "../language-server/util";
// import { WhackoProgram } from "../compiler";
import fs from "node:fs/promises";

const options = {
  
}

export default async function main(args: string[]): Promise<void> {
  const LLVMUtil = await eval(`import("llvm-js")`);
  const LLVM = await LLVMUtil.load();
  const { default: loadLLC } = await eval(`import("llvm-js/build/llc.js")`);
  const LLC = await loadLLC();
  const { default: loadLLD } = await eval(`import("llvm-js/build/lld.js")`);
  const LLD = await loadLLD();
  const { values, positionals } = parseArgs({
    args,
    options: {
      "outWasm": { type: "string" },
      "outLL": { type: "string" },
      "outBC": { type: "string" },
      "outO": { type: "string" },
    },
    allowPositionals: true,
  }) as any;

  const program = new WhackoProgram(LLVM, LLVMUtil, LLC, LLD);

  // first step in any program is registering the builtins
  const stdLibs = glob("std/*.wo", {
    absolute: true,
    root: __dirname,
  });

  for (const stdLib of stdLibs) {
    const dirname = path.dirname(stdLib);
    const basename = path.basename(stdLib);
    assert(
      program.addModule(basename, dirname, false, program.globalScope),
      `std lib ${stdLib} failed to create a module.`
    );
  }

  // then we register static lib files
  const staticLibs = glob("std/*.a", {
    absolute: true,
    root: __dirname,
  });

  for (const staticLib of staticLibs) {
    const dirname = path.dirname(staticLib);
    const basename = path.basename(staticLib);
    program.addStaticLibrary(basename, dirname);
  }

  for (const positional of positionals) {
    program.addModule(
      positional,
      process.cwd(),
      true,
      program.globalScope.fork()
    );
  }

  try {
    const { bcFile, llFile, oFile } = program.compile();
    if (values.outWasm) console.log("Can't output wasm files yet"); // fs.writeFile("./out.wasm", wasmFile);
    if (values.outLL) await fs.writeFile("./out.ll", llFile);
    if (values.outBC) await fs.writeFile("./out.bc", bcFile);
    if (values.outO) await fs.writeFile("./out.o", oFile);
  } catch (ex) {
    console.error(ex);
  }

  for (const [, module] of program.modules) {
    for (const diag of module.diagnostics) {
      console.error(module.path, "->", diag);
    }
  }
}
