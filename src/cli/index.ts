import assert from "node:assert";
import fs from "node:fs/promises";
// @ts-ignore
import { parseArgs } from "node:util";
import {
  ArrayAccessExpression,
  BlockStatement,
} from "../language-server/generated/ast";
import { parse } from "../language-server/parser";
import { WhackoPass } from "../language-server/passes/WhackoPass";
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
  for (const positional of positionals) {
    program.addModule(positional, process.cwd());
  }

  program.compile();
  console.log(program.modules);
}
