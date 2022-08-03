import {
  Token,
  TokenTree,
  NonArrayToken,
  TokenTreeItem,
  IdentifierNode,
  TypedIdentifierNode,
  IdentifierToken,
  TypedIdentifierToken,
  FloatToken,
  FloatNode,
  IntToken,
  IntNode,
  AstNode,
  BlockNode,
} from "./types";

export const parse = (tokens: Token[]): BlockNode[] => {
  const blocks: BlockNode[] = [];

  while (tokens.length) {
    const tree = consumeTokenTree(tokens);
    blocks.push(parseBlock(tree));
  }

  return blocks;
};

const parseBlock = (block?: TokenTreeItem): BlockNode => {
  if (!(block instanceof Array)) {
    throw new Error("Expected block");
  }

  return {
    type: "block",
    expressions: block.map(parseExpression),
  };
};

const parseExpression = (expression?: TokenTreeItem): AstNode => {
  if (expression instanceof Array) {
    return parseBlock(expression);
  }

  if (isTokenType(expression, "identifier")) return parseIdentifier(expression);
  if (isTokenType(expression, "typed-identifier")) return parseTypedIdentifier(expression);
  if (isTokenType(expression, "float")) return parseFloatToken(expression);
  if (isTokenType(expression, "int")) return parseIntToken(expression);

  throw new Error(`Unrecognized expression ${JSON.stringify(expression)}`);
};

const parseFloatToken = (float: FloatToken): FloatNode => ({ ...float });

const parseIntToken = (int: IntToken): IntNode => ({ ...int });

const parseIdentifier = (identifier: IdentifierToken): IdentifierNode => {
  return {
    type: "identifier",
    identifier: identifier.value,
  };
};

const parseTypedIdentifier = (identifier: TypedIdentifierToken): TypedIdentifierNode => {
  const vals = identifier.value.split(":");

  return {
    type: "typed-identifier",
    identifier: vals[0],
    typeIdentifier: vals[1],
  };
};

const consumeTokenTree = (tokens: Token[]): TokenTree => {
  const array: TokenTree = [];

  consumeLeftBracket(tokens);
  while (tokens.length) {
    const token = tokens[0];

    if (token.type === "bracket" && getBracketDirection(token) === "left") {
      array.push(consumeTokenTree(tokens));
      continue;
    }

    if (token.type === "bracket" && getBracketDirection(token) === "right") {
      tokens.shift(); // Discard closing bracket
      break;
    }

    array.push(token);
    tokens.shift();
  }

  return array;
};

const consumeLeftBracket = (tokens: Token[]) => {
  const bracketDirection = getBracketDirection(tokens[0]);

  if (bracketDirection !== "left") {
    throw new Error("Expected left bracket");
  }

  return tokens.shift();
};

const getBracketDirection = (token: Token): "left" | "right" => {
  if (token.type !== "bracket") {
    throw new Error(`Expected bracket, got ${token.type}`);
  }

  if (/[\(\[]/.test(token.value)) return "left";
  return "right";
};

export const isTokenType = <T extends Token["type"]>(
  item: TokenTreeItem | undefined,
  type: T
): item is Extract<Token, { type: T }> => {
  return isToken(item) && item.type === type;
};

const isToken = (item?: TokenTreeItem): item is NonArrayToken => {
  return !(item instanceof Array);
};
