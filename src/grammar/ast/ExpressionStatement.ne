@{%
export class ExpressionStatementNode extends StatementNode {
  constructor(
    public expr: ExpressionNode,
  ) {
    super();
  }
}
%}

ExpressionStatementNode -> Expression _ ";" {% identity %} 

