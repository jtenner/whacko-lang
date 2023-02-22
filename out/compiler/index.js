"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scope = exports.CompilableExpressionElement = exports.ConstantFloatExpressionElement = exports.ConstantIntegerExpressionElement = exports.ConstantStringExpressionElement = exports.ConstantExpressionElement = exports.ExpressionElement = exports.TypeElement = exports.HeldTypeNode = exports.TupleTypeNode = exports.FunctionTypeNode = exports.NamedTypeNode = exports.TypeNode = exports.ConcretePrimitiveType = exports.ConcreteClassType = exports.ConcreteTupleType = exports.ConcreteFunctionType = exports.ConcreteType = exports.ConcreteField = exports.ConcreteMember = exports.Identifier = void 0;
class Identifier {
    name;
    constructor(name) {
        this.name = name;
    }
}
exports.Identifier = Identifier;
class ConcreteMember {
}
exports.ConcreteMember = ConcreteMember;
class ConcreteField extends ConcreteMember {
    name;
    offset;
    ty;
    constructor(name, offset, ty) {
        super();
        this.name = name;
        this.offset = offset;
        this.ty = ty;
    }
}
exports.ConcreteField = ConcreteField;
class ConcreteType {
}
exports.ConcreteType = ConcreteType;
class ConcreteFunctionType extends ConcreteType {
    parameterTypes;
    returnType;
    constructor(parameterTypes, returnType) {
        super();
        this.parameterTypes = parameterTypes;
        this.returnType = returnType;
    }
}
exports.ConcreteFunctionType = ConcreteFunctionType;
class ConcreteTupleType extends ConcreteType {
    types;
    constructor(types) {
        super();
        this.types = types;
    }
}
exports.ConcreteTupleType = ConcreteTupleType;
class ConcreteClassType extends ConcreteType {
    members;
    constructor(members) {
        super();
        this.members = members;
    }
}
exports.ConcreteClassType = ConcreteClassType;
class ConcretePrimitiveType extends ConcreteType {
    name;
    constructor(name) {
        super();
        this.name = name;
    }
}
exports.ConcretePrimitiveType = ConcretePrimitiveType;
class TypeNode {
}
exports.TypeNode = TypeNode;
class NamedTypeNode extends TypeNode {
    name;
    parameters;
    constructor(name, parameters) {
        super();
        this.name = name;
        this.parameters = parameters;
    }
}
exports.NamedTypeNode = NamedTypeNode;
class FunctionTypeNode extends TypeNode {
    parameters;
    returnType;
    constructor(parameters, returnType) {
        super();
        this.parameters = parameters;
        this.returnType = returnType;
    }
}
exports.FunctionTypeNode = FunctionTypeNode;
class TupleTypeNode extends TypeNode {
    types;
    constructor(types) {
        super();
        this.types = types;
    }
}
exports.TupleTypeNode = TupleTypeNode;
class HeldTypeNode extends TypeNode {
    type;
    constructor(type) {
        super();
        this.type = type;
    }
}
exports.HeldTypeNode = HeldTypeNode;
class TypeElement {
    name;
    parameters;
    defines;
    constructor(name, parameters = null, defines) {
        this.name = name;
        this.parameters = parameters;
        this.defines = defines;
    }
}
exports.TypeElement = TypeElement;
class ExpressionElement {
    get isConstant() { return this instanceof ConstantExpressionElement; }
}
exports.ExpressionElement = ExpressionElement;
class ConstantExpressionElement extends ExpressionElement {
    value;
    constructor(value) {
        super();
        this.value = value;
    }
}
exports.ConstantExpressionElement = ConstantExpressionElement;
class ConstantStringExpressionElement extends ConstantExpressionElement {
    constructor(value) {
        super(value);
    }
}
exports.ConstantStringExpressionElement = ConstantStringExpressionElement;
class ConstantIntegerExpressionElement extends ConstantExpressionElement {
    size;
    constructor(value, size) {
        super(value);
        this.size = size;
    }
}
exports.ConstantIntegerExpressionElement = ConstantIntegerExpressionElement;
class ConstantFloatExpressionElement extends ConstantExpressionElement {
    size;
    constructor(value, size) {
        super(value);
        this.size = size;
    }
}
exports.ConstantFloatExpressionElement = ConstantFloatExpressionElement;
class CompilableExpressionElement extends ExpressionElement {
    ty;
    constructor(ty) {
        super();
        this.ty = ty;
    }
}
exports.CompilableExpressionElement = CompilableExpressionElement;
class Scope {
    types = new Map();
    expressions = new Map();
}
exports.Scope = Scope;
//# sourceMappingURL=index.js.map