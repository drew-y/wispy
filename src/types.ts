export const keywords = ["if", "fn"] as const;

export type Keyword = typeof keywords[number];

export type Token =
  | { type: "parenthesis"; value: "(" | ")" }
  | { type: "square-bracket"; value: "[" | "]" }
  | { type: "int"; value: number }
  | { type: "float"; value: number }
  | { type: "identifier"; value: string }
  /** Typed identifiers take the from identifier:type */
  | { type: "typed-identifier"; value: string }
  | { type: "keyword"; value: Keyword };
