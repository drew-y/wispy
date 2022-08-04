import { Bracket, Token } from "./types/index.mjs";

export const lex = (input: string): Token[] => {
  const chars = input.trim().split("");
  const tokens: Token[] = [];

  while (chars.length) {
    const tokenString = extractTokenString(chars);
    if (tokenString === undefined) break;
    const token = identifyToken(tokenString);
    tokens.push(token);
  }

  return tokens;
};

const extractTokenString = (chars: string[]): string | undefined => {
  const token: string[] = [];

  while (chars.length) {
    const char = chars[0];

    // No more characters to read
    if (char === undefined) break;

    // Whitespace characters terminate the token
    if (isWhitespace(char) && token.length) {
      chars.shift(); // Remove the whitespace so it doesn't get included in the next token
      break;
    }

    // Discard leading whitespace characters
    if (isWhitespace(char)) {
      chars.shift();
      continue;
    }

    // Terminator tokens signify the end of the current token (if any).
    if (isTerminatorToken(char) && token.length) break;

    // Add the character to the token and discard it from the input
    token.push(char);
    chars.shift();

    // If the only token we've received so far is a single character token, that's our whole token.
    if (isTerminatorToken(char)) break;
  }

  return token.length ? token.join("") : undefined;
};

const identifyToken = (token: string): Token => {
  if (isInt(token)) return { type: "int", value: parseInt(token) };
  if (isFloat(token)) return { type: "float", value: parseFloat(token) };
  if (isIdentifier(token)) return { type: "identifier", value: token };
  if (isBracket(token)) return { type: "bracket", value: token };
  if (isTypedIdentifier(token)) return { type: "typed-identifier", value: token };

  throw new Error(`Unknown token: ${token}`);
};

const isInt = (token: string) => /^[0-9]+$/.test(token);

const isFloat = (token: string) => /^[0-9]+\.[0-9]+$/.test(token);

const isIdentifier = (token: string) => /^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(token);

const isTypedIdentifier = (token: string) =>
  /^[a-zA-Z_][a-zA-Z0-9_\-]*:[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(token);

const isBracket = (token: string): token is Bracket => /[\(\)\[\]]/.test(token);

/** Brackets are the only terminator tokens for now */
const isTerminatorToken = (token: string): token is Bracket => isBracket(token);

const isWhitespace = (char: string) => char === " " || char === "\n" || char === "\t";
