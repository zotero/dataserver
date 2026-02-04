# Zotero API Tests (JavaScript)

JavaScript port of the Zotero API tests from PHP.

## Running Tests

Use the `run_tests` script to run tests:

```bash
# Run all tests
./run_tests

# Run all tests, stop on first failure
./run_tests -b

# Run specific test file(s)
./run_tests item
./run_tests item,object

# Run specific tests with bail
./run_tests -b item,object

# Run tests matching a pattern
./run_tests -g "should create"

# Combine options
./run_tests -b -g "should return" item

# Show help
./run_tests --help
```

### Options

- `-b, --bail` - Stop on first test failure
- `-g, --grep PATTERN` - Only run tests matching pattern
- `-t, --timeout MS` - Set timeout in milliseconds (default: 30000)
- `-h, --help` - Show help message

## Adding Tests for New API Versions

When adding tests for API v2 or v1:

1. Create the version directory: `mkdir tests/2`
2. Add test files to the new directory
3. Update import paths to use `../../` prefix:
   - `from '../../api3.js'`
   - `from '../../assertions.js'`
   - `from '../../setup.js'`
   - etc.

The test runner will automatically discover tests in all version subdirectories.
