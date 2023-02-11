grammar Whacko

entry Program:
    (declares+=DeclareDeclaration | imports+=ImportDeclaration | exports+=ExportDeclaration | declarations+=FunctionDeclaration | declarations+=ClassDeclaration | declarations+=TypeDeclaration)*;

DeclareDeclaration:
    "declare" namespace=String method=String "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression ";";

ImportDeclaration:
    "import" "{" (declarators+=ImportDeclarator ("," declarators+=ImportDeclarator)* )? "}" "from" path=String ";";

ImportDeclarator:
    name=ID ("as" alias=ID)?;

ExportDeclaration:
    "export" "{" declarators+=ExportDeclarator ("," declarators+=ExportDeclarator)* "}";

ExportDeclarator:
    name=ID ("as" alias=ID)?;

FunctionDeclaration:
    (async="async")? "fn" name=ID "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression block=BlockStatement;

Parameter:
    name=ID ":" type=ID;

TypeDeclaration:
    "type" name=ID "=" type=TypeExpression;

ClassDeclaration:
    (final="final")? "class" name=ID ("extends" extends=TypeExpression)? "{" (members+=ClassMember (members+=ClassMember)* )? "}";

TypeExpression:
    name=ID ("<" typeParameters+=ID ("," typeParameters+=ID)* ">")?;

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

BlockStatement:
    "{" (statements+=Statement)* "}";

TypeDeclarationStatement:
    "type" name=ID "=" type=TypeExpression ";";

GrabStatement:
    "grab" "(" heldExpression=Expression ")" statement=Statement;

WhileStatement:
    "while" "(" expression=Expression ")" statement=Statement;

ContinueStatement:
    cont="continue" ";";

BreakStatement:
    brk="break" ";";

IfElseStatement:
    "if" "(" condition=Expression ")" truthy=Statement ("else" falsy=Statement)?;

ReturnStatement:
    "return" expression=Expression ";";

VariableDeclarationStatement:
    declarationType=("const" | "let") declarators+=VariableDeclarator ("," declarators+=VariableDeclarator)* ";";

VariableDeclarator:
    name=ID (":" type=TypeExpression)? "=" expression=Expression;

ExpressionStatement:
    expression=Expression ";";

Expression: YieldExpression;

YieldExpression:
    "yield" expression=YieldExpression
    | TernaryExpression;

TernaryExpression:
    condition=AssignmentExpression "?" truthy=TernaryExpression ":" falsy=TernaryExpression
    | AssignmentExpression;

AssignmentExpression infers Expression:
    PathExpression ({infer BinaryExpression.e1=current} op=("=" | "+=" | "-=" | "**=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | ">>>=" | "&=" | "^=" | "|=" | "&&=" | "||=" | "??=") e2=LogicalOrExpression)*
    | LogicalOrExpression;

LogicalOrExpression infers Expression:
    LogicalAndExpression ({infer BinaryExpression.e1=current} op=("||") e2=LogicalAndExpression)*;

LogicalAndExpression infers Expression:
    BitwiseOrExpression ({infer BinaryExpression.e1=current} op=("&&") e2=BitwiseOrExpression)*;

BitwiseOrExpression infers Expression:
    BitwiseXOrExpression ({infer BinaryExpression.e1=current} op=("|") e2=BitwiseXOrExpression)*;

BitwiseXOrExpression infers Expression:
    BitwiseAndExpression ({infer BinaryExpression.e1=current} op=("^") e2=BitwiseAndExpression)*;

BitwiseAndExpression infers Expression:
    EqualityExpression ({infer BinaryExpression.e1=current} op=("&") e2=EqualityExpression)*;

EqualityExpression infers Expression:
    ComaprisonExpression ({infer BinaryExpression.e1=current} op=("==" | "!=") e2=ComaprisonExpression)*;

ComaprisonExpression infers Expression:
    BitShiftExpression ({infer BinaryExpression.e1=current} op=("<=" | "<" | ">=" | ">") e2=BitShiftExpression)*;

BitShiftExpression infers Expression:
    SumExpression ({infer BinaryExpression.e1=current} op=("<<" | ">>") e2=SumExpression)*;

SumExpression infers Expression: 
    ProductExpression ({infer BinaryExpression.e1=current} op=("+" | "-") e2=ProductExpression)*;

ProductExpression infers Expression: 
    ExponentiationExpression ({infer BinaryExpression.e1=current} op=("*" | "/" | "%") e2=ExponentiationExpression)*;

ExponentiationExpression infers Expression: 
    LeftUnaryExpression ({infer BinaryExpression.e1=current} op="**" e2=LeftUnaryExpression)*;

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
    path+=PrimaryExpression (path+=NewPath | path+=MemberAccessPath | path+=ArrayAccessPath | path+=CallPath)+
    | PrimaryExpression;

NewPath:
    "." "new" ("<" typeParameters+=TypeExpression ("," typeParameters+=TypeExpression)* ">")? "(" (parameters+=Expression ("," parameters+=Expression)*)? ")";

MemberAccessPath:
    "." name=ID;

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

