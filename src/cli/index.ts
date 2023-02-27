import assert from "node:assert";
import fs from "node:fs/promises";
// @ts-ignore
import { parseArgs } from "node:util";
import { ArrayAccessExpression, BlockStatement } from "../language-server/generated/ast";
import { parse } from "../language-server/parser";
import { WhackoPass } from "../language-server/passes/WhackoPass";
import { WhackoProgram } from "../language-server/program";
// import { WhackoProgram } from "../compiler";

const options = {};

class Pass extends WhackoPass {
  override visitBlockStatement(node: BlockStatement): void {
    console.log(node);
    super.visitBlockStatement(node);
  }
}

export default async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options,
    allowPositionals: true,
  });
  const program = new WhackoProgram();
  for (const positional of positionals) {
    const file = await fs.readFile(positional, "utf-8");
    const ast = parse(file);
    const pass = new Pass();
    pass.visit(ast!.value);
  }
    //program.addModule(positional, process.cwd());
}
