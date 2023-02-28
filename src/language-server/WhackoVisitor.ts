import { AstNode, isAstNode } from "langium";
import { NodeFileSystem } from "langium/node";
import {
  isExpression,
  isStatement,
  Program,
  DeclareDeclaration,
  ImportDeclaration,
  ExportDeclaration,
  ExportDeclarator,
  ImportDeclarator,
  FunctionDeclaration,
  Parameter,
  TypeDeclaration,
  ClassDeclaration,
  TypeExpression,
  HeldTypeExpression,
  FunctionTypeExpression,
  TupleTypeExpression,
  NamedTypeExpression,
  FieldClassMember,
  MethodClassMember,
  GetterClassMember,
  SetterClassMember,
  ConstructorClassMember,
  BlockStatement,
  TypeDeclarationStatement,
  GrabStatement,
  WhileStatement,
  ContinueStatement,
  BreakStatement,
  IfElseStatement,
  ReturnStatement,
  VariableDeclarationStatement,
  VariableDeclarator,
  ExpressionStatement,
  TupleExpression,
  YieldExpression,
  TernaryExpression,
  BinaryExpression,
  LeftUnaryExpression,
  AwaitExpression,
  HoldExpression,
  NewExpression,
  GroupLiteral,
  FloatLiteral,
  BinaryLiteral,
  HexLiteral,
  IntegerLiteral,
  OctalLiteral,
  StringLiteral,
  FalseLiteral,
  TrueLiteral,
  NullLiteral,
  ThisLiteral,
  SuperLiteral,
  AsyncBlockLiteral,
  ID,
  FunctionLiteral,
  CallExpression,
  ArrayAccessExpression,
  MemberAccessExpression,
} from "./generated/ast";
import { createWhackoServices, WhackoServices } from "./whacko-module";

const declarations = new Set([
  "DeclareDeclaration",
  "ImportDeclaration",
  "ExportDeclaration",
  "FunctionDeclaration",
  "ClassDeclaration",
  "TypeDeclaration",
]);

function isDeclaration(node: any) {
  return declarations.has(node.$type);
}

export class WhackoVisitor {
  private revisit: boolean = false;
  private currentNode: AstNode | null = null;
  private services: WhackoServices =
    createWhackoServices(NodeFileSystem).Whacko;

  visit(node: any) {
    switch (node.$type) {
      case "Program":
        return this.visitProgram(node);
      case "DeclareDeclaration":
        return this.visitDeclareDeclaration(node);
      case "ImportDeclaration":
        return this.visitImportDeclaration(node);
      case "ImportDeclarator":
        return this.visitImportDeclarator(node);
      case "ExportDeclaration":
        return this.visitExportDeclaration(node);
      case "ExportDeclarator":
        return this.visitExportDeclarator(node);
      case "FunctionDeclaration":
        return this.visitFunctionDeclaration(node);
      case "Parameter":
        return this.visitParameter(node);
      case "TypeDeclaration":
        return this.visitTypeDeclaration(node);
      case "ClassDeclaration":
        return this.visitClassDeclaration(node);
      case "HeldTypeExpression":
        return this.visitHeldTypeExpression(node);
      case "FunctionTypeExpression":
        return this.visitFunctionTypeExpression(node);
      case "TupleTypeExpression":
        return this.visitTupleTypeExpression(node);
      case "NamedTypeExpression":
        return this.visitNamedTypeExpression(node);
      case "FieldClassMember":
        return this.visitFieldClassMember(node);
      case "MethodClassMember":
        return this.visitMethodClassMember(node);
      case "GetterClassMember":
        return this.visitGetterClassMember(node);
      case "SetterClassMember":
        return this.visitSetterClassMember(node);
      case "ConstructorClassMember":
        return this.visitConstructorClassMember(node);
      case "BlockStatement":
        return this.visitBlockStatement(node);
      case "TypeDeclarationStatement":
        return this.visitTypeDeclarationStatement(node);
      case "GrabStatement":
        return this.visitGrabStatement(node);
      case "WhileStatement":
        return this.visitWhileStatement(node);
      case "ContinueStatement":
        return this.visitContinueStatement(node);
      case "BreakStatement":
        return this.visitBreakStatement(node);
      case "IfElseStatement":
        return this.visitIfElseStatement(node);
      case "ReturnStatement":
        return this.visitReturnStatement(node);
      case "VariableDeclarationStatement":
        return this.visitVariableDeclarationStatement(node);
      case "VariableDeclarator":
        return this.visitVariableDeclarator(node);
      case "ExpressionStatement":
        return this.visitExpressionStatement(node);
      case "TupleExpression":
        return this.visitTupleExpression(node);
      case "YieldExpression":
        return this.visitYieldExpression(node);
      case "TernaryExpression":
        return this.visitTernaryExpression(node);
      case "BinaryExpression":
        return this.visitBinaryExpression(node);
      case "LeftUnaryExpression":
        return this.visitLeftUnaryExpression(node);
      case "AwaitExpression":
        return this.visitAwaitExpression(node);
      case "HoldExpression":
        return this.visitHoldExpression(node);
      case "CallExpression":
        return this.visitCallExpression(node);
      case "NewExpression":
        return this.visitNewExpression(node);
      case "MemberAccess":
        return this.visitMemberAccessExpression(node);
      case "ArrayAccessExpression":
        return this.visitArrayAccessExpression(node);
      case "GroupLiteral":
        return this.visitGroupLiteral(node);
      case "FloatLiteral":
        return this.visitFloatLiteral(node);
      case "IntegerLiteral":
        return this.visitIntegerLiteral(node);
      case "HexLiteral":
        return this.visitHexLiteral(node);
      case "BinaryLiteral":
        return this.visitBinaryLiteral(node);
      case "OctalLiteral":
        return this.visitOctalLiteral(node);
      case "StringLiteral":
        return this.visitStringLiteral(node);
      case "FalseLiteral":
        return this.visitFalseLiteral(node);
      case "TrueLiteral":
        return this.visitTrueLiteral(node);
      case "NullLiteral":
        return this.visitNullLiteral(node);
      case "ThisLiteral":
        return this.visitThisLiteral(node);
      case "SuperLiteral":
        return this.visitSuperLiteral(node);
      case "AsyncBlockLiteral":
        return this.visitAsyncBlockLiteral(node);
      case "ID":
        return this.visitIdentifier(node);
    }
  }

  visitProgram(node: Program) {
    for (const imports of node.imports) {
      this.visit(imports);
    }
    for (const declaration of node.declarations) {
      this.visit(declaration);
    }
    for (const exports of node.exports) {
      this.visit(exports);
    }
  }

  visitDeclareDeclaration(node: DeclareDeclaration) {
    this.visit(node.namespace);
    this.visit(node.method);
    for (const parameter of node.parameters) {
      this.visit(parameter);
    }
    this.visit(node.returnType);
  }

  visitImportDeclaration(node: ImportDeclaration) {
    for (const declarator of node.declarators) {
      this.visit(declarator);
    }
    this.visit(node.path);
  }

  visitExportDeclaration(node: ExportDeclaration) {
    for (const declarator of node.declarators) {
      this.visit(declarator);
    }
  }

  visitExportDeclarator(node: ExportDeclarator) {
    this.visit(node.name);
    if (node.alias) this.visit(node.alias);
  }

  visitImportDeclarator(node: ImportDeclarator) {
    this.visit(node.name);
    if (node.alias) this.visit(node.alias);
  }

  visitFunctionDeclaration(node: FunctionDeclaration) {
    this.visit(node.name);
    for (const parameter of node.parameters) {
      this.visit(parameter);
    }
    this.visit(node.returnType);
    this.visit(node.block);
  }

  visitParameter(node: Parameter) {
    this.visit(node.name);
    this.visit(node.type);
  }

  visitTypeDeclaration(node: TypeDeclaration) {
    this.visit(node.name);
    for (const typeParameter of node.typeParameters) {
      this.visit(typeParameter);
    }
    this.visit(node.type);
  }

  visitClassDeclaration(node: ClassDeclaration) {
    this.visit(node.name);
    if (node.extends) this.visit(node.extends);
    for (const member of node.members) {
      this.visit(member);
    }
  }

  visitHeldTypeExpression(node: HeldTypeExpression) {
    this.visit(node.type);
  }

  visitFunctionTypeExpression(node: FunctionTypeExpression) {
    for (const parameter of node.parameters) {
      this.visit(parameter);
    }
    this.visit(node.returnType);
  }

  visitTupleTypeExpression(node: TupleTypeExpression) {
    for (const type of node.types) {
      this.visit(type);
    }
  }

  visitNamedTypeExpression(node: NamedTypeExpression) {
    this.visit(node.name);
    for (const typeParameter of node.typeParameters) {
      this.visit(typeParameter);
    }
  }

  visitFieldClassMember(node: FieldClassMember) {
    this.visit(node.name);
    this.visit(node.type);
    if (node.initializer) this.visit(node.initializer);
  }

  visitMethodClassMember(node: MethodClassMember) {
    this.visit(node.name);
    for (const parameter of node.parameters) {
      this.visit(parameter);
    }
    this.visit(node.returnType);
    this.visit(node.block);
  }

  visitGetterClassMember(node: GetterClassMember) {
    this.visit(node.name);
    this.visit(node.returnType);
    this.visit(node.block);
  }

  visitSetterClassMember(node: SetterClassMember) {
    this.visit(node.name);
    this.visit(node.parameter);
    this.visit(node.block);
  }

  visitConstructorClassMember(node: ConstructorClassMember) {
    for (const parameter of node.parameters) {
      this.visit(parameter);
    }
    this.visit(node.block);
  }

  visitBlockStatement(node: BlockStatement) {
    for (const statement of node.statements) {
      this.visit(statement);
    }
  }

  visitTypeDeclarationStatement(node: TypeDeclarationStatement) {
    this.visit(node.name);
    for (const typeParameter of node.typeParameters) {
      this.visit(typeParameter);
    }
    this.visit(node.type);
  }

  visitGrabStatement(node: GrabStatement) {
    this.visit(node.heldExpression);
    this.visit(node.statement);
  }

  visitWhileStatement(node: WhileStatement) {
    this.visit(node.expression);
    this.visit(node.statement);
  }

  visitContinueStatement(node: ContinueStatement) {}

  visitBreakStatement(node: BreakStatement) {}

  visitIfElseStatement(node: IfElseStatement) {
    this.visit(node.condition);
    this.visit(node.truthy);
    if (node.falsy) this.visit(node.falsy);
  }

  visitReturnStatement(node: ReturnStatement) {
    this.visit(node.expression);
  }

  visitVariableDeclarationStatement(node: VariableDeclarationStatement) {
    for (const declarator of node.declarators) {
      this.visit(declarator);
    }
  }

  visitVariableDeclarator(node: VariableDeclarator) {
    this.visit(node.name);
    if (node.type) this.visit(node.type);
    this.visit(node.expression);
  }

  visitExpressionStatement(node: ExpressionStatement) {
    this.visit(node.expression);
  }

  visitTupleExpression(node: TupleExpression) {
    for (const expression of node.expressions) {
      this.visit(expression);
    }
  }

  visitYieldExpression(node: YieldExpression) {
    this.visit(node.expression);
  }

  visitTernaryExpression(node: TernaryExpression) {
    this.visit(node.condition);
    this.visit(node.truthy);
    this.visit(node.falsy);
  }

  visitBinaryExpression(node: BinaryExpression) {
    this.visit(node.lhs);
    this.visit(node.rhs);
  }

  visitLeftUnaryExpression(node: LeftUnaryExpression) {
    this.visit(node.expression);
  }

  visitAwaitExpression(node: AwaitExpression) {
    this.visit(node.expression);
  }

  visitHoldExpression(node: HoldExpression) {
    this.visit(node.expression);
  }

  visitCallExpression(node: CallExpression) {
    this.visit(node.callRoot);
    for (const parameter of node.typeParameters) this.visit(parameter);
    for (const parameter of node.parameters) this.visit(parameter);
  }

  visitNewExpression(node: NewExpression) {
    this.visit(node.expression);

    for (const param of node.typeParameters) {
      this.visit(param);
    }
    for (const param of node.parameters) {
      this.visit(param);
    }
  }

  visitMemberAccessExpression(node: MemberAccessExpression) {
    this.visit(node.memberRoot!);
    this.visit(node.member);
  }

  visitArrayAccessExpression(node: ArrayAccessExpression) {
    this.visit(node.arrayRoot);
    this.visit(node.indexExpression);
  }

  visitFunctionLiteral(expression: FunctionLiteral) {
    for (const typeParameter of expression.typeParameters) {
      this.visit(typeParameter);
    }
    for (const parameter of expression.parameters) {
      this.visit(parameter);
    }
    this.visit(expression.returnType);
    this.visit(expression.block);
  }

  visitGroupLiteral(expression: GroupLiteral) {
    this.visit(expression.expression);
  }

  visitFloatLiteral(expression: FloatLiteral) {}

  visitIntegerLiteral(expression: IntegerLiteral) {}

  visitHexLiteral(expression: HexLiteral) {}

  visitBinaryLiteral(expression: BinaryLiteral) {}

  visitOctalLiteral(expression: OctalLiteral) {}

  visitStringLiteral(expression: StringLiteral) {}

  visitFalseLiteral(expression: FalseLiteral) {}

  visitTrueLiteral(expression: TrueLiteral) {}

  visitNullLiteral(expression: NullLiteral) {}

  visitThisLiteral(expression: ThisLiteral) {}

  visitSuperLiteral(expression: SuperLiteral) {}

  visitAsyncBlockLiteral(expression: AsyncBlockLiteral) {
    if (expression.type) this.visit(expression.type);
    this.visit(expression.block);
  }

  visitIdentifier(expression: ID) {}

  replace(node: AstNode, contents: string): void {
    let replacer: AstNode;
    if (isExpression(node)) {
      const result = this.services.parser.LangiumParser.parse<Program>(
        `fn a(): void { ${contents}; });`
      );
      const expression = (
        (result.value.declarations[0] as FunctionDeclaration).block!
          .statements[0] as ExpressionStatement
      ).expression!;
      replacer = expression;
    } else if (isStatement(node)) {
      const result = this.services.parser.LangiumParser.parse<Program>(
        `fn a(): void { ${contents} });`
      );
      const statement = (result.value.declarations[0] as FunctionDeclaration)
        .block!.statements[0];
      replacer = statement;
    } else if (isDeclaration(node)) {
      const result =
        this.services.parser.LangiumParser.parse<Program>(contents);
      const declaration =
        result.value.declarations[0] ??
        result.value.exports[0] ??
        result.value.imports[0];
      replacer = declaration;
    } else {
      throw new Error("Something went wrong!");
    }
    this.replaceNode(node, replacer);
  }

  replaceNode(node: AstNode, replacer: AstNode) {
    const parent = node.$container;
    if (!isAstNode(node) || !isAstNode(replacer))
      throw new Error("Node or Replacement Node parameter is not an ASTNode");

    if (
      (isDeclaration(node) && isDeclaration(replacer)) ||
      (isStatement(node) && isStatement(replacer)) ||
      (isExpression(node) && isExpression(replacer))
    ) {
      // @ts-ignore: this is safe I promise, $container is readonly
      replacer.$container = node.$container;
      // @ts-ignore: this is safe I promise, $container is readonly
      replacer.$containerIndex = node.$containerIndex;
      // @ts-ignore: this is safe I promise, $container is readonly
      replacer.$containerProperty = node.$containerProperty;

      if (typeof node.$containerIndex === "number") {
        // @ts-ignore: this is safe I promise
        parent[node.$containerProperty][node.$containerIndex] = replacer;
      } else {
        // @ts-ignore: this is safe I promise
        parent[node.$containerProperty] = replacer;
      }
    }
  }
}
