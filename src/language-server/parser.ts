import { AstNode, ParseResult } from "langium";
import { NodeFileSystem } from "langium/node";
import { Program } from "./generated/ast";
import { createWhackoServices } from "./whacko-module";
import fs from "node:fs";

const Whacko = createWhackoServices(NodeFileSystem).Whacko;

export function parse(file: string): ParseResult<Program> {
  const contents = fs.readFileSync(file, "utf-8");
  const ast = Whacko.parser.LangiumParser.parse<Program>(contents);
  return ast;
  // visitor.visit(ast);
}
