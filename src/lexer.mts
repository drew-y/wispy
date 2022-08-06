import { Bracket, Token } from "./types/index.mjs";

export const lex = (input: string): Token[] => {
  const chars = input.trim().split("");
  const tokens: Token[] = [];

  while (chars.length) {
    const word = consumeNextWord(chars);
    if (word === undefined) break;
    const token = identifyToken(word);
    tokens.push(token);
  }

  return tokens;
};

const consumeNextWord = (chars: string[]): string | undefined => {
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

const identifyToken = (word: string): Token => {
  if (isInt(word)) return { type: "int", value: parseInt(word) };
  if (isFloat(word)) return { type: "float", value: parseFloat(word) };
  if (isIdentifier(word)) return { type: "identifier", value: word };
  if (isBracket(word)) return { type: "bracket", value: word };
  if (isTypedIdentifier(word)) return { type: "typed-identifier", value: word };

  throw new Error(`Unknown token: ${word}`);
};

const isInt = (word: string) => /^[0-9]+$/.test(word);

const isFloat = (word: string) => /^[0-9]+\.[0-9]+$/.test(word);

const isIdentifier = (word: string) => /^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(word);

const isTypedIdentifier = (word: string) =>
  /^[a-zA-Z_][a-zA-Z0-9_\-]*:[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(word);

const isBracket = (word: string): word is Bracket => /[\(\)\[\]]/.test(word);

/** Brackets are the only terminator tokens for now */
const isTerminatorToken = (word: string): word is Bracket => isBracket(word);

const isWhitespace = (char: string) => char === " " || char === "\n" || char === "\t";
