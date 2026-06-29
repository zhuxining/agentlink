---
title: Prefer Semantic Queries Over data-testid
impact: LOW-MEDIUM
impactDescription: accessible, resilient tests
tags: test, testing-library, selectors, accessibility
---

## Prefer Semantic Queries Over data-testid

Prefer semantic queries ( getByRole, getByText, getByLabelText ) over data-testid for more accessible and resilient tests.

**Incorrect (overuses data-testid):**

```typescript
// Component
function LoginForm() {
  return (
    <form>
      <input data-testid="username-input" />
      <input data-testid="password-input" type="password" />
      <button data-testid="submit-button">Login</button>
    </form>
  )
}

// Test - only cares about test ids
it('should render login form', () => {
  render(<LoginForm />)
  expect(screen.getByTestId('username-input')).toBeInTheDocument()
  expect(screen.getByTestId('password-input')).toBeInTheDocument()
  expect(screen.getByTestId('submit-button')).toBeInTheDocument()
})
```

**Correct (uses semantic queries):**

```typescript
// Component - accessible markup
function LoginForm() {
  return (
    <form>
      <label>
        Username
        <input name="username" />
      </label>
      <label>
        Password
        <input name="password" type="password" />
      </label>
      <button type="submit">Login</button>
    </form>
  )
}

// Test - reflects user interaction
it('should render login form', () => {
  render(<LoginForm />)

  // User sees: "Username" label
  expect(screen.getByLabelText('Username')).toBeInTheDocument()

  // User sees: "Password" label
  expect(screen.getByLabelText('Password')).toBeInTheDocument()

  // User sees: "Login" button
  expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
})
```

**Query priority order (from Testing Library):**

```typescript
// 1. Best - queries accessible to users
screen.getByRole('button', { name: 'Submit' })
screen.getByLabelText('Email')
screen.getByPlaceholderText('Search')
screen.getByText('Welcome')

// 2. Okay - semantic meaning
screen.getByAltText('Logo')
screen.getByTitle('Close')

// 3. Last resort - implementation details
screen.getByTestId('submit-btn')
```

**When to use data-testid:**

```typescript
// Use when:
// - Element has no text or role (icons, styled divs)
// - Multiple elements with same text
// - Testing layout/structure

// Icon without label
<StarIcon data-testid="favorite-icon" />

it('should show favorite icon', () => {
  render(<ProductCard />)
  expect(screen.getByTestId('favorite-icon')).toBeInTheDocument()
})
```

**Benefits:**
- Tests user experience
- Encourages accessibility
- Survives CSS changes
- More readable intent

Reference: [Priority Guide - Testing Library](https://testing-library.com/docs/queries/about/#priority)
