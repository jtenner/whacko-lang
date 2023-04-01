import { AstNode } from "langium";
import { WhackoModule, WhackoProgram } from "../program";
import { WhackoVisitor } from "../WhackoVisitor";
import {
  ConcreteType,
  ConcreteTypeKind,
  FunctionType,
  MethodType,
} from "../types";
import { getFullyQualifiedFunctionName } from "../util";
import { FunctionDeclaration } from "../generated/ast";

export class TypeCollectionPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }
}
