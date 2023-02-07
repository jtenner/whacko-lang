// import { BaseWhackoVisitor } from "../ast/visitor";
// import { parser } from "../ast/parser.js";
import { lexer } from "../ast/lexer.js";
import glob from "glob";
import fs from "fs";
// import path from "path";

const files = glob.sync("./test/ast/*.wo");

for (const file of files) {
  // const dirname = path.dirname(file);
  // const basename = path.basename(file, path.extname(file));
  const contents = fs.readFileSync(file, "utf-8");
  const tokens = lexer.tokenize(contents);
  console.log(tokens);
  // parser.input = tokens.tokens;
  // const program = parser.Program();
  // console.log(program);
}
