---
title: Follow AAA Pattern in Tests
impact: MEDIUM
impactDescription: more readable and maintainable tests
tags: test, aaa-pattern, testing-best-practices, readability
---

## Follow AAA Pattern in Tests

Organize tests using AAA pattern: Arrange (setup), Act (execute), Assert (verify). This makes tests more readable and maintainable.

**Incorrect (mixed arrange/act/assert):**

```typescript
it('should create user', () => {
  const service = new UserService()
  const user = service.create({ name: 'John', email: 'john@example.com' })
  expect(user.name).toBe('John')
  expect(user.email).toBe('john@example.com')
  const found = service.findById(user.id)
  expect(found).toEqual(user)
})
```

**Correct (clear AAA sections):**

```typescript
it('should create user', () => {
  // Arrange
  const service = new UserService()
  const userData = { name: 'John', email: 'john@example.com' }

  // Act
  const user = service.create(userData)

  // Assert
  expect(user.name).toBe('John')
  expect(user.email).toBe('john@example.com')
  expect(user.id).toBeDefined()
})
```

**With comments or blank lines:**

```typescript
it('should calculate total with discount', () => {
  // Arrange
  const cart = new Cart()
  cart.addItem({ price: 100 })
  cart.addItem({ price: 50 })
  const discount = 0.1

  // Act
  const total = cart.calculateTotal(discount)

  // Assert
  expect(total).toBe(135) // (100 + 50) * 0.9
})
```

**Benefits:**
- Clear separation of setup, execution, and verification
- Easier to understand test intent
- Simpler to debug failing tests
- Consistent structure across all tests

Reference: [AAA Pattern - Martin Fowler](https://martinfowler.com/bliki/GivenWhenThen.html)
