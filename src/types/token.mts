export type Token = BracketToken | IntToken | FloatToken | IdentifierToken | TypedIdentifierToken;

/** Represents a whole number */
export type IntToken = { type: "int"; value: number };

/** Represents a number that can have decimal places */
export type FloatToken = { type: "float"; value: number };

/** Represents a whole word thats used to identify something. In wispy this can be a function or */
export type IdentifierToken = { type: "identifier"; value: string };

/** Typed identifiers are identifiers that include an associated type. They take the form identifier:type  */
export type TypedIdentifierToken = { type: "typed-identifier"; value: string };

/** Represents one of (, [, ), and ]. For simplicities sake, wispy treats () and [] as the same thing */
export type BracketToken = { type: "bracket"; value: Bracket };

export type Bracket = "(" | ")" | "[" | "]";
