/**
 * Providing an import of N3Parser without N3Store.
 *
 * n3 re-exports Parser, Writer, Store, N3Store, StreamParser, StreamWriter etc.
 * from a single lib/index.js that requires and loads all of them when loading the module n3.
 * This includes  `readable-stream` based StreamParser/StreamWriter.
 * Bundlers are forced to depend on everything.
 *
 * Md2Rdf only needs N3Parser, so it imports the Parser implementation directly from
 * 'n3/lib/N3Parser' (which only pulls in N3Lexer/N3DataFactory/IRIs) instead of from 'n3'.
 * This re-exports the type from the real '@types/n3' declarations for that subpath.
 */
declare module 'n3/lib/N3Parser' {
  import {Parser} from 'n3';
  export default Parser;
}
