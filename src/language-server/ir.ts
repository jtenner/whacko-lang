import { AstNode } from "langium";
import { LLVMBasicBlockRef, LLVMValueRef, Module } from "llvm-js";
import { reportErrorDiagnostic } from "./diagnostic";
import {
  ConstructorClassMember,
  DeclareDeclaration,
  DeclareFunction,
  ExternDeclaration,
  FunctionDeclaration,
  ID,
  MethodClassMember,
  isParameter,
  isThisLiteral,
  isVariableDeclarator,
} from "./generated/ast";
import { WhackoModule, WhackoProgram } from "./program";
import { getElementInScope, getScope, ScopeElement } from "./scope";
import {
  ClassType,
  ConcreteType,
  ConcreteTypeKind,
  FloatKind,
  FloatType,
  InvalidType,
  FunctionType,
  getFloatType,
  getIntegerType,
  theStrType,
  IntegerKind,
  IntegerType,
  isSignedIntegerKind,
  MethodType,
  theInvalidType,
  TypeMap,
  ConcreteField,
  getIntegerBitCount,
  NullType,
  theNullType,
  isNumeric,
  VoidType,
  theVoidType,
} from "./types";
import {
  assert,
  getFullyQualifiedCallableName,
  getFullyQualifiedTypeName,
  getNameDecoratorValue,
  idCounter,
  logNode,
  UNREACHABLE,
  ConstructorSentinel,
  getElementName,
  getBinaryOperatorString,
} from "./util";

export const enum ComptimeConditional {
  Truthy,
  Falsy,
  Runtime,
}

export const enum BinaryOperator {
  Add,
  Sub,
  Mul,
  Div,
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  Shl,
  Eq,
  Shr,
  Neq,
}

export const enum InstructionKind {
  Unset,
  Const,
  Br,
  BrIf,
  Invalid,
  Binary,
  Alloca,
  Unreachable,
  New,
  Call,
  IntegerCast,
  FloatCast,
  Load,
  Store,
  LogicalNot,
  BitwiseNot,
  Negate,
  Return,
}

export const enum ValueKind {
  Invalid,
  Void,
  Null,
  Integer,
  Float,
  Str,
  ScopeElement,
  Method,
  Field,
  ConcreteFunction,
  Variable, // includes parameters
  Runtime,
}

export interface Value {
  kind: ValueKind;
  type: ConcreteType | null;
}

export interface UntypedValue extends Value {
  type: null;
}

export interface TypedValue extends Value {
  type: ConcreteType;
}

export interface RuntimeValue extends TypedValue {
  kind: ValueKind.Runtime;
  instruction: string; // Corresponds to a BlockInstruction
  valueRef: LLVMValueRef | null;
}

export interface StackAllocationSite {
  immutable: boolean;
  type: ConcreteType;
  ref: LLVMValueRef | null;
  node: AstNode;
}

export interface CallableFunctionContext {
  /** The llvm name of the function. */
  name: string;

  /** Instruction and label ID counter for temporary names and ID generation. */
  id: number;

  /** List of function attributes used for codegen */
  attributes: { name: string; value: string }[];

  /** The LLVM function ref. */
  funcRef: LLVMValueRef | null;

  /** The function type for this function context. */
  type: FunctionType;

  /** The module in which this function is located. */
  module: WhackoModule;

  /** The node that generated the callable. */
  node:
    | ConstructorClassMember
    | FunctionDeclaration
    | MethodClassMember
    | DeclareFunction
    | ExternDeclaration;

  /** Whether this function contains Whacko code */
  isWhackoFunction: boolean;

  /** Whether this function is a class method, or a constructor. */
  isWhackoMethod: boolean;
}

export interface WhackoFunctionContext extends CallableFunctionContext {
  /** A map of label banes to their label. */
  blocks: Map<string, BlockContext>;

  /** An array of all the labels in a function. */
  entry: BlockContext | null;

  /** A map of instruction names to their label instruction. */
  instructions: Map<string, BlockInstruction>;

  /** A map of AstNodes to stack pointers */
  stackAllocationSites: Map<AstNode, StackAllocationSite>;

  /** The llvm function ref. */
  funcRef: LLVMValueRef | null;

  /** The already resolved types for this function. */
  typeMap: TypeMap;

  /** If this is a whacko function. */
  isWhackoFunction: true;
}

export interface WhackoMethodContext extends WhackoFunctionContext {
  /** The method type for this method context. */
  type: MethodType;

  /** The `this` type of this method. */
  thisType: ClassType;
}

export interface BlockContext {
  /** The ID of this label. */
  id: number;
  /** The name of this label. */
  name: string;
  /** An array of all the instructions for this label. */
  instructions: BlockInstruction[];
  /** All of the labels that must be created for the instructions to generate codegen. */
  children: BlockContext[];
  /** Label terminator. */
  terminator: BlockInstruction | null;
  /** The llvm block ref */
  llvmBlock: LLVMBasicBlockRef | null;
}

export interface BlockInstruction {
  /** The instruction id. */
  id: number;
  /** The LLVMValueRef associated with this instruction. */
  ref: LLVMValueRef | null;
  /** The name of this instruction. */
  name: string;
  /** The type of this instruction. */
  kind: InstructionKind;
  /** The concrete type of this instruction. */
  type: ConcreteType | null;
}

export interface TypedBlockInstruction extends BlockInstruction {
  type: ConcreteType;
}

export interface UntypedBlockInstruction extends BlockInstruction {
  type: null;
}

export interface BinaryInstruction extends TypedBlockInstruction {
  /** Left hand side of the operation. */
  lhs: RuntimeValue;
  /** Right hand side of the operation. */
  rhs: RuntimeValue;
  /** Binary operation being performed. */
  op: BinaryOperator;
}

export function buildFunction(type: ConcreteType): WhackoFunctionContext {
  const result = {
    entry: null,
    funcRef: null,
    id: 0,
    instructions: new Map(),
    blocks: new Map(),
    type,
  } as WhackoFunctionContext;

  const entry = buildLabel(result, null);
  result.entry = entry;
  return result;
}

export function buildLabel(
  func: WhackoFunctionContext,
  parent: BlockContext | null,
): BlockContext {
  // okay, I'll fix that
  const id = idCounter.value++;
  const name = `${id}~label`;

  const label = {
    llvmBlock: null,
    children: [],
    id,
    instructions: [],
    name,
    terminator: null,
  } as BlockContext;

  if (parent) {
    parent.children.push(label);
  } else {
    assert(
      !func.entry,
      "Tried to set the entry label to a function that aleady has one.",
    );
    func.entry = label;
  }

  func.blocks.set(name, label);
  return label;
}

type ExtendedBlockInstructionFields<T extends BlockInstruction> = {
  [U in keyof T as U extends keyof BlockInstruction ? never : U]: T[U];
};

export function buildInstruction<T extends BlockInstruction>(
  func: WhackoFunctionContext,
  currentBlock: BlockContext,
  type: T["type"],
  instructionKind: T["kind"],
  others: Partial<BlockInstruction> & ExtendedBlockInstructionFields<T>,
): T {
  const id = idCounter.value++;
  const name = `${id}~inst`;
  const inst = {
    id,
    kind: instructionKind,
    name,
    ref: null,
    type,
    ...others,
  } as T;

  func.instructions.set(name, inst);
  currentBlock.instructions.push(inst);
  return inst;
}

export function buildBinaryInstruction(
  func: WhackoFunctionContext,
  block: BlockContext,
  lhs: RuntimeValue,
  op: BinaryOperator,
  rhs: RuntimeValue,
): BinaryInstruction {
  const inst = buildInstruction(func, block, lhs.type, InstructionKind.Binary, {
    lhs,
    op,
    rhs,
  }) as BinaryInstruction;
  return inst;
}

export function buildUnreachable(
  func: WhackoFunctionContext,
  currentBlock: BlockContext,
): BlockInstruction {
  const inst = buildInstruction(
    func,
    currentBlock,
    {
      kind: ConcreteTypeKind.Never,
      llvmType: null,
    },
    InstructionKind.Unreachable,
    {},
  );
  assert(
    !currentBlock.terminator,
    "Tried to build unreachable with a block that already has a terminator.",
  );
  currentBlock.terminator = inst;
  return inst;
}

export interface ConstIntegerValue extends TypedValue {
  kind: ValueKind.Integer;
  type: IntegerType;
  value: bigint;
}

export function createIntegerValue(
  value: bigint,
  type: IntegerType,
): ConstIntegerValue {
  return {
    kind: ValueKind.Integer,
    type,
    value,
  };
}

export interface ConstFloatValue extends TypedValue {
  kind: ValueKind.Float;
  type: FloatType;
  value: number;
}

export function createFloatValue(
  value: number,
  type: FloatType,
): ConstFloatValue {
  return {
    kind: ValueKind.Float,
    type,
    value,
  };
}

export interface ConstStrValue extends TypedValue {
  kind: ValueKind.Str;
  value: string;
}

export function createStrValue(value: string, type: FloatType): ConstStrValue {
  return {
    kind: ValueKind.Str,
    type,
    value,
  };
}

interface NullValue extends TypedValue {
  kind: ValueKind.Null;
  type: NullType;
}

export const theNullValue: NullValue = {
  kind: ValueKind.Null,
  type: theNullType,
};

export interface InvalidValue extends TypedValue {
  kind: ValueKind.Invalid;
  type: InvalidType;
}

export interface VoidValue extends TypedValue {
  kind: ValueKind.Void;
  type: VoidType;
}

export const theInvalidValue: InvalidValue = {
  kind: ValueKind.Invalid,
  type: theInvalidType,
};

export const theVoidValue: VoidValue = {
  kind: ValueKind.Void,
  type: theVoidType,
};

export interface ScopeElementValue extends UntypedValue {
  kind: ValueKind.ScopeElement;
  element: ScopeElement;
}

export function createScopeElement(element: ScopeElement): ScopeElementValue {
  return {
    element,
    kind: ValueKind.ScopeElement,
    type: null,
  };
}

export function isCompileTimeValue(value: Value): boolean {
  return value.kind !== ValueKind.Runtime;
}

export interface CallInstruction extends TypedBlockInstruction {
  kind: InstructionKind.Call;
  callee: CallableFunctionContext;
  args: RuntimeValue[];
}

export function buildCallInstruction(
  caller: WhackoFunctionContext,
  currentBlock: BlockContext,
  callee: CallableFunctionContext,
  args: RuntimeValue[],
): CallInstruction {
  const insn: CallInstruction = buildInstruction(
    caller,
    currentBlock,
    callee.type.returnType,
    InstructionKind.Call,
    {
      callee,
      args,
    },
  );
  return insn;
}

export function buildBasicBlock(
  ctx: WhackoFunctionContext,
  blockName: string,
): BlockContext {
  const id = idCounter.value++;
  const name = `${blockName}~${id}`;
  const block = {
    llvmBlock: null,
    children: [],
    id,
    instructions: [],
    name,
    terminator: null,
  };
  assert(
    !ctx.blocks.has(name),
    `Block named '${name}' already exists in function context.`,
  );
  ctx.blocks.set(name, block);
  return block;
}

export function buildDeclareFunction(
  program: WhackoProgram,
  module: WhackoModule,
  type: FunctionType,
  declaration: DeclareFunction,
): CallableFunctionContext {
  const functionName = declaration.name.name;
  const moduleName = declaration.$container.namespace.value;

  const name = getFullyQualifiedCallableName(declaration, type);

  if (program.functions.has(name)) return program.functions.get(name)!;

  const result: CallableFunctionContext = {
    attributes: [
      { name: "wasm-import-module", value: functionName },
      { name: "wasm-import-name", value: moduleName },
    ],
    funcRef: null,
    id: idCounter.value++,
    isWhackoFunction: false,
    isWhackoMethod: false,
    module,
    name,
    node: declaration,
    type,
  };
  program.functions.set(name, result);
  return result;
}

export function buildExternFunction(
  program: WhackoProgram,
  module: WhackoModule,
  type: FunctionType,
  declaration: ExternDeclaration,
): CallableFunctionContext {
  const name = getNameDecoratorValue(declaration) ?? declaration.name.name;
  if (program.functions.has(name)) return program.functions.get(name)!;

  const result = {
    attributes: [],
    funcRef: null,
    id: idCounter.value++,
    isWhackoFunction: false,
    isWhackoMethod: false,
    module,
    node: declaration,
    name,
    type,
  };
  program.functions.set(name, result);
  return result;
}

export interface IntegerCastInstruction extends TypedBlockInstruction {
  kind: InstructionKind.IntegerCast;
  type: IntegerType;
  value: RuntimeValue;
}

export function buildIntCastInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  value: RuntimeValue,
  type: IntegerType,
): IntegerCastInstruction {
  return buildInstruction(
    ctx,
    currentBlock,
    type,
    InstructionKind.IntegerCast,
    {
      value,
    },
  );
}

export interface FloatCastInstruction extends TypedBlockInstruction {
  kind: InstructionKind.FloatCast;
  type: FloatType;
  value: RuntimeValue;
}

export function buildFloatCastInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  value: RuntimeValue,
  type: FloatType,
): FloatCastInstruction {
  return buildInstruction(ctx, currentBlock, type, InstructionKind.FloatCast, {
    value,
  });
}

export interface LoadInstruction extends TypedBlockInstruction {
  kind: InstructionKind.Load;
  source: FieldReferenceValue | VariableReferenceValue;
}

export function buildLoadInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  source: LoadInstruction["source"],
): LoadInstruction {
  return buildInstruction(
    ctx,
    currentBlock,
    source.type,
    InstructionKind.Load,
    {
      source,
    },
  );
}

export interface StoreInstruction extends UntypedBlockInstruction {
  kind: InstructionKind.Store;
  target: FieldReferenceValue | VariableReferenceValue;
  value: RuntimeValue;
}

export function buildStoreInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  target: StoreInstruction["target"],
  value: RuntimeValue,
): StoreInstruction {
  return buildInstruction(ctx, currentBlock, null, InstructionKind.Store, {
    target,
    value,
  });
}

export interface NewInstruction extends TypedBlockInstruction {
  kind: InstructionKind.New;
  type: ClassType;
}

export function buildNewInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  classType: ClassType,
): NewInstruction {
  return buildInstruction(
    ctx,
    currentBlock,
    classType,
    InstructionKind.New,
    {},
  );
}

export interface AllocaInstruction extends TypedBlockInstruction {
  kind: InstructionKind.Alloca;
  type: ClassType;
}

// This should only be used as a builtin.
export function buildAllocaInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  classType: ClassType,
): AllocaInstruction {
  return buildInstruction(
    ctx,
    currentBlock,
    classType,
    InstructionKind.Alloca,
    {},
  );
}

export interface ConcreteFunctionReferenceValue extends TypedValue {
  kind: ValueKind.ConcreteFunction;
  type: FunctionType;
  target: CallableFunctionContext;
}

export function createFunctionReference(
  target: CallableFunctionContext,
): ConcreteFunctionReferenceValue {
  assert(
    !target.isWhackoMethod,
    "Function reference instructions must not contain method contexts",
  );
  return {
    kind: ValueKind.ConcreteFunction,
    type: target.type,
    target,
  };
}

export interface MethodReferenceValue extends UntypedValue {
  kind: ValueKind.Method;
  thisValue: RuntimeValue;
  target: MethodClassMember;
}

export function buildMethodReference(
  thisValue: RuntimeValue,
  target: MethodClassMember,
): MethodReferenceValue {
  return {
    kind: ValueKind.Method,
    target,
    thisValue,
    type: null,
  };
}

export interface FieldReferenceValue extends TypedValue {
  kind: ValueKind.Field;
  thisValue: TypedValue;
  field: ConcreteField;
}

export function createFieldReference(
  thisValue: TypedValue,
  field: ConcreteField,
): FieldReferenceValue {
  return {
    field,
    kind: ValueKind.Field,
    thisValue,
    type: field.type,
  };
}

export interface VariableReferenceValue extends TypedValue {
  kind: ValueKind.Variable;
  variable: StackAllocationSite;
}

export function createVariableReference(
  variable: StackAllocationSite,
): VariableReferenceValue {
  return {
    kind: ValueKind.Variable,
    type: variable.type,
    variable,
  };
}

export interface LogicalNotInstruction extends TypedBlockInstruction {
  kind: InstructionKind.LogicalNot;
  type: IntegerType & { integerKind: IntegerKind.Bool };
  operand: RuntimeValue;
}

export function buildLogicalNotInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  operand: RuntimeValue,
): LogicalNotInstruction {
  return buildInstruction(
    ctx,
    currentBlock,
    getIntegerType(IntegerKind.Bool) as IntegerType & {
      integerKind: IntegerKind.Bool;
    },
    InstructionKind.LogicalNot,
    {
      operand,
    },
  );
}

export interface NegateInstruction extends TypedBlockInstruction {
  kind: InstructionKind.Negate;
  type: IntegerType | FloatType;
  operand: RuntimeValue;
}

export function buildNegateInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  operand: RuntimeValue,
): NegateInstruction {
  assert(isNumeric(operand.type));
  return buildInstruction(
    ctx,
    currentBlock,
    operand.type as IntegerType | FloatType,
    InstructionKind.Negate,
    {
      operand,
    },
  );
}

export interface BitwiseNotInstruction extends TypedBlockInstruction {
  kind: InstructionKind.BitwiseNot;
  operand: RuntimeValue;
}

export function buildBitwiseNotInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  operand: RuntimeValue,
): BitwiseNotInstruction {
  return buildInstruction(
    ctx,
    currentBlock,
    getIntegerType(IntegerKind.Bool),
    InstructionKind.BitwiseNot,
    {
      operand,
    },
  );
}

export function createRuntimeValue(
  { type, name }: BlockInstruction,
  maybeType: ConcreteType | null = null,
): RuntimeValue {
  return {
    type: assert(maybeType ?? type),
    instruction: assert(name),
    kind: ValueKind.Runtime,
    valueRef: null,
  };
}

export function asComptimeConditional(value: Value): ComptimeConditional {
  switch (value.kind) {
    case ValueKind.Void:
      UNREACHABLE(
        "Void cannot be a comptime conditional. Did you mess up somewhere?",
      );
    case ValueKind.Invalid:
      return ComptimeConditional.Runtime;
    case ValueKind.Null:
      return ComptimeConditional.Falsy;
    case ValueKind.Integer:
      return (value as ConstIntegerValue).value
        ? ComptimeConditional.Truthy
        : ComptimeConditional.Falsy;
    case ValueKind.Float:
      return (value as ConstFloatValue).value
        ? ComptimeConditional.Truthy
        : ComptimeConditional.Falsy;
    case ValueKind.Str:
      return ComptimeConditional.Truthy;
    case ValueKind.ScopeElement:
      return ComptimeConditional.Runtime;
    case ValueKind.Method:
      return ComptimeConditional.Runtime;
    case ValueKind.Field:
      return ComptimeConditional.Runtime;
    case ValueKind.ConcreteFunction:
      return ComptimeConditional.Runtime;
    case ValueKind.Variable:
      return ComptimeConditional.Runtime;
    case ValueKind.Runtime:
      return ComptimeConditional.Runtime;
  }
}

export interface BrInstruction extends UntypedBlockInstruction {
  kind: InstructionKind.Br;
  target: string;
}

export function buildBrInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  target: BlockContext,
): BrInstruction {
  assert(
    !currentBlock.terminator,
    "Block was already terminated! WEE WOO WEE WOO!",
  );
  const instruction: BrInstruction = buildInstruction(
    ctx,
    currentBlock,
    null,
    InstructionKind.Br,
    {
      target: target.name,
    },
  );
  return (currentBlock.terminator = instruction);
}

export interface BrIfInstruction extends UntypedBlockInstruction {
  kind: InstructionKind.BrIf;
  condition: RuntimeValue;
  truthy: string;
  falsy: string;
}

export function buildBrIfInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  condition: RuntimeValue,
  truthy: BlockContext,
  falsy: BlockContext,
): BrIfInstruction {
  assert(
    !currentBlock.terminator,
    "Block was already terminated! WEE WOO WEE WOO!",
  );
  const instruction: BrIfInstruction = buildInstruction(
    ctx,
    currentBlock,
    null,
    InstructionKind.BrIf,
    {
      condition,
      truthy: truthy.name,
      falsy: falsy.name,
    },
  );
  return (currentBlock.terminator = instruction);
}

export type ComptimeValue =
  | ConstFloatValue
  | ConstIntegerValue
  | ConstStrValue
  | NullValue
  | InvalidValue
  | ConcreteFunctionReferenceValue;

export function ensureRuntime(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  value: Value,
): RuntimeValue {
  value = ensureDereferenced(ctx, currentBlock, value);
  switch (value.kind) {
    case ValueKind.Runtime:
      return value as RuntimeValue;
    case ValueKind.Float:
      return createRuntimeValue(
        buildConstInstruction(ctx, currentBlock, value as ConstFloatValue),
      );
    case ValueKind.Integer:
      return createRuntimeValue(
        buildConstInstruction(ctx, currentBlock, value as ConstIntegerValue),
      );
    case ValueKind.Invalid:
      UNREACHABLE(
        "ensureRuntime: invalid values should not be used at runtime",
      );
    case ValueKind.Null:
      return createRuntimeValue(
        buildConstInstruction(ctx, currentBlock, value as NullValue),
      );
    case ValueKind.Str:
      return createRuntimeValue(
        buildConstInstruction(ctx, currentBlock, value as ConstStrValue),
      );
    case ValueKind.ScopeElement:
      UNREACHABLE(
        "ensureRuntime: scope elements should not be used at runtime",
      );
    case ValueKind.Method:
      UNREACHABLE("ensureRuntime: methods cannot be used at runtime");
    case ValueKind.Field:
      UNREACHABLE("ensureRuntime: fields should have been dereferenced");
    case ValueKind.ConcreteFunction: {
      // Let codegen deal with it
      // We literally pass the Value to codegen
      // Hm, we need that ConcreteFunctionReferenceValue thingy
      // Yeah, the name
      // In the end, this is what we want, but we need to rename this to ConcreteFunctionReferenceValu
      return createRuntimeValue(
        buildConstInstruction(
          ctx,
          currentBlock,
          value as ConcreteFunctionReferenceValue,
        ),
      );
    }
    case ValueKind.Variable:
      UNREACHABLE("ensureRuntime: variables should have been dereferenced");
    default:
  }
  const type = value.type;

  UNREACHABLE("TODO: ensureRuntime");
}

export interface ConstInstruction extends TypedBlockInstruction {
  kind: InstructionKind.Const;
  child: ComptimeValue;
}

export function buildConstInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  child: ComptimeValue,
): ConstInstruction {
  const inst = buildInstruction<ConstInstruction>(
    ctx,
    currentBlock,
    child.type,
    InstructionKind.Const,
    { child },
  );
  return inst;
}

export interface ReturnInstruction extends BlockInstruction {
  kind: InstructionKind.Return;
  value: TypedValue;
}

export function buildReturnInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  value: TypedValue,
): ReturnInstruction {
  assert(
    !currentBlock.terminator,
    "Block was already terminated! WEE WOO WEE WOO!",
  );
  const inst = buildInstruction<ReturnInstruction>(
    ctx,
    currentBlock,
    value.type,
    InstructionKind.Return,
    {
      value,
    },
  );
  currentBlock.terminator = inst;
  return inst;
}

export function printProgramToString(prg: WhackoProgram): string {
  let result = `program:\n`;

  for (const [name, func] of prg.functions) {
    result += "  " + printFunctionContextToString(func) + "\n";
  }
  return result;
}

export function printFunctionContextToString(
  ctx: CallableFunctionContext,
): string {
  let result = getFullyQualifiedCallableName(ctx.node, ctx.type) + "\n";

  if (ctx.isWhackoFunction) {
    const func = ctx as WhackoFunctionContext;
    for (const block of func.blocks.values()) {
      result += printBlockToString(block);
    }
  } else {
    result += "    (extern or declare function)\n";
  }
  return result;
}

export function printBlockToString(block: BlockContext): string {
  let result = `    block: ${block.name}\n`;

  for (const inst of block.instructions) {
    result += printInstructionToString(inst) + "\n";
  }

  return result;
}

export function getValueString(value: Value): string {
  switch (value.kind) {
    case ValueKind.Void:
      // void has no value, but really this is okay
      return "(void value)";
    case ValueKind.Invalid:
      return "(invalid value)";
    case ValueKind.Null:
      return "(null value)";
    // TODO: https://www.npmjs.com/package/js-string-escape
    case ValueKind.Integer: {
      const integerValue = value as ConstIntegerValue;
      const integerKind = integerValue.type.integerKind;
      return `(${
        isSignedIntegerKind(integerKind) ? "i" : "u"
      }${getIntegerBitCount(integerKind)} ${integerValue.value})`;
    }
    case ValueKind.Float: {
      const floatValue = value as ConstFloatValue;
      return `(f${floatValue.type.floatKind === FloatKind.F32 ? "32" : "64"} ${
        floatValue.value
      })`;
    }
    case ValueKind.Str: {
      const strValue = value as ConstStrValue;
      return `(str "${strValue.value}")`;
    }
    // can be used as callbacks and in variables
    // case ValueKind.ConcreteFunction: {
    case ValueKind.ScopeElement:
    case ValueKind.Method:
    // case ValueKind.UnresolvedFunction:
    case ValueKind.ConcreteFunction: // TODO: Remove
      UNREACHABLE("WE HIT SOMETHING THAT SHOULDN'T BE HERE. (wee woo)");
    case ValueKind.Field: {
      const fieldValue = value as FieldReferenceValue;
      return `(field ${getFullyQualifiedTypeName(
        assert(fieldValue.thisValue.type),
      )}#${fieldValue.field.name})`;
    }
    case ValueKind.Variable: {
      const variableValue = value as VariableReferenceValue;

      const { node } = variableValue.variable;
      let variableName: string;

      if (isThisLiteral(node)) variableName = "this";
      else if (isParameter(node)) variableName = node.name.name;
      else if (isVariableDeclarator(node)) variableName = node.name.name;
      else UNREACHABLE("what in the world did you mess up here");

      return `(variable${
        variableValue.variable.immutable ? " const" : ""
      } ${variableName})`;
    }
    case ValueKind.Runtime: {
      const runtimeValue = value as RuntimeValue;
      return `(runtime ${getFullyQualifiedTypeName(assert(value.type))} ${
        runtimeValue.instruction
      })`;
    }
  }
}

export function printInstructionToString(inst: BlockInstruction): string {
  switch (inst.kind) {
    case InstructionKind.Const: {
      const constInsn = inst as ConstInstruction;
      return `      ${constInsn.name} = const: ${getValueString(
        constInsn.child,
      )}`;
    }
    case InstructionKind.Alloca:
      return `      ${inst.name} = alloca: ${getFullyQualifiedTypeName(
        assert(inst.type),
      )}`;
    case InstructionKind.Binary:
      const binary = inst as BinaryInstruction;
      return `      ${binary.name} = binary: ${
        binary.lhs.instruction
      } ${getBinaryOperatorString(binary.op)} ${binary.rhs.instruction}`;
    case InstructionKind.Call:
      const call = inst as CallInstruction;
      const callee = call.callee;
      return `      ${call.name} = call: ${getFullyQualifiedCallableName(
        callee.node,
        callee.type,
      )} with ${call.args.map(getValueString).join(", ")}`;
    case InstructionKind.IntegerCast:
    case InstructionKind.FloatCast: {
      const cast = inst as FloatCastInstruction;
      return `      ${cast.name} = cast: <${getFullyQualifiedTypeName(
        assert(cast.type),
      )}> ${cast.value}`;
    }
    case InstructionKind.Invalid: {
      return `      ${inst.name} = invalid`;
    }
    case InstructionKind.New: {
      return `      ${inst.name} = new: ${getFullyQualifiedTypeName(
        assert(inst.type),
      )}`;
    }
    case InstructionKind.Store: {
      const cast = inst as StoreInstruction;
      return `      ${inst.name} = store: ${getValueString(
        cast.target,
      )}} = ${getValueString(cast.value)}`;
    }
    case InstructionKind.Unreachable: {
      return `      ${inst.name} = unreachable`;
    }
    case InstructionKind.Unset: {
      UNREACHABLE("UNSET INSTRUCTION TYPE.");
    }
    case InstructionKind.Return: {
      const cast = inst as ReturnInstruction;
      return `      return ${getValueString(cast.value)}`;
    }
    case InstructionKind.Br: {
      const casted = inst as BrInstruction;
      return `      br to ${casted.target}`;
    }
    case InstructionKind.BrIf: {
      const casted = inst as BrIfInstruction;
      return `      br to ${casted.truthy} if ${getValueString(
        casted.condition,
      )}; else to ${casted.falsy}`;
    }
    case InstructionKind.Load: {
      const casted = inst as LoadInstruction;
      return `      ${inst.name} = load ${getValueString(casted.source)}`;
    }
    case InstructionKind.LogicalNot: {
      const cast = inst as LogicalNotInstruction;
      return `      ${inst.name} = not ${getValueString(cast.operand)}`;
    }
    case InstructionKind.BitwiseNot: {
      const cast = inst as BitwiseNotInstruction;
      return `      ${inst.name} = bitwisenot ${getValueString(cast.operand)}`;
    }
    case InstructionKind.Negate: {
      const cast = inst as NegateInstruction;
      return `      ${inst.name} = negate ${getValueString(cast.operand)}`;
    }
  }
}

export function getInstructionName(inst: BlockInstruction): string {
  return assert(inst.name, "Block instruction must have a name.");
}

export function ensureDereferenced(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  value: Value,
): Value {
  switch (value.kind) {
    case ValueKind.Field: {
      return createRuntimeValue(
        buildLoadInstruction(ctx, currentBlock, value as FieldReferenceValue),
      );
    }
    case ValueKind.Variable: {
      return createRuntimeValue(
        buildLoadInstruction(
          ctx,
          currentBlock,
          value as VariableReferenceValue,
        ),
      );
    }
    default: {
      return value;
    }
  }
}
