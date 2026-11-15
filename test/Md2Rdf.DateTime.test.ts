/**
 * Tests for the DateTime Regex patterns used by DateTimeHierarchy
 */
import {DateTimeHierarchy} from '../src/Md2Rdf';
import {describe} from 'mocha';
import {strict as assert} from 'assert';

/**
 * Test cases
 */
describe('Md2Rdf.Datetime.test.js', () => {
  const dtpRoot = new DateTimeHierarchy(0, 'test:example.md');

  const assertDateTimeParse = function (
    input: string,
    expDate?: string,
    expTime?: string,
    expZone?: string,
  ) {
    const dtp = new DateTimeHierarchy(1, input, dtpRoot);
    dtp._parse();
    assert.equal(dtp.date, expDate, 'date');
    assert.equal(dtp.time, expTime, 'time');
    assert.equal(dtp.zone, expZone, 'zone');
  };

  it('blah 11:15 and 1999-12-31', () => {
    assertDateTimeParse(
      'blah 11:15 and 1999-12-31',
      undefined,
      undefined,
      undefined,
    );
  });

  it('13:55', () => {
    assertDateTimeParse('13:55', undefined, '13:55', undefined);
  });

  it('2021-02-10', () => {
    assertDateTimeParse('2021-02-10', '2021-02-10', undefined, undefined);
  });

  it('2021-02-10 13:55', () => {
    assertDateTimeParse('2021-02-10 13:55', '2021-02-10', '13:55', undefined);
  });

  it('2021-02-10 13:55:44.1234', () => {
    assertDateTimeParse(
      '2021-02-10 13:55:44.1234',
      '2021-02-10',
      '13:55:44.1234',
      undefined,
    );
  });

  it('2021-02-10T13:55Z+01:00', () => {
    assertDateTimeParse(
      '2021-02-10T13:55Z+01:00',
      '2021-02-10',
      '13:55',
      '+01:00',
    );
  });

  it('2021-02-10T13:55Z+01:00 followed by a heading', () => {
    assertDateTimeParse(
      '2021-02-10T13:55Z+01:00 followed by a heading',
      '2021-02-10',
      '13:55',
      '+01:00',
    );
  });

  /**
   * Test cases for durations: ISO 8601 time intervals as used by schema:temporalCoverage.
   * See https://schema.org/temporalCoverage
   */
  const assertDuration = function (input: string, expectedISO: string) {
    const dtp = new DateTimeHierarchy(1, input, dtpRoot);
    assert.equal(dtp.isDuration, true, 'isDuration');
    assert.equal(dtp.toISODateTimeString({options: {}} as never), expectedISO);
  };

  it('1974 - 1975 (spaced dash, year only)', () => {
    assertDuration('1974 - 1975', '1974/1975');
  });

  it('1974-1975 (tight dash, year only)', () => {
    assertDuration('1974-1975', '1974/1975');
  });

  it('1974/1975 (slash separator)', () => {
    assertDuration('1974/1975', '1974/1975');
  });

  it('2015-11/2015-12 (year-month precision)', () => {
    assertDuration('2015-11/2015-12', '2015-11/2015-12');
  });

  it('2015-11 - .. (open-ended, year-month)', () => {
    assertDuration('2015-11 - ..', '2015-11/..');
  });

  it('2015-11/.. (open-ended, tight slash)', () => {
    assertDuration('2015-11/..', '2015-11/..');
  });

  it('2015/.. (open-ended, year only)', () => {
    assertDuration('2015/..', '2015/..');
  });

  it('2021-02-10/2021-03-15 (full dates)', () => {
    assertDuration('2021-02-10/2021-03-15', '2021-02-10/2021-03-15');
  });

  it('2021-02-10 - 2021-03-15 (full dates, spaced dash)', () => {
    assertDuration('2021-02-10 - 2021-03-15', '2021-02-10/2021-03-15');
  });

  it('2021-02-10T09:00-17:00 (bare end time reuses start date)', () => {
    assertDuration(
      '2021-02-10T09:00-17:00',
      '2021-02-10T09:00/2021-02-10T17:00',
    );
  });

  it('2021-02-10 09:00 - 17:00 (space-minus-space delimiter, bare end time reuses start date)', () => {
    assertDuration(
      '2021-02-10 09:00 - 17:00',
      '2021-02-10T09:00/2021-02-10T17:00',
    );
  });

  it('2021-02-10T09:00 - 17:00 (spaced dash, bare end time)', () => {
    assertDuration(
      '2021-02-10T09:00 - 17:00',
      '2021-02-10T09:00/2021-02-10T17:00',
    );
  });

  it('2021-02-10 09:00/17:00 (space before time, bare end time)', () => {
    assertDuration(
      '2021-02-10 09:00/17:00',
      '2021-02-10T09:00/2021-02-10T17:00',
    );
  });

  it('2021-02-10T09:00Z+01:00/17:00Z+02:00 (zones on both endpoints)', () => {
    assertDuration(
      '2021-02-10T09:00Z+01:00/17:00Z+02:00',
      '2021-02-10T09:00+01:00/2021-02-10T17:00+02:00',
    );
  });

  it('1974 – 1975 (en dash separator)', () => {
    assertDuration('1974 – 1975', '1974/1975');
  });

  it('1974 - 1975 A Night at the Opera (trailing text ignored)', () => {
    assertDuration('1974 - 1975 A Night at the Opera', '1974/1975');
  });

  it('2015-11 - .. Ongoing Research (trailing text ignored)', () => {
    assertDuration('2015-11 - .. Ongoing Research', '2015-11/..');
  });

  it('does not treat a plain date as a duration', () => {
    const dtp = new DateTimeHierarchy(1, '2021-02-10', dtpRoot);
    assert.equal(dtp.isDuration, false);
  });

  it('does not treat a plain date-time as a duration', () => {
    const dtp = new DateTimeHierarchy(1, '2021-02-10 13:55:44.1234', dtpRoot);
    assert.equal(dtp.isDuration, false);
  });

  it('does not treat a bare year as a duration', () => {
    const dtp = new DateTimeHierarchy(1, '1974', dtpRoot);
    assert.equal(dtp.isDuration, false);
  });
});
