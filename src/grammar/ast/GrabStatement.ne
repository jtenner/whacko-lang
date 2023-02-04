@{%
export class GrabStatementNode extends StatementNode {
  constructor(
    public target: ExpressionNode,
    public name: IdentifierNode,
    public block: BlockStatementNode
  ) {
    super();
  }
}
%}

GrabStatement -> "grab" __ Expression __ "as" __ Identifier _ BlockStatement {%
  (d: any) => new GrabStatementNode(d[2], d[6], d[8])
%}