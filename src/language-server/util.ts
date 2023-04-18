import { AstNode } from "langium";
import {
  BinaryExpression,
  ID,
  ConstructorClassMember,
  isID,
  isConstructorClassMember,
  Decorator,
  isStringLiteral,
  InterfaceDeclaration,
  ClassDeclaration,
} from "./generated/ast";
import {
  BlockInstruction,
  WhackoFunctionContext,
  CallableFunctionContext,
  BinaryOperator,
} from "./ir";
import { WhackoModule, WhackoProgram } from "./program";
import { getScope } from "./scope";
import { reportErrorDiagnostic } from "./diagnostic";
import {
  ArrayType,
  MethodType,
  EnumType,
  ClassType,
  ConcreteType,
  ConcreteTypeKind,
  theInvalidType,
  FunctionType,
  FloatKind,
  FloatType,
  IntegerType,
  IntegerKind,
  InterfaceType,
  V128Type,
  V128Kind,
  TypeMap,
  typesEqual,
  NullableType,
} from "./types";
import {
  LLVMTypeRef,
  Module as LLVM,
  LLVMValueKind,
  LLVMValueRef,
} from "llvm-js";
import { LLVMUtil } from "./codegen";

import type { LLVMStringRef, Pointer } from "llvm-js";

export function assert<T>(
  condition: T,
  message: string = "No message provided",
) {
  if (!condition) throw new Error(message);
  return condition as NonNullable<T>;
}

export function logNode(node: AstNode) {
  console.log(cleanNode(node));
}

export function cleanNode(node: AstNode): any {
  if (node instanceof Array) return node.map(cleanNode);
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, entry]) => key === "$type" || !key.startsWith("$"))
      .map(([key, obj]) => [
        key,
        (obj?.constructor === Object ? cleanNode(obj) : obj) as any,
      ]),
  );
}

export interface Nameable extends AstNode {
  name: ID;
}

export function getNodeName(node: Nameable | ConstructorClassMember): string {
  let accumulatedName: string = isConstructorClassMember(node)
    ? "constructor"
    : node.name.name;

  const scope = assert(getScope(node), "The scope must exist for this node.");
  const module = assert(scope.module, "The module for this scope must exist.");

  let accumulator: AstNode = node;
  while (accumulator.$container) {
    accumulator = accumulator.$container!;

    if ("name" in accumulator && isID(accumulator.name)) {
      accumulatedName = accumulator.name.name + "." + accumulatedName;
    }
  }

  const result = `[${module.relativePath}]${accumulatedName}`;
  if (scope.module?.relativePath === "std/Box.wo")
    console.log(scope.id, result);
  return result;
}

export function getFullyQualifiedCallableName(
  node: CallableFunctionContext["node"],
  type: FunctionType,
): string {
  return `callable:${getNodeName(node)};${getFullyQualifiedTypeName(type)}`;
}

export function getFullyQualifiedTypeName(type: ConcreteType): string {
  switch (type.kind) {
    case ConcreteTypeKind.UnresolvedFunction:
      return `unresolvedFunction`;
    case ConcreteTypeKind.Nullable: {
      return `nullableType:${getFullyQualifiedTypeName(
        (type as NullableType).child,
      )}`;
    }
    case ConcreteTypeKind.Class: {
      const cast = type as ClassType;
      return getFullyQualifiedClassName(cast.node, cast.typeParameters);
    }
    case ConcreteTypeKind.Enum: {
      const enumType = type as EnumType;
      return `enumType:${getNodeName(enumType.node)}`;
    }
    case ConcreteTypeKind.Function: {
      const functionType = type as FunctionType;
      const parameterTypes = functionType.parameterTypes
        .map(getFullyQualifiedTypeName)
        .join(",");
      const returnType = getFullyQualifiedTypeName(functionType.returnType);
      return `functionType:(${parameterTypes})=>${returnType}`;
    }
    case ConcreteTypeKind.Method: {
      const methodType = type as MethodType;
      const thisTypeName = getFullyQualifiedTypeName(methodType.thisType);
      const parameterTypes = methodType.parameterTypes
        .map(getFullyQualifiedTypeName)
        .join(",");
      const returnType = getFullyQualifiedTypeName(methodType.returnType);
      return `methodType:${thisTypeName}#(${parameterTypes})=>${returnType}`;
    }
    case ConcreteTypeKind.Array: {
      const arrayType = type as ArrayType;
      const childType = getFullyQualifiedTypeName(arrayType.childType);
      return `arrayType:${childType}`;
    }
    case ConcreteTypeKind.Float: {
      const floatKind =
        (type as FloatType).floatKind === FloatKind.F64 ? "f64" : "f32";
      return `${floatKind}Type`;
    }
    case ConcreteTypeKind.Integer: {
      const integerKind = (type as IntegerType).integerKind;
      let integerKindName: string;

      switch (integerKind) {
        case IntegerKind.Bool:
          integerKindName = "bool";
          break;
        case IntegerKind.I8:
          integerKindName = "i8";
          break;
        case IntegerKind.U8:
          integerKindName = "u8";
          break;
        case IntegerKind.I16:
          integerKindName = "i16";
          break;
        case IntegerKind.U16:
          integerKindName = "u16";
          break;
        case IntegerKind.I32:
          integerKindName = "i32";
          break;
        case IntegerKind.U32:
          integerKindName = "u32";
          break;
        case IntegerKind.I64:
          integerKindName = "i64";
          break;
        case IntegerKind.U64:
          integerKindName = "u64";
          break;
        case IntegerKind.ISize:
          integerKindName = "isize";
          break;
        case IntegerKind.USize:
          integerKindName = "usize";
          break;
      }

      return `${integerKindName}Type`;
    }
    case ConcreteTypeKind.V128: {
      const v128Type = type as V128Type;
      const kind = v128Type.v128Kind;
      let v128Kind: string;
      switch (kind) {
        case V128Kind.I8x16:
          v128Kind = "i8x16";
          break;
        case V128Kind.U8x16:
          v128Kind = "u8x16";
          break;
        case V128Kind.I16x8:
          v128Kind = "i16x8";
          break;
        case V128Kind.U16x8:
          v128Kind = "u16x8";
          break;
        case V128Kind.I32x4:
          v128Kind = "i32x4";
          break;
        case V128Kind.U32x4:
          v128Kind = "u32x4";
          break;
        case V128Kind.F32x4:
          v128Kind = "f32x4";
          break;
        case V128Kind.I64x2:
          v128Kind = "i64x2";
          break;
        case V128Kind.U64x2:
          v128Kind = "u64x2";
          break;
        case V128Kind.F64x2:
          v128Kind = "f64x2";
          break;
      }
      return `${v128Kind}Type`;
    }
    case ConcreteTypeKind.Never: {
      return `neverType`;
    }
    case ConcreteTypeKind.Void: {
      return "voidType";
    }
    case ConcreteTypeKind.Interface: {
      const interfaceType = type as InterfaceType;
      return getFullyQualifiedInterfaceName(
        interfaceType.node,
        interfaceType.typeParameters,
      );
    }
    case ConcreteTypeKind.Null:
      return "nullType";
    case ConcreteTypeKind.Invalid:
      return "invalidType";
    case ConcreteTypeKind.Pointer:
      return "ptrType";
  }
}

export function getFullyQualifiedClassName(
  node: ClassDeclaration,
  typeParameters: ConcreteType[],
): string {
  // const classType = type as ClassType;
  const typeParametersResult = typeParameters
    .map(getFullyQualifiedTypeName)
    .join(",");
  return `classType:${getNodeName(node)}<${typeParametersResult}>`;
}

export function getFullyQualifiedInterfaceName(
  node: InterfaceDeclaration,
  typeParameters: ConcreteType[],
) {
  const typeParametersResult = typeParameters
    .map(getFullyQualifiedTypeName)
    .join(",");
  return `interfaceType:${getNodeName(node)}<${typeParametersResult}>`;
}

export function isAssignmentOperator(node: BinaryExpression): boolean {
  switch (node.op) {
    case "=":
    case "+=":
    case "-=":
    case "**=":
    case "*=":
    case "/=":
    case "%=":
    case "<<=":
    case ">>=":
    case ">>>=":
    case "&=":
    case "^=":
    case "|=":
    case "&&=":
    case "||=":
    case "??=":
      return true;
    default:
      return false;
  }
}

export function UNREACHABLE(message?: string): never {
  return assert(false, message) as never;
}

interface Decorated {
  decorators: Decorator[];
}

export function getNameDecoratorValue(declaration: Decorated): string | null {
  // Ensure there are no duplicates
  const relevantDecorators = declaration.decorators.filter(
    (decorator) => decorator.name.name === "name",
  );
  if (relevantDecorators.length !== 1) return null;

  const [decorator] = relevantDecorators;
  if (decorator.parameters.length !== 1) return null;

  const [parameter] = decorator.parameters;
  if (!isStringLiteral(parameter)) return null;

  return parameter.value;
}

export function assertIsBinaryOpString(op: string): BinaryOpString {
  switch (op as BinaryOpString) {
    case "+":
    case "+=":
    case "-":
    case "-=":
    case "*":
    case "*=":
    case "/":
    case "/=":
    case "**":
    case "**=":
    case "&":
    case "&=":
    case "&&":
    case "&&=":
    case "|":
    case "|=":
    case "||":
    case "||=":
    case "^":
    case "^=":
    case "<<=":
    case "<<":
    case ">>=":
    case ">>":
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return op as BinaryOpString;
    default:
      UNREACHABLE(`Binary operator string ${op} is not valid.`);
  }
}

export function getBinaryOperatorString(op: BinaryOperator): string {
  switch (op) {
    case BinaryOperator.Add:
      return "+";
    case BinaryOperator.Sub:
      return "-";
    case BinaryOperator.Mul:
      return "*";
    case BinaryOperator.Div:
      return "/";
    case BinaryOperator.BitwiseAnd:
      return "&";
    case BinaryOperator.BitwiseOr:
      return "|";
    case BinaryOperator.BitwiseXor:
      return "^";
    case BinaryOperator.Shl:
      return "<<";
    case BinaryOperator.Eq:
      return "==";
    case BinaryOperator.Shr:
      return ">>";
    case BinaryOperator.Neq:
      return "!=";
    case BinaryOperator.Gt:
      return ">";
    case BinaryOperator.Gte:
      return ">=";
    case BinaryOperator.Lt:
      return "<";
    case BinaryOperator.Lte:
      return "<=";
  }
}

export function stringOpToEnum(op: BinaryOpString): BinaryOperator {
  switch (op) {
    case "+":
    case "+=": {
      return BinaryOperator.Add;
    }
    case "-":
    case "-=": {
      return BinaryOperator.Sub;
    }
    case "*":
    case "*=": {
      return BinaryOperator.Mul;
    }
    case "/":
    case "/=": {
      return BinaryOperator.Div;
    }
    case "**":
    case "**=": {
      UNREACHABLE(
        "Exponentiation must be handled separately as a function call",
      );
    }
    case "&":
    case "&=": {
      return BinaryOperator.BitwiseAnd;
    }
    case "&&":
    case "&&=":
    case "||":
    case "||=": {
      UNREACHABLE(
        "Logical AND/OR must be handled separately as a set of instructions",
      );
    }
    case "|":
    case "|=": {
      return BinaryOperator.BitwiseOr;
    }
    case "^":
    case "^=": {
      return BinaryOperator.BitwiseXor;
    }
    case "<<=":
    case "<<": {
      return BinaryOperator.Shl;
    }
    case ">>=":
    case ">>": {
      return BinaryOperator.Shr;
    }
    case "==": {
      return BinaryOperator.Eq;
    }
    case "!=": {
      return BinaryOperator.Neq;
    }
    case "<": {
      return BinaryOperator.Lt;
    }
    case "<=": {
      return BinaryOperator.Lte;
    }
    case ">": {
      return BinaryOperator.Gt;
    }
    case ">=": {
      return BinaryOperator.Gte;
    }
  }
}

export function getElementName<T extends AstNode & { name?: ID }>(
  element: T,
): string {
  let name = element.name?.name ?? "";
  while ((element = element.$container as T)) {
    name = element.name ? element.name.name + "." + name : name;
  }
  return name;
}

export type BinaryOpString =
  | "+"
  | "+="
  | "-"
  | "-="
  | "*"
  | "*="
  | "/"
  | "/="
  | "**"
  | "**="
  | "&"
  | "&="
  | "&&"
  | "&&="
  | "|"
  | "|="
  | "||"
  | "||="
  | "^"
  | "^="
  | "<<="
  | "<<"
  | ">>="
  | ">>"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">=";

export const I64_MIN = -(2n ** 63n);
export const I64_MAX = 2n ** 63n - 1n;
export const U64_MAX = 2n ** 64n - 1n;

export const idCounter = {
  value: 0,
};

export interface LLVMJSUtil {
  _main(argc: number, argv: Pointer<LLVMStringRef[]>): number;
  _free(ptr: number): void;
  _malloc<T>(size: number): Pointer<T>;
  stringToUTF8<T>(value: string, ptr: Pointer<T>, size: number): void;
  FS: {
    readFile(...args: any[]): any;
    writeFile(...args: any[]): any;
    chmod(...args: any[]): any;
  };
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
}

export function lowerStringArray(mod: LLVMJSUtil, args: string[]) {
  const ptrs = [] as LLVMStringRef[];

  for (const arg of args) {
    const size = Buffer.byteLength(arg) + 1;
    const ptr = mod._malloc<"LLVMStringRef">(size);
    ptrs.push(ptr);
    mod.stringToUTF8(arg, ptr, size);
  }

  const arraySize = args.length * 4 + 1;
  // but that's in llvm-js
  const arrayPtr = mod._malloc<LLVMStringRef[]>(arraySize);
  for (let i = 0; i < ptrs.length; i++) {
    const ptr = ptrs[i];
    mod.HEAPU32[(arrayPtr >>> 2) + i] = ptr;
  }

  return { ptrs, arrayPtr };
}

export function logLLVMType(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  type: LLVMTypeRef,
): void {
  const allocaTypeStr = LLVM._LLVMPrintTypeToString(type);
  console.log(LLVMUtil.lift(allocaTypeStr));
  LLVM._free(allocaTypeStr);
}

export function logLLVMValue(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  val: LLVMValueRef,
): void {
  const allocaTypeStr = LLVM._LLVMPrintValueToString(val);
  console.log(LLVMUtil.lift(allocaTypeStr));
  LLVM._free(allocaTypeStr);
}

export function hasDecorator(node: Decorated, name: string): boolean {
  return !!node.decorators.find((e) => e.name.name === name);
}
