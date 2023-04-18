import { Module } from "llvm-js";
import { reportErrorDiagnostic, reportWarningDiagnostic } from "./diagnostic";
import {
  buildFloatCastInstruction,
  buildIntegerCastInstruction,
  ConstFloatValue,
  ConstIntegerValue,
  createIntegerValue,
  ensureRuntime,
  InstructionKind,
  RuntimeValue,
  theInvalidValue,
  ValueKind,
  createRuntimeValue,
  createFloatValue,
  ensureDereferenced,
  buildUnreachable,
  buildBrIfInstruction,
  buildBasicBlock,
  buildUndefinedInstruction,
  buildInsertElementInstruction,
  buildFreeInstruction,
  buildIntToPtrInstruction,
  buildNewInstruction,
  buildMallocInstruction,
  buildPtrToIntInstruction,
  ScopeElementValue,
  buildCallInstruction,
  createStringValue,
  buildLoadInstruction,
  createFieldReference,
  VoidValue,
} from "./ir";
import {
  WhackoProgram,
  BuiltinFunctionParameters,
  addBuiltinToProgram,
  addBuiltinTypeToProgram,
  ensureCallableCompiled,
} from "./program";
import {
  getFloatType,
  IntegerKind,
  FloatType,
  FloatKind,
  ConcreteTypeKind,
  getIntegerType,
  isSignedIntegerKind,
  getIntegerBitCount,
  theInvalidType,
  getNullableType,
  ClassType,
  InterfaceType,
  isNumeric,
  getNonnullableType,
  simdOf,
  V128Type,
  getSize,
  getLaneCount,
  IntegerType,
  theUnresolvedFunctionType,
  isClassType,
  FunctionType,
  UnresolvedFunctionType,
  isAssignable,
  getStringType,
} from "./types";
import { assert, getFullyQualifiedTypeName, idCounter } from "./util";
import { isNumberObject } from "util/types";
import { FunctionDeclaration, isFunctionDeclaration } from "./generated/ast";

const simdInitialize =
  (type: V128Type) =>
  ({
    args,
    caller,
    funcType,
    getCurrentBlock,
    module,
    node,
    program,
    setCurrentBlock,
    typeParameters,
  }: BuiltinFunctionParameters) => {
    const laneCount = getLaneCount(type.v128Kind);
    const currentBlock = getCurrentBlock();

    let running = createRuntimeValue(
      buildUndefinedInstruction(caller, currentBlock, type),
      type,
    );

    for (let i = 0; i < laneCount; i++) {
      running = createRuntimeValue(
        buildInsertElementInstruction(
          caller,
          currentBlock,
          running,
          ensureRuntime(caller, currentBlock, args[i]),
          i,
        ),
      );
    }

    return running;
  };

const integerCast =
  (integerKind: IntegerKind) =>
  ({
    args,
    caller,
    program,
    module,
    node,
    getCurrentBlock,
  }: BuiltinFunctionParameters) => {
    const [value] = args;

    if (value === theInvalidValue) {
      return theInvalidValue;
    }

    const integerType = getIntegerType(integerKind);

    if (value.kind === ValueKind.Float || value.kind === ValueKind.Integer) {
      const compileTimeValue = value as ConstFloatValue | ConstIntegerValue;
      const resultValue = isSignedIntegerKind(integerType.integerKind)
        ? BigInt.asIntN(
            getIntegerBitCount(integerType.integerKind),
            BigInt(compileTimeValue.value),
          )
        : BigInt.asUintN(
            getIntegerBitCount(integerType.integerKind),
            BigInt(compileTimeValue.value),
          );

      // where do we have compile-time voids?
      return createIntegerValue(resultValue, integerType);
    } else if (
      value.kind === ValueKind.Runtime &&
      value.type &&
      isNumeric(value.type)
    ) {
      // i'm smort that's why
      // i copy-pastad
      // actually, since it's not imported, it might be autocomplete for all we know
      return createRuntimeValue(
        buildIntegerCastInstruction(
          caller,
          getCurrentBlock(),
          value as RuntimeValue,
          integerType,
        ),
      );
    } else {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Invalid cast: value type is not numeric.",
      );
      return theInvalidValue;
    }
  };

const floatCast =
  (floatKind: FloatKind) =>
  ({
    program,
    module,
    args,
    caller,
    node,
    getCurrentBlock,
  }: BuiltinFunctionParameters) => {
    const [value] = args;

    if (value === theInvalidValue) {
      return theInvalidValue;
    }

    const floatType = getFloatType(floatKind);

    if (value.kind === ValueKind.Float || value.kind === ValueKind.Integer) {
      const compileTimeValue = value as ConstFloatValue | ConstIntegerValue;
      const floatValue = Number(compileTimeValue.value);
      return createFloatValue(floatValue, floatType);

      // if value.type is null, we need to report a diagnostic, because it could be
      // a function reference, scope element, etc.
    } else if (
      value.kind === ValueKind.Runtime &&
      value.type &&
      isNumeric(value.type)
    ) {
      return createRuntimeValue(
        buildFloatCastInstruction(
          caller,
          getCurrentBlock(),
          value as RuntimeValue,
          floatType,
        ),
      );
    } else {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Invalid cast: value type is not numeric.",
      );
      return theInvalidValue;
    }
  };

export function registerDefaultBuiltins(program: WhackoProgram): void {
  addBuiltinToProgram(
    program,
    "unreachable",
    ({ caller, getCurrentBlock, setCurrentBlock }) => {
      const currentBlock = getCurrentBlock();
      buildUnreachable(caller, currentBlock);
      const nextBlock = buildBasicBlock(caller, "unreachable");
      setCurrentBlock(nextBlock);
      return {
        kind: ValueKind.Void,
        type: program.voidType,
      } as VoidValue;
    },
  );
  addBuiltinToProgram(program, "i8", integerCast(IntegerKind.I8));
  addBuiltinToProgram(program, "u8", integerCast(IntegerKind.U8));
  addBuiltinToProgram(program, "i16", integerCast(IntegerKind.I16));
  addBuiltinToProgram(program, "u16", integerCast(IntegerKind.U16));
  addBuiltinToProgram(program, "i32", integerCast(IntegerKind.I32));
  addBuiltinToProgram(program, "u32", integerCast(IntegerKind.U32));
  addBuiltinToProgram(program, "i64", integerCast(IntegerKind.I64));
  addBuiltinToProgram(program, "u64", integerCast(IntegerKind.U64));
  addBuiltinToProgram(program, "isize", integerCast(IntegerKind.ISize));
  addBuiltinToProgram(program, "usize", integerCast(IntegerKind.USize));
  addBuiltinToProgram(program, "f32", floatCast(FloatKind.F32));
  addBuiltinToProgram(program, "f64", floatCast(FloatKind.F64));
  addBuiltinToProgram(
    program,
    "assert",
    ({
      caller,
      program,
      module,
      node,
      setCurrentBlock,
      getCurrentBlock,
      funcType,
      typeParameters: [typeParam],
      args: [arg],
    }) => {
      arg = ensureDereferenced(caller, getCurrentBlock(), arg);
      switch (arg.kind) {
        case ValueKind.Integer:
        case ValueKind.Float: {
          if (!(arg as ConstIntegerValue | ConstFloatValue).value) {
            reportWarningDiagnostic(
              program,
              module,
              "assertion",
              node,
              "Value known to be falsy at compile-time.",
            );
            buildUnreachable(caller, getCurrentBlock());
            return theInvalidValue;
          }
          return arg;
        }
        case ValueKind.Null: {
          reportWarningDiagnostic(
            program,
            module,
            "assertion",
            node,
            "Nonnull assertion used on a compile-time-known null value.",
          );
          buildUnreachable(caller, getCurrentBlock());
          return theInvalidValue;
        }

        case ValueKind.Runtime: {
          const currentBlock = getCurrentBlock();
          const falsy = buildBasicBlock(caller, "falsy");
          const next = buildBasicBlock(caller, "next");

          buildBrIfInstruction(
            caller,
            currentBlock,
            arg as RuntimeValue,
            next,
            falsy,
          );

          setCurrentBlock(falsy);
          buildUnreachable(caller, falsy);

          setCurrentBlock(next);
          const value = {
            instruction: (arg as RuntimeValue).instruction,
            type: getNonnullableType(
              assert(arg.type, "The type must be set at this point."),
            ),
            kind: ValueKind.Runtime,
            valueRef: null,
          } as RuntimeValue;
          return value;
        }
        default: {
          return theInvalidValue;
        }
      }
    },
  );
  addBuiltinTypeToProgram(
    program,
    "Nullable",
    ({ module, node, program, typeParameters }) => {
      const [type] = typeParameters;
      if (type.kind === ConcreteTypeKind.Nullable) {
        return type;
      } else if (
        type.kind === ConcreteTypeKind.Class ||
        type.kind === ConcreteTypeKind.Interface
      ) {
        return getNullableType(type as ClassType | InterfaceType);
      } else {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          node,
          `Primitive types cannot be nullable.`,
        );
        return theInvalidType;
      }
    },
  );
  addBuiltinTypeToProgram(
    program,
    "NonNullable",
    ({ typeParameters: [nullableType] }) => {
      return getNonnullableType(nullableType);
    },
  );

  addBuiltinTypeToProgram(
    program,
    "v128",
    ({ module, typeParameters, node }) => {
      const [param] = typeParameters;
      if (isNumeric(param)) {
        return simdOf(param);
      }
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        `Generic type '${getFullyQualifiedTypeName(param)}' is not numeric.`,
      );
      return theInvalidType;
    },
  );

  addBuiltinToProgram(
    program,
    "heap.free",
    ({
      program,
      module,
      caller,
      getCurrentBlock,
      typeParameters: [argType],
      args: [arg],
      node,
    }) => {
      const currentBlock = getCurrentBlock();
      if (argType.kind === ConcreteTypeKind.Class) {
        buildFreeInstruction(
          caller,
          currentBlock,
          ensureRuntime(caller, currentBlock, arg),
        );
        return {
          kind: ValueKind.Void,
          type: program.voidType,
        };
      } else if (
        argType.kind === ConcreteTypeKind.Integer &&
        (argType as IntegerType).integerKind === IntegerKind.USize
      ) {
        const value = createRuntimeValue(
          buildIntToPtrInstruction(
            caller,
            currentBlock,
            program.ptrType,
            ensureRuntime(caller, currentBlock, arg),
          ),
          program.ptrType,
        );
        buildFreeInstruction(caller, getCurrentBlock(), value);
        return {
          kind: ValueKind.Void,
          type: program.voidType,
        };
      }

      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        `heap.free() can only free objects and raw pointers (usize).`,
      );
      return theInvalidValue;
    },
  );

  addBuiltinToProgram(
    program,
    "heap.malloc",
    ({ program, module, caller, getCurrentBlock, args: [arg], node }) => {
      const currentBlock = getCurrentBlock();
      const usizeType = getIntegerType(IntegerKind.USize);
      const value = ensureRuntime(caller, currentBlock, arg);

      const thePointerInstruction = buildMallocInstruction(
        caller,
        currentBlock,
        value,
      );
      const thePointerValue = createRuntimeValue(
        thePointerInstruction,
        program.ptrType,
      );
      const castedInstruction = buildPtrToIntInstruction(
        caller,
        currentBlock,
        usizeType,
        thePointerValue,
      );

      return createRuntimeValue(castedInstruction, usizeType);
    },
  );

  addBuiltinTypeToProgram(
    program,
    "UnresolvedFunction",
    () => theUnresolvedFunctionType,
  );

  addBuiltinToProgram(
    program,
    "types.forFieldsIn",
    ({
      args,
      caller,
      funcType,
      getCurrentBlock,
      module,
      node,
      program,
      setCurrentBlock,
      typeParameters,
    }) => {
      const [classType, contextType] = typeParameters;
      const [classValue, contextValue, unresolvedFunc] = args;
      if (!isClassType(classType)) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          node,
          `The first parameter of types.forIn must be a class type.`,
        );
        return theInvalidValue;
      }

      // some basic assumptions at this point
      assert(unresolvedFunc.type?.kind === ConcreteTypeKind.UnresolvedFunction);
      const unresolvedFunction = (unresolvedFunc as ScopeElementValue).element;
      assert(isFunctionDeclaration(unresolvedFunction.node));
      const currentBlock = getCurrentBlock();
      const runtimeClassValue = ensureRuntime(
        caller,
        currentBlock,
        contextValue,
      );
      const runtimeContext = ensureRuntime(caller, currentBlock, contextValue);

      for (const [name, field] of classType.fields) {
        // the compiled function must be the following type
        const targetFunctionType: FunctionType = {
          id: idCounter.value++,
          kind: ConcreteTypeKind.Function,
          llvmType: null,
          parameterTypes: [
            contextType,
            field.type,
            getStringType(program, module),
            classType,
          ],
          returnType: program.voidType,
        };

        const iteratorCallable = ensureCallableCompiled(
          program,
          module,
          unresolvedFunction.node as FunctionDeclaration,
          null,
          [field.type],
          caller.typeMap,
        );

        // validate the function
        if (
          !iteratorCallable ||
          !isAssignable(iteratorCallable.type, targetFunctionType)
        ) {
          reportErrorDiagnostic(
            program,
            module,
            "type",
            node,
            "Invalid callback, the function could not be compiled or the function type was not assignable to the correct function signature.",
          );
          return theInvalidValue;
        }

        const fieldReference = createFieldReference(
          runtimeClassValue,
          field,
          node,
        );
        const loadInst = buildLoadInstruction(
          caller,
          currentBlock,
          fieldReference,
        );
        const fieldRuntimeValue = createRuntimeValue(loadInst, field.type);
        buildCallInstruction(caller, currentBlock, iteratorCallable, [
          runtimeContext,
          fieldRuntimeValue,
          ensureRuntime(
            caller,
            currentBlock,
            createStringValue(program, module, name),
          ),
          runtimeClassValue,
        ]);
      }

      return {
        kind: ValueKind.Void,
        type: program.voidType,
      };
    },
  );

  addBuiltinTypeToProgram(
    program,
    "types.RawPointer",
    ({ module, node, program, scope, typeParameters }) => {
      return program.ptrType;
    },
  );

  addBuiltinToProgram(
    program,
    "types.asRawPointer",
    ({
      args,
      caller,
      funcType,
      getCurrentBlock,
      module,
      node,
      program,
      setCurrentBlock,
      typeParameters,
    }) => {
      const currentBlock = getCurrentBlock();
      const value = ensureRuntime(caller, currentBlock, args[0]);
      const intToPtr = buildIntToPtrInstruction(
        caller,
        currentBlock,
        program.ptrType,
        value,
      );
      return createRuntimeValue(intToPtr, program.ptrType);
    },
  );
}

/*




export function registerDefaultBuiltins(program: WhackoProgram) {
  addBuiltinToProgram(program, "i8", integerCast(IntegerKind.I8));
  addBuiltinToProgram(program, "u8", integerCast(IntegerKind.U8));
  addBuiltinToProgram(program, "i16", integerCast(IntegerKind.I16));
  addBuiltinToProgram(program, "u16", integerCast(IntegerKind.U16));
  addBuiltinToProgram(program, "i32", integerCast(IntegerKind.I32));
  addBuiltinToProgram(program, "u32", integerCast(IntegerKind.U32));
  addBuiltinToProgram(program, "i64", integerCast(IntegerKind.I64));
  addBuiltinToProgram(program, "u64", integerCast(IntegerKind.U64));
  addBuiltinToProgram(program, "isize", integerCast(IntegerKind.ISize));
  addBuiltinToProgram(program, "usize", integerCast(IntegerKind.USize));

  program.addBuiltin(
    "AShr",
    ({
      ctx,
      typeParameters,
      parameters,
      ast,
      pass,
      program,
    }: BuiltinFunctionProps) => {
      const [numberType] = typeParameters;
      const [value, bits] = parameters;
      if (numberType instanceof IntegerType) {
        // we are good
        if (
          value instanceof CompileTimeInteger &&
          bits instanceof CompileTimeInteger
        ) {
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, value.value >> bits.value)
            : BigInt.asUintN(numberType.bits, value.value >> bits.value);

          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(
                numberType.ty as IntegerEnumType,
                resultValue,
                ast,
              ),
            ),
          );
        } else {
          const compiledValue = pass.ensureCompiled(value);
          const compiledBits = pass.ensureCompiled(bits);
          const tmpNamePtr = program.LLVMUtil.lower(pass.getTempName());
          const ref = pass.LLVM._LLVMBuildAShr(
            pass.builder,
            compiledValue.ref,
            compiledBits.ref,
            tmpNamePtr,
          );
          pass.LLVM._free(tmpNamePtr);
          ctx.stack.push(new RuntimeValue(ref, numberType));
        }
      } else {
        pass.error(
          "Type",
          ast,
          `Operation not supported, AShr requires integer types.`,
        );
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin("Select", ({ parameters, typeParameters, ctx, pass }) => {
    const [cond, then, otherwise] = parameters;
    const [type] = typeParameters;
    if (cond instanceof CompileTimeBool) {
      ctx.stack.push(cond ? then : otherwise);
    } else {
      const compiledCond = pass.ensureCompiled(cond);
      const compiledThen = pass.ensureCompiled(then);
      const compiledOtherwise = pass.ensureCompiled(otherwise);

      const namePtr = program.LLVMUtil.lower(pass.getTempName());
      const ref = program.LLVM._LLVMBuildSelect(
        pass.builder,
        compiledCond.ref,
        compiledThen.ref,
        compiledOtherwise.ref,
        namePtr,
      );
      pass.LLVM._free(namePtr);
      ctx.stack.push(new RuntimeValue(ref, type));
    }
  });

  program.addBuiltin("Unreachable", ({ ctx, ast, pass }) => {
    // we want the code to exist afterwards so we need to generate two blocks
    const unreachableLabelName = pass.program.LLVMUtil.lower(
      pass.getTempName(),
    );
    const unreachableLabel = pass.LLVM._LLVMAppendBasicBlockInContext(
      pass.program.llvmContext,
      pass.func.funcRef,
      unreachableLabelName,
    );

    const nextLabelName = pass.program.LLVMUtil.lower(pass.getTempName());
    const nextLabel = pass.LLVM._LLVMAppendBasicBlockInContext(
      pass.program.llvmContext,
      pass.func.funcRef,
      nextLabelName,
    );

    // we need to make a branch to an unreachable so that we can continue compilation
    const trueRef = pass.LLVM._LLVMConstInt(pass.LLVM._LLVMIntType(1), 1n, 0);
    pass.LLVM._LLVMBuildCondBr(
      pass.builder,
      trueRef,
      unreachableLabel,
      nextLabel,
    );

    // create an unreachable label
    pass.LLVM._LLVMPositionBuilderAtEnd(pass.builder, unreachableLabel);
    ctx.stack.push(new CompileTimeInvalid(ast));
    pass.LLVM._LLVMBuildUnreachable(pass.builder);

    // then start building in the after label (which is never jumped too)
    pass.LLVM._LLVMPositionBuilderAtEnd(pass.builder, nextLabel);

    pass.LLVM._free(unreachableLabelName);
    pass.LLVM._free(nextLabelName);
  });

  program.addBuiltin(
    "And",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value & rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value & rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast),
            ),
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const addName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildAnd(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          addName,
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast),
          ),
        );
        pass.LLVM._free(addName);
      } else {
        pass.error("Type", ast, `Add type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin(
    "FAdd",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof FloatType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeFloat &&
          rhs instanceof CompileTimeFloat
        ) {
          // we perform a compile time add
          const resultValue = lhs.value + rhs.value;
          ctx.stack.push(
            new CompileTimeFloat(
              resultValue,
              new FloatType(lhs.ty.ty as Type.f32 | Type.f64, resultValue, ast),
            ),
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const addName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildFAdd(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          addName,
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new FloatType(lhs.ty.ty as Type.f32 | Type.f64, null, ast),
          ),
        );
        pass.LLVM._free(addName);
      } else {
        pass.error("Type", ast, `Add type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin(
    "Add",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value + rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value + rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast),
            ),
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const addName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildAdd(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          addName,
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast),
          ),
        );
        pass.LLVM._free(addName);
      } else {
        pass.error("Type", ast, `Add type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin(
    "Sub",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value - rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value - rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast),
            ),
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const subName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildSub(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          subName,
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast),
          ),
        );
        pass.LLVM._free(subName);
      } else {
        pass.error("Type", ast, `Sub type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin(
    "Mul",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value * rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value * rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast),
            ),
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const subName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildMul(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          subName,
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast),
          ),
        );
        pass.LLVM._free(subName);
      } else {
        pass.error("Type", ast, `Mul type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin("alloca", ({ program, parameters, pass, ctx, ast }) => {
    const { LLVM, LLVMUtil } = program;
    const voidType = new VoidType(ast);
    const ptrType = new PointerType(voidType, ast);
    const usizeType = new IntegerType(Type.usize, null, ast);
    const [size] = parameters;
    const compiledValue = pass.ensureCompiled(size);
    const name = pass.getTempNameRef();
    const ptrRef = LLVM._LLVMBuildArrayAlloca(
      pass.builder,
      ptrType.llvmType(LLVM, LLVMUtil)!,
      compiledValue.ref,
      name,
    );
    LLVM._free(name);

    const resultName = pass.getTempNameRef();
    const resultRef = LLVM._LLVMBuildPtrToInt(
      pass.builder,
      ptrRef,
      usizeType.llvmType(LLVM, LLVMUtil)!,
      resultName,
    );
    LLVM._free(resultName);

    ctx.stack.push(new RuntimeValue(resultRef, usizeType));
  });

  program.addBuiltin("malloc", ({ program, parameters, pass, ctx, ast }) => {
    const voidType = new VoidType(ast);
    const ptrType = new PointerType(voidType, ast);
    const usizeType = new IntegerType(Type.usize, null, ast);
    const { LLVM, LLVMUtil } = program;
    const [size] = parameters;
    assert(size.ty.isEqual(usizeType), "The type here must be usize.");
    const compiledSize = pass.ensureCompiled(size);
    const name = pass.getTempNameRef();
    const resultRef = pass.LLVM._LLVMBuildArrayMalloc(
      pass.builder,
      ptrType.llvmType(LLVM, LLVMUtil)!,
      compiledSize.ref,
      name,
    );
    LLVM._free(name);
    ctx.stack.push(new RuntimeValue(resultRef, usizeType));
  });

  program.addBuiltin("Log", ({ program, parameters, pass, ctx, ast }) => {
    const [strParameter] = parameters;

    if (strParameter instanceof CompileTimeString) {
      console.log(strParameter.value);
    } else {
      pass.error("Semantic", ast, "Log only accepts compile time strings.");
    }
  });

  // @name("types.castTo") export builtin castTo<T, U>(val: U): T;
  program.addBuiltin("types.castTo", (props) => {
    const { program, parameters, typeParameters, pass, ctx, ast } = props;
    const { LLVM, LLVMUtil } = program;
    const [castFrom, castTo] = typeParameters;
    const [castee] = parameters;
    if (
      castTo &&
      castTo.isNumeric &&
      castFrom &&
      castFrom.isNumeric &&
      castee &&
      castee.ty.isEqual(castFrom)
    ) {
      // we can perform the cast
      const builtinCast = assert(
        program.builtins.get(castTo.getName()),
        "The builtin cast must exist at this point.",
      );
      builtinCast(props);
    } else {
      ctx.stack.push(new CompileTimeInvalid(ast));
    }
  });

  program.addBuiltin(
    "types.ptr",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const { LLVM, LLVMUtil } = program;
      const [classType] = typeParameters;
      const [ptr] = parameters;
      const usizeType = new IntegerType(Type.usize, null, ast);

      if (classType instanceof StringType) {
        const compiledPtr = pass.ensureCompiled(ptr);
        const ref = compiledPtr.ref;
        const name = pass.getTempNameRef();
        const resultRef = LLVM._LLVMBuildPtrToInt(
          pass.builder,
          ref,
          usizeType.llvmType(LLVM, LLVMUtil)!,
          name,
        );
        LLVM._free(name);
        ctx.stack.push(new RuntimeValue(resultRef, usizeType));
      } else if (classType instanceof ConcreteClass) {
        const derefedPtr = pass.ensureDereferenced(ptr);
        assert(derefedPtr instanceof RuntimeValue);
        const ref = (derefedPtr as RuntimeValue).ref;
        const name = pass.getTempNameRef();
        const resultRef = LLVM._LLVMBuildPtrToInt(
          pass.builder,
          ref,
          usizeType.llvmType(LLVM, LLVMUtil)!,
          name,
        );
        LLVM._free(name);
        ctx.stack.push(new RuntimeValue(resultRef, usizeType));
      } else {
        ctx.stack.push(new CompileTimeInvalid(ast));
        pass.error(
          "Type",
          ast,
          `Cannot convert value to pointer, ${classType.getName()} is not a class.`,
        );
      }
    },
  );

  program.addBuiltin(
    "types.isInteger",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const [typeParameter] = typeParameters;
      ctx.stack.push(
        new CompileTimeBool(typeParameter instanceof IntegerType, ast),
      );
    },
  );

  program.addBuiltin(
    "types.ref",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const { LLVM, LLVMUtil } = program;
      const [classType] = typeParameters;
      const [ptr] = parameters;
      const usizeType = new IntegerType(Type.usize, null, ast);
      if (
        ptr.ty.isEqual(usizeType) &&
        (classType instanceof StringType || classType instanceof ConcreteClass)
      ) {
        const compiledValue = pass.ensureCompiled(ptr);

        const name = pass.getTempNameRef();
        const cast = LLVM._LLVMBuildIntToPtr(
          pass.builder,
          compiledValue.ref,
          classType.llvmType(LLVM, LLVMUtil)!,
          name,
        );
        LLVM._free(name);

        ctx.stack.push(new RuntimeValue(cast, classType));
      } else {
        // uhoh, invalid type
        pass.error(
          "Type",
          ast,
          `Cannot cast ${classType.getName()} to class type.`,
        );
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );

  program.addBuiltin(
    "memory.load",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const { LLVM, LLVMUtil } = program;
      const [type] = typeParameters;
      const [param] = parameters;

      if (type.isNumeric) {
        const ptrType = new PointerType(new VoidType(ast), ast);
        const numRef = pass.ensureCompiled(param);

        const ptrRefName = pass.getTempNameRef();
        const ptrRef = LLVM._LLVMBuildIntToPtr(
          pass.builder,
          numRef.ref,
          ptrType.llvmType(LLVM, LLVMUtil)!,
          ptrRefName,
        );
        LLVM._free(ptrRefName);

        const resultName = pass.getTempNameRef();
        const resultRef = LLVM._LLVMBuildLoad2(
          pass.builder,
          type.llvmType(LLVM, LLVMUtil)!,
          ptrRef,
          resultName,
        );
        LLVM._free(resultName);
        ctx.stack.push(new RuntimeValue(resultRef, type));
      } else {
        ctx.stack.push(new CompileTimeInvalid(ast));
        pass.error("Type", ast, "Cannot load non-numeric type.");
      }
    },
  );

  program.addBuiltin(
    "memory.store",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const [ptr, value] = parameters;
      const compiledPtr = pass.ensureCompiled(ptr);
      const compiledValue = pass.ensureCompiled(value);
      const [type] = typeParameters;
      if (type.isNumeric) {
        const name = program.LLVMUtil.lower(pass.getTempName());
        const type = program.LLVM._LLVMPointerType(
          program.LLVM._LLVMVoidType(),
          0,
        );
        const ptrCast = program.LLVM._LLVMBuildIntToPtr(
          pass.builder,
          compiledPtr.ref,
          type,
          name,
        );
        program.LLVM._LLVMBuildStore(pass.builder, compiledValue.ref, ptrCast);
        program.LLVM._free(name);
      } else {
        pass.error(
          "Type",
          ast,
          `Invalid store operation, value to be stored must be numeric.`,
        );
      }
      ctx.stack.push(new CompileTimeVoid(ast));
    },
  );

  const isUsize = (val: ExecutionContextValue) => {
    return val.ty instanceof IntegerType && val.ty.ty === Type.usize;
  };
  program.addBuiltin(
    "memory.copy",
    ({ program, pass, parameters, ast, ctx }) => {
      const [src, dest, count] = parameters;
      if (isUsize(src) && isUsize(dest) && isUsize(count)) {
        const compiledSrc = pass.ensureCompiled(src);
        const compiledDest = pass.ensureCompiled(dest);
        const compiledCount = pass.ensureCompiled(count);

        const ptrType = pass.LLVM._LLVMPointerType(
          pass.LLVM._LLVMVoidType(),
          0,
        );
        const ptrSrcCastName = program.LLVMUtil.lower(pass.getTempName());
        const ptrSrc = pass.LLVM._LLVMBuildIntToPtr(
          pass.builder,
          compiledSrc.ref,
          ptrType,
          ptrSrcCastName,
        );

        const ptrDestCastName = program.LLVMUtil.lower(pass.getTempName());
        const ptrDest = pass.LLVM._LLVMBuildIntToPtr(
          pass.builder,
          compiledDest.ref,
          ptrType,
          ptrDestCastName,
        );

        pass.LLVM._LLVMBuildMemCpy(
          pass.builder,
          ptrDest,
          1,
          ptrSrc,
          1,
          compiledCount.ref,
        );
        pass.LLVM._free(ptrSrcCastName);
        pass.LLVM._free(ptrDestCastName);
        ctx.stack.push(new CompileTimeVoid(ast));
      } else {
        ctx.stack.push(new CompileTimeInvalid(ast));
        pass.error(
          "Type",
          ast,
          `Invalid call to memory.copy, parameters must be usize.`,
        );
      }
    },
  );

  program.addBuiltin(
    "free",
    ({ ctx, pass, typeParameters, parameters, ast, program }) => {
      const { LLVM, LLVMUtil } = program;
      const [typeParameter] = typeParameters;
      const [ptr] = parameters;
      const usizeType = new IntegerType(Type.usize, null, ast);
      const voidType = new VoidType(ast);
      const ptrType = new PointerType(voidType, ast);

      // free class, already pointer
      if (typeParameter instanceof ConcreteClass) {
        const derefPtr = pass.ensureDereferenced(ptr);
        // class types are always compiled
        assert(
          derefPtr instanceof RuntimeValue,
          "We must be a runtime value at this point",
        );
        const ref = (derefPtr as RuntimeValue).ref;
        LLVM._LLVMBuildFree(pass.builder, ref);
        // usize
      } else if (typeParameter.isEqual(usizeType)) {
        const derefedPtr = pass.ensureCompiled(ptr);
        const ptrCastName = pass.getTempNameRef();
        const ptrCast = LLVM._LLVMBuildIntToPtr(
          pass.builder,
          derefedPtr.ref,
          ptrType.llvmType(LLVM, LLVMUtil)!,
          ptrCastName,
        );
        LLVM._free(ptrCastName);
        LLVM._LLVMBuildFree(pass.builder, ptrCast);
      }

      ctx.stack.push(new CompileTimeVoid(ast));
    },
  );

  program.addBuiltin(
    "Splat",
    ({ typeParameters, parameters, ast, program, pass, ctx }) => {
      const [splatType] = typeParameters;
      const [value] = parameters;
      if (value.ty.isEqual(splatType) && splatType.isNumeric) {
        const laneCount = Number(16n / splatType.size);
        const simdType = simdOf(splatType);
        const llvmSimdType = simdType.llvmType(program.LLVM, program.LLVMUtil)!;
        const compiledValue = pass.ensureCompiled(value);
        const i32Type = new IntegerType(Type.i32, 0n, ast).llvmType(
          program.LLVM,
          program.LLVMUtil,
        )!;

        const undef = pass.LLVM._LLVMGetUndef(llvmSimdType);
        let runningElement = undef;

        for (let i = 0; i < laneCount; i++) {
          const index = pass.LLVM._LLVMConstInt(i32Type, BigInt(i), 0);
          const name = program.LLVMUtil.lower(pass.getTempName());
          runningElement = pass.LLVM._LLVMBuildInsertElement(
            pass.builder,
            runningElement,
            compiledValue.ref,
            index,
            name,
          );
          pass.LLVM._free(name);
        }

        ctx.stack.push(new RuntimeValue(runningElement, simdType));
      }
    },
  );

  program.addBuiltin("i8x16", simdInitialize(Type.i8));
  program.addBuiltin("u8x16", simdInitialize(Type.u8));
  program.addBuiltin("i16x8", simdInitialize(Type.i16));
  program.addBuiltin("u16x8", simdInitialize(Type.u16));
  program.addBuiltin("i32x4", simdInitialize(Type.i32));
  program.addBuiltin("u32x4", simdInitialize(Type.u32));
  program.addBuiltin("f32x4", simdInitialize(Type.f32));
  program.addBuiltin("i64x2", simdInitialize(Type.i64));
  program.addBuiltin("u64x2", simdInitialize(Type.u64));
  program.addBuiltin("f64x2", simdInitialize(Type.f64));



  program.addBuiltin("isString", ({ typeParameters, ast, parameters, ctx }) => {
    const [param] = parameters;
    const [typeParam] = typeParameters;
    const isStringType =
      param.ty instanceof StringType && typeParam instanceof StringType;

    ctx.stack.push(new CompileTimeBool(isStringType, ast));
  });

  program.addBuiltin("f32", floatCast(32, Type.f32));
  program.addBuiltin("f64", floatCast(64, Type.f64));

  program.addBuiltin("types.is", ({ typeParameters, ast, ctx }) => {
    const [left, right] = typeParameters;
    const result = left.isEqual(right);
    ctx.stack.push(new CompileTimeBool(result, ast));
  });

  program.addBuiltin("types.isReference", ({ typeParameters, ast, ctx }) => {
    const [refType] = typeParameters;
    const result =
      refType instanceof StringType || refType instanceof ConcreteClass;
    ctx.stack.push(new CompileTimeBool(result, ast));
  });

  program.addBuiltin("types.isAssignableTo", ({ typeParameters, ast, ctx }) => {
    const [left, right] = typeParameters;
    const result = left.isAssignableTo(right);
    ctx.stack.push(new CompileTimeBool(result, ast));
  });

  program.addBuiltin("types.idOf", ({ typeParameters, ast, ctx, pass }) => {
    const [classType] = typeParameters;
    if (classType instanceof ConcreteClass) {
      const value = classType.id;
      ctx.stack.push(
        new CompileTimeInteger(value, new IntegerType(Type.u32, value, ast)),
      );
    } else {
      ctx.stack.push(new CompileTimeInvalid(ast));
      pass.error("Type", ast, `Type parameter is not a class.`);
    }
  });

  program.addBuiltin(
    "types.sizeOf",
    ({ typeParameters, parameters, ast, ctx, pass, program }) => {
      const { LLVM, LLVMUtil } = program;
      const [classType] = typeParameters;
      const [ptr] = parameters;
      const derefedPtr = pass.ensureDereferenced(ptr);

      const intType = new IntegerType(Type.usize, null, ast);
      if (classType instanceof StringType) {
        if (derefedPtr instanceof RuntimeValue) {
          // perform a load from the pointer location
          const refName = pass.getTempNameRef();
          const ref = LLVM._LLVMBuildLoad2(
            pass.builder,
            intType.llvmType(LLVM, LLVMUtil)!,
            derefedPtr.ref,
            refName,
          );
          LLVM._free(refName);
          ctx.stack.push(new RuntimeValue(ref, intType));
        } else {
          assert(
            derefedPtr instanceof CompileTimeString,
            "Dereferenced value must be a compile time string at this point.",
          );
          const value = Buffer.byteLength(
            (derefedPtr as CompileTimeString).value,
          );
          ctx.stack.push(new CompileTimeInteger(BigInt(value), intType));
        }
      } else if (classType instanceof ConcreteClass) {
        ctx.stack.push(new CompileTimeInteger(classType.offset, intType));
      } else {
        // uhoh
        pass.error(
          "Type",
          ast,
          `Type ${classType.getName()} is not a string or a reference.`,
        );
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    },
  );
}
*/
