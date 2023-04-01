import { LLVMTypeRef, LLVMValueRef } from "llvm-js";
import { reportErrorDiagnostic } from "./diagnostic";
import {
  TypeExpression,
  ClassDeclaration,
  FunctionDeclaration,
  ID,
  isBuiltinTypeDeclaration,
  BuiltinTypeDeclaration,
  isStringLiteral,
  TypeDeclaration,
  EnumDeclaration,
  isEnumDeclaration,
  isTypeDeclaration,
  isFieldClassMember,
  FieldClassMember,
  TypeID,
  isTypeDeclarationStatement,
  isClassDeclaration,
  NamedTypeExpression,
  FunctionTypeExpression,
} from "./generated/ast";
import { ConcreteFunction, WhackoModule, WhackoProgram } from "./program";
import {
  Scope,
  ScopeElementType,
  getScope,
  getElementInScope,
  ScopeElement,
} from "./scope";
import { assert, getNodeName } from "./util";

export const enum ConcreteTypeKind {
  Class,
  Function,
  Enum,
  Method,
  Str,
  Array,
  Integer,
  Float,
  V128,
  Never,
}

export const enum V128Kind {
  I8x16,
  U8x16,
  I16x8,
  U16x8,
  I32x4,
  U32x4,
  F32x4,
  I64x2,
  U64x2,
  F64x2,
}

export const enum FloatKind {
  F32,
  F64,
}

export const enum IntegerKind {
  Bool,
  I8,
  U8,
  I16,
  U16,
  I32,
  U32,
  I64,
  U64,
  ISize,
  USize,
}

export interface ConcreteType {
  kind: ConcreteTypeKind;
  llvmType: LLVMTypeRef | null;
}

export interface FunctionType extends ConcreteType {
  kind: ConcreteTypeKind.Function | ConcreteTypeKind.Method;
  returnType: ConcreteType;
  parameterTypes: ConcreteType[];
}

export interface MethodType extends FunctionType {
  kind: ConcreteTypeKind.Method;
  thisType: ClassType;
}

export interface ConcreteField {
  name: string;
  type: ConcreteType;
}

export interface ClassType extends ConcreteType {
  kind: ConcreteTypeKind.Class;
  resolvedTypes: TypeMap;
  classNode: ClassDeclaration;
  extendsClass: ClassType | null;
  // @ts-ignore TODO: Add cachable concrete constructors
  classConstructor: ConcreteConstructor | null;
  // @ts-ignore TODO: Add cachable concrete methods based on name of method and parameters
  methods: Map<string, ConcreteMethod>;
  fields: ConcreteField[];
}

export function getSize(ty: ConcreteType): 1 | 2 | 4 | 8 | 16 {
  switch (ty.kind) {
    case ConcreteTypeKind.Array:
    case ConcreteTypeKind.Class:
    case ConcreteTypeKind.Str:
    case ConcreteTypeKind.Function:
    case ConcreteTypeKind.Method: {
      return 4;
    }
    case ConcreteTypeKind.Integer: {
      switch ((ty as IntegerType).integerKind) {
        case IntegerKind.Bool:
        case IntegerKind.I8:
        case IntegerKind.U8:
          return 1;
        case IntegerKind.I16:
        case IntegerKind.U16:
          return 2;
        case IntegerKind.I32:
        case IntegerKind.U32:
        case IntegerKind.ISize:
        case IntegerKind.USize:
          return 4;
        case IntegerKind.I64:
        case IntegerKind.U64:
          return 8;
        default:
          return assert(false, "Unknown integer kind") as never;
      }
    }
    case ConcreteTypeKind.Float: {
      switch ((ty as FloatType).floatKind) {
        case FloatKind.F32:
          return 4;
        case FloatKind.F64:
          return 8;
        default:
          return assert(false, "Unknown float kind") as never;
      }
    }
    case ConcreteTypeKind.V128: {
      return 16;
    }
    default: {
      return assert(false, "Unknown type kind") as never;
    }
  }
}

export interface V128Type extends ConcreteType {
  kind: ConcreteTypeKind.V128;
  v128Kind: V128Kind;
}

export interface IntegerType extends ConcreteType {
  kind: ConcreteTypeKind.Integer | ConcreteTypeKind.Enum;
  integerKind: IntegerKind;
}

export interface EnumType extends IntegerType {
  kind: ConcreteTypeKind.Enum;
  integerKind: IntegerKind.I32;
  name: string;
}

export interface FloatType extends ConcreteType {
  kind: ConcreteTypeKind.Float;
  floatKind: FloatKind;
}

export function getLLVMType(
  program: WhackoProgram,
  ty: ConcreteType,
): LLVMTypeRef {
  const { LLVM } = program;

  if (ty.llvmType) return ty.llvmType;

  switch (ty.kind) {
    case ConcreteTypeKind.Class:
      // @ts-ignore
      return getLLVMStructType(program, ty as ClassType);
    case ConcreteTypeKind.Array:
    case ConcreteTypeKind.Str:
      return LLVM._LLVMPointerType(LLVM._LLVMInt8Type(), 0);
    case ConcreteTypeKind.Function:
      // @ts-ignore
      return getLLVMFunctionType(program, ty as FunctionType);
    case ConcreteTypeKind.Method:
      // @ts-ignore
      return getLLVMMethodType(program, ty as MethodType);
    case ConcreteTypeKind.Integer: {
      switch ((ty as IntegerType).integerKind) {
        case IntegerKind.Bool:
          return LLVM._LLVMInt1Type();
        case IntegerKind.I8:
        case IntegerKind.U8:
          return LLVM._LLVMInt8Type();
        case IntegerKind.I16:
        case IntegerKind.U16:
          return LLVM._LLVMInt16Type();
        case IntegerKind.I32:
        case IntegerKind.U32:
        case IntegerKind.ISize:
        case IntegerKind.USize:
          return LLVM._LLVMInt32Type();
        case IntegerKind.I64:
        case IntegerKind.U64:
          return LLVM._LLVMInt64Type();
        default:
          return assert(false, "Unknown integer kind") as never;
      }
    }
    case ConcreteTypeKind.Float: {
      switch ((ty as FloatType).floatKind) {
        case FloatKind.F32:
          return LLVM._LLVMFloatType();
        case FloatKind.F64:
          return LLVM._LLVMDoubleType();
        default:
          return assert(false, "Unknown float kind") as never;
      }
    }
    case ConcreteTypeKind.V128: {
      switch ((ty as V128Type).v128Kind) {
        case V128Kind.I8x16:
        case V128Kind.U8x16:
          return LLVM._LLVMVectorType(LLVM._LLVMInt8Type(), 16);
        case V128Kind.I16x8:
        case V128Kind.U16x8:
          return LLVM._LLVMVectorType(LLVM._LLVMInt16Type(), 8);
        case V128Kind.I32x4:
        case V128Kind.U32x4:
          return LLVM._LLVMVectorType(LLVM._LLVMInt32Type(), 4);
        case V128Kind.F32x4:
          return LLVM._LLVMVectorType(LLVM._LLVMFloatType(), 4);
        case V128Kind.I64x2:
        case V128Kind.U64x2:
          return LLVM._LLVMVectorType(LLVM._LLVMInt64Type(), 2);
        case V128Kind.F64x2:
          return LLVM._LLVMVectorType(LLVM._LLVMDoubleType(), 2);
      }
    }
    default: {
      return assert(false, "Unknown type kind") as never;
    }
  }
}

export function getTypeName(ty: ConcreteType): string {
  // TODO: Make type names at some point
  return "";
}

export function getFloatType(kind: FloatKind): FloatType {
  // TODO: Cache this?
  return {
    kind: ConcreteTypeKind.Float,
    floatKind: kind,
    llvmType: null,
  };
}

export function getIntegerType(kind: IntegerKind): IntegerType {
  // TODO: Cache this?
  return {
    kind: ConcreteTypeKind.Integer,
    integerKind: kind,
    llvmType: null,
  };
}

export function getV128Type(kind: V128Kind): V128Type {
  // TODO: Cache this?
  return {
    kind: ConcreteTypeKind.V128,
    v128Kind: kind,
    llvmType: null,
  };
}

export type TypeMap = Map<string, ConcreteType>;

export function resolveTypeDeclaration(
  program: WhackoProgram,
  module: WhackoModule,
  scopeElement: ScopeElement,
  scope: Scope,
  typeParameters: ConcreteType[],
  typeMap: TypeMap,
): ConcreteType | null {
  const node = scopeElement.node as TypeDeclaration;
  assert(
    isTypeDeclaration(node) || isTypeDeclarationStatement(node),
    "Node must be a type declaration.",
  );

  if (node.typeParameters.length !== typeParameters.length) {
    reportErrorDiagnostic(
      program,
      "Type",
      node.name,
      module,
      `Type parameters do not match type declaration signature length.`,
    );
    return null;
  }

  const declarationScope = assert(
    getScope(node),
    "The scope must exist for the type declaration.",
  );

  return resolveType(program, module, node.type, declarationScope, typeMap);
}

export function resolveBuiltinType(
  program: WhackoProgram,
  module: WhackoModule,
  scopeElement: ScopeElement,
  scope: Scope,
  typeParameters: ConcreteType[],
): ConcreteType | null {
  assert(
    scopeElement.type === ScopeElementType.BuiltinType,
    "The scope element must be a builtin type.",
  );
  const node = scopeElement.node as BuiltinTypeDeclaration;
  assert(
    isBuiltinTypeDeclaration(node),
    "The node of the scope element must be a builtin type declaration.",
  );

  if (typeParameters.length !== node.typeParameters.length) {
    reportErrorDiagnostic(
      program,
      "type",
      node,
      module,
      `Type parameter count does not match builtintype type parameter signature.`,
    );
    return null;
  }

  const builtinNameDecorator = node.decorators.find(
    (decorator) => decorator.name.name === "name",
  );
  if (!builtinNameDecorator) {
    reportErrorDiagnostic(
      program,
      "type",
      node,
      module,
      "Builtin type does not have a @name decorator.",
    );
    return null;
  }

  if (builtinNameDecorator.parameters.length !== 1) {
    reportErrorDiagnostic(
      program,
      "type",
      node,
      module,
      "Builtin type @name decorator has an incorrect number of parameters",
    );
    return null;
  }

  const [builtinName] = builtinNameDecorator.parameters;

  if (!isStringLiteral(builtinName)) {
    reportErrorDiagnostic(
      program,
      "type",
      builtinName,
      module,
      "Builtin type @name parameter is not a string literal",
    );
    return null;
  }

  const builtinTypeFunction = assert(
    program.builtinTypeFunctions.get(builtinName.value),
    `The builtin type definition for ${builtinName} does not exist.`,
  );
  return builtinTypeFunction({ program, module, scope, typeParameters, node });
}

export function resolveEnumType(
  program: WhackoProgram,
  module: WhackoModule,
  scopeElement: ScopeElement,
): EnumType | null {
  const node = scopeElement.node as EnumDeclaration;
  assert(isEnumDeclaration(node), "Node must be an enum declaration.");

  const name = getNodeName(node);
  const classScope = assert(
    getNodeName(node),
    "Class declaration should have a scope.",
  );
  if (program.enums.has(name)) return program.enums.get(name)!;

  const enumType: EnumType = {
    kind: ConcreteTypeKind.Enum,
    name,
    integerKind: IntegerKind.I32,
    llvmType: null,
  };

  program.enums.set(name, enumType);
  return enumType;
}

export function resolveClass(
  program: WhackoProgram,
  module: WhackoModule,
  classElement: ScopeElement,
  scope: Scope,
  typeParameters: ConcreteType[],
  typeMap: TypeMap,
): ClassType | null {
  const node = classElement.node as ClassDeclaration;
  assert(
    isClassDeclaration(node),
    "Scope element must have a class declaration inside it.",
  );
  const nodeScope = assert(
    getScope(node),
    "Class must have a scope at this point.",
  );

  if (typeParameters.length !== node.typeParameters.length) {
    reportErrorDiagnostic(
      program,
      "type",
      node,
      module,
      "Number of type parameters given does not match the declaration.",
    );
    return null;
  }

  const newTypeMap: TypeMap = new Map();
  for (let i = 0; i < typeParameters.length; i++) {
    newTypeMap.set(node.typeParameters[i].name, typeParameters[i]);
  }

  let extendsClass: ClassType | null = null;

  if (node.extends) {
    const result = resolveType(
      program,
      module,
      node.extends,
      nodeScope,
      newTypeMap,
    );
    if (!result) {
      reportErrorDiagnostic(
        program,
        "type",
        node.extends,
        module,
        "Super class could not be resolved",
      );
      return null;
    } else if (result.kind !== ConcreteTypeKind.Class) {
      reportErrorDiagnostic(
        program,
        "type",
        node.extends,
        module,
        "Super class resolved to a non-class type",
      );
      return null;
    }
    extendsClass = result as ClassType;
  }

  const fields: ConcreteField[] = [];
  // do we have getters?
  for (const member of node.members) {
    if (!isFieldClassMember(member)) continue;

    const field: FieldClassMember = member;

    const type = field.type;
    if (!type) {
      reportErrorDiagnostic(
        program,
        "type",
        field,
        module,
        "TODO: Field types are mandatory for now.",
      );
      return null;
    }

    const concreteFieldType = resolveType(
      program,
      module,
      type,
      nodeScope,
      newTypeMap,
    );

    if (!concreteFieldType) {
      reportErrorDiagnostic(
        program,
        "type",
        field,
        module,
        "Field type failed to resolve.",
      );
      return null;
    }

    fields.push({
      name: field.name.name,
      type: concreteFieldType,
    });
  }

  return {
    classNode: node,
    classConstructor: null,
    extendsClass,
    llvmType: null,
    methods: new Map(),
    fields,
    kind: ConcreteTypeKind.Class,
    resolvedTypes: newTypeMap,
  };
}

export function resolveNamedTypeScopeElement(
  program: WhackoProgram,
  module: WhackoModule,
  scopeElement: ScopeElement,
  scope: Scope,
  typeParameters: TypeExpression[],
  typeMap: TypeMap,
): ConcreteType | null {
  const concreteTypeParameters: ConcreteType[] = [];

  for (const parameterExpression of typeParameters) {
    const concreteTypeParameter = resolveType(
      program,
      module,
      parameterExpression,
      scope,
      typeMap,
    );
    if (!concreteTypeParameter) {
      // There should already be an emitted diagnostic
      reportErrorDiagnostic(
        program,
        "type",
        parameterExpression,
        module,
        "Type parameter could not be resolved.",
      );
      return null;
    }
    concreteTypeParameters.push(concreteTypeParameter);
  }

  switch (scopeElement.type) {
    case ScopeElementType.BuiltinType: {
      return resolveBuiltinType(
        program,
        module,
        scopeElement,
        scope,
        concreteTypeParameters,
      );
    }
    case ScopeElementType.Class: {
      return resolveClass(
        program,
        module,
        scopeElement,
        scope,
        concreteTypeParameters,
        typeMap,
      );
    }
    case ScopeElementType.Enum: {
      return resolveEnumType(program, module, scopeElement);
    }
    case ScopeElementType.TypeDeclaration: {
      return resolveTypeDeclaration(
        program,
        module,
        scopeElement,
        scope,
        concreteTypeParameters,
        typeMap,
      );
    }
    default: {
      reportErrorDiagnostic(
        program,
        "type",
        scopeElement.node,
        module,
        "Referenced element does not refer to a type",
      );
      return null;
    }
  }
}

export function resolveType(
  program: WhackoProgram,
  module: WhackoModule,
  typeExpression: TypeExpression,
  scope: Scope,
  typeMap: TypeMap,
): ConcreteType | null {
  switch (typeExpression.$type) {
    case "TypeID": {
      const node = typeExpression as TypeID;

      if (!typeExpression.typeParameters.length) {
        switch (node.name) {
          case "i8":
            return getIntegerType(IntegerKind.I8);
          case "u8":
            return getIntegerType(IntegerKind.U8);
          case "i16":
            return getIntegerType(IntegerKind.I16);
          case "u16":
            return getIntegerType(IntegerKind.U16);
          case "i32":
            return getIntegerType(IntegerKind.I32);
          case "u32":
            return getIntegerType(IntegerKind.U32);
          case "i64":
            return getIntegerType(IntegerKind.I64);
          case "u64":
            return getIntegerType(IntegerKind.U64);
          case "isize":
            return getIntegerType(IntegerKind.ISize);
          case "usize":
            return getIntegerType(IntegerKind.USize);
          case "f32":
            return getFloatType(FloatKind.F32);
          case "f64":
            return getFloatType(FloatKind.F64);
          case "i8x16":
            return getV128Type(V128Kind.I8x16);
          case "u8x16":
            return getV128Type(V128Kind.U8x16);
          case "i16x8":
            return getV128Type(V128Kind.I16x8);
          case "u16x8":
            return getV128Type(V128Kind.U16x8);
          case "i32x4":
            return getV128Type(V128Kind.I32x4);
          case "u32x4":
            return getV128Type(V128Kind.U32x4);
          case "f32x4":
            return getV128Type(V128Kind.F32x4);
          case "i64x2":
            return getV128Type(V128Kind.I64x2);
          case "u64x2":
            return getV128Type(V128Kind.U64x2);
          case "f64x2":
            return getV128Type(V128Kind.F64x2);
        }

        if (typeMap.has(node.name)) return typeMap.get(node.name)!;

        const scopeElement = getElementInScope(scope, node.name);
        if (scopeElement) {
          return resolveNamedTypeScopeElement(
            program,
            module,
            scopeElement,
            scope,
            node.typeParameters,
            typeMap,
          );
        } else {
          reportErrorDiagnostic(
            program,
            "type",
            node,
            module,
            "Named type could not be resolved",
          );
          return null;
        }
      }
    }
    case "NamedTypeExpression": {
      const node = typeExpression as NamedTypeExpression;
      const [root, ...rest] = node.path;
      let accumulator = getElementInScope(scope, root.name);

      if (!accumulator) {
        reportErrorDiagnostic(
          program,
          "type",
          root,
          module,
          `Namespace '${root.name}' does not exist.`,
        );
        return null;
      }

      for (const id of rest) {
        const name = id.name;
        accumulator = accumulator.exports?.get(name) ?? null;
        if (!accumulator) {
          reportErrorDiagnostic(
            program,
            "type",
            id,
            module,
            `Cannot resolve '${name}' in namespace.`,
          );
          return null;
        }
      }

      return resolveNamedTypeScopeElement(
        program,
        module,
        accumulator,
        scope,
        node.typeParameters,
        typeMap,
      );
    }
    case "TupleTypeExpression": {
      reportErrorDiagnostic(
        program,
        "type",
        typeExpression,
        module,
        "TODO: Tuple types are not supported yet.",
      );
      return null;
    }
    case "FunctionTypeExpression": {
      const functionTypeExpression = typeExpression as FunctionTypeExpression;
      const parameterTypes: ConcreteType[] = [];
      for (const parameter of functionTypeExpression.parameters) {
        const parameterType = resolveType(
          program,
          module,
          parameter,
          scope,
          typeMap,
        );
        if (!parameterType) {
          reportErrorDiagnostic(
            program,
            "type",
            parameter,
            module,
            "Parameter type could not be resolved.",
          );
          return null;
        }
        parameterTypes.push(parameterType);
      }

      const returnType = resolveType(
        program,
        module,
        functionTypeExpression.returnType,
        scope,
        typeMap,
      );

      if (!returnType) {
        reportErrorDiagnostic(
          program,
          "type",
          functionTypeExpression.returnType,
          module,
          "Return type could not be resolved.",
        );
        return null;
      }

      const result: FunctionType = {
        kind: ConcreteTypeKind.Function,
        llvmType: null,
        parameterTypes,
        returnType,
      };
      return result;
    }
  }
}

export function getFunctionType(
  program: WhackoProgram,
  module: WhackoModule,
  node: FunctionDeclaration,
  typeParameters: ConcreteType[],
): FunctionType | null {
  const scope = assert(
    getScope(node),
    "The scope for this node must exist at this point.",
  );

  const typeMap: TypeMap = new Map();

  if (typeParameters.length !== node.typeParameters.length) {
    reportErrorDiagnostic(
      program,
      "type",
      node,
      module,
      "Number of type parameters does not match function signature.",
    );
    return null;
  }

  for (let i = 0; i < node.typeParameters.length; i++) {
    typeMap.set(node.typeParameters[i].name, typeParameters[i]);
  }

  const parameterTypes = [] as ConcreteType[];
  for (const parameter of node.parameters) {
    const parameterType = resolveType(
      program,
      module,
      parameter.type,
      scope,
      typeMap,
    );
    if (!parameterType) {
      reportErrorDiagnostic(
        program,
        "type",
        parameter.type,
        module,
        "Could not resolve parameter",
      );
      return null;
    }
    parameterTypes.push(parameterType);
  }

  const returnType = resolveType(
    program,
    module,
    node.returnType,
    scope,
    typeMap,
  );
  const result = {
    kind: ConcreteTypeKind.Function,
    llvmType: null,
    parameterTypes,
    returnType,
  } as FunctionType;
  return result;
}

