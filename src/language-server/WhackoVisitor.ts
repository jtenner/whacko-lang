import { AstNode, isAstNode } from "langium";
import { NodeFileSystem } from "langium/node";
import { isDeclaration, isExpression, isStatement, Program, WhackoAstType } from "./generated/ast";
import { createWhackoServices, WhackoServices } from "./whacko-module";

export abstract class WhackoVisitor {
  private revisit: boolean = false;
  private currentNode: AstNode | null = null;
  private services: WhackoServices = createWhackoServices(NodeFileSystem).Whacko;

  visit(node: any): void {
    if (node instanceof Array) {
      for (const child of node) {
        this.visit(node);
      }
    } else if (isAstNode(node)) {
      // get the node type and the function
      const nodeType = node.$type;
      const func = (this as any)[nodeType];
      if (typeof func == "function") {
        this.revisit = false;
        this.currentNode = node;
        func.call(this, node);
        while (this.revisit) {
          this.revisit = false;
          this.visit(this.currentNode!);
        }
      }
    }
  }

  replace(node: AstNode, contents: string): void {
    this.revisit = node == this.currentNode;
    let replacer: AstNode;
    if (isExpression(node)) {
      const result = this.services.parser.LangiumParser.parse<Program>(`fn a(): void { ${contents}; });`);
      const expression = result.value.declarations[0].block!.statements[0].expression!;
      replacer = expression;
    } else if (isStatement(node)) {
      const result = this.services.parser.LangiumParser.parse<Program>(`fn a(): void { ${contents} });`);
      const statement = result.value.declarations[0].block!.statements[0];
      replacer = statement;
    } else if (isDeclaration(node)) {
      const result = this.services.parser.LangiumParser.parse<Program>(contents);
      const declaration = result.value.declarations[0] ?? result.value.exports[0] ?? result.value.imports[0];
      replacer = declaration; 
    } else {
      throw new Error("Something went wrong!");
    }
    this.replaceNode(node, replacer);
  }

  replaceNode(node: AstNode, replacer: AstNode) {
    const parent = node.$container;
    if (!isAstNode(node) || !isAstNode(replacer)) throw new Error("Node or Replacement Node parameter is not an ASTNode");

    if (
      (isDeclaration(node) && isDeclaration(replacer))
      || (isStatement(node) && isStatement(replacer))
      || (isExpression(node) && isExpression(replacer))
    ) {
      // @ts-ignore: this is safe I promise
      replacer.$container = node.$container;
      // @ts-ignore: this is safe I promise
      replacer.$containerIndex = node.$containerIndex;
      // @ts-ignore: this is safe I promise
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