#!/usr/bin/env node
import { readFileSync } from "fs";
import { lex } from "./lexer";
import { parse } from "./parser";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);
const ast = parse(tokens);

console.log(JSON.stringify(ast, null, 2));
