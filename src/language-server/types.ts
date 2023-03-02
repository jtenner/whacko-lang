import assert from "assert";
import { AstNode } from "langium";

export abstract class ScopeElement {}

export abstract class ScopeTypeElement extends ScopeElement {}

export class StaticTypeScopeElement extends ScopeTypeElement {
  private cachedConcreteType: ConcreteType | null = null;

  constructor(public node: AstNode) {
    super();
  }
  resolve(): ConcreteType | null {
    // TODO: Actually resolve the type
    return this.cachedConcreteType;
  }
}

export class DynamicTypeScopeElement extends ScopeTypeElement {
  cachedConcreteTypes = new Map<string, ConcreteType>();
  constructor(public node: AstNode, public typeParameters: string[]) {
    super();
  }

  resolve(typeParameters: ConcreteType[]): ConcreteType | null {
    // TODO: Actually resolve type with type parameters
    return voidType;
  }
}

export class Scope {
  private elements = new Map<string, ScopeElement>();

  constructor(elements?: Map<string, ScopeElement>) {
    this.elements = elements ?? new Map();
  }

  add(name: string, element: ScopeElement) {
    assert(
      !this.elements.has(name),
      "Element has already been defined in this scope."
    );
    this.elements.set(name, element);
  }

  has(name: string) {
    return this.elements.has(name);
  }

  get(name: string): ScopeElement | null {
    return this.elements.get(name) ?? null;
  }

  fork() {
    return new Scope(new Map(this.elements));
  }

  forkIf(predicate: (element: ScopeElement) => boolean) {
    const result = new Map<string, ScopeElement>();
    for (const [name, element] of this.elements) {
      if (predicate(element)) result.set(name, element);
    }
    return new Scope(result);
  }

  forkTypes() {
    return this.forkIf((element) => element instanceof ScopeTypeElement);
  }
}

export const enum Type {
  bool,
  i8,
  u8,
  i16,
  u16,
  i32,
  u32,
  i64,
  u64,
  f32,
  f64,
  string,
  array,
  func,
  method,
  v128,
  isize,
  usize,
  async,
  void,
  tuple,
  held,
}

export class ConcreteType {
  constructor(
    public ty: Type // contains size info
  ) {}

  isEqual(other: ConcreteType) {
    return this.ty === other.ty;
  }

  get size() {
    switch (this.ty) {
      case Type.i8:
      case Type.u8: {
        return 1;
      }
      case Type.i16:
      case Type.u16: {
        return 2;
      }
      case Type.array:
      case Type.f32:
      case Type.func:
      case Type.i32:
      case Type.u32:
      case Type.isize:
      case Type.method:
      case Type.string:
      case Type.usize: {
        return 4;
      }
      case Type.f64:
      case Type.i64:
      case Type.u64: {
        return 8;
      }
      case Type.v128: {
        return 16;
      }
    }
    return 0;
  }

  isAssignableTo(other: ConcreteType) {
    return this.isEqual(other);
  }
}

export class ArrayType extends ConcreteType {
  constructor(public childType: ConcreteType, public initialLength: number) {
    super(Type.array);
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof ArrayType && this.childType.isEqual(other.childType)
    );
  }
}

export class Parameter {
  constructor(public name: string, public fieldType: ConcreteType) {}
}

export class FunctionType extends ConcreteType {
  constructor(public parameters: Parameter[], public returnType: ConcreteType) {
    super(Type.method);
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof ConcreteMethodType &&
      this.parameters.reduce(
        (acc, param, i) =>
          param.fieldType.isEqual(other.parameters[i].fieldType),
        true
      ) &&
      this.returnType.isEqual(this.returnType)
    );
  }
}

export class ConcreteMethodType extends ConcreteType {
  constructor(
    public thisType: ClassType,
    public parameters: Parameter[],
    public returnType: ConcreteType
  ) {
    super(Type.method);
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof ConcreteMethodType &&
      other.thisType.isEqual(this.thisType) &&
      this.parameters.reduce(
        (acc, param, i) =>
          param.fieldType.isEqual(other.parameters[i].fieldType),
        true
      ) &&
      this.returnType.isEqual(this.returnType)
    );
  }
}

export class Field {
  constructor(public name: string, public ty: ConcreteType) {}
}

export class ClassType extends ConcreteType {
  public methods = new Map<string, ConcreteMethodType>();
  public fields = new Array<Field>();

  constructor(public extendsClass: ClassType | null = null) {
    super(Type.usize);
  }

  addMethod(name: string, method: ConcreteMethodType) {
    assert(!this.methods.has(name));
    this.methods.set(name, method);
  }

  addField(field: Field) {
    this.fields.push(field);
  }

  get offset() {
    return this.fields.reduce((left, right) => left + right.ty.size!, 0);
  }

  override isEqual(other: ConcreteType): boolean {
    return other === this;
  }

  override isAssignableTo(other: ClassType): boolean {
    let self = this;
    while (true) {
      if (other === self) return true;
      if (self.extendsClass) {
        other = self.extendsClass;
        continue;
      }
      return false;
    }
  }
}

export class StringType extends ConcreteType {
  constructor(public value: string | null = null) {
    super(Type.string);
  }
}

export class IntegerType extends ConcreteType {
  constructor(
    ty:
      | Type.i8
      | Type.u8
      | Type.i16
      | Type.u16
      | Type.i32
      | Type.u32
      | Type.i64
      | Type.u64
      | Type.isize
      | Type.usize,
    public value: bigint | null = null
  ) {
    super(ty);
  }
}

export class BoolType extends ConcreteType {
  constructor(public value: boolean | null = null) {
    super(Type.bool);
  }
}

export class FloatType extends ConcreteType {
  constructor(ty: Type.f64 | Type.f32, public value: number | null = null) {
    super(ty);
  }
}

export class AsyncType extends ConcreteType {
  constructor(public genericType: ConcreteType) {
    super(Type.async);
  }
}

export const voidType = new ConcreteType(Type.void);

export class TupleType extends ConcreteType {
  constructor(public types: ConcreteType[]) {
    super(Type.tuple);
  }

  override isEqual(other: ConcreteType): boolean {
    if (
      other instanceof TupleType &&
      other.types.length === this.types.length
    ) {
      for (let i = 0; i < other.types.length; i++) {
        if (!this.types[i].isEqual(other.types[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  override isAssignableTo(other: ConcreteType): boolean {
    if (
      other instanceof TupleType &&
      other.types.length === this.types.length
    ) {
      for (let i = 0; i < other.types.length; i++) {
        if (!this.types[i].isAssignableTo(other.types[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
}

export class HeldType extends ConcreteType {
  constructor(public genericType: ConcreteType) {
    super(Type.held);
  }

  override isEqual(other: ConcreteType): boolean {
    return (
      other instanceof HeldType && this.genericType.isEqual(other.genericType)
    );
  }
}

export class SIMDType extends ConcreteType {
  constructor() {
    super(Type.v128);
  }
}
