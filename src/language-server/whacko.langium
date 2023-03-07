grammar Whacko

entry Program:
    ( declarations+=DeclareDeclaration
    | imports+=ImportDeclaration
    | exports+=ExportDeclaration
    | declarations+=FunctionDeclaration
    | declarations+=ClassDeclaration
    | declarations+=TypeDeclaration
    | declarations+=NamespaceDeclaration
    | declarations+=BuiltinDeclaration)*;

NamespaceDeclaration:
    Decorators (export?="export") "namespace" Name "{" ( declarations+=DeclareDeclaration
    | exports+=ExportDeclaration
    | declarations+=FunctionDeclaration
    | declarations+=ClassDeclaration
    | declarations+=TypeDeclaration
    | declarations+=NamespaceDeclaration
    | declarations+=BuiltinDeclaration)* "}";

BuiltinDeclaration:
    Decorators (export?="export") "builtin" Name TypeParameters "(" Parameters ")" ReturnType ";";

DeclareDeclaration:
    Decorators (export?="export") "declare" Name "{" functions+=DeclareFunction "}" "from" namespace=StringLiteral ";";

DeclareFunction:
    Decorators "fn" Name "(" Parameters ")" ":" ReturnType ";";

EnumDeclaration:
    Decorators (export?="export") "enum" Name "{"  "}";

ImportDeclaration:
    "import" "{" (declarators+=ImportDeclarator ("," declarators+=ImportDeclarator)*)? "}" "from" path=String ";";

ImportDeclarator:
    Name ("as" alias=ID)?;

ExportDeclaration:
    "export" "{" declarators+=ExportDeclarator ("," declarators+=ExportDeclarator)* "}";

ExportDeclarator:
    Name ("as" alias=ID)?;

FunctionDeclaration:
    Decorators (export?="export")? (async="async")? "fn" Name NamedTypeParameters Parameters ":" ReturnType block=BlockStatement;

Parameter:
    Name ":" type=ID;

TypeDeclaration:
    Decorators (export?="export")? "type" Name NamedTypeParameters "=" type=TypeExpression ";";

ClassDeclaration:
    Decorators (export?="export")? (final?="final")? "class" Name NamedTypeParameters ("extends" extends=TypeExpression)? "{" members+=ClassMember* "}";

TypeExpression: HeldTypeExpression | FunctionTypeExpression | NamedTypeExpression | TupleTypeExpression;

HeldTypeExpression: 
    "held" type=TypeExpression;

FunctionTypeExpression:
    "(" (parameters+=TypeExpression ("," parameters+=TypeExpression)* )? ")" "=>" ReturnType;

TupleTypeExpression:
    "(" types+=TypeExpression "," (types+=TypeExpression ("," types+=TypeExpression)* )? ")";

NamedTypeExpression:
    name=PathTypeExpression TypeParameters;

PathTypeExpression:
    ID ({infer PathTypeExpression.namespace=current} "." element=ID)*;

ClassMember: ConstructorClassMember | FieldClassMember | MethodClassMember | GetterClassMember | SetterClassMember;

FieldClassMember:
    Decorators (private?="private")? Name ":" type=TypeExpression ("=" initializer=Expression)? ";";

MethodClassMember:
    Decorators (private?="private")? Name Parameters ":" ReturnType block=BlockStatement;

GetterClassMember:
    Decorators (private?="private")? "get" Name ":" ReturnType block=BlockStatement;

SetterClassMember:
    Decorators (private?="private")? "set" Name "(" parameter=Parameter ")" block=BlockStatement;

ConstructorClassMember:
    Decorators (private?="private")? "constructor" Parameters block=BlockStatement;

Statement: BlockStatement | TypeDeclarationStatement | GrabStatement | WhileStatement | ContinueStatement | BreakStatement | IfElseStatement | ReturnStatement | VariableDeclarationStatement | ExpressionStatement;

BlockStatement:
    "{" (statements+=Statement)* "}";

TypeDeclarationStatement:
    "type" Name NamedTypeParameters "=" type=TypeExpression ";";

GrabStatement:
    "grab" "(" heldExpression=Expression ")" statement=Statement;

WhileStatement:
    "while" "(" expression=Expression ")" statement=Statement;

ContinueStatement:
    cont?="continue" ";";

BreakStatement:
    brk?="break" ";";

IfElseStatement:
    "if" "(" condition=Expression ")" truthy=Statement ("else" falsy=Statement)?;

ReturnStatement:
    "return" expression=Expression ";";

VariableDeclarationStatement:
    (immutable?="const" | "let") declarators+=VariableDeclarator ("," declarators+=VariableDeclarator)* ";";

VariableDeclarator:
    Name (":" type=TypeExpression)? "=" expression=Expression;

ExpressionStatement:
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
    LogicalOrExpression ({infer BinaryExpression.lhs=current} op=("=" | "+=" | "-=" | "**=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | ">>>=" | "&=" | "^=" | "|=" | "&&=" | "||=" | "??=") rhs=LogicalOrExpression)*;

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
    | NewExpression;

NewExpression:
    "new" expression=NewExpression TypeParameters CallParameters
    | PathExpression;

PathExpression:
    PrimaryExpression (
        {infer CallExpression.callRoot=current} TypeParameters CallParameters
        | {infer MemberAccessExpression.memberRoot=current} "." member=ID
        | {infer ArrayAccessExpression.arrayRoot=current} "[" indexExpression=Expression "]"
    )*;

PrimaryExpression: FunctionLiteral | GroupLiteral | ID | FloatLiteral | IntegerLiteral | HexLiteral | BinaryLiteral | OctalLiteral | StringLiteral | FalseLiteral | TrueLiteral | NullLiteral | ThisLiteral | SuperLiteral | AsyncBlockLiteral;

FunctionLiteral:
    TypeParameters "(" ( parameters+=Parameter ("," parameters+=Parameter)* )? ")" ":" ReturnType "=>" block=BlockStatement;

fragment CallParameters:
    "(" (parameters+=Expression ("," parameters+=Expression)*)? ")";

fragment Parameters:
    "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")";

fragment TypeParameters:
    ("<" typeParameters+=TypeExpression ("," typeParameters+=TypeExpression)* ">")?;

fragment NamedTypeParameters:
    ("<" typeParameters+=ID ("," typeParameters+=ID)* ">")?;

fragment ReturnType:
    returnType=TypeExpression;

fragment Name:
    name=ID;

fragment Decorators:
    (decorators+=Decorator)*;

Decorator:
    "@" name=ID "(" CallParameters ")";

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
    false?="false";

TrueLiteral:
    true?="true";

NullLiteral:
    null?="null";

ThisLiteral:
    this?="this";

SuperLiteral:
    super?="super";

AsyncBlockLiteral:
    "async" ("<" type=TypeExpression ">")? block=BlockStatement;

ID:
    name=Identifier;


terminal String: /"([^"\r\n]|\\\.)*"/;

terminal Identifier: /[a-zA-Z$_][a-zA-Z$_0-9]*/;

terminal Binary: /0b[10]+/;
terminal Hex: /0x[0-9a-fA-F]+/;
terminal Octal: /0o[0-7]+/;
terminal Float: /[-+]?[0-9]+[.][0-9]+([eE][-+]?[0-9]+)?/;
terminal Integer: /[-+]?[0-9]+/;

// hidden stuff
hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

