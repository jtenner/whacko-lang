import moo from "moo";

function keyword(rules: any, keyword: string): void {
  rules[keyword] = keyword;
}

function symbol(rules: any, name: string, symbol: string): void {
  rules[name] = symbol;
}

const rules = {} as any;
const keywords = {} as any;

export const letKeyword = keyword(keywords, "let");
export const constKeyword = keyword(keywords, "const");
export const whileKeyword = keyword(keywords, "while");
export const fnKeyword = keyword(keywords, "fn");
export const genKeyword = keyword(keywords, "gen");
export const grabKeyword = keyword(keywords, "grab");
export const holdKeyword = keyword(keywords, "hold");
export const trueKeyword = keyword(keywords, "true");
export const falseKeyword = keyword(keywords, "false");
export const asyncKeyword = keyword(keywords, "async");
export const yieldKeyword = keyword(keywords, "yield");
export const importKeyword = keyword(keywords, "import");
export const fromKeyword = keyword(keywords, "from");
export const asKeyword = keyword(keywords, "as");

rules.identifier = {
  match: /[a-zA-Z_$][a-zA-Z_$0-9]*/,
  type: moo.keywords(keywords)
};

// symbols
export const colon = symbol(rules, "colon", ":");
export const comma = symbol(rules, "comma", ",");
export const gte = symbol(rules, "gte", ">=");
export const lte = symbol(rules, "lte", "<=");
export const gt = symbol(rules, "gt", ">");
export const lt = symbol(rules, "lt", "<");
export const lparen = symbol(rules, "lparen", "(");
export const rparen = symbol(rules, "rparen", ")");
export const lbracket = symbol(rules, "lbracket", "[");
export const rbracket = symbol(rules, "rbracket", "]");
export const lbrace = symbol(rules, "lbrace", "{");
export const rbrace = symbol(rules, "rbrace", "}");
export const lcaret = symbol(rules, "lcaret", "<");
export const rcaret = symbol(rules, "rcaret", ">");
export const question = symbol(rules, "question", "?");
export const equalsequals = symbol(rules, "equalsequals", "==");
export const equals = symbol(rules, "equals", "=");
export const notequals = symbol(rules, "notequals", "!=");
export const not = symbol(rules, "not", "!");
export const bitwisenot = symbol(rules, "bitwisenot", "~");
export const xor = symbol(rules, "xor", "^");
export const starstar = symbol(rules, "starstar", "**");
export const star = symbol(rules, "star", "*");
export const semicolon = symbol(rules, "semicolon", ";");

function match(rules: any, name: string, regex: RegExp): void {
  rules[name] = regex;
}

// whitespace rule
rules.ws =  { match: /[ \t\r\n]+/, lineBreaks: true };

match(rules, "binary", /0b[10]+/);
match(rules, "hex", /0x[0-9a-fA-F]+/);
match(rules, "octal", /0o[0-8]+/);
match(rules, "float", /[-+]?[0-9]+[.]?[0-9]*(?:[eE][-+]?[0-9]+)?/);
match(rules, "str", /"(?:[^"]|\\\.)*"/);

export const tokenizer = moo.compile(rules);
export const tokenize = (str: string) => Array.from(tokenizer.reset(str)).filter(e => e.type != "ws");