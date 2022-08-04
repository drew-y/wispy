import binaryen from "binaryen";
import { Ast, AstNode, BlockNode, TypedIdentifierNode } from "./types";

export const compile = (ast: Ast): binaryen.Module => {
  const module = new binaryen.Module();
  ast.forEach((block) => compileFunction(block, module));
  return module;
};

const compileFunction = (block: BlockNode, module: binaryen.Module) => {
  assertFn(block);
  const { identifier, returnType } = getFunctionIdentifier(block);
  const { parameterNames, parameterTypes } = getFunctionParameters(block);
  module.addFunction(identifier);
};

const getFunctionParameters = (block: BlockNode) => {
  const node = block.expressions[2];

  if (!isNodeType(node, "block")) {
    throw new Error("Expected function parameters");
  }

  if (!node.expressions.every((n) => isNodeType(n, "typed-identifier"))) {
    throw new Error("All parameters must be typed");
  }

  const { names, types } = block.expressions.reduce((prev, node) => {
    if (!isNodeType(node, "typed-identifier")) {
      throw new Error("All parameters must be typed");
    }

    return {
      names: [node.identifier, ...prev.names],
      types: [mapBinaryenType(node.typeIdentifier), ...prev.types],
    };
  }, {} as { names: string[]; types: number[] });

  return {
    parameterNames: names,
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

const mapBinaryenType = (typeIdentifier: string): binaryen.Type => {
  if (typeIdentifier === "int32") return binaryen.i32;
  if (typeIdentifier === "f32") return binaryen.f32;
  throw new Error(`Unsupported type ${typeIdentifier}`);
};

const assertFn = (block: BlockNode) => {
  const node = block.expressions[0];
  if (isNodeType(node, "identifier") && node.identifier === "fn") return;
  throw new Error("Expected function definition expression");
};

export const isNodeType = <T extends AstNode["type"]>(
  item: AstNode | undefined,
  type: T
): item is Extract<AstNode, { type: T }> => {
  return !!item && item.type === type;
};
