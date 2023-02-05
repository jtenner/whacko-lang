@{%

export class TypeExpressionNode extends Node {
  constructor(
    public name: IdentifierNode,
    public children: TypeExpressionNode[] | null,
  ) {
    super();
  }
}

%}

TypeExpression -> Identifier (_ "<" _ List[TypeExpression, (_ "," _)] _ ">"):? {%
  (d: any) => new TypeExpressionNode(d[0], d[1] ? d[1][3] : null)
%}

