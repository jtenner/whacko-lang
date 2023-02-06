# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence

@{%

export class YieldExpressionNode extends ExpressionNode {
  constructor(
    public expr: Expression,
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

