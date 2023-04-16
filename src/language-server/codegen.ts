import {
  InstructionKind,
  WhackoFunctionContext,
  WhackoMethodContext,
  LoadInstruction,
  FloatCastInstruction,
  BlockInstruction,
  TypedValue,
  NewInstruction,
  CallInstruction,
  StoreInstruction,
  LogicalNotInstruction,
  BitwiseNotInstruction,
  NegateInstruction,
  AllocaInstruction,
  BrInstruction,
  BinaryInstruction,
  BinaryOperator,
  ReturnInstruction,
  theVoidValue,
  printBlockToString,
  ConstInstruction,
  BrIfInstruction,
  ValueKind,
  ConstIntegerValue,
  ConstStrValue,
  VariableReferenceValue,
  FieldReferenceValue,
  ConstFloatValue,
  RuntimeValue,
  UndefinedInstruction,
  InsertElementInstruction,
  FreeInstruction,
  IntToPtrInstruction,
  CallableKind,
  isWhackoMethod,
  isWhackoFunction,
  printInstructionToString,
  MallocInstruction,
  PtrToIntInstruction,
  TrampolineFunctionContext,
  IntegerCastInstruction,
} from "./ir";
import {
  assert,
  getFullyQualifiedInterfaceName,
  getFullyQualifiedTypeName,
  idCounter,
  UNREACHABLE,
} from "./util";
import { LLVMFieldTrampolineDefinition, WhackoProgram } from "./program";
import {
  LLVMValueRef,
  LLVMTypeRef,
  Module as LLVM,
  LLVMBool,
  LLVMCodeGenFileType,
  LLVMBuilderRef,
  LLVMStringRef,
  LLVMVerifierFailureAction,
  Pointer,
  LLVMTargetRef,
  LLVMErrorRef,
  LLVMBasicBlockRef,
} from "llvm-js";
import {
  ConcreteType,
  ConcreteTypeKind,
  NullableType,
  ClassType,
  FunctionType,
  MethodType,
  IntegerType,
  IntegerKind,
  FloatType,
  FloatKind,
  V128Type,
  V128Kind,
  isNumeric,
  resolveBuiltinType,
  isSignedIntegerKind,
  isSignedV128Kind,
  isFloatV128Kind,
  theVoidType,
  InterfaceType,
  getIntegerType,
  ConcreteField,
} from "./types";
import {
  isClassDeclaration,
  isParameter,
  isVariableDeclarator,
} from "./generated/ast";
import { reportErrorDiagnostic } from "./diagnostic";

type LLVMUtil = typeof import("llvm-js");

export function getLLVMPointerType(LLVM: LLVM): LLVMTypeRef {
  return LLVM._LLVMPointerType(LLVM._LLVMVoidType(), 0);
}

export function getLLVMFunctionType(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  type: FunctionType | MethodType,
): LLVMTypeRef {
  const ret = getLLVMType(LLVM, LLVMUtil, type.returnType);
  // Functions in the parameter or return position must be typed as pointer
  const params = type.parameterTypes.map((param) =>
    param.kind === ConcreteTypeKind.Function ||
    param.kind === ConcreteTypeKind.Method
      ? getLLVMPointerType(LLVM)
      : getLLVMType(LLVM, LLVMUtil, param),
  );

  // Note: the thisType of methods can never be a function or a method.
  // Therefore, this is safe.
  if (type.kind === ConcreteTypeKind.Method)
    params.unshift(getLLVMType(LLVM, LLVMUtil, (type as MethodType).thisType));

  const paramArray = LLVMUtil.lowerPointerArray(params);
  const result = LLVM._LLVMFunctionType(
    ret,
    paramArray,
    params.length,
    Number(false) as LLVMBool,
  );
  LLVM._free(paramArray);
  return result;
}

export function getLLVMStructType(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  type: ClassType,
): LLVMTypeRef {
  // The iteration order for Maps is well-defined, so this is safe.
  const fields = Array.from(type.fields.values()).map((e) =>
    getLLVMType(LLVM, LLVMUtil, e.type),
  );

  fields.unshift(LLVM._LLVMInt32Type(), LLVM._LLVMInt32Type());

  const fieldArray = LLVMUtil.lowerPointerArray(fields);

  const result = LLVM._LLVMStructType(
    fieldArray,
    fields.length,
    Number(false) as LLVMBool,
  );
  type.llvmType = result;
  LLVM._free(fieldArray);
  return result;
}

export function getLLVMCommonObjectType(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
): LLVMTypeRef {
  const commonObjectElementTypes = LLVMUtil.lowerPointerArray([
    LLVM._LLVMInt32Type(),
    LLVM._LLVMInt32Type(),
  ]);

  const commonObjectType = LLVM._LLVMStructType(commonObjectElementTypes, 2, 0);

  LLVM._free(commonObjectElementTypes);
  return commonObjectType;
}

export function getLLVMType(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  ty: ConcreteType,
): LLVMTypeRef {
  if (ty.llvmType) return ty.llvmType;

  switch (ty.kind) {
    case ConcreteTypeKind.UnresolvedFunction:
      UNREACHABLE("We should always have resolved functions at this point.");
    case ConcreteTypeKind.Pointer:
    case ConcreteTypeKind.Nullable:
    case ConcreteTypeKind.Class:
    case ConcreteTypeKind.Interface:
    case ConcreteTypeKind.Array:
      return (ty.llvmType = getLLVMPointerType(LLVM));
    case ConcreteTypeKind.Function:
      return (ty.llvmType = getLLVMFunctionType(
        LLVM,
        LLVMUtil,
        ty as FunctionType,
      ));
    case ConcreteTypeKind.Method:
      return (ty.llvmType = getLLVMFunctionType(
        LLVM,
        LLVMUtil,
        ty as MethodType,
      ));
    case ConcreteTypeKind.Enum:
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
    case ConcreteTypeKind.Never:
    case ConcreteTypeKind.Void:
      return LLVM._LLVMVoidType();
    case ConcreteTypeKind.Invalid:
    case ConcreteTypeKind.Null:
      return UNREACHABLE(`Unhandled type kind: ${ty.kind}`);
  }
}

export interface CodegenResult {
  bitcode: Buffer;
  textIR: Buffer;
}

export function addAttributesToFunction(
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  funcRef: LLVMValueRef,
  attributes: { name: string; value: string }[],
): void {
  for (const { name, value } of attributes) {
    const loweredName = LLVMUtil.lower(name);
    const loweredValue = LLVMUtil.lower(value);
    LLVM._LLVMAddTargetDependentFunctionAttr(
      funcRef,
      loweredName,
      loweredValue,
    );
    LLVM._free(loweredName);
    LLVM._free(loweredValue);
  }
}

export function codegen(program: WhackoProgram): CodegenResult {
  const { LLVM, LLVMUtil } = program;
  program.llvmCtx = LLVM._LLVMContextCreate();
  program.llvmBuilder = LLVM._LLVMCreateBuilderInContext(program.llvmCtx);

  const moduleName = LLVMUtil.lower("whacko");
  program.llvmModule = LLVM._LLVMModuleCreateWithName(moduleName);
  LLVM._free(moduleName);

  const loweredEntryName = LLVMUtil.lower("entry");
  // create every function, and every block
  for (const [name, func] of program.functions) {
    const loweredName = LLVMUtil.lower(name);
    const llvmFuncType = getLLVMType(LLVM, LLVMUtil, func.type);
    const funcRef = (func.funcRef = LLVM._LLVMAddFunction(
      program.llvmModule,
      loweredName,
      llvmFuncType,
    ));

    // add each attribute to the function (for wasm linking and codegen hints)
    addAttributesToFunction(LLVM, LLVMUtil, funcRef, func.attributes);

    // if we need to generate instructions, then we should generate each block
    if (isWhackoFunction(func)) {
      const whackoFunc = func as WhackoFunctionContext;
      if (!whackoFunc.entry) console.log(whackoFunc.name);
      const entryBlock = assert(
        whackoFunc.entry,
        "Whacko functions should have entries",
      );

      entryBlock.llvmBlock = LLVM._LLVMAppendBasicBlock(
        func.funcRef,
        loweredEntryName,
      );

      for (const [blockName, block] of whackoFunc.blocks) {
        if (block === entryBlock) continue;

        const loweredName = LLVMUtil.lower(blockName);
        block.llvmBlock = LLVM._LLVMAppendBasicBlock(func.funcRef, loweredName);
        LLVM._free(loweredName);
      }
    }
  }

  LLVM._free(loweredEntryName);

  // then we can generate instructions because all the function llvm references now exist
  for (const func of program.functions.values()) {
    if (isWhackoFunction(func))
      codegenFunction(program, LLVM, LLVMUtil, func as WhackoFunctionContext);
  }

  // finally we generate all the trampolines
  for (const trampoline of program.fieldTrampolines.values()) {
    codegenFieldTrampoline(program, LLVM, LLVMUtil, trampoline);
  }

  for (const [trampoline, membersList] of program.methodTrampolines) {
    codegenMethodTrampoline(program, LLVM, LLVMUtil, trampoline, membersList);
  }

  const targetTriplePtr = LLVMUtil.lower("wasm32-wasi");

  LLVM._LLVMSetTarget(program.llvmModule, targetTriplePtr);

  // attributes for malloc()
  const mallocName = LLVMUtil.lower("malloc");
  const mallocRef = LLVM._LLVMGetNamedFunction(program.llvmModule, mallocName);
  LLVM._free(mallocName);

  if (mallocRef) {
    addAttributesToFunction(LLVM, LLVMUtil, mallocRef, [
      { name: "alloc-family", value: "malloc" },
      { name: "allockind", value: "alloc,zeroed" },
      { name: "allocsize", value: "0" },
    ]);
  }

  // attributes for free()
  const freeName = LLVMUtil.lower("free");
  const freeRef = LLVM._LLVMGetNamedFunction(program.llvmModule, freeName);
  LLVM._free(freeName);

  if (freeRef) {
    addAttributesToFunction(LLVM, LLVMUtil, freeRef, [
      { name: "alloc-family", value: "malloc" },
      { name: "allockind", value: "free" },
    ]);
  }

  LLVM._LLVMInitializeWebAssemblyTarget();
  LLVM._LLVMInitializeWebAssemblyTargetInfo();
  LLVM._LLVMInitializeWebAssemblyTargetMC();

  const triple = LLVMUtil.lower("wasm32-wasi");
  const targetPtr = LLVM._malloc<LLVMTargetRef[]>(4);
  const errorPtr = LLVM._malloc<LLVMStringRef[]>(4);

  if (LLVM._LLVMGetTargetFromTriple(triple, targetPtr, errorPtr)) {
    const errorString = LLVM.HEAPU32[errorPtr >>> 2] as LLVMStringRef;
    const error = LLVMUtil.lift(errorString);
    LLVM._LLVMDisposeErrorMessage(errorString);
    UNREACHABLE("LLVMGetTargetFromTriple failed: " + error);
  }

  // This should be a helper
  const targetRef = LLVM.HEAPU32[targetPtr >>> 2] as LLVMTargetRef;

  LLVM._free(targetPtr);
  LLVM._free(errorPtr);
  LLVM._LLVMSetTarget(program.llvmModule, triple);

  const cpu = LLVMUtil.lower("generic");
  const features = LLVMUtil.lower("");
  const targetMachineRef = LLVM._LLVMCreateTargetMachine(
    targetRef,
    triple,
    cpu,
    features,
    LLVMUtil.LLVMCodeGenOptLevel.LLVMCodeGenLevelNone,
    LLVMUtil.LLVMRelocMode.LLVMRelocDefault,
    LLVMUtil.LLVMCodeModel.LLVMCodeModelDefault,
  );
  LLVM._free(triple);
  LLVM._free(cpu);
  LLVM._free(features);

  // TODO: Figure out passes
  const passes = LLVMUtil.lower("module-inline");
  const passOptions = LLVM._LLVMCreatePassBuilderOptions();
  const error = LLVM._LLVMRunPasses(
    program.llvmModule,
    passes,
    targetMachineRef,
    passOptions,
  );

  if (error) {
    const errorMessageRef = LLVM._LLVMGetErrorMessage(error);
    const errorMessage = LLVMUtil.lift(errorMessageRef);
    LLVM._LLVMDisposeErrorMessage(errorMessageRef);
    assert(`LLVMRunPasses failed: ${errorMessage}`);
  }

  LLVM._LLVMDisposePassBuilderOptions(passOptions);
  LLVM._LLVMDisposeTargetMachine(targetMachineRef);

  const bitcodeRef = LLVM._LLVMWriteBitcodeToMemoryBuffer(program.llvmModule);
  const bitcodeSize = LLVM._LLVMGetBufferSize(bitcodeRef);
  const bitcodeStart = LLVM._LLVMGetBufferStart(bitcodeRef);

  const bitcode = Buffer.from(
    LLVM.HEAPU8.slice(bitcodeStart, bitcodeStart + bitcodeSize),
  );
  LLVM._LLVMDisposeMemoryBuffer(bitcodeRef);

  const textIRRef = LLVM._LLVMPrintModuleToString(program.llvmModule);
  const textIR = Buffer.from(LLVMUtil.lift(textIRRef));
  LLVM._free(textIRRef);

  const errorPointer = LLVM._malloc<LLVMStringRef[]>(4);
  LLVM._LLVMVerifyModule(
    program.llvmModule,
    1 as LLVMVerifierFailureAction,
    errorPointer,
  );

  const stringPtr = LLVM.HEAPU32[errorPointer >>> 2] as LLVMStringRef;
  const errorString = stringPtr === 0 ? null : LLVMUtil.lift(stringPtr);

  if (errorString) {
    reportErrorDiagnostic(
      program,
      null,
      "codegen",
      null,
      `LLVM IR validation failed: ${errorString}`,
    );
  }

  LLVM._free(errorPointer);

  if (stringPtr) LLVM._LLVMDisposeErrorMessage(stringPtr);

  return { bitcode, textIR };
}

export function codegenFieldTrampoline(
  program: WhackoProgram,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  trampoline: LLVMFieldTrampolineDefinition,
) {
  // create the entry block
  const entryName = LLVMUtil.lower(`entry~${idCounter.value++}`);
  const entryBlock = LLVM._LLVMAppendBasicBlock(trampoline.funcRef, entryName);
  LLVM._free(entryName);
  LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, entryBlock);

  const commonObjectType = getLLVMCommonObjectType(LLVM, LLVMUtil);

  // get the pointer to the type
  const gepTypeName = LLVMUtil.lower(`typeGEP~${idCounter.value++}`);
  const gepTypeIndices = LLVMUtil.lowerPointerArray([
    // index 0
    LLVM._LLVMConstInt(LLVM._LLVMInt32Type(), 0n, Number(false) as LLVMBool),
  ]);
  const pointerValue = LLVM._LLVMGetParam(trampoline.funcRef, 0);
  const typeGEP = LLVM._LLVMBuildGEP2(
    program.llvmBuilder,
    commonObjectType,
    pointerValue,
    gepTypeIndices,
    1,
    gepTypeName,
  );
  LLVM._free(gepTypeIndices);
  LLVM._free(gepTypeName);

  const loadTypeName = LLVMUtil.lower(`loadType~${idCounter.value++}`);
  const loadType = LLVM._LLVMBuildLoad2(
    program.llvmBuilder,
    LLVM._LLVMInt32Type(),
    typeGEP,
    loadTypeName,
  );
  LLVM._free(loadTypeName);

  const defaultBlockName = LLVMUtil.lower(`default~${idCounter.value++}`);
  const defaultBlock = LLVM._LLVMAppendBasicBlock(
    trampoline.funcRef,
    defaultBlockName,
  );
  LLVM._free(defaultBlockName);

  // now that the type is loaded we can switch on it
  const implementers = Array.from(trampoline.type.implementers);
  const trampolineSwitch = LLVM._LLVMBuildSwitch(
    program.llvmBuilder,
    loadType,
    defaultBlock,
    implementers.length,
  );

  const blocks = [] as LLVMBasicBlockRef[];

  // for each implementer
  for (let i = 0; i < implementers.length; i++) {
    // create a block and add it to the switch
    const implementer = implementers[i];
    const blockName = LLVMUtil.lower(getFullyQualifiedTypeName(implementer));
    const block = LLVM._LLVMAppendBasicBlock(trampoline.funcRef, blockName);
    LLVM._free(blockName);

    LLVM._LLVMAddCase(
      trampolineSwitch,
      LLVM._LLVMConstInt(
        LLVM._LLVMInt32Type(),
        BigInt(implementer.id),
        Number(false) as LLVMBool,
      ),
      block,
    );

    blocks.push(block);
  }

  // then codegen each implementer branch
  const fieldName = trampoline.field.name;

  for (let i = 0; i < implementers.length; i++) {
    // set the start of the block
    const block = blocks[i];
    const implementer = implementers[i];
    LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, block);

    const fieldIndex = Array.from(implementer.fields.values()).findIndex(
      (e) => e.name === fieldName,
    );
    assert(fieldIndex !== -1);

    const fieldIndexArray = LLVMUtil.lowerPointerArray([
      LLVM._LLVMConstInt(
        LLVM._LLVMInt32Type(),
        BigInt(fieldIndex + 2),
        Number(false) as LLVMBool,
      ),
    ]);
    const resultGEPName = LLVMUtil.lower(`resultGEP~${idCounter.value++}`);
    const result = LLVM._LLVMBuildGEP2(
      program.llvmBuilder,
      assert(implementer.llvmType),
      pointerValue,
      fieldIndexArray,
      1,
      resultGEPName,
    );

    LLVM._LLVMBuildRet(program.llvmBuilder, result);
  }

  LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, defaultBlock);
  LLVM._LLVMBuildUnreachable(program.llvmBuilder);
}

export function codegenMethodTrampoline(
  program: WhackoProgram,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  trampoline: TrampolineFunctionContext,
  membersList: Set<WhackoMethodContext>,
) {
  const funcRef = assert(
    trampoline.funcRef,
    "The trampoline funcRef must exist at this point.",
  );

  // create the entry block
  const entryName = LLVMUtil.lower(`entry~${idCounter.value++}`);
  const entryBlock = LLVM._LLVMAppendBasicBlock(funcRef, entryName);
  LLVM._free(entryName);
  LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, entryBlock);

  const commonObjectType = getLLVMCommonObjectType(LLVM, LLVMUtil);

  // get the pointer to the type
  const gepTypeName = LLVMUtil.lower(`typeGEP~${idCounter.value++}`);
  const gepTypeIndices = LLVMUtil.lowerPointerArray([
    // index 0
    LLVM._LLVMConstInt(LLVM._LLVMInt32Type(), 0n, Number(false) as LLVMBool),
  ]);
  const pointerValue = LLVM._LLVMGetParam(funcRef, 0);
  const typeGEP = LLVM._LLVMBuildGEP2(
    program.llvmBuilder,
    commonObjectType,
    pointerValue,
    gepTypeIndices,
    1,
    gepTypeName,
  );
  LLVM._free(gepTypeIndices);
  LLVM._free(gepTypeName);

  const loadTypeName = LLVMUtil.lower(`loadType~${idCounter.value++}`);
  const loadType = LLVM._LLVMBuildLoad2(
    program.llvmBuilder,
    LLVM._LLVMInt32Type(),
    typeGEP,
    loadTypeName,
  );
  LLVM._free(loadTypeName);

  const defaultBlockName = LLVMUtil.lower(`default~${idCounter.value++}`);
  const defaultBlock = LLVM._LLVMAppendBasicBlock(funcRef, defaultBlockName);
  LLVM._free(defaultBlockName);

  // now that the type is loaded we can switch on it
  const membersListArray = Array.from(membersList);
  const trampolineSwitch = LLVM._LLVMBuildSwitch(
    program.llvmBuilder,
    loadType,
    defaultBlock,
    membersListArray.length,
  );

  const blocks = [] as LLVMBasicBlockRef[];

  // for each implementer
  for (let i = 0; i < membersListArray.length; i++) {
    // create a block and add it to the switch
    const member = membersListArray[i];
    const blockName = LLVMUtil.lower(member.name);
    const block = LLVM._LLVMAppendBasicBlock(funcRef, blockName);
    LLVM._free(blockName);

    LLVM._LLVMAddCase(
      trampolineSwitch,
      LLVM._LLVMConstInt(
        LLVM._LLVMInt32Type(),
        BigInt(member.thisType.id),
        Number(false) as LLVMBool,
      ),
      block,
    );

    blocks.push(block);
  }

  for (let i = 0; i < membersListArray.length; i++) {
    const block = blocks[i];
    const method = membersListArray[i];
    LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, block);

    const params = [];
    for (let i = 0; i < 1 + trampoline.type.parameterTypes.length; i++) {
      params.push(LLVM._LLVMGetParam(funcRef, i));
    }

    const paramsArray = LLVMUtil.lowerPointerArray(params);

    const result = LLVM._LLVMBuildCall2(
      program.llvmBuilder,
      getLLVMFunctionType(LLVM, LLVMUtil, trampoline.type),
      assert(method.funcRef, "All methods should have been compiled by now."),
      paramsArray,
      params.length,
      0 as LLVMStringRef,
    );
    // there is one last thing
    // removing trampolineInfo, because callables already have a funcRef property
    LLVM._free(paramsArray);
    LLVM._LLVMBuildRet(program.llvmBuilder, result);
  }

  LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, defaultBlock);
  LLVM._LLVMBuildUnreachable(program.llvmBuilder);
}

export function getLLVMIntType(LLVM: LLVM, type: IntegerType): LLVMTypeRef {
  switch (type.integerKind) {
    case IntegerKind.Bool:
      return LLVM._LLVMInt1Type();
    case IntegerKind.U8:
    case IntegerKind.I8:
      return LLVM._LLVMInt8Type();
    case IntegerKind.U16:
    case IntegerKind.I16:
      return LLVM._LLVMInt16Type();
    case IntegerKind.ISize:
    case IntegerKind.USize:
    case IntegerKind.U32:
    case IntegerKind.I32:
      return LLVM._LLVMInt32Type();
    case IntegerKind.U64:
    case IntegerKind.I64:
      return LLVM._LLVMInt64Type();
  }
}

export function getLLVMValue(
  program: WhackoProgram,
  func: WhackoFunctionContext,
  builder: LLVMBuilderRef,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  value: TypedValue,
): LLVMValueRef {
  switch (value.kind) {
    case ValueKind.Invalid:
      UNREACHABLE("Invalid values should never be reached in codegen.");
    case ValueKind.Void:
      UNREACHABLE("Void values should never be reached in codegen.");
    case ValueKind.Null:
      return LLVM._LLVMConstNull(getLLVMPointerType(LLVM));
    case ValueKind.Integer: {
      const casted = value as ConstIntegerValue;
      return LLVM._LLVMConstInt(
        getLLVMIntType(LLVM, casted.type),
        casted.value,
        0,
      );
    }
    case ValueKind.Float: {
      const casted = value as ConstFloatValue;
      return LLVM._LLVMConstReal(
        casted.type.floatKind === FloatKind.F32
          ? LLVM._LLVMFloatType()
          : LLVM._LLVMDoubleType(),
        casted.value,
      );
    }
    case ValueKind.Str: {
      const casted = value as ConstStrValue;
      const type = LLVM._LLVMInt8Type();
      const values = Array.from(Buffer.from(casted.value + "\0")).map((byte) =>
        LLVM._LLVMConstInt(type, BigInt(byte), 0),
      );
      const lowered = LLVMUtil.lowerPointerArray(values);
      const result = LLVM._LLVMConstArray(type, lowered, values.length);

      LLVM._free(lowered);
      return result;
    }
    case ValueKind.ScopeElement:
      UNREACHABLE(
        "Scope elements cannot be codegenned... what did you do this time?",
      );
    case ValueKind.Method: {
      UNREACHABLE("Methods cannot be used as values, you silly goose.");
    }
    case ValueKind.Field: {
      // Keep this comment here: :^)
      const casted = value as FieldReferenceValue;
      const thisValue = casted.thisValue;

      if (thisValue.type.kind === ConcreteTypeKind.Class) {
        const thisType = thisValue.type as ClassType;

        const structType = getLLVMStructType(LLVM, LLVMUtil, thisType);

        const index = Array.from(thisType.fields.values()).indexOf(
          casted.field,
        );
        assert(
          index !== -1,
          "The field reference value must use a field that exists on the thisValue's type. Royal screw up!",
        );

        const name = LLVMUtil.lower(`gep~${idCounter.value++}`);
        const lowered = LLVMUtil.lowerPointerArray([
          LLVM._LLVMConstInt(LLVM._LLVMInt32Type(), BigInt(index + 2), 0),
        ]);

        const result = LLVM._LLVMBuildGEP2(
          builder,
          structType,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, thisValue),
          lowered,
          1,
          name,
        );

        LLVM._free(name);
        LLVM._free(lowered);
        return result;
      } else if (thisValue.type.kind === ConcreteTypeKind.Interface) {
        const thisType = thisValue.type as InterfaceType;

        const { funcRef: ref, typeRef: refType } =
          ensureFieldTrampolineCompiled(
            program,
            LLVM,
            LLVMUtil,
            casted.field,
            thisType,
          );
        const trampolineCallName = LLVMUtil.lower(
          `trampolineCall~${idCounter.value++}`,
        );
        const parameters = LLVMUtil.lowerPointerArray([
          getLLVMValue(
            program,
            func,
            builder,
            LLVM,
            LLVMUtil,
            casted.thisValue,
          ),
        ]);
        const result = LLVM._LLVMBuildCall2(
          builder,
          refType,
          ref,
          parameters,
          1,
          trampolineCallName,
        );
        LLVM._free(trampolineCallName);
        LLVM._free(parameters);
        return result;
      } else {
        UNREACHABLE("What happened here?");
      }
    }
    case ValueKind.ConcreteFunction: {
      return assert(func.funcRef);
    }
    case ValueKind.Variable: {
      const casted = value as VariableReferenceValue;
      return assert(casted.variable.ref);
    }
    case ValueKind.Runtime: {
      const casted = value as RuntimeValue;
      const instruction = assert(func.instructions.get(casted.instruction));
      return assert(
        instruction.ref,
        "The LLVMValueRef did not exist: " + instruction.name,
      );
    }
  }
}

function appendLLVMBinaryInstruction(
  program: WhackoProgram,
  func: WhackoFunctionContext,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  instruction: BinaryInstruction,
): LLVMValueRef {
  const { llvmBuilder: builder } = program;
  switch (instruction.op) {
    case BinaryOperator.Lt: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFCmp(
          program.llvmBuilder,
          LLVMUtil.LLVMRealPredicate.Olt,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        result = LLVM._LLVMBuildICmp(
          program.llvmBuilder,
          isSignedIntegerKind((instruction.type as IntegerType).integerKind)
            ? LLVMUtil.LLVMIntPredicate.Slt
            : LLVMUtil.LLVMIntPredicate.Ult,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Lte: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFCmp(
          program.llvmBuilder,
          LLVMUtil.LLVMRealPredicate.Ole,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        result = LLVM._LLVMBuildICmp(
          program.llvmBuilder,
          isSignedIntegerKind((instruction.type as IntegerType).integerKind)
            ? LLVMUtil.LLVMIntPredicate.Sle
            : LLVMUtil.LLVMIntPredicate.Ule,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Gte: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFCmp(
          program.llvmBuilder,
          LLVMUtil.LLVMRealPredicate.Oge,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        result = LLVM._LLVMBuildICmp(
          program.llvmBuilder,
          isSignedIntegerKind((instruction.type as IntegerType).integerKind)
            ? LLVMUtil.LLVMIntPredicate.Sge
            : LLVMUtil.LLVMIntPredicate.Uge,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Gt: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFCmp(
          program.llvmBuilder,
          LLVMUtil.LLVMRealPredicate.Ogt,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        result = LLVM._LLVMBuildICmp(
          program.llvmBuilder,
          isSignedIntegerKind((instruction.type as IntegerType).integerKind)
            ? LLVMUtil.LLVMIntPredicate.Sgt
            : LLVMUtil.LLVMIntPredicate.Ugt,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Add: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFAdd(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        result = LLVM._LLVMBuildAdd(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Sub: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFSub(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        // this works for vectors
        result = LLVM._LLVMBuildSub(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Mul: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        result = LLVM._LLVMBuildFMul(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        // this works for vectors
        result = LLVM._LLVMBuildMul(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Div: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;

      const isV128 = instruction.type.kind === ConcreteTypeKind.V128;
      const isFloat =
        instruction.type.kind === ConcreteTypeKind.Float ||
        (isV128 && isFloatV128Kind((instruction.type as V128Type).v128Kind));

      assert(isNumeric(instruction.type) || isV128);

      const isSigned =
        !isFloat &&
        (isV128
          ? isSignedV128Kind((instruction.type as V128Type).v128Kind)
          : isSignedIntegerKind((instruction.type as IntegerType).integerKind));

      if (isFloat) {
        result = LLVM._LLVMBuildFDiv(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        if (isSigned) {
          result = LLVM._LLVMBuildSDiv(
            program.llvmBuilder,
            getLLVMValue(
              program,
              func,
              builder,
              LLVM,
              LLVMUtil,
              instruction.lhs,
            ),
            getLLVMValue(
              program,
              func,
              builder,
              LLVM,
              LLVMUtil,
              instruction.rhs,
            ),
            name,
          );
        } else {
          result = LLVM._LLVMBuildUDiv(
            program.llvmBuilder,
            getLLVMValue(
              program,
              func,
              builder,
              LLVM,
              LLVMUtil,
              instruction.lhs,
            ),
            getLLVMValue(
              program,
              func,
              builder,
              LLVM,
              LLVMUtil,
              instruction.rhs,
            ),
            name,
          );
        }
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.BitwiseAnd: {
      const name = LLVMUtil.lower(instruction.name);
      const result = LLVM._LLVMBuildAnd(
        program.llvmBuilder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.BitwiseOr: {
      const name = LLVMUtil.lower(instruction.name);
      const result = LLVM._LLVMBuildOr(
        program.llvmBuilder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.BitwiseXor: {
      const name = LLVMUtil.lower(instruction.name);
      const result = LLVM._LLVMBuildXor(
        program.llvmBuilder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Shl: {
      assert(instruction.type.kind === ConcreteTypeKind.Integer);
      const name = LLVMUtil.lower(instruction.name);
      const result = LLVM._LLVMBuildShl(
        program.llvmBuilder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Eq: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        // This is Eq, so we want Oeq (ordered and equal).
        // Ordered means neither operand is NaN.
        result = LLVM._LLVMBuildFCmp(
          program.llvmBuilder,
          LLVMUtil.LLVMRealPredicate.Oeq,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        // this works for vectors
        result = LLVM._LLVMBuildICmp(
          program.llvmBuilder,
          LLVMUtil.LLVMIntPredicate.Eq,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Shr: {
      assert(instruction.type.kind === ConcreteTypeKind.Integer);
      const type = instruction.type;
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;

      // TODO: SIMD
      if (isSignedIntegerKind((type as IntegerType).integerKind)) {
        result = LLVM._LLVMBuildAShr(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        result = LLVM._LLVMBuildLShr(
          program.llvmBuilder,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
    case BinaryOperator.Neq: {
      const name = LLVMUtil.lower(instruction.name);
      let result: LLVMValueRef;
      if (instruction.type.kind === ConcreteTypeKind.Float) {
        // This is Ne, so we want Une (unordered and not equal).
        // Unordered means one operand is NaN or both are.
        result = LLVM._LLVMBuildFCmp(
          program.llvmBuilder,
          LLVMUtil.LLVMRealPredicate.Une,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      } else {
        // this works for vectors
        result = LLVM._LLVMBuildICmp(
          program.llvmBuilder,
          LLVMUtil.LLVMIntPredicate.Ne,
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.lhs),
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, instruction.rhs),
          name,
        );
      }
      LLVM._free(name);
      return result;
    }
  }
}

function appendLLVMInstruction(
  program: WhackoProgram,
  func: WhackoFunctionContext,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  instruction: BlockInstruction,
): LLVMValueRef {
  // This will be nullable soon honestly
  const { llvmBuilder: builder } = program;
  switch (instruction.kind) {
    case InstructionKind.PtrToInt: {
      const cast = instruction as PtrToIntInstruction;
      const name = LLVMUtil.lower(cast.name);
      const result = LLVM._LLVMBuildPtrToInt(
        builder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, cast.value),
        getLLVMIntType(LLVM, cast.type),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.Malloc: {
      const cast = instruction as MallocInstruction;
      const name = LLVMUtil.lower(cast.name);
      const result = LLVM._LLVMBuildArrayMalloc(
        builder,
        getLLVMIntType(LLVM, getIntegerType(IntegerKind.I8)),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, cast.size),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.IntToPtr: {
      const cast = instruction as IntToPtrInstruction;
      const name = LLVMUtil.lower(cast.name);
      const value = getLLVMValue(
        program,
        func,
        builder,
        LLVM,
        LLVMUtil,
        cast.value,
      );
      const result = LLVM._LLVMBuildIntToPtr(
        builder,
        value,
        getLLVMType(LLVM, LLVMUtil, cast.type),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.Free: {
      const cast = instruction as FreeInstruction;
      const value = getLLVMValue(
        program,
        func,
        builder,
        LLVM,
        LLVMUtil,
        cast.value,
      );
      return LLVM._LLVMBuildFree(builder, value);
    }
    case InstructionKind.Unset:
      UNREACHABLE(
        "Unset should never be reached in codegen (or anywhere for that matter)",
      );
    case InstructionKind.Const: {
      const cast = instruction as ConstInstruction;
      return getLLVMValue(program, func, builder, LLVM, LLVMUtil, cast.child);
    }
    case InstructionKind.Br: {
      const cast = instruction as BrInstruction;
      const target = assert(func.blocks.get(cast.target));
      return LLVM._LLVMBuildBr(program.llvmBuilder, assert(target.llvmBlock));
    }
    case InstructionKind.BrIf: {
      const cast = instruction as BrIfInstruction;
      const condition = getLLVMValue(
        program,
        func,
        builder,
        LLVM,
        LLVMUtil,
        cast.condition,
      );
      const truthy = assert(func.blocks.get(cast.truthy));
      const falsy = assert(func.blocks.get(cast.falsy));
      return LLVM._LLVMBuildCondBr(
        program.llvmBuilder,
        condition,
        assert(truthy.llvmBlock),
        assert(falsy.llvmBlock),
      );
    }
    case InstructionKind.Invalid:
      UNREACHABLE(
        "Invalid should never be reached in codegen. Report an error diagnostic you fool.",
      );
    case InstructionKind.Binary: {
      const cast = instruction as BinaryInstruction;
      const name = LLVMUtil.lower(cast.name);
      const result = appendLLVMBinaryInstruction(
        program,
        func,
        LLVM,
        LLVMUtil,
        cast,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.Alloca: {
      const cast = instruction as AllocaInstruction;
      const name = LLVMUtil.lower(cast.name);
      const result = LLVM._LLVMBuildAlloca(
        program.llvmBuilder,
        getLLVMType(LLVM, LLVMUtil, cast.type),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.Unreachable: {
      return LLVM._LLVMBuildUnreachable(builder);
    }
    case InstructionKind.New: {
      const casted = instruction as NewInstruction;
      const name = LLVMUtil.lower(casted.name);
      const llvmType = getLLVMType(LLVM, LLVMUtil, casted.type);
      const result = LLVM._LLVMBuildMalloc(builder, llvmType, name);
      LLVM._free(name);

      // We need to store the type of the reference on the allocation
      LLVM._LLVMBuildStore(
        builder,
        LLVM._LLVMConstInt(
          LLVM._LLVMInt32Type(),
          BigInt(casted.type.id),
          Number(false) as LLVMBool,
        ),
        result,
      );

      // we need to store at offset 4 the following value
      const rawSizeOf = LLVM._LLVMSizeOf(llvmType);

      const sizeOfCastName = LLVMUtil.lower(`sizeOfCast~${idCounter.value++}`);
      const sizeOf = LLVM._LLVMBuildIntCast2(
        builder,
        rawSizeOf,
        LLVM._LLVMInt32Type(),
        Number(false) as LLVMBool,
        sizeOfCastName,
      );
      LLVM._free(sizeOfCastName);

      const sizeOfGEPName = LLVMUtil.lower(`sizeOfGEP~${idCounter.value++}`);
      const sizeOfIndices = LLVMUtil.lowerPointerArray([
        LLVM._LLVMConstInt(
          LLVM._LLVMInt32Type(),
          1n,
          Number(false) as LLVMBool,
        ),
      ]);
      const sizeOfGEP = LLVM._LLVMBuildGEP2(
        builder,
        llvmType,
        result,
        sizeOfIndices,
        1,
        sizeOfGEPName,
      );
      LLVM._free(sizeOfGEPName);
      LLVM._free(sizeOfIndices);

      // perform the store
      LLVM._LLVMBuildStore(builder, sizeOf, sizeOfGEP);

      return result;
    }
    case InstructionKind.Call: {
      const casted = instruction as CallInstruction;
      const name =
        casted.type === theVoidType
          ? (0 as LLVMStringRef)
          : LLVMUtil.lower(casted.name);

      const args = LLVMUtil.lowerPointerArray(
        casted.args.map((value) =>
          getLLVMValue(program, func, builder, LLVM, LLVMUtil, value),
        ),
      );

      const funcRef =
        casted.callee.kind === CallableKind.InterfaceMethod
          ? ensureMethodTrampolineCompiled(
              program,
              LLVM,
              LLVMUtil,
              casted.callee as TrampolineFunctionContext,
            )
          : assert(
              casted.callee.funcRef,
              `The funcref wasn't set on the callee '${casted.callee.name}'. Uhoh.`,
            );

      const result = LLVM._LLVMBuildCall2(
        builder,
        getLLVMType(LLVM, LLVMUtil, casted.callee.type),
        funcRef,
        args,
        casted.args.length,
        name,
      );

      LLVM._free(args);
      if (name) LLVM._free(name);
      return result;
    }
    case InstructionKind.IntegerCast: {
      const casted = instruction as IntegerCastInstruction;
      const name = LLVMUtil.lower(casted.name);
      const result = LLVM._LLVMBuildIntCast2(
        builder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.value),
        getLLVMType(LLVM, LLVMUtil, casted.type),
        Number(isSignedIntegerKind(casted.type.integerKind)) as LLVMBool,
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.FloatCast: {
      const casted = instruction as FloatCastInstruction;
      const name = LLVMUtil.lower(casted.name);
      const result = LLVM._LLVMBuildFPCast(
        builder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.value),
        getLLVMType(LLVM, LLVMUtil, casted.type),
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.Load: {
      const casted = instruction as LoadInstruction;

      const pointer: LLVMValueRef = getLLVMValue(
        program,
        func,
        builder,
        LLVM,
        LLVMUtil,
        casted.source,
      );

      const name = LLVMUtil.lower(casted.name);
      const result = LLVM._LLVMBuildLoad2(
        builder,
        getLLVMType(LLVM, LLVMUtil, casted.type),
        pointer, // GEP for fields
        name,
      );
      LLVM._free(name);
      return result;
    }
    case InstructionKind.Store: {
      const casted = instruction as StoreInstruction;
      return LLVM._LLVMBuildStore(
        program.llvmBuilder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.value),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.target),
      );
    }
    case InstructionKind.LogicalNot:
    case InstructionKind.BitwiseNot: {
      const casted = instruction as BitwiseNotInstruction;
      const name = LLVMUtil.lower(casted.name);
      const result = LLVM._LLVMBuildNot(
        program.llvmBuilder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.operand),
        name,
      );
      LLVM._free(result);
      return result;
    }
    case InstructionKind.Negate: {
      const casted = instruction as NegateInstruction;
      const name = LLVMUtil.lower(casted.name);

      assert(isNumeric(casted.type));
      const result =
        casted.type.kind === ConcreteTypeKind.Integer
          ? LLVM._LLVMBuildNeg(
              builder,
              getLLVMValue(
                program,
                func,
                builder,
                LLVM,
                LLVMUtil,
                casted.operand,
              ),
              name,
            )
          : LLVM._LLVMBuildFNeg(
              builder,
              getLLVMValue(
                program,
                func,
                builder,
                LLVM,
                LLVMUtil,
                casted.operand,
              ),
              name,
            );

      LLVM._free(name);
      return result;
    }
    case InstructionKind.Return: {
      const cast = instruction as ReturnInstruction;
      const { value } = cast;
      return value === theVoidValue
        ? LLVM._LLVMBuildRetVoid(builder)
        : LLVM._LLVMBuildRet(
            builder,
            getLLVMValue(program, func, builder, LLVM, LLVMUtil, value),
          );
    }
    case InstructionKind.Undefined: {
      const casted = instruction as UndefinedInstruction;
      return LLVM._LLVMGetUndef(getLLVMType(LLVM, LLVMUtil, casted.type));
    }
    case InstructionKind.InsertElement: {
      const casted = instruction as InsertElementInstruction;
      const name = LLVMUtil.lower(casted.name);
      const result = LLVM._LLVMBuildInsertElement(
        builder,
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.target),
        getLLVMValue(program, func, builder, LLVM, LLVMUtil, casted.value),
        LLVM._LLVMConstInt(LLVM._LLVMInt32Type(), BigInt(casted.index), 0),
        name,
      );
      LLVM._free(name);
      return result;
    }
  }
}

export function codegenFunction(
  program: WhackoProgram,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  func: WhackoFunctionContext | WhackoMethodContext,
): void {
  // for logical && and || it's the expression itself
  // For ternarys, the key is the ternary itself
  // For `this`, it's the key is the class literal
  // For parameters, it's the parameter node
  // For variables, it's the declarator

  const { llvmBuilder: builder } = program;

  LLVM._LLVMPositionBuilderAtEnd(builder, assert(func.entry?.llvmBlock));

  let allocaId = 0;
  for (const [node, site] of func.stackAllocationSites) {
    const name = LLVMUtil.lower(`alloca~${allocaId++}`);
    site.ref = LLVM._LLVMBuildAlloca(
      builder,
      getLLVMType(LLVM, LLVMUtil, site.type),
      name,
    );
    LLVM._free(name);

    // Ternarys don't have an initialized value.
    // The stack allocation site is only used as a scratch area for the result.

    if (isClassDeclaration(node)) {
      // `this` always has parameter index 0
      const index = 0;
      LLVM._LLVMBuildStore(
        builder,
        LLVM._LLVMGetParam(assert(func.funcRef), index),
        site.ref,
      );
    } else if (isParameter(node)) {
      const index = node.$containerIndex! + Number(isWhackoMethod(func));
      LLVM._LLVMBuildStore(
        builder,
        LLVM._LLVMGetParam(assert(func.funcRef), index),
        site.ref,
      );
    }
  }

  for (const block of func.blocks.values()) {
    const { llvmBlock, instructions } = block;
    const terminated = block.terminator === instructions.at(-1);
    if (!terminated) {
      const badBlock = printBlockToString(block);
      console.log(badBlock);
      assert(false, "Block is not terminated");
    }
    LLVM._LLVMPositionBuilderAtEnd(program.llvmBuilder, assert(llvmBlock));

    for (const instruction of instructions) {
      instruction.ref = appendLLVMInstruction(
        program,
        func,
        LLVM,
        LLVMUtil,
        instruction,
      );
    }
  }
}

export function ensureFieldTrampolineCompiled(
  program: WhackoProgram,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  field: ConcreteField,
  type: InterfaceType,
): LLVMFieldTrampolineDefinition {
  const interfaceTypeName = getFullyQualifiedTypeName(type);
  const fullyQualifiedFieldName = `${interfaceTypeName}#${field.name}`;

  if (program.fieldTrampolines.has(fullyQualifiedFieldName)) {
    const trampoline = program.fieldTrampolines.get(fullyQualifiedFieldName)!;
    return trampoline;
  }

  const loweredParameterTypeArray = LLVMUtil.lowerPointerArray([
    getLLVMPointerType(LLVM),
  ]);
  const typeRef = LLVM._LLVMFunctionType(
    getLLVMPointerType(LLVM),
    loweredParameterTypeArray,
    1,
    Number(false) as LLVMBool,
  );
  LLVM._free(loweredParameterTypeArray);

  const loweredTrampolineName = LLVMUtil.lower(fullyQualifiedFieldName);
  const funcRef = LLVM._LLVMAddFunction(
    program.llvmModule,
    loweredTrampolineName,
    typeRef,
  );
  LLVM._free(loweredTrampolineName);
  const result: LLVMFieldTrampolineDefinition = {
    field,
    name: fullyQualifiedFieldName,
    funcRef,
    typeRef,
    type,
  };
  program.fieldTrampolines.set(fullyQualifiedFieldName, result);
  return result;
}

export function ensureMethodTrampolineCompiled(
  program: WhackoProgram,
  LLVM: LLVM,
  LLVMUtil: LLVMUtil,
  trampoline: TrampolineFunctionContext,
): LLVMValueRef {
  if (trampoline.funcRef) return trampoline.funcRef;

  const typeRef = getLLVMFunctionType(LLVM, LLVMUtil, trampoline.type);
  const name = LLVMUtil.lower(trampoline.name);
  const funcRef = LLVM._LLVMAddFunction(program.llvmModule, name, typeRef);

  LLVM._free(name);
  trampoline.funcRef = funcRef;
  return funcRef;
}
