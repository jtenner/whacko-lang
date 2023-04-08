import { AstNode } from "langium";
import { reportErrorDiagnostic } from "../diagnostic";
import {
  CallExpression,
  BinaryExpression,
  FunctionDeclaration,
  IfElseStatement,
  TypeExpression,
  isTypeID,
  ID,
  IntegerLiteral,
  FloatLiteral,
  MemberAccessExpression,
  Parameter,
  RootIdentifier,
  VariableDeclarator,
  ThisLiteral,
  isID,
  isNamedTypeExpression,
  NamespaceDeclaration,
  MethodClassMember,
  ConstructorClassMember,
  isMethodClassMember,
  isFunctionDeclaration,
  isConstructorClassMember,
  BuiltinDeclaration,
  NewExpression,
  DeclareFunction,
  ExternDeclaration,
  BinaryLiteral,
  ClassDeclaration,
  TrueLiteral,
  FalseLiteral,
  NullLiteral,
  OctalLiteral,
  HexLiteral,
  LeftUnaryExpression,
  RightUnaryExpression,
} from "../generated/ast";
import {
  BlockContext,
  BlockInstruction,
  buildInstruction,
  CallableFunctionContext,
  WhackoFunctionContext,
  WhackoMethodContext,
  InstructionKind,
  createIntegerValue,
  createScopeElement,
  isCompileTimeValue,
  buildCallInstruction,
  buildBasicBlock,
  buildDeclareFunction,
  buildExternFunction,
  buildBinaryInstruction,
  BinaryOperator,
  buildStoreInstruction,
  buildNewInstruction,
  theInvalidValue,
  RuntimeValue,
  ConstIntegerValue,
  ValueKind,
  ScopeElementValue,
  Value,
  ensureRuntime,
  createRuntimeValue,
  buildMethodReference,
  createFieldReference,
  FieldReferenceValue,
  VariableReferenceValue,
  ConstFloatValue,
  createFloatValue,
  StackAllocationSite,
  createVariableReference,
  buildLoadInstruction,
  theNullValue,
  MethodReferenceValue,
  buildLogicalNotInstruction,
  buildNegateInstruction,
  ensureDereferenced,
  buildBitwiseNotInstruction,
  asComptimeConditional,
  ComptimeConditional,
  buildBrIfInstruction,
  buildBrInstruction,
  buildReturnInstruction,
  theVoidValue,
} from "../ir";
import {
  ensureCallableCompiled,
  ensureConstructorCompiled,
  getBuiltinFunction,
  WhackoModule,
  WhackoProgram,
} from "../program";
import {
  Scope,
  getElementInScope,
  getScope,
  ScopeElementType,
  traverseScopePath,
} from "../scope";
import {
  getIntegerType,
  getFloatType,
  ConcreteTypeKind,
  IntegerKind,
  FloatKind,
  FunctionType,
  getOperatorOverloadMethod,
  resolveType,
  typesEqual,
  MethodType,
  ConcreteType,
  theInvalidType,
  isAssignable,
  resolveBuiltinType,
  getCallableType,
  isNumeric,
  IntegerType,
  isSignedIntegerKind,
  getSize,
  getIntegerBitCount,
  FloatType,
  TypeMap,
  resolveClass,
  getConstructorType,
  theVoidType,
  ClassType,
  NullableType,
  getNonnullableType,
  getNullableType,
} from "../types";
import {
  assert,
  BinaryOpString,
  I64_MAX,
  I64_MIN,
  isAssignmentOperator,
  logNode,
  assertIsBinaryOpString,
  stringOpToEnum,
  U64_MAX,
  UNREACHABLE,
} from "../util";
import { WhackoVisitor } from "../WhackoVisitor";
import { Module } from "llvm-js";

export function inferTypeParameters(
  program: WhackoProgram,
  module: WhackoModule,
  caller: CallExpression | NewExpression,
  args: Value[],
  declaration:
    | FunctionDeclaration
    | MethodClassMember
    | BuiltinDeclaration
    | ConstructorClassMember,
  concreteTypeParameters: ConcreteType[],
): ConcreteType[] {
  if (concreteTypeParameters.length) return concreteTypeParameters;

  const namesToIndices = new Map<string, number>();

  const typeParameters = isConstructorClassMember(declaration)
    ? declaration.$container.typeParameters
    : declaration.typeParameters;

  for (let i = 0; i < typeParameters.length; i++) {
    namesToIndices.set(typeParameters[i].name, i);
  }

  const result: (ConcreteType | null)[] = Array.from(
    { length: concreteTypeParameters.length },
    () => null,
  );

  for (let i = 0; i < declaration.parameters.length; i++) {
    const parameter = declaration.parameters[i];
    const typeExpression = parameter.type;

    if (!isTypeID(typeExpression) || typeExpression.typeParameters.length)
      continue;

    const { name } = typeExpression;
    if (!namesToIndices.has(name)) continue;

    const index = namesToIndices.get(name)!;
    const type = assert(args[i]).type;

    if (!type) continue;

    if (result[index]) {
      if (!typesEqual(result[index]!, type)) {
        reportErrorDiagnostic(
          program,
          module,
          "type",
          parameter.type,
          "Found mismatched types during type inference.",
        );
        result[index] = theInvalidType;
      }
    } else {
      result[index] = type;
    }
  }

  if (result.includes(null)) {
    reportErrorDiagnostic(
      program,
      module,
      "type",
      caller,
      "Type inference was incomplete.",
    );
  }

  // Fill in any missing types with invalid types
  for (let i = 0; i < result.length; i++) result[i] ??= theInvalidType;

  return result as ConcreteType[];
}

export function ensureAssignableParameters(
  program: WhackoProgram,
  module: WhackoModule,
  args: Value[],
  funcType: FunctionType,
  caller: CallExpression | NewExpression,
): boolean {
  const { parameterTypes } = funcType;
  if (args.length !== parameterTypes.length) {
    reportErrorDiagnostic(
      program,
      module,
      "type",
      caller,
      `Invalid call: parameter count does not match signature.`,
    );
    return false;
  }

  for (let i = 0; i < parameterTypes.length; i++) {
    const parameterType = assert(
      args[i].type,
      "The type for this parameter should already exist.",
    );

    if (!isAssignable(parameterType, parameterTypes[i]!)) {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        caller.parameters[i],
        `Argument not assignable to parameter type in signature.`,
      );
      return false;
    }
  }

  return true;
}

export function callBinaryOperatorOverload(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  overload: WhackoMethodContext,
  lhsValue: RuntimeValue,
  rhsValue: RuntimeValue,
): Value {
  // 1. assert parameter length is 1 for operator
  assert(
    overload.type.parameterTypes.length === 1,
    "Binary operator overload must have exactly one parameter; check getOperatorOverloadMethod.",
  );

  // 2. assert lhs is assignable to thisType
  assert(
    lhsValue.type && isAssignable(overload.type.thisType, lhsValue.type),
    "Binary expression LHS type is not assignable to the overload `this` type.",
  );

  // 3. assert rhs assignable to first parameter of overload

  assert(
    rhsValue.type &&
      isAssignable(overload.type.parameterTypes[0], rhsValue.type),
    "Binary expression RHS type is not assignable to the overload's first parameter",
  );

  return createRuntimeValue(
    buildCallInstruction(ctx, currentBlock, overload, [lhsValue, rhsValue]),
  );
}

export function callUnaryOperatorOverload(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  overload: WhackoMethodContext,
  operand: RuntimeValue,
): Value {
  // 1. Assert parameter length is zero for operator.

  assert(
    overload.type.parameterTypes.length === 0,
    "Unary operator overloads must not have any parameters; check getOperatorOverloadMethod.",
  );

  // 2. Assert operand is assignable to thisType.

  assert(
    operand.type && isAssignable(overload.type.thisType, operand.type),
    "Unary expression operand type is not assignable to the overload `this` type.",
  );

  return createRuntimeValue(
    buildCallInstruction(ctx, currentBlock, overload, [operand]),
  );
}

export function computeCompileTimeBoolBinaryExpression(
  program: WhackoProgram,
  module: WhackoModule,
  lhsValue: ConstIntegerValue,
  rhsValue: ConstIntegerValue,
  node: BinaryExpression,
): Value {
  const lhsBoolValue = lhsValue.value;
  const rhsBoolValue = rhsValue.value;
  let resultValue: bigint;

  switch (assertIsBinaryOpString(node.op)) {
    // "=" should have already been handled.
    case "&":
    case "&=": {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Use && and &&= instead of & or &=",
      );
      return theInvalidValue;
    }
    case "&&":
    case "&&=": {
      resultValue = lhsBoolValue && rhsBoolValue;
      break;
    }
    case "|":
    case "|=": {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Use || and ||= instead of | or |=",
      );
      return theInvalidValue;
    }
    case "||":
    case "||=": {
      resultValue = lhsBoolValue || rhsBoolValue;
      break;
    }
    case "^":
    case "^=": {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Use != instead of ^ or ^=",
      );
      return theInvalidValue;
    }
    case "==": {
      resultValue = BigInt(!!lhsBoolValue === !!rhsBoolValue);
      break;
    }
    case "!=": {
      resultValue = BigInt(!!lhsBoolValue !== !!rhsBoolValue);
      break;
    }
    default: {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Invalid binary operator for Boolean operation.",
      );
      return theInvalidValue;
    }
  }

  return createIntegerValue(resultValue, getIntegerType(IntegerKind.Bool));
}

export function computeCompileTimeIntegerBinaryExpression(
  program: WhackoProgram,
  module: WhackoModule,
  lhsValue: ConstIntegerValue,
  rhsValue: ConstIntegerValue,
  node: BinaryExpression,
): Value {
  const kind = (lhsValue.type as IntegerType).integerKind;
  const signed = isSignedIntegerKind(kind);
  const bits = getIntegerBitCount(kind);
  const lhsIntegerValue = signed
    ? BigInt.asIntN(bits, lhsValue.value)
    : BigInt.asUintN(bits, lhsValue.value);
  const rhsIntegerValue = signed
    ? BigInt.asIntN(bits, rhsValue.value)
    : BigInt.asUintN(bits, rhsValue.value);
  let resultValue: bigint;

  switch (assertIsBinaryOpString(node.op)) {
    // "=" should have already been handled.
    case "+":
    case "+=": {
      resultValue = lhsIntegerValue + rhsIntegerValue;
      break;
    }
    case "-":
    case "-=": {
      resultValue = lhsIntegerValue - rhsIntegerValue;
      break;
    }
    case "*":
    case "*=": {
      resultValue = lhsIntegerValue * rhsIntegerValue;
      break;
    }
    case "/":
    case "/=": {
      resultValue = lhsIntegerValue / rhsIntegerValue;
      break;
    }
    case "**":
    case "**=": {
      resultValue = lhsIntegerValue ** rhsIntegerValue;
      break;
    }
    case "&":
    case "&=": {
      resultValue = lhsIntegerValue & rhsIntegerValue;
      break;
    }
    case "&&":
    case "&&=": {
      resultValue = lhsIntegerValue && rhsIntegerValue;
      break;
    }
    case "|":
    case "|=": {
      resultValue = lhsIntegerValue | rhsIntegerValue;
      break;
    }
    case "||":
    case "||=": {
      resultValue = lhsIntegerValue || rhsIntegerValue;
      break;
    }
    case "^":
    case "^=": {
      resultValue = lhsIntegerValue ^ rhsIntegerValue;
      break;
    }
    case "<<=":
    case "<<": {
      resultValue = lhsIntegerValue << rhsIntegerValue;
      resultValue = signed
        ? BigInt.asIntN(bits, resultValue)
        : BigInt.asUintN(bits, resultValue);
      break;
    }
    case ">>=":
    case ">>": {
      resultValue = lhsIntegerValue >> rhsIntegerValue;
      break;
    }
    case "==": {
      const value = BigInt(lhsValue.value === rhsValue.value);
      return createIntegerValue(value, getIntegerType(IntegerKind.Bool));
    }
    case "!=": {
      const value = BigInt(lhsValue.value !== rhsValue.value);
      return createIntegerValue(value, getIntegerType(IntegerKind.Bool));
    }
    default: {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Invalid binary operator for integer operation.",
      );
      return theInvalidValue;
    }
  }
  return createIntegerValue(resultValue, assert(lhsValue.type) as IntegerType);
}

export function computeCompileTimeFloatBinaryExpression(
  program: WhackoProgram,
  module: WhackoModule,
  ctx: WhackoFunctionContext,
  lhsValue: ConstFloatValue,
  rhsValue: ConstFloatValue,
  node: BinaryExpression,
): Value {
  const lhsFloatValue = lhsValue.value;
  const rhsFloatValue = rhsValue.value;
  let resultValue: number;

  switch (assertIsBinaryOpString(node.op)) {
    // "=" should have already been handled.
    case "+":
    case "+=": {
      resultValue = lhsFloatValue + rhsFloatValue;
      break;
    }
    case "-":
    case "-=": {
      resultValue = lhsFloatValue - rhsFloatValue;
      break;
    }
    case "*":
    case "*=": {
      resultValue = lhsFloatValue * rhsFloatValue;
      break;
    }
    case "/":
    case "/=": {
      resultValue = lhsFloatValue / rhsFloatValue;
      break;
    }
    case "**":
    case "**=": {
      resultValue = lhsFloatValue ** rhsFloatValue;
      break;
    }
    case "&&":
    case "&&=": {
      resultValue = lhsFloatValue && rhsFloatValue;
      break;
    }
    case "||":
    case "||=": {
      resultValue = lhsFloatValue || rhsFloatValue;
      break;
    }
    case "==": {
      const value = BigInt(lhsValue.value === rhsValue.value);
      return createIntegerValue(value, getIntegerType(IntegerKind.Bool));
    }
    case "!=": {
      const value = BigInt(lhsValue.value !== rhsValue.value);
      return createIntegerValue(value, getIntegerType(IntegerKind.Bool));
    }
    default: {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        node,
        "Invalid binary operator for integer operation.",
      );
      return theInvalidValue;
    }
  }

  return createFloatValue(resultValue, assert(lhsValue.type) as FloatType);
}

export function resolveTypeParametersPatiently(
  program: WhackoProgram,
  module: WhackoModule,
  ctx: WhackoFunctionContext,
  typeParameters: TypeExpression[],
  callerScope: Scope,
  typeMap: TypeMap,
): ConcreteType[] | null {
  let invalidCall = false;
  const concreteTypeParameters: ConcreteType[] = [];
  for (const typeParameter of typeParameters) {
    const concreteTypeParameter = resolveType(
      program,
      module,
      typeParameter,
      callerScope,
      typeMap,
    );

    if (!concreteTypeParameter) {
      reportErrorDiagnostic(
        program,
        module,
        "type",
        typeParameter,
        "Type parameter failed to resolve.",
      );
      invalidCall = true;
      concreteTypeParameters.push(theInvalidType);
      continue;
    }

    concreteTypeParameters.push(concreteTypeParameter);
  }

  return invalidCall ? null : concreteTypeParameters;
}

interface IntegerLiteralLike extends AstNode {
  value: string;
}

export function buildIntegerLiteralLike(
  program: WhackoProgram,
  module: WhackoModule,
  ctx: WhackoFunctionContext,
  expression: IntegerLiteralLike,
): ConstIntegerValue | null {
  const value = BigInt(expression.value);

  if (value < I64_MIN || value > U64_MAX) {
    reportErrorDiagnostic(
      program,
      module,
      "type",
      expression,
      "Integer literal exceeds valid bounds.",
    );
    return null;
  }

  const type = getIntegerType(
    value <= I64_MAX ? IntegerKind.I64 : IntegerKind.U64,
  );

  return createIntegerValue(value, type);
}

export function getThis(ctx: WhackoMethodContext): VariableReferenceValue {
  return createVariableReference(
    assert(
      ctx.stackAllocationSites.get(ctx.thisType.node),
      "Hey, get this! getThis() didn't get `this`!",
    ),
  );
}

export class FunctionContextResolutionPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }

  private module!: WhackoModule;
  private ctx!: WhackoFunctionContext;
  private currentBlock!: BlockContext;

  value: Value | null = null;

  get assertValue(): Value {
    const value = assert(
      this.value,
      "Value does not exist in FunctionContextResolutionPass",
    );
    this.value = null;
    return value;
  }

  visitWhackoFunction(ctx: WhackoFunctionContext): void {
    const { module, node, type } = ctx;

    if (type.kind === ConcreteTypeKind.Method) {
      assert(
        isMethodClassMember(node) || isConstructorClassMember(node),
        "Concrete type and AST node are mismatched.",
      );

      if (isConstructorClassMember(node)) {
        assert(
          type.returnType === theVoidType,
          "Constructor return type should be void.",
        );
      }
    }

    if (type.kind === ConcreteTypeKind.Function) {
      assert(
        isFunctionDeclaration(node),
        "Concrete type and AST node mismatched.",
      );
    }

    this.module = module;
    this.ctx = ctx;

    ctx.entry = this.currentBlock = buildBasicBlock(ctx, "entry");

    this.visit(node);

    const lastBlock = this.currentBlock;
    if (
      ctx.type.returnType.kind === ConcreteTypeKind.Void &&
      !lastBlock.terminator
    ) {
      buildReturnInstruction(this.ctx, lastBlock, theVoidValue);
    } else if (!lastBlock.terminator) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node,
        "Functions/methods that return values must be terminated by a return statement.",
      );
    }

    for (const block of ctx.blocks.values()) {
      if (block === lastBlock) continue;
      assert(
        block.terminator,
        "All blocks should have terminators at this point",
      );
    }
  }

  override visitParameter(node: Parameter): void {
    const scope = assert(
      getScope(node),
      "The scope for this parameter must exist.",
    );
    const parameterType = resolveType(
      this.program,
      this.module,
      node.type,
      scope,
      this.ctx.typeMap,
    );

    if (!parameterType) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.type,
        `Unable to resolve parameter type.`,
      );

      return;
    }

    // Note to selves:
    // Codegen can figure out whether this is a parameter and what its index is
    // by looking at the entries:
    // for (const [node, variable] of ctx.variables)
    //     if (isParameter(node))
    //          ... = node.$containerIndex! + (isMethodClassMember(node.$container) ? 1 : 0)

    const variable: StackAllocationSite = {
      immutable: false,
      type: parameterType,
      ref: null,
      node,
    };

    // Note to selves:
    // In codegen, we can populate the .ref fields of each Variable entry with
    // alloca instructions. We will never have to declare allocas up front.

    this.ctx.stackAllocationSites.set(node, variable);
  }

  override visitIntegerLiteral(expression: IntegerLiteral): void {
    this.value =
      buildIntegerLiteralLike(
        this.program,
        this.module,
        this.ctx,
        expression,
      ) ?? theInvalidValue;
  }

  override visitBinaryExpression(node: BinaryExpression): void {
    this.visit(node.lhs);
    const lhsValue = this.assertValue;
    this.visit(node.rhs);
    const rhsValue = this.assertValue;

    if (!lhsValue.type || !rhsValue.type) {
      this.value = theInvalidValue;
      // TODO: Check to see if this needs to be a diagnostic
      return;
    }

    const overload = getOperatorOverloadMethod(
      this.program,
      this.module,
      lhsValue.type,
      rhsValue.type,
      node.op,
      node,
    );

    if (overload) {
      this.value = callBinaryOperatorOverload(
        this.ctx,
        this.currentBlock,
        overload,
        ensureRuntime(this.ctx, this.currentBlock, lhsValue),
        ensureRuntime(this.ctx, this.currentBlock, rhsValue),
      );
      return;
    }

    // Assignments are always stores, unless they're overloaded (which is handled above)
    // Therefore, we can just build a store instruction.
    // Codegen can (a) turn field references into a GEP.
    //             (b) turn variable references into that pointer.
    if (node.op === "=") {
      if (
        lhsValue.kind !== ValueKind.Field &&
        lhsValue.kind !== ValueKind.Variable
      ) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.lhs,
          "LHS of assignment operator must be a field or variable reference",
        );
      }
      buildStoreInstruction(
        this.ctx,
        this.currentBlock,
        lhsValue as FieldReferenceValue | VariableReferenceValue,
        ensureRuntime(this.ctx, this.currentBlock, rhsValue),
      );
      this.value = rhsValue;
      return;
    }

    const isLogicalOperator =
      node.op === "&&" ||
      node.op === "&&=" ||
      node.op === "||" ||
      node.op === "||=";

    // wait, I can make this simple
    if (!isLogicalOperator && !isNumeric(lhsValue.type)) {
      // TODO: Strings and function references
      // we could special-case regular "="
      if (lhsValue.type.kind === ConcreteTypeKind.Str)
        UNREACHABLE('ICE/TODO: `foo = "bar";`');
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.lhs,
        `Binary operator value must be numeric.`,
      );
      this.value = theInvalidValue;
      return;
    }

    // LHS must be nullable, an integer, or a float
    // RHS must be nullable, a class, an integer, or a float
    // and the result type is the LHS type for && and RHS type for ||
    if (isLogicalOperator) {
      if (
        lhsValue.type.kind !== ConcreteTypeKind.Nullable &&
        lhsValue.type.kind !== ConcreteTypeKind.Integer &&
        lhsValue.type.kind !== ConcreteTypeKind.Float
      ) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.lhs,
          "The LHS value of logical AND/OR must be an integer, float, or nullable class",
        );
        this.value = theInvalidValue;
        return;
      }

      // By this point, we know that the LHS value type is a nullable class, an integer, or a float.
      // Nothing can go wrong with the below check. (I hope!)
      if (
        !typesEqual(
          getNonnullableType(lhsValue.type),
          getNonnullableType(rhsValue.type),
        )
      ) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.rhs,
          "The RHS type must equal or be the nullable version of the LHS type.",
        );
        this.value = theInvalidValue;
        return;
      }
    } else if (!typesEqual(lhsValue.type, rhsValue.type)) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.lhs,
        `Binary operator value types must be equal.`,
      );
      this.value = theInvalidValue;
      return;
    }

    let resultValue: Value;

    if (isCompileTimeValue(lhsValue) && isCompileTimeValue(rhsValue)) {
      switch (lhsValue.kind) {
        case ValueKind.Integer: {
          const integerType = lhsValue.type as IntegerType;
          if (integerType.integerKind === IntegerKind.Bool)
            resultValue = computeCompileTimeBoolBinaryExpression(
              this.program,
              this.module,
              lhsValue as ConstIntegerValue,
              rhsValue as ConstIntegerValue,
              node,
            );
          else
            resultValue = computeCompileTimeIntegerBinaryExpression(
              this.program,
              this.module,
              lhsValue as ConstIntegerValue,
              rhsValue as ConstIntegerValue,
              node,
            );
          break;
        }
        case ValueKind.Float: {
          resultValue = computeCompileTimeFloatBinaryExpression(
            this.program,
            this.module,
            this.ctx,
            lhsValue as ConstFloatValue,
            rhsValue as ConstFloatValue,
            node,
          );
          break;
        }
        default:
          UNREACHABLE(
            "InstructionKind must be a CompileTimeInteger or CompileTimeFloat",
          );
      }
    } else {
      if (node.op === "**" || node.op === "**=")
        UNREACHABLE("TODO: Handle exponentiation");

      switch (node.op) {
        case "&&":
        case "&&=":
        case "||":
        case "||=": {
          const lhsType = lhsValue.type;
          const rhsType = rhsValue.type;
          if (
            lhsType.kind !== ConcreteTypeKind.Integer &&
            lhsType.kind !== ConcreteTypeKind.Float &&
            lhsType.kind !== ConcreteTypeKind.Nullable
          ) {
            this.value = theInvalidValue;
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node.lhs,
              "The LHS of logical and expression must be a integer, float, or nullable type.",
            );
            return;
          }

          const isLogicalAnd = node.op === "&&" || node.op === "&&=";
          const site = {
            immutable: false,
            ref: null,
            node,
            type: isLogicalAnd ? lhsType : rhsType,
          };
          this.ctx.stackAllocationSites.set(node, site);

          const truthyBlock = buildBasicBlock(this.ctx, "truthy");
          const falsyBlock = buildBasicBlock(this.ctx, "falsy");
          const nextBlock = buildBasicBlock(this.ctx, "next");

          if (isLogicalAnd) {
            // isTruthy(lhs) ? rhs : lhs

            const runtimeLhsValue = ensureRuntime(
              this.ctx,
              this.currentBlock,
              lhsValue,
            );

            buildBrIfInstruction(
              this.ctx,
              this.currentBlock,
              runtimeLhsValue,
              truthyBlock,
              falsyBlock,
            );

            // LHS is truthy: set the temporary variable to contain the LHS
            this.currentBlock = truthyBlock;
            const runtimeRhsValue = ensureRuntime(
              this.ctx,
              this.currentBlock,
              rhsValue,
            );
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(site),
              runtimeRhsValue,
            );
            buildBrInstruction(this.ctx, this.currentBlock, nextBlock);

            // LHS is falsy: set the temporary variable to contain the LHS
            this.currentBlock = falsyBlock;
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(site),
              runtimeLhsValue,
            );
            buildBrInstruction(this.ctx, this.currentBlock, nextBlock);

            // Extract the result value from the temporary variable
            this.currentBlock = nextBlock;
            const loadInst = buildLoadInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(site),
            );
            resultValue = createRuntimeValue(loadInst, rhsType);
          } else {
            // isTruthy(lhs) ? lhs : rhs

            const runtimeLhsValue = ensureRuntime(
              this.ctx,
              this.currentBlock,
              lhsValue,
            );

            buildBrIfInstruction(
              this.ctx,
              this.currentBlock,
              runtimeLhsValue,
              truthyBlock,
              falsyBlock,
            );

            // LHS is truthy: set the temporary variable to contain the LHS
            this.currentBlock = truthyBlock;
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(site),
              runtimeLhsValue,
            );
            buildBrInstruction(this.ctx, this.currentBlock, nextBlock);

            // LHS is falsy: set the temporary variable to contain the RHS
            this.currentBlock = falsyBlock;
            const runtimeRhsValue = ensureRuntime(
              this.ctx,
              this.currentBlock,
              rhsValue,
            );
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(site),
              runtimeRhsValue,
            );
            buildBrInstruction(this.ctx, this.currentBlock, nextBlock);

            // Extract the result value from the temporary variable
            this.currentBlock = nextBlock;
            const loadInst = buildLoadInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(site),
            );
            resultValue = createRuntimeValue(loadInst, rhsType);
          }
          break;
        }
        default: {
          resultValue =
            node.op === "="
              ? rhsValue
              : createRuntimeValue(
                  buildBinaryInstruction(
                    this.ctx,
                    this.currentBlock,
                    ensureRuntime(this.ctx, this.currentBlock, lhsValue),
                    stringOpToEnum(
                      assertIsBinaryOpString(node.op),
                    ) as BinaryOperator,
                    ensureRuntime(this.ctx, this.currentBlock, rhsValue),
                  ),
                );
        }
      }
    }

    if (isAssignmentOperator(node)) {
      if (
        lhsValue.kind !== ValueKind.Field &&
        lhsValue.kind !== ValueKind.Variable
      ) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.lhs,
          "LHS of assignment operator must be a field or variable reference",
        );
      }

      buildStoreInstruction(
        this.ctx,
        this.currentBlock,
        lhsValue as FieldReferenceValue | VariableReferenceValue,
        ensureRuntime(this.ctx, this.currentBlock, resultValue),
      );
      // Do not modify resultValue. `foo &&= bar` does not return `bar`.
    }

    this.value = resultValue;
  }

  override visitNewExpression(node: NewExpression): void {
    const argumentValues: RuntimeValue[] = [];
    for (const parameter of node.parameters) {
      this.visit(parameter);
      argumentValues.push(
        ensureRuntime(this.ctx, this.currentBlock, this.assertValue),
      );
    }

    // Copied from visitCallExpression (helper time?)
    const thisTypeMap: TypeMap =
      this.ctx.type.kind === ConcreteTypeKind.Method
        ? (this.ctx.type as MethodType).thisType.resolvedTypes
        : new Map();

    const callerScope = assert(getScope(node));

    // Partially extracted from types.ts
    const scopeElement = isNamedTypeExpression(node.classType)
      ? traverseScopePath(
          this.program,
          this.module,
          callerScope,
          node.classType.path,
        )
      : getElementInScope(callerScope, node.classType.name);

    if (!scopeElement) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.classType,
        "Could not resolve class in `new` expression.",
      );
      this.value = theInvalidValue;
      return;
    }

    if (scopeElement.type !== ScopeElementType.Class) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.classType,
        "`new` expression was not used on a class.",
      );
      this.value = theInvalidValue;
      return;
    }

    const concreteTypeParameters = resolveTypeParametersPatiently(
      this.program,
      this.module,
      this.ctx,
      node.classType.typeParameters,
      callerScope,
      thisTypeMap,
    );

    if (!concreteTypeParameters) {
      this.value = theInvalidValue;
      return;
    }

    const classDeclaration = scopeElement.node as ClassDeclaration;
    const constructorMaybe =
      (classDeclaration.members.find((member) =>
        isConstructorClassMember(member),
      ) as ConstructorClassMember | undefined) ?? null;

    const inferredTypeParameters = constructorMaybe
      ? inferTypeParameters(
          this.program,
          this.module,
          node,
          argumentValues,
          constructorMaybe as ConstructorClassMember,
          concreteTypeParameters,
        )
      : concreteTypeParameters;

    const concreteClass = resolveClass(
      this.program,
      this.module,
      scopeElement,
      inferredTypeParameters,
    );

    if (!concreteClass) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node,
        "You done goofed! Cannot resolve referenced class.",
      );
      this.value = theInvalidValue;
      return;
    }

    const constructorType = getConstructorType(
      this.program,
      this.module,
      concreteClass,
      constructorMaybe,
    );
    if (!constructorType) {
      // Diagnostics have already been reported by getParameterTypes()
      this.value = theInvalidValue;
      return;
    }

    const assignable = ensureAssignableParameters(
      this.program,
      this.module,
      argumentValues,
      constructorType,
      node,
    );

    if (!assignable) {
      this.value = theInvalidValue;
      return;
    }

    const compiledConstructor = ensureConstructorCompiled(
      assert(assert(scopeElement.scope).module),
      concreteClass,
      constructorType,
      assert(constructorMaybe),
    );

    if (!compiledConstructor) {
      this.value = theInvalidValue;
      return;
    }

    const result = createRuntimeValue(
      buildNewInstruction(this.ctx, this.currentBlock, concreteClass),
    );

    argumentValues.unshift(result);
    buildCallInstruction(
      this.ctx,
      this.currentBlock,
      compiledConstructor,
      argumentValues,
    );

    this.value = result;
  }

  override visitFloatLiteral(expression: FloatLiteral): void {
    this.value = createFloatValue(
      Number.parseFloat(expression.value),
      getFloatType(FloatKind.F64),
    );
  }

  override visitRootIdentifier(expression: RootIdentifier): void {
    const root = expression.root;
    if (isID(root)) {
      const scope = assert(
        getScope(expression),
        "The scope must exist at this point.",
      );
      const element = getElementInScope(scope, root.name);

      if (!element) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          root,
          `Cannot find element in scope`,
        );
        this.value = theInvalidValue;
        return;
      }

      const result = createScopeElement(element);
      if (result) {
        this.value = result;
      } else {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          root,
          `Could not resolve scope element ${root.name}`,
        );
      }
    }
  }

  override visitThisLiteral(expression: ThisLiteral): void {
    if (this.ctx.isWhackoMethod) {
      const methodCtx = this.ctx as WhackoMethodContext;
      this.value = getThis(methodCtx);
      return;
    }
    reportErrorDiagnostic(
      this.program,
      this.module,
      "type",
      expression,
      `"this" does not exist in this context.`,
    );
    this.value = theInvalidValue;
  }

  override visitMemberAccessExpression(node: MemberAccessExpression): void {
    this.visit(node.memberRoot);
    const root = this.assertValue;

    if (root.kind === ValueKind.ScopeElement) {
      // and we have to switch here, *on the scopeelementtype*
      const scopeElement = (root as ScopeElementValue).element;

      switch (scopeElement.type) {
        // or an enum
        case ScopeElementType.VariableDeclarator: {
          // We need to handle pushing fields if it's a class
          const variable = this.ctx.stackAllocationSites.get(scopeElement.node);
          if (!variable) {
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node.member,
              "Invalid variable access?",
            );
            this.value = theInvalidValue;
            return;
          }

          // It needs to be a field reference or a variable reference
          const rootValue = createRuntimeValue(
            buildLoadInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(variable),
            ),
          );
          const rootInstructionType = variable.type;
          if (rootInstructionType.kind === ConcreteTypeKind.Class) {
            const classType = variable.type as ClassType;
            const field = classType.fields.get(node.member.name);
            if (field) {
              this.value = createFieldReference(rootValue, field);
              return;
            }

            const methodNodeMaybe =
              (classType.node.members.find(
                (member) =>
                  isMethodClassMember(member) &&
                  member.name.name === node.member.name,
              ) as MethodClassMember | undefined) ?? null;

            if (methodNodeMaybe) {
              this.value = buildMethodReference(rootValue, methodNodeMaybe);
              return;
            } else {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node.memberRoot,
                `Invalid property access: ${node.member.name} does not exist.`,
              );
              this.value = theInvalidValue;
              return;
            }
            // ConcreteTypeKind.Class
            // I have no idea what's going on
          } else {
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node,
              rootInstructionType.kind === ConcreteTypeKind.Nullable
                ? "Nullable types require a runtime assertion (use '!.' instead of '.')."
                : "Cannot perform field access on non-class values.",
            );
            this.value = theInvalidValue;
            return;
          }
        }
        case ScopeElementType.Namespace: {
          const inner = scopeElement.exports?.get(node.member.name);
          if (!inner) {
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node.member,
              `Could not find element '${node.member.name}'.`,
            );
            this.value = theInvalidValue;
            return;
          }

          // we aren't done
          // wait, this function looks up the scope element
          this.value = createScopeElement(inner);
          return;
        }
        case ScopeElementType.Enum: {
          assert(false, "TODO");
        }
        default: {
          reportErrorDiagnostic(
            this.program,
            this.module,
            "type",
            node,
            "Invalid member access expression",
          );
          this.value = theInvalidValue;
          return;
        }
      }
    }

    UNREACHABLE(
      "visitMemberAccessExpression received a non-ScopeElement instruction as a memberRoot",
    );
  }

  override visitCallExpression(node: CallExpression): void {
    this.visit(node.callRoot);
    const callRoot = this.assertValue;

    const scope = assert(
      getScope(node),
      "The scope must exist for this node at this point.",
    );

    const thisTypeMap =
      this.ctx.type.kind === ConcreteTypeKind.Method
        ? (this.ctx.type as MethodType).thisType.resolvedTypes
        : new Map();

    const concreteTypeParameters = resolveTypeParametersPatiently(
      this.program,
      this.module,
      this.ctx,
      node.typeParameters,
      scope,
      thisTypeMap,
    );
    if (!concreteTypeParameters) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node,
        "Unable to resolve type parameters",
      );
      this.value = theInvalidValue;
      return;
    }

    const argumentValues: Value[] = [];
    for (const parameter of node.parameters) {
      this.visit(parameter);

      const parameterValue = this.assertValue;
      argumentValues.push(parameterValue);
    }

    switch (callRoot.kind) {
      case ValueKind.ScopeElement: {
        const callRootScopeElement = callRoot as ScopeElementValue;
        const scopeElement = callRootScopeElement.element;

        switch (scopeElement.type) {
          case ScopeElementType.Function: {
            const scope = assert(getScope(scopeElement.node));
            const declaration = scopeElement.node as FunctionDeclaration;
            const module = assert(
              scope.module,
              "The module for this scope must be set.",
            );
            const inferredTypeParameters = inferTypeParameters(
              this.program,
              module,
              node,
              argumentValues,
              declaration,
              concreteTypeParameters,
            );

            const compiledFunctionMaybe = ensureCallableCompiled(
              this.program,
              module,
              declaration,
              null,
              inferredTypeParameters,
              thisTypeMap,
            );

            if (!compiledFunctionMaybe) {
              this.value = theInvalidValue;
              return;
            }

            const funcType = compiledFunctionMaybe.type;

            const assignable = ensureAssignableParameters(
              this.program,
              this.module,
              argumentValues,
              funcType,
              node,
            );

            if (!assignable) {
              this.value = theInvalidValue;
              return;
            }

            const compiledArguments = argumentValues.map((value) =>
              ensureRuntime(this.ctx, this.currentBlock, value),
            );

            this.value = createRuntimeValue(
              buildCallInstruction(
                this.ctx,
                this.currentBlock,
                compiledFunctionMaybe,
                compiledArguments,
              ),
            );
            return;
          }
          case ScopeElementType.Builtin: {
            const declaration = scopeElement.node as BuiltinDeclaration;

            const inferredTypeParameters = inferTypeParameters(
              this.program,
              this.module,
              node,
              argumentValues,
              declaration,
              concreteTypeParameters,
            );

            const funcType = getCallableType(
              this.program,
              this.module,
              declaration,
              null,
              inferredTypeParameters,
            );

            if (!funcType) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node,
                "Could not resolve function type of builtin",
              );
              this.value = theInvalidValue;
              return;
            }

            const assignable = ensureAssignableParameters(
              this.program,
              this.module,
              argumentValues,
              funcType,
              node,
            );

            if (!assignable) {
              this.value = theInvalidValue;
              return;
            }

            const builtin = getBuiltinFunction(this.program, declaration);

            if (!builtin) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node,
                "Builtin could not be found",
              );
              this.value = theInvalidValue;
              return;
            }

            this.value = builtin({
              args: argumentValues,
              caller: this.ctx,
              funcType,
              module: this.module,
              node,
              program: this.program,
              typeParameters: inferredTypeParameters,
              getCurrentBlock: () => this.currentBlock,
              setCurrentBlock: (block) => {
                this.currentBlock = block;
              },
            });
            return;
          }
          case ScopeElementType.DeclareFunction: {
            if (concreteTypeParameters.length !== 0) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node.callRoot,
                "Declare functions do not have type parameters",
              );
              this.value = theInvalidValue;
              return;
            }

            const declaration = scopeElement.node as DeclareFunction;
            const funcType = getCallableType(
              this.program,
              this.module,
              declaration,
              null,
              concreteTypeParameters,
            );

            if (!funcType) {
              this.value = theInvalidValue;
              return;
            }

            const assignable = ensureAssignableParameters(
              this.program,
              this.module,
              argumentValues,
              funcType,
              node,
            );

            if (!assignable) {
              this.value = theInvalidValue;
              return;
            }

            const compiledArgumentValues = argumentValues.map((value) =>
              ensureRuntime(this.ctx, this.currentBlock, value),
            );

            const callable = buildDeclareFunction(
              this.program,
              this.module,
              funcType,
              declaration,
            );

            this.value = createRuntimeValue(
              buildCallInstruction(
                this.ctx,
                this.currentBlock,
                callable,
                compiledArgumentValues,
              ),
            );
            return;
          }
          case ScopeElementType.Extern: {
            if (concreteTypeParameters.length !== 0) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node.callRoot,
                "Extern functions do not have type parameters",
              );
              this.value = theInvalidValue;
              return;
            }

            const declaration = scopeElement.node as ExternDeclaration;

            const funcType = getCallableType(
              this.program,
              this.module,
              declaration,
              null,
              concreteTypeParameters,
            );

            if (!funcType) {
              this.value = theInvalidValue;
              return;
            }

            const assignable = ensureAssignableParameters(
              this.program,
              this.module,
              argumentValues,
              funcType,
              node,
            );

            if (!assignable) {
              this.value = theInvalidValue;
              return;
            }

            // TODO: (cont.) ^^^ to here into a helper (this code is repeated a lot)

            const compiledArgumentValues = argumentValues.map((value) =>
              ensureRuntime(this.ctx, this.currentBlock, value),
            );

            const callable = buildExternFunction(
              this.program,
              this.module,
              funcType,
              declaration,
            );

            this.value = createRuntimeValue(
              buildCallInstruction(
                this.ctx,
                this.currentBlock,
                callable,
                compiledArgumentValues,
              ),
            );
            return;
          }
          default: {
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node,
              "Referenced element is not callable",
            );
            this.value = theInvalidValue;
            return;
          }
        }
      }
      case ValueKind.Method: {
        const methodReference = callRoot as MethodReferenceValue;
        const declaration = methodReference.target;
        assert(isMethodClassMember(declaration));
        const scope = assert(getScope(node));
        const module = assert(
          scope.module,
          "The module for this scope must be set.",
        );
        const inferredTypeParameters = inferTypeParameters(
          this.program,
          module,
          node,
          argumentValues,
          declaration,
          concreteTypeParameters,
        );

        const thisType = methodReference.thisValue.type;
        assert(
          thisType.kind === ConcreteTypeKind.Class,
          "thisType must be of a class type",
        );

        const compiledFunctionMaybe = ensureCallableCompiled(
          this.program,
          module,
          declaration,
          thisType as ClassType,
          inferredTypeParameters,
          thisTypeMap,
        );

        if (!compiledFunctionMaybe) {
          this.value = theInvalidValue;
          return;
        }

        const funcType = compiledFunctionMaybe.type as MethodType;

        const assignable = ensureAssignableParameters(
          this.program,
          this.module,
          argumentValues,
          funcType,
          node,
        );

        assert(
          isAssignable(thisType, funcType.thisType),
          `'this' must be assignable to the method signature.`,
        );

        if (!assignable) {
          this.value = theInvalidValue;
          return;
        }

        argumentValues.unshift(methodReference.thisValue);
        const compiledArguments = argumentValues.map((value) =>
          ensureRuntime(this.ctx, this.currentBlock, value),
        );

        this.value = createRuntimeValue(
          buildCallInstruction(
            this.ctx,
            this.currentBlock,
            compiledFunctionMaybe,
            compiledArguments,
          ),
        );
        return;
      }
      case ValueKind.ConcreteFunction:
        UNREACHABLE("TODO: Calling function pointers");
      default: {
        // We can't move this case any further
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.callRoot,
          "Referenced call root is not callable.",
        );
        this.value = theInvalidValue;
        return;
      }
    }
  }

  override visitTrueLiteral(expression: TrueLiteral): void {
    this.value = createIntegerValue(1n, getIntegerType(IntegerKind.Bool));
  }

  override visitFalseLiteral(expression: FalseLiteral): void {
    this.value = createIntegerValue(0n, getIntegerType(IntegerKind.Bool));
  }

  override visitNullLiteral(expression: NullLiteral): void {
    this.value = theNullValue;
  }

  override visitOctalLiteral(expression: OctalLiteral): void {
    this.value =
      buildIntegerLiteralLike(
        this.program,
        this.module,
        this.ctx,
        expression,
      ) ?? theInvalidValue;
  }

  override visitBinaryLiteral(expression: BinaryLiteral): void {
    this.value =
      buildIntegerLiteralLike(
        this.program,
        this.module,
        this.ctx,
        expression,
      ) ?? theInvalidValue;
  }

  override visitHexLiteral(expression: HexLiteral): void {
    this.value =
      buildIntegerLiteralLike(
        this.program,
        this.module,
        this.ctx,
        expression,
      ) ?? theInvalidValue;
  }

  override visitRightUnaryExpression(node: RightUnaryExpression): void {
    this.visit(node.operand);
    const operand = this.assertValue;

    if (!operand.type) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.operand,
        "Invalid operand for a unary expression",
      );
      this.value = theInvalidValue;
      return;
    }

    const overload = getOperatorOverloadMethod(
      this.program,
      this.module,
      operand.type,
      null,
      node.op,
      node,
    );

    if (overload) {
      this.value = callUnaryOperatorOverload(
        this.ctx,
        this.currentBlock,
        overload,
        ensureRuntime(this.ctx, this.currentBlock, operand),
      );
      return;
    }

    switch (node.op) {
      case "!": {
        const builtin = assert(
          this.program.builtinFunctions.get("assert"),
          "The assert builtin must exist... how ironic.",
        );

        this.value = builtin({
          args: [operand],
          caller: this.ctx,
          funcType: {
            kind: ConcreteTypeKind.Function,
            llvmType: null,
            returnType: getNonnullableType(operand.type),
            parameterTypes: [operand.type],
          },
          module: this.module,
          node,
          program: this.program,
          typeParameters: [assert(operand.type)],
          getCurrentBlock: () => this.currentBlock,
          setCurrentBlock: (block) => {
            this.currentBlock = block;
          },
        });
        return;
      }
      // do we support prefix increment/decrement? it's fine either way
      // supporting and not supporting it have their pros and cons
      case "++":
      case "--": {
        if (isNumeric(operand.type)) {
          reportErrorDiagnostic(
            this.program,
            this.module,
            "type",
            node,
            "Non-overloaded increment/decrement only acts on numeric values.",
          );

          this.value = theInvalidValue;
          return;
        }

        // right, but we actually need to set the variable
        // no wonder why Binaryen doesn't make any sense to me :P
        // It's interesting how (relatively) easy it was
        if (
          operand.kind !== ValueKind.Variable &&
          operand.kind !== ValueKind.Field
        ) {
          reportErrorDiagnostic(
            this.program,
            this.module,
            "type",
            node,
            "Non-overloaded increment/decrement only acts on variables and fields.",
          );
          this.value = theInvalidValue;
          return;
        }

        if (
          operand.kind === ValueKind.Variable &&
          (operand as VariableReferenceValue).variable.immutable
        ) {
          reportErrorDiagnostic(
            this.program,
            this.module,
            "type",
            node,
            `Referenced variable is immutable and cannot be incremented/decremented.`,
          );
          this.value = theInvalidValue;
          return;
        }

        const operandReference = operand as
          | FieldReferenceValue
          | VariableReferenceValue;
        const loaded = createRuntimeValue(
          buildLoadInstruction(this.ctx, this.currentBlock, operandReference),
        );

        const operandType = assert(operand.type);
        const modified = createRuntimeValue(
          buildBinaryInstruction(
            this.ctx,
            this.currentBlock,
            loaded,
            node.op === "++" ? BinaryOperator.Add : BinaryOperator.Sub,
            ensureRuntime(
              this.ctx,
              this.currentBlock,
              operandType.kind === ConcreteTypeKind.Integer
                ? createIntegerValue(1n, operandType as IntegerType)
                : createFloatValue(1, operandType as FloatType),
            ),
          ),
        );

        buildStoreInstruction(
          this.ctx,
          this.currentBlock,
          operandReference,
          modified,
        );

        this.value = loaded;
        return;
      }
    }
  }

  override visitLeftUnaryExpression(node: LeftUnaryExpression): void {
    this.visit(node.operand);
    const operand = ensureDereferenced(
      this.ctx,
      this.currentBlock,
      this.assertValue,
    );

    if (!operand.type) {
      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.operand,
        "Invalid operand for a unary expression",
      );
      this.value = theInvalidValue;
      return;
    }

    const overload = getOperatorOverloadMethod(
      this.program,
      this.module,
      operand.type,
      null,
      node.op,
      node,
    );

    if (overload) {
      this.value = callUnaryOperatorOverload(
        this.ctx,
        this.currentBlock,
        overload,
        ensureRuntime(this.ctx, this.currentBlock, operand),
      );
      return;
    }

    switch (node.op) {
      case "!": {
        const boolType = getIntegerType(IntegerKind.Bool);
        switch (operand.kind) {
          case ValueKind.Integer: {
            this.value = createIntegerValue(
              BigInt(!(operand as ConstIntegerValue).value),
              boolType,
            );
            return;
          }
          case ValueKind.Float: {
            this.value = createIntegerValue(
              BigInt(!(operand as ConstFloatValue).value),
              boolType,
            );
            return;
          }
          case ValueKind.Runtime: {
            if (operand.type.kind === ConcreteTypeKind.Class) {
              this.value = createIntegerValue(0n, boolType);
              return;
            }

            if (!operand.type || !isNumeric(operand.type)) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node,
                "The operand must be numeric or an object.",
              );
              this.value = theInvalidValue;
              return;
            }

            this.value = createRuntimeValue(
              buildLogicalNotInstruction(
                this.ctx,
                this.currentBlock,
                operand as RuntimeValue,
              ),
            );

            return;
          }
          default: {
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node,
              "Operation not supported.",
            );
            this.value = theInvalidValue;
            return;
          }
        }
      }
      case "-": {
        switch (operand.kind) {
          case ValueKind.Integer: {
            const integerType = operand.type as IntegerType;
            if (!isSignedIntegerKind(integerType.integerKind)) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node.operand,
                "Only signed integer types can be negated",
              );
              this.value = theInvalidValue;
              return;
            }

            this.value = createIntegerValue(
              BigInt.asIntN(
                getIntegerBitCount(integerType.integerKind),
                -(operand as ConstIntegerValue).value,
              ),
              integerType,
            );
          }
          case ValueKind.Float: {
            const floatType = operand.type as FloatType;
            this.value = createFloatValue(
              -(operand as ConstFloatValue).value,
              floatType,
            );
            return;
          }
          case ValueKind.Runtime: {
            if (!operand.type || !isNumeric(operand.type)) {
              reportErrorDiagnostic(
                this.program,
                this.module,
                "type",
                node,
                "The operand must be numeric.",
              );
              this.value = theInvalidValue;
              return;
            }
            this.value = createRuntimeValue(
              buildNegateInstruction(
                this.ctx,
                this.currentBlock,
                operand as RuntimeValue,
              ),
            );
            return;
          }
          default: {
            reportErrorDiagnostic(
              this.program,
              this.module,
              "type",
              node,
              "Operation not supported on given operand.",
            );
            this.value = theInvalidValue;
            return;
          }
        }
      }
      case "~": {
        if (
          operand.type &&
          operand.type.kind === ConcreteTypeKind.Integer &&
          (operand.type as IntegerType).integerKind !== IntegerKind.Bool
        ) {
          if (operand.kind === ValueKind.Runtime) {
            this.value = createRuntimeValue(
              buildBitwiseNotInstruction(
                this.ctx,
                this.currentBlock,
                operand as RuntimeValue,
              ),
            );
            return;
          } else {
            const integerType = operand.type as IntegerType;
            const integerKind = integerType.integerKind;
            const integerOperand = operand as ConstIntegerValue;

            this.value = createIntegerValue(
              isSignedIntegerKind(integerKind)
                ? BigInt.asIntN(
                    getIntegerBitCount(integerKind),
                    ~integerOperand.value,
                  )
                : BigInt.asUintN(
                    getIntegerBitCount(integerKind),
                    ~integerOperand.value,
                  ),
              integerType,
            );
            return;
          }
        }

        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node,
          "Operation not supported on given operand.",
        );
        this.value = theInvalidValue;
        return;
      }
    }
  }

  override visitIfElseStatement(node: IfElseStatement): void {
    this.visit(node.condition);
    const condition = ensureDereferenced(
      this.ctx,
      this.currentBlock,
      this.assertValue,
    );

    switch (asComptimeConditional(condition)) {
      case ComptimeConditional.Truthy: {
        this.visit(node.truthy);
        return;
      }
      case ComptimeConditional.Falsy: {
        if (node.falsy) this.visit(node.falsy);
        return;
      }
      case ComptimeConditional.Runtime: {
        const truthy = buildBasicBlock(this.ctx, "truthy");
        const end = buildBasicBlock(this.ctx, "end");
        const falsy = node.falsy ? buildBasicBlock(this.ctx, "falsy") : end;

        buildBrIfInstruction(
          this.ctx,
          this.currentBlock,
          ensureRuntime(this.ctx, this.currentBlock, condition),
          truthy,
          falsy,
        );

        this.currentBlock = truthy;
        this.visit(node.truthy);
        if (!truthy.terminator)
          buildBrInstruction(this.ctx, this.currentBlock, end);

        if (node.falsy) {
          this.currentBlock = falsy!;
          this.visit(node.falsy);
          if (!falsy!.terminator)
            buildBrInstruction(this.ctx, this.currentBlock, end);
        }

        this.currentBlock = end;
        return;
      }
    }
  }
}
