---
title: Use Arrow Functions to Preserve 'this' Context
impact: MEDIUM
impactDescription: prevents common bugs with this binding
tags: js, arrow-functions, this-binding, callbacks
---

## Use Arrow Functions to Preserve 'this' Context

Use arrow functions instead of regular functions in callbacks to preserve the `this` context from the enclosing scope.

**Incorrect (loses 'this' context):**

```typescript
class Counter {
  count = 0

  incrementTraditional() {
    // 'this' is undefined in strict mode inside setTimeout
    setTimeout(function () {
      this.count++  // Error: Cannot read property 'count' of undefined
    }, 1000)
  }

  // Requires manual binding
  incrementWithBind() {
    setTimeout(function () {
      this.count++  // Works, but verbose
    }.bind(this), 1000)
  }
}
```

**Correct (arrow function preserves 'this'):**

```typescript
class Counter {
  count = 0

  // Arrow function as method
  increment = () => {
    this.count++
  }

  // Arrow function in callback
  startTimer() {
    setTimeout(() => {
      this.count++  // 'this' refers to Counter instance
    }, 1000)
  }

  // Array methods
  processItems(items) {
    return items.map(item => {
      return { ...item, processed: true }
    })
  }
}
```

**Common use cases:**

```typescript
// Event handlers
class Button {
  label = 'Click me'

  init() {
    // Arrow function preserves 'this'
    button.addEventListener('click', () => {
      console.log(this.label)  // Works
    })
  }
}

// Array methods
class List {
  items = [1, 2, 3]

  doubleAll() {
    return this.items.map(x => x * 2)  // 'this' works
  }
}

// Promises
class Loader {
  data = null

  async load() {
    await fetch('/data').then(res => res.json).then(data => {
      this.data = data  // 'this' works
    })
  }
}
```

**When NOT to use arrow functions:**

- When you need your own `this` context (object methods, constructors)
- When you need the `arguments` object
- For methods that need to be called with `.call()` or `.apply()`

Reference: [MDN Arrow Functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)
