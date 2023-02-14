grammar Whacko

entry Program:
    ( declarations+=DeclareDeclaration
    | imports+=ImportDeclaration
    | exports+=ExportDeclaration
    | declarations+=FunctionDeclaration
    | declarations+=ClassDeclaration
    | declarations+=TypeDeclaration)*;

DeclareDeclaration infers Declaration:
    "declare" namespace=String method=String "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression ";";

ImportDeclaration infers Declaration:
    "import" "{" (declarators+=ImportDeclarator ("," declarators+=ImportDeclarator)*)? "}" "from" path=String ";";

ImportDeclarator:
    name=ID ("as" alias=ID)?;

ExportDeclaration infers Declaration:
    "export" "{" declarators+=ExportDeclarator ("," declarators+=ExportDeclarator)* "}";

ExportDeclarator:
    name=ID ("as" alias=ID)?;

FunctionDeclaration infers Declaration:
    (async="async")? "fn" name=ID "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression block=BlockStatement;

Parameter:
    name=ID ":" type=ID;

TypeDeclaration infers Declaration:
    "type" name=ID "=" type=TypeExpression;

ClassDeclaration infers Declaration:
    (final="final")? "class" name=ID ("extends" extends=TypeExpression)? "{" (members+=ClassMember (members+=ClassMember)* )? "}";

TypeExpression: HeldTypeExpression | FunctionTypeExpression | NamedTypeExpression | TupleTypeExpression;

HeldTypeExpression: 
    "held" type=TypeExpression;

FunctionTypeExpression:
    "(" (parameters+=TypeExpression ("," parameters+=TypeExpression)* )? ")" "=>" returnType=TypeExpression;

TupleTypeExpression:
    "(" types+=TypeExpression "," (types+=TypeExpression ("," types+=TypeExpression)* )? ")";

NamedTypeExpression:
    name=ID ("<" typeParameters+=TypeExpression ("," typeParameters+=TypeExpression)* ">")?;

ClassMember:
    (members+=ConstructorClassMember | members+=FieldClassMember | members+=MethodClassMember | members+=GetterClassMember | members+=SetterClassMember);

FieldClassMember:
    (private="private")? name=ID ":" type=TypeExpression ("=" initializer=Expression)? ";";

MethodClassMember:
    (private="private")? name=ID "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression block=BlockStatement;

GetterClassMember:
    (private="private")? "get" name=ID ":" returnType=TypeExpression block=BlockStatement;

SetterClassMember:
    (private="private")? "set" name=ID "(" parameter=Parameter ")" block=BlockStatement;

ConstructorClassMember:
    (private="private")? "constructor" "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" block=BlockStatement;

Statement: BlockStatement | TypeDeclarationStatement | GrabStatement | WhileStatement | ContinueStatement | BreakStatement | IfElseStatement | ReturnStatement | ExpressionStatement | VariableDeclarationStatement;

BlockStatement infers Statement:
    "{" (statements+=Statement)* "}";

TypeDeclarationStatement infers Statement:
    "type" name=ID "=" type=TypeExpression ";";

GrabStatement infers Statement:
    "grab" "(" heldExpression=Expression ")" statement=Statement;

WhileStatement infers Statement:
    "while" "(" expression=Expression ")" statement=Statement;

ContinueStatement infers Statement:
    cont="continue" ";";

BreakStatement infers Statement:
    brk="break" ";";

IfElseStatement infers Statement:
    "if" "(" condition=Expression ")" truthy=Statement ("else" falsy=Statement)?;

ReturnStatement infers Statement:
    "return" expression=Expression ";";

VariableDeclarationStatement infers Statement:
    declarationType=("const" | "let") declarators+=VariableDeclarator ("," declarators+=VariableDeclarator)* ";";

VariableDeclarator:
    name=ID (":" type=TypeExpression)? "=" expression=Expression;

ExpressionStatement infers Statement:
    expression=Expression ";";

Expression: TupleExpression;

TupleExpression:
    "(" expressions+=Expression "," (expressions+=Expression ("," expressions+=Expression)* )? ")"
    | YieldExpression;

YieldExpression:
    "yield" expression=YieldExpression
    | TernaryExpression;

TernaryExpression:
    condition=AssignmentExpression "?" truthy=TernaryExpression ":" falsy=TernaryExpression
    | AssignmentExpression;

AssignmentExpression:
    PathExpression ({infer BinaryExpression.lhs=current} op=("=" | "+=" | "-=" | "**=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | ">>>=" | "&=" | "^=" | "|=" | "&&=" | "||=" | "??=") rhs=LogicalOrExpression)*
    | LogicalOrExpression;

LogicalOrExpression:
    LogicalAndExpression ({infer BinaryExpression.lhs=current} op=("||") rhs=LogicalAndExpression)*;

LogicalAndExpression:
    BitwiseOrExpression ({infer BinaryExpression.lhs=current} op=("&&") rhs=BitwiseOrExpression)*;

BitwiseOrExpression:
    BitwiseXOrExpression ({infer BinaryExpression.lhs=current} op=("|") rhs=BitwiseXOrExpression)*;

BitwiseXOrExpression:
    BitwiseAndExpression ({infer BinaryExpression.lhs=current} op=("^") rhs=BitwiseAndExpression)*;

BitwiseAndExpression:
    EqualityExpression ({infer BinaryExpression.lhs=current} op=("&") rhs=EqualityExpression)*;

EqualityExpression:
    ComaprisonExpression ({infer BinaryExpression.lhs=current} op=("==" | "!=") rhs=ComaprisonExpression)*;

ComaprisonExpression:
    BitShiftExpression ({infer BinaryExpression.lhs=current} op=("<=" | "<" | ">=" | ">") rhs=BitShiftExpression)*;

BitShiftExpression:
    SumExpression ({infer BinaryExpression.lhs=current} op=("<<" | ">>") rhs=SumExpression)*;

SumExpression: 
    ProductExpression ({infer BinaryExpression.lhs=current} op=("+" | "-") rhs=ProductExpression)*;

ProductExpression: 
    ExponentiationExpression ({infer BinaryExpression.lhs=current} op=("*" | "/" | "%") rhs=ExponentiationExpression)*;

ExponentiationExpression: 
    LeftUnaryExpression ({infer BinaryExpression.lhs=current} op="**" rhs=LeftUnaryExpression)*;

LeftUnaryExpression:
    op=("!" | "-" | "+" | "~") expression=LeftUnaryExpression
    | AwaitExpression;

AwaitExpression:
    "await" expression=LeftUnaryExpression
    | HoldExpression;

HoldExpression:
    "hold" expression=LeftUnaryExpression
    | PathExpression;

PathExpression:
    root=PrimaryExpression (path+=NewPath | path+=MemberAccessPath | path+=ArrayAccessPath | path+=CallPath)+
    | PrimaryExpression;

NewPath:
    "." "new" ("<" typeParameters+=TypeExpression ("," typeParameters+=TypeExpression)* ">")? "(" (parameters+=Expression ("," parameters+=Expression)*)? ")";

MemberAccessPath:
    "." member=ID;

ArrayAccessPath:
    "[" expression=Expression "]";

CallPath:
    ("<" typeParameters+=TypeExpression ("," typeParameters+=TypeExpression)* ">")? "(" ")";

PrimaryExpression: GroupLiteral | ID | FloatLiteral | IntegerLiteral | HexLiteral | BinaryLiteral | OctalLiteral | StringLiteral | FalseLiteral | TrueLiteral | NullLiteral | ThisLiteral | SuperLiteral | AsyncBlockLiteral;

GroupLiteral:
    "(" expression=Expression ")";

FloatLiteral:
    value=Float;

IntegerLiteral:
    value=Integer;

HexLiteral:
    value=Hex;

BinaryLiteral:
    value=Binary;

OctalLiteral:
    value=Octal;

StringLiteral:
    value=String;

FalseLiteral:
    false="false";

TrueLiteral:
    true="true";

NullLiteral:
    null="null";

ThisLiteral:
    this="this";

SuperLiteral:
    super="super";

AsyncBlockLiteral:
    "async" ("<" type=TypeExpression ">")? "{" statements+=Statement* "}";

ID:
    name=Identifier;


terminal String: /"([^"\r\n]|\\\.)*"/;

terminal Identifier: /[a-zA-Z$_][a-zA-Z$_0-9]*/;

terminal Binary: /0b[10]+/;
terminal Hex: /0x[0-9a-fA-F]+/;
terminal Octal: /0o[0-8]+/;
terminal Float: /[-+]?[0-9]+[.][0-9]+([eE][-+]?[0-9]+)?/;
terminal Integer: /[-+]?[0-9]+/;

// hidden stuff
hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

