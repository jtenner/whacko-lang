@{%

export class TypeDeclaratorNode extends Node {
  constructor(
    public name: IdentifierNode,
    public expr: TypeExpressionNode,
  ) {
    super();
  }
}

export class TypeDeclarationStatementNode extends Node {
  constructor(
    public declarators: TypeDeclaratorNode[]
  ) {
    super();
  }
}

%}

TypeDeclarator -> Identifier _ "=" _ TypeExpression {%
  (d: any) => new TypeDeclaratorNode(d[0], d[4])
%}

TypeDeclarationStatement -> "type" __ List[TypeDeclarator, (_ "," _)] _ ";" {%
  (d: any) => new TypeDeclarationStatementNode(d[2])
%}

