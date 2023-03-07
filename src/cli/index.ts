import { glob } from "glob";
import path from "node:path";
// @ts-ignore
import { parseArgs } from "node:util";
import { WhackoProgram } from "../language-server/program";
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
    program.addModule(basename, dirname, false, program.globalScope);
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
  for (const [name, module] of program.modules) {
    console.log(name, module);
  }
}
