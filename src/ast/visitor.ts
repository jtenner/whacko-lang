import { parser } from "./parser.js";

const BaseWhackoVisitorBase = parser.getBaseCstVisitorConstructorWithDefaults();

export class BaseWhackoVisitor extends BaseWhackoVisitorBase {
  constructor() {
    super();
    this.validateVisitor();
  }

  ImportDeclaration(ctx:  any) {
    console.log(ctx);
  }
}
