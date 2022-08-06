#!/usr/bin/env node
import { readFileSync } from "fs";
import { compile } from "./compiler.mjs";
import { lex } from "./lexer.mjs";
import { parse } from "./parser.mjs";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);
console.log(JSON.stringify(tokens, undefined, 2));
const ast = parse(tokens);
const mod = compile(ast);

const binary = mod.emitBinary();
const compiled = new WebAssembly.Module(binary);
const instance = new WebAssembly.Instance(compiled, {});

console.log((instance.exports as any).main());
