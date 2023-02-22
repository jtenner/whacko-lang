"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhackoVisitor = void 0;
const langium_1 = require("langium");
const node_1 = require("langium/node");
const ast_1 = require("./generated/ast");
const whacko_module_1 = require("./whacko-module");
const declarations = new Set([
    "DeclareDeclaration",
    "ImportDeclaration",
    "ExportDeclaration",
    "FunctionDeclaration",
    "ClassDeclaration",
    "TypeDeclaration",
]);
function isDeclaration(node) {
    return declarations.has(node.$type);
}
class WhackoVisitor {
    revisit = false;
    currentNode = null;
    services = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko;
    visit(node) {
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
            case "PathExpression":
                return this.visitPathExpression(node);
            case "NewPath":
                return this.visitNewPath(node);
            case "MemberAccessPath":
                return this.visitMemberAccessPath(node);
            case "ArrayAccessPath":
                return this.visitArrayAccessPath(node);
            case "CallPath":
                return this.visitCallPath(node);
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
    visitProgram(node) {
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
    visitDeclareDeclaration(node) {
        this.visit(node.namespace);
        this.visit(node.method);
        for (const parameter of node.parameters) {
            this.visit(parameter);
        }
        this.visit(node.returnType);
    }
    visitImportDeclaration(node) {
        for (const declarator of node.declarators) {
            this.visit(declarator);
        }
        this.visit(node.path);
    }
    visitExportDeclaration(node) {
        for (const declarator of node.declarators) {
            this.visit(declarator);
        }
    }
    visitExportDeclarator(node) {
        this.visit(node.name);
        if (node.alias)
            this.visit(node.alias);
    }
    visitImportDeclarator(node) {
        this.visit(node.name);
        if (node.alias)
            this.visit(node.alias);
    }
    visitFunctionDeclaration(node) {
        this.visit(node.name);
        for (const parameter of node.parameters) {
            this.visit(parameter);
        }
        this.visit(node.returnType);
        this.visit(node.block);
    }
    visitParameter(node) {
        this.visit(node.name);
        this.visit(node.type);
    }
    visitTypeDeclaration(node) {
        this.visit(node.name);
        for (const typeParameter of node.typeParameters) {
            this.visit(typeParameter);
        }
        this.visit(node.type);
    }
    visitClassDeclaration(node) {
        this.visit(node.name);
        if (node.extends)
            this.visit(node.extends);
        for (const member of node.members) {
            this.visit(member);
        }
    }
    visitHeldTypeExpression(node) {
        this.visit(node.type);
    }
    visitFunctionTypeExpression(node) {
        for (const parameter of node.parameters) {
            this.visit(parameter);
        }
        this.visit(node.returnType);
    }
    visitTupleTypeExpression(node) {
        for (const type of node.types) {
            this.visit(type);
        }
    }
    visitNamedTypeExpression(node) {
        this.visit(node.name);
        for (const typeParameter of node.typeParameters) {
            this.visit(typeParameter);
        }
    }
    visitFieldClassMember(node) {
        this.visit(node.name);
        this.visit(node.type);
        if (node.initializer)
            this.visit(node.initializer);
    }
    visitMethodClassMember(node) {
        this.visit(node.name);
        for (const parameter of node.parameters) {
            this.visit(parameter);
        }
        this.visit(node.returnType);
        this.visit(node.block);
    }
    visitGetterClassMember(node) {
        this.visit(node.name);
        this.visit(node.returnType);
        this.visit(node.block);
    }
    visitSetterClassMember(node) {
        this.visit(node.name);
        this.visit(node.parameter);
        this.visit(node.block);
    }
    visitConstructorClassMember(node) {
        for (const parameter of node.parameters) {
            this.visit(parameter);
        }
        this.visit(node.block);
    }
    visitBlockStatement(node) {
        for (const statement of node.statements) {
            this.visit(statement);
        }
    }
    visitTypeDeclarationStatement(node) {
        this.visit(node.name);
        for (const typeParameter of node.typeParameters) {
            this.visit(typeParameter);
        }
        this.visit(node.type);
    }
    visitGrabStatement(node) {
        this.visit(node.heldExpression);
        this.visit(node.statement);
    }
    visitWhileStatement(node) {
        this.visit(node.expression);
        this.visit(node.statement);
    }
    visitContinueStatement(node) { }
    visitBreakStatement(node) { }
    visitIfElseStatement(node) {
        this.visit(node.condition);
        this.visit(node.truthy);
        if (node.falsy)
            this.visit(node.falsy);
    }
    visitReturnStatement(node) {
        this.visit(node.expression);
    }
    visitVariableDeclarationStatement(node) {
        for (const declarator of node.declarators) {
            this.visit(declarator);
        }
    }
    visitVariableDeclarator(node) {
        this.visit(node.name);
        if (node.type)
            this.visit(node.type);
        this.visit(node.expression);
    }
    visitExpressionStatement(node) {
        this.visit(node.expression);
    }
    visitTupleExpression(node) {
        for (const expression of node.expressions) {
            this.visit(expression);
        }
    }
    visitYieldExpression(node) {
        this.visit(node.expression);
    }
    visitTernaryExpression(node) {
        this.visit(node.condition);
        this.visit(node.truthy);
        this.visit(node.falsy);
    }
    visitBinaryExpression(node) {
        this.visit(node.lhs);
        this.visit(node.rhs);
    }
    visitLeftUnaryExpression(node) {
        this.visit(node.expression);
    }
    visitAwaitExpression(node) {
        this.visit(node.expression);
    }
    visitHoldExpression(node) {
        this.visit(node.expression);
    }
    visitPathExpression(node) {
        this.visit(node.root);
        for (const path of node.path) {
            this.visit(path);
        }
    }
    visitNewPath(node) {
        for (const param of node.typeParameters) {
            this.visit(param);
        }
        for (const param of node.parameters) {
            this.visit(param);
        }
    }
    visitMemberAccessPath(node) {
        this.visit(node.member);
    }
    visitArrayAccessPath(node) {
        this.visit(node.expression);
    }
    visitCallPath(node) {
        for (const param of node.typeParameters) {
            this.visit(param);
        }
        for (const param of node.parameters) {
            this.visit(param);
        }
    }
    visitGroupLiteral(expression) {
        this.visit(expression.expression);
    }
    visitFloatLiteral(expression) { }
    visitIntegerLiteral(expression) { }
    visitHexLiteral(expression) { }
    visitBinaryLiteral(expression) { }
    visitOctalLiteral(expression) { }
    visitStringLiteral(expression) { }
    visitFalseLiteral(expression) { }
    visitTrueLiteral(expression) { }
    visitNullLiteral(expression) { }
    visitThisLiteral(expression) { }
    visitSuperLiteral(expression) { }
    visitAsyncBlockLiteral(expression) {
        if (expression.type)
            this.visit(expression.type);
        this.visit(expression.block);
    }
    visitIdentifier(expression) { }
    replace(node, contents) {
        let replacer;
        if ((0, ast_1.isExpression)(node)) {
            const result = this.services.parser.LangiumParser.parse(`fn a(): void { ${contents}; });`);
            const expression = result.value.declarations[0].block
                .statements[0].expression;
            replacer = expression;
        }
        else if ((0, ast_1.isStatement)(node)) {
            const result = this.services.parser.LangiumParser.parse(`fn a(): void { ${contents} });`);
            const statement = result.value.declarations[0]
                .block.statements[0];
            replacer = statement;
        }
        else if (isDeclaration(node)) {
            const result = this.services.parser.LangiumParser.parse(contents);
            const declaration = result.value.declarations[0] ??
                result.value.exports[0] ??
                result.value.imports[0];
            replacer = declaration;
        }
        else {
            throw new Error("Something went wrong!");
        }
        this.replaceNode(node, replacer);
    }
    replaceNode(node, replacer) {
        const parent = node.$container;
        if (!(0, langium_1.isAstNode)(node) || !(0, langium_1.isAstNode)(replacer))
            throw new Error("Node or Replacement Node parameter is not an ASTNode");
        if ((isDeclaration(node) && isDeclaration(replacer)) ||
            ((0, ast_1.isStatement)(node) && (0, ast_1.isStatement)(replacer)) ||
            ((0, ast_1.isExpression)(node) && (0, ast_1.isExpression)(replacer))) {
            // @ts-ignore: this is safe I promise
            replacer.$container = node.$container;
            // @ts-ignore: this is safe I promise
            replacer.$containerIndex = node.$containerIndex;
            // @ts-ignore: this is safe I promise
            replacer.$containerProperty = node.$containerProperty;
            if (typeof node.$containerIndex === "number") {
                // @ts-ignore: this is safe I promise
                parent[node.$containerProperty][node.$containerIndex] = replacer;
            }
            else {
                // @ts-ignore: this is safe I promise
                parent[node.$containerProperty] = replacer;
            }
        }
    }
}
exports.WhackoVisitor = WhackoVisitor;
//# sourceMappingURL=WhackoVisitor.js.map