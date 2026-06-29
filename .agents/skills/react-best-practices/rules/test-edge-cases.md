---
title: Test Edge Cases and Error Paths
impact: HIGH
impactDescription: robust code, catches bugs early
tags: test, edge-cases, error-handling, robustness
---

## Test Edge Cases and Error Paths

Don't just test happy paths. Test edge cases, null/undefined inputs, empty arrays, and error conditions.

**Incorrect (only happy path):**

```typescript
describe('Calculator', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })
})
```

**Correct (covers edge cases):**

```typescript
describe('Calculator', () => {
  describe('add', () => {
    it('should add positive numbers', () => {
      expect(add(2, 3)).toBe(5)
    })

    it('should add negative numbers', () => {
      expect(add(-2, -3)).toBe(-5)
    })

    it('should handle zero', () => {
      expect(add(0, 5)).toBe(5)
      expect(add(5, 0)).toBe(5)
    })

    it('should handle decimals', () => {
      expect(add(0.1, 0.2)).toBeCloseTo(0.3)
    })
  })

  describe('divide', () => {
    it('should throw error when dividing by zero', () => {
      expect(() => divide(5, 0)).toThrow('Division by zero')
    })
  })
})
```

**Common edge cases to test:**

```typescript
describe('UserService', () => {
  it('should handle null input', () => {
    expect(() => service.create(null)).toThrow()
  })

  it('should handle undefined input', () => {
    expect(() => service.create(undefined)).toThrow()
  })

  it('should handle empty string', () => {
    const user = service.create({ name: '', email: 'test@example.com' })
    expect(user.name).toBe('')
  })

  it('should handle empty array', () => {
    const users = service.findByIds([])
    expect(users).toEqual([])
  })

  it('should handle very large input', () => {
    const longName = 'a'.repeat(10000)
    expect(() => service.create({ name: longName })).toThrow()
  })
})
```

**Test error paths:**

```typescript
describe('API', () => {
  it('should handle 404 errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(service.fetchUser('999')).rejects.toThrow('Not found')
  })

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    await expect(service.fetchUser('1')).rejects.toThrow('Network error')
  })

  it('should handle timeout', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    await expect(service.fetchUser('1', { timeout: 100 }))
      .rejects.toThrow('Timeout')
  })
})
```

**Benefits:**
- Catches bugs before production
- Documents expected behavior for edge cases
- More confident refactoring
- Better error handling in production

Reference: [Testing Edge Cases - Kent C. Dodds](https://kentcdodds.com/blog/write-tests)
