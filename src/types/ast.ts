import { Token } from "./token";

export type Ast = BlockNode[];

export type AstNode = IntNode | FloatNode | IdentifierNode | TypedIdentifierNode | BlockNode;

export type BlockNode = {
  type: "block";
  expressions: AstNode[];
};

export type IntNode = {
  type: "int";
  value: number;
};

export type FloatNode = {
  type: "float";
  value: number;
};

export type IdentifierNode = {
  type: "identifier";
  identifier: string;
};

export type TypedIdentifierNode = {
  type: "typed-identifier";
  identifier: string;
  typeIdentifier: string;
};

export type NonArrayToken = Exclude<Token, "parenthesis" | "square-bracket">;
export type TokenTreeItem = NonArrayToken | TokenTree;
export type TokenTree = TokenTreeItem[];
