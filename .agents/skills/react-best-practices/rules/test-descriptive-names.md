---
title: Write Descriptive Test Names
impact: LOW-MEDIUM
impactDescription: self-documenting tests, easier debugging
tags: test, test-names, readability, documentation
---

## Write Descriptive Test Names

Write test names that describe what is being tested and what the expected outcome is. Test names should serve as documentation.

**Incorrect (vague names):**

```typescript
it('should work', () => {})
it('test user', () => {})
it('handles correctly', () => {})
```

**Correct (descriptive names):**

```typescript
it('should create user with valid data', () => {})
it('should throw error when email already exists', () => {})
it('should return user by id when found', () => {})
```

**Use "should" convention:**

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', () => {})
    it('should throw error when email is invalid', () => {})
    it('should hash password before saving', () => {})
    it('should send welcome email', () => {})
  })
})
```

**Describe behavior, not implementation:**

```typescript
// Bad - describes implementation
it('should call database.save()', () => {})

// Good - describes behavior
it('should persist user to database', () => {})
```

**Include scenario and expected outcome:**

```typescript
// Pattern: should [expected outcome] when [scenario]
it('should return 404 when user not found', () => {})
it('should redirect to login when not authenticated', () => {})
it('should show error message when form is invalid', () => {})
```

Good test names make it easy to understand what functionality is being tested without reading the test body.

Reference: [Naming Tests - Kent C. Dodds](https://kentcdodds.com/blog/how-to-write-good-test-names)
