import { ParseResult } from "langium";
import { NodeFileSystem } from "langium/node";
import { Program } from "./generated/ast";
import { createWhackoServices } from "./whacko-module";
import fs from "node:fs";

const Whacko = createWhackoServices(NodeFileSystem).Whacko;

export function parse(contents: string): ParseResult<Program> | null {
  const ast = Whacko.parser.LangiumParser.parse<Program>(contents);
  return ast;
  // visitor.visit(ast);
}
