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
  isThisLiteral,
  ExpressionStatement,
  ReturnStatement,
  isInterfaceMethodDeclaration,
  InterfaceMethodDeclaration,
  InterfaceMember,
  ClassMember,
  WhileStatement,
  BreakStatement,
  ContinueStatement,
  isVariableDeclarator,
  isParameter,
  StringLiteral,
  isInterfaceDeclaration,
  isClassDeclaration,
  isBinaryExpression,
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
  createScopeElementValue,
  isCompileTimeValue,
  buildCallInstruction,
  buildBasicBlock,
  buildDeclareFunction,
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
  createMethodReference,
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
  TypedValue,
  CallableKind,
  buildConstInstruction,
  ComptimeValue,
  createStringValue,
  buildPtrToIntInstruction,
  GCBarrierKind,
  isFieldValue,
  isVariableValue,
  printInstructionToString,
  getValueString,
} from "../ir";
import {
  buildExternFunction,
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
  ClassType,
  NullableType,
  getNonnullableType,
  getNullableType,
  InterfaceType,
  getStringType,
  isInterfaceType,
  isClassType,
  isReferenceType,
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
  getFullyQualifiedTypeName,
  idCounter,
} from "../util";
import { WhackoVisitor } from "../WhackoVisitor";
import { Module } from "llvm-js";

export function getGCBarrierKind(
  ctx: CallableFunctionContext,
  target: FieldReferenceValue | VariableReferenceValue,
): GCBarrierKind {
  const isInConstructor = isConstructorClassMember(ctx.node);
  // const isArrayStore = isArrayStore(target);
  const isTargetInterface = isInterfaceType(target.type);
  const isTargetClass = isClassType(target.type);

  if (isTargetInterface || isTargetClass) {
    return isInConstructor ? GCBarrierKind.Backward : GCBarrierKind.Forward;
  }
  return GCBarrierKind.Unset;
}

export function inferTypeParameters(
  program: WhackoProgram,
  module: WhackoModule,
  caller: CallExpression | NewExpression,
  args: Value[],
  declaration:
    | FunctionDeclaration
    | MethodClassMember
    | BuiltinDeclaration
    | ConstructorClassMember
    | InterfaceMethodDeclaration,
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
  for (let i = 0; i < result.length; i++)
    result[i] = result[i] ?? theInvalidType;

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

    if (!isAssignable(parameterTypes[i]!, parameterType)) {
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

export function ensureGCRoot(
  ctx: WhackoFunctionContext,
  currentBlock: BlockContext,
  value: Value,
  node: AstNode,
  force: boolean,
) {
  const $container = node.$container;

  const isAssignment =
    isVariableDeclarator($container) ||
    (isBinaryExpression($container) && isAssignmentOperator($container));

  if (force || (value.type && isReferenceType(value.type) && !isAssignment)) {
    const rootSite = {
      immutable: false,
      node,
      ref: null,
      type: value.type,
      value: null,
    } as StackAllocationSite;
    ctx.stackAllocationSites.set(node, rootSite);

    buildStoreInstruction(
      ctx,
      currentBlock,
      createVariableReference(rootSite),
      ensureRuntime(ctx, currentBlock, value),
      GCBarrierKind.Unset,
    );
  }
}

export interface LoopContext {
  name: string;
  nextBlock: BlockContext;
  conditionBlock: BlockContext;
}

export class WIRGenPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }

  private module!: WhackoModule;
  private ctx!: WhackoFunctionContext;
  private currentBlock!: BlockContext;
  loopContext: LoopContext[] = [];

  value: Value | null = null;

  get assertValue(): Value {
    const value = assert(this.value, "Value does not exist in WIRGenPass");
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
          type.returnType === this.program.voidType,
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
      buildReturnInstruction(this.ctx, lastBlock, {
        kind: ValueKind.Void,
        type: this.program.voidType,
      });
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
      node,
      ref: null,
      type: parameterType,
      value: null,
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
    const theStrType = getStringType(this.program, this.module);
    this.visit(node.lhs);
    const lhs = this.assertValue;
    const derefLHS = ensureDereferenced(this.ctx, this.currentBlock, lhs);

    this.visit(node.rhs);
    const rhsValue = this.assertValue;
    const derefRHS = ensureDereferenced(this.ctx, this.currentBlock, rhsValue);

    if (!derefLHS.type || !derefRHS.type) {
      this.value = theInvalidValue;
      // TODO: Check to see if this needs to be a diagnostic
      return;
    }

    const overload = getOperatorOverloadMethod(
      this.program,
      this.module,
      derefLHS.type,
      derefRHS.type,
      node.op,
      node,
    );

    if (overload) {
      const value = (this.value = callBinaryOperatorOverload(
        this.ctx,
        this.currentBlock,
        overload,
        ensureRuntime(this.ctx, this.currentBlock, derefLHS),
        ensureRuntime(this.ctx, this.currentBlock, derefRHS),
      ));
      ensureGCRoot(this.ctx, this.currentBlock, value, node, false);
      return;
    }

    // Assignments are always stores, unless they're overloaded (which is handled above)
    // Therefore, we can just build a store instruction.
    // Codegen can (a) turn field references into a GEP.
    //             (b) turn variable references into that pointer.
    if (node.op === "=") {
      if (!isFieldValue(lhs) && !isVariableValue(lhs)) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.lhs,
          "LHS of assignment operator must be a field or variable reference",
        );
      } else if (!isAssignable(lhs.type, derefRHS.type)) {
        const lhsType = getFullyQualifiedTypeName(lhs.type);
        const rhsType = getFullyQualifiedTypeName(derefRHS.type);
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.lhs,
          "RHS of assignment operator must be assignable to the RHS",
        );
      } else {
        buildStoreInstruction(
          this.ctx,
          this.currentBlock,
          lhs,
          ensureRuntime(this.ctx, this.currentBlock, derefRHS),
          getGCBarrierKind(this.ctx, lhs),
        );
      }
      this.value = derefRHS;
      return;
    }

    const isLogicalOperator =
      node.op === "&&" ||
      node.op === "&&=" ||
      node.op === "||" ||
      node.op === "||=";

    if (!isLogicalOperator && !isNumeric(derefLHS.type)) {
      // TODO: Strings and function references
      // we could special-case regular "="
      if (derefLHS.type === theStrType) UNREACHABLE('ICE/TODO: `foo = "bar";`');
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
        derefLHS.type.kind !== ConcreteTypeKind.Nullable &&
        derefLHS.type.kind !== ConcreteTypeKind.Integer &&
        derefLHS.type.kind !== ConcreteTypeKind.Float
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
          getNonnullableType(derefLHS.type),
          getNonnullableType(derefRHS.type),
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
    } else if (!typesEqual(derefLHS.type, derefRHS.type)) {
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

    if (isCompileTimeValue(derefLHS) && isCompileTimeValue(derefRHS)) {
      switch (derefLHS.type.kind) {
        case ConcreteTypeKind.Integer: {
          const integerType = derefLHS.type as IntegerType;
          if (integerType.integerKind === IntegerKind.Bool)
            resultValue = computeCompileTimeBoolBinaryExpression(
              this.program,
              this.module,
              derefLHS as ConstIntegerValue,
              derefRHS as ConstIntegerValue,
              node,
            );
          else
            resultValue = computeCompileTimeIntegerBinaryExpression(
              this.program,
              this.module,
              derefLHS as ConstIntegerValue,
              derefRHS as ConstIntegerValue,
              node,
            );
          break;
        }
        case ConcreteTypeKind.Float: {
          resultValue = computeCompileTimeFloatBinaryExpression(
            this.program,
            this.module,
            this.ctx,
            derefLHS as ConstFloatValue,
            derefRHS as ConstFloatValue,
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
          const lhsType = derefLHS.type;
          const rhsType = derefRHS.type;
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
          const site: StackAllocationSite = {
            immutable: false,
            node,
            ref: null,
            type: isLogicalAnd ? lhsType : rhsType,
            value: null,
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
              derefLHS,
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
              derefRHS,
            );
            const variableReference = createVariableReference(site);
            const barrierKind = getGCBarrierKind(this.ctx, variableReference);
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              variableReference,
              runtimeRhsValue,
              barrierKind,
            );
            buildBrInstruction(this.ctx, this.currentBlock, nextBlock);

            // LHS is falsy: set the temporary variable to contain the LHS
            this.currentBlock = falsyBlock;
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              variableReference,
              runtimeLhsValue,
              barrierKind,
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
              derefLHS,
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
            const variableReference = createVariableReference(site);
            const barrierKind = getGCBarrierKind(this.ctx, variableReference);
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              variableReference,
              runtimeLhsValue,
              barrierKind,
            );
            buildBrInstruction(this.ctx, this.currentBlock, nextBlock);

            // LHS is falsy: set the temporary variable to contain the RHS
            this.currentBlock = falsyBlock;
            const runtimeRhsValue = ensureRuntime(
              this.ctx,
              this.currentBlock,
              derefRHS,
            );
            buildStoreInstruction(
              this.ctx,
              this.currentBlock,
              variableReference,
              runtimeRhsValue,
              barrierKind,
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
              ? derefRHS
              : createRuntimeValue(
                  buildBinaryInstruction(
                    this.ctx,
                    this.currentBlock,
                    ensureRuntime(this.ctx, this.currentBlock, derefLHS),
                    stringOpToEnum(
                      assertIsBinaryOpString(node.op),
                    ) as BinaryOperator,
                    ensureRuntime(this.ctx, this.currentBlock, derefRHS),
                  ),
                );
        }
      }
    }

    if (isAssignmentOperator(node)) {
      if (!isFieldValue(lhs) && !isVariableValue(lhs)) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.lhs,
          "LHS of assignment operator must be a field or variable reference",
        );
      } else {
        buildStoreInstruction(
          this.ctx,
          this.currentBlock,
          lhs,
          ensureRuntime(this.ctx, this.currentBlock, resultValue),
          getGCBarrierKind(this.ctx, lhs),
        );
      }

      // Do not modify resultValue. `foo &&= bar` does not return `bar`.
    }

    this.value = resultValue;
    ensureGCRoot(this.ctx, this.currentBlock, resultValue, node, false);
  }

  override visitStringLiteral(expression: StringLiteral): void {
    const theStrType = getStringType(this.program, this.module);
    const newInst = buildConstInstruction(
      this.ctx,
      this.currentBlock,
      createStringValue(this.program, this.module, expression.value),
    );

    this.value = createRuntimeValue(newInst, theStrType);
    ensureGCRoot(this.ctx, this.currentBlock, this.value, expression, false);
    return;
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
      this.program,
      assert(scopeElement.scope?.module),
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

    ensureGCRoot(this.ctx, this.currentBlock, result, node, true);

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

      if (isVariableDeclarator(element.node) || isParameter(element.node)) {
        this.value = createVariableReference(
          assert(
            this.ctx.stackAllocationSites.get(element.node),
            "The stack allocation site for this variable must exist",
          ),
        );
      } else {
        this.value = createScopeElementValue(element);
      }
    } else if (isThisLiteral(root)) {
      this.visit(root);
      this.value = this.assertValue;
    } else {
      UNREACHABLE("Unhandled root identifier!");
    }
  }

  override visitThisLiteral(expression: ThisLiteral): void {
    if (this.ctx.kind === CallableKind.Method) {
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
      // we need to unpack the scope element value
      const scopeElement = (root as ScopeElementValue).element;

      switch (scopeElement.type) {
        case ScopeElementType.Parameter: // falls through
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

          // It needs to be a field reference or a variable reference on a class or an interface
          const rootValue = createRuntimeValue(
            buildLoadInstruction(
              this.ctx,
              this.currentBlock,
              createVariableReference(variable),
            ),
          );
          const rootInstructionType = variable.type;
          if (
            rootInstructionType.kind === ConcreteTypeKind.Class ||
            rootInstructionType.kind === ConcreteTypeKind.Interface
          ) {
            const classType = variable.type as ClassType | InterfaceType;
            const field = classType.fields.get(node.member.name);
            if (field) {
              if (classType.kind === ConcreteTypeKind.Interface) {
                this.ctx.stackAllocationSites.set(node, {
                  immutable: false,
                  node,
                  ref: null,
                  type: field.type,
                  value: null,
                });
              }
              this.value = createFieldReference(rootValue, field, node);
              ensureGCRoot(
                this.ctx,
                this.currentBlock,
                this.value,
                node,
                false,
              );
              return;
            }
            const members = classType.node.members as AstNode[];

            const methodNodeMaybe =
              (members.find(
                (member: AstNode) =>
                  (isMethodClassMember(member) ||
                    isInterfaceMethodDeclaration(member)) &&
                  member.name.name === node.member.name,
              ) as
                | MethodClassMember
                | InterfaceMethodDeclaration
                | undefined) ?? null;

            if (methodNodeMaybe) {
              this.value = createMethodReference(rootValue, methodNodeMaybe);
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
          } else {
            logNode(rootInstructionType as any);
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

          this.value = createScopeElementValue(inner);
          return;
        }
        case ScopeElementType.Interface: {
          UNREACHABLE("TODO");
        }
        case ScopeElementType.Enum: {
          assert(false, "TODO");
        }
        default: {
          logNode(scopeElement as any);
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
    } else if (
      root.kind === ValueKind.Variable ||
      root.kind === ValueKind.Field
    ) {
      if (
        root.type?.kind !== ConcreteTypeKind.Class &&
        root.type?.kind !== ConcreteTypeKind.Interface
      ) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.memberRoot,
          "The roots of member access expressions must be class types",
        );
        this.value = theInvalidValue;
        return;
      }

      const thisType = root.type as ClassType | InterfaceType;
      const memberName = node.member.name;
      const field = thisType.fields.get(memberName);

      if (field) {
        this.value = createFieldReference(
          ensureRuntime(this.ctx, this.currentBlock, root),
          field,
          node,
        );
        ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
        return;
      }

      // TODO: add a Map<string, ...> called ClassType#members
      const methodDeclaration = (
        thisType.node.members as (ClassMember | InterfaceMember)[]
      ).find(
        (e: ClassMember | InterfaceMember) =>
          (isMethodClassMember(e) || isInterfaceMethodDeclaration(e)) &&
          e.name.name === memberName,
      );

      if (methodDeclaration) {
        this.value = createMethodReference(
          ensureRuntime(this.ctx, this.currentBlock, root),
          methodDeclaration as MethodClassMember | InterfaceMethodDeclaration,
        );
        return;
      }

      reportErrorDiagnostic(
        this.program,
        this.module,
        "type",
        node.member,
        `The member '${memberName}' does not exist on the given object.`,
      );
      this.value = theInvalidValue;
      return;
    }

    UNREACHABLE(
      "visitMemberAccessExpression received an unhandled value kind as a memberRoot",
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
      const argumentValue = this.assertValue;

      const parameterValue = ensureDereferenced(
        this.ctx,
        this.currentBlock,
        argumentValue,
      );
      ensureGCRoot(this.ctx, this.currentBlock, parameterValue, node, false);
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
            ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
            return;
          }
          case ScopeElementType.Builtin: {
            const declaration = scopeElement.node as BuiltinDeclaration;
            const dereferencedArguments = argumentValues.map((arg) =>
              ensureDereferenced(this.ctx, this.currentBlock, arg),
            );
            const inferredTypeParameters = inferTypeParameters(
              this.program,
              this.module,
              node,
              dereferencedArguments,
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
              dereferencedArguments,
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
                `Builtin for ${declaration.name.name} could not be found`,
              );
              this.value = theInvalidValue;
              return;
            }

            this.value = builtin({
              args: dereferencedArguments,
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
            ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
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
            ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
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
            ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
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
        assert(
          isMethodClassMember(declaration) ||
            isInterfaceMethodDeclaration(declaration),
        );
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
          thisType.kind === ConcreteTypeKind.Class ||
            thisType.kind === ConcreteTypeKind.Interface,
          "thisType must be of a class type or an interface type",
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
        ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
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
    const operandDereferenced = ensureDereferenced(
      this.ctx,
      this.currentBlock,
      operand,
    );

    if (!operandDereferenced.type) {
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
      operandDereferenced.type,
      null,
      node.op,
      node,
    );

    if (overload) {
      this.value = callUnaryOperatorOverload(
        this.ctx,
        this.currentBlock,
        overload,
        ensureRuntime(this.ctx, this.currentBlock, operandDereferenced),
      );
      ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
      return;
    }

    switch (node.op) {
      case "!": {
        const builtin = assert(
          this.program.builtinFunctions.get("assert"),
          "The assert builtin must exist... how ironic.",
        );

        this.value = builtin({
          args: [operandDereferenced],
          caller: this.ctx,
          funcType: {
            id: idCounter.value++,
            kind: ConcreteTypeKind.Function,
            llvmType: null,
            returnType: getNonnullableType(operandDereferenced.type),
            parameterTypes: [operandDereferenced.type],
          },
          module: this.module,
          node,
          program: this.program,
          typeParameters: [assert(operandDereferenced.type)],
          getCurrentBlock: () => this.currentBlock,
          setCurrentBlock: (block) => {
            this.currentBlock = block;
          },
        });
        ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
        return;
      }
      // do we support prefix increment/decrement? it's fine either way
      // supporting and not supporting it have their pros and cons
      case "++":
      case "--": {
        if (!isNumeric(operandDereferenced.type)) {
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

        if (!isVariableValue(operand) && !isFieldValue(operand)) {
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

        if (isVariableValue(operand) && operand.variable.immutable) {
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

        const loaded = createRuntimeValue(
          buildLoadInstruction(
            this.ctx,
            this.currentBlock,
            operand as FieldReferenceValue | VariableReferenceValue,
          ),
        );

        const operandType = assert(operandDereferenced.type);
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
          operand,
          modified,
          getGCBarrierKind(this.ctx, operand),
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
      ensureGCRoot(this.ctx, this.currentBlock, this.value, node, false);
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

    // let a = 10;
    // a.b = 42;
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

  override visitWhileStatement(node: WhileStatement): void {
    // we need to build the condition block first
    const conditionBlock = buildBasicBlock(this.ctx, "condition");
    buildBrInstruction(this.ctx, this.currentBlock, conditionBlock);

    // build the condition block
    this.currentBlock = conditionBlock;

    // now we visit
    this.visit(node.expression);

    const conditionValue = this.assertValue;

    const derefValue = ensureDereferenced(
      this.ctx,
      this.currentBlock,
      conditionValue,
    );

    switch (derefValue.type?.kind) {
      case ConcreteTypeKind.Nullable:
      case ConcreteTypeKind.Integer:
      case ConcreteTypeKind.Float:
        break;
      default: {
        UNREACHABLE("What do we do here?");
      }
    }

    if (
      isCompileTimeValue(conditionValue) &&
      asComptimeConditional(conditionValue) === ComptimeConditional.Falsy
    ) {
      return;
    }

    const bodyBlock = buildBasicBlock(this.ctx, "body");
    const nextBlock = buildBasicBlock(this.ctx, "next");

    buildBrIfInstruction(
      this.ctx,
      this.currentBlock,
      ensureRuntime(this.ctx, this.currentBlock, derefValue),
      bodyBlock,
      nextBlock,
    );

    this.currentBlock = bodyBlock;
    this.loopContext.push({
      name: node.label?.name ?? "",
      nextBlock,
      conditionBlock,
    });
    this.visit(node.statement);
    buildBrInstruction(this.ctx, this.currentBlock, conditionBlock);

    this.currentBlock = nextBlock;
    this.loopContext.pop();
  }

  override visitBreakStatement(node: BreakStatement): void {
    const loopContext = assert(
      node.label
        ? this.loopContext.find((e) => e.name === node.label!.name)
        : this.loopContext.at(-1),
      "Cannot break out of a loop, something is wrong.",
    );
    const unreachableNext = buildBasicBlock(this.ctx, "unused");

    buildBrInstruction(this.ctx, this.currentBlock, loopContext.nextBlock);

    this.currentBlock = unreachableNext;
  }

  override visitContinueStatement(node: ContinueStatement): void {
    const loopContext = assert(
      node.label
        ? this.loopContext.find((e) => e.name === node.label!.name)
        : this.loopContext.at(-1),
      "Cannot break out of a loop, something is wrong.",
    );
    const unreachableNext = buildBasicBlock(this.ctx, "unused");

    buildBrInstruction(this.ctx, this.currentBlock, loopContext.conditionBlock);

    this.currentBlock = unreachableNext;
  }

  override visitExpressionStatement(node: ExpressionStatement): void {
    this.visit(node.expression);

    // Black hole the expression value. WAAAAAAHHHHHHHH! (game over)
    void this.assertValue;
  }

  override visitVariableDeclarator(node: VariableDeclarator): void {
    const { immutable } = node.$container;
    this.visit(node.expression);
    const initializer = this.assertValue;

    const initializerType = assert(initializer.type);
    let variableType: ConcreteType;
    if (node.type) {
      const scope = assert(getScope(node));
      let guardType = resolveType(
        this.program,
        this.module,
        node.type,
        scope,
        this.ctx.typeMap,
      );

      if (!guardType) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.type,
          "The variable type guard could not be resolved.",
        );
        guardType = theInvalidType;
      } else if (!isAssignable(guardType, initializerType)) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.expression,
          "The variable initializer is not assignable to the given type.",
        );
      }

      variableType = guardType;
    } else {
      variableType = initializerType;
    }

    const site: StackAllocationSite = {
      immutable,
      type: variableType,
      node,
      ref: null,
      value: null,
    };

    if (isCompileTimeValue(initializer)) {
      site.value = initializer;
    } else {
      const variableReference = createVariableReference(site);
      buildStoreInstruction(
        this.ctx,
        this.currentBlock,
        variableReference,
        ensureRuntime(this.ctx, this.currentBlock, initializer),
        getGCBarrierKind(this.ctx, variableReference),
      );
    }

    this.ctx.stackAllocationSites.set(node, site);
  }

  override visitReturnStatement(node: ReturnStatement): void {
    if (node.expression) {
      this.visit(node.expression);
      const value = this.assertValue;

      if (!value.type || !isAssignable(this.ctx.type.returnType, value.type)) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node.expression,
          this.ctx.type.returnType === this.program.voidType
            ? "Void functions/methods must not return values."
            : "The return value is not compatible with the function/method signature.",
        );
        return;
      }

      buildReturnInstruction(this.ctx, this.currentBlock, value as TypedValue);
    } else {
      if (this.ctx.type.returnType !== this.program.voidType) {
        reportErrorDiagnostic(
          this.program,
          this.module,
          "type",
          node,
          "Non-void functions/methods must return a value.",
        );
        return;
      }
      buildReturnInstruction(this.ctx, this.currentBlock, {
        kind: ValueKind.Void,
        type: this.program.voidType,
      });
    }
  }
}
