import * as fs from 'fs';
import * as _ from 'lodash';

import { BookRef, getAllFromMatches } from './util';

const PAGE_REG_EX = /(\d+\-\d+|\d+)( \(.*\))?/g;

export function parseJohnsIndex() {
  const scriptureIndexText = fs.readFileSync(`${__dirname}/../src/scripture-index.txt`).toString();
  const lines = _.compact(scriptureIndexText.split('\n'));
  let currentBook: string | undefined;
  const books: Record<string, BookRef[]> = {};
  _.forEach(lines, (line) => {
    const { book, bookInfos } = parseBookInfosFromLine(line, currentBook);
    if (book !== currentBook) {
      currentBook = book;
      books[currentBook] = [];
    }
    if (!currentBook) {
      throw new Error('no current book after first parse, this is impossible');
    }
    books[currentBook] = [...books[currentBook], ...bookInfos];
  });

  return books;
}

function parseBookInfosFromLine(line: string, _book: string | undefined): { book: string, bookInfos: BookRef[] } {
  let [location, pagesText] = line.split('    ');
  if (/[A-Z]+/.test(location)) {
    _book = location;
  }
  if (_book == undefined) {
    throw new Error('somehow we got a ref line before a book, that aint right');
  }
  const book = _book;
  if (book === location) {
    location = ``;
  }
  const pages = getAllFromMatches(PAGE_REG_EX, pagesText, (match) => match[0]);
  // console.log(line, location, pages);
  return {
    book, bookInfos: pages.length === 0 ?
      [{ location, book, }]
      : pages.map((pageNumber) => ({
        location,
        book,
        pageNumber,
      }))
  };
}