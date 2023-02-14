import { NodeFileSystem } from "langium/node";
import { createWhackoServices } from "../language-server/whacko-module";
import { extractAstNode } from "./cli-util";
import * as AST from "../language-server/generated/ast";
// @ts-ignore
import { parseArgs } from "node:util";
import { promises as fs } from "node:fs"; 
import { AstNode, CompositeCstNode, CstNode, isAstNode, isCompositeCstNode, RootCstNode } from "langium";

const Whacko = createWhackoServices(NodeFileSystem).Whacko;

function visit(node: any, cb: (node: AstNode) => void): void {
    if (isAstNode(node)) {
        cb(node);
        for (const key of Object.keys(node)) {
            if (key.startsWith("$")) continue;
            const child = (node as any)[key];
            visit(child, cb);
        }
    } else if (node instanceof Array) {
        for (const child of node) {
            visit(child, cb);
        }
    }
}



export default async function(): Promise<void> {
    
    const program = await fs.readFile("./myFile.wo", "utf-8");
    const ast = Whacko.parser.LangiumParser.parse(program).value;
    visit(ast, (node: AstNode) => {
        console.log(node);
    });
}