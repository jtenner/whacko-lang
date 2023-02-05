@{%/*

    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence

    18:
        Grouping (parentheses)
    17:
        Member Access (dot notation, left-to-right associative)
        TODO: Optional Chaining
        Computed Member Access (bracket notation, for arrays!) /// okay finish up 17 and then we do computed member access
        new Clazz(...args)
        call(...args)
    16: // stop here please focus on the grammar now
        Logical NOT (!)	n/a	! …
        Bitwise NOT (~)	~ …
        Unary plus (+)	+ …
        Unary negation (-)	- …
        Prefix Increment	++ …
        Prefix Decrement	-- …
        typeof	typeof …
        void	void …
        delete	delete …
        await

*/%}


Expression -> PrefixExpression {% identity %}

@{%
export class PrefixExpressionNode extends ExpressionNode {
  constructor(
    public operator: string,
    public expr: ExpressionNode,
  ) {
    super();
  }
}
%}

PrefixExpression -> ("++" | "--" | "+" | "-" | "await" | "!" | "~") _ NewExpression {%
  (d: any) => new PrefixExpressionNode(d[0][0], d[2])
%}
  | NewExpression {% identity %}

@{%
class NewExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode, // we can figure this out later
    public params: ExpressionNode[],
  ) {
    super();
  }
}
%}

NewExpression -> "new" __ Expression _ "(" _ (List[Expression, (_ "," _)] _):? ")" {%
// the ()'s cause a nesting so 1st element of the 7th element 
  (d: any) => new NewExpressionNode(d[2], d[6][0])
%}
  | CallExpression {% identity %}

@{%
class CallExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
    public params: ExpressionNode[],
  ) {
    super();
  }
}
%}

CallExpression -> Expression _ "(" _ (List[Expression, (_ "," _)] _):? ")" {%
  (d: any) => new CallExpressionNode(d[0], d[4][0])
%}
  | ComputedMemberAccess {% identity %}

@{%

export class ComputedMemberAccessNode extends ExpressionNode {
  constructor(
    public expression: ExpressionNode,
    public member: ExpressionNode,
  ) {
    super();
  }
}

%}

ComputedMemberAccess -> Expression _ "[" _ Expression _ "]" {%
  d => new ComputedMemberAccessNode(d[0], d[4])
%}
 | MemberAccessExpression {% identity %}

@{%
export class MemberAccessExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
    public property: IdentifierNode,
  ) {
    super();
  }
}

%}

MemberAccessExpression -> Expression _ "." _ Identifier {%
  (d: any) => new MemberAccessExpressionNode(d[0], d[4])
  // now look down here
  // this is part of the grammar. That's how it has to be
%} 
  | Identifier {% identity %}
  | Grouping {% identity %}

Grouping -> "(" _ Expression _ ")" {%
 // we simply need to return the expression in the parenthesis
 (d: any) => d[2]
%}
 | InlineAsyncExpression

 @{%
export class InlineAsyncExpressionNode extends ExpressionNode {
  constructor(
    public type: TypeExpressionNode,
    public block: BlockStatementNode,
  ) {
    super();
  }
}
%}

InlineAsyncExpression -> "async" _ "<" _ TypeExpression _ ">" _ BlockStatement {%
  (d: any) => new InlineAsyncExpressionNode(d[4], d[8])
%}

