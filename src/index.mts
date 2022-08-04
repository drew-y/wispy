#!/usr/bin/env node
import { readFileSync } from "fs";
import { compile } from "./compiler.mjs";
import { lex } from "./lexer.mjs";
import { parse } from "./parser.mjs";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);
const ast = parse(tokens);
const mod = compile(ast);
mod.optimize();
const binary = mod.emitBinary();
const compiled = new WebAssembly.Module(binary);
const instance = new WebAssembly.Instance(compiled, {});

function fib(val: number): number {
  if (val < 2) return val;
  return fib(val - 1) + fib(val - 2);
}

console.time("wasm");
(instance.exports as any).fib(42);
console.timeEnd("wasm");

console.time("javascript");
fib(42);
console.timeEnd("javascript");
