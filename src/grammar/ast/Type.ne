@{%

export class TypeExpressionNode extends Node {
  constructor(
    public name: TypeIdentifierNode,
    public children: TypeExpressionNode[] | null,
  ) {
    super();
  }
}

%}

# Identifier<Generic>
TypeExpression -> TypeIdentifier (_ "<" _ List[TypeExpression, (_ "," _)] _ ">"):? {%
  (d: any) => new TypeExpressionNode(d[0], d[1] ? d[1][3] : null)
%}

