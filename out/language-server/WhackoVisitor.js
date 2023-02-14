"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhackoVisitor = void 0;
const langium_1 = require("langium");
const node_1 = require("langium/node");
const ast_1 = require("./generated/ast");
const whacko_module_1 = require("./whacko-module");
class WhackoVisitor {
    revisit = false;
    currentNode = null;
    services = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko;
    visit(node) {
        if (node instanceof Array) {
            for (const child of node) {
                this.visit(node);
            }
        }
        else if ((0, langium_1.isAstNode)(node)) {
            // get the node type and the function
            const nodeType = node.$type;
            const func = this[nodeType];
            if (typeof func == "function") {
                this.revisit = false;
                this.currentNode = node;
                func.call(this, node);
                while (this.revisit) {
                    this.revisit = false;
                    this.visit(this.currentNode);
                }
            }
        }
    }
    replace(node, contents) {
        this.revisit = node == this.currentNode;
        let replacer;
        if ((0, ast_1.isExpression)(node)) {
            const result = this.services.parser.LangiumParser.parse(`fn a(): void { ${contents}; });`);
            const expression = result.value.declarations[0].block.statements[0].expression;
            replacer = expression;
        }
        else if ((0, ast_1.isStatement)(node)) {
            const result = this.services.parser.LangiumParser.parse(`fn a(): void { ${contents} });`);
            const statement = result.value.declarations[0].block.statements[0];
            replacer = statement;
        }
        else if ((0, ast_1.isDeclaration)(node)) {
            const result = this.services.parser.LangiumParser.parse(contents);
            const declaration = result.value.declarations[0] ?? result.value.exports[0] ?? result.value.imports[0];
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
        if (((0, ast_1.isDeclaration)(node) && (0, ast_1.isDeclaration)(replacer))
            || ((0, ast_1.isStatement)(node) && (0, ast_1.isStatement)(replacer))
            || ((0, ast_1.isExpression)(node) && (0, ast_1.isExpression)(replacer))) {
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