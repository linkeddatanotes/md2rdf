// This is an example file showing a minimal use case.
// It also contains one mocha test to be included in regression tests.

// Md2Rdf and dependencies
import {Md2Rdf, commonNamespaces} from '../src/Md2Rdf';
import {DataFactory as N3DataFactory, Writer} from 'n3';

// The mocha test
import {describe} from 'mocha';
import {strict as assert} from 'assert';

// options for Md2Rdf
const options = {
  factory: N3DataFactory,
  // defines common namespaces such as schema
  namespaces: commonNamespaces(),
  // contains a date
  baseIRI: 'file://2020-01-24diary.md',
};

// a sample markdown including LinkedDataNotes
// - a heading with time, in combination with the baseIRI this defines the schema:temporalCoverage
// - a turtle code fence using tildes as the multiline typescript string is using backticks
const exampleMarkdown = `
Today is Friday. According to the song "Lazing on a Sunday Afternoon", amazing things happen on Fridays.

# 14:00 Freddy Mercury is painting at the Louvre
~~~turtle
this: 
  a schema:VisualArtsEvent;
  schema:performer <http://www.wikidata.org/entity/Q15869>;
  :feeling "excited".
~~~

After the fantastic waltz in the zoo on Thursday, the anticipation is enormous to see Freddy painting on a Friday.
`;

// create the instance of Md2Rdf
const md2rdf = new Md2Rdf(options);

// transform Markdown to RDF
const quads = md2rdf.parseString(exampleMarkdown).quads;

// print the RDF as turtle
let s = '# Md2Rdf for ' + options.baseIRI + '\n';
const writer = new Writer();
writer.addQuads(quads);
writer.end((error, result) => (s += result));
//console.log(s);

// mocha
describe('Md2Rdf.Example.test.js', () => {
  it('example', () => {
    assert.ok(s.indexOf('"excited"'));
  });
});
