import { AstNode } from "langium";
import { LLVMTypeRef, LLVMValueRef } from "llvm-js";
import { reportErrorDiagnostic } from "./diagnostic";
import {
  TypeExpression,
  ClassDeclaration,
  FunctionDeclaration,
  BuiltinDeclaration,
  ConstructorClassMember,
  ID,
  Parameter,
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
  isMethodClassMember,
  MethodClassMember,
  StringLiteral,
  BinaryExpression,
  isConstructorClassMember,
  DeclareFunction,
  isDeclareFunction,
  ExternDeclaration,
  isExternDeclaration,
  isBinaryExpression,
} from "./generated/ast";
import {
  BinaryOperator,
  WhackoMethodContext,
  WhackoFunctionContext,
} from "./ir";
import { ensureCallableCompiled, WhackoModule, WhackoProgram } from "./program";
import {
  Scope,
  ScopeElementType,
  getScope,
  getElementInScope,
  ScopeElement,
  traverseScopePath,
} from "./scope";
import {
  assert,
  getNodeName,
  getNameDecoratorValue,
  logNode,
  UNREACHABLE,
} from "./util";

export const enum ConcreteTypeKind {
  Invalid,
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
  Void,
  Nullable,
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
  node: FieldClassMember;
}

export interface ClassType extends ConcreteType {
  kind: ConcreteTypeKind.Class;
  resolvedTypes: TypeMap;
  typeParameters: ConcreteType[];
  node: ClassDeclaration;
  // @ts-ignore TODO: Add cachable concrete constructors
  classConstructor: WhackoFunctionContext | null;
  // @ts-ignore TODO: Add cachable concrete methods based on name of method and parameters
  methods: Map<string, WhackoFunctionContext>;
  fields: Map<string, ConcreteField>;
}

export interface NullableType extends ConcreteType {
  kind: ConcreteTypeKind.Nullable;
  child: ClassType;
}

export function getNullableType(child: ClassType): NullableType {
  return {
    kind: ConcreteTypeKind.Nullable,
    child,
    llvmType: null,
  };
}

export function getNonnullableType(type: ConcreteType): ConcreteType {
  return type.kind === ConcreteTypeKind.Nullable
    ? (type as NullableType).child
    : type;
}

export interface InvalidType extends ConcreteType {
  kind: ConcreteTypeKind.Invalid;
}

export const theInvalidType: InvalidType = {
  kind: ConcreteTypeKind.Invalid,
  llvmType: null,
};

export const theVoidType: ConcreteType = {
  kind: ConcreteTypeKind.Void,
  llvmType: null,
};

export function isSignedIntegerKind(kind: IntegerKind): boolean {
  switch (kind) {
    case IntegerKind.Bool:
    case IntegerKind.U8:
    case IntegerKind.U16:
    case IntegerKind.U32:
    case IntegerKind.U64:
    case IntegerKind.USize:
      return false;

    case IntegerKind.I8:
    case IntegerKind.I16:
    case IntegerKind.I32:
    case IntegerKind.I64:
    case IntegerKind.ISize:
      return true;
  }
}

export function getIntegerBitCount(kind: IntegerKind): 1 | 8 | 16 | 32 | 64 {
  switch (kind) {
    case IntegerKind.Bool:
      return 1;
    case IntegerKind.I8:
    case IntegerKind.U8:
      return 8;
    case IntegerKind.I16:
    case IntegerKind.U16:
      return 16;
    case IntegerKind.I32:
    case IntegerKind.U32:
    case IntegerKind.ISize:
    case IntegerKind.USize:
      return 32;
    case IntegerKind.I64:
    case IntegerKind.U64:
      return 64;
  }
}

export function getSize(ty: ConcreteType): 1 | 2 | 4 | 8 | 16 {
  switch (ty.kind) {
    case ConcreteTypeKind.Array:
    case ConcreteTypeKind.Nullable:
    case ConcreteTypeKind.Class:
    case ConcreteTypeKind.Str:
    case ConcreteTypeKind.Function:
    case ConcreteTypeKind.Method: {
      return 4;
    }
    case ConcreteTypeKind.Integer: {
      const { integerKind } = ty as IntegerType;
      if (integerKind === IntegerKind.Bool) return 1;
      else return getIntegerBitCount(integerKind) as 1 | 2 | 4 | 8;
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
  node: EnumDeclaration;
  integerKind: IntegerKind.I32;
  name: string;
}

export interface FloatType extends ConcreteType {
  kind: ConcreteTypeKind.Float;
  floatKind: FloatKind;
}

export interface ArrayType extends ConcreteType {
  childType: ConcreteType;
}

export function getLLVMType(
  program: WhackoProgram,
  ty: ConcreteType,
): LLVMTypeRef {
  const { LLVM } = program;

  if (ty.llvmType) return ty.llvmType;

  switch (ty.kind) {
    case ConcreteTypeKind.Nullable:
      // @ts-ignore TODO
      return getLLVMStructType(program, (ty as NullableType).child);
    case ConcreteTypeKind.Class:
      // @ts-ignore TODO
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
      module,
      "type",
      node.name,
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
      module,
      "type",
      node,
      `Type parameter count does not match builtintype type parameter signature.`,
    );
    return null;
  }

  const builtinName = getNameDecoratorValue(node) ?? node.name.name;

  const builtinTypeFunction = assert(
    program.builtinTypeFunctions.get(builtinName),
    `The builtin type definition ${builtinName} for ${getNodeName(
      node,
    )} does not exist.`,
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
    node,
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
  typeParameters: ConcreteType[],
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
      module,
      "type",
      node,
      "Number of type parameters given does not match the declaration.",
    );
    return null;
  }

  const newTypeMap: TypeMap = new Map();
  for (let i = 0; i < typeParameters.length; i++) {
    newTypeMap.set(node.typeParameters[i].name, typeParameters[i]);
  }

  const fields = new Map<string, ConcreteField>();
  // do we have getters?
  for (const member of node.members) {
    if (!isFieldClassMember(member)) continue;

    const field: FieldClassMember = member;

    const type = field.type;
    if (!type) {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        field,
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
        module,
        "type",
        field,
        "Field type failed to resolve.",
      );
      return null;
    }

    fields.set(field.name.name, {
      name: field.name.name,
      node: field,
      type: concreteFieldType,
    });
  }

  return {
    node,
    classConstructor: null,
    llvmType: null,
    methods: new Map(),
    fields,
    kind: ConcreteTypeKind.Class,
    resolvedTypes: newTypeMap,
    typeParameters,
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
        module,
        "type",
        parameterExpression,
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
        concreteTypeParameters,
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
        module,
        "type",
        scopeElement.node,
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
          case "void":
            return theVoidType;
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
            module,
            "type",
            node,
            "Named type could not be resolved",
          );
          return null;
        }
      }
    }
    case "NamedTypeExpression": {
      const node = typeExpression as NamedTypeExpression;
      const relevantScopeElement = traverseScopePath(
        program,
        module,
        scope,
        node.path,
      );

      if (!relevantScopeElement) return null;

      return resolveNamedTypeScopeElement(
        program,
        module,
        relevantScopeElement,
        scope,
        node.typeParameters,
        typeMap,
      );
    }
    case "TupleTypeExpression": {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        typeExpression,
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
            module,
            "type",
            parameter,
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
          module,
          "type",
          functionTypeExpression.returnType,
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

export function getParameterTypes(
  program: WhackoProgram,
  module: WhackoModule,
  parameters: Parameter[],
  scope: Scope,
  typeMap: TypeMap,
): ConcreteType[] | null {
  const parameterTypes = [] as ConcreteType[];
  for (const parameter of parameters) {
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
        module,
        "type",
        parameter.type,
        "Could not resolve parameter",
      );
      return null;
    }
    parameterTypes.push(parameterType);
  }
  return parameterTypes;
}

export function getCallableType(
  program: WhackoProgram,
  module: WhackoModule,
  node:
    | MethodClassMember
    | FunctionDeclaration
    | BuiltinDeclaration
    | DeclareFunction
    | ExternDeclaration,
  thisType: ClassType | null,
  typeParameters: ConcreteType[],
): FunctionType | null {
  const scope = assert(
    getScope(node),
    "The scope for this node must exist at this point.",
  );

  const typeMap: TypeMap = thisType?.resolvedTypes ?? new Map();

  const nodeTypeParameters =
    isDeclareFunction(node) || isExternDeclaration(node)
      ? []
      : node.typeParameters;

  if (typeParameters.length !== nodeTypeParameters.length) {
    reportErrorDiagnostic(
      program,
      module,
      "type",
      node,
      "Number of type parameters does not match function/method signature.",
    );
    return null;
  }

  for (let i = 0; i < nodeTypeParameters.length; i++) {
    typeMap.set(nodeTypeParameters[i].name, typeParameters[i]);
  }

  const parameterTypes = getParameterTypes(
    program,
    module,
    node.parameters,
    scope,
    typeMap,
  );
  if (!parameterTypes) return null;

  let returnType: ConcreteType;

  const maybeReturnType = resolveType(
    program,
    module,
    node.returnType,
    scope,
    typeMap,
  );

  if (!maybeReturnType) {
    reportErrorDiagnostic(
      program,
      module,
      "type",
      node.returnType,
      "Could not resolve return type of function/method",
    );
    return null;
  }

  returnType = maybeReturnType;

  if (isMethodClassMember(node)) {
    // We have an extra branch here in case we forget to initialize MethodType properties
    const result: MethodType = {
      kind: ConcreteTypeKind.Method,
      llvmType: null,
      parameterTypes,
      returnType,
      thisType: assert(thisType),
    };
    return result;
  }

  return {
    kind: ConcreteTypeKind.Function,
    llvmType: null,
    parameterTypes,
    returnType,
  };
}

export function getConstructorType(
  program: WhackoProgram,
  module: WhackoModule,
  thisType: ClassType,
  constructor: ConstructorClassMember | null,
): MethodType | null {
  let parameterTypes: ConcreteType[] = [];

  if (constructor) {
    const scope = assert(getScope(thisType.node));
    const result = getParameterTypes(
      program,
      module,
      constructor.parameters,
      scope,
      thisType.resolvedTypes,
    );
    if (!result) return null;
    parameterTypes = result;
  }

  return {
    kind: ConcreteTypeKind.Method,
    thisType,
    returnType: theVoidType,
    llvmType: null,
    parameterTypes,
  };
}

export function typesEqual(left: ConcreteType, right: ConcreteType): boolean {
  if (left === right) return true;
  if (left.kind !== right.kind) return false;

  switch (left.kind) {
    case ConcreteTypeKind.Integer:
      return (
        (left as IntegerType).integerKind === (right as IntegerType).integerKind
      );
    case ConcreteTypeKind.Float:
      return (left as FloatType).floatKind === (right as FloatType).floatKind;
    case ConcreteTypeKind.V128:
      return (left as V128Type).v128Kind === (right as V128Type).v128Kind;
    case ConcreteTypeKind.Array:
      return typesEqual(
        (left as ArrayType).childType,
        (right as ArrayType).childType,
      );

    case ConcreteTypeKind.Nullable: {
      return typesEqual(
        (left as NullableType).child,
        (right as NullableType).child,
      );
    }
    case ConcreteTypeKind.Void:
    case ConcreteTypeKind.Never:
    case ConcreteTypeKind.Str:
      return true;
    case ConcreteTypeKind.Invalid:
    case ConcreteTypeKind.Function:
    case ConcreteTypeKind.Class:
    case ConcreteTypeKind.Enum:
    case ConcreteTypeKind.Method:
      return false; // cached
  }
}

export const theStrType = {
  kind: ConcreteTypeKind.Str,
  llvmType: null,
};

export function getOperatorOverloadMethod(
  program: WhackoProgram,
  module: WhackoModule,
  lhsType: ConcreteType,
  rhsType: ConcreteType | null,
  op: string,
  operatorNode: AstNode,
): WhackoMethodContext | null {
  if (lhsType.kind !== ConcreteTypeKind.Class) return null;

  const members = (lhsType as ClassType).node.members;

  let methodAst: MethodClassMember | null = null;
  let reportFirstDuplicate = true;
  for (const member of members) {
    if (isMethodClassMember(member)) {
      if (member.typeParameters.length !== 0) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          member.name,
          `TODO: Support generic operator methods.`,
        );
        continue;
      }

      const decorator = member.decorators.find(
        (e) => e.name.name === "operator",
      );
      if (!decorator) continue;
      if (
        decorator.parameters.length !== 1 &&
        isStringLiteral(decorator.parameters[0])
      ) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          decorator,
          `The operator decorator must have a single string parameter.`,
        );
      }

      const operator = (decorator.parameters[0] as StringLiteral).value;

      // Do nothing here, this isn't the overload we're looking for
      if (operator !== op) continue;

      if (methodAst) {
        if (reportFirstDuplicate) {
          reportFirstDuplicate = false;
          reportErrorDiagnostic(
            program,
            module,
            "type",
            methodAst.name,
            `Found duplicate operator method for operator ${op}`,
          );
        }
        reportErrorDiagnostic(
          program,
          module,
          "type",
          member.name,
          `Found duplicate operator method for operator ${op}`,
        );
        continue;
      }

      const typeMap = (lhsType as ClassType).resolvedTypes;
      const scope = assert(
        getScope(member),
        "The scope for this member must exist at this point.",
      );

      const hasParameter = isBinaryExpression(operatorNode);

      // Expected length: 1 for binary overloads, 0 for unary overloads
      if (member.parameters.length !== Number(hasParameter)) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          operatorNode,
          hasParameter
            ? "Binary operator overloads must have one parameter."
            : "Unary operator overloads must have zero parameters.",
        );
        continue;
      }

      const returnType = resolveType(
        program,
        module,
        member.returnType,
        scope,
        typeMap,
      );

      if (!returnType) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          operatorNode,
          "Return type of operator overload could not be resolved.",
        );
        continue;
      }

      if (typesEqual(returnType, theVoidType)) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          operatorNode,
          "Return type of operator overload must not be void.",
        );
      }

      // Binary expressions only
      if (hasParameter) {
        const parameterType = resolveType(
          program,
          module,
          member.parameters[0].type,
          scope,
          typeMap,
        );

        if (!parameterType) {
          reportErrorDiagnostic(
            program,
            module,
            "type",
            member.parameters[0].type,
            `Parameter type of operator ${op} overload could not be resolved.`,
          );
          continue;
        }

        // Do nothing here, this isn't the overload we're looking for
        if (!isAssignable(parameterType, assert(rhsType))) continue;
      }

      methodAst = member;
    }
  }

  if (!methodAst) {
    reportErrorDiagnostic(
      program,
      module,
      "type",
      operatorNode,
      `Could not find valid operator ${op} overload.`,
    );
    return null;
  }

  const result = ensureCallableCompiled(
    program,
    module,
    methodAst,
    lhsType as ClassType,
    [],
    (lhsType as ClassType).resolvedTypes,
  ) as WhackoMethodContext | null;

  assert(
    !result || result.thisType,
    "ensureCallableCompiled did not return a MethodContext",
  );
  return result;
}

export function isAssignable(
  superType: ConcreteType,
  subType: ConcreteType,
): boolean {
  // TODO: Interfaces
  // if (
  //   superType.kind === ConcreteTypeKind.Class &&
  //   subType.kind === ConcreteTypeKind.Class
  // ) {
  //   const superClassType = superType as ClassType;
  //   let accumulator = subType as ClassType | null;

  //   while (accumulator) {
  //     if (typesEqual(superClassType, accumulator)) return true;
  //     accumulator = accumulator.extendsClass;
  //   }

  //   return false;
  // }

  return typesEqual(superType, subType);
}

export function getBinaryOperatorString(op: BinaryOperator): string {
  switch (op) {
    case BinaryOperator.Add:
      return "Add";
    case BinaryOperator.Sub:
      return "Sub";
    case BinaryOperator.Mul:
      return "Mul";
    case BinaryOperator.Div:
      return "Div";
    case BinaryOperator.Exp:
      return "Exp";
    case BinaryOperator.BitwiseAnd:
      return "BitwiseAnd";
    case BinaryOperator.LogicalAnd:
      return "LogicalAnd";
    case BinaryOperator.BitwiseOr:
      return "BitwiseOr";
    case BinaryOperator.LogicalOr:
      return "LogicalOr";
    case BinaryOperator.BitwiseXor:
      return "BitwiseXor";
    case BinaryOperator.Shl:
      return "Shl";
    case BinaryOperator.Eq:
      return "Eq";
    case BinaryOperator.Shr:
      return "Shr";
    case BinaryOperator.Neq:
      return "Neq";
  }
}

export function isNumeric(type: ConcreteType): boolean {
  return (
    type.kind === ConcreteTypeKind.Float ||
    type.kind === ConcreteTypeKind.Integer
  );
}
