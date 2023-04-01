import { AstNode } from "langium";
import { ConcreteFunction, WhackoModule, WhackoProgram } from "../program";
import { WhackoVisitor } from "../WhackoVisitor";

export class TypeCollectionPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }
}
