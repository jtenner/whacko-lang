grammar Whacko

entry Program:
    (imports+=ImportStatement | exports+=ExportDeclaration | declarations+=FunctionDeclaration | declarations+=ClassDeclaration | declarations+=TypeDeclaration)*;

ImportStatement:
    Import "{" (declarators+=ImportDeclarator ("," declarators+=ImportDeclarator)* )? "}" From path=String ";";

ImportDeclarator:
    name=ID (As alias=ID)?;

ExportDeclaration:
    Export "{" declarators+=ExportDeclarator ("," declarators+=ExportDeclarator)* "}";

ExportDeclarator:
    name=ID (As alias=ID)?;

FunctionDeclaration:
    (async=Async)? Fn name=ID "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression block=BlockStatement;

Parameter:
    name=ID ":" type=ID;

TypeDeclaration:
    Type name=ID "=" type=TypeExpression;

ClassDeclaration:
    (final=Final)? Class name=ID Extends TypeExpression "{" (members+=ClassMember (members+=ClassMember)* )? "}";

TypeExpression:
    name=ID ("<" typeParameters+=ID ("," typeParameters+=ID)* ">")?;

ClassMember:
    (members+=ConstructorClassMember | members+=FieldClassMember | members+=MethodClassMember | members+=GetterClassMember | members+=SetterClassMember);

FieldClassMember:
    (private=Private)? name=ID ":" type=TypeExpression ("=" initializer=Expression)? ";";

MethodClassMember:
    (private=Private)? name=ID "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" ":" returnType=TypeExpression block=BlockStatement;

GetterClassMember:
    (private=Private)? Get name=ID ":" returnType=TypeExpression block=BlockStatement;

SetterClassMember:
    (private=Private)? Set name=ID "(" parameter=Parameter ")" block=BlockStatement;

ConstructorClassMember:
    (private=Private)? Constructor "(" (parameters+=Parameter ("," parameters+=Parameter)*)? ")" block=BlockStatement;

Statement: BlockStatement | TypeDeclarationStatement | GrabStatement | WhileStatement | ContinueStatement | BreakStatement | IfElseStatement | ReturnStatement | ExpressionStatement | VariableDeclarationStatement;

BlockStatement:
    "{" (statements+=Statement)* "}";

TypeDeclarationStatement:
    Type name=ID "=" type=TypeExpression ";";

GrabStatement:
    Grab "(" heldExpression=Expression ")" statement=Statement;

WhileStatement:
    While "(" expression=Expression ")" statement=Statement;

ContinueStatement:
    cont=Continue ";";

BreakStatement:
    brk=Break ";";

IfElseStatement infers Statement:
    If "(" condition=Expression ")" truthy=Statement Else falsy=Statement;

ReturnStatement:
    Return expression=Expression ";";

VariableDeclarationStatement:
    type=(Const | Let) declarators+=VariableDeclarator ("," declarators+=VariableDeclarator)* ";";

VariableDeclarator:
    name=ID (":" type=TypeExpression)? "=" expression=Expression;

ExpressionStatement:
    expr=Expression ";";

Expression: Precedence1;

Precedence1: YieldExpression | ConditionalExpression | Precedence2;

YieldExpression infers Expression: Yield exprpression=Expression;

ConditionalExpression infers Expression: conditional=Precedence2 "?" truthy=Precedence1 ":" falsy=Precedence1;

Precedence2: AssignmentExpression | Precedence3;

AssignmentExpression infers Expression:
    lhs=PathExpression op=("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>=") rhs=Precedence2;

Precedence3: LogicalOrExpression;

LogicalOrExpression infers Expression:
    Precedence4 ({infer BinaryExpression.lhs=current} op=("||") rhs=Precedence4)*;

Precedence4: LogicalAndExpression;

LogicalAndExpression infers Expression:
    Precedence5 ({infer BinaryExpression.lhs=current} op=("&&") rhs=Precedence5)*;

Precedence5: EqualityExpression;

EqualityExpression infers Expression:
    Precedence6 ({infer BinaryExpression.lhs=current} op=("==" | "!=" | "<" | ">" | "<=" | ">=") rhs=Precedence6)*;

Precedence6: BitwiseOrExpression;

BitwiseOrExpression infers Expression:
    Precedence7 ({infer BinaryExpression.lhs=current} op=("|") rhs=Precedence7)*;

Precedence7: BitwiseXOrExpression;

BitwiseXOrExpression infers Expression:
    Precedence8 ({infer BinaryExpression.lhs=current} op=("^") rhs=Precedence8)*;

Precedence8: BitwiseAndExpression;

BitwiseAndExpression infers Expression:
    Precedence9 ({infer BinaryExpression.lhs=current} op=("&") rhs=Precedence9)*;

Precedence9: BitshiftExpression;

BitshiftExpression infers Expression:
    Precedence10 ({infer BinaryExpression.lhs=current} op=("<<" | ">>") rhs=Precedence10)*;

Precedence10: SumExpression;

SumExpression infers Expression:
    Precedence11 ({infer BinaryExpression.lhs=current} op=("+" | "-") rhs=Precedence11)*;

Precedence11: ProductExpression;

ProductExpression infers Expression:
    Precedence12 ({infer BinaryExpression.lhs=current} op=("*" | "/" | "%") rhs=Precedence12)*;

Precedence12: CastExpression;

CastExpression infers Expression:
    "<" type=TypeExpression ">" expression=Precedence13;

Precedence13: LeftUnaryExpression | AwaitExpression | ConstructorExpression | HeldExpression | Precedence14;

LeftUnaryExpression infers Expression:
    op=("!" | "-" | "~") Precedence13;

AwaitExpression infers Expression:
    Await expression=Precedence13;

ConstructorExpression infers Expression:
    New constructor=PathExpression;

HeldExpression infers Expression:
    Hold held=Precedence13;

Precedence14: PathExpression;

PathExpression infers Expression: 
    PrimaryExpression (path+=MemberAccessPath | path+=CallPath | path+=ArrayAccessPath)*;

MemberAccessPath:
    "." name=ID;

CallPath:
    "(" (arguments+=Expression ("," arguments+=Expression)* )? ")";

ArrayAccessPath:
    "[" expression=Expression "]";

PrimaryExpression: GroupLiteral | ID | FloatLiteral | IntegerLiteral | HexLiteral | BinaryLiteral | OctalLiteral | StringLiteral | FalseLiteral | TrueLiteral | NullLiteral | ThisLiteral | SuperLiteral | AsyncBlockLiteral;

GroupLiteral infers Expression:
    "(" expression=Expression ")";

FloatLiteral infers Expression:
    value=Float;

IntegerLiteral infers Expression:
    value=Integer;

HexLiteral infers Expression:
    value=Hex;

BinaryLiteral infers Expression:
    value=Binary;

OctalLiteral infers Expression:
    value=Octal;

StringLiteral infers Expression:
    value=String;

FalseLiteral infers Expression:
    false=False;

TrueLiteral infers Expression:
    true=True;

NullLiteral infers Expression:
    null=Null;

ThisLiteral infers Expression:
    this=This;

SuperLiteral infers Expression:
    super=Super;

AsyncBlockLiteral infers Expression:
    Async "<" type=TypeExpression ">" block=BlockStatement;

ID:
    name=Identifier;


terminal String: /"([^"\r\n]|\\\.)*"/;

terminal Import: "import";
terminal Export: "export";
terminal Final: "final";
terminal Type: "type";
terminal Class: "class";
terminal Extends: "extends";
terminal Private: "private";
terminal Get: "get";
terminal Set: "set";
terminal Constructor: "constructor";
terminal Grab: "grab";
terminal While: "while";
terminal Continue: "continue";
terminal Await: "await";
terminal Async: "async";
terminal False: "false";
terminal True: "true";
terminal Null: "null";
terminal This: "this";
terminal Super: "super";
terminal Break: "break";
terminal If: "if";
terminal Return: "return";
terminal Const: "const";
terminal Let: "let";
terminal Yield: "yield";
terminal New: "new";
terminal Hold: "hold";
terminal From: "from";
terminal As: "as";
terminal Fn: "fn";
terminal Else: "else";
terminal Identifier: /[a-zA-Z$_][a-zA-Z$_0-9]*/;

terminal Binary: /0b[10]+/;
terminal Hex: /0x[0-9a-fA-F]+/;
terminal Octal: /0o[0-8]+/;
terminal Float: /[-+]?[0-9]+[.]?[0-9]*([eE][-+]?[0-9]+)?/;
terminal Integer: /[-+]?[0-9]+/;

// hidden stuff
hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

