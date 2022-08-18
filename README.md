# Wispy - An intro to WebAssembly compilers

Wispy is a lisp dialect that compiles to WebAssembly. The intention of the language
is to be a short and simple language that can be easily implemented by people interested
in programming languages.

```
(fn fib:i32 [val:i32]
  (if (lt_i32 val 2)
    val
    (add_i32 (fib (sub_i32 val 1)) (fib (sub_i32 val 2)))))

(fn main:i32 [] (fib 15))
```
