import { Token } from "./token.mjs";

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

export type NonBracketToken = Exclude<Token, "bracket">;
export type TokenTree = (NonBracketToken | TokenTree)[];
