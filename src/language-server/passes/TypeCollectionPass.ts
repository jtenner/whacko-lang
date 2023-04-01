import { AstNode } from "langium";
import { ConcreteFunction, WhackoModule, WhackoProgram } from "../program";
import { WhackoVisitor } from "../WhackoVisitor";
import { getScope } from "../scope";
import {
  ConcreteType,
  ConcreteTypeKind,
  ClassType,
  FunctionType,
  MethodType,
  resolveType,
  TypeMap,
} from "../types";
import { getFullyQualifiedFunctionName } from "../util";
import {
  BuiltinDeclaration,
  CallExpression,
  ClassDeclaration,
  ConstructorClassMember,
  DeclareFunction,
  ExternDeclaration,
  FunctionDeclaration,
  MethodClassMember,
  NewExpression,
} from "../generated/ast";
import { assert } from "../util";
import { LLVMValueRef } from "llvm-js";

export interface FunctionContext {
  labels: LabelContext[];
}

export interface LabelContext {
  instructions: LabelInstruction[];
  map: Map<string, LabelInstruction>;
}

export const enum LabelInstructionType {}

export interface LabelInstruction {
  ref: LLVMValueRef | null;
  name: string | null;
  type: LabelInstructionType;
}

export class TypeCollectionPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
    
  }
}
