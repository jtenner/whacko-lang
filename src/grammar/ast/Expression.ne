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
= += -= *= /= %=
&= |= ^= <<= >>=	right to left	

*/%}


@{%

export class YieldExpressionNode extends ExpressionNode {
  constructor(
    public expr: ExpressionNode,
  ) {
    super();
  }
}

export class ConditionalExpression extends ExpressionNode {
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

Precidence1 -> (YieldExpression | ConditionalExpression | AssignmentExpression) {% (d: any) => d[0][0] %}
             | Precidence2 {% identity %}

YieldExpression -> "yield" _ Precidence1 {%
  (d: any) => new YieldExpressionNode(d[2])
%}

ConditionalExpression -> Precidence2 _ "?" _ Precidence1 _ ":" _ Precidence1 {%
  (d: any) => new ConditionalExpressionNode(d[0], d[1], d[2])
%}

