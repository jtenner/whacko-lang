grammar Whacko

entry Program:
    (imports+=ImportStatement | exports+=ExportDeclaration | declarations+=FunctionDeclaration | declarations+=ClassDeclaration | declarations+=TypeDeclaration)*;

ImportStatement:
    "import" "{" (declarators+=ImportDeclarator ("," declarators+=ImportDeclarator)* )? "}" "from" path=STRING;

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
    (final="final")? "class" name=ID "extends" TypeExpression "{" (members+=ClassMember (members+=ClassMember)* )? "}";

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
    "if" "(" condition=Expression ")" truthy=Statement "else" falsy=Statement;

ReturnStatement:
    "return" expression=Expression ";";

VariableDeclarationStatement:
    type=("const" | "let") declarators+=VariableDeclarator ("," declarators+=VariableDeclarator)* ":";

VariableDeclarator:
    name=ID (":" type=TypeExpression)? "=" expression=Expression;

ExpressionStatement:
    expr=Expression ";";


hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"[^"]*"|'[^']*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
