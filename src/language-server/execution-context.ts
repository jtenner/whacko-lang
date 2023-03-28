import { assert } from "./util";
import { AstNode } from "langium";
import {
  BuiltinTypeDeclaration,
  ClassDeclaration,
  DeclareDeclaration,
  DeclareFunction,
  EnumDeclaration,
  ExternDeclaration,
  FunctionDeclaration,
  ID,
  isBuiltinTypeDeclaration,
  isClassDeclaration,
  isConstructorClassMember,
  isEnumDeclaration,
  isFieldClassMember,
  isFunctionDeclaration,
  isFunctionTypeExpression,
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
  ConcreteClass,
  EnumType,
  ExternType,
} from "./types";
import { getFileName, getModule } from "./passes/ModuleCollectionPass";
import { LLVMValueRef } from "llvm-js";
import { getFullyQualifiedName } from "./passes/CompilationPass";

export function resolveEnum(declaration: EnumDeclaration): EnumType | null {
  const values = new Map<string, bigint>();
  let nextValue = 0n;
  for (const declarator of declaration.declarators) {
    const name = declarator.name.name;
    // uhoh there's already an enum value declared
    if (values.has(name)) return null;

    if (declarator.initializer) {
      const value = BigInt.asIntN(32, BigInt(declarator.initializer.value));
      nextValue = value + 1n;
      values.set(name, value);
    } else {
      values.set(name, nextValue);
      nextValue++;
    }
  }
  const type = new EnumType(declaration, values);
  return type;
}

export class ExecutionVariable {
  constructor(
    public immutable: boolean,
    public name: string,
    public value: ExecutionContextValue,
    public ty: ConcreteType
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
    if (isFunctionTypeExpression(typeExpression)) {
      const parameterTypes = [] as ConcreteType[];
      for (const parameter of typeExpression.parameters) {
        const resolved = this.resolve(parameter, typeMap, scope);
        if (resolved) {
          parameterTypes.push(resolved);
        } else {
          return null;
        }
      }

      const returnType = this.resolve(typeExpression.returnType, typeMap, scope);
      if (returnType) {
        return new FunctionType(parameterTypes, [], returnType, typeExpression, "");
      }
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


      if (isClassDeclaration(element.node))
        return this.resolveClass(element, concreteTypeParameters);
      if (isTypeDeclaration(element.node))
        return this.resolveTypeDeclaration(element, concreteTypeParameters);
      if (isBuiltinTypeDeclaration(element.node)) {
        const builtinType = assert(element.builtinType, "The builtin type must be defined.");
        return builtinType({
          ast: typeExpression,
          ctx: this,
          module: element.mod,
          typeParameters: concreteTypeParameters,
        });
      }
      if (isEnumDeclaration(element.node)) {
        const cachedConcreteType = (element as StaticTypeScopeElement).cachedConcreteType;
        if (cachedConcreteType) return cachedConcreteType;
        const result = resolveEnum(element.node as EnumDeclaration);
        (element as StaticTypeScopeElement).cachedConcreteType = result;
        return result;
      }
    } else if (typeExpression.$type === "ID") {
      const id = typeExpression as ID;
      const name = id.name;
      const typeParameters = id.typeParameters ?? [];
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
        } else if (element instanceof DynamicTypeScopeElement) {
          // we have a bunch of type parameters to resolve in this scope
          const concreteTypeParameters = [] as ConcreteType[];

          if (element.typeParameters.length !== typeParameters.length) {
            // we can't resolve the type, not enough type parameters
            return null;
          }

          for (let i = 0; i < typeParameters.length; i++) {
            const typeParameter = typeParameters[i];
            const concreteType = this.resolve(typeParameter, typeMap, scope);
            if (concreteType) {
              concreteTypeParameters.push(concreteType);
            } else {
              // we need to be able to resolve this type at this point
              return null;
            }
          }

          // next we generate the new type map and splice it
          const map = new Map<string, ConcreteType>();
          for (let i = 0; i < concreteTypeParameters.length; i++) {
            const name = element.typeParameters[i];
            const type = concreteTypeParameters[i];
            map.set(name, type);
          }

          // finally resolve the scope element in the scope of the scope type element
          return this.resolve(element.node as TypeExpression, map, assert(getScope(element.node), "The scope must exist at this point."));
        } else if (element instanceof StaticTypeScopeElement) {
          // no need for a type map to resolve this element, so we just defer to resolving the type in
          // it's own context
          if (element.cachedConcreteType) return element.cachedConcreteType;

          if (isEnumDeclaration(node)) {
            const type = resolveEnum(node);
            if (type) {
              element.cachedConcreteType = type;
              return type;
            }
            // uhoh, we didn't find it
          }

          if (isTypeDeclaration(node)) {
            return this.resolveTypeDeclaration(element, []);
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
  ): ConcreteClass | null {
    assert(false, "Cannot resolve classes yet");
    return null;
  }

  private resolveTypeDeclaration(
    element: ScopeTypeElement,
    typeParameters: ConcreteType[]
  ): ConcreteType | null {
    assert(
      element.node.$type === "TypeDeclaration",
      "Element must be a type declaration."
    );
    if (element instanceof StaticTypeScopeElement && element.cachedConcreteType) return element.cachedConcreteType;
    const node = element.node;
    const types = new Map<string, ConcreteType>();
    const typeDeclaration = element.node as TypeDeclaration;

    if (element instanceof DynamicTypeScopeElement) {
      for (let i = 0; i < element.typeParameters.length; i++) {
        const parameter = element.typeParameters[i];
        types.set(parameter, typeParameters[i]);
      }
    }

    const scope = getScope(node)!;
    assert(scope, "Scope must exist at this point.");

    const type = this.resolve(typeDeclaration.type, types, scope);

    if (element instanceof StaticTypeScopeElement) {
      element.cachedConcreteType = type;
    }

    return type;
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

/** The type of this CompileTimeClassReference cannot have a valid type until the class type is resolved in the NewExpression. */
export class CompileTimeClassReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    super(value, new InvalidType(value.node));
  }
}

export class CompileTimeEnumReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    assert(value instanceof StaticTypeScopeElement, "Enums should always be static scope elements.");
    assert(isEnumDeclaration(value.node), "The scope element must be an enum at this point.");
    const result = (value as StaticTypeScopeElement).cachedConcreteType ?? resolveEnum(value.node as EnumDeclaration);
    assert(result instanceof EnumType);
    (value as StaticTypeScopeElement).cachedConcreteType = result;
    super(value, result!);
  }
}

export class CompileTimeExternReference extends CompileTimeValue<ScopeElement> {
  constructor(value: ScopeElement) {
    assert(value instanceof StaticTypeScopeElement, "Extern functions must be static scope elements.");
    super(value, new ExternType(value.node as ExternDeclaration));
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
