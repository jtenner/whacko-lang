import grammar, { /* AST NODES ARE HERE */ ProgramNode } from "./grammar";
import ne from "nearley";

import {equal, ok} from "node:assert/strict";

const compiledGrammar = ne.Grammar.fromCompiled(grammar);

// okay. Any questions?

export class Parser {
  public parse(str: string): ProgramNode | null {
    const parser = new ne.Parser(compiledGrammar);
    
    parser.feed(str);

    equal(parser.results.length, 1, "Parse returned multiple or no results");
    ok(parser.results[0] instanceof ProgramNode, "Parse result is a ProgramNode.");
    
    return parser.results[0];
  }

  public async parseStream(stream: AsyncIterable<string>): Promise<ProgramNode> {
    const parser = new ne.Parser(compiledGrammar)
    for await (const chunk of stream) {
        parser.feed(chunk);
    }
    equal(parser.results.length, 1, "Parse returned multiple or no results");
    ok(parser.results[0] instanceof ProgramNode, "Parse result is a ProgramNode");
    return parser.results[0];
  }
}