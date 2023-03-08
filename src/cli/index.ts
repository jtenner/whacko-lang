import { glob } from "glob";
import path from "node:path";
// @ts-ignore
import { parseArgs } from "node:util";
import { WhackoProgram } from "../language-server/program";
import { assert } from "../language-server/util";
// import { WhackoProgram } from "../compiler";

const options = {};

export default async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options,
    allowPositionals: true,
  });
  const program = new WhackoProgram();

  // first step in any program is registering the builtins
  const stdLibs = glob.sync("std/*.wo", {
    absolute: true,
    root: __dirname,
  });

  for (const stdLib of stdLibs) {
    const dirname = path.dirname(stdLib);
    const basename = path.basename(stdLib);
    assert(program.addModule(basename, dirname, false, program.globalScope), `std lib ${stdLib} failed to create a module.`);
  }

  for (const positional of positionals) {
    program.addModule(
      positional,
      process.cwd(),
      true,
      program.globalScope.fork()
    );
  }

  program.compile();

  for (const [, module] of program.modules) {
    for (const diag of module.diagnostics) {
      console.log(diag);
    }
  }
}
