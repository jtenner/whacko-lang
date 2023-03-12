// @ts-ignore
import llvm from "./llvm-wasm.mjs";

export default llvm as Promise<Module>;

const LLVM = await (llvm as Promise<Module>);

export type Pointer<T> = number & { type: T };

export type LLVMValueRef = Pointer<"LLVMValueRef">;

export type LLVMTypeRef = Pointer<"LLVMTypeRef">;

export type LLVMFuncRef = Pointer<"LLVMFuncRef">;

export type LLVMModuleRef = Pointer<"LLVMModuleRef">;

export type LLVMStringRef = Pointer<"LLVMStringRef">;

export type LLVMBasicBlockRef = Pointer<"LLVMBasicBlockRef">;

export type LLVMBuilderRef = Pointer<"LLVMBuilderRef">;

export type LLVMBool = 1 | 0;

export interface Module {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  ready(): Promise<Module>;
  _LLVMAppendBasicBlock(func: LLVMFuncRef, name: LLVMStringRef): LLVMBasicBlockRef;

  _LLVMBuildAdd(B: LLVMBuilderRef, LHS: LLVMValueRef, RHS: LLVMValueRef, Name: LLVMStringRef): LLVMValueRef
  _LLVMBuildGlobalStringPtr(builder: LLVMBuilderRef, str: LLVMStringRef, name: LLVMStringRef): LLVMValueRef;
  _LLVMCreateBuilder(): LLVMBuilderRef;
  _LLVMConstInt(type: LLVMTypeRef, value: bigint, signExtend: LLVMBool): LLVMValueRef;
  _LLVMConstReal(type: LLVMTypeRef, value: number): LLVMValueRef;
  _LLVMConstString(str: LLVMStringRef, len: number, doNotNullTerminate: LLVMBool): LLVMValueRef;
  _LLVMGetParam(func: LLVMFuncRef, index: number): LLVMValueRef;
  _LLVMGetPoison(type: LLVMTypeRef): LLVMValueRef;
  _LLVMInt1Type(): LLVMTypeRef;
  _LLVMInt8Type(): LLVMTypeRef;
  _LLVMInt16Type(): LLVMTypeRef;
  _LLVMInt32Type(): LLVMTypeRef;
  _LLVMInt64Type(): LLVMTypeRef;
  _LLVMFloatType(): LLVMTypeRef;
  _LLVMDoubleType(): LLVMTypeRef;
  _LLVMVoidType(): LLVMTypeRef;
  _LLVMAddFunction(mod: LLVMModuleRef, name: LLVMStringRef, funcType: LLVMTypeRef): LLVMFuncRef;
  _LLVMFunctionType(returnType: LLVMTypeRef, parameterTypes: Pointer<LLVMTypeRef>, count: number, isVarArg: LLVMBool): LLVMTypeRef;
  _LLVMModuleCreateWithName(name: LLVMStringRef): LLVMModuleRef;
  _LLVMPositionBuilderAtEnd(builder: LLVMBuilderRef, block: LLVMBasicBlockRef): void;
  _malloc<T>(size: number): Pointer<T>;
  _free(ptr: Pointer<any>): void;
}

export function lower(str: string): LLVMStringRef {
  str += "\0";
  const length = Buffer.byteLength(str);
  const ptr = LLVM._malloc<"LLVMStringRef">(length);
  Buffer.from(LLVM.HEAPU8.buffer, ptr).write(str, "utf-8");
  return ptr;
}

export function lift(ptr: Pointer<"LLVMStringRef">): string {
  const index = LLVM.HEAPU8.indexOf(0, ptr);
  return Buffer.from(LLVM.HEAPU8.buffer).toString("utf-8", ptr, index);
}

export function lowerTypeArray(elements: LLVMTypeRef[]): Pointer<LLVMTypeRef> {
  const elementCount = elements.length;
  const ptr = LLVM._malloc<LLVMTypeRef>(elementCount << 2);
  for (let i = 0; i < elementCount; i++) {
    LLVM.HEAPU32[ptr >>> 2] = elements[i];
  }
  return ptr;
}
