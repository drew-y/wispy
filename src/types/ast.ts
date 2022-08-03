export type AstNode = IntNode | FloatNode | ListNode | IdentifierNode | TypedIdentifierNode;

export type FnNode = {
  type: "fn";
  identifier: string;
  returnTypeIdentifier: string;
  args: TypedIdentifierNode[];
  body: AstNode[];
};

export interface CallNode extends AstNodeBase {
  type: "call";
  elements: AstNode[];
}

export interface IntNode extends AstNodeBase {
  type: "int";
  value: number;
}

export interface FloatNode extends AstNodeBase {
  type: "float";
  value: number;
}

export interface ListNode extends AstNodeBase {
  type: "list";
  value: AstNode[];
}

export interface IdentifierNode extends AstNodeBase {
  type: "identifier";
  value: string;
}

export interface TypedIdentifierNode extends AstNodeBase {
  type: "typed-identifier";
  identifier: string;
  typeIdentifier: string;
}

export interface AstNodeBase {
  type: string;
}
