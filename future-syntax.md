# Future Syntax

Wispy will have whitespace based parenthetical elision:

```
// With Elision
fn fib:int [val:i32]
  if (lt val 2)
    val
    add (fib (sub n 1)) (fib (sub n 2))

// Without Elision
(fn fib:int [val:i32]
  (if (lt val 2)
    val
    (add (fib (sub n 1)) (fib (sub n 2)))))
```
