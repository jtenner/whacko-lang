"use strict";
/******************************************************************************
 * This file was generated by langium-cli 1.0.0.
 * DO NOT EDIT MANUALLY!
 ******************************************************************************/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHexLiteral = exports.HexLiteral = exports.isGroupLiteral = exports.GroupLiteral = exports.isGrabStatement = exports.GrabStatement = exports.isGetterClassMember = exports.GetterClassMember = exports.isFunctionDeclaration = exports.FunctionDeclaration = exports.isFloatLiteral = exports.FloatLiteral = exports.isFieldClassMember = exports.FieldClassMember = exports.isFalseLiteral = exports.FalseLiteral = exports.isExpressionStatement = exports.ExpressionStatement = exports.isExportDeclarator = exports.ExportDeclarator = exports.isExportDeclaration = exports.ExportDeclaration = exports.isContinueStatement = exports.ContinueStatement = exports.isConstructorClassMember = exports.ConstructorClassMember = exports.isClassMember = exports.ClassMember = exports.isClassDeclaration = exports.ClassDeclaration = exports.isCallPath = exports.CallPath = exports.isBreakStatement = exports.BreakStatement = exports.isBlockStatement = exports.BlockStatement = exports.isBinaryLiteral = exports.BinaryLiteral = exports.isBinaryExpression = exports.BinaryExpression = exports.isAsyncBlockLiteral = exports.AsyncBlockLiteral = exports.isArrayAccessPath = exports.ArrayAccessPath = exports.isStatement = exports.Statement = exports.isPrimaryExpression = exports.PrimaryExpression = exports.isExpression = exports.Expression = void 0;
exports.isYieldExpression = exports.YieldExpression = exports.isWhileStatement = exports.WhileStatement = exports.isVariableDeclarator = exports.VariableDeclarator = exports.isVariableDeclarationStatement = exports.VariableDeclarationStatement = exports.isTypeDeclarationStatement = exports.TypeDeclarationStatement = exports.isTypeDeclaration = exports.TypeDeclaration = exports.isTrueLiteral = exports.TrueLiteral = exports.isThisLiteral = exports.ThisLiteral = exports.isSuperLiteral = exports.SuperLiteral = exports.isStringLiteral = exports.StringLiteral = exports.isSetterClassMember = exports.SetterClassMember = exports.isReturnStatement = exports.ReturnStatement = exports.isProgram = exports.Program = exports.isParameter = exports.Parameter = exports.isOctalLiteral = exports.OctalLiteral = exports.isNullLiteral = exports.NullLiteral = exports.isNewPath = exports.NewPath = exports.isMethodClassMember = exports.MethodClassMember = exports.isMemberAccessPath = exports.MemberAccessPath = exports.isLeftUnaryExpression = exports.LeftUnaryExpression = exports.isIntegerLiteral = exports.IntegerLiteral = exports.isImportStatement = exports.ImportStatement = exports.isImportDeclarator = exports.ImportDeclarator = exports.isIfElseStatement = exports.IfElseStatement = exports.isID = exports.ID = void 0;
exports.reflection = exports.WhackoAstReflection = exports.isPathExpression = exports.PathExpression = exports.isHoldExpression = exports.HoldExpression = exports.isTernaryExpression = exports.TernaryExpression = exports.isAwaitExpression = exports.AwaitExpression = exports.isTypeExpression = exports.TypeExpression = void 0;
/* eslint-disable */
const langium_1 = require("langium");
exports.Expression = 'Expression';
function isExpression(item) {
    return exports.reflection.isInstance(item, exports.Expression);
}
exports.isExpression = isExpression;
exports.PrimaryExpression = 'PrimaryExpression';
function isPrimaryExpression(item) {
    return exports.reflection.isInstance(item, exports.PrimaryExpression);
}
exports.isPrimaryExpression = isPrimaryExpression;
exports.Statement = 'Statement';
function isStatement(item) {
    return exports.reflection.isInstance(item, exports.Statement);
}
exports.isStatement = isStatement;
exports.ArrayAccessPath = 'ArrayAccessPath';
function isArrayAccessPath(item) {
    return exports.reflection.isInstance(item, exports.ArrayAccessPath);
}
exports.isArrayAccessPath = isArrayAccessPath;
exports.AsyncBlockLiteral = 'AsyncBlockLiteral';
function isAsyncBlockLiteral(item) {
    return exports.reflection.isInstance(item, exports.AsyncBlockLiteral);
}
exports.isAsyncBlockLiteral = isAsyncBlockLiteral;
exports.BinaryExpression = 'BinaryExpression';
function isBinaryExpression(item) {
    return exports.reflection.isInstance(item, exports.BinaryExpression);
}
exports.isBinaryExpression = isBinaryExpression;
exports.BinaryLiteral = 'BinaryLiteral';
function isBinaryLiteral(item) {
    return exports.reflection.isInstance(item, exports.BinaryLiteral);
}
exports.isBinaryLiteral = isBinaryLiteral;
exports.BlockStatement = 'BlockStatement';
function isBlockStatement(item) {
    return exports.reflection.isInstance(item, exports.BlockStatement);
}
exports.isBlockStatement = isBlockStatement;
exports.BreakStatement = 'BreakStatement';
function isBreakStatement(item) {
    return exports.reflection.isInstance(item, exports.BreakStatement);
}
exports.isBreakStatement = isBreakStatement;
exports.CallPath = 'CallPath';
function isCallPath(item) {
    return exports.reflection.isInstance(item, exports.CallPath);
}
exports.isCallPath = isCallPath;
exports.ClassDeclaration = 'ClassDeclaration';
function isClassDeclaration(item) {
    return exports.reflection.isInstance(item, exports.ClassDeclaration);
}
exports.isClassDeclaration = isClassDeclaration;
exports.ClassMember = 'ClassMember';
function isClassMember(item) {
    return exports.reflection.isInstance(item, exports.ClassMember);
}
exports.isClassMember = isClassMember;
exports.ConstructorClassMember = 'ConstructorClassMember';
function isConstructorClassMember(item) {
    return exports.reflection.isInstance(item, exports.ConstructorClassMember);
}
exports.isConstructorClassMember = isConstructorClassMember;
exports.ContinueStatement = 'ContinueStatement';
function isContinueStatement(item) {
    return exports.reflection.isInstance(item, exports.ContinueStatement);
}
exports.isContinueStatement = isContinueStatement;
exports.ExportDeclaration = 'ExportDeclaration';
function isExportDeclaration(item) {
    return exports.reflection.isInstance(item, exports.ExportDeclaration);
}
exports.isExportDeclaration = isExportDeclaration;
exports.ExportDeclarator = 'ExportDeclarator';
function isExportDeclarator(item) {
    return exports.reflection.isInstance(item, exports.ExportDeclarator);
}
exports.isExportDeclarator = isExportDeclarator;
exports.ExpressionStatement = 'ExpressionStatement';
function isExpressionStatement(item) {
    return exports.reflection.isInstance(item, exports.ExpressionStatement);
}
exports.isExpressionStatement = isExpressionStatement;
exports.FalseLiteral = 'FalseLiteral';
function isFalseLiteral(item) {
    return exports.reflection.isInstance(item, exports.FalseLiteral);
}
exports.isFalseLiteral = isFalseLiteral;
exports.FieldClassMember = 'FieldClassMember';
function isFieldClassMember(item) {
    return exports.reflection.isInstance(item, exports.FieldClassMember);
}
exports.isFieldClassMember = isFieldClassMember;
exports.FloatLiteral = 'FloatLiteral';
function isFloatLiteral(item) {
    return exports.reflection.isInstance(item, exports.FloatLiteral);
}
exports.isFloatLiteral = isFloatLiteral;
exports.FunctionDeclaration = 'FunctionDeclaration';
function isFunctionDeclaration(item) {
    return exports.reflection.isInstance(item, exports.FunctionDeclaration);
}
exports.isFunctionDeclaration = isFunctionDeclaration;
exports.GetterClassMember = 'GetterClassMember';
function isGetterClassMember(item) {
    return exports.reflection.isInstance(item, exports.GetterClassMember);
}
exports.isGetterClassMember = isGetterClassMember;
exports.GrabStatement = 'GrabStatement';
function isGrabStatement(item) {
    return exports.reflection.isInstance(item, exports.GrabStatement);
}
exports.isGrabStatement = isGrabStatement;
exports.GroupLiteral = 'GroupLiteral';
function isGroupLiteral(item) {
    return exports.reflection.isInstance(item, exports.GroupLiteral);
}
exports.isGroupLiteral = isGroupLiteral;
exports.HexLiteral = 'HexLiteral';
function isHexLiteral(item) {
    return exports.reflection.isInstance(item, exports.HexLiteral);
}
exports.isHexLiteral = isHexLiteral;
exports.ID = 'ID';
function isID(item) {
    return exports.reflection.isInstance(item, exports.ID);
}
exports.isID = isID;
exports.IfElseStatement = 'IfElseStatement';
function isIfElseStatement(item) {
    return exports.reflection.isInstance(item, exports.IfElseStatement);
}
exports.isIfElseStatement = isIfElseStatement;
exports.ImportDeclarator = 'ImportDeclarator';
function isImportDeclarator(item) {
    return exports.reflection.isInstance(item, exports.ImportDeclarator);
}
exports.isImportDeclarator = isImportDeclarator;
exports.ImportStatement = 'ImportStatement';
function isImportStatement(item) {
    return exports.reflection.isInstance(item, exports.ImportStatement);
}
exports.isImportStatement = isImportStatement;
exports.IntegerLiteral = 'IntegerLiteral';
function isIntegerLiteral(item) {
    return exports.reflection.isInstance(item, exports.IntegerLiteral);
}
exports.isIntegerLiteral = isIntegerLiteral;
exports.LeftUnaryExpression = 'LeftUnaryExpression';
function isLeftUnaryExpression(item) {
    return exports.reflection.isInstance(item, exports.LeftUnaryExpression);
}
exports.isLeftUnaryExpression = isLeftUnaryExpression;
exports.MemberAccessPath = 'MemberAccessPath';
function isMemberAccessPath(item) {
    return exports.reflection.isInstance(item, exports.MemberAccessPath);
}
exports.isMemberAccessPath = isMemberAccessPath;
exports.MethodClassMember = 'MethodClassMember';
function isMethodClassMember(item) {
    return exports.reflection.isInstance(item, exports.MethodClassMember);
}
exports.isMethodClassMember = isMethodClassMember;
exports.NewPath = 'NewPath';
function isNewPath(item) {
    return exports.reflection.isInstance(item, exports.NewPath);
}
exports.isNewPath = isNewPath;
exports.NullLiteral = 'NullLiteral';
function isNullLiteral(item) {
    return exports.reflection.isInstance(item, exports.NullLiteral);
}
exports.isNullLiteral = isNullLiteral;
exports.OctalLiteral = 'OctalLiteral';
function isOctalLiteral(item) {
    return exports.reflection.isInstance(item, exports.OctalLiteral);
}
exports.isOctalLiteral = isOctalLiteral;
exports.Parameter = 'Parameter';
function isParameter(item) {
    return exports.reflection.isInstance(item, exports.Parameter);
}
exports.isParameter = isParameter;
exports.Program = 'Program';
function isProgram(item) {
    return exports.reflection.isInstance(item, exports.Program);
}
exports.isProgram = isProgram;
exports.ReturnStatement = 'ReturnStatement';
function isReturnStatement(item) {
    return exports.reflection.isInstance(item, exports.ReturnStatement);
}
exports.isReturnStatement = isReturnStatement;
exports.SetterClassMember = 'SetterClassMember';
function isSetterClassMember(item) {
    return exports.reflection.isInstance(item, exports.SetterClassMember);
}
exports.isSetterClassMember = isSetterClassMember;
exports.StringLiteral = 'StringLiteral';
function isStringLiteral(item) {
    return exports.reflection.isInstance(item, exports.StringLiteral);
}
exports.isStringLiteral = isStringLiteral;
exports.SuperLiteral = 'SuperLiteral';
function isSuperLiteral(item) {
    return exports.reflection.isInstance(item, exports.SuperLiteral);
}
exports.isSuperLiteral = isSuperLiteral;
exports.ThisLiteral = 'ThisLiteral';
function isThisLiteral(item) {
    return exports.reflection.isInstance(item, exports.ThisLiteral);
}
exports.isThisLiteral = isThisLiteral;
exports.TrueLiteral = 'TrueLiteral';
function isTrueLiteral(item) {
    return exports.reflection.isInstance(item, exports.TrueLiteral);
}
exports.isTrueLiteral = isTrueLiteral;
exports.TypeDeclaration = 'TypeDeclaration';
function isTypeDeclaration(item) {
    return exports.reflection.isInstance(item, exports.TypeDeclaration);
}
exports.isTypeDeclaration = isTypeDeclaration;
exports.TypeDeclarationStatement = 'TypeDeclarationStatement';
function isTypeDeclarationStatement(item) {
    return exports.reflection.isInstance(item, exports.TypeDeclarationStatement);
}
exports.isTypeDeclarationStatement = isTypeDeclarationStatement;
exports.VariableDeclarationStatement = 'VariableDeclarationStatement';
function isVariableDeclarationStatement(item) {
    return exports.reflection.isInstance(item, exports.VariableDeclarationStatement);
}
exports.isVariableDeclarationStatement = isVariableDeclarationStatement;
exports.VariableDeclarator = 'VariableDeclarator';
function isVariableDeclarator(item) {
    return exports.reflection.isInstance(item, exports.VariableDeclarator);
}
exports.isVariableDeclarator = isVariableDeclarator;
exports.WhileStatement = 'WhileStatement';
function isWhileStatement(item) {
    return exports.reflection.isInstance(item, exports.WhileStatement);
}
exports.isWhileStatement = isWhileStatement;
exports.YieldExpression = 'YieldExpression';
function isYieldExpression(item) {
    return exports.reflection.isInstance(item, exports.YieldExpression);
}
exports.isYieldExpression = isYieldExpression;
exports.TypeExpression = 'TypeExpression';
function isTypeExpression(item) {
    return exports.reflection.isInstance(item, exports.TypeExpression);
}
exports.isTypeExpression = isTypeExpression;
exports.AwaitExpression = 'AwaitExpression';
function isAwaitExpression(item) {
    return exports.reflection.isInstance(item, exports.AwaitExpression);
}
exports.isAwaitExpression = isAwaitExpression;
exports.TernaryExpression = 'TernaryExpression';
function isTernaryExpression(item) {
    return exports.reflection.isInstance(item, exports.TernaryExpression);
}
exports.isTernaryExpression = isTernaryExpression;
exports.HoldExpression = 'HoldExpression';
function isHoldExpression(item) {
    return exports.reflection.isInstance(item, exports.HoldExpression);
}
exports.isHoldExpression = isHoldExpression;
exports.PathExpression = 'PathExpression';
function isPathExpression(item) {
    return exports.reflection.isInstance(item, exports.PathExpression);
}
exports.isPathExpression = isPathExpression;
class WhackoAstReflection extends langium_1.AbstractAstReflection {
    getAllTypes() {
        return ['ArrayAccessPath', 'AsyncBlockLiteral', 'AwaitExpression', 'BinaryExpression', 'BinaryLiteral', 'BlockStatement', 'BreakStatement', 'CallPath', 'ClassDeclaration', 'ClassMember', 'ConstructorClassMember', 'ContinueStatement', 'ExportDeclaration', 'ExportDeclarator', 'Expression', 'ExpressionStatement', 'FalseLiteral', 'FieldClassMember', 'FloatLiteral', 'FunctionDeclaration', 'GetterClassMember', 'GrabStatement', 'GroupLiteral', 'HexLiteral', 'HoldExpression', 'ID', 'IfElseStatement', 'ImportDeclarator', 'ImportStatement', 'IntegerLiteral', 'LeftUnaryExpression', 'MemberAccessPath', 'MethodClassMember', 'NewPath', 'NullLiteral', 'OctalLiteral', 'Parameter', 'PathExpression', 'PrimaryExpression', 'Program', 'ReturnStatement', 'SetterClassMember', 'Statement', 'StringLiteral', 'SuperLiteral', 'TernaryExpression', 'ThisLiteral', 'TrueLiteral', 'TypeDeclaration', 'TypeDeclarationStatement', 'TypeExpression', 'VariableDeclarationStatement', 'VariableDeclarator', 'WhileStatement', 'YieldExpression'];
    }
    computeIsSubtype(subtype, supertype) {
        switch (subtype) {
            case exports.AsyncBlockLiteral:
            case exports.BinaryLiteral:
            case exports.FalseLiteral:
            case exports.FloatLiteral:
            case exports.GroupLiteral:
            case exports.HexLiteral:
            case exports.ID:
            case exports.IntegerLiteral:
            case exports.NullLiteral:
            case exports.OctalLiteral:
            case exports.StringLiteral:
            case exports.SuperLiteral:
            case exports.ThisLiteral:
            case exports.TrueLiteral: {
                return this.isSubtype(exports.PrimaryExpression, supertype);
            }
            case exports.BinaryExpression:
            case exports.LeftUnaryExpression:
            case exports.YieldExpression: {
                return this.isSubtype(exports.Expression, supertype);
            }
            case exports.BlockStatement:
            case exports.BreakStatement:
            case exports.ContinueStatement:
            case exports.ExpressionStatement:
            case exports.GrabStatement:
            case exports.IfElseStatement:
            case exports.ReturnStatement:
            case exports.TypeDeclarationStatement:
            case exports.VariableDeclarationStatement:
            case exports.WhileStatement: {
                return this.isSubtype(exports.Statement, supertype);
            }
            case exports.TypeExpression: {
                return this.isSubtype(exports.ClassDeclaration, supertype);
            }
            case exports.AwaitExpression: {
                return this.isSubtype(exports.LeftUnaryExpression, supertype);
            }
            case exports.TernaryExpression: {
                return this.isSubtype(exports.YieldExpression, supertype);
            }
            case exports.HoldExpression: {
                return this.isSubtype(exports.AwaitExpression, supertype);
            }
            case exports.PathExpression: {
                return this.isSubtype(exports.HoldExpression, supertype);
            }
            case exports.Expression: {
                return this.isSubtype(exports.TernaryExpression, supertype);
            }
            case exports.PrimaryExpression: {
                return this.isSubtype(exports.PathExpression, supertype);
            }
            default: {
                return false;
            }
        }
    }
    getReferenceType(refInfo) {
        const referenceId = `${refInfo.container.$type}:${refInfo.property}`;
        switch (referenceId) {
            default: {
                throw new Error(`${referenceId} is not a valid reference id.`);
            }
        }
    }
    getTypeMetaData(type) {
        switch (type) {
            case 'AsyncBlockLiteral': {
                return {
                    name: 'AsyncBlockLiteral',
                    mandatory: [
                        { name: 'statements', type: 'array' }
                    ]
                };
            }
            case 'BlockStatement': {
                return {
                    name: 'BlockStatement',
                    mandatory: [
                        { name: 'statements', type: 'array' }
                    ]
                };
            }
            case 'CallPath': {
                return {
                    name: 'CallPath',
                    mandatory: [
                        { name: 'typeParameters', type: 'array' }
                    ]
                };
            }
            case 'ClassDeclaration': {
                return {
                    name: 'ClassDeclaration',
                    mandatory: [
                        { name: 'members', type: 'array' }
                    ]
                };
            }
            case 'ClassMember': {
                return {
                    name: 'ClassMember',
                    mandatory: [
                        { name: 'members', type: 'array' }
                    ]
                };
            }
            case 'ConstructorClassMember': {
                return {
                    name: 'ConstructorClassMember',
                    mandatory: [
                        { name: 'parameters', type: 'array' }
                    ]
                };
            }
            case 'ExportDeclaration': {
                return {
                    name: 'ExportDeclaration',
                    mandatory: [
                        { name: 'declarators', type: 'array' }
                    ]
                };
            }
            case 'FunctionDeclaration': {
                return {
                    name: 'FunctionDeclaration',
                    mandatory: [
                        { name: 'parameters', type: 'array' }
                    ]
                };
            }
            case 'ImportStatement': {
                return {
                    name: 'ImportStatement',
                    mandatory: [
                        { name: 'declarators', type: 'array' }
                    ]
                };
            }
            case 'MethodClassMember': {
                return {
                    name: 'MethodClassMember',
                    mandatory: [
                        { name: 'parameters', type: 'array' }
                    ]
                };
            }
            case 'NewPath': {
                return {
                    name: 'NewPath',
                    mandatory: [
                        { name: 'parameters', type: 'array' },
                        { name: 'typeParameters', type: 'array' }
                    ]
                };
            }
            case 'Program': {
                return {
                    name: 'Program',
                    mandatory: [
                        { name: 'declarations', type: 'array' },
                        { name: 'exports', type: 'array' },
                        { name: 'imports', type: 'array' }
                    ]
                };
            }
            case 'VariableDeclarationStatement': {
                return {
                    name: 'VariableDeclarationStatement',
                    mandatory: [
                        { name: 'declarators', type: 'array' }
                    ]
                };
            }
            case 'TypeExpression': {
                return {
                    name: 'TypeExpression',
                    mandatory: [
                        { name: 'members', type: 'array' },
                        { name: 'typeParameters', type: 'array' }
                    ]
                };
            }
            case 'PathExpression': {
                return {
                    name: 'PathExpression',
                    mandatory: [
                        { name: 'path', type: 'array' }
                    ]
                };
            }
            default: {
                return {
                    name: type,
                    mandatory: []
                };
            }
        }
    }
}
exports.WhackoAstReflection = WhackoAstReflection;
exports.reflection = new WhackoAstReflection();
//# sourceMappingURL=ast.js.map