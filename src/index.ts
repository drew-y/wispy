#!/usr/bin/env node
import { readFileSync } from "fs";
import { lex } from "./lexer";

const file = process.argv[2];
const input = readFileSync(file, "utf8");

const tokens = lex(input);

console.log(JSON.stringify(tokens, null, 2));
