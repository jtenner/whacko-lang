import { assert } from "./util";
import { AstNode } from "langium";
import {
  BuiltinTypeDeclaration,
  ClassDeclaration,
  DeclareDeclaration,
  DeclareFunction,
  FunctionDeclaration,
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
  NamespaceDeclaration,
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
  VoidType,
  ScopeElement,
  FunctionReferenceType,
  DeclareDeclarationType,
  NamespaceDeclarationType,
  DeclareFunctionType,
  i32x4Type,
  i8x16Type,
  u8x16Type,
  i16x8Type,
  u16x8Type,
  u32x4Type,
  f32x4Type,
  i64x2Type,
  u64x2Type,
  f64x2Type,
} from "./types";
import { getFileName, getModule } from "./passes/ModuleCollectionPass";
import { LLVMValueRef } from "llvm-js";

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

  constructor(
    public scope: Scope,
    public types = new Map<string, ConcreteType>(),
    public vars = new Map<string, ExecutionVariable>()
  ) {}

  getVariable(name: string): ExecutionVariable | null {
    return this.vars.get(name) ?? this.parent?.getVariable(name) ?? null;
  }

  resolve(
    typeExpression: TypeExpression,
    typeMap = this.types,
    scope = this.scope
  ): ConcreteType | null {
    if (typeExpression.$type === "FunctionTypeExpression") {
      // TODO: We don't support this yet, and I need help
      return null;
    } else if (typeExpression.$type === "TupleTypeExpression") {
      const types = typeExpression.types;
      const concreteTypes = [] as ConcreteType[];
      for (const type of types) {
        const resolvedType = this.resolve(type);
        if (!resolvedType) return null;
        concreteTypes.push(resolvedType);
      }
      const tupleType = new TupleType(concreteTypes, typeExpression);
      return tupleType;
    } else if (typeExpression.$type === "HeldTypeExpression") {
      const resolvedType = this.resolve(typeExpression.type);
      if (!resolvedType) return null;
      const heldType = new HeldType(resolvedType, typeExpression);
      return heldType;
    } else if (typeExpression.$type === "NamedTypeExpression") {
      // the element's name exists on the current expression
      const elementName = typeExpression.element.name;
      // type parameters must be resolved
      const typeParameters = typeExpression.typeParameters;

      // we visit every child and extract a namespace element or return null
      const toVisit = [] as ID[];
      let accumulator: NamedTypeExpression | ID = typeExpression.namespace;
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
      if (element.node.$type === "BuiltinTypeDeclaration") {
        const builtinType = assert(element.builtinType, "The builtin type must be defined.");
        return builtinType({
          ast: typeExpression,
          ctx: this,
          module: element.mod,
          typeParameters: concreteTypeParameters,
        });
      }
    } else if (typeExpression.$type === "ID") {
      const id = typeExpression as ID;
      const name = id.name;
      if (typeMap.has(name)) return typeMap.get(name)!;

      // raw type
      switch (name) {
        case "bool":
          return new BoolType(null, typeExpression);
        case "i8":
          return new IntegerType(Type.i8, null, typeExpression);
        case "u8":
          return new IntegerType(Type.u8, null, typeExpression);
        case "i16":
          return new IntegerType(Type.i16, null, typeExpression);
        case "u16":
          return new IntegerType(Type.u16, null, typeExpression);
        case "i32":
          return new IntegerType(Type.i32, null, typeExpression);
        case "u32":
          return new IntegerType(Type.u32, null, typeExpression);
        case "i64":
          return new IntegerType(Type.i64, null, typeExpression);
        case "u64":
          return new IntegerType(Type.u64, null, typeExpression);
        case "isize":
          return new IntegerType(Type.isize, null, typeExpression);
        case "usize":
          return new IntegerType(Type.usize, null, typeExpression);
        case "f32":
          return new FloatType(Type.f32, null, typeExpression);
        case "f64":
          return new FloatType(Type.f64, null, typeExpression);
        case "void":
          return new VoidType(typeExpression);
        case "i8x16": return new i8x16Type(typeExpression);
        case "u8x16": return new u8x16Type(typeExpression);
        case "i16x8": return new i16x8Type(typeExpression);
        case "u16x8": return new u16x8Type(typeExpression);
        case "i32x4": return new i32x4Type(typeExpression);
        case "u32x4": return new u32x4Type(typeExpression);
        case "f32x4": return new f32x4Type(typeExpression);
        case "i64x2": return new i64x2Type(typeExpression);
        case "u64x2": return new u64x2Type(typeExpression);
        case "f64x2": return new f64x2Type(typeExpression);
        case "string":
          return new StringType(null, typeExpression);
      }

      if (scope.has(name)) {
        const element = scope.get(name)!;
        const node = element.node as BuiltinTypeDeclaration;
        if (element.builtinType) {
          if (element instanceof DynamicTypeScopeElement) {
            const typeParameters = [] as ConcreteType[];

            for (const typeParameter of id.typeParameters) {
              const resolvedType = this.resolve(typeParameter, typeMap, scope);
              if (resolvedType) {
                typeParameters.push(resolvedType);
              } else {
                element.mod.error(`Type`, typeParameter, `Cannot resolve type.`);
                return null;
              }
            }
            return element.builtinType({
              ast: typeExpression,
              ctx: this,
              module: element.mod,
              typeParameters,
            });
          } else {
            return element.builtinType({
              ast: typeExpression,
              ctx: this,
              module: element.mod,
              typeParameters: [],
            });
          }
        }
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
      const nodeExtendsType = this.resolve(
        node.extends,
        concreteTypeMap,
        scope
      );
      if (nodeExtendsType instanceof ClassType) {
        nodeExtends = nodeExtendsType;
      } else {
        // we can't extend non-classes
        return null;
      }
    }

    const fileName = getFileName(node) as string;
    const classType = new ClassType(
      nodeExtends,
      typeParameters,
      node,
      `${fileName}~${node.name.name}`
    );

    // we now need to check the ScopeElement for cached classes that match this type
    if (element instanceof DynamicTypeScopeElement) {
      const name = classType.getName();
      if (element.cachedConcreteTypes.has(name))
        return element.cachedConcreteTypes.get(name)! as ClassType;
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
          element.mod.error(
            "Type",
            member.type,
            `Cannot resolve type for field ${member.name.name}.`
          );
        }
      } else if (isGetterClassMember(member)) {
        // TODO: check for setters of the same name, compare types if they exist
        element.mod.error("Type", member, "Getters not supported.");
      } else if (isSetterClassMember(member)) {
        // TODO: check for getters of the same name, compare types if they exist
        element.mod.error("Type", member, "Setters not supported.");
      } else if (isMethodClassMember(member)) {
        classType.addPrototypeMethod(
          member.name.name,
          new PrototypeMethod(member, concreteTypeMap)
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

export class RuntimeValue extends ExecutionContextValue {
  constructor(public ref: LLVMValueRef, ty: ConcreteType) {
    super(ty);
  }
}

export abstract class CompileTimeValue<T> extends ExecutionContextValue {
  constructor(public value: T, type: ConcreteType) {
    super(type);
  }
}

export class CompileTimeVoid extends CompileTimeValue<number> {
  constructor(node: AstNode) {
    super(0, new VoidType(node));
  }
}

export class CompileTimeFunctionReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    super(value, new FunctionReferenceType(value.node as FunctionDeclaration));
  }
}

export class CompileTimeDeclareDeclarationReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    super(value, new DeclareDeclarationType(value.node as DeclareDeclaration));
  }
}

export class CompileTimeNamespaceDeclarationReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    super(
      value,
      new NamespaceDeclarationType(value.node as NamespaceDeclaration)
    );
  }
}

export class CompileTimeDeclareFunctionReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    super(value, new DeclareFunctionType(value.node as DeclareFunction));
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

export class CompileTimeFloat extends CompileTimeValue<number> {
  constructor(value: number, ty: FloatType) {
    super(value, ty);
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
