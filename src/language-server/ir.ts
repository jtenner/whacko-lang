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
  getBinaryOperatorString,
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
  Exp,
  BitwiseAnd,
  LogicalAnd,
  BitwiseOr,
  LogicalOr,
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
  Unary,
  Alloca,
  Unreachable,
  New,
  Call,
  IntCast,
  FloatCast,
  Load,
  Store,
  LogicalNot,
  BitwiseNot,
  Negate,
}

export const enum ValueKind {
  Invalid,
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

export interface RuntimeValue extends Value {
  kind: ValueKind.Runtime;
  instruction: string; // Corresponds to a BlockInstruction
  valueRef: LLVMValueRef | null;
}

export interface Variable {
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
  variables: Map<AstNode, Variable>;

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

  /** The this value. */
  thisValue: VariableReferenceValue;
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
  block: LLVMBasicBlockRef | null;
}

export interface BlockInstruction {
  /** The instruction id. */
  id: number;
  /** The LLVMValueRef associated with this instruction. */
  ref: LLVMValueRef | null;
  /** The name of this instruction. */
  name: string | null;
  /** The type of this instruction. */
  kind: InstructionKind;
  /** The concrete type of this instruction. */
  type: ConcreteType | null;
}

export interface BinaryInstruction extends BlockInstruction {
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
    block: null,
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
  return inst;
}

export function buildBinaryInstruction(
  func: WhackoFunctionContext,
  block: BlockContext,
  lhs: RuntimeValue,
  op: BinaryOperator,
  rhs: RuntimeValue,
): BinaryInstruction {
  const inst = buildInstruction(func, lhs.type, InstructionKind.Binary, {
    lhs,
    op,
    rhs,
  }) as BinaryInstruction;
  // push the instruction to the end
  block.instructions.push(inst);
  return inst;
}

export function buildUnreachable(
  func: WhackoFunctionContext,
  currentBlock: BlockContext,
): BlockInstruction {
  const inst = buildInstruction(
    func,
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
  currentBlock.instructions.push(inst);
  currentBlock.terminator = inst;
  return inst;
}

export function buildMalloc(
  func: WhackoFunctionContext,
  block: BlockContext,
  type: ConcreteType,
): BlockInstruction {
  const inst = buildInstruction(func, type, InstructionKind.New, {});
  block.instructions.push(inst);
  return inst;
}

export interface ConstIntegerValue extends Value {
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

export interface ConstFloatValue extends Value {
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

export interface ConstStrValue extends Value {
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

interface NullValue extends Value {
  kind: ValueKind.Null;
  type: null;
}

export const theNullValue: NullValue = {
  kind: ValueKind.Null,
  type: null,
};

interface InvalidValue extends Value {
  kind: ValueKind.Invalid;
  type: InvalidType;
}

export const theInvalidValue: InvalidValue = {
  kind: ValueKind.Invalid,
  type: theInvalidType,
};

export interface ScopeElementValue extends Value {
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

interface CallInstruction extends BlockInstruction {
  kind: InstructionKind.Call;
  callee: CallableFunctionContext;
  args: RuntimeValue[];
}

export function buildCallInstruction(
  caller: WhackoFunctionContext,
  block: BlockContext,
  callee: CallableFunctionContext,
  args: RuntimeValue[],
): CallInstruction {
  const insn: CallInstruction = buildInstruction(
    caller,
    callee.type.returnType,
    InstructionKind.Call,
    {
      callee,
      args,
    },
  );
  block.instructions.push(insn);
  return insn;
}

export function buildBasicBlock(
  ctx: WhackoFunctionContext,
  name: string,
): BlockContext {
  const id = idCounter.value++;
  const block = {
    block: null,
    children: [],
    id,
    instructions: [],
    name: `${name}~${id}`,
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
  module: WhackoModule,
  type: FunctionType,
  declaration: DeclareFunction,
): CallableFunctionContext {
  const functionName = declaration.name.name;
  const moduleName = declaration.$container.namespace.value;

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
    name: getFullyQualifiedCallableName(declaration, type),
    node: declaration,
    type,
  };
  return result;
}

export function buildExternFunction(
  module: WhackoModule,
  type: FunctionType,
  declaration: ExternDeclaration,
): CallableFunctionContext {
  const name = getNameDecoratorValue(declaration) ?? declaration.name.name;

  return {
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
}

export interface IntCastInstruction extends BlockInstruction {
  kind: InstructionKind.IntCast;
  value: RuntimeValue;
}

export function buildIntCastInstruction(
  ctx: WhackoFunctionContext,
  value: RuntimeValue,
  type: ConcreteType,
): IntCastInstruction {
  return buildInstruction(ctx, type, InstructionKind.IntCast, {
    value,
  });
}

export interface FloatCastInstruction extends BlockInstruction {
  kind: InstructionKind.FloatCast;
  value: RuntimeValue;
}

export function buildFloatCastInstruction(
  ctx: WhackoFunctionContext,
  value: RuntimeValue,
  type: ConcreteType,
): FloatCastInstruction {
  return buildInstruction(ctx, type, InstructionKind.FloatCast, {
    value,
  });
}

export interface LoadInstruction extends BlockInstruction {
  kind: InstructionKind.Load;
  source: FieldReferenceValue | VariableReferenceValue;
}

export function buildLoadInstruction(
  ctx: WhackoFunctionContext,
  source: LoadInstruction["source"],
): LoadInstruction {
  return buildInstruction(ctx, source.type, InstructionKind.Load, {
    source,
  });
}

export interface StoreInstruction extends BlockInstruction {
  kind: InstructionKind.Store;
  target: FieldReferenceValue | VariableReferenceValue;
  value: RuntimeValue;
}

export function buildStoreInstruction(
  ctx: WhackoFunctionContext,
  target: StoreInstruction["target"],
  value: RuntimeValue,
): StoreInstruction {
  return buildInstruction(ctx, target.type, InstructionKind.Store, {
    target,
    value,
  });
}

export interface NewInstruction extends BlockInstruction {
  kind: InstructionKind.New;
}

export function buildNewInstruction(
  ctx: WhackoFunctionContext,
  classType: ClassType,
): NewInstruction {
  return buildInstruction(ctx, classType, InstructionKind.New, {});
}

export interface ConcreteFunctionReferenceValue extends Value {
  kind: ValueKind.ConcreteFunction;
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
    type: null,
    target,
  };
}

export interface MethodReferenceValue extends Value {
  kind: ValueKind.Method;
  type: null;
  thisValue: Value;
  target: MethodClassMember;
}

export function buildMethodReference(
  thisValue: Value,
  target: MethodClassMember,
): MethodReferenceValue {
  return {
    kind: ValueKind.Method,
    target,
    thisValue,
    type: null,
  };
}

export interface FieldReferenceValue extends Value {
  kind: ValueKind.Field;
  thisValue: Value; // TODO? Formerly thisInstruction
  field: ConcreteField;
}

export function createFieldReference(
  thisValue: Value,
  field: ConcreteField,
): FieldReferenceValue {
  return {
    field,
    kind: ValueKind.Field,
    thisValue,
    type: field.type,
  };
}

export interface VariableReferenceValue extends Value {
  kind: ValueKind.Variable;
  variable: Variable;
}

export function createVariableReference(
  variable: Variable,
): VariableReferenceValue {
  return {
    kind: ValueKind.Variable,
    type: variable.type,
    variable,
  };
}

export interface LogicalNotInstruction extends BlockInstruction {
  kind: InstructionKind.LogicalNot;
  operand: RuntimeValue;
}

export function buildLogicalNotInstruction(
  ctx: WhackoFunctionContext,
  operand: RuntimeValue,
): LogicalNotInstruction {
  return buildInstruction(
    ctx,
    getIntegerType(IntegerKind.Bool),
    InstructionKind.LogicalNot,
    {
      operand,
    },
  );
}

export interface NegateInstruction extends BlockInstruction {
  kind: InstructionKind.Negate;
  operand: RuntimeValue;
}

export function buildNegateInstruction(
  ctx: WhackoFunctionContext,
  operand: RuntimeValue,
): NegateInstruction {
  return buildInstruction(ctx, assert(operand.type), InstructionKind.Negate, {
    operand,
  });
}

export interface BitwiseNotInstruction extends BlockInstruction {
  kind: InstructionKind.BitwiseNot;
  operand: RuntimeValue;
}

export function buildBitwiseNotInstruction(
  ctx: WhackoFunctionContext,
  operand: RuntimeValue,
): BitwiseNotInstruction {
  return buildInstruction(
    ctx,
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
    type: maybeType ?? type,
    instruction: assert(name),
    kind: ValueKind.Runtime,
    valueRef: null,
  };
}

export function asComptimeConditional(value: Value): ComptimeConditional {
  switch (value.kind) {
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

export interface BrInstruction extends BlockInstruction {
  kind: InstructionKind.Br;
  type: null;
  target: string;
}

export function buildBrInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  target: string,
): BrInstruction {
  assert(
    !currentBlock.terminator,
    "Block was already terminated! WEE WOO WEE WOO!",
  );
  const instruction: BrInstruction = buildInstruction(
    ctx,
    null,
    InstructionKind.Br,
    {
      target,
    },
  );
  return (currentBlock.terminator = instruction);
}

export interface BrIfInstruction extends BlockInstruction {
  kind: InstructionKind.BrIf;
  condition: RuntimeValue;
  truthy: string;
  falsy: string | null;
  type: null;
}

export function buildBrIfInstruction(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  condition: RuntimeValue,
  truthy: string,
  falsy: string | null,
): BrIfInstruction {
  assert(
    !currentBlock.terminator,
    "Block was already terminated! WEE WOO WEE WOO!",
  );
  const instruction: BrIfInstruction = buildInstruction<BrIfInstruction>(
    ctx,
    null,
    InstructionKind.BrIf,
    {
      condition,
      truthy,
      falsy,
    },
  );
  currentBlock.instructions.push(instruction);
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
  value = ensureDereferenced(ctx, value);
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

export interface ConstInstruction extends BlockInstruction {
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
    child.type,
    InstructionKind.Const,
    { child },
  );
  currentBlock.instructions.push(inst);
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
    for (const [name, block] of func.blocks) {
      result += printBlockToString(block) + "\n";
    }
  }

  result += "\n\n";
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
    case ValueKind.Invalid:
      return "(invalid value)";
    case ValueKind.Null:
      return "(null value)";
    // https://www.npmjs.com/package/js-string-escape
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
    case InstructionKind.IntCast:
    case InstructionKind.FloatCast: {
      const cast = inst as FloatCastInstruction;
      return `      ${cast.name} = cast: <${getFullyQualifiedTypeName(
        assert(cast.type),
      )}> ${cast.value}`;
    }
    case InstructionKind.Invalid: {
      return `      invalid`;
    }
    case InstructionKind.New: {
      return `      ${inst.name} = new: ${getFullyQualifiedTypeName(
        assert(inst.type),
      )}`;
    }
    case InstructionKind.Store: {
      const cast = inst as StoreInstruction;
      return `      store: ${getValueString(cast.target)}} = ${getValueString(
        cast.value,
      )}`;
    }
    case InstructionKind.Unreachable: {
      return `      unreachable`;
    }
    case InstructionKind.Unset: {
      UNREACHABLE("UNSET INSTRUCTION TYPE.");
    }
    default: {
      UNREACHABLE("Unknown instruction type, what the heck did you do?");
    }
  }
}

export function getInstructionName(inst: BlockInstruction): string {
  return assert(inst.name, "Block instruction must have a name.");
}

export function ensureDereferenced(
  ctx: WhackoFunctionContext,
  value: Value,
): Value {
  switch (value.kind) {
    case ValueKind.Field: {
      return createRuntimeValue(
        buildLoadInstruction(ctx, value as FieldReferenceValue),
      );
    }
    case ValueKind.Variable: {
      return createRuntimeValue(
        buildLoadInstruction(ctx, value as VariableReferenceValue),
      );
    }
    default: {
      return value;
    }
  }
}
