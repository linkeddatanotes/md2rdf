// n3 = https://github.com/rdfjs/N3.js
//      https://rdf.js.org/N3.js/docs/N3Parser.html
import type {ParserOptions} from 'n3';
// Explicitly importing Parser not from 'n3', see src/n3-lib.d.ts.
import Parser from 'n3/lib/N3Parser';
import {DataFactory, Quad, NamedNode} from '@rdfjs/types';
import namespace from '@rdfjs/namespace';
import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * Md2RdfParserOptions to configure Md2Rdf.
 *
 * They are passed on to the N3 Parser.
 */
export interface Md2RdfParserOptions extends ParserOptions {
  /**
   * The file IRI of the currently parsed Markdown file.
   * inherited from ParserOptions, described here explicitly to clarify use.
   */
  baseIRI: string;

  /**
   * RDF DataFactory to create nodes.
   */
  factory: DataFactory;

  /**
   * namespaces set here will be prefixed to every `turtle` block before parsing.
   * Namespaces defined within a block will override.
   * Hint: md2rdf ships common namespaces. Load them with commonNamespaces() and pass them in.
   * Format: turtle string
   */
  namespaces?: string | undefined;

  /**
   * Set the onError handler to get information about errors and warnings and to stop the parser when you find necessary.
   * Leave the onError handler empty to let the parser skip all errors and warnings and return as many quads as possible.
   *
   * Implementations of the error handler
   * - may read the passed errors and warnings and notify the user, write them to a log, or to a quadstore
   * - may stop the parser by throwing the error back at the parser
   *
   * @param error a ParseError with a message and more details
   * @throws {ParseError} throws the passed error back to the caller to signal that the parsing should stop now. Swallows it to continue.
   */
  onError?: (error: ParseError) => void;
}

/**
 * ParseError is passed in the onError() handler of Md2RdfParserOptions.
 * Implementations of the Md2RdfParserOptions.onError() handler should read the ParseError parameter
 * for logging and deciding whether to continue.
 */
export class ParseError extends Error {
  /**
   * file IRI of the currently parsed Markdown file.
   */
  baseIRI: string;
  /**
   * severity level
   *
   * error - data cannot be parsed
   * warning - data is parsed but result may be unexpected
   */
  severity: 'error' | 'warning';
  /**
   * Line number within the currently parsed Markdown file.
   */
  line?: number;

  /**
   * create a ParseError.
   * Helper function
   * @param cause Underlying error or message.
   * @param options Options to pass the baseIRI of the currently parsed Markdown file.
   * @param line Line number within the currently parsed Markdown file.
   * @param severity Severity level 'error' or 'warning' inspired by methods of `console.`.
   *   If severity is not passed, assume 'error' unless the cause Error name ends with string 'Warning'.
   * @returns
   */
  constructor(
    cause: unknown,
    options: Md2RdfParserOptions,
    line?: number,
    severity?: 'error' | 'warning',
  ) {
    // if severity is not passed, assume error unless the cause Error name ends with string 'Warning'
    if (severity === undefined)
      severity =
        cause instanceof Error && cause.name.endsWith('Warning')
          ? 'warning'
          : 'error';
    super(
      // severity: transform the first character to uppercase to have a nicely readable
      // Warning or Error in the message string.
      'Md2Rdf: ' +
        severity[0].toUpperCase() +
        severity.slice(1) +
        ' parsing file ' +
        options.baseIRI +
        (line ? ' line ' + line : '') +
        ': ' +
        (cause instanceof Error ? cause.message : String(cause)),
      {cause: cause},
    );
    this.name = 'ParseError';
    this.severity = severity;
    this.baseIRI = options.baseIRI;
    this.line = line;
  }
}

/**
 * HomonymHeadingWarning is a possible cause in ParseError.
 * Example:
 * Heading "MyHeading" used for different sections containing a turtle block with "this:". IRI "file#MyHeading" is homonym for both sections.
 */
export class HomonymHeadingWarning extends Error {
  name = 'HomonymHeadingWarning';
}

/**
 * TimeNoDateInHeadingHierarchyWarning is a possible cause in ParseError.
 * Example:
 * Heading with time "13:45" could be nested within a date to define schema:temporalCoverage. No parent date found.
 */
export class TimeNoDateInHeadingHierarchyWarning extends Error {
  name = 'TimeNoDateInHeadingHierarchyWarning';
}

/**
 * Md2Rdf parses Markdown files and returns RDF quads.
 *
 * It follows the minimalistic LinkedDataNotes convention.
 *
 * It makes a "best effort" attempt to extract RDF from Markdown. It will report ParseError instances and go on if not stopped.
 * Example: Syntax errors in one turtle code fence break this one fence, but the data in the next turtle code fences may be fine.
 *
 * Documentation: see README of the project.
 *
 */
export class Md2Rdf {
  protected options: Md2RdfParserOptions;
  protected optionsNamespaceLineCount = 0;
  // temporary objects and helpers that only exist during a parse operation, shared between objects
  protected context?: ParseContext;

  /**
   * parserN3 is loaded lazily using _parserN3() when a Markdown file actually contains `turtle`.
   */
  protected parserN3?: Parser;

  constructor(options: Md2RdfParserOptions) {
    this.options = options;
    if (this.options.namespaces) {
      // ensure namespaces ends with a newline
      if (!this.options.namespaces.endsWith('\n'))
        this.options.namespaces = this.options.namespaces + '\n';
      this.optionsNamespaceLineCount =
        this.options.namespaces.split('\n').length - 1;
    }
  }

  /**
   * only instantiate the parser when we really need it, to save memory and performance when checking many files
   * @returns lazy-loaded parser
   */
  _parserN3(): Parser {
    return (this.parserN3 ??= new Parser({
      ...this.options,
      format: 'text/n3',
    }));
  }

  /**
   * Parse the line.
   * If it is an [atx heading](https://spec.commonmark.org/0.31.2/#atx-heading),
   * 1. remember it in this.headings
   * 2. generate quads that result from the heading, if it contains information according to LinkedDataNotes convention
   * @param line
   * @returns true, when this is a heading
   */
  _parseHeading(line: string): boolean {
    if (!this.context) throw new Error('ParseContext missing');
    // shortcuts
    const c = this.context;
    // parse the line, is it a heading?
    if (c.headings.parseLine(line, this.context.byLine.linenumber ?? 0)) {
      const dateTime = c.headings.dateTimeHierarchy?.toISODateTimeString(
        this.context,
      );
      // there is a 'this:' in the rdfBuffer and a dateTime in the current dateTimeHierarchy.
      // therefore, add the date to the rdf of this block
      if (dateTime) {
        // shortcuts
        const f = this.options.factory;
        const ns = c.ns;
        const thisSectionIRINode = c.headings.prepThisSectionIRI(c);
        if (!thisSectionIRINode) {
          throw new ParseError(
            'Programming Bug: _parseHeading found heading but prepThisSectionIRI() returns unknown. Line "' +
              line +
              "'",
            this.options,
            c.byLine.linenumber,
          );
        }
        // add temporalCoverage quad
        c.quads.push(
          f.quad(
            thisSectionIRINode,
            ns.schema.temporalCoverage,
            f.literal(dateTime),
          ),
        );
      }
      return true;
    } else {
      return false;
    }
  }

  /**
   * Parse turtle or N3 syntax from the passed code block from the markdown file
   * @param {String} n3 - the turtle passed as String
   * @param {number} startLine the line number where the block started
   * @return quads the quads parsed from the turtleString as array
   * @throws error , see N3 parse()
   */
  _parseN3String(n3: string, startLine: number) {
    try {
      // Only a shallow evaluation, no full parsing: does the n3 contain a "this:" ?
      // A proper implementation would implement a handler that is called when N3 Parser/Lexer
      // identifies a namespace prefix and only then activates the "this:" convention.
      const containsThisMarker = n3.includes('this:');
      const thisIRINode = containsThisMarker
        ? this.context?.headings.prepThisSectionIRI(this.context)
        : undefined;
      const s =
        // the default namespaces to prepend before any n3 so authors can implicitly rely on them when writing blocks
        (this.options.namespaces ? this.options.namespaces : '') +
        // "this:"" is a shortcut identifying the current section fragmet id in the current markdown file
        // note to self: '== null' checks both null AND undefined, whereas '=== null' only checks null
        (thisIRINode === undefined
          ? ''
          : 'PREFIX this: <' + thisIRINode.value + '>\n') +
        n3;
      let quads: Array<Quad> | undefined = undefined;
      try {
        quads = this._parserN3().parse(s);
      } catch (e) {
        // catch and handle N3 block parsing error
        if (e instanceof Error) {
          // replace the line numbering,
          e.message = e.message.replace(
            / on line (\d+)/,
            (_match, lineStr) =>
              ' on line ' +
              (Number(lineStr) -
                // reducing it by the artificially added optionsNamespaceLineCount
                (this.optionsNamespaceLineCount +
                  // and the "PREFIX this:"" line, if it has been added
                  (thisIRINode === undefined ? 0 : 1))),
          );
        }
        throw e;
      }
      // append parsed quads to result by mutating target.
      // Intentionally not using the call-stack intensive alternative "this.context?.quads.push(...quads);"
      Array.prototype.push.apply(this.context?.quads, quads);
    } catch (e) {
      if (this.options.onError) {
        // wrap it in a ParseError?
        const pe =
          e instanceof ParseError
            ? e
            : new ParseError(e, this.options, startLine + 1);
        // call handler
        this.options.onError(pe);
      }
    }
  }

  /**
   * Check if the current line starts with a turtleBlock.
   * If yes, parse the contents of a turtle code fence block and process it
   * @param line - the line to check if it is an opening ```turtle code fence block
   * @returns true, if this line started a turtle block
   */
  _parseTurtleBlock(line: string): boolean {
    // opening fence: up to 3 spaces indent, 3+ backticks or tildes (not mixed), info string turtle
    // note: the (turtle) could be extended to (turtle|ttl|n3|) if we evolve the LinkedDataNotes convention.
    const openMatch = line.match(/^ {0,3}(`{3,}|~{3,})\s*(turtle)\s*$/);
    if (!openMatch)
      // if no openMatch, return as quickly as possible
      return false;

    // ok, start parsing in detail
    if (!this.context) throw new Error('ParseContext missing');

    // closing fence: same character type, at least as many characters, up to 3 spaces indent, only trailing whitespace
    const fenceChar = openMatch[1][0] === '`' ? '`' : '~';
    const closingFence = new RegExp(
      '^ {0,3}' + fenceChar + '{' + openMatch[1].length + ',}\\s*$',
    );
    const startLine = this.context.byLine.linenumber;
    let rdfBuffer = '';
    let blockClosed = false;
    for (
      let next = this.context.byLine.next();
      !next.done;
      next = this.context.byLine.next()
    ) {
      if (closingFence.test(next.value)) {
        blockClosed = true;
        break;
      } else {
        rdfBuffer += ('' === rdfBuffer ? '' : '\n') + next.value;
      }
    }

    // was the block properly closed?
    if (!blockClosed && this.options.onError) {
      // handler may throw the passed exception back at us here
      this.options.onError(
        new ParseError(
          'Block starting at line ' + startLine + ' was never closed',
          this.options,
          startLine,
        ),
      );
    }

    // we have a block of turtle string in the rdfBuffer, parse it
    this._parseN3String(rdfBuffer, startLine);

    return true;
  }

  /**
   * Parses markdown and returns an array of quads.
   * See README.md
   *
   * Note: the method must only be called by a single thread. To parallelize parsing, use two Md2Rdf instances.
   *
   * @param input string of markdown
   * @returns
   *   quads: the array of rdf.js Quad parsed so far
   *   error: this is the error that stopped the run, it should have been thrown by options.onError.
   * @throws errors when there are unexpected programming bugs
   */
  parseString(input: string): {quads: Array<Quad>; error?: ParseError} {
    if (this.context)
      throw new Error(
        'parseString() was called while parsing already in progress. Create multiple instances of Md2Rdf for parallel processing.',
      );

    // initialize parsing by line
    const byLine = new StringByLine(input);

    // context for this parsing run, will be reset at the end of this function
    this.context = new ParseContext(this.options, byLine);

    // initialize variables for return values of this function at the end
    let error: ParseError | undefined = undefined;
    let quads: Array<Quad>;

    try {
      for (let next = byLine.next(); !next.done; next = byLine.next()) {
        const line = next.value;
        // evaluate in the order of specificality/priority
        // 1. is the line a markdown atx heading? https://spec.commonmark.org/0.31.2/#atx-heading
        // using a logic expression without storing its return value.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this._parseHeading(line) ||
          // 2. is the line starting a code fence? https://spec.commonmark.org/0.31.2/#code-fence
          this._parseTurtleBlock(line);
      }
    } catch (errorThrown) {
      if (errorThrown instanceof ParseError)
        // the options.onError handler threw a ParseError that had been passed to it. This signals the parser to stop and return the result.
        error = errorThrown;
      else
        // "this should not happen" (tm)
        throw errorThrown;
    } finally {
      // remember the result before deleting the temporary objects
      quads = this.context.quads ?? [];
      // reset temporary objects to undefined, to ensure the parallel processing warning will work
      this.context = undefined;
    }
    return {quads, error};
  }
}

//////////////////////////////
// Internal helper Classes
// not exported
//////////////////////////////

/**
 * Helper Object to
 * - hold variables during parsing
 * - share helpers between Md2Rdf and Headings2This
 */
class ParseContext {
  options: Md2RdfParserOptions;
  // Namespaces
  ns;
  quads: Array<Quad>;
  byLine: StringByLine;
  headings: Headings2This;

  constructor(options: Md2RdfParserOptions, byLine: StringByLine) {
    this.options = options;
    this.byLine = byLine;
    // initialize temporary objects shared by the parse functions
    this.quads = [];
    // helper for headings
    this.headings = new Headings2This(this.options);

    // namespace constants to write classes and properties.
    // note: must be tied to the same datafactory as Md2Rdf
    const o = {factory: this.options.factory};
    this.ns = {
      rdf: namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#', o),
      rdfs: namespace('http://www.w3.org/2000/01/rdf-schema#', o),
      schema: namespace('https://schema.org/', o),
      md2rdf: namespace('https://www.linkeddatanotes.org/ns/md2rdf/', o),
    };
  }
}

/**
 * A generator that takes the passed string,
 * splits it by \r\n and \n,
 * yield each line,
 * count current linenumber.
 *
 * Does not split everything in memory in the beginning to save memory.
 *
 * Use as iterator:
 * let by = new StringByLine('example');
 * for (const line of by) {
 *   console.log(line);
 * }
 *
 * Use with linenumber: see below in parseString()
 *
 * @param input string
 */
class StringByLine {
  input: string;
  linenumber: number = 0;
  start: number = 0;
  idx?: number;

  constructor(input: string) {
    this.input = input;
  }

  next(): IteratorResult<string> {
    if (this.idx === -1) return {value: undefined, done: true};
    this.idx = this.input.indexOf('\n', this.start);
    if (this.idx !== -1) {
      this.linenumber++;
      const s = this.input.substring(
        this.start,
        this.idx > 0 && this.input[this.idx - 1] === '\r'
          ? this.idx - 1
          : this.idx,
      );
      this.start = this.idx + 1;
      return {value: s, done: false};
    }
    return {value: this.input.substring(this.start), done: false};
  }

  [Symbol.iterator]() {
    return this;
  }
}

/**
 * Helper class to concatenate ISO Times from filename and headings.
 *
 * The first element in the DateTimeHierarchy is the current heading (or filename, if no section).
 * It points to a parent element in DateTimeHierarchy for further information.
 *
 * To read it, call toISODateTimeString.
 *
 * Once a date or date+time is found in the time hierarchy, it is returned.
 * If no date is found, undefined is returned.
 *
 * Updating the current DateTimeHierarchy while parsing Markdown is handled by update()
 *
 * Evaluation is lazy: the current hierarchy is stored after every heading,
 * but the regex time parsing is only done when an actual this: element is found in a turtle block
 * to save CPU.
 *
 * Assumptions:
 * - vast majority of Markdown will not contain turtle and `this:`, only seldomly date will be needed
 * - regex parsing costs CPU
 */
export class DateTimeHierarchy {
  /**
   * This should match a DATE followed by TIME followed by ZONE
   * DATE is optional
   * TIME is optional, if TIME is set, ZONE is also optional
   * yyyy-mm-dd ... optional
   * 13:55
   * 2021-02-10
   * 2021-02-10 13:55
   * 2021-02-10T13:55
   * 2021-02-10 13:55:44.1234
   * 2021-02-10T13:55Z+01:00
   */
  static readonly DATE_TIME_ZONE =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(?:Z?([+-]\d{2}:\d{2})|Z)?)?/;
  static readonly TIME_ONLY =
    /^(\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(?:Z?([+-]\d{2}:\d{2})|Z)?/;

  /**
   * Same as DATE_TIME_ZONE, but the date part allows reduced ISO 8601 precision
   * (yyyy or yyyy-mm, not just yyyy-mm-dd), and is anchored at both ends since it
   * is only ever run against a single endpoint token already isolated by DURATION.
   */
  static readonly DATE_TIME_ZONE_FLEX =
    /^(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?:[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(?:Z?([+-]\d{2}:\d{2})|Z)?)?$/;

  /**
   * Matches a schema:temporalCoverage-style duration: two date/time endpoints
   * separated by "/", "-" or "–" (an ISO 8601 time interval, e.g. "1939/1945" or
   * "2015-11/.."). The end endpoint may be ".." (open-ended), a date/time of its
   * own, or a bare time that shares the start endpoint's date.
   */
  static readonly DURATION =
    /^(\d{4}(?:-\d{2}(?:-\d{2})?)?(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z?[+-]\d{2}:\d{2}|Z)?)?)\s*(?:\/|-|–)\s*(\.\.|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z?[+-]\d{2}:\d{2}|Z)?)?|\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z?[+-]\d{2}:\d{2}|Z)?)/;

  parent?: DateTimeHierarchy;
  /**
   * 0 = filename from baseIRI
   * 1 = h1
   * ...
   * 6 = h6
   */
  level: number;
  /**
   * the content of the heading (after the #)
   * or
   * the filename
   */
  input: string;
  /**
   * was the input already parsed to date/time/zone?
   * for lazy evaluation
   */
  parsed: boolean = false;
  date?: string;
  time?: string;
  zone?: string;
  /**
   * The following three fields are only set when the input is a duration
   * (ISO 8601 time interval, e.g. "1939/1945" or "2015-11/..").
   * endDate/endTime/endZone hold the end endpoint; when the end endpoint is a
   * bare time (e.g. "09:00-17:00"), endDate stays undefined and the start's
   * own date is reused for it.
   */
  endDate?: string;
  endTime?: string;
  endZone?: string;
  /**
   * true when the duration's end endpoint was written as ".." (open-ended,
   * e.g. "2015-11/..").
   */
  openEnded?: boolean;

  constructor(level: number, input: string, parent?: DateTimeHierarchy) {
    this.level = level;
    this.input = input;
    this.parent = parent;
  }

  /**
   * In the hierarchy, find the next date.
   * @returns a date if found, as string.
   */
  _findDate(): string | undefined {
    this._parse();
    if (this.date) {
      return this.date;
    }
    return this.parent ? this.parent._findDate() : undefined;
  }

  /**
   * Ensure this heading has been parsed before accessing the fields.
   * Read the input, find a date and time, write it into the fields.
   */
  _parse() {
    if (this.parsed) return;

    // try duration first: e.g. "2021-02-10" alone must not be shadowed by "2021-02"/"10"
    const durationMatch = DateTimeHierarchy.DURATION.exec(this.input);
    if (durationMatch !== null) {
      const startMatch = DateTimeHierarchy.DATE_TIME_ZONE_FLEX.exec(
        durationMatch[1],
      );
      if (startMatch !== null) {
        this.date = startMatch[1];
        this.time = startMatch[2];
        this.zone = startMatch[3];
      }
      if (durationMatch[2] === '..') {
        this.openEnded = true;
      } else {
        const endMatch = DateTimeHierarchy.DATE_TIME_ZONE_FLEX.exec(
          durationMatch[2],
        );
        if (endMatch !== null) {
          this.endDate = endMatch[1];
          this.endTime = endMatch[2];
          this.endZone = endMatch[3];
        } else {
          // end endpoint has no date of its own (e.g. "17:00"), reuse the start's date
          const endTimeMatch = DateTimeHierarchy.TIME_ONLY.exec(
            durationMatch[2],
          );
          if (endTimeMatch !== null) {
            this.endTime = endTimeMatch[1];
            this.endZone = endTimeMatch[2];
          }
        }
      }
      this.parsed = true;
      return;
    }

    const match = DateTimeHierarchy.DATE_TIME_ZONE.exec(this.input);
    if (match !== null) {
      this.date = match[1];
      this.time = match[2];
      this.zone = match[3];
    } else {
      const timeMatch = DateTimeHierarchy.TIME_ONLY.exec(this.input);
      if (timeMatch !== null) {
        this.time = timeMatch[1];
        this.zone = timeMatch[2];
      }
    }
    this.parsed = true;
  }

  /**
   * true when this heading's input was parsed as a duration (ISO 8601 time
   * interval), i.e. it has an end endpoint or is open-ended.
   */
  get isDuration(): boolean {
    this._parse();
    return (
      this.openEnded === true ||
      this.endDate !== undefined ||
      this.endTime !== undefined
    );
  }

  /**
   * Read the current Heading Hierarchy and format it as a schema:temporalCoverage value:
   * either a plain ISO 8601 date/date-time, or - when the heading was written as a
   * duration - an ISO 8601 time interval such as "1939/1945" or "2015-11/..".
   * @returns the ISO 8601 date/date-time or interval defined by the heading hierarchy, or undefined if none found.
   * @throws DoubleTimeInHeadingHierarchyWarning, TimeNoDateInHeadingHierarchyWarning
   */
  toISODateTimeString(context: ParseContext): string | undefined {
    this._parse();
    if (this.isDuration) {
      // this.date is always set for a duration: DURATION's start endpoint always includes a year.
      const start =
        this.date + (this.time ? 'T' + this.time + (this.zone ?? '') : '');
      const end = this.openEnded
        ? '..'
        : this.endDate !== undefined
          ? this.endDate +
            (this.endTime ? 'T' + this.endTime + (this.endZone ?? '') : '')
          : this.date + 'T' + this.endTime + (this.endZone ?? '');
      return start + '/' + end;
    }
    if (this.date !== undefined) {
      // this is a date, return it
      return this.date + (this.time ? 'T' + this.time + (this.zone ?? '') : '');
    } else {
      if (this.time !== undefined) {
        // there is a time, look for a "date"  in the parents
        const parentDate = this.parent ? this.parent._findDate() : undefined;
        if (parentDate !== undefined) {
          return (
            parentDate + (this.time ? 'T' + this.time + (this.zone ?? '') : '')
          );
        } else {
          if (context.options.onError) {
            context.options.onError(
              new ParseError(
                new TimeNoDateInHeadingHierarchyWarning(
                  'Heading with time "' +
                    this.time +
                    '" could be nested within a date to define schema:temporalCoverage. No parent date found.',
                ),
                context.options,
                context.byLine.linenumber,
              ),
            );
          }
          return undefined; // TimeNoDateInHeadingHierarchyWarning
        }
      } else {
        // no time
        return undefined;
      }
    }
  }

  /**
   * update the DateTimeHierarchy based on the latest input
   * @param level current level
   * @param input content of the heading, after "#"
   * @param parent parent in the DateTimeHierarchy
   * @returns an update pointer to the current relevant heading or file in the DateTimeHierarchy
   */
  static update(
    level: number,
    input: string,
    parent?: DateTimeHierarchy,
  ): DateTimeHierarchy | undefined {
    if (parent === undefined) {
      if (level !== 0)
        throw new Error(
          'DateTimeHierarchy: when initializing with an empty parent, the level must be 0',
        );
      return new DateTimeHierarchy(level, input);
    } else {
      // there is a parent
      if (!(level >= 1))
        throw new Error(
          'DateTimeHierarchy: updating a hierarchy, and there is a parent, level for a new heading must be >= 1. Level: ' +
            level,
        );
      while (parent && parent.level >= level && parent.parent) {
        // the new input is working with the parent of this parent
        parent = parent.parent;
      }
      return new DateTimeHierarchy(level, input, parent);
    }
  }
}

/**
 * cache for loadCommonNamespaces
 */
let cachedCommonNamespaces: string | undefined;

/**
 * Lazily load and cache the commonNamespaces.ttl shipped with md2rdf.
 * @returns the common namespaces as turtle string
 */
export function commonNamespaces(): string {
  return (cachedCommonNamespaces ??= readFileSync(
    join(__dirname, 'commonNamespaces.ttl'),
    'utf-8',
  ));
}

/**
 * Handling of headings and `this:`
 */
class Headings2This {
  // Parameters in the order they build upon each other
  /**
   * reusable regex to match headings
   */
  matchHeading = /^(#{1,6}) (.*)/;
  /**
   * Buffer for the last heading content that was passed to parseLine,
   * to be used when needed by prepThisSectionIRI.
   * It is the "content" after the hash-marks and the space
   * https://spec.commonmark.org/0.31.2/#atx-headings
   */
  lastHeadingContent: string | undefined;
  /**
   * line number of the lastHeadingContent
   */
  lastHeadingLinenumber: number | undefined;
  /**
   * The URI for the current section after the lastHeadingContent.
   * Initiated undefined and reset to undefined after each heading, initialized lazily when needed.
   */
  thisSectionIRI: NamedNode<string> | undefined;
  /**
   * multiple headings having the same hash?
   * remember them to send a warning
   */
  usedThisIRIs = new Set();
  /**
   * Time and date data found in the hierarchy of
   * - filename (baseIRI) and
   * - headings 1 to 6
   */
  dateTimeHierarchy?: DateTimeHierarchy;

  /**
   * Passing options
   * @param options
   */
  constructor(protected options: Md2RdfParserOptions) {
    // the slash / in the group [] doesnt need to be escaped
    let filename = options.baseIRI.replace(/^.*[/:]/, '');
    filename = decodeURI(filename); // %20 -> ' ', etc.
    this.dateTimeHierarchy = DateTimeHierarchy.update(0, filename);
  }

  /**
   * Translate thea markdown heading to a fragment which can be used in an IRI.
   * See LinkeDataNotes-Markdown Syntax
   * @param {String} headingContent the content of the heading. This is the string after the ATX heading hash-marks and space (not including leading hash-signs). https://spec.commonmark.org/0.31.2/#atx-headings
   * @return {String} the fragment
   */
  _headingToFragment(headingContent: string): string {
    // replace all(=g) space by -
    let fragment = headingContent.replace(/ /g, '-');
    // encode non-URI chars
    fragment = encodeURIComponent(fragment);
    return fragment;
  }

  /**
   * create a section IRI based on file and fragment
   */
  _createSectionIri(inputfileIRI: string, fragment: string): string {
    return inputfileIRI + '#' + fragment;
  }

  /**
   * Parse the line for a heading starting with `#`, see [atx heading](https://spec.commonmark.org/0.31.2/#atx-heading).
   * It remembers the headings that were passed to it, should they be later needed by prepThisSectionIRI() or the dateTimeHierarchy.
   * @param line the Markdown line
   * @param linenumber the current line number, should it be needed for error logging later
   * @returns true, when the current line is an atx heading starting with '#'
   */
  parseLine(line: string, linenumber: number): boolean {
    // is it a heading?
    const match = this.matchHeading.exec(line);
    if (match) {
      // remember the heading
      // trim() because [atx heading](https://spec.commonmark.org/0.31.2/#atx-heading) says:
      // "Leading and trailing spaces or tabs are ignored in parsing inline content"
      this.lastHeadingContent = match[2].trim();
      // reset this.thisSectionIRI as mark for prepThisSectionIRI later that it creates the quads only once
      this.thisSectionIRI = undefined;
      this.lastHeadingLinenumber = linenumber;

      // remember hierarchy from Filename down to Headings
      const level = match[1].length; // the group in the regex matching the ###
      this.dateTimeHierarchy = DateTimeHierarchy.update(
        level,
        this.lastHeadingContent,
        this.dateTimeHierarchy,
      );
      return true;
    } else {
      return false;
    }
  }

  /**
   * Prepare the current section IRI, as the caller will use it in quads.
   *
   * This:
   * - mints the IRI, remembers it as node for reuse further down the section
   * - adds metadata about the section via quads.push()
   *
   * @returns the section IRI as RDF Node or undefined if no heading was in the file yet
   */
  prepThisSectionIRI(context: ParseContext): undefined | NamedNode<string> {
    // return the cached result, if it exists
    if (this.thisSectionIRI) {
      return this.thisSectionIRI;
    } else {
      // prep thisSectionIRI and keep it to reuse it

      // Syntax: this is only supported after the first heading
      if (this.lastHeadingContent === undefined) {
        // leave thisSectionIRI as undefined
        return undefined;
      }
      // identify thisSectionIRI based on last heading
      const fragment = this._headingToFragment(this.lastHeadingContent);
      const thisSectionIRIString = this._createSectionIri(
        this.options.baseIRI,
        fragment,
      );
      // check if thisSectionIRI already appeared in a previous section
      const firstUse = !this.usedThisIRIs.has(fragment);
      if (!firstUse) {
        // onError Handler set?
        if (this.options.onError)
          // call it!
          this.options.onError(
            new ParseError(
              new HomonymHeadingWarning(
                'Heading "' +
                  this.lastHeadingContent +
                  '" used for different sections containing a turtle block with "this:". IRI "' +
                  thisSectionIRIString +
                  '" is homonym for both sections.',
              ),
              this.options,
              this.lastHeadingLinenumber,
            ),
          );
      } else this.usedThisIRIs.add(fragment);
      // shortcuts
      const f = context.options.factory;
      const ns = context.ns;
      // create the Node
      this.thisSectionIRI = f.namedNode(thisSectionIRIString);
      if (firstUse) {
        // first use, add annotations
        context.quads.push(
          // type
          f.quad(this.thisSectionIRI, ns.rdf.type, ns.md2rdf.Section),
          // label
          f.quad(
            this.thisSectionIRI,
            ns.rdfs.label,
            f.literal(this.lastHeadingContent),
          ),
          // headingLevel
          f.quad(
            this.thisSectionIRI,
            ns.md2rdf.headingLevel,
            f.literal((this.dateTimeHierarchy?.level ?? 0).toString()),
          ),
        );
      }
      // return it
      return this.thisSectionIRI;
    }
  }
}
