import { Keyword, keywords, Token } from "./types";

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

    // Single character tokens act as a whitespace. If we've already started reading a token,
    // terminate the current token and return it. Otherwise, continue reading the token.
    if (isSingleCharToken(char) && token.length) break;

    // Add the character to the token and discard it from the input
    token.push(char);
    chars.shift();

    // If the only token we've received so far is a single character token, that's our whole token.
    if (isSingleCharToken(char)) break;
  }

  return token.length ? token.join("") : undefined;
};

const identifyToken = (token: string): Token => {
  if (isInt(token)) return { type: "int", value: parseInt(token) };
  if (isFloat(token)) return { type: "float", value: parseFloat(token) };
  if (isKeyword(token)) return { type: "keyword", value: token as Keyword };
  if (isIdentifier(token)) return { type: "identifier", value: token };
  if (isParenthesis(token)) return { type: "parenthesis", value: token };
  if (isSquareBracket(token)) return { type: "square-bracket", value: token };
  if (isTypedIdentifier(token)) return { type: "typed-identifier", value: token };

  throw new Error(`Unknown token: ${token}`);
};

const isInt = (token: string) => /^[0-9]+$/.test(token);

const isFloat = (token: string) => /^[0-9]+\.[0-9]+$/.test(token);

const isKeyword = (token: string): token is Keyword =>
  (keywords as ReadonlyArray<string>).includes(token);

const isIdentifier = (token: string) => /^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(token);

const isTypedIdentifier = (token: string) =>
  /^[a-zA-Z_][a-zA-Z0-9_\-]*:[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(token);

const isParenthesis = (token: string): token is "(" | ")" => token === "(" || token === ")";

const isSquareBracket = (token: string): token is "[" | "]" => token === "[" || token === "]";

const isSingleCharToken = (token: string): token is "(" | ")" | "[" | "]" => {
  return isParenthesis(token) || isSquareBracket(token);
};

const isWhitespace = (char: string) => char === " " || char === "\n" || char === "\t";
