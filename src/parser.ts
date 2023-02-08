import grammar, { /* AST NODES ARE HERE */ ProgramNode } from "./grammar.js";
import ne from "nearley";

import {equal, ok} from "node:assert/strict";

const compiledGrammar = ne.Grammar.fromCompiled(grammar);

// okay. Any questions?

export class Parser {
  public parse(str: string): ProgramNode | null {
    const parser = new ne.Parser(compiledGrammar);
    
    try {
      parser.feed(str);
  
      equal(parser.results.length, 1, "Parse returned multiple or no results");
      ok(parser.results[0] instanceof ProgramNode, "Parse result is not a ProgramNode.");
      
      return parser.results[0];
    } catch(ex) {
      console.log((ex as any).message);
    }
    return null;
  }

  public async parseStream(stream: AsyncIterable<string>): Promise<ProgramNode | null> {
    const parser = new ne.Parser(compiledGrammar);
    try {
      for await (const chunk of stream) {
          parser.feed(chunk);
      }
      equal(parser.results.length, 1, "Parse returned multiple or no results");
      ok(parser.results[0] instanceof ProgramNode, "Parse result is not a ProgramNode");
      return parser.results[0];
    } catch(ex) {
      console.log(ex);
    }
    return null;
  }
}
