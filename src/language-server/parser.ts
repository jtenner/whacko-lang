import { ParseResult } from "langium";
import { NodeFileSystem } from "langium/node";
import { Program } from "./generated/ast";
import { createWhackoServices } from "./whacko-module";


const Whacko = createWhackoServices(NodeFileSystem).Whacko;

export function parse(contents: string, fullPath: string): ParseResult<Program> | null {
  const ast = Whacko.parser.LangiumParser.parse<Program>(contents);
  
  // @ts-ignore: This is for filename access later in compilation for type describing
  parsedContents.value[Symbol.for("fullPath")] = fullPath;
  return ast;
  // visitor.visit(ast);
}
