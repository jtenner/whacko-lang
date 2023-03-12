import {
  assert,
} from "./util";
import { AstNode } from "langium";
import {
  ClassDeclaration,
  ID,
  isClassDeclaration,
  isConstructorClassMember,
  isFieldClassMember,
  isFunctionDeclaration,
  isGetterClassMember,
  isID,
  isMethodClassMember,
  isSetterClassMember,
  isTypeDeclaration,
  NamedTypeExpression,
  TypeDeclaration,
  TypeExpression,
} from "./generated/ast";
import {
  ConcreteType,
  IntegerType,
  FloatType,
  StringType,
  BoolType,
  InvalidType,
  FunctionType,
  Parameter,
  TupleType,
  HeldType,
  NamespaceTypeScopeElement,
  Scope,
  StaticTypeScopeElement,
  DynamicTypeScopeElement,
  ScopeTypeElement,
  ClassType,
  getScope,
  Type,
  Field,
  PrototypeMethod,
} from "./types";
import { getFileName, getModule } from "./passes/ModuleCollectionPass";
import llvm, { LLVMValueRef } from "../llvm/llvm";

const LLVM = await (await llvm).ready();

export class ExecutionVariable {
  constructor(
    public immutable: boolean,
    public name: string,
    public value: ExecutionContextValue,
    public type: ConcreteType
  ) {}
}

export class ExecutionContext {
  parent: ExecutionContext | null = null;
  stack = [] as ExecutionContextValue[];
  vars = new Map<string, ExecutionVariable>();

  constructor(
    public scope: Scope,
    public types = new Map<string, ConcreteType>(),
  ) {}

  getVariable(name: string): ExecutionVariable | null {
    return this.vars.get(name) ?? this.parent?.getVariable(name) ?? null;
  }

  resolve(
    expression: TypeExpression,
    typeMap = this.types,
    scope = this.scope
  ): ConcreteType | null {
    if (expression.$type === "FunctionTypeExpression") {
      // TODO: We don't support this yet, and I need help
      return null;
    } else if (expression.$type === "TupleTypeExpression") {
      const types = expression.types;
      const concreteTypes = [] as ConcreteType[];
      for (const type of types) {
        const resolvedType = this.resolve(type);
        if (!resolvedType) return null;
        concreteTypes.push(resolvedType);
      }
      const tupleType = new TupleType(concreteTypes, expression);
      return tupleType;
    } else if (expression.$type === "HeldTypeExpression") {
      const resolvedType = this.resolve(expression.type);
      if (!resolvedType) return null;
      const heldType = new HeldType(resolvedType, expression);
      return heldType;
    } else if (expression.$type === "NamedTypeExpression") {
      // the element's name exists on the current expression
      const elementName = expression.element.name;
      // type parameters must be resolved
      const typeParameters = expression.typeParameters;

      // we visit every child and extract a namespace element or return null
      const toVisit = [] as ID[];
      let accumulator: NamedTypeExpression | ID = expression.namespace;
      while (true) {
        if (isID(accumulator)) {
          toVisit.push(accumulator);
          break;
        } else {
          toVisit.push(accumulator.element);
          accumulator = accumulator.namespace;
          // NamedTypeExpression
        }
      }

      assert(
        toVisit.length > 0,
        "Cannot visit namespace path with 0 elements."
      );
      let scopeElements = scope.elements;
      while (toVisit.length) {
        const namespaceID = toVisit.pop()!.name;
        const namespace = scope.get(namespaceID);
        if (namespace instanceof NamespaceTypeScopeElement) {
          scopeElements = namespace.exports;
        } else {
          return null;
        }
      }

      // now we have the namespace elements
      const element = scopeElements.get(elementName)! as ScopeTypeElement;
      // we must be a ScopeTypeElement
      if (!(element instanceof ScopeTypeElement)) return null;

      // now we need to resolve the type parameters and fork the execution context

      // check type parameter count
      if (
        element instanceof StaticTypeScopeElement &&
        typeParameters.length !== 0
      ) {
        // we are static, we need to return because generic parameters were passed
        return null;
      } else if (
        element instanceof DynamicTypeScopeElement &&
        typeParameters.length !== element.typeParameters.length
      ) {
        // not enough type parameters
        // TODO: Type initialzers?
        return null;
      }

      const concreteTypeParameters = [] as ConcreteType[];

      // 
      if (element instanceof StaticTypeScopeElement) {
        // we are static, maybe there's a short circuit
        if (element.cachedConcreteType) return element.cachedConcreteType;
      } else if (element instanceof DynamicTypeScopeElement) {
        // for each type expression, resolve it, and add it to the array
        for (let i = 0; i < typeParameters.length; i++) {
          const resolved = this.resolve(typeParameters[i]);
          if (resolved) concreteTypeParameters.push(resolved);
          else return null;
        }
      }
      if (element.node.$type === "ClassDeclaration")
        return this.resolveClass(element, concreteTypeParameters);
      if (element.node.$type === "TypeDeclaration")
        return this.resolveTypeDeclaration(element, concreteTypeParameters);
    } else if (expression.$type === "ID") {
      const id = expression as ID;
      const name = id.name;
      if (typeMap.has(name)) return typeMap.get(name)!;

      // raw type
      switch (name) {
        case "i8":
          return new IntegerType(Type.i8, null, expression);
        case "u8":
          return new IntegerType(Type.u8, null, expression);
        case "i16":
          return new IntegerType(Type.i16, null, expression);
        case "u16":
          return new IntegerType(Type.u16, null, expression);
        case "i32":
          return new IntegerType(Type.i32, null, expression);
        case "u32":
          return new IntegerType(Type.u32, null, expression);
        case "i64":
          return new IntegerType(Type.i64, null, expression);
        case "u64":
          return new IntegerType(Type.u64, null, expression);
        case "isize":
          return new IntegerType(Type.isize, null, expression);
        case "usize":
          return new IntegerType(Type.usize, null, expression);
        case "f32":
          return new FloatType(Type.f32, null, expression);
        case "f64":
          return new FloatType(Type.f64, null, expression);
      }
    }
    // something happened?
    return null;
  }

  private resolveClass(
    element: ScopeTypeElement,
    typeParameters: ConcreteType[]
  ): ClassType | null {
    assert(
      element.node.$type === "ClassDeclaration",
      "Element must a class declaration."
    );
    const node = element.node as ClassDeclaration;
    const concreteTypeMap = new Map<string, ConcreteType>();

    // assign all the types into a map
    for (let i = 0; i < typeParameters.length; i++) {
      concreteTypeMap.set(node.typeParameters[i].name, typeParameters[i]);
    }

    // resolve the class extends
    let nodeExtends: ClassType | null = null;
    const scope = getScope(node)!;
    if (node.extends) {
      assert(scope);
      // we must resolve the extends class
      const nodeExtendsType = this.resolve(node.extends, concreteTypeMap, scope);
      if (nodeExtendsType instanceof ClassType) {
        nodeExtends = nodeExtendsType;
      } else {
        // we can't extend non-classes
        return null;
      }
    }

    const fileName = getFileName(node) as string;
    const classType = new ClassType(nodeExtends, typeParameters, node, `${fileName}~${node.name.name}`);

    // we now need to check the ScopeElement for cached classes that match this type
    if (element instanceof DynamicTypeScopeElement) {
      const name = classType.getName();
      if (element.cachedConcreteTypes.has(name)) return element.cachedConcreteTypes.get(name)! as ClassType;
      // we aren't cached, because both static and dynamic checks failed
      element.cachedConcreteTypes.set(name, classType);
    }

    // now we actually need to resolve and calculate each member now
    let offset = 0n;

    for (const member of node.members) {
      if (isFieldClassMember(member)) {
        const type = this.resolve(member.type, concreteTypeMap, scope);
        if (type) {
          const field = new Field(member.name.name, type, offset);
          offset += type.size;
          classType.addField(field);
        } else {
          element.mod.error("Type", member.type, `Cannot resolve type for field ${member.name.name}.`);
        }
      } else if (isGetterClassMember(member)) {
        // TODO: check for setters of the same name, compare types if they exist
        element.mod.error("Type", member, "Getters not supported.");
      } else if (isSetterClassMember(member)) {
        // TODO: check for getters of the same name, compare types if they exist
        element.mod.error("Type", member, "Setters not supported.");
      } else if (isMethodClassMember(member)) {
        classType.addPrototypeMethod(member.name.name, 
          new PrototypeMethod(member, concreteTypeMap),
          );
        } else if (isConstructorClassMember(member)) {
        element.mod.error("Type", member, "Constructors are not supported.");
        // classType.addMethod("constructor", this.resolveConstructor(member, concreteTypeMap, scope));
      }
    }


    return classType;
    // TODO: resolve classes
  }

  private resolveTypeDeclaration(
    element: ScopeTypeElement,
    typeParameters: ConcreteType[]
  ): ConcreteType | null {
    assert(
      element.node.$type === "TypeDeclaration",
      "Element must be a type declaration."
    );
    const node = element.node;
    const types = new Map<string, ConcreteType>();
    const typeDeclaration = element.node as TypeExpression;

    if (element instanceof DynamicTypeScopeElement) {
      for (let i = 0; i < element.typeParameters.length; i++) {
        const parameter = element.typeParameters[i];
        types.set(parameter, typeParameters[i]);
      }
    }

    const scope = getScope(node)!;
    assert(scope, "Scope must exist at this point.");

    return this.resolve(typeDeclaration, types, scope);
  }
}

export abstract class ExecutionContextValue {
  constructor(public ty: ConcreteType) {}

  get valid() {
    return true;
  }
}

export abstract class RuntimeValue extends ExecutionContextValue {
  constructor(public ref: LLVMValueRef, ty: ConcreteType) {
    super(ty);
  }
}

export class RuntimeInvalid extends RuntimeValue {
  constructor(ty: ConcreteType) {
    super(LLVM._LLVMGetPoison(ty.llvmType!), ty);
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
  constructor(ref: LLVMValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class CompileTimeFloat extends CompileTimeValue<number> {
  constructor(value: number, ty: FloatType) {
    super(value, ty);
  }
}

export class RuntimeFloat extends RuntimeValue {
  constructor(ref: LLVMValueRef, ty: ConcreteType) {
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
  constructor(ref: LLVMValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class RuntimeString extends RuntimeValue {
  constructor(ref: LLVMValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class RuntimeArray extends RuntimeValue {
  constructor(ref: LLVMValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}

export class RuntimeFunction extends RuntimeValue {
  constructor(ref: LLVMValueRef, ty: ConcreteType) {
    super(ref, ty);
  }
}
