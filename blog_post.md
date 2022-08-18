# Build a WebAssembly Language for Fun and Profit

- WebAssembly (Wasm) is a new high performance assembly-like format optimized for the web.
- Code targeting WebAssembly can often run at near-native speeds, all while still benefiting from the safer environment of a sandboxed browser VM.
- The WebAssembly team has gone out of their way to make it easy existing programming languages to target WASM as a compilation format, offering a powerful compiler toolchain known as binaryen.
- A side affect of this is that it also made it incredibly fun and easy to build _new_ languages for the web.
- Thats where this guide comes in. A simple overview designed to help get your feet wet in building languages and exploring the inner workings of wasm

Here's a quick taste of the lisp inspired language we'll build, wispy:

```
(fn fib:i32 [val:i32]
  (if (lt_i32 val 2)
    val
    (add_i32 (fib (sub_i32 val 1)) (fib (sub_i32 val 2)))))

(fn main:i32 [] (fib 15))
```

By the end of this guide you'll have a working compiler and runtime fully capable of making high performance functions that can be run on the web.

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
git checkout quickstart
npm i
```

**Manual Setup**

I've included manual setup instructions as an alternative to the quick start, in case you want to know exactly how the project was set up or just like doing things from scratch. If you've already done the quick start, skip to the next section.

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

Lexing is the process of digesting each individual character of our program into a set of tokens. A
token is a group of characters that take on a special meaning when put together. Take the following
snippet of wispy:

```
(add 1 2)
```

There are five unique tokens in that snippet `(`, `add`, `1`, `2` and `)`. The lexer's job is simply
to identify and list those tokens in order.Lexing is typically the first step in turning human
readable code into something closer to what a computer can understand.

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

Finally we define the top level `Token` type:

```ts
// src/types/token.mts
export type Token = BracketToken | IntToken | FloatToken | IdentifierToken | TypedIdentifierToken;
/** Previously defined tokens omitted for brevity */
```

`Token` is a [discriminated union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions). Discriminated Unions are an incredibly powerful programming language construct. They represent a value that can be one of many types. In our case, a `Token` can any one of the more specific token types we defined earlier, such as `IntToken` or `FloatToken`. You'll notice that each
of these tokens have a unique `type` field, such as `type: "int"` in the case of `IntToken`. This is the discriminator. Down the
line you can pass a `Token` to a function and that function can use the `type` field to figure out which specific token it's working
with.

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

At this point `src/lexer.mts` is finished and should look like [this file](https://github.com/drew-y/wispy/blob/f3a1e8106868f63dececedc077530628b3c26d54/src/lexer.mts).

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

TODO: Spend more time explaining what an AST is

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

Now export the types from `src/types/index.mts` as we did with the token types:

```ts
// src/types/index.mts
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
// src/parser.mts

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

Thats all the code required for a working parser. Before we move on, lets update the main
`src/index.mts` file to view the output of the parser:

```ts
// src/index.mts
#!/usr/bin/env node
import { readFileSync } from "fs";
import { lex } from "./lexer.mjs";
import { parse } from "./parser.mjs";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);
const ast = parse(tokens);
console.log(JSON.stringify(tokens, undefined, 2));
```

Build and run project:

```bash
npx tsc
wispy example.wispy
```

If all goes well, the output should look like [this]() (TODO: Link to AST output).

With that the parser is finished. In the next chapter we can get into the Juicy bits, actually
generating and running machine readable code.

## Code Generation

The final phase of our compiler is code generation. This phase takes our AST and converts it
to a set of executable instructions. In our case WebAssembly. To accomplish this we are going
to use a popular WebAssembly compiler toolchain called [binaryen](https://github.com/WebAssembly/binaryen).
Binaryen does much of the heavy lifting for us. This includes code size reduction
and various performance optimization.

### The Compile function

Because this is the phase that actually converts our AST to machine readable code, I have
opted to call the main function `compile`. The compile function will take our root AST (a `BlockNode`)
and return a new `binaryen.Module`.

Here's the outline:

```ts
// src/compiler.mts
export const compile = (block: BlockNode): binaryen.Module => {
  // Creates a new binaryen module that our helper functions will fill in
  const mod = new binaryen.Module();

  // The function map is used to track all the functions and their types. More on this later
  const functionMap = generateFunctionMap(block);

  // This function registers all the standard library functions we'll include with our language.
  // This is includes functions like add, subtract, etc.
  registerStandardFunctions(mod, functionMap);

  // This is where the magic happens. Because `BlockNode` is an expression, this
  // function can recursively compile every instruction in a wispy program file
  compileExpression({
    expression: block,
    mod,
    functionMap,
    parameters: new Map(),
  });

  // Finally we return the binaryen module
  return mod;
};
```

### Generating A Function Map

Next we define the `generateFunctionMap` function. This function crawls the entire expression
tree to find and register function definitions. Its important we do this before actually
compiling the functions as some functions may call other functions before they've been defined.

The return type of `generateFunctionMap` is a map where the key is the function name and the
value is an object containing all the important information about the function the compiler
needs to know about. For now, all we need is `returnType`.

Heres the return type definition:

```ts
// src/compiler.mts
type FunctionMap = Map<string, { returnType: number }>;
```

Now that we have defined our return type, we can define the actual function:

```ts
// src/compiler.mts
const generateFunctionMap = (block: BlockNode): FunctionMap => {
  // Preview the first node (i.e. expression) of the block
  const firstNode = block.expressions[0];

  // If the first node is an identifier and the identifier is "fn", then we know this block represents a function definition.
  if (isNodeType(firstNode, "identifier") && firstNode.identifier === "fn") {
    // Grab the function identifier / name, and it's return type. This is the second expression of
    // the function definition, a typed identifier.
    const { identifier, returnType } = getFunctionIdentifier(block); // We'll define this next

    // Return the function map
    return new Map([
      [identifier, { returnType }],

      // It's possible this function may contain function definitions inside of it. So we
      // We put all the remaining expressions of the function into a new block and scan it
      // then we merge the resulting map with this one.
      ...generateFunctionMap({ type: "block", expressions: block.expressions.slice(3) }),
    ]);
  }

  // A block can contain multiple expressions. So we must scan each one to see if it is a function
  // definition. The root `BlockNode` for instance, will almost always have multiple functions.
  return block.expressions.reduce((map, expression) => {
    // Only block expressions can be functions
    if (expression.type === "block") {
      return new Map([...map, ...generateFunctionMap(expression)]);
    }

    // We can ignore all other expression
    return map;
  }, new Map());
};
```

Onto `getFunctionIdentifier`. This function is simple. It takes a `BlockNode`, ensures
that the second identifier is a `TypedIdentifierNode`, and then returns the identifier
and return type:

```ts
// src/compiler.mts
const getFunctionIdentifier = (block: BlockNode) => {
  // Grab the second expression
  const node = block.expressions[1];

  // Ensure the expression is a typed identifier
  if (!isNodeType(node, "typed-identifier")) {
    throw new Error("Expected typed function name");
  }

  return {
    identifier: node.identifier,

    // We have to map the return type to a type binaryen understands.
    returnType: mapBinaryenType(node.typeIdentifier),
  };
};
```

As noted in the `getFunctionIdentifier` function. Binaryen doesn't understand what type
the string `typeIdentifier` is, as that is defined by our language. To handle this we have
to map our defined types to binaryen types. For now, we'll just support `i32` and `f32`. Thankfully
binaryen uses the same nomenclature. So the map function is pretty simple:

```ts
// src/compiler.mts
const mapBinaryenType = (typeIdentifier: string): binaryen.Type => {
  if (typeIdentifier === "i32") return binaryen.i32;
  if (typeIdentifier === "f32") return binaryen.f32;
  throw new Error(`Unsupported type ${typeIdentifier}`);
};
```

`getFunctionIdentifier` Made a call to a new function, `isNodeType`. This function is
essentially the same concept as `isTokenType` only for `ASTNode` instead of `Token`.

Here's the definition:

```ts
// src/compiler.mts
export const isNodeType = <T extends AstNode["type"]>(
  item: unknown,
  type: T
): item is Extract<AstNode, { type: T }> => {
  return (
    // Ensure the type exists
    !!item &&
    // Ensure the type is an object
    typeof item === "object" &&
    // Cast the type as a record so TypeScript doesn't get mad at us and then compare the
    // type field with the type parameter. If they are equal, we know the node is the
    // the type we were looking for.
    (item as Record<string, unknown>)["type"] === type;
  )
};
```

With the mapper finished we can start generating some code.

### Compiling Expressions

The `compileExpression` function is where we really start to make use of `binaryen` to model
the generated machine code. Because of the tree structure of an, _ahem_, abstract syntax tree,
`compileExpression` is highly recursive. This is one of my favorite things about programming
languages, their patterns tend to lend themselves to elegant recursive functions with high
levels of code re-use.

Let's start with defining the parameters of `compileExpression`. We will need to pass the
`binaryen.Module` and the `functionMap` we created earlier, the actual expression we are
compiling, and any parameters of the function this expression may be a part of (if it's inside)
of a function. When there are more than two parameters of a function it can be difficult
to visually keep track of what is what. So I like to make it clear by grouping them together
in an object. This enforces labeling the parameters on call and as a result, improves code
readability.

Here's the interface of that object:

```ts
// src/compiler.mts
interface CompileExpressionOpts {
  expression: AstNode;
  mod: binaryen.Module;
  functionMap: FunctionMap; // We defined this earlier
  parameters: ParameterMap; // Defined below.
}

// A map where the key is the parameter identifier and the value is the important information
// required by binaryen to fetch the parameter down the line
type ParameterMap = Map<string, { index: number; type: number }>;
```

Now that we have the options for `compileExpression` defined, we can define the actual function.
`compileExpression` takes `CompileExpressionOpts` as a parameter and returns a `number`. The job
of this function is to take an expression and determine what type of an expression it is,
from there it can pass the expression to another compiler function that can handle that specific
type of expression.

> Why return a number? When we build an expression with `binaryen` it returns a number as an identifier for
> that expression. This allows us to compile an expression ahead of time and then reference
> that expression later down the line.

Here's the definition:

```ts
// src/compiler.mts
const compileExpression = (opts: CompileExpressionOpts): number => {
  // Grab the expression and the binaryen module (mod) from the options.
  // The other fields are used by child function calls
  const { expression, mod } = opts;

  // Map the expression node to it's corresponding specific compiler
  if (isNodeType(expression, "block")) return compileBlock({ ...opts, expression });

  // Numbers are simple enough to compiler that we can just inline the compiler here.
  // They are represented as constants
  if (isNodeType(expression, "int")) return mod.i32.const(expression.value);
  if (isNodeType(expression, "float")) return mod.f32.const(expression.value);

  if (isNodeType(expression, "identifier")) return compileIdentifier({ ...opts, expression });

  // Throw a helpful error message if we don't recognize the expression
  throw new Error(`Unrecognized expression ${expression.type}`);
};
```

Lets define the `compileBlock` functions. Because this function is also compiling expression
we can re-use the previously defined `CompileExpressionOpts`, but we'll narrow the expression
field to the `BlockNode` type, since we know we are compiling a block by the time this function is
called:

```ts
interface CompileBlockOpts extends CompileExpressionOpts {
  expression: BlockNode;
}

const compileBlock = (opts: CompileBlockOpts): number => {
  // We re-map the expression field to block here for clarity.
  const { expression: block, mod } = opts;

  // When a block has multiple expressions and the first one is an identifier, that means
  // the block is actually a function call.
  if (isNodeType(block.expressions[0], "identifier") && block.expressions.length > 1) {
    // If it is a function call, transfer responsibility to the `compileFunctionCall` function (defined next)
    return compileFunctionCall(opts);
  }

  // This is where the recursive beauty starts to show. Since every value of a block
  // is an expression, we can map each one back to the compileExpression function.
  const expressions = block.expressions.map((expression) => {
    return compileExpression({ ...opts, expression });
  });

  // Now we generate the machine code by calling the block function of binaryen
  // This function takes a block name, an array of compiled expressions, and a block return type.
  // Named blocks are mostly useful for looping constructs like `for` and `while`. In this
  // case we can pass null as we're not compiling a loop construct. Additionally, we can
  // pass `auto` as the type since binaryen is smart enough to determine the return type
  // of blocks automatically.
  return mod.block(null, expressions, binaryen.auto);
};
```

> Note: If you're curious to see how looping works in binaryen / WebAssembly works, check out my block
> [post on the subject here](https://drew.ltd/blog/posts/2020-4-28.html). Spoiler alert, its pretty
> weird.

The last simple expression we'll compile in this section is the identifier expression. If
`compileExpression` was passed a lone `IdentifierNode` it means that the expression evaluates
to the value of the identifier. In wispy, we don't have variables and function identifiers are
caught before the could've been passed here. That means the only thing `IdentifierNode` can
resolve to is a parameter.

Here's the definition:

```ts
interface CompileIdentifierOpts extends CompileExpressionOpts {
  expression: IdentifierNode;
}

const compileIdentifier = (opts: CompileIdentifierOpts): number => {
  // We remap expression to node to keep our lines a little shorter
  const { expression: node, parameters, mod } = opts;

  // Since we know the identifier has to be a parameter, we look it up in our
  // parameter map. Don't worry, we'll define the parameter map in the next section
  const info = parameters.get(node.identifier);
  if (!info) {
    throw new Error(`Unrecognized identifier ${node.identifier}`);
  }

  // Finally we use the local.get instruction to return the parameter value.
  // Binaryen needs to know the parameters index and type. We'll get into
  // the index when we define our parameter mapping function.
  return mod.local.get(info.index, info.type);
};
```

The final expression type left to compile is a function call. This is interesting enough
to warrant its own section.

### Compiling Function Calls

In wispy function calls are blocks with multiple expressions where the first expression is an
identifier. The job of `compileFunction` is to determine which function is being called, what
it's parameters and return type are, and finally, building the call instruction with binaryen.

Here's the definition:

```ts
// src/compiler.mts

// Because function calls are blocks, we can re-use CompileBlockOpts
const compileFunctionCall = (opts: CompileBlockOpts): number => {
  const { expression, functionMap, mod } = opts;

  // The first expression of a function call is the functions identifier
  const identifierNode = expression.expressions[0];

  // Here we just ensure the identifierNode is *actually* an identifier. Otherwise we throw an error.
  if (!isNodeType(identifierNode, "identifier")) {
    throw new Error("Expected identifier when compiling function call");
  }

  // Next we create a reference to what the actual identifier is
  const identifier = identifierNode.identifier;

  // If the identifier is "fn", the function we are calling is the function to define functions!
  // Thats right! Functions are created by another function. Pretty neat if you ask me.
  if (identifier === "fn") return compileFunction(opts); // We'll define this next

  // Ifs are special functions. They may or may not have an else block. Binaryen needs to know
  // if the else block exists at compile time, so we have a special if compiler for this.
  if (identifier === "if") return compileIf(opts); // We'll define this later

  // Every other function is either part of the standard library, or is defined
  // within the wispy code itself.
  const functionInfo = functionMap.get(identifier);
  if (!functionInfo) {
    throw new Error(`Function ${identifier} not found`);
  }

  const params = expression.expressions
    // Every other expression in the block are parameters to the function, so we compile them
    // and then pass them to the call
    .slice(1)
    .map((expression) => compileExpression({ ...opts, expression }));

  // Now we use binaryen to construct the call expression. The first parameter
  // is the functions identifier, the second are the compiled parameter expression,
  // and the third is the return type which has already been determined by generateFunctionMap
  return mod.call(identifier, params, functionInfo.returnType);
};
```

Lets define the `compileIf` function before we move onto the `compileFunction`... function.

```ts
// src/compiler.mts

const compileIf = (opts: CompileBlockOpts): number => {
  const { expression, mod } = opts;

  // The first expression, expression.expressions[0], is the "if" identifier, we don't need
  // to do anything with it since we already know we are compiling an if expression

  // The second expression is the if condition
  const conditionNode = expression.expressions[1];

  // The third expression is the ifTrueNode, it's what is executed if the conditionNode evaluates to
  // true
  const ifTrueNode = expression.expressions[2];

  // Finally the fourth expression (which may or may not exist) is what is executed if the condition
  // evaluates to false
  const ifFalseNode = expression.expressions[3];

  // Compile the condition expression
  const condition = compileExpression({ ...opts, expression: conditionNode });

  // Compile the ifTrue Expression
  const ifTrue = compileExpression({ ...opts, expression: ifTrueNode });

  // Check to see if the ifFalseNode exists, if it does, compile it, otherwise set ifFalse to undefined
  const ifFalse = ifFalseNode ? compileExpression({ ...opts, expression: ifFalseNode }) : undefined;

  // Finally we use binaryen to compile the if expression
  return mod.if(condition, ifTrue, ifFalse);
};
```

### Compiling Function Definitions

Function definitions are a whole lot like function calls, so the function structure is pretty similar.
We take `CompileBlockOpts` and return a number (the binaryen expression reference).

Heres the definition:

```ts
// src/compiler.mts

const compileFunction = (opts: CompileBlockOpts): number => {
  const { expression: block, mod } = opts;

  // We need to tell binaryen what the identifier and return type of the function is
  // Thankfully, we already wrote a function for that, getFunctionIdentifier. We
  // could also have just looked up this information with the functionMap, but
  // this is more fun.
  const { identifier, returnType } = getFunctionIdentifier(block);

  // Next we grab the function parameters. This is the third expression of the function
  const { parameters, parameterTypes } = getFunctionParameters(block); // Defined later

  // The rest of the expressions in the function are the functions block. So we create
  // a new BlockNode from the remaining expression.
  const body = compileBlock({
    ...opts,
    expression: {
      type: "block",
      expressions: block.expressions.slice(3),
    },

    // We need to pass the parameters of this function so they can be referenced in child
    // expressions
    parameters,
  });

  // Now we register the function with binaryen. Binaryen takes the function identifier,
  // an array of parameter types (each item being the type of a parameter in order),
  // the functions return type, a list of variable types (wispy doesn't have any so we pass an empty array)
  // and finally the compiled body of the function.
  mod.addFunction(identifier, parameterTypes, returnType, [], body);

  // To make things easy we export every single function defined in a wispy file
  // so it can be called by the WebAssembly host.
  mod.addFunctionExport(identifier, identifier);

  // Because function definitions are *technically* expressions that can be a part of another function
  // body, we need to return an expression pointer. For this we just just return a nop (do nothing instruction),
  // to make things consistent.
  return mod.nop();
};
```

Now lets define the `getFunctionParameters` function. This function takes the function `BlockNode`,
that is, the entire unmodified function definition, and extracts it's parameters. The function
returns two values, parameters and parameterTypes.

The first returned value, parameters, is a map where the key is the parameter identifier, and the
value is the information needed to access the parameter down the line within the function body.

The second returned value is an array binaryen types. There is one type for each defined parameter
and they must remain in the order they are defined. This is because binaryen doesn't reference
parameters by their names, instead it references them by the index of the array in which
they are defined. Don't worry if this is confusing to you, the code should make things a little
more clear. If you need, refer back to the `compileIdentifier` definition, to get a better
understanding of how this works in practice.

Heres the definition:

```ts
// src/compiler.mts

type ParameterMap = Map<string, { index: number; type: number }>;

const getFunctionParameters = (block: BlockNode) => {
  // The parameters are defined in the third expression of the function definition
  const node = block.expressions[2];

  // Check to make sure the third expression is a block
  if (!isNodeType(node, "block")) {
    throw new Error("Expected function parameters");
  }

  // Now we reduce the parameters into a parameter map, and a list of binaryen types
  const { parameters, types } = node.expressions.reduce(
    (prev, node, index) => {
      // First, ensure that the node is a typed-identifier. Every parameter must be a
      // typed identifier, therefore, every node in this reducer must be a typed identifier.
      if (!isNodeType(node, "typed-identifier")) {
        throw new Error("All parameters must be typed");
      }

      // Determine the correct binaryen type of the parameter
      const type = mapBinaryenType(node.typeIdentifier);

      // Add the parameter's type to the list of types we've defined so far
      const types = [type, ...prev.types];

      // Now add the parameter to the parameter map. We save the parameters index and type.
      // The index and type is used binaryen to access the parameter when it is used
      // later in the function body
      const parameters = new Map([[node.identifier, { index, type }], ...prev.parameters]);

      // Return updated parameters map and types array
      return {
        parameters,
        types,
      };
    },
    // Here we are setting the starting values for our reducer function and casting the default
    // type so typescript can correctly infer the `prev` parameter type
    { parameters: new Map(), types: [] } as {
      parameters: ParameterMap;
      types: number[];
    }
  );

  // Finally we return the parameter map and the parameterTypes
  return {
    parameters,

    // Note: parameterTypes is a number, instead of an array of numbers as you'd expect.
    // So we have to use binaryen.createType to create a new type that is referenced
    // the mod.addFunction function. This is one inconsistency with the binaryen API. Parameters
    // are defined as a number, and variables are defined as an array of numbers. I'm sure there
    // is a reason for this, but I don't know what that reason is.
    parameterTypes: binaryen.createType(types),
  };
};
```

Now all that's left is to define the standard library. This part of the code isn't super interesting.
We are essentially just mapping primitive WebAssembly instructions to a name to be referenced
within wispy.

Here's the definitions. The only important information is the name we are associating with each
instruction:

```ts
// src/compiler.mts

const registerStandardFunctions = (mod: binaryen.Module, map: FunctionMap) => {
  const { i32, f32 } = binaryen;
  const { i32: i32m, f32: f32m } = mod;
  const common = { mod, map };
  registerLogicFunction({ name: "lt_i32", type: i32, operator: i32m.lt_s, ...common });
  registerLogicFunction({ name: "gt_i32", type: i32, operator: i32m.gt_s, ...common });
  registerLogicFunction({ name: "eq_i32", type: i32, operator: i32m.eq, ...common });
  registerLogicFunction({ name: "lt_f32", type: f32, operator: f32m.lt, ...common });
  registerLogicFunction({ name: "gt_f32", type: f32, operator: f32m.gt, ...common });
  registerLogicFunction({ name: "eq_f32", type: f32, operator: f32m.eq, ...common });
  registerMathFunction({ name: "add_i32", type: i32, operator: i32m.add, ...common });
  registerMathFunction({ name: "sub_i32", type: i32, operator: i32m.sub, ...common });
  registerMathFunction({ name: "mul_i32", type: i32, operator: i32m.mul, ...common });
  registerMathFunction({ name: "add_f32", type: f32, operator: f32m.add, ...common });
  registerMathFunction({ name: "sub_f32", type: f32, operator: f32m.sub, ...common });
  registerMathFunction({ name: "mul_f32", type: f32, operator: f32m.mul, ...common });
  registerMathFunction({ name: "div_f32", type: f32, operator: f32m.div, ...common });
};

const registerMathFunction = (opts: {
  mod: binaryen.Module;
  name: string;
  type: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  const { mod, name, type, operator, map } = opts;
  return registerBinaryFunction({
    mod,
    name,
    paramType: type,
    returnType: type,
    operator,
    map,
  });
};

const registerLogicFunction = (opts: {
  mod: binaryen.Module;
  name: string;
  type: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  const { mod, name, type, operator, map } = opts;
  return registerBinaryFunction({
    mod,
    name,
    paramType: type,
    returnType: binaryen.i32,
    operator,
    map,
  });
};

const registerBinaryFunction = (opts: {
  mod: binaryen.Module;
  name: string;
  paramType: number;
  returnType: number;
  operator: (left: number, right: number) => number;
  map: FunctionMap;
}) => {
  const { mod, name, paramType, returnType, operator, map } = opts;
  mod.addFunction(
    name,
    binaryen.createType([paramType, paramType]),
    returnType,
    [],
    mod.block(
      null,
      [operator(mod.local.get(0, paramType), mod.local.get(1, paramType))],
      binaryen.auto
    )
  );
  map.set(name, { returnType });
};
```

With that, our compiler is finished. It's time to execute some wispy!

### Putting It All Together

Now that we have finished our compiler, we can finally run our code.

First, replace the contents of `src/index.mts` with this:

```ts
// src/index.mts

#!/usr/bin/env node
import { readFileSync } from "fs";
import { compile } from "./compiler.mjs";
import { lex } from "./lexer.mjs";
import { parse } from "./parser.mjs";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);
const ast = parse(tokens);

// !! New !!
const mod = compile(ast);

// This is sneakily where the code gen is *actually* happening
const binary = mod.emitBinary();

// Use the standard WebAssembly API to convert the wasm binary to a compiled module
// our host NodeJS/v8 can use
const compiled = new WebAssembly.Module(binary);

// Build the instance, here you would add any external functions you might want to import into
// the WebAssembly module
const instance = new WebAssembly.Instance(compiled, {});

// Finally, run the main function and log the result. We have to cast instance.exports to any
// The standard TypeScript types appear to be wrong.
console.log((instance.exports as any).main());
```

Now build and run project:

```bash
npx tsc
wispy example.wispy
```

If all goes well (and you passed the number 15 to fib), you should see the number `610` in the
output of your console. If so you've done it, you've made a working WebAssembly language. Congrats!
