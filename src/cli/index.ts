import { NodeFileSystem } from "langium/node";
import { createWhackoServices } from "../language-server/whacko-module";
import { extractAstNode } from "./cli-util";
import * as AST from "../language-server/generated/ast";
// @ts-ignore
import { parseArgs } from "node:util";

async function getAST(file: string, services: any): Promise<AST.Program> {
    return extractAstNode(file, services);
}

export default async function(): Promise<void> {
    const services = createWhackoServices(NodeFileSystem).Whacko;
    const ast = await getAST("./myFile.wo", services);
    console.log(ast);
}