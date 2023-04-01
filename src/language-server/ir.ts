import { LLVMBasicBlockRef, LLVMValueRef, Module } from "llvm-js";
import { ConcreteType, ConcreteTypeKind } from "./types";
import { assert } from "./util";

export const enum BinaryOperator {
  Add,
  FAdd,
  Sub,
  FSub,
  Mul,
  FMul,
  SDiv,
  UDiv,
  FDiv,
}

export const enum InstructionType {
  Unset,
  Binary,
  Alloca,
  Unreachable,
  Malloc,
}

export interface FunctionContext {
  /** An array of all the labels in a function. */
  entry: LabelContext | null;

  /** A map of instruction names to their label instruction. */
  instructions: Map<string, LabelInstruction>;

  /** A map of label banes to their label. */
  labels: Map<string, LabelContext>;

  /** Instruction and label id counter for tempname and id generation. */
  idCounter: number;

  /** The llvm function ref. */
  funcRef: LLVMValueRef | null;

  /** The concrete type of this function. */
  type: ConcreteType;
}

export interface LabelContext {
  /** The ID of this label. */
  id: number;
  /** The name of this label. */
  name: string;
  /** An array of all the instructions for this label. */
  instructions: LabelInstruction[];
  /** All of the labels that must be created for the instructions to generate codegen. */
  children: LabelContext[];
  /** Label terminator. */
  terminator: LabelInstruction | null;
  /** The llvm block ref */
  block: LLVMBasicBlockRef | null;
}

export interface LabelInstruction {
  /** The instruction id. */
  id: number;
  /** The LLVMValueRef associated with this instruction. */
  ref: LLVMValueRef | null;
  /** The name of this instruction. */
  name: string | null;
  /** The type of this instruction. */
  instructionType: InstructionType;
  /** The concrete type of this instruction. */
  type: ConcreteType | null;
}
let LLVM = 0 as any as Module;

export interface BinaryInstruction extends LabelInstruction {
  /** Left hand side of the operation. */
  lhs: LabelInstruction;
  /** Right hand side of the operation. */
  rhs: LabelInstruction;
  /** Binary operation being performed. */
  op: BinaryOperator;
}

export function buildFunction(type: ConcreteType): FunctionContext {
  const result = {
    entry: null,
    funcRef: null,
    idCounter: 0,
    instructions: new Map(),
    labels: new Map(),
    type,
  } as FunctionContext;

  const entry = buildLabel(result, null);
  result.entry = entry;
  return result;
}

export function buildLabel(
  func: FunctionContext,
  parent: LabelContext | null,
): LabelContext {
  const id = func.idCounter++;
  const name = `${id}~label`;

  const label = {
    block: null,
    children: [],
    id,
    instructions: [],
    name,
    terminator: null,
  } as LabelContext;

  if (parent) {
    parent.children.push(label);
  } else {
    assert(
      !func.entry,
      "Tried to set the entry label to a function that aleady has one.",
    );
    func.entry = label;
  }

  func.labels.set(name, label);
  return label;
}

export function buildInstruction(
  func: FunctionContext,
  type: ConcreteType | null,
): LabelInstruction {
  const id = func.idCounter++;
  const name = `${id}~inst`;

  const inst = {
    id,
    instructionType: InstructionType.Unset,
    name,
    ref: null,
    type,
  };
  func.instructions.set(name, inst);
  return inst;
}

export function buildBinaryInstruction(
  func: FunctionContext,
  label: LabelContext,
  lhs: LabelInstruction,
  op: BinaryOperator,
  rhs: LabelInstruction,
): BinaryInstruction {
  const inst = buildInstruction(func, lhs.type) as BinaryInstruction;
  inst.instructionType = InstructionType.Binary;
  inst.lhs = lhs;
  inst.op = op;
  inst.rhs = rhs;
  // push the instruction to the end
  label.instructions.push(inst);
  return inst;
}

export function buildAlloca(
  func: FunctionContext,
  label: LabelContext,
  type: ConcreteType,
): LabelInstruction {
  const inst = buildInstruction(func, type);
  inst.instructionType = InstructionType.Alloca;
  // unshift the alloca to the beginning
  label.instructions.unshift(inst);
  return inst;
}

export function buildUnreachable(
  func: FunctionContext,
  label: LabelContext,
): LabelInstruction {
  const inst = buildInstruction(func, {
    kind: ConcreteTypeKind.Never,
    llvmType: null,
  });
  inst.instructionType = InstructionType.Unreachable;
  assert(
    !label.terminator,
    "Tried to build unreachable with a label that already has a terminator.",
  );
  label.terminator = inst;
  return inst;
}

export function buildMalloc(
  func: FunctionContext,
  label: LabelContext,
  type: ConcreteType,
): LabelInstruction {
  const inst = buildInstruction(func, type);
  inst.instructionType = InstructionType.Malloc;
  label.instructions.push(inst);
  return inst;
}

