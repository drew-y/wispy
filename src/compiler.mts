import binaryen from "binaryen";
import { AstNode, BlockNode, IdentifierNode } from "./types/index.mjs";

export const compile = (block: BlockNode): binaryen.Module => {
  const mod = new binaryen.Module();
  const functionMap = generateFunctionMap(block);

  registerStandardFunctions(mod, functionMap);
  compileExpression({
    expression: block,
    mod,
    functionMap,
    parameters: new Map(),
  });

  return mod;
};

interface CompileExpressionOpts {
  expression: AstNode;
  mod: binaryen.Module;
  parameters: ParameterMap;
  functionMap: FunctionMap;
}

const compileExpression = (opts: CompileExpressionOpts): number => {
  const { expression, mod } = opts;
  if (isNodeType(expression, "block")) return compileBlock({ ...opts, expression });
  if (isNodeType(expression, "int")) return mod.i32.const(expression.value);
  if (isNodeType(expression, "float")) return mod.f32.const(expression.value);
  if (isNodeType(expression, "identifier")) return compileIdentifier({ ...opts, expression });
  throw new Error(`Unrecognized expression ${expression.type}`);
};

interface CompileBlockOpts extends CompileExpressionOpts {
  expression: BlockNode;
}

const compileBlock = (opts: CompileBlockOpts): number => {
  const { expression: block, mod } = opts;

  // Determine if this block is actually a function call
  if (isNodeType(block.expressions[0], "identifier") && block.expressions.length > 1) {
    return compileFunctionCall(opts);
  }

  const expressions = block.expressions.map((expression) => {
    return compileExpression({ ...opts, expression });
  });

  return mod.block(null, expressions, binaryen.auto);
};

const compileFunctionCall = (opts: CompileBlockOpts) => {
  const { expression, functionMap, mod } = opts;
  const identifierNode = expression.expressions[0];

  if (!isNodeType(identifierNode, "identifier")) {
    throw new Error("Expected identifier when compiling function call");
  }

  const identifier = identifierNode.identifier;
  if (identifier === "fn") return compileFunction(opts);
  if (identifier === "if") return compileIf(opts);

  const functionInfo = functionMap.get(identifier);
  if (!functionInfo) {
    throw new Error(`Function ${identifier} not found`);
  }

  const args = expression.expressions
    .slice(1)
    .map((expression) => compileExpression({ ...opts, expression }));

  return mod.call(identifier, args, functionInfo.returnType);
};

const compileFunction = (opts: CompileBlockOpts) => {
  const { expression: block, mod } = opts;
  assertFn(block);
  const { identifier, returnType } = getFunctionIdentifier(block);
  const { parameters, parameterTypes } = getFunctionParameters(block);
  const body = compileBlock({
    ...opts,
    expression: {
      type: "block",
      expressions: block.expressions.slice(3),
    },
    parameters,
  });
  mod.addFunction(identifier, parameterTypes, returnType, [], body);
  mod.addFunctionExport(identifier, identifier);
  return mod.nop();
};

interface CompileIdentifierOpts extends CompileExpressionOpts {
  expression: IdentifierNode;
}

const compileIdentifier = (opts: CompileIdentifierOpts) => {
  const { expression: node, parameters, mod } = opts;
  const info = parameters.get(node.identifier);
  if (!info) {
    throw new Error(`Unrecognized identifier ${node.identifier}`);
  }

  return mod.local.get(info.index, info.type);
};

type ParameterMap = Map<string, { index: number; type: number }>;

const getFunctionParameters = (block: BlockNode) => {
  const node = block.expressions[2];

  if (!isNodeType(node, "block")) {
    throw new Error("Expected function parameters");
  }

  const { parameters, types } = node.expressions.reduce(
    (prev, node, index) => {
      if (!isNodeType(node, "typed-identifier")) {
        throw new Error("All parameters must be typed");
      }
      const type = mapBinaryenType(node.typeIdentifier);

      return {
        parameters: new Map([[node.identifier, { index, type }], ...prev.parameters]),
        types: [type, ...prev.types],
      };
    },
    { parameters: new Map(), types: [] } as {
      parameters: ParameterMap;
      types: number[];
    }
  );

  return {
    parameters,
    parameterTypes: binaryen.createType(types),
  };
};

const getFunctionIdentifier = (block: BlockNode) => {
  const node = block.expressions[1];

  // Will add type inference later
  if (!isNodeType(node, "typed-identifier")) {
    throw new Error("Expected typed function name");
  }

  return {
    identifier: node.identifier,
    returnType: mapBinaryenType(node.typeIdentifier),
  };
};

const compileIf = (opts: CompileBlockOpts) => {
  const { expression, mod } = opts;
  const conditionNode = expression.expressions[1];
  const ifTrueNode = expression.expressions[2];
  const ifFalseNode = expression.expressions[3];
  const condition = compileExpression({ ...opts, expression: conditionNode });
  const ifTrue = compileExpression({ ...opts, expression: ifTrueNode });
  const ifFalse = ifFalseNode ? compileExpression({ ...opts, expression: ifFalseNode }) : undefined;
  return mod.if(condition, ifTrue, ifFalse);
};

const registerStandardFunctions = (mod: binaryen.Module, map: FunctionMap) => {
  const { i32, f32 } = binaryen;
  const { i32: i32m, f32: f32m } = mod;
  const common = { mod, map };
  registerLogicFunction({ name: "lt_i32", type: i32, operator: i32m.lt_s, ...common });
  registerLogicFunction({ name: "gt_i32", type: i32, operator: i32m.gt_s, ...common });
  registerLogicFunction({ name: "eq_i32", type: i32, operator: i32m.eq, ...common });
  registerLogicFunction({ name: "lt_f32", type: f32, operator: f32m.lt, ...common });
  registerLogicFunction({ name: "gt_f32", type: f32, operator: f32m.gt, ...common });
  registerLogicFunction({ name: "eq_f32", type: f32, operator: f32m.eq, ...common });
  registerMathFunction({ name: "add_i32", type: i32, operator: i32m.add, ...common });
  registerMathFunction({ name: "sub_i32", type: i32, operator: i32m.sub, ...common });
  registerMathFunction({ name: "mul_i32", type: i32, operator: i32m.mul, ...common });
  registerMathFunction({ name: "add_f32", type: f32, operator: f32m.add, ...common });
  registerMathFunction({ name: "sub_f32", type: f32, operator: f32m.sub, ...common });
  registerMathFunction({ name: "mul_f32", type: f32, operator: f32m.mul, ...common });
  registerMathFunction({ name: "div_f32", type: f32, operator: f32m.div, ...common });
};

const registerMathFunction = (opts: {
  mod: binaryen.Module;
  name: string;
  type: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  const { mod, name, type, operator, map } = opts;
  return registerBinaryFunction({
    mod,
    name,
    paramType: type,
    returnType: type,
    operator,
    map,
  });
};

const registerLogicFunction = (opts: {
  mod: binaryen.Module;
  name: string;
  type: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  const { mod, name, type, operator, map } = opts;
  return registerBinaryFunction({
    mod,
    name,
    paramType: type,
    returnType: binaryen.i32,
    operator,
    map,
  });
};

const registerBinaryFunction = (opts: {
  mod: binaryen.Module;
  name: string;
  paramType: number;
  returnType: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  const { mod, name, paramType, returnType, operator, map } = opts;
  mod.addFunction(
    name,
    binaryen.createType([paramType, paramType]),
    returnType,
    [],
    mod.block(
      null,
      [operator(mod.local.get(0, paramType), mod.local.get(1, paramType))],
      binaryen.auto
    )
  );
  map.set(name, { returnType });
};

/** Function name, Function info */
type FunctionMap = Map<string, { returnType: number }>;

const generateFunctionMap = (block: BlockNode): FunctionMap => {
  // Check to see if current block is a function!
  const firstNode = block.expressions[0];
  if (isNodeType(firstNode, "identifier") && firstNode.identifier === "fn") {
    const { identifier, returnType } = getFunctionIdentifier(block);
    return new Map([
      [identifier, { returnType }],
      // Scan function body for more function definitions
      ...generateFunctionMap({ type: "block", expressions: block.expressions.slice(3) }),
    ]);
  }

  // Scan the rest of this block for possible functions
  return block.expressions.reduce((map, expression) => {
    if (expression.type === "block") {
      return new Map([...map, ...generateFunctionMap(expression)]);
    }

    return map;
  }, new Map());
};

const mapBinaryenType = (typeIdentifier: string): binaryen.Type => {
  if (typeIdentifier === "i32") return binaryen.i32;
  if (typeIdentifier === "f32") return binaryen.f32;
  throw new Error(`Unsupported type ${typeIdentifier}`);
};

function assertFn(block: unknown): asserts block is BlockNode {
  if (!isNodeType(block, "block")) {
    throw new Error("Expected function definition expression");
  }

  const node = block.expressions[0];
  if (isNodeType(node, "identifier") && node.identifier === "fn") return;
  throw new Error("Expected function definition expression");
}

export const isNodeType = <T extends AstNode["type"]>(
  item: unknown,
  type: T
): item is Extract<AstNode, { type: T }> => {
  return !!item && typeof item === "object" && (item as Record<string, unknown>)["type"] === type;
};
