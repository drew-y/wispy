import { Keyword } from "./keywords";

export type Token =
  | { type: "parenthesis"; value: "(" | ")" }
  | { type: "square-bracket"; value: "[" | "]" }
  | { type: "int"; value: number }
  | { type: "float"; value: number }
  | { type: "identifier"; value: string }
  /** Typed identifiers take the from identifier:type */
  | { type: "typed-identifier"; value: string }
  | { type: "keyword"; value: Keyword }
  | { type: "spaces"; count: number }
  | { type: "new-line" };
