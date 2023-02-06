Declaration -> (ImportDeclaration | FunctionDeclaration | GlobalDeclaration) {% (d: any) => d[0][0] %}

@{%
export class ImportDeclarationNode extends DeclarationNode {
  constructor(
    public imports: ImportDeclaratorNode[],
    public path: string,
  ) {
    super();
  }
}

export class ImportDeclaratorNode extends Node {
  constructor(
    public name: IdentifierNode,
    public alias: IdentifierNode | null,
  ) {
    super();
  }
}

export class FunctionDeclarationNode extends Node {
  constructor(
    public async: boolean,
    public name: IdentifierNode,
    public typeParameters: TypeIdentifierNode[] | null,
    public parameters: ParameterDeclaratorNode[] | null,
    public retType: TypeExpressionNode,
    public body: BlockStatementNode,
  ) {
    super();
  }
}

export class GeneratorDeclarationNode extends Node {
  constructor(
    public tIn: TypeExpressionNode,
    public tOut: TypeExpressionNode, 
    public name: IdentifierNode,
    public typeParameters: TypeIdentifierNode[] | null,
    public parameters: ParameterDeclaratorNode[] | null,
    public body: BlockStatementNode,
  ) {
    super();
  }
}

export class ParameterDeclaratorNode extends Node {
  constructor(
    public name: IdentifierNode,
    public type: TypeExpressionNode,
    public initializer: ExpressionNode | null,
  ) {
    super();
  }
}

export class GlobalDeclarationNode extends DeclarationNode {
  constructor(
    public isConst: boolean,
    public declarators: ParameterDeclaratorNode[],
  ) {
    super();
  }
}
%}

ImportDeclaration -> "import" _ "{" _ (List[ImportDeclarator, (_ "," _)] _):? "}" _ "from" _ String _ ";" {%
  (d: any[]) => new ImportDeclarationNode(d[4] ? d[4][0] : null, d[9])
%}

ImportDeclarator -> Identifier (__ "as" __ Identifier):? {%
  (d: any) => new ImportDeclaratorNode(d[0], d[1] ? d[1][3] : null)
%}

FunctionDeclaration -> ("async" __):? 
  "fn" __ Identifier _
  ("<" _ List[TypeIdentifier, (_ "," _)] _ ">" _ ):?
  "(" _ (List[ParameterDeclarator, (_ "," _)] _):? ")"
  _ ":" _ TypeExpression _ BlockStatement {%
  (d: any) => new FunctionDeclarationNode(
    !!d[0], // async
    d[3], // name
    d[5] ? d[5][2] : null, // type parameters
    d[8] ? d[8][0] : null, // function parameters
    d[13], // ret type
    d[15], // body
  )
%}

GeneratorDeclaration ->
  "gen" _
  "<" _ TypeExpression _ "," _ TypeExpression _ ">" __
  Identifier _
  ("<" _ List[TypeIdentifier, (_ "," _)] _ ">" _ ):?
  "(" _ (List[ParameterDeclarator, (_ "," _)] _):? ")" _ BlockStatement {%
  (d: any) => new GeneratorDeclarationNode(
    d[4], // TIn
    d[10], // TOut
    d[12], // name
    d[14] ? d[14][2] : null, // TypeParameters
    d[17] ? d[17][0] : null, // FunctionParameters
    d[20], // function body 
  )
%}

ParameterDeclarator -> Identifier _ ":" _ TypeExpression _ ("=" _ Expression):? {%
  (d: any) => new ParameterDeclaratorNode(d[0], d[4], d[6] ? d[6][2] : null)
%}

GlobalDeclaration -> ("const" | "let") __ List[ParameterDeclarator, (_ "," _)] _ ";" {%
  (d: any) => new GlobalDeclarationNode(d[0][0] === "const", d[2])
%}

