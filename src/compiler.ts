import binaryen from "binaryen";
import { AstNode, BlockNode } from "./types";

export const compile = (block: BlockNode): binaryen.Module => {
  const module = new binaryen.Module();

  compileExpression({
    expression: block,
    module,
    functionMap: generateFunctionMap(block),
    parameters: [],
  });

  return module;
};

interface CompileExpressionOpts {
  expression: AstNode;
  module: binaryen.Module;
  parameters: string[];
  functionMap: FunctionMap;
}

const compileExpression = (opts: CompileExpressionOpts): number => {
  const { expression, module } = opts;
  if (expression.type === "block") return compileBlock({ ...opts, expression });
  if (expression.type === "int") return module.i32.const(expression.value);
  if (expression.type === "float") return module.f32.const(expression.value);
  throw new Error(`Unrecognized expression ${expression.type}`);
};

interface CompileBlockOpts extends CompileExpressionOpts {
  expression: BlockNode;
}

const compileBlock = (opts: CompileBlockOpts): number => {
  const { expression: block, module } = opts;

  // Determine if this block is actually a function call
  if (isNodeType(block.expressions[0], "identifier") && block.expressions.length > 1) {
    return compileFunctionCall(opts);
  }

  const expressions = block.expressions.map((expression) => {
    return compileExpression({ ...opts, expression });
  });

  return module.block(null, expressions, binaryen.auto);
};

const compileFunctionCall = (opts: CompileBlockOpts) => {
  const { expression, functionMap, module } = opts;
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

  return module.call(identifier, args, functionInfo.returnType);
};

const compileFunction = (opts: CompileBlockOpts) => {
  const { expression: block, module } = opts;
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
  module.addFunction(identifier, parameterTypes, returnType, [], body);
  module.addFunctionExport(identifier, identifier);
  return module.nop();
};

const getFunctionParameters = (block: BlockNode) => {
  const node = block.expressions[2];

  if (!isNodeType(node, "block")) {
    throw new Error("Expected function parameters");
  }

  if (!node.expressions.every((n) => isNodeType(n, "typed-identifier"))) {
    throw new Error("All parameters must be typed");
  }

  const { parameters, types } = block.expressions.reduce((prev, node) => {
    if (!isNodeType(node, "typed-identifier")) {
      throw new Error("All parameters must be typed");
    }

    return {
      parameters: [node.identifier, ...prev.parameters],
      types: [mapBinaryenType(node.typeIdentifier), ...prev.types],
    };
  }, {} as { parameters: string[]; types: number[] });

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
  const { expression, module } = opts;
  const conditionNode = expression.expressions[1];
  const ifTrueNode = expression.expressions[2];
  const ifFalseNode = expression.expressions[3];
  const condition = compileExpression({ ...opts, expression: conditionNode });
  const ifTrue = compileExpression({ ...opts, expression: ifTrueNode });
  const ifFalse = ifFalseNode ? compileExpression({ ...opts, expression: ifTrueNode }) : undefined;
  return module.if(condition, ifTrue, ifFalse);
};

const registerStandardFunctions = (module: binaryen.Module, map: FunctionMap) => {
  const { i32, f32 } = binaryen;
  registerLogicFunction({ name: "lt_i32", type: i32, operator: module.i32.lt_s, module, map });
  registerLogicFunction({ name: "gt_i32", type: i32, operator: module.i32.gt_s, module, map });
  registerLogicFunction({ name: "eq_i32", type: i32, operator: module.i32.eq, module, map });
  registerLogicFunction({ name: "lt_f32", type: f32, operator: module.f32.lt, module, map });
  registerLogicFunction({ name: "gt_f32", type: f32, operator: module.f32.gt, module, map });
  registerLogicFunction({ name: "eq_f32", type: f32, operator: module.f32.eq, module, map });
};

const registerLogicFunction = ({
  module,
  name,
  type,
  operator,
  map,
}: {
  module: binaryen.Module;
  name: string;
  type: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  module.addFunction(
    name,
    binaryen.createType([type, type]),
    binaryen.i32,
    [],
    module.block(
      null,
      [operator(module.local.get(0, type), module.local.get(0, type))],
      binaryen.auto
    )
  );
  map.set(name, { returnType: binaryen.i32 });
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
  if (typeIdentifier === "int32") return binaryen.i32;
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
  return item instanceof Object && "type" in item && item[type] === type;
};
