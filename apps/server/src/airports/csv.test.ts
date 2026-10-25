import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvRecords } from './csv';

describe('parseCsv', () => {
  it('reads quoted and unquoted fields, empty ones included', () => {
    expect(parseCsv('a,"b",,d\n1,2,3,4')).toEqual([
      ['a', 'b', '', 'd'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('keeps commas, quotes and line breaks inside quotes', () => {
    expect(parseCsv('"Lisboa, Portela","say ""hi""","two\nlines"')).toEqual([
      ['Lisboa, Portela', 'say "hi"', 'two\nlines'],
    ]);
  });

  it('accepts Windows line ends and a missing final line end', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseCsvRecords', () => {
  it('keys each row by the header line', () => {
    expect(parseCsvRecords('iata_code,name\nVIE,Vienna\nOPO')).toEqual([
      { iata_code: 'VIE', name: 'Vienna' },
      { iata_code: 'OPO', name: '' },
    ]);
    expect(parseCsvRecords('')).toEqual([]);
  });
});
