export type FnNode = {
  type: "fn";
  name: string;
  args: TypedIdentifierNode[];
  body: Node[];
};

type CallNode = {
  type: "call";
  fn: string;
  args: Node[];
};

type IntNode = {
  type: "int";
  value: number;
};

type FloatNode = {
  type: "float";
  value: number;
};

type ListNode = {
  type: "list";
  value: Node[];
};

type IdentifierNode = {
  type: "identifier";
  value: string;
};

type TypedIdentifierNode = {
  type: "typed-identifier";
  value: string;
  identifierType: string;
};
