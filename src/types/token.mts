export type Token = BracketToken | IntToken | FloatToken | IdentifierToken | TypedIdentifierToken;

export type BracketToken = { type: "bracket"; value: Bracket };

export type IntToken = { type: "int"; value: number };

export type FloatToken = { type: "float"; value: number };

export type IdentifierToken = { type: "identifier"; value: string };

/** Typed identifiers take the from identifier:type */
export type TypedIdentifierToken = { type: "typed-identifier"; value: string };

export type Bracket = "(" | ")" | "[" | "]";
