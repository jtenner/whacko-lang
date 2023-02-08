# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence

@{%/*

Paths	

Method calls

Field expressions	left to right

Function calls, array indexing
	
Unary - * ! & &mut	

as	left to right

* / %	left to right

+ -	left to right

<< >>	left to right

&	left to right

^	left to right

|	left to right

== != < > <= >=	Require parentheses

&&	left to right

||	left to right

.. ..=	Require parentheses

right to left	


*/%}


@{%

export class YieldExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
  ) {
    super();
  }
}

export class ConditionalExpressionNode extends ExpressionNode {
  constructor(
    public condition: ExpressionNode,
    public ifTrue: ExpressionNode,
    public ifFalse: ExpressionNode,
  ) {
    super();
  }
}

export class AsExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
    public type: TypeExpressionNode,
  ) {
    super();
  }
}

export class AwaitExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
  ) {
    super();
  }
}

export class NewExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
    public typeParameters: TypeExpressionNode[] | null,
    public parameters: ExpressionNode[] | null,
  ) {
    super();
  }
}

export class MemberAccessExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
    public member: IdentifierNode,
  ) {
    super();
  }
}

export class CallExpressionNode extends ExpressionNode {
  constructor(
    public callee: ExpressionNode,
    public typeParameters: TypeExpressionNode[],
    public parameters: ExpressionNode[] | null,
  ) {
    super();
  }
}

export class IndexAccessExpressionNode extends ExpressionNode {
  constructor(
    public accessee: ExpressionNode,
    public expr: ExpressionNode,
  ) {
    super();
  }
}

export class IdentifierExpressionNode extends ExpressionNode {
  constructor(
    public name: IdentifierNode,
  ) {
    super();
  }
}

%}

Expression -> Precedence1 {% identity %}

Precedence1 -> (YieldExpression | ConditionalExpression) {% (d: any) => d[0][0] %}
             | Precedence2 {% identity %}

YieldExpression -> "yield" _ Precedence1 {%
  (d: any) => new YieldExpressionNode(d[2])
%}

ConditionalExpression -> Precedence2 _ "?" _ Precedence1 _ ":" _ Precedence1 {%
  (d: any) => new ConditionalExpressionNode(d[0], d[1], d[2])
%}

Precedence2 -> AssignmentExpression {% identity %}
             | Precedence3 {% identity %}

AssignmentExpression -> BinaryExpression[MemberAccessExpression, ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>="), Precedence2] {% identity %}
                      | BinaryExpression[IdentifierExpression, ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>="), Precedence2] {% identity %}

Precedence3 -> LogicalOrExpression {% identity %}
             | Precedence4 {% identity %}

LogicalOrExpression -> BinaryExpression[Precedence3, ("||"), Precedence4] {% identity %}

Precedence4 -> LogicalAndExpression {% identity %}
             | Precedence5 {% identity %}

LogicalAndExpression -> BinaryExpression[Precedence4, ("&&"), Precedence5] {% identity %}

Precedence5 -> EqualityExpression {% identity %}
             | Precedence6 {% identity %}

EqualityExpression -> BinaryExpression[Precedence5, ("==" | "!=" | "<" | ">" | "<=" | ">="), Precedence6] {% identity %}

Precedence6 -> BitwiseOrExpression {% identity %}
             | Precedence7 {% identity %}

BitwiseOrExpression -> BinaryExpression[Precedence6, ("|"), Precedence7] {% identity %}

Precedence7 -> BitwiseXOrExpression {% identity %}
             | Precedence8 {% identity %}

BitwiseXOrExpression -> BinaryExpression[Precedence7, ("^"), Precedence8] {% identity %}

Precedence8 -> BitwiseAndExpression {% identity %}
             | Precedence9 {% identity %}

BitwiseAndExpression -> BinaryExpression[Precedence8, ("&"), Precedence9] {% identity %}

Precedence9 -> BitshiftExpression {% identity %}
             | Precedence10 {% identity %}

BitshiftExpression -> BinaryExpression[Precedence9, ("<<" | ">>"), Precedence10] {% identity %}

Precedence10 -> SumExpression {% identity %}
              | Precedence11 {% identity %}

SumExpression -> BinaryExpression[Precedence10, ("+" | "-"), Precedence11] {% identity %}

Precedence11 -> ProductExpression {% identity %}
              | Precedence12 {% identity %}

ProductExpression -> BinaryExpression[Precedence11, ("*" | "/" | "%"), Precedence12] {% identity %}

Precedence12 -> AsExpression {% identity %}
              | Precedence13

AsExpression -> Precedence12 _ "as" _ TypeExpression {%
  (d: any) => new AsExpressionNode(d[0], d[4])
%}

Precedence13 -> LogicalNotExpression {% identity %}
              | NegativeExpression {% identity %}
              | BitwiseNotExpression {% identity %}
              | AwaitExpression {% identity %}
              | Precedence14

LogicalNotExpression -> LeftUnaryExpression[("!"), Precedence13] {% identity %}
NegativeExpression -> LeftUnaryExpression[("-"), Precedence13] {% identity %}
BitwiseNotExpression -> LeftUnaryExpression[("~"), Precedence13] {% identity %}

AwaitExpression -> "await" __ Precedence13 {%
  (d: any) => new AwaitExpressionNode(d[2])
%}

Precedence14 -> NewExpression {% identity %}
              | CallExpression {% identity %}
              | IndexAccessExpression {% identity %}
              | MemberAccessExpression {% identity %}
              | IdentifierExpression {% identity %}
              | GroupExpression {% identity %}
              | NumericExpression {% identity %}

NewExpression -> "new" __ (MemberAccessExpression | IdentifierExpression) _
                 ("<" _ List[TypeExpression, (_ "," _)] _ ">" _):?
                 "(" _ (List[Expression, (_ "," _)] _):? ")"
{%
  (d: any) => new NewExpressionNode(
    d[2][0],
    d[4] ? d[4][2] : null,
    d[7] ? d[7][0] : null,
  )
%}

MemberAccessExpression -> (IndexAccessExpression | MemberAccessExpression | CallExpression | IdentifierExpression) _ "." _ Identifier {%
  (d: any) => new MemberAccessExpressionNode(
    d[0][0],
    d[4],
  )
%}

CallExpression -> (IndexAccessExpression | MemberAccessExpression | CallExpression | IdentifierExpression) _ 
  ("<" _ List[TypeExpression, (_ "," _)] _ ">" _):?
  "(" _ (List[Expression, (_ "," _)] _):? ")" {%
  (d: any) => new CallExpressionNode(
    d[0][0],
    d[2] ? d[2][2] : null, 
    d[5] ? d[5][0] : null,
  )
%}

IndexAccessExpression -> (IndexAccessExpression | MemberAccessExpression | CallExpression | IdentifierExpression) _
                         "[" _ Expression _ "]" {%
  (d: any) => new IndexAccessExpressionNode(d[0][0], d[4])    
%}

GroupExpression -> "(" _ Expression _ ")" {% (d: any) => d[2] %}

IdentifierExpression -> Identifier {%
  (d: any) => new IdentifierExpressionNode(d[0])
%}

