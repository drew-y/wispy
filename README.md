# Wispy - An intro to WebAssembly compilers

Wispy is a lisp dialect that compiles to WebAssembly. The intention of the language
is to be a short and simple language that can be easily implemented by people interested
in programming languages.

```
(fn fib:int [val:int]
  (if (lt val 2)
    val
    (add (fib (sub n 1)) (fib (sub n 2)))
  )
)
```
