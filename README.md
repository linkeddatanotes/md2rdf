# md2rdf

Reads a Markdown string, detects linked data, and returns the linked data as array of `Quad` compatible with [RDF.js](http://rdf.js.org/).

`md2rdf` follows the conventions defined in [LinkedDataNotes](https://www.linkeddatanotes.org):
- RDF in `turtle` code fences is parsed 
  - using [N3.js](https://github.com/rdfjs/n3.js)
- section headings are interpreted
  - date and time prefixes result in `schema:temporalCoverage`
  - `this:` in a `turtle` fence is interpreted as an URI reference to the current section
- common namespaces are part of this package and available at `commonNamespaces()`, it is recommended to pass them as `options.namespaces`.

The returned `rdfjs Stream<Quad>` can be passed to `quadstore.import()`.

## Installation

`npm install @linkeddatanotes/md2rdf'

## Parsing markdown files

Load the markdown, pass it to Md2Rdf.

```typescript
// Md2Rdf and dependencies
import {Md2Rdf, commonNamespaces} from '@linkeddatanotes/md2rdf';
import {DataFactory as N3DataFactory, Writer} from 'n3';

// options for Md2Rdf
const options = {
  factory: N3DataFactory,
  // defines common namespaces such as schema
  namespaces: commonNamespaces(),
  // contains a date
  baseIRI: 'file://2025-12-12_ParisAgreement.md',
};

// a sample markdown including LinkedDataNotes
// - a heading with time, in combination with the baseIRI this defines the schema:temporalCoverage
// - a turtle code fence using tildes as the multiline typescript string is using backticks
const exampleMarkdown = `
# 2015-12-12 Saturday at COP 21
The COP21 conference at Le Bourget was extended by one day, Saturday the 12th.
On this day, the Paris Agreement was adopted.

~~~turtle
this: a schema:PublicEvent;
  schema:organizer <http://www.wikidata.org/entity/Q104150918>.
~~~
`;

// create the instance of Md2Rdf
const md2rdf = new Md2Rdf(options);

// transform Markdown to RDF
const quads = md2rdf.parseString(exampleMarkdown);

// print the RDF as turtle
let s = '# Md2Rdf for ' + options.baseIRI + '\n';
const writer = new Writer();
writer.addQuads(quads);
writer.end((error, result) => s += result);
console.log(s);
```

Read the tests for more examples.

This library is used by [LinkedDataNotes](https://www.linkeddatanotes.org) and `obsidian-linkeddatanotes`. 
See more example code there.

## License

- [ ] TODO: decide license for this

This uses 
- [solid-namespace](https://github.com/solid/solid-namespace/blob/master/index.js) which is MIT licensed.

## Design decisions

### String input
Currently, input is passed as `string`. This is enough for the first use in Obsidian [Vaul.cachedRead()](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead). 

Reading from a `Stream` would be a welcome addition. Note that N3 Parser is not returning a generator but calling a passed callback function, so a streaming API may require an intermediate queue or a "/zero-queue backpressure bridge/".

### Markdown sections
Markdown sections that resulted in RDF are marked using the [`md2rdf` vocabulary](https://www.linkeddatanotes.org/ns/md2rdf/) and `rdfs`. 

Above `exampleMarkdown` results in:

```turtle
PREFIX md2rdf: <https://www.linkeddatanotes.org/ns/md2rdf/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <https://schema.org/>

<file://2025-12-12_ParisAgreement.md#2015-12-12-Saturday-at-COP-21> a schema:PublicEvent, md2rdf:Section;
  rdfs:label "2015-12-12 Saturday at COP 21";
  md2rdf:headingLevel "1";
  schema:temporalCoverage "2015-12-12";
  schema:organizer <http://www.wikidata.org/entity/Q104150918>.
```

### Namespaces
Namespaces are passed as string via `Md2RdfParserOptions.namespaces`. This is simple and works.

It comes with the caveat that parsing the namespaces for each turtle code fence wastes CPU. 
It would be better to parse them once. 
N3.Parser does not support passing of pre-parsed Namespaces. This could be improved by extending N3.Parser or by using N3 internals: quadCallback, inputstream, injecting parser._prefixes[prefix]=value.


## Development
This project follows [gts](https://github.com/google/gts) to avoid bikeshedding. 

### Testing
This project uses [mocha](https://github.com/mochajs). [assert](https://github.com/browserify/commonjs-assert) is used as the [assert syntax](https://nodejs.org/api/assert.html) uses simple js constructs.

```
npm run test
```

### Publishing a release

After we did fantastic stuff and all our tests are ok, time to publish.

Packaging and publishing a release currently works like this:

```
# at this point: git must be clean, on main
git status

# confirm the release looks good
npm pack --dry-run

# builds, tests, bumps, tags, pushes
npm version patch

# publish
npm login
npm publish

# after release: main becomes prepatch. This bumps, tags, pushes.
npm version prepatch
```

## Part of LinkedDataNotes
This project is part of [LinkedDataNotes](https://www.linkeddatanotes.org). LinkedDataNotes is a minimalistic convention to use linked data within markdown notes. 

## Contribute
**md2rdf** is open for contributions. File an issue, create a pull request.

Get in touch via getintouch@linkeddatanotes.org.

Md2Rdf was started by Leo "Leobard" Sauermann on 2021-02-10.