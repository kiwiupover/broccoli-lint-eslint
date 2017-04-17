'use strict';

const path = require('path');
const expect = require('./chai').expect;
const co = require('co');
const testHelpers = require('broccoli-test-helper');
const eslint = require('..');

const createBuilder = testHelpers.createBuilder;
const createTempDir = testHelpers.createTempDir;

describe('broccoli-lint-eslint', function() {
  let input, output, console;

  beforeEach(co.wrap(function *() {
    input = yield createTempDir();
    console = {
      log(line) {},
    };
  }));

  afterEach(co.wrap(function *() {
    yield input.dispose();
    if (output) {
      yield output.dispose();
    }
  }));

  it('logs errors to the console', co.wrap(function *() {
    input.write({
      '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error', 'no-unused-vars': 'warn' } };\n`,
      'a.js': `console.log('foo');\n`,
      'b.js': `var foo = 5;\n`,
    });

    let format = 'eslint/lib/formatters/compact';

    let messages = [];
    let console = {
      log(message) {
        messages.push(message);
      }
    };

    output = createBuilder(eslint(input.path(), { format, console }));

    yield output.build();

    expect(messages.join(''))
      .to.contain(`a.js: line 1, col 1, Error - Unexpected console statement. (no-console)\n`)
      .to.contain(`b.js: line 1, col 5, Warning - 'foo' is assigned a value but never used. (no-unused-vars)\n`);
  }));


  it('does not generate test files by default', co.wrap(function *() {
    input.write({
      '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error', 'no-unused-vars': 'warn' } };\n`,
      'a.js': `console.log('foo');\n`,
      'b.js': `var foo = 5;\n`,
    });

    output = createBuilder(eslint(input.path(), { console }));

    yield output.build();

    expect(Object.keys(output.read())).to.deep.equal(['.eslintrc.js', 'a.js', 'b.js']);
  }));

  describe('testGenerator', function() {
    it('qunit: generates QUnit tests', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error', 'no-unused-vars': 'warn' } };\n`,
        'a.js': `console.log('foo');\n`,
        'b.js': `var foo = 5;\n`,
      });

      output = createBuilder(eslint(input.path(), { console, testGenerator: 'qunit' }));

      yield output.build();

      let result = output.read();
      expect(Object.keys(result)).to.deep.equal(['.eslintrc.lint-test.js', 'a.lint-test.js', 'b.lint-test.js']);
      expect(result['a.lint-test.js'].trim()).to.equal([
        `QUnit.module('ESLint | a.js');`,
        `QUnit.test('should pass ESLint', function(assert) {`,
        `  assert.expect(1);`,
        `  assert.ok(false, 'a.js should pass ESLint\\n\\n1:1 - Unexpected console statement. (no-console)');`,
        `});`,
      ].join('\n'));
    }));

    it('mocha: generates Mocha tests', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error', 'no-unused-vars': 'warn' } };\n`,
        'a.js': `console.log('foo');\n`,
        'b.js': `var foo = 5;\n`,
      });

      output = createBuilder(eslint(input.path(), { console, testGenerator: 'mocha' }));

      yield output.build();

      let result = output.read();
      expect(Object.keys(result)).to.deep.equal(['.eslintrc.lint-test.js', 'a.lint-test.js', 'b.lint-test.js']);
      expect(result['a.lint-test.js'].trim()).to.equal([
        `describe('ESLint | a.js', function() {`,
        `  it('should pass ESLint', function() {`,
        `    // ESLint failed`,
        `    var error = new chai.AssertionError('a.js should pass ESLint\\n\\n1:1 - Unexpected console statement. (no-console)');`,
        `    error.stack = undefined;`,
        `    throw error;`,
        `  });`,
        `});`,
      ].join('\n'));
    }));

    it('custom: generates tests via custom test generator function', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error', 'no-unused-vars': 'warn' } };\n`,
        'a.js': `console.log('foo');\n`,
        'b.js': `var foo = 5;\n`,
      });

      let args = [];
      function testGenerator() {
        args.push(arguments);
      }

      output = createBuilder(eslint(input.path(), { console, testGenerator }));

      yield output.build();

      expect(args).to.have.lengthOf(3);
      expect(args[0][0]).to.equal('.eslintrc.js');
      expect(args[1][0]).to.equal('a.js');
      expect(args[2][0]).to.equal('b.js');

      let results = args[1][2];
      expect(results.filePath).to.match(/a\.js$/);
      delete results.filePath;

      expect(results).to.deep.equal({
        'errorCount': 1,
        'messages': [{
          'column': 1,
          'endColumn': 12,
          'endLine': 1,
          'line': 1,
          'message': 'Unexpected console statement.',
          'nodeType': 'MemberExpression',
          'ruleId': 'no-console',
          'severity': 2,
          'source': 'console.log(\'foo\');',
        }],
        'source': 'console.log(\'foo\');\n',
        'warningCount': 0,
      });
    }));
  });

  describe('throwOnError', function() {
    it('throw an error for the first encountered error', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error' } };\n`,
        'a.js': `console.log('foo');\n`,
      });

      output = createBuilder(eslint(input.path(), { console, throwOnError: true }));

      yield expect(output.build()).to.be.rejectedWith('rules violation with `error` severity level');
    }));

    it('does not throw errors for warning', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'warn' } };\n`,
        'a.js': `console.log('foo');\n`,
      });

      output = createBuilder(eslint(input.path(), { console, throwOnError: true }));

      yield expect(output.build()).to.be.fulfilled;
    }));

    it('does not throw errors for disabled rules', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'off' } };\n`,
        'a.js': `console.log('foo');\n`,
      });

      output = createBuilder(eslint(input.path(), { console, throwOnError: true }));

      yield expect(output.build()).to.be.fulfilled;
    }));
  });

  describe('throwOnWarn', function() {
    it('throw an error for the first encountered error', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error' } };\n`,
        'a.js': `console.log('foo');\n`,
      });

      output = createBuilder(eslint(input.path(), { console, throwOnWarn: true }));

      yield expect(output.build()).to.be.rejectedWith('rules violation with `error` severity level');
    }));

    it('throw an error for the first encountered warning', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'warn' } };\n`,
        'a.js': `console.log('foo');\n`,
      });

      output = createBuilder(eslint(input.path(), { console, throwOnWarn: true }));

      yield expect(output.build()).to.be.rejectedWith('rules violation with `warn` severity level');
    }));

    it('does not throw errors for disabled rules', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'off' } };\n`,
        'a.js': `console.log('foo');\n`,
      });

      output = createBuilder(eslint(input.path(), { console, throwOnWarn: true }));

      yield expect(output.build()).to.be.fulfilled;
    }));
  });

  describe('.eslintignore', function() {
    // this doesn't seem to work... :(
    it.skip('excludes files from being linted', co.wrap(function *() {
      input.write({
        '.eslintrc.js': `module.exports = { rules: { 'no-console': 'error', 'no-unused-vars': 'warn' } };\n`,
        '.eslintignore': `a.js\n`,
        'a.js': `console.log('foo');\n`,
        'b.js': `var foo = 5;\n`,
      });

      output = createBuilder(eslint(input.path(), { console, testGenerator: 'qunit' }));

      yield output.build();

      let result = output.read();
      expect(Object.keys(result)).to.deep.equal([
        '.eslintignore',
        '.eslintrc.lint-test.js',
        'b.lint-test.js',
      ]);
    }));
  });
});