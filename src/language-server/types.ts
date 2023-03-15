import assert from "assert";
import { AstNode } from "langium";
import {} from "./types";
import { ExecutionContext, ExecutionContextValue } from "./execution-context";
import {
  DeclareDeclaration,
  DeclareFunction,
  Decorator,
  FunctionDeclaration,
  NamespaceDeclaration,
  VariableDeclarator,
} from "./generated/ast";
import { CompilationPass } from "./passes/CompilationPass";
import { WhackoProgram } from "./program";
import { WhackoModule } from "./module";
import type { Module, LLVMValueRef } from "llvm-js";
import { getFileName } from "./passes/ModuleCollectionPass";
function getPath(node: AstNode): string {
  // @ts-ignore the `parse` function sets this symbol for later use
  return node.$document!.parseResult.value[Symbol.for("fullPath")] as string;
}

export abstract class ScopeElement {
  builtin: BuiltinFunction | null = null;
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
  resolve(): ConcreteType | null {
    // TODO: Actually resolve the type
    return this.cachedConcreteType;
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

export type BuiltinFunction = (props: BuiltinFunctionProps) => void;

export class DynamicTypeScopeElement extends ScopeTypeElement {
  cachedConcreteTypes = new Map<string, ConcreteType>();
  constructor(
    node: AstNode,
    public typeParameters: string[],
    mod: WhackoModule
  ) {
    super(node, mod);
  }

  resolve(typeParameters: ConcreteType[]): ConcreteType | null {
    // TODO: Actually resolve type with type parameters
    return new VoidType(this.node);
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

  llvmType(LLVM: Module) {
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
    return `Function(${parameterNames.join(",")})`;
  }
}

export class MethodType extends ConcreteType {
  constructor(
    public thisType: ClassType,
    public parameterTypes: ConcreteType[],
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
      other instanceof MethodType &&
      other.thisType.isEqual(this.thisType) &&
      other.parameterTypes.length === this.parameterTypes.length &&
      this.parameterTypes.reduce(
        (acc, param, i) => param.isEqual(other.parameterTypes[i]),
        true
      ) &&
      this.returnType.isEqual(this.returnType)
    );
  }

  override getName(): string {
    return this.parameterTypes.length
      ? `Method(this ${this.thisType.getName()}, ${this.parameterTypes.map(
          (e) => e.getName()
        )}): ${this.returnType.getName()}`
      : `Method(this ${this.thisType.getName()}, ${this.parameterTypes.map(
          (e) => e.getName()
        )}): ${this.returnType.getName()}`;
  }
}

export class Field {
  constructor(
    public name: string,
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

export class ClassType extends ConcreteType {
  public methods = new Map<string, MethodType>();
  public fields = new Map<string, Field>();
  public prototypes = new Map<string, PrototypeMethod>();
  constructor(
    public extendsClass: ClassType | null = null,
    public typeParameters: ConcreteType[],
    node: AstNode,
    name: string
  ) {
    super(Type.usize, node, name);
  }

  override get isNumeric() {
    return false;
  }

  addPrototypeMethod(name: string, method: PrototypeMethod) {
    assert(!this.prototypes.has(name));
    this.prototypes.set(name, method);
  }

  addMethod(name: string, method: MethodType) {
    assert(!this.methods.has(name));
    this.methods.set(name, method);
  }

  addField(field: Field) {
    assert(!this.fields.has(field.name));
    this.fields.set(field.name, field);
  }

  get offset() {
    return Array.from(this.fields.values()).reduce(
      (left, right) => left + right.ty.size!,
      0n
    );
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

  override getName(): string {
    return this.typeParameters.length
      ? `${this.name}<${this.typeParameters.map((e) => e.getName()).join(",")}>`
      : this.name;
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

export class SIMDType extends ConcreteType {
  constructor(node: AstNode) {
    super(Type.v128, node, "");
  }

  override get isNumeric() {
    return false;
  }

  override getName(): string {
    return "v128";
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
