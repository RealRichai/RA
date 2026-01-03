# Media Generation Quality Assurance

The `@realriches/media-generator` package implements investor-grade quality assurance through golden tests and deterministic output validation.

## Overview

Media generation (PDF, PPTX, HTML) must produce consistent, predictable outputs for:
- **Audit trails**: Same inputs always produce identical checksums
- **Compliance**: Layout changes don't accidentally remove required disclosures
- **Investor confidence**: Flyers and presentations look professional every time

## Golden Tests

### What Are Golden Tests?

Golden tests compare generated output against pre-computed "golden" baselines. If the output changes unexpectedly, the test fails - catching layout regressions before they reach production.

### Test Coverage

| Generator | Validation Method | CI Job |
|-----------|-------------------|--------|
| HTML Renderer | Normalized DOM hash | `template-quality-gate` |
| PDF Generator | Page count + text content hash | `template-quality-gate` |
| PPTX Generator | Slide count + buffer size tolerance | `template-quality-gate` |

### How It Works

1. **Fixed Fixtures**: Tests use deterministic input data from `__fixtures__/listings/`
2. **Generate Output**: Each generator produces its format
3. **Normalize & Hash**: Content is normalized (whitespace, timestamps removed) and hashed
4. **Compare Baseline**: Hash compared against stored baseline in `baselines.json`
5. **Fail on Deviation**: If hash differs, CI fails with clear error message

## Baseline Management

### Baseline Location

```
packages/media-generator/src/__fixtures__/golden/baselines.json
```

### Baseline Structure

```json
{
  "version": "1.0.0",
  "baselines": {
    "html": {
      "nyc-apartment-flyer": {
        "contentHash": "0f707a990c2ec23fb44fa526348fd441",
        "normalizedHash": "201d8362bbfc495351d8aa3ea9336c8f",
        "variableCount": 0,
        "compliancePlaceholderPresent": true
      }
    },
    "pdf": {
      "nyc-apartment-flyer": {
        "pageCount": 1,
        "textContentHash": "25dd87053fcc07c89e47785da4aa26b4",
        "bufferSizeRange": { "min": 1414, "max": 1730 }
      }
    },
    "pptx": {
      "nyc-apartment-presentation": {
        "slideCount": 5,
        "slideTypes": ["title", "details", "amenities", "photos", "disclosures"],
        "bufferSizeRange": { "min": 72803, "max": 109205 }
      }
    }
  }
}
```

### Regenerating Baselines

When intentionally changing output format:

```bash
# Regenerate all golden baselines
REGENERATE_GOLDEN_BASELINES=true pnpm --filter @realriches/media-generator test

# Verify changes are intentional
git diff packages/media-generator/src/__fixtures__/golden/baselines.json

# Commit updated baselines
git add packages/media-generator/src/__fixtures__/golden/baselines.json
git commit -m "chore(media): update golden baselines for layout change"
```

## CI Integration

### Template Quality Gate Job

The `template-quality-gate` CI job runs on every push/PR:

1. Installs dependencies and builds packages
2. Runs `golden.test.ts` against stored baselines
3. Validates baseline file exists and is complete
4. Runs all media-generator tests
5. Uploads artifacts on failure for debugging

### Failure Handling

If golden tests fail:

1. **Check the error message**: Shows which generator/baseline deviated
2. **Review changes**: Did you intentionally modify the generator?
3. **If intentional**: Regenerate baselines and commit
4. **If unintentional**: Investigate and fix the regression

## Test Details

### HTML Renderer Tests

```typescript
// Validates:
// - Deterministic output (same input = same output)
// - Variable interpolation ({{listing.title}} etc.)
// - XSS escaping (prevents injection attacks)
// - Compliance placeholder preserved for block injection
```

### PDF Generator Tests

```typescript
// Validates:
// - Deterministic checksums
// - Valid PDF structure (%PDF header, catalog, pages, %%EOF)
// - Page count consistency
// - Text content embedding
// - Correct MIME type
```

### PPTX Generator Tests

```typescript
// Validates:
// - Expected slide count (5 default slides)
// - Correct slide types (title, details, amenities, photos, disclosures)
// - Valid PPTX structure (ZIP archive with PK header)
// - Compliance blocks included
// - Buffer size within tolerance (PPTX includes timestamps)
```

## Adding New Templates

When adding a new template:

1. **Add fixture data** to `__fixtures__/listings/`
2. **Add template file** to `__fixtures__/templates/`
3. **Add baseline entry** to `baselines.json` with `PENDING_GENERATION`
4. **Run tests with regeneration** to compute initial baseline
5. **Commit all files** including the new baseline

Example:

```json
// baselines.json
{
  "baselines": {
    "pdf": {
      "new-template": {
        "pageCount": 1,
        "textContentHash": "PENDING_GENERATION",
        "bufferSizeRange": { "min": 0, "max": 10000 }
      }
    }
  }
}
```

## Troubleshooting

### "Hash mismatch" error

The generated output differs from baseline. This happens when:
- Template HTML changed
- Variable interpolation logic changed
- Compliance block content changed
- Generator formatting changed

**Fix**: Review changes, regenerate baselines if intentional.

### "Baseline not found" error

The `baselines.json` file is missing or incomplete.

**Fix**: Run tests with `REGENERATE_GOLDEN_BASELINES=true` to generate missing baselines.

### PPTX tests intermittently fail

PPTX files include timestamps, making exact hash matching impossible. Tests use buffer size tolerance instead.

**Fix**: If buffer size variance increases, expand the tolerance range in baselines.

## Performance Impact

Golden tests add minimal overhead:
- HTML: ~10ms per render
- PDF (mock): ~50ms per generation
- PPTX (real): ~300ms per generation

Total golden test suite: < 1 second

## Related Documentation

- [Media Generator Package](../../packages/media-generator/README.md)
- [Compliance Block Injection](../../packages/media-generator/src/renderers/block-injector.ts)
- [Template Variables](../../packages/media-generator/src/renderers/html-renderer.ts)
