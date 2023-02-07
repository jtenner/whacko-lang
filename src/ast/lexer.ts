import { createToken, ITokenConfig, Lexer } from "chevrotain";

function skip(name: string, pattern: RegExp): ITokenConfig {
  return {
    name,
    pattern,
    group: Lexer.SKIPPED,
  };
}

export const identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z$_][a-zA-Z$_0-9]*/,
});

function keyword(kw: string): ITokenConfig {
  return {
    name: kw,
    pattern: kw,
    longer_alt: identifier,
  };
}

function symbol(name: string, pattern: string): ITokenConfig {
  return {
    name,
    pattern,
  };
}

// keywords
export const letKeyword = keyword("let");
export const constKeyword = keyword("const");
export const whileKeyword = keyword("while");
export const fnKeyword = keyword("fn");
export const genKeyword = keyword("gen");
export const grabKeyword = keyword("grab");
export const holdKeyword = keyword("hold");
export const trueKeyword = keyword("true");
export const falseKeyword = keyword("false");
export const asyncKeyword = keyword("async");
export const yieldKeyword = keyword("yield");
export const importKeyword = keyword("import");
export const fromKeyword = keyword("from");
export const asKeyword = keyword("as");

// symbols
export const colon = symbol("colon", ":");
export const comma = symbol("comma", ",");
export const gte = symbol("gte", ">=");
export const lte = symbol("lte", "<=");
export const gt = symbol("gt", ">");
export const lt = symbol("lt", "<");
export const lparen = symbol("lparen", "(");
export const rparen = symbol("rparen", ")");
export const lbracket = symbol("lbracket", "[");
export const rbracket = symbol("rbracket", "]");
export const lbrace = symbol("lbrace", "{");
export const rbrace = symbol("rbrace", "}");
export const lcaret = symbol("lcaret", "<");
export const rcaret = symbol("rcaret", ">");
export const question = symbol("question", "?");
export const equalsequals = symbol("equalsequals", "==");
export const equals = symbol("equals", "=");
export const notequals = symbol("notequals", "!=");
export const not = symbol("not", "!");
export const bitwisenot = symbol("bitwisenot", "~");
export const xor = symbol("xor", "^");
export const starstar = symbol("starstar", "**");
export const star = symbol("star", "*");
export const semicolon = symbol("semicolon", ";");

// consts
export const binaray = {
  name: "binary",
  pattern: /0b[10]+/,
};
export const hex = {
  name: "hex",
  pattern: /0x[0-9a-fA-F]+/,
};
export const octal = {
  name: "octal",
  pattern: /0o[0-9a-fA-F]+/,
};
export const float = {
  name: "float",
  pattern: /[-+]?[0-9]+[.]?[0-9]*([eE][-+]?[0-9]+)?/,
};
export const str = {
  name: "str",
  pattern: /"([^"]|\\\.)*"/,
};

export const tokens = [
  skip("ws", /[\s]+/),
  identifier,
  letKeyword,
  constKeyword,
  whileKeyword,
  fnKeyword,
  genKeyword,
  grabKeyword,
  holdKeyword,
  trueKeyword,
  falseKeyword,
  asyncKeyword,
  yieldKeyword,
  importKeyword,
  fromKeyword,
  asKeyword,
  colon,
  comma,
  gte,
  lte,
  gt,
  lt,
  lparen,
  rparen,
  lbracket,
  rbracket,
  lbrace,
  rbrace,
  lcaret,
  rcaret,
  question,
  equalsequals,
  equals,
  notequals,
  not,
  bitwisenot,
  xor,
  starstar,
  star,
  semicolon,
  binaray,
  hex,
  octal,
  float,
  str,
];

export const lexer = new Lexer(tokens);
