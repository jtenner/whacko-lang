import { AstNode } from "langium";
import {} from "./types";
import { CompileTimeValue, ExecutionContext, ExecutionContextValue, ExecutionVariable, RuntimeValue } from "./execution-context";
import {
  ClassDeclaration,
  ConstructorClassMember,
  DeclareDeclaration,
  DeclareFunction,
  Decorator,
  EnumDeclaration,
  Expression,
  FunctionDeclaration,
  isConstructorClassMember,
  MethodClassMember,
  NamespaceDeclaration,
  VariableDeclarator,
} from "./generated/ast";
import { CompilationPass, getFullyQualifiedName } from "./passes/CompilationPass";
import { WhackoProgram } from "./program";
import { WhackoModule } from "./module";
import type { Module, LLVMValueRef, LLVMTypeRef } from "llvm-js";
import { getFileName, getModule } from "./passes/ModuleCollectionPass";
import { assert } from "./util";

export const CLASS_HEADER_OFFSET = 8n; // [size, type?]

export function getPtrWithOffset(ptr: LLVMValueRef, offset: bigint, pass: CompilationPass): LLVMValueRef {
  const { LLVM, program: { LLVMUtil }, builder } = pass;
  const llvmIntType = LLVM._LLVMIntType(32);
  // void ptr type instead?
  // const i8PtrType = LLVM._LLVMPointerType(LLVM._LLVMInt8Type(), 0);
  const i8Type = LLVM._LLVMInt8Type();
  const gepIndicies = LLVMUtil.lowerPointerArray([
    LLVM._LLVMConstInt(llvmIntType, offset, 0),
  ]);
  const gepName = pass.getTempNameRef();
  const ptrPlusOffset = LLVM._LLVMBuildGEP2(
    builder,
    i8Type,
    ptr,
    gepIndicies,
    1,
    gepName
  );

  LLVM._free(gepIndicies);
  LLVM._free(gepName);
  return ptrPlusOffset;
}

export abstract class ScopeElement {
  builtin: BuiltinFunction | null = null;
  builtinType: BuiltinTypeFunction | null = null;
  constructor(public mod: WhackoModule, public node: AstNode) {}
}

export abstract class ScopeTypeElement extends ScopeElement {
  constructor(node: AstNode, mod: WhackoModule) {
    super(mod, node);
  }
}

export class NamespaceTypeScopeElement extends ScopeTypeElement {
  exports = new Map<string, ScopeElement>();
  scope: Scope;

  constructor(node: AstNode, parentScope: Scope, mod: WhackoModule) {
    super(node, mod);
    this.scope = parentScope.fork();
  }
}

export class StaticTypeScopeElement extends ScopeTypeElement {
  public cachedConcreteType: ConcreteType | null = null;

  constructor(node: AstNode, mod: WhackoModule) {
    super(node, mod);
  }
}

export interface BuiltinFunctionProps {
  ast: AstNode;
  ctx: ExecutionContext;
  module: WhackoModule;
  pass: CompilationPass;
  program: WhackoProgram;
  typeParameters: ConcreteType[];
  parameters: ExecutionContextValue[];
}

export interface BuiltinTypeFunctionProps {
  ast: AstNode;
  ctx: ExecutionContext;
  module: WhackoModule;
  typeParameters: ConcreteType[];
}

export type BuiltinFunction = (props: BuiltinFunctionProps) => void;
export type BuiltinTypeFunction = (props: BuiltinTypeFunctionProps) => ConcreteType;

export class DynamicTypeScopeElement extends ScopeTypeElement {
  cachedConcreteTypes = new Map<string, ConcreteType>();
  constructor(
    node: AstNode,
    public typeParameters: string[],
    mod: WhackoModule
  ) {
    super(node, mod);
  }
}

const scopes = new WeakMap<AstNode, Scope>();

export function setScope(node: AstNode, scope: Scope) {
  scopes.set(node, scope);
}

export function getScope(node: AstNode): Scope | null {
  while (true) {
    const scope = scopes.get(node);
    if (scope) return scope;

    // we need to go up the tree
    if (node.$container) {
      node = node.$container;
      continue;
    }
    return null;
  }
}

export class Scope {
  public elements = new Map<string, ScopeElement>();

  constructor(public parent: Scope | null = null) {}

  add(name: string, element: ScopeElement) {
    assert(
      !this.elements.has(name),
      "Element has already been defined in this scope."
    );
    this.elements.set(name, element);
  }

  has(name: string): boolean {
    return this.elements.has(name) || this.parent?.has(name) || false;
  }

  hasInCurrentScope(name: string): boolean {
    return this.elements.has(name) ?? false;
  }

  get(
    name: string,
    predicate: (element: ScopeElement) => boolean = () => true
  ): ScopeElement | null {
    if (this.elements.has(name)) {
      const element = this.elements.get(name)!;
      return predicate(element) ? element : null;
    }
    return this.parent?.get(name, predicate) ?? null;
  }

  fork() {
    const result = new Scope(this);
    return result;
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
  scope,
  namespace,
}

export abstract class ConcreteType {
  constructor(
    public ty: Type, // contains size info
    public node: AstNode,
    public name: string
  ) {}

  abstract get isNumeric(): boolean;

  get isSigned() {
    switch (this.ty) {
      case Type.i8:
      case Type.i16:
      case Type.i32:
      case Type.i64:
      case Type.isize:
        return true;
    }
    return false;
  }

  llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")) {
    switch (this.ty) {
      case Type.bool:
        return LLVM._LLVMInt1Type();
      case Type.i8:
        return LLVM._LLVMInt8Type();
      case Type.u8:
        return LLVM._LLVMInt8Type();
      case Type.i16:
        return LLVM._LLVMInt16Type();
      case Type.u16:
        return LLVM._LLVMInt16Type();
      case Type.i32:
        return LLVM._LLVMInt32Type();
      case Type.u32:
        return LLVM._LLVMInt32Type();
      case Type.i64:
        return LLVM._LLVMInt64Type();
      case Type.u64:
        return LLVM._LLVMInt64Type();
      case Type.f32:
        return LLVM._LLVMFloatType();
      case Type.f64:
        return LLVM._LLVMDoubleType();
      case Type.string:
        return LLVM._LLVMInt32Type();
      case Type.array:
        return LLVM._LLVMInt32Type();
      case Type.func:
        return LLVM._LLVMInt32Type();
      case Type.method:
        return LLVM._LLVMInt32Type();
      case Type.v128:
        return LLVM._LLVMInt128Type();
      case Type.isize:
        return LLVM._LLVMInt32Type();
      case Type.usize:
        return LLVM._LLVMInt32Type();
      case Type.async:
        return LLVM._LLVMInt32Type();
      case Type.void:
        return LLVM._LLVMVoidType();
      case Type.tuple:
        return null;
      case Type.held:
        return LLVM._LLVMInt32Type();
      case Type.scope:
      case Type.namespace:
        return null;
    }
  }

  isEqual(other: ConcreteType) {
    return this.ty === other.ty;
  }

  get size() {
    switch (this.ty) {
      case Type.i8:
      case Type.u8: {
        return 1n;
      }
      case Type.i16:
      case Type.u16: {
        return 2n;
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
        return 4n;
      }
      case Type.f64:
      case Type.i64:
      case Type.u64: {
        return 8n;
      }
      case Type.v128: {
        return 16n;
      }
    }
    return 0n;
  }

  isAssignableTo(other: ConcreteType) {
    return this.isEqual(other);
  }

  abstract getName(): string;
}

export class ConcreteFunction {
  constructor(public funcRef: LLVMValueRef, public ty: FunctionType) {}
}

export interface ConcreteClassCompileParameters {
  parameters: ExecutionContextValue[];
  pass: CompilationPass;

}

export class ConcreteClass extends ConcreteType {
  static id = 0n;

  id = ++ConcreteClass.id;

  constructor(
    public typeParameters: Map<string, ConcreteType>,
    public fields: Field[],
    public element: ClassDeclaration,
    public offset: bigint,
  ) {
    super(Type.usize, element, element.name.name);
  }

  getName(): string {
    return getFullyQualifiedName(
      this.element,
      assert(this.getClassTypeParameters(), "Type parameters must exist at this point"),
    )!;
  }

  get isNumeric(): boolean {
    return false;
  }

  getClassTypeParameters(): ConcreteType[] | null {
    const ctx = new ExecutionContext(
      assert(getScope(this.element), "The scope must exist at this point."),
      this.typeParameters,
    );
    const constructorParameterTypes = [] as ConcreteType[];

    for (let i = 0; i < this.element.typeParameters.length; i++) {
      const constructorParameter = this.element.typeParameters[i];
      const resolved = ctx.resolve(constructorParameter);
      if (resolved) {
        constructorParameterTypes.push(resolved);
      } else {
        return null;
      }
    }
    return constructorParameterTypes;
  }

  override llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")): LLVMTypeRef | null {
    return LLVM._LLVMPointerType(LLVM._LLVMInt8Type(), 0);
  }

  constructorFunc: ConcreteFunction | null = null;

  compileConstructor(pass: CompilationPass): ConcreteFunction | null {
    if (this.constructorFunc) return this.constructorFunc;

    const constructorElement = 
      assert(
        this.element.members.find(e => isConstructorClassMember(e)) as ConstructorClassMember,
        "Constructor element must exist"
      );

    const constructorParameterTypes = assert(this.getClassTypeParameters(), "We must be able to resolve the parameters.");

    const func = assert(
      pass.compileCallable(
        this.element,
        constructorParameterTypes,
        getModule(this.element)!,
        [],
        this,
        // previsit
        ({ pass }) => {
          const { LLVM, program: { LLVMUtil }, builder } = pass;
          const offset = this.offset;
          const fullSize = this.offset + CLASS_HEADER_OFFSET;
          const intType = new IntegerType(Type.i32, null, this.node);
          const llvmIntType = intType.llvmType(LLVM, LLVMUtil)!;
          const voidPtr = this.llvmType(LLVM, LLVMUtil)!;
          const offsetRefInt = LLVM._LLVMConstInt(
            llvmIntType,
            offset,
            0
          );
          

          const mallocType = LLVM._LLVMArrayType(
            LLVM._LLVMInt8Type(),
            Number(fullSize)
          );
          const selfRefName = pass.getTempNameRef(); 
          const ref = LLVM._LLVMBuildMalloc(
            builder,
            mallocType,
            selfRefName,
          );
          LLVM._free(selfRefName);

          pass.ctx.vars.set("&self", new ExecutionVariable(true, "&self", new RuntimeValue(ref, this), this));
          // initialize all the fields including refType and size

          // Store offset at beginning of reference
          LLVM._LLVMBuildStore(builder, offsetRefInt, ref);

          // Store int type on ref at offset 4
          const idRef = LLVM._LLVMConstInt(llvmIntType, this.id, 0);
          const ptrPlusOffset = getPtrWithOffset(ref, 4n, pass);
          LLVM._LLVMBuildStore(builder, idRef, ptrPlusOffset);
          
          for (const field of this.fields) {
            const ptr = getPtrWithOffset(ref, CLASS_HEADER_OFFSET + field.offset, pass);
            let value: LLVMValueRef;

            if (field.initializer) {
              pass.visit(field.initializer);
              const stackValue = assert(pass.ctx.stack.pop(), "Value must exist on the stack at this point.");
              const compiledValue = pass.ensureCompiled(stackValue);
              value = compiledValue.ref;
            } else {
              // there's no initializer so we need to 0 out the reference
              const intType = LLVM._LLVMIntType(Number(field.ty.size * 8n));
              value = LLVM._LLVMConstInt(intType, 0n, 0);
            }
            LLVM._LLVMBuildStore(builder, value, ptr);
          }
        },
        // post visit
        ({ pass }) => {
          const { LLVM, program: { LLVMUtil }, builder } = pass;
          const self = assert(pass.ctx.vars.get("&self"), "Self must be defined.");
          LLVM._LLVMBuildRet(builder, (self.value as RuntimeValue).ref);
        }
      ),
      "This function must be compilable"
    );

    this.constructorFunc = func;
    return func;
  }
}

export class ArrayType extends ConcreteType {
  constructor(
    public childType: ConcreteType,
    public initialLength: number,
    node: AstNode,
    name: string
  ) {
    super(Type.array, node, name);
  }

  override get isNumeric() {
    return false;
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof ArrayType && this.childType.isEqual(other.childType)
    );
  }

  override getName(): string {
    return `Array<${this.childType.name}>`;
  }

  override llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")): LLVMTypeRef | null {
    return LLVM._LLVMArrayType(this.childType.llvmType(LLVM, LLVMUtil)!, this.initialLength);
  }
}

export class Parameter {
  constructor(public name: string, public fieldType: ConcreteType) {}
}

export class FunctionType extends ConcreteType {
  constructor(
    public parameterTypes: ConcreteType[],
    public parameterNames: string[],
    public returnType: ConcreteType,
    node: AstNode,
    name: string
  ) {
    super(Type.method, node, name);
  }

  override get isNumeric() {
    return false;
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof FunctionType &&
      this.parameterTypes.reduce(
        (acc, param, i) => param.isEqual(other.parameterTypes[i]),
        true
      ) &&
      this.returnType.isEqual(this.returnType)
    );
  }

  override getName() {
    const parameterNames = this.parameterTypes.map((e) => e.getName());
    return `Function(${parameterNames.join(",")}): ${this.returnType.getName()}`;
  }

  override llvmType(
    LLVM: Module,
    LLVMUtil: typeof import("llvm-js")
  ): LLVMTypeRef | null {
    const returnType = this.returnType instanceof FunctionType
      ? LLVM._LLVMPointerType(LLVM._LLVMVoidType(), 0)
      : this.returnType.llvmType(LLVM, LLVMUtil)!;

    const loweredParameterTypes = LLVMUtil.lowerPointerArray(
      this.parameterTypes.map((e) => 
        e instanceof FunctionType 
          ? LLVM._LLVMPointerType(LLVM._LLVMVoidType(), 0)
          : e.llvmType(LLVM, LLVMUtil)!
      )
    );
    const result = LLVM._LLVMFunctionType(
      returnType,
      loweredParameterTypes,
      this.parameterTypes.length,
      0
    );
    LLVM._free(loweredParameterTypes);
    return result;
  }
}

export class MethodType extends ConcreteType {
  constructor(
    public thisType: ConcreteType,
    public parameterTypes: ConcreteType[],
    public parameterNames: string[],
    public returnType: ConcreteType,
    node: AstNode,
    name: string
  ) {
    super(Type.method, node, name);
  }

  override get isNumeric() {
    return false;
  }

  override isEqual(other: ConcreteType) {
    return (
      other instanceof FunctionType &&
      this.parameterTypes.reduce(
        (acc, param, i) => param.isEqual(other.parameterTypes[i]),
        true
      ) &&
      this.returnType.isEqual(this.returnType)
    );
  }

  override getName() {
    const parameterNames = this.parameterTypes.map((e) => e.getName());
    return `Function(${parameterNames.join(",")})`;
  }

  override llvmType(
    LLVM: Module,
    LLVMUtil: typeof import("llvm-js")
  ): LLVMTypeRef | null {
    const returnType = this.returnType instanceof FunctionType
      ? LLVM._LLVMPointerType(LLVM._LLVMVoidType(), 0)
      : this.returnType.llvmType(LLVM, LLVMUtil)!;
    const parameterTypes = [this.thisType].concat(this.parameterTypes);
    const parameterLLVMTypes = parameterTypes
      .map((e) => 
        e instanceof FunctionType 
        ? LLVM._LLVMPointerType(LLVM._LLVMVoidType(), 0)
        : e.llvmType(LLVM, LLVMUtil)!);

    const loweredParameterTypes = LLVMUtil.lowerPointerArray(parameterLLVMTypes);
    const result = LLVM._LLVMFunctionType(
      returnType,
      loweredParameterTypes,
      parameterTypes.length,
      0
    );
    LLVM._free(loweredParameterTypes);
    return result;
  }
}

export class Field {
  constructor(
    public name: string,
    public initializer: Expression | null,
    public ty: ConcreteType,
    public offset: bigint
  ) {}
}

export class PrototypeMethod {
  constructor(
    public element: AstNode,
    public concreteTypes: Map<string, ConcreteType>
  ) {}
}

export class NamespaceDeclarationType extends ConcreteType {
  constructor(node: NamespaceDeclaration) {
    super(Type.namespace, node, node.name.name);
  }

  getName(): string {
    return "";
  }

  get isNumeric(): boolean {
    return false;
  }
}

export class DeclareFunctionType extends ConcreteType {
  constructor(node: DeclareFunction) {
    super(Type.func, node, node.name.name);
  }

  getName(): string {
    return "";
  }

  get isNumeric(): boolean {
    return false;
  }
}

export class FunctionReferenceType extends ConcreteType {
  constructor(node: FunctionDeclaration) {
    super(Type.func, node, node.name.name);
  }

  getName(): string {
    return "";
  }

  get isNumeric(): boolean {
    return false;
  }
}

export class DeclareDeclarationType extends ConcreteType {
  constructor(node: DeclareDeclaration) {
    super(Type.namespace, node, node.name.name);
  }

  getName(): string {
    return "";
  }

  get isNumeric(): boolean {
    return false;
  }
}


export class StringType extends ConcreteType {
  constructor(public value: string | null = null, node: AstNode) {
    super(Type.string, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return "string";
  }

  override llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")): LLVMTypeRef | null {
    return LLVM._LLVMPointerType(LLVM._LLVMIntType(8), 0);
  }
}

export type IntegerEnumType =
  | Type.i8
  | Type.u8
  | Type.i16
  | Type.u16
  | Type.i32
  | Type.u32
  | Type.i64
  | Type.u64
  | Type.isize
  | Type.usize;

export class IntegerType extends ConcreteType {
  constructor(
    ty: IntegerEnumType,
    public value: bigint | null = null,
    node: AstNode
  ) {
    super(ty, node, "");
  }

  override get isNumeric() {
    return true;
  }

  override getName(): string {
    switch (this.ty) {
      case Type.i8:
        return "i8";
      case Type.u8:
        return "u8";
      case Type.i16:
        return "i16";
      case Type.u16:
        return "u16";
      case Type.i32:
        return "i32";
      case Type.u32:
        return "u32";
      case Type.i64:
        return "i64";
      case Type.u64:
        return "u64";
      case Type.isize:
        return "isize";
      case Type.usize:
        return "usize";
    }
    throw new Error("Invalid number type.");
  }

  get signed() {
    switch (this.ty) {
      case Type.isize:
      case Type.i8:
      case Type.i16:
      case Type.i32:
      case Type.i64:
        return true;
    }
    return false;
  }

  get bits() {
    switch (this.ty) {
      case Type.i8:
      case Type.u8:
        return 8;
      case Type.i16:
      case Type.u16:
        return 16;
      case Type.i32:
      case Type.u32:
      case Type.isize:
      case Type.usize:
        return 32;
      case Type.i64:
      case Type.u64:
        return 64;
    }
    return 0;
  }
}

export class BoolType extends ConcreteType {
  constructor(public value: boolean | null = null, node: AstNode) {
    super(Type.bool, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return "bool";
  }
}

export class FloatType extends ConcreteType {
  constructor(
    ty: Type.f64 | Type.f32,
    public value: number | null = null,
    node: AstNode
  ) {
    super(ty, node, "");
  }

  override get isNumeric() {
    return true;
  }

  override getName(): string {
    switch (this.ty) {
      case Type.f64:
        return "f64";
      case Type.f32:
        return "f32";
    }
    throw new Error("Invalid number type.");
  }

  
  get bits() {
    switch (this.ty) {
      case Type.f32:
        return 32;
      case Type.f64:
        return 64;
    }
    return 0;
  }
}

export class AsyncType extends ConcreteType {
  constructor(public genericType: ConcreteType, node: AstNode) {
    super(Type.async, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return `async<${this.genericType.getName()}>`;
  }
}

export class TupleType extends ConcreteType {
  constructor(public types: ConcreteType[], node: AstNode) {
    super(Type.tuple, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return `(${this.types.map((e) => e.getName()).join(",")})`;
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
  constructor(public genericType: ConcreteType, node: AstNode) {
    super(Type.held, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override isEqual(other: ConcreteType): boolean {
    return (
      other instanceof HeldType && this.genericType.isEqual(other.genericType)
    );
  }

  override getName(): string {
    return `held<${this.genericType.getName()}>`;
  }
}

export function simdOf(type: ConcreteType) {
  switch (type.ty) {
    case Type.i8:  return new i8x16Type(type.node);
    case Type.u8:  return new u8x16Type(type.node);
    case Type.i16: return new i16x8Type(type.node);
    case Type.u16: return new u16x8Type(type.node);
    case Type.i32: return new i32x4Type(type.node);
    case Type.u32: return new u32x4Type(type.node);
    case Type.f32: return new f32x4Type(type.node);
    case Type.i64: return new i64x2Type(type.node);
    case Type.u64: return new u64x2Type(type.node);
    case Type.f64: return new f64x2Type(type.node);
  }
  return new InvalidType(type.node);
}

export class VectorType extends ConcreteType {
  constructor(public numberType: ConcreteType, node: AstNode) {
    super(Type.v128, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")): LLVMTypeRef | null {
    const bits = (this.numberType as FloatType | IntegerType).bits;
    const laneCount = 16n / this.numberType.size;
    return LLVM._LLVMVectorType(LLVM._LLVMIntType(bits), Number(laneCount));
  }

  getName() {
    const bits = (this.numberType as FloatType | IntegerType).bits;
    const laneCount = 16n / this.numberType.size;
    
    if (this.numberType instanceof FloatType) {
      return `f${bits}x${laneCount}`;
    } else {
      return `${(this.numberType as IntegerType).signed ? "i" : "u"}${bits}x${laneCount}`;
    }
  }

  override isAssignableTo(other: ConcreteType): boolean {
    return other instanceof VectorType;
  }
}

export class i8x16Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.i8, 0n, node), node);
  }
}
export class u8x16Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.u8, 0n, node), node);
  }
}

export class i16x8Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.i16, 0n, node), node);
  }
}
export class u16x8Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.u16, 0n, node), node);
  }
}

export class i32x4Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.i32, 0n, node), node);
  }
}
export class u32x4Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.u32, 0n, node), node);
  }
}
export class f32x4Type extends VectorType {
  constructor(node: AstNode) {
    super(new FloatType(Type.f32, 0, node), node);
  }
}

export class i64x2Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.i32, 0n, node), node);
  }
}
export class u64x2Type extends VectorType {
  constructor(node: AstNode) {
    super(new IntegerType(Type.u64, 0n, node), node);
  }
}
export class f64x2Type extends VectorType {
  constructor(node: AstNode) {
    super(new FloatType(Type.f64, 0, node), node);
  }
}

export class SIMDType extends ConcreteType {
  constructor(public laneType: ConcreteType, node: AstNode) {
    super(Type.v128, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return `v128<${this.laneType.getName()}>`;
  }

  override llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")): LLVMTypeRef | null {
    return LLVM._LLVMVectorType(this.laneType.llvmType(LLVM, LLVMUtil)!, Number(16n / this.laneType.size));
  }
}

export class InvalidType extends ConcreteType {
  constructor(node: AstNode) {
    super(Type.void, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override isEqual(_: ConcreteType): boolean {
    return false;
  }

  override isAssignableTo(_: ConcreteType): boolean {
    return false;
  }

  override getName(): string {
    return "invalid";
  }
}

export function consumeDecorator(
  name: string,
  decorators: Decorator[]
): Decorator | null {
  const index = decorators.findIndex((e) => e.name.name === name);
  if (index === -1) return null;
  const [decorator] = decorators.splice(index, 1);

  // indexes need to be updated
  for (let i = 0; i < decorators.length; i++) {
    // @ts-ignore: $containerIndex is readonly, but this is fine
    decorators[i].$containerIndex = i;
  }
  return decorator;
}

export class VoidType extends ConcreteType {
  constructor(node: AstNode) {
    super(Type.void, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return "void";
  }
}

export class PointerType extends ConcreteType {
  constructor(public pointingToType: ConcreteType, node: AstNode) {
    super(Type.usize, node, "pointer");
  }

  get isNumeric(): boolean {
    return true;
  }

  getName(): string {
    return "Pointer<" + this.pointingToType.name + ">";
  }

  override llvmType(LLVM: Module, LLVMUtil: typeof import("llvm-js")): LLVMTypeRef | null {
    return LLVM._LLVMPointerType(LLVM._LLVMVoidType(), 0);
  }
}

export class CompileTimeFieldReference extends CompileTimeValue<Field> {
  constructor(field: Field, public ref: LLVMValueRef) {
    super(field, field.ty);
  }
}

export class CompileTimeMethodReference extends CompileTimeValue<MethodClassMember> {
  constructor(method: MethodClassMember, ty: ConcreteClass, public ref: LLVMValueRef) {
    super(method, ty);
  }
}

export class CompileTimeVariableReference extends CompileTimeValue<ExecutionVariable> {
  constructor(variable: ExecutionVariable) {
    super(variable, variable.ty);
  }
}

export class EnumType extends IntegerType {
  constructor(
    node: EnumDeclaration,
    public values: Map<string, bigint>,
  ) {
    super(Type.i32, null, node);
  }
}
