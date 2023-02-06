@{%
export class BlockStatementNode extends StatementNode {
  constructor(
    public statements: StatementNode[],
  ) {
    super();
  }
}

export class ExpressionStatementNode extends StatementNode {
  constructor(
    public expr: ExpressionNode,
  ) {
    super();
  }
}

export class TypeDeclaratorNode extends Node {
  constructor(
    public name: TypeIdentifierNode,
    public parameters: TypeIdentifierNode[] | null,
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

export class GrabStatementNode extends StatementNode {
  constructor(
    public target: ExpressionNode,
    public name: IdentifierNode,
    public block: BlockStatementNode
  ) {
    super();
  }
}

export class WhileStatementNode extends StatementNode {
  constructor(
    public condition: ExpressionNode,
    public statement: StatementNode,
  ) {
    super();
  }
}

export class ContinueStatementNode extends StatementNode {}
export class BreakStatementNode extends StatementNode {}

export class IfElseStatementNode extends StatementNode {
  constructor(
    public expr: ExpressionNode,
    public ifTrue: StatementNode,
    public ifFalse: StatementNode | null, 
  ) {
    super();
  }
}

export class ReturnStatementNode extends StatementNode {
  constructor(
    public expr: ExpressionNode,
  ) {
    super();
  }
}
%}

BlockStatement -> "{" _ (List[Statement, _] _):? "}" {%
  (d: any) => new BlockStatementNode(d[2][0][0])
%}

ExpressionStatementNode -> Expression _ ";" {% identity %} 

# type TypeIdentifier = TypeExpression, TypeIdentifier = TypeExpression ...;
TypeDeclarationStatement -> "type" __ List[TypeDeclarator, (_ "," _)] _ ";" {%
  (d: any) => new TypeDeclarationStatementNode(d[2])
%}

# TypeIdentifier<TypeParam, ...> = TypeExpression
TypeDeclarator -> TypeIdentifier _ ("<" _ List[TypeIdentifier, (_ "," _)] _ ">" _):? "=" _ TypeExpression {%
  (d: any) => new TypeDeclaratorNode(
    d[0],
    d[2] ? d[2][2] : null,
    d[5],
  )
%}

GrabStatement -> "grab" __ Expression __ "as" __ Identifier _ BlockStatement {%
  (d: any) => new GrabStatementNode(d[2], d[6], d[8])
%}

WhileStatement -> "while" _ "(" _ Expression _ ")" _ Statement {%
  (d: any) => new WhileStatementNode(d[4], d[8])
%}

ContinueStatement -> "continue" _ ";" {% () => new ContinueStatementNode() %}

BreakStatement -> "break" _ ";" {% () => new BreakStatementNode() %}

IfElseStatement -> "if" _ "(" _ Expression _ ")" _ Statement (_ "else" _ Statement):? {%
  (d: any) => new IfElseStatementNode(d[4], d[8], d[9] ? d[9][3] : null)
%}

ReturnStatement -> "return" _ Expression _ ";" {%
  (d: any) => new ReturnStatementNode(d[2])
%}

