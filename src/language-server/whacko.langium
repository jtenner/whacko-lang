grammar Whacko

entry Program:
    ( declarations+=DeclareDeclaration
    | imports+=ImportDeclaration
    | declarations+=BuiltinDeclaration
    | declarations+=FunctionDeclaration
    | declarations+=ClassDeclaration
    | declarations+=TypeDeclaration
    | declarations+=NamespaceDeclaration
    | declarations+=BuiltinTypeDeclaration
    | declarations+=EnumDeclaration
    | declarations+=ExternDeclaration
    | declarations+=ExportStarDeclaration
)*;

NamespaceDeclaration:
    Decorators (export?="export") "namespace" Name "{" ( 
      declarations+=DeclareDeclaration
    | declarations+=FunctionDeclaration
    | declarations+=ClassDeclaration
    | declarations+=TypeDeclaration
    | declarations+=NamespaceDeclaration
    | declarations+=BuiltinDeclaration
    | declarations+=BuiltinTypeDeclaration
    | declarations+=EnumDeclaration
    | declarations+=ExternDeclaration
    | declarations+=ExportStarDeclaration
    )* "}";

ExportStarDeclaration:
    Decorators "export" "*" "as" Name "from" path=StringLiteral ";";

ExternDeclaration:
    Decorators (export?="export")? "extern" Name Parameters ":" ReturnType ";";

BuiltinTypeDeclaration:
    Decorators (export?="export")? "builtintype" Name NamedTypeParameters ";";

BuiltinDeclaration:
    Decorators (export?="export")? "builtin" Name NamedTypeParameters Parameters ":" ReturnType ";";

DeclareDeclaration:
    Decorators (export?="export")? "declare" Name  "{" functions+=DeclareFunction* "}" "from" namespace=StringLiteral ";";

DeclareFunction:
    Decorators "fn" Name Parameters ":" ReturnType ";";

EnumDeclaration:
    Decorators (export?="export")? "enum" Name "{" (declarators+=EnumDeclarator ("," declarators+=EnumDeclarator)* ) "}";

EnumDeclarator:
    name=ID ("=" initializer=IntegerLiteral)?;

ImportDeclaration:
    "import" "{" (declarators+=ImportDeclarator ("," declarators+=ImportDeclarator)*)? "}" "from" path=StringLiteral ";";

ImportDeclarator:
    Name ("as" alias=ID)?;

FunctionDeclaration:
    Decorators (export?="export")? (async="async")? "fn" Name NamedTypeParameters Parameters ":" ReturnType block=BlockStatement;

Parameter:
    Name ":" type=TypeExpression;

TypeDeclaration:
    Decorators (export?="export")? "type" Name NamedTypeParameters "=" type=TypeExpression ";";

ClassDeclaration:
    Decorators (export?="export")? (final?="final")? "class" Name NamedTypeParameters ("extends" extends=TypeExpression)? "{" members+=ClassMember* "}";

TypeExpression:
    FunctionTypeExpression | NamedTypeExpression | TupleTypeExpression | TypeID;

FunctionTypeExpression:
    "(" (parameters+=TypeExpression ("," parameters+=TypeExpression)* )? ")" "=>" ReturnType;

TupleTypeExpression:
    "(" types+=TypeExpression "," (types+=TypeExpression ("," types+=TypeExpression)* )? ")";

TypeID:
    name=Identifier TypeParameters;

NamedTypeExpression: // what's this infer business for?
    // ID ("." path+=ID)+ TypeParameters; maybe? OMG IF THIS WORKS I WILL BE SLIGHTLY HAPPIER
    path+=ID ( "." path+=ID)+ TypeParameters;

ClassMember:
    ConstructorClassMember | FieldClassMember | MethodClassMember | GetterClassMember | SetterClassMember;

FieldClassMember:
    Decorators (private?="private")? Name (":" type=TypeExpression)? ("=" initializer=Expression)? ";";

MethodClassMember:
    Decorators (private?="private")? Name NamedTypeParameters Parameters ":" ReturnType block=BlockStatement;

GetterClassMember:
    Decorators (private?="private")? "get" Name ":" ReturnType block=BlockStatement;

SetterClassMember:
    Decorators (private?="private")? "set" Name "(" parameter=Parameter ")" block=BlockStatement;

ConstructorClassMember:
    Decorators (private?="private")? "constructor" Parameters block=BlockStatement;

Statement:
    BlockStatement | TypeDeclarationStatement | GrabStatement | WhileStatement | ContinueStatement | BreakStatement | IfElseStatement | ReturnStatement | VariableDeclarationStatement | ExpressionStatement;

BlockStatement:
    "{" (statements+=Statement)* "}";

TypeDeclarationStatement:
    "type" Name NamedTypeParameters "=" type=TypeExpression ";";

GrabStatement:
    "grab" "(" heldExpression=Expression "as" name=ID ")" statement=Statement;

WhileStatement:
    "while" "(" expression=Expression ")" statement=Statement;

ContinueStatement:
    cont?="continue" ";";

BreakStatement:
    brk?="break" ";";

IfElseStatement:
    "if" "(" condition=Expression ")" truthy=Statement ("else" falsy=Statement)?;

ReturnStatement:
    "return" expression=Expression? ";";

VariableDeclarationStatement:
    (immutable?="const" | "let") declarators+=VariableDeclarator ("," declarators+=VariableDeclarator)* ";";

VariableDeclarator:
    Name (":" type=TypeExpression)? "=" expression=Expression;

ExpressionStatement:
    expression=Expression ";";

Expression infers Expression:
    TupleExpression;

TupleExpression infers Expression:
    {infer TupleExpression} "(" expressions+=Expression "," (expressions+=Expression ("," expressions+=Expression)* )? ")"
    | YieldExpression;

YieldExpression infers Expression:
    {infer YieldExpression} "yield" expression=YieldExpression
    | TernaryExpression;

TernaryExpression infers Expression:
    {infer TernaryExpression} condition=AssignmentExpression "?" truthy=TernaryExpression ":" falsy=TernaryExpression
    | AssignmentExpression;

AssignmentExpression infers Expression:
    LogicalOrExpression ({infer BinaryExpression.lhs=current} op=("=" | "+=" | "-=" | "**=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | ">>>=" | "&=" | "^=" | "|=" | "&&=" | "||=" | "??=") rhs=LogicalOrExpression)*;

LogicalOrExpression infers Expression:
    LogicalAndExpression ({infer BinaryExpression.lhs=current} op=("||") rhs=LogicalAndExpression)*;

LogicalAndExpression infers Expression:
    BitwiseOrExpression ({infer BinaryExpression.lhs=current} op=("&&") rhs=BitwiseOrExpression)*;

BitwiseOrExpression infers Expression:
    BitwiseXOrExpression ({infer BinaryExpression.lhs=current} op=("|") rhs=BitwiseXOrExpression)*;

BitwiseXOrExpression infers Expression:
    BitwiseAndExpression ({infer BinaryExpression.lhs=current} op=("^") rhs=BitwiseAndExpression)*;

BitwiseAndExpression infers Expression:
    EqualityExpression ({infer BinaryExpression.lhs=current} op=("&") rhs=EqualityExpression)*;

EqualityExpression infers Expression:
    ComaprisonExpression ({infer BinaryExpression.lhs=current} op=("==" | "!=") rhs=ComaprisonExpression)*;

ComaprisonExpression infers Expression:
    BitShiftExpression ({infer BinaryExpression.lhs=current} op=("<=" | Less_Than | ">=" | ">") rhs=BitShiftExpression)*;

BitShiftExpression infers Expression:
    SumExpression ({infer BinaryExpression.lhs=current} op=("<<" | ">>>" | ">>") rhs=SumExpression)*;

SumExpression infers Expression:
    ProductExpression ({infer BinaryExpression.lhs=current} op=("+" | "-") rhs=ProductExpression)*;

ProductExpression infers Expression:
    ExponentiationExpression ({infer BinaryExpression.lhs=current} op=("*" | "/" | "%") rhs=ExponentiationExpression)*;

ExponentiationExpression infers Expression:
    LeftUnaryExpression ({infer BinaryExpression.lhs=current} op="**" rhs=LeftUnaryExpression)*;

LeftUnaryExpression infers Expression:
    ({infer LeftUnaryExpression} op=("!" | "-" | "+" | "~") expression=LeftUnaryExpression) | Epsilon;

Epsilon infers Expression:
    AwaitExpression | HoldExpression | NewExpression | PathExpression | PrimaryExpression;

AwaitExpression:
    "await" expression=Expression;

HoldExpression:
    "hold" expression=Expression;

NewExpression:
    "new" classType=(NamedTypeExpression | TypeID) CallParameters;

PathExpression:
    RootIdentifier (
        {infer CallExpression.callRoot=current} TypeParameters CallParameters
        | {infer MemberAccessExpression.memberRoot=current} "." member=ID
        | {infer ArrayAccessExpression.arrayRoot=current} "[" indexExpression=Expression "]"
    )*;

PrimaryExpression infers Expression:
    FunctionLiteral | GroupLiteral | FloatLiteral | IntegerLiteral | HexLiteral | BinaryLiteral | OctalLiteral | StringLiteral | FalseLiteral | TrueLiteral | NullLiteral | AsyncBlockLiteral;

GroupLiteral infers Expression:
    "(" Expression ")";

RootIdentifier:
    root=(ID | ThisLiteral | SuperLiteral);

FunctionLiteral:
    TypeParameters Parameters ":" ReturnType "=>" block=BlockStatement;

fragment CallParameters:
    "(" (parameters+=Expression ("," parameters+=Expression)*)? ")";

fragment Parameters:
    "(" ( parameters+=Parameter ("," parameters+=Parameter)* )? ")";

fragment TypeParameters:
    (Generics_Open typeParameters+=TypeExpression ("," typeParameters+=TypeExpression)* ">")?;

fragment NamedTypeParameters:
    (Generics_Open typeParameters+=ID ("," typeParameters+=ID)* ">")?;

fragment ReturnType:
    returnType=TypeExpression;

fragment Name:
    name=ID;

fragment Decorators:
    decorators+=Decorator*;

Decorator:
    "@" name=ID CallParameters?;

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
    "async" (Generics_Open type=TypeExpression ">")? block=BlockStatement;

ID:
    name=Identifier;


terminal String: /"([^"\r\n]|\\\.)*"/;

terminal Identifier: /[a-zA-Z$_][a-zA-Z$_0-9]*/;

terminal Generics_Open: '<' (?= (/\s+/ | Identifier | "." | "," | "<" )+ '>');
terminal Less_Than: /</;

terminal Binary: /0b[10]+/;
terminal Hex: /0x[0-9a-fA-F]+/;
terminal Octal: /0o[0-7]+/;
terminal Float: /[-+]?[0-9]+[.][0-9]+([eE][-+]?[0-9]+)?/;
terminal Integer: /[-+]?[0-9]+/;

// hidden stuff
hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

