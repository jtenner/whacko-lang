/*


class Type
{
    var typeenum; // something to distinguish all types
    var size;
    isSame(other_type)
    {
        return this.typeenum == other_type.typeenum;
    }
    copy()
    {

    }
}

class Int : Type
{
    size = 4;

    isSame() will not be overloaded here, checking typeenum is enough
}

class Array : Type
{
    // always going to be a pointer on the stack, pointing to a variable sized array!!
    size = 4; // Calculated when it is initialized with number of items etc
    length = 0;
    child_type;

    Array(length, child_type)
    {
        Okay
        But we might need to use C functions like malloc in LLVM , no theyre available there, idk about that maybe, i read something about that on their page
        So we can create a class inside whacko-lang to use those functions
    }   Actually no, I remember compiling to WASM and I didnt use C libraries for malloc

    // malloc
    // alloca
    // free
    // gc funcs...

    isSame()
    {

    }
}

*/

import assert from "assert";

export const enum Type {
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

export class ConcreteMethod extends ConcreteType {
  constructor(
    public thisType: ClassType,
    public parameters: Parameter[],
    public returnType: ConcreteType
  ) {
    super(Type.method);
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof ConcreteMethod &&
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
  public methods = new Map<string, ConcreteMethod>();
  public fields = new Array<Field>();

  constructor(public extendsClass: ClassType | null = null) {
    super(Type.usize);
  }

  addMethod(name: string, method: ConcreteMethod) {
    assert(!this.methods.has(name));
    this.methods.set(name, method);
  }

  addField(field: Field) {
    this.fields.push(field);
  }

  get offset() {
    return this.fields.reduce((left, right) => left + right.ty.size, 0);
  }

  override isEqual(other: ConcreteType): boolean {
    return other === this;
  }

  isAssignableTo(other: ClassType): boolean {
    while (true) {
      if (other === this) return true;
      if (other.extendsClass) {
        other = other.extendsClass;
        continue;
      }
      return false;
    }
  }
}
