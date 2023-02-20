import { NodeFileSystem } from "langium/node";
import { createWhackoServices } from "../language-server/whacko-module";
import { extractAstNode } from "./cli-util";
import * as AST from "../language-server/generated/ast";
// @ts-ignore
import { parseArgs } from "node:util";
import { promises as fs } from "node:fs"; 
import { AstNode, CompositeCstNode, CstNode, isAstNode, isCompositeCstNode, RootCstNode } from "langium";
import { WhackoVisitor } from "../language-server/WhackoVisitor";

const Whacko = createWhackoServices(NodeFileSystem).Whacko;


export default async function(): Promise<void> {
    const program = await fs.readFile("./myFile.wo", "utf-8");
    const ast = Whacko.parser.LangiumParser.parse(program).value;
    // visitor.visit(ast);
}