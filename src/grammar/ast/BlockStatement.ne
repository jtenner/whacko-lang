@{%

export class BlockStatementNode extends StatementNode {
  constructor(
    public statements: Statement[],
  ) {
    super();
  }
}

%}

BlockStatement -> "{" _ (List[Statement, _] _):? "}" {%
  (d: any) => new BlockStatementNode(d[2][0][0])
%}