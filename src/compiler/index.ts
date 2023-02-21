import { Expression } from "../language-server/generated/ast";

export const enum DefineExpressionResultType {
  Success,
  AlreadyExists,
}

export const enum SetExpressionResultType {
  Success,
  NotFound,
  InvalidType,
}

export const enum DefineTypeResultType {
  Success,
  AlreadyExists,
}

export class Scope {
  parent: Scope | null = null;
  types = new Map<string, TypeNode>();
  expressions = new Map<string, ExpressionNode>();

  fork(): Scope {
    let scope = new Scope();
    scope.parent = this;
    return scope;
  }

  defineExpression(
    name: string,
    expression: ExpressionNode
  ): DefineExpressionResultType {
    if (this.expressions.has(name))
      return DefineExpressionResultType.AlreadyExists;
    this.expressions.set(name, expression);
    return DefineExpressionResultType.Success;
  }

  setExpression(name: string, assign: ExpressionNode): SetExpressionResultType {
    if (this.expressions.has(name)) {
      let expression = this.expressions.get(name);
      if (assign.type.isAssignableTo(expression.type)) {
        this.expressions.set(name, assign);
        return SetExpressionResultType.Success;
      }
      return SetExpressionResultType.InvalidType;
    }
    if (this.parent) return this.parent.setExpression(name, assign);
    return SetExpressionResultType.NotFound;
  }

  defineType(name: string, type: TypeNode): DefineTypeResultType {
    if (this.types.has(name)) return DefineTypeResultType.AlreadyExists;
    this.types.set(name, type);
    return DefineTypeResultType.Success;
  }
}

export class TypeNode {
  constructor(public typeParameters: TypeParameter[]) {}

  getConcreteType(typeParameters: ConcreteType[] | null): ConcreteType {
    if (typeParameters !== null) throw new Error("Not implemented.");
    return new ConcreteType();
  }
}

export class TypeParameter {
  constructor(public name: string, public defaultType: ConcreteType) {}
}

export class SignatureParameter {
  constructor(public ty: ConcreteType, public name: string) {}
}

export class Signature {
  constructor(parameters: SignatureParameter[], returnType: ConcreteType) {}
}

export class ConcreteType {
  extends: ConcreteType | null = null;
  methods = new Map<string, CompiledMethod>();
  fields = new Map<string, CompiledField>();
  signature: Signature | null = null;
}

export class CompiledField {
  constructor(public name: string, public offset: number) {}
}

export class CompiledMethod {
  constructor(public ref: LLVM.FuncRef, public params: CompiledParameter[]) {}
}

export class CompiledParameter {
  constructor(public name: string, public ty: ConcreteType) {}
}

export abstract class ExpressionNode {
  constructor(public ty: ConcreteType) {};
}

export class CompiledExpressionNode extends ExpressionNode {
  constructor(public ref: LLVM.ValueRef, ty: ConcreteType) {
    super(ty);
  }
}

export class StaticExpressionNode extends ExpressionNode {
  constructor(public value: StaticValue, ty: ConcreteType) {
    super(ty);
  }
}

export abstract class StaticValue {
  constructor(public ty: ConcreteType) {}
}

export class StaticStringValue extends StaticValue {
  constructor(public value: string) {
    super(PrimitiveTypes.String);
  }
}

export class StaticIntegerValue extends StaticValue {
  constructor(public value: BigInt, ty: ConcreteType = PrimitiveTypes.i32) {
    super(ty);
  }
}

export class StaticFloatValue extends StaticValue {
  constructor(public value: number, ty: ConcreteType = PrimitiveTypes.f64) {
    super(ty);
  }
}

export namespace PrimitiveTypes {
  export const Void = new ConcreteType();
  export const String = new ConcreteType();
  export const i8 = new ConcreteType();
  export const u8 = new ConcreteType();
  export const i16 = new ConcreteType();
  export const u16 = new ConcreteType();
  export const i32 = new ConcreteType();
  export const u32 = new ConcreteType();
  export const f32 = new ConcreteType();
  export const i64 = new ConcreteType();
  export const u64 = new ConcreteType();
  export const f64 = new ConcreteType();
  export const isize = new ConcreteType();
  export const usize = new ConcreteType();
}
