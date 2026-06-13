# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journey.spec.ts >> 040 Intent creation: conversation + agent package preview + create button
- Location: e2e/journey.spec.ts:57:1

# Error details

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for getByRole('button', { name: /Enter — go to Intent List/ })

```

```
Error: write EPIPE
```