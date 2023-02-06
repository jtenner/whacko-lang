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

%}

Expression -> Precidence1 {% identity %}

Precidence1 -> (YieldExpression | ConditionalExpression) {% (d: any) => d[0][0] %}
             | Precidence2 {% identity %}

YieldExpression -> "yield" _ Precidence1 {%
  (d: any) => new YieldExpressionNode(d[2])
%}

ConditionalExpression -> Precidence2 _ "?" _ Precidence1 _ ":" _ Precidence1 {%
  (d: any) => new ConditionalExpressionNode(d[0], d[1], d[2])
%}

Precidence2 -> AssignmentExpression {% identity %}
             | Precidence3 {% identity %}

AssignmentExpression -> BinaryExpression[MemberAccessExpression, ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>="), Precidence2] {% identity %}
                      | BinaryExpression[IdentifierExpression, ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>="), Precidence2] {% identity %}

Precidence3 -> LogicalOrExpression {% identity %}
             | Precidence4 {% identity %}

LogicalOrExpression -> BinaryExpression[Precidence3, ("||"), Precidence4] {% identity %}

Precidence4 -> LogicalAndExpression {% identity %}
             | Precidence5 {% identity %}

LogicalAndExpression -> BinaryExpression[Precidence4, ("&&"), Precidence5] {% identity %}

Precidence5 -> EqualityExpression {% identity %}
             | Precidence6 {% identity %}

EqualityExpression -> BinaryExpression[Precidence5, ("==" | "!=" | "<" | ">" | "<=" | ">="), Precidence6] {% identity %}

