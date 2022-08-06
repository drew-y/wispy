# Build a WebAssembly Language for Fun and Profit

```
(fn fib:i32 [val:i32]
  (if (lt_i32 val 2)
    val
    (add_i32 (fib (sub_i32 val 1)) (fib (sub_i32 val 2)))))

(fn main:i32 [] (fib 15))
```

Intro here

This article is designed for intermediate to advanced software developers looking for a fun side
project to challenge themselves with.

## Setup

In this guide we will be using TypeScript and NodeJS. The concepts are highly portable, so
feel free to use the environment your most comfortable with. Our only major dependency, [binaryen](https://github.com/WebAssembly/binaryen),
has a simple C API. Feel free to skip ahead to the next section if you're using a different
language.

Requirements:

- NodeJS v16+
- Git

**Quick Start**

```bash
git clone git@github.com:drew-y/wispy.git
cd wispy
npm i
```

**Manual Setup**

1. Open a terminal window and make a new directory:

```bash
mkdir wispy
cd wispy
```

2. Initialize package.json:

```bash
npm init -y # Be sure to have NodeJS 16+ installed
```

3. Install the project dependencies:

```
npm i @types/node binaryen typescript
```

4. Add these two fields to the package.json

```
"type": "module", // Binaryen uses the new module format so we must follow suit
"bin": {
  "wispy": "dist/index.mjs" // This will allow us to easily run the compiler from our terminal
},
```

5. Create a tsconfig file:

```
npx tsc init .
```

6. Set the following fields in `tsconfig.json`:

```
"module": "ES2022",
"rootDir": "./src",
"moduleResolution": "node",
"outDir": "./dist"
```

## Lexing

Lexing is the process of digesting all the text characters of our program into small chunks called
tokens. Lexing is typically the first step in turning human readable code into something closer
to what a computer can understand.

### Defining Our Tokens

We'll start by defining our tokens in a new file:

```bash
# mts extension is important, it tells typescript to create a corresponding mjs file so Node knows to use modules
mkdirp -p src/types/token.mts
```

First up is the `IntToken`. This token represents whole numbers like `1045`:

```ts
// src/types/token.mts
export type IntToken = { type: "int"; value: number };
```

Next up is the `FloatToken`. This token represents numbers that may have a decimal, like `1.8`:

```ts
// src/types/token.mts
export type FloatToken = { type: "float"; value: number };

/** Previously defined tokens omitted for brevity */
```

Now lets define some identifier tokens. In wispy an identifier can represent either the name
of a function, or the name of a function parameter. We have two types of identifier tokens,
a standard `IdentifierToken` and a `TypedIdentifierToken`.

An `IdentifierToken` is used in the body of a function to refer to the functions parameters or
to call another function.

A `TypedIdentifierToken` is used when defining a function or a parameter. Typed identifiers
take the form `identifier:type`. For example `val:i32` defines a parameter that is a 32 bit integer.
When defining a function, the type represents the functions return type. For example, `fib:i32` is
a function that that returns a 32 bit integer.

Here's the definitions:

```ts
// src/types/token.mts
export type IdentifierToken = { type: "identifier"; value: string };
export type TypedIdentifierToken = { type: "typed-identifier"; value: string };

/** Previously defined tokens omitted for brevity */
```

Up next is `BracketToken`. Wispy uses [S-expression](https://en.wikipedia.org/wiki/S-expression)
syntax, like lisp. So brackets are very important. To keep things simple we allow two kinds of
brackets `()` and `[]`. To keep things even more simple the compiler will treat `()` and
`[]` as interchangeable. In actual use we will only use `[]` to define parameters.

```ts
// src/types/token.mts
export type BracketToken = { type: "bracket"; value: Bracket };
export type Bracket = "(" | ")" | "[" | "]";

/** Previously defined tokens omitted for brevity */
```

Finally we define the top level `Token` type. `Token` is a [discriminated union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).
If a variable is type `Token` that means it could be any one of the tokens we defined previously.

```ts
// src/types/token.mts
export type Token = BracketToken | IntToken | FloatToken | IdentifierToken | TypedIdentifierToken;
/** Previously defined tokens omitted for brevity */
```

At this point `src/types/token.mts` is finished and should look like file. TODO link to finished
file in github.

To make our new types easily accessibly, export them from a new `index.mts` file:

```ts
// src/types/index.mts
export * from "./token.mjs";
```

### The Lex Function

Now that we have our tokens defined we can write the actual `lex` function. The lex function
will take a `string` (i.e. a .wispy file) and output an array of tokens (`Token[]`):

Make a new lex file:

```bash
mkdirp -p src/lexer.mts
```

Define the lex function:

```ts
// src/lexer.mts
import { Bracket, Token } from "./types/index.mjs";

export const lex = (input: string): Token[] => {
  const chars = input
    // Remove any leading or trailing whitespace for simplicity
    .trim()
    // Break up the file into single characters
    .split("");

  // This array stores our tokens
  const tokens: Token[] = [];

  // The loop continues as long as we have characters to consume
  while (chars.length) {
    // Here, a word is an unidentified token. It is usually any single group of non-whitespace
    // characters such as 123 or 123.4 or im_a_function
    const word = consumeNextWord(chars); // We'll define this function later

    // We ran out of tokens. Break out of the loop.
    if (word === undefined) break;

    const token = identifyToken(word); // We'll define this function later

    // Add the token to our store
    tokens.push(token);
  }

  // Return the tokens
  return tokens;
};
```

Next we define the `consumeNextWord` function:

```ts
// src/lexer.mts

/** previous function(s) omitted for brevity */

const consumeNextWord = (chars: string[]): string | undefined => {
  const token: string[] = [];

  while (chars.length) {
    // Save a preview of the current character without modifying the array
    const char = chars[0];

    // No more characters to read
    if (char === undefined) break;

    // Whitespace characters terminate the token (we'll define the isWhitespace function later)
    if (isWhitespace(char) && token.length) {
      chars.shift(); // Remove the whitespace so it doesn't get included in the next token
      break;
    }

    // Discard leading whitespace characters
    if (isWhitespace(char)) {
      chars.shift();
      continue;
    }

    // Terminator tokens signify the end of the current token (if any). (we'll define the isTerminatorToken function later)
    if (isTerminatorToken(char) && token.length) break;

    // Add the character to the token and discard it from the input
    token.push(char);
    chars.shift();

    // If the only token we've received so far is a single character token, that's our whole token.
    if (isTerminatorToken(char)) break;
  }

  // If we characters for our token, join them into a single word. Otherwise, return undefined to signal to the lexer
  // that we are finished processing tokens.
  return token.length ? token.join("") : undefined;
};
```

Now we'll define our `identifyToken` function. As the name suggests, this function takes
a word and figures out what token that word represents.

```ts
// src/lexer.mts

/** previous function(s) omitted for brevity */

const identifyToken = (word: string): Token => {
  // Don't worry we'll get to all the `is` helper functions in a bit
  if (isInt(word)) return { type: "int", value: parseInt(word) };
  if (isFloat(word)) return { type: "float", value: parseFloat(word) };
  if (isIdentifier(word)) return { type: "identifier", value: word };
  if (isBracket(word)) return { type: "bracket", value: word };
  if (isTypedIdentifier(word)) return { type: "typed-identifier", value: word };

  throw new Error(`Unknown token: ${word}`);
};
```

Finally we define our helper functions. These functions all take a string and return
`true` if the string passes their test, `false` otherwise. Most are written using regex. If
you're unfamiliar with regex, I highly recommend [regexone](https://regexone.com/) as a resource
to learn more. In a nutshell, regex is an expression syntax that's used to extract meaningful
information from text. In our case we'll use it to match words against tokens.

```ts
const isInt = (word: string) => /^[0-9]+$/.test(word);

const isFloat = (word: string) => /^[0-9]+\.[0-9]+$/.test(word);

const isIdentifier = (word: string) => /^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(word);

const isTypedIdentifier = (word: string) =>
  /^[a-zA-Z_][a-zA-Z0-9_\-]*:[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(word);

const isBracket = (word: string): word is Bracket => /[\(\)\[\]]/.test(word);

/** Brackets are the only terminator tokens for now */
const isTerminatorToken = (word: string): word is Bracket => isBracket(word);

// Not sure why I didn't use regex here ¯\_(ツ)_/¯
const isWhitespace = (char: string) => char === " " || char === "\n" || char === "\t";
```

At this point `src/lexer.mts` is finished and should look like this file. TODO link to finished
file in github.

### Running the Lexer

Its time to actually run the lexer. Start by making a new file `src/index.mts`:

```ts
#!/usr/bin/env node

// src/index.mts

import { readFileSync } from "fs";
const file = process.argv[2];
const input = readFileSync(file, "utf8");
const tokens = lex(input);
console.log(JSON.stringify(tokens, undefined, 2));
```

Next, create an `example.wispy` file in the project root to compile.

```
(fn fib:i32 [val:i32]
  (if (lt_i32 val 2)
    val
    (add_i32 (fib (sub_i32 val 1)) (fib (sub_i32 val 2)))))

(fn main:i32 [] (fib 15))
```

Now build the lexer:

```bash
npx tsc
npm link # This will make wispy available to run as its own command
```

Finally, run the lexer:

```bash
wispy example.wispy

# Note, if npm link failed you can call our compiler directly with this as an alternative:
node dist/index.mjs example.wispy
```

If everything goes well `wispy` should output something like this:

```
[
  {
    "type": "bracket",
    "value": "("
  },
  {
    "type": "identifier",
    "value": "fn"
  },
  {
    "type": "typed-identifier",
    "value": "fib:i32"
  },
  {
    "type": "bracket",
    "value": "["
  },
  {
    "type": "typed-identifier",
    "value": "val:i32"
  },
  // Omitting the rest for brevity
]
```

We are ready to move onto parsing.

## Parsing

Parsing is the portion of our compiler that takes the tokens returned by the lexer and converting
them to an [abstract syntax tree](https://en.wikipedia.org/wiki/Abstract_syntax_tree) (ast). The
ast brings our code one step closer to being something a computer can understand.

Thankfully, because wispy is an S-expression language our code is essentially _already_ an
ast. All we have to do is convert the format from a list of tokens to a tree-like data structure
that NodeJS can work with more easily. If you're interested in writing a parser for a more advanced
C like syntax, see my previous [Building A Programming Language](https://drew.ltd/blog/posts/2019-7-24.html)
series.

### Defining the AST

As we did with the lexer, we'll start by defining our types. For our parser, that is the ast. An ast
is made up of a group of nodes. Nodes are a lot like tokens accept they are more organized and some
can hold other nodes.

Here are the basic nodes. We'll gloss over them as they aren't a whole lot different then the
tokens we defined before:

```ts
// src/types/ast.mts

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
  // Note that here, we actually break down the identifier into it's component parts
  identifier: string;
  typeIdentifier: string;
};
```

A new concept to the ast is the `BlockNode`. A `BlockNode` is an expression made up
of a group of other expressions.

For example, `(add 1 2)` is a block of three expressions:

1. An identifier that evaluates to a function, `add`.
2. An Int that simply evaluates to the number `1`.
3. An Int that simply evaluates to the number `2`.

How the block itself gets evaluated is up to the compiler, we'll get to that in the next
chapter.

Here's the definition

```ts
// src/types/ast.mts

export type BlockNode = {
  type: "block";
  expressions: AstNode[];
};
```

Finally we define the `AstNode`. Like the `Token` type from the lexer, `AstNode` is a discriminated
union that can be one of any other node we previously defined:

```ts
export type AstNode = IntNode | FloatNode | IdentifierNode | TypedIdentifierNode | BlockNode;
```

You may have noticed that `BlockNode` contained an array of `AstNode` and `AstNode` _can be_ a
`BlockNode`. This means that `BlockNode` is a recursive type. It can contain other `BlockNodes`.
This is fundamentally what an ast is, and for that matter an S-expression language. Because of
this we can use `BlockNode` as our root node. In other words, `BlockNode` _is_ the ast.

At this point `src/types/ast.mts` is finished and should look like file. TODO: link
to file in github.

Now export the types from `src/types/index.ts` as we did with the token types:

```ts
// src/types/index.ts
export * from "./token.mjs";
export * from "./ast.mjs";
```

### Constructing the AST

Now that we've defined the ast, its time to build one.

Create a new `src/parser.mts` file and add all the imports we'll use:

```ts
// src/parser.mts
import {
  Token,
  IdentifierNode,
  TypedIdentifierNode,
  IdentifierToken,
  TypedIdentifierToken,
  FloatToken,
  FloatNode,
  IntToken,
  IntNode,
  AstNode,
  BlockNode,
} from "./types/index.mjs";
```

Now we can define our top level parse function. The parse function takes the tokens
generated by the lexer and returns a `BlockNode` (remember that the block node _is_ the ast).

```ts
// src/parser.mts
export const parse = (tokens: Token[]): BlockNode => {
  const blocks: BlockNode[] = [];

  // This loop is run as long as their are tokens to consume
  while (tokens.length) {
    // consumeTokenTree converts an array of tokens into a tree of tokens, more on that later.
    const tree = consumeTokenTree(tokens);

    // parseBlock turns our new tree of tokens into an actual BlockNode, recursively. More on that later as well.
    blocks.push(parseBlock(tree));
  }

  // Finally we return the top level BlockNode
  return {
    type: "block",
    expressions: blocks,
  };
};
```

Next we define the `consumeTokenTree` function. `consumeTokenTree` Converts a flat array of tokens,
into a tree of tokens.

Given this wispy expression:

```
(add (sub 3 1) (sub 5 2))
```

The lexer will produce this array of tokens:

```ts
// Note: I've simplified the Token format to just be strings to keep things short
["(", "add", "(", "sub", "3", "1", ")", "(", "sub", "5", "2", ")", ")"];
```

`consumeTokenTree` will take that flat array, and turn it into a tree. This is as simple
as putting every token in between a set of bracket tokens `()` into an array. So our
token array from above becomes this token tree:

```ts
["add", [, "sub", "3", "1"], [, "sub", "5", "2"]];
```

Here's the actual definition of `consumeTokenTree`

```ts
// src/parser.ts

// This is token besides for the bracket tokens
export type NonBracketToken = Exclude<Token, "parenthesis" | "square-bracket">;

// The token tree is made of NonBracketTokens and other TokenTrees
export type TokenTree = (NonBracketToken | TokenTree)[];

const consumeTokenTree = (tokens: Token[]): TokenTree => {
  const tree: TokenTree = [];

  // Ensures the first token is a left bracket and then discards it, defined below this function.
  consumeLeftBracket(tokens);

  while (tokens.length) {
    // Preview the next token
    const token = tokens[0];

    // Check to see if the next token is a left bracket.
    if (token.type === "bracket" && getBracketDirection(token) === "left") {
      // If it is, we just ran into a sub-TokenTree. So we can simply call this function within
      // itself. Gotta love recursion
      tree.push(consumeTokenTree(tokens));
      continue;
    }

    // Check to see if the next token is a right bracket
    if (token.type === "bracket" && getBracketDirection(token) === "right") {
      // If it is, we just found the end of the tree on our current level
      tree.shift(); // Discard the right bracket
      break; // Break the loop
    }

    // If the token isn't a bracket it can simply be added to the tree on this level
    tree.push(token);

    // Consume / discard the token from the main tokens array
    tokens.shift();
  }

  // Return the tree. Don't forget to checkout the helper functions below!
  return tree;
};

const consumeLeftBracket = (tokens: Token[]) => {
  const bracketDirection = getBracketDirection(tokens[0]);

  if (bracketDirection !== "left") {
    throw new Error("Expected left bracket");
  }

  return tokens.shift();
};

const getBracketDirection = (token: Token): "left" | "right" => {
  if (token.type !== "bracket") {
    throw new Error(`Expected bracket, got ${token.type}`);
  }

  // If we match a left bracket return left
  if (/[\(\[]/.test(token.value)) return "left";

  // Otherwise return right
  return "right";
};
```

Now that we have a token tree, we need to turn it into a block. To do so we create a
`parseBlock` function that takes the tree as it's input and returns a `BlockNode`:

```ts
const parseBlock = (block?: TokenTree): BlockNode => {
  return {
    type: "block",
    // This is where the recursive magic happens
    expressions: block.map(parseExpression),
  };
};
```

As you may have noticed, `parseBlock` maps each item of the tree with a yet to be written
`parseExpression` function. `parseExpression` takes either a `TokenTree` or a `NonBracketToken`
and transforms it to it's corresponding `AstNode` type. Here's the definition:

```ts
const parseExpression = (expression?: TokenTree | NonBracketToken): AstNode => {
  // If the expression is an Array, we were passed another TokenTree, so we can
  // pass the expression back to the parseBlock function
  if (expression instanceof Array) {
    return parseBlock(expression);
  }

  // The mapping here is pretty straight forward. Match the token type and pass the
  // expression on to a more specific expression parser.
  if (isTokenType(expression, "identifier")) return parseIdentifier(expression);
  if (isTokenType(expression, "typed-identifier")) return parseTypedIdentifier(expression);
  if (isTokenType(expression, "float")) return parseFloatToken(expression);
  if (isTokenType(expression, "int")) return parseIntToken(expression);

  throw new Error(`Unrecognized expression ${JSON.stringify(expression)}`);
};
```

Let's define the `isTokenType` function. This function is pretty neat and demonstrates
one of the most powerful features of TypeScript, [custom type guards]([TokenTree | NonBracketToken](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)).
Simply put, `isTokenType` tests the expression and narrows down the type to a specific `TokenType`
this allows TypeScript to be certain we are passing the right tokens to their corresponding
parser functions down the line.

Heres the definition:

```ts
export const isTokenType = <T extends Token["type"]>(
  item: TokenTree | NonBracketToken | undefined,
  type: T
): item is Extract<Token, { type: T }> => {
  return isToken(item) && item.type === type;
};

const isToken = (item?: TokenTree | NonBracketToken): item is NonBracketToken => {
  return !(item instanceof Array);
};
```

There's a lot happening there so lets walk through it. First up we have a generic definition,
`<T extends Token["type"]>`. This is essentially saying that T must be one of the possible values
of the `Token.type` field. Typescript is smart enough to know that means T must be one
of `"int" | "float" | "identifier" | "typed-identifier" | "bracket`.

The next interesting piece of code is the return type predicate `item is Extract<Token, { type: T }>`.
This predicate tells TypeScript that if the return value of `isTokenType` is true, then `item`
must be the `Token` who's type matches the string passed as the `type` parameter.

In practice that means that if we were to pass an unknown `Token` to `isTokenType`, typescript
will be able to correctly narrow the value to a more specific token, like `IntToken`.

Now that we have our custom type guard defined we can define the actual token parsers. The first
three are stupid simple, they essentially just return the exact same value the lexer defined:

```ts
const parseFloatToken = (float: FloatToken): FloatNode => ({ ...float });

const parseIntToken = (int: IntToken): IntNode => ({ ...int });

const parseIdentifier = (identifier: IdentifierToken): IdentifierNode => {
  return {
    type: "identifier",
    identifier: identifier.value,
  };
};
```

The final parser is the `parseTypedIdentifier`. Remember that a typed identifier takes the form
`identifier:type`. Parsing it is as simple as splitting the string by the colon. The first value
of the returned array is the `identifier`, the second is the `type`. Heres the definition:

```ts
const parseTypedIdentifier = (identifier: TypedIdentifierToken): TypedIdentifierNode => {
  const vals = identifier.value.split(":");

  return {
    type: "typed-identifier",
    identifier: vals[0],
    typeIdentifier: vals[1],
  };
};
```

TODO: Link to full parser file in GitHub.

With that the parser is finished. In the next chapter we can get into the Juicy bits, actually
generating and running machine readable code.

## Code Generation

The final phase of our compiler is code generation. This phase takes our AST and converts it
to a set of executable instructions. In our case WebAssembly. To accomplish this we are going
to use a popular WebAssembly compiler toolchain called [binaryen](https://github.com/WebAssembly/binaryen).
Binaryen does much of the heavy lifting for us. This includes code size reduction
and various performance optimization.
