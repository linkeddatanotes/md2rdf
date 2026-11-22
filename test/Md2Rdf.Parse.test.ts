/**
 * Tests for Md2Rdf parsing specific test files.
 */
import {Md2Rdf, ParseError, commonNamespaces} from '../src/Md2Rdf';
import {readFileSync} from 'fs';
import {join} from 'path';
import {describe} from 'mocha';
import {strict as assert} from 'assert';
import {Parser, Writer, DataFactory as N3DataFactory} from 'n3';
import {Quad} from '@rdfjs/types';

/**
 * Default Options
 * reused across tests
 */
const defaultOptions = {
  factory: N3DataFactory,
  namespaces: commonNamespaces(),
  baseIRI: '',
  onError: (error: ParseError): boolean => {
    // an error? throw it, the test will catch
    throw error;
  },
};

/**
 * assert for the passed testname,
 * that the files/<testname>.md
 * parses into the turtle in files/<testname>.turtle
 * @param testname name of the test file
 * @param optionsOverride optional Md2Rdf options that override the defaults
 * @returns the loaded contents of the test file
 */
function assertTurtleEqual(
  testname: string,
  optionsOverride?: Partial<typeof defaultOptions>,
) {
  const mdString = readFileSync(
    join(__dirname, '..', '..', 'test', 'files', testname + '.md'),
    'utf-8',
  );
  const md2rdf = new Md2Rdf({
    ...defaultOptions,
    baseIRI: 'test:' + testname,
    ...optionsOverride,
  });
  const quads = md2rdf.parseString(mdString).quads;
  assert.equal(
    toSortedString(quads),
    toSortedString(loadExpected(testname)),
    'assertTurtleEqual: ' + testname,
  );
  return {mdString: mdString};
}

/**
 * assert for the passed testname,
 * that parsing the files/<testname>.md
 * throws an error with an expected message.
 * If an optional <testname>.turtle file exists, it continues parsing and compares the result.
 * @param testname name of the test file and also the Error type to expect
 * @param message text content of the full error message to expect
 */
function assertParseThrows(testname: string, message: string, line?: number) {
  const mdString = readFileSync(
    join(__dirname, '..', '..', 'test', 'files', testname + '.md'),
    'utf-8',
  );
  const expectedQuads = loadExpectedOptional(testname);
  // see if there is a ".besteffort" file that indicates another run without onError handling and best effort results
  const expectedQuadsBestEffort = loadExpectedOptional(
    testname + '.besteffort',
  );

  const options = {...defaultOptions, baseIRI: 'test:' + testname};

  // expected Error Message with the the Md2Rdf prefix and Error/Warning indication
  message =
    'Md2Rdf: ' +
    (testname.endsWith('Warning') ? 'Warning' : 'Error') +
    ' parsing file ' +
    options.baseIRI +
    (line ? ' line ' + line : '') +
    ': ' +
    message;

  // test should assert expected Quads and thrown error message
  let e = undefined;
  options.onError = function (error: ParseError): boolean {
    e = error; // remember it for assertion
    throw error; // throw it back
  };
  // check for the found error and for the parsed mdString
  const md2rdf = new Md2Rdf(options);
  const {quads, error} = md2rdf.parseString(mdString);
  if (expectedQuads !== undefined)
    assert.equal(
      toSortedString(quads),
      toSortedString(expectedQuads),
      'assertTurtleEqual: ' + testname,
    );
  assert.equal(error?.message, message);
  // also check if the error was the one last seen by the onError handler
  assert.equal(error, e, 'Same error in handler and returned');

  if (expectedQuadsBestEffort !== undefined) {
    const md2rdfBestEffort = new Md2Rdf({
      ...defaultOptions,
      baseIRI: 'test:' + testname,
      onError: undefined,
    });
    const quadsBestEffort = md2rdfBestEffort.parseString(mdString).quads;
    assert.equal(
      toSortedString(quadsBestEffort),
      toSortedString(expectedQuadsBestEffort),
      'assertTurtleEqual: ' + testname + ' best effort',
    );
  }
}

/**
 * Serialize quads to sorted N-Quads lines for order-independent RDF comparison.
 * As alternative considered was N3Parser-test.js using toSortedJSON(), which is harder to read.
 */
function toSortedString(quads: Quad[]): string {
  let result = '';
  const writer = new Writer({format: 'N-Quads'});
  writer.addQuads(quads);
  writer.end((_err, data) => {
    if (data) {
      result = data;
    }
  });
  return result
    .trim()
    .split('\n')
    .filter(l => l.length > 0)
    .sort()
    .join('\n');
}

/**
 * Load and parse a .turtle expected-result file using absolute IRIs
 * @param testname name of the test. File extension will be added
 * @returns the loaded and parsed turtle
 * @throws an error when the file is not found or not parseable
 */
function loadExpected(testname: string): Quad[] {
  const turtle = readFileSync(
    join(__dirname, '..', '..', 'test', 'files', testname + '.turtle'),
    'utf-8',
  );
  try {
    return new Parser().parse(turtle);
  } catch (e) {
    throw new Error(
      'Error loading ' +
        testname +
        '.turtle: ' +
        (e instanceof Error ? e.message : String(e)),
      {cause: e},
    );
  }
}

/**
 * Load and parse an **optional** .turtle expected-result file using absolute IRIs
 * @param testname name of the test. File extension will be added
 * @returns the loaded and parsed turtle or undefined, if file not found
 * @throws an error when the file is not parseable
 */
function loadExpectedOptional(testname: string): Quad[] | undefined {
  try {
    return loadExpected(testname);
  } catch (e) {
    // ENOENT means that <testname>.turtle file does not exist
    if ((e as {code?: unknown}).code === 'ENOENT') return undefined;
    else throw e;
  }
}

/**
 * Test cases
 */
describe('Md2Rdf.Parse.test.js', () => {
  /**
   * test cases in the same alphabetical order as the files
   */

  it('2020-01-24diary', () => {
    assertTurtleEqual('2020-01-24diary');
  });

  it('codefences', () => {
    assertTurtleEqual('codefences');
  });

  it('headingDateTime', () => {
    assertTurtleEqual('headingDateTime');
  });

  it('headingDuration', () => {
    assertTurtleEqual('headingDuration');
  });

  it('headingDurationOpenEnded', () => {
    assertTurtleEqual('headingDurationOpenEnded');
  });

  it('headingThis', () => {
    assertTurtleEqual('headingThis');
  });

  it('headingTimeWithinDateTime', () => {
    assertTurtleEqual('headingTimeWithinDateTime');
  });

  it('headingToFragment', () => {
    assertTurtleEqual('headingToFragment');
  });

  it('HomonymHeadingWarning', () => {
    assertParseThrows(
      'HomonymHeadingWarning',
      'Heading "Tools" used for different sections containing a turtle block with "this:". IRI "test:HomonymHeadingWarning#Tools" is homonym for both sections.',
      14,
    );
  });

  it('min', () => {
    const r = assertTurtleEqual('min');
    assert.equal(r.mdString.startsWith('# A minimal test'), true);
  });

  it('namespaceOverride', () => {
    assertTurtleEqual('namespaceOverride');
  });

  it('relativeLinks', () => {
    assertTurtleEqual('relativeLinks', {
      baseIRI: 'file://test/sub/dir/relativeLinks.md',
    });
  });

  it('TimeNoDateInHeadingHierarchyWarning', () => {
    assertParseThrows(
      'TimeNoDateInHeadingHierarchyWarning',
      'Heading with time "14:30" could be nested within a date to define schema:temporalCoverage. No parent date found.',
      6,
    );
  });

  it('Time.HomonymHeadingWarning', () => {
    assertParseThrows(
      'Time.HomonymHeadingWarning',
      'Heading "13:00 Lunch" used for different sections containing a turtle block with "this:". IRI "test:Time.HomonymHeadingWarning#13%3A00-Lunch" is homonym for both sections.',
      11,
    );
  });

  it('thisbeforeheading', () => {
    assertParseThrows(
      'thisbeforeheading',
      'Undefined prefix "this:" on line 1.',
      2,
    );
  });
});
