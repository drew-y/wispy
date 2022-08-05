# Make a WebAssembly Language for Fun and Profit

Intro here

## Setup

In this tutorial we will be using TypeScript and NodeJS. The concepts are highly portable, so
feel free to use the environment your most comfortable with. Our only major dependency, [binaryen](https://github.com/WebAssembly/binaryen),
has a simple C API. Feel free to skip ahead to the next section if you're using a different
language.

1. Open a terminal window and create a new folder. For this tutorial we will use `wispy`:

```bash
mkdir wispy && cd wispy
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

5.
