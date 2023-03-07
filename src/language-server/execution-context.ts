import { AstNode } from "langium";
import {
  ConcreteType,
  IntegerType,
  FloatType,
  StringType,
  BoolType,
  InvalidType,
  Type,
  IntegerEnumType,
} from "./types";

export namespace LLVM {
  export type ValueRef = number;
}

export class ExecutionContext {
  parent: ExecutionContext | null = null;
  types = new Map<string, ConcreteType>();
  stack = [] as ExecutionContextValue[];
  vars = new Map<string, RuntimeValue>();
}

export abstract class ExecutionContextValue {
  constructor(public ty: ConcreteType) {}

  get valid() {
    return true;
  }
}

export abstract class RuntimeValue extends ExecutionContextValue {
  constructor(public ref: LLVM.ValueRef, ty: ConcreteType) {
    super(ty);
  }
}

export class RuntimeInvalid extends RuntimeValue {
  constructor(ty: ConcreteType) {
    super(0, ty);
  }

  override get valid() {
    return false;
  }
}

export abstract class CompileTimeValue<T> extends ExecutionContextValue {
  constructor(public value: T, type: ConcreteType) {
    super(type);
  }
}

export class CompileTimeString extends CompileTimeValue<string> {
  constructor(value: string, node: AstNode) {
    super(value, new StringType(value, node));
  }
}

export class CompileTimeInteger extends CompileTimeValue<bigint> {
  constructor(value: bigint, ty: IntegerType) {
    super(value, ty);
  }
}

export class RuntimeInteger extends RuntimeValue {
  constructor(ref: LLVM.ValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class CompileTimeFloat extends CompileTimeValue<number> {
  constructor(value: number, ty: FloatType) {
    super(value, ty);
  }
}

export class RuntimeFloat extends RuntimeValue {
  constructor(ref: LLVM.ValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class CompileTimeInvalid extends CompileTimeValue<void> {
  constructor(node: AstNode) {
    super(void 0, new InvalidType(node));
  }

  override get valid() {
    return false;
  }
}

export class CompileTimeBool extends CompileTimeValue<boolean> {
  constructor(value: boolean, node: AstNode) {
    super(value, new BoolType(value, node));
  }
}

export class RuntimeBool extends RuntimeValue {
  constructor(ref: LLVM.ValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class RuntimeString extends RuntimeValue {
  constructor(ref: LLVM.ValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}
