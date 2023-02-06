@preprocessor typescript

@{%
const identity = (d: any) => d[0];
export abstract class Node {}
export class ExpressionNode extends Node {}
export class StatementNode extends Node {}
export class DeclarationNode extends Node {}

export class IdentifierNode extends Node {
  constructor(
    public name: string,
  ) {
    super();
  }
}

export class TypeIdentifierNode extends Node {
  constructor(
    public name: string,
  ) {
    super();
  }
}

const keywords = new Set([
  "async",
  "hold",
  "grab",
  "fn",
  "type",
  "while",
]);
%}

Entry -> _ Program _ {% (d: any) => d[1] %}

List[Item, Sep] -> $Item ($Sep $Item):* {%
  (d: any) => [d[0][0], ...d[1].map((e: any) => e[1][0])]
%}

@{%
export class ProgramNode extends Node {
  constructor(
    public delcarations: DeclarationNode[],
  ) {
    super();
  }
}
%}

Program -> List[Declaration, _] {% (d: any) => new ProgramNode(d[0]) %}

@{%

export class BinaryExpressionNode extends ExpressionNode {
  constructor(
    public left: ExpressionNode,
    public op: string,
    public right: ExpressionNode
  ) {
    super();
  }
}

%}

BinaryExpression[Left, Op, Right] -> $Left _ $Op _ $Right {%
  (d: any) => new BinaryExpressionNode(
    d[0][0],
    d[2][0][0],
    d[4][0],
  );
%}


_ -> __:?
__ -> [\r\t\n ]:+

Identifier -> [$_a-zA-Z] [$_a-zA-Z0-9]:* {%
  (d: any, _idx: any, reject: any) => {
    const name = d[0] + d[1].join("");
    if (keywords.has(name)) return reject;
    return new IdentifierNode(name);
  }
%}

TypeIdentifier -> [$_a-zA-Z] [$_a-zA-Z0-9]:* {%
  (d: any, _idx: any, reject: any) => {
    const name = d[0] + d[1].join("");
    if (keywords.has(name)) return reject;
    return new TypeIdentifierNode(name);
  }
%}

String -> "\"" _string "\"" {% function(d) {return {'literal':d[1]}; } %}
 
_string ->
    null {% function() {return ""; } %}
    | _string _stringchar {% function(d) {return d[0] + d[1];} %}
 
_stringchar ->
    [^\\"] {% id %}
    | "\\" [^] {% function(d) {return JSON.parse("\"" + d[0] + d[1] + "\""); } %}

