#!/usr/bin/env node
import { readFileSync } from "fs";
import { compile } from "./compiler";
import { lex } from "./lexer";
import { parse } from "./parser";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);
const ast = parse(tokens);
const mod = compile(ast);
mod.optimize();
const binary = mod.emitBinary();
const compiled = new WebAssembly.Module(binary);
const instance = new WebAssembly.Instance(compiled, {});

console.log((instance.exports as any).fib(10));
