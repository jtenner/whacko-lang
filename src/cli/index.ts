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
  for (const positional of positionals)
    program.addModule(positional, process.cwd());
}
