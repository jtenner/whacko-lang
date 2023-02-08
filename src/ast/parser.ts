import { ProgramNode, DeclarationNode } from "./ast.js";
import { Token } from "moo";

export type ParseResult = [Node, number];

export class WhackoParser {
  parse(tokens: Token[]): ParseResult {
    let index = 0;
    return this.parseProgram(tokens, index) as ParseResult;
  }

  parseProgram(tokens: Token[], index: number): ProgramNode | null {
    while (true) {
      const declaration = this.parseDeclarationNode(tokens, index);
      if (declaration) {

      } else break;
    }
    throw new Error("Method not implemented.");
  }
}
