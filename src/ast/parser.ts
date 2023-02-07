import { CstNode, CstParser, ParserMethod } from "chevrotain";
import { comma, fromKeyword, importKeyword, lbrace, rbrace, str, tokens, semicolon, identifier, asKeyword  } from "./lexer.js"

export class WhackoParser extends CstParser {
  // for each rule that must be defined, make a stub for intelisense
  Program!: ParserMethod<[], CstNode>;
  Declaration!: ParserMethod<[], CstNode>;
  ImportDeclaration!: ParserMethod<[], CstNode>;
  ImportDeclarator!: ParserMethod<[], CstNode>;

  constructor() {
    super(tokens);
    const $ = this;

    $.RULE("Program", () => {
      $.MANY($.Declaration);
    });

    $.RULE("Declaration", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.ImportDeclaration) },
        // { ALT: () => $.SUBRULE($.ExportDeclaration) },
        // { ALT: () => $.SUBRULE($.FunctionDeclaration) },
        // { ALT: () => $.SUBRULE($.GeneratorDeclaration) },
        // { ALT: () => $.SUBRULE($.GlobalDeclaration) },
      ]);
    });

    $.RULE("ImportDeclaration", () => {
      $.CONSUME(importKeyword);
      $.CONSUME(lbrace);
      $.MANY_SEP({
        SEP: comma,
        DEF: () => {
          $.SUBRULE($.ImportDeclarator);
        },
      });
      $.CONSUME(rbrace);
      $.CONSUME(fromKeyword);
      $.CONSUME(str);
      $.CONSUME(semicolon);
    });

    $.RULE("ImportDeclarator", () => {
      $.CONSUME(identifier);
      $.OPTION(() => {
        $.CONSUME(asKeyword);
        $.CONSUME1(identifier);
      });
    });

    this.performSelfAnalysis();
  }
}

export const parser = new WhackoParser();
