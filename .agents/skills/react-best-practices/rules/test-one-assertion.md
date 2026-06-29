---
title: One Logical Assertion Per Test
impact: MEDIUM
impactDescription: focused tests, easier debugging
tags: test, assertions, testing-best-practices, debugging
---

## One Logical Assertion Per Test

Write tests with one logical assertion per test. This makes tests more focused and easier to debug.

**Incorrect (multiple unrelated assertions):**

```typescript
it('should handle user operations', () => {
  const service = new UserService()
  const user = service.create({ name: 'John' })
  expect(user).toBeDefined()

  const found = service.findById(user.id)
  expect(found).toEqual(user)

  service.delete(user.id)
  expect(service.findById(user.id)).toBeUndefined()
})
```

**Correct (separate tests for each behavior):**

```typescript
it('should create user', () => {
  const service = new UserService()
  const user = service.create({ name: 'John' })
  expect(user.id).toBeDefined()
})

it('should find user by id', () => {
  const service = new UserService()
  const created = service.create({ name: 'John' })
  const found = service.findById(created.id)
  expect(found).toEqual(created)
})

it('should delete user', () => {
  const service = new UserService()
  const user = service.create({ name: 'John' })
  service.delete(user.id)
  expect(service.findById(user.id)).toBeUndefined()
})
```

**Multiple related assertions are okay:**

```typescript
// Testing one concept with multiple fields
it('should create user with correct data', () => {
  const service = new UserService()
  const user = service.create({
    name: 'John',
    email: 'john@example.com',
    age: 30
  })

  expect(user.name).toBe('John')
  expect(user.email).toBe('john@example.com')
  expect(user.age).toBe(30)
})
```

**Benefits:**
- Tests fail for one reason only
- Easier to identify what broke
- More focused test suite
- Better test documentation

Reference: [Test Size - Kent C. Dodds](https://kentcdodds.com/blog/avoid-the-test-splitter-antipattern)
