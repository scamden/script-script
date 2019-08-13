import * as fs from 'fs';
import * as _ from 'lodash';

//<p class="s19" style="padding-top: 4pt;padding-left: 40pt;text-indent: 0pt;text-align: left;">102 Introduction</p>
const SECTIONS_REG_EX = /<p class="s19" style=".*?">.*?([0-9]+).*?<\/p>/g
const PAGE_REG_EX = /(\d+\-\d+|\d+)( \(.*\))?/g
const targets = readTargets();
const locSeparator = `[\\,\\;]`
const specSeparator = `[:\\.]`
const hyphen = `[-–—−]`
const hyphensOrComma = `${locSeparator}?|${hyphen}`;
const locationRegExStr = `(\\d+${specSeparator}\\d+|\\d+|${hyphensOrComma})+` // please note that the hyphens are actually different characters

// Gen 1, 4, 7 // Gen 1:4, 5:3 // Gen 1:4, 5 //Gen 1, 5:3
const refRegExp = new RegExp(`(${targets.map(t => escapeRegex(t)).join('|')})( (${locationRegExStr})( \\[${locationRegExStr}\\])?)`, 'g');
console.log(refRegExp);
type PTagInfo = { pTag: string, pageNumber: string };
type BookRef = { book: string, pageNumber: string, location: string };
type ChapterVerse = { chapter: string, verse?: string, note?: string };
type ContiguousRef = {
  book: string,
  pageNumber: string,
  start?: ChapterVerse,
  end?: ChapterVerse
};

export function readRefsAndCombineWithPrevious(fileName: string = './src/input.html') {
  const readRefs =
    // [] ||
    readAndOutputScriptRefs(fileName);
  const previousRefs = parseJohnsIndex();
  const allRefs = _.groupBy(_.flatten([..._.values(readRefs), ..._.values(previousRefs)]), 'book');
  const sortedAllRefs = _.reduce(allRefs, (accum, refs, book) => {
    return {
      ...accum,
      [book]: _.flatten(refs.map((ref): ContiguousRef[] => {
        const { location, ...rest } = ref;
        // const locations = location ? location.split(new RegExp(locSeparator)) : undefined;
        const definitelyIndependentLocations = location.split(';');
        const nonRelativeLocations = _.flatten(definitelyIndependentLocations.map((location) => {
          const maybeDependentLocations = location.split(',');
          let previousChVs: ChapterVerse | undefined;
          return maybeDependentLocations.map((loc): { start?: ChapterVerse, end?: ChapterVerse } => {
            const [startLoc, endLoc] = loc.split(new RegExp(hyphen));
            if (!startLoc) {
              return {
                start: undefined,
                end: undefined
              }
            }
            const specs = parseSpecs(startLoc);
            const endSpecs = endLoc ?
              parseSpecs(endLoc) :
              undefined
            const { relative, chVs: start } = getAbsoluteOrRelativeFromPrevious(previousChVs, specs);
            const end = endSpecs ?
              getAbsoluteOrRelativeFromPrevious(!relative ? start : previousChVs, endSpecs).chVs :
              undefined
            previousChVs = start;
            return {
              start,
              end,
            }
          })
        }));
        return nonRelativeLocations.map((loc) => {
          return {
            ...rest,
            ...loc,
          }
        })
      })).sort((ref1, ref2) => {
        const startComp = compareSpecs(
          toSpecs(ref1.start),
          toSpecs(ref2.start),
        )
        if (startComp !== 0) {
          return startComp;
        }
        return compareSpecs(
          toSpecs(ref1.end),
          toSpecs(ref2.end),
        )
      })
    }
  }, {})
}

function parseSpecs(loc: string): string[] {
  return loc.split(new RegExp(specSeparator)).map(s => s.trim());
}

function toSpecs(chVs?: ChapterVerse) {
  if (!chVs) {
    return [];
  }
  const { chapter, verse, note } = chVs;
  return [chapter, verse, note];
}

function compareSpecs(s1: Array<string | undefined>, s2: Array<string | undefined>): number {
  const first = s1[0];
  const second = s2[0];
  if (!first && !second) {
    return 0;
  }
  if (!first) {
    return -1;
  }
  if (!second) {
    return 1;
  }

  try {
    const firstInt = parseInt(first, 10);
    const secondInt = parseInt(second, 10);
    if (firstInt !== secondInt) {
      return firstInt - secondInt;
    }
  } catch (e) {
    // ok so they're not numbers :)
    if (first !== second) {
      return first.localeCompare(second); // alpha sort
    }
  }
  return compareSpecs(s1.slice(1), s2.slice(1));
}

function getAbsoluteOrRelativeFromPrevious(previousChVs: ChapterVerse | undefined, specs: string[]): { relative: boolean, chVs: ChapterVerse } {
  const [s1, s2, s3] = specs;
  if (
    !previousChVs ||
    (!previousChVs.verse && !previousChVs.note) || // it's only a chapter, aint no relative
    specs.length === 2 && !/[a-z]/.test(s2) ||
    specs.length == 3
  ) {
    const chVs = {
      chapter: s1,
      verse: s2,
      note: s3,
    };
    return {
      relative: false,
      chVs,
    }
  }
  return {
    relative: true,
    chVs: evaluateLocationRelativeTo(previousChVs, specs)
  }
}

function evaluateLocationRelativeTo(previousChVs: ChapterVerse, specs: string[]): ChapterVerse {
  const [s1, s2, s3] = specs;
  if (specs.length == 2) {
    return {
      ...previousChVs,
      verse: s1,
      note: s2,
    }

  } else if (specs.length == 1) {
    if (/[a-z]/.test(s1)) {
      return {
        ...previousChVs,
        note: s1,
      }

    }
    return {
      chapter: previousChVs.chapter,
      verse: s1
    }
  } else {
    throw new Error('HOOWWWW??? specs length 1 should be non relative');
  }
}

export function readAndOutputScriptRefs(fileName: string = './src/input.html') {
  const fileText = fs.readFileSync(fileName).toString();


  const pTagInfos = readPTagInfos(fileText);
  const bookRefs = _.flatten(pTagInfos.map(({ pTag, pageNumber }, idx) => {
    const nextPTagInfo: PTagInfo | undefined = pTagInfos[idx + 1];
    const pageTextRegExp = new RegExp(`${escapeRegex(pTag)}((.|\\n)*)(${nextPTagInfo && escapeRegex(nextPTagInfo.pTag) || ''})`);
    const pageTextMatch = fileText.match(pageTextRegExp);
    const pageText = pageTextMatch && pageTextMatch[1];
    console.log('\n', pageNumber, '\n');
    return findRefsInString(pageText, pageNumber);
  }))
  const newBooks = _.groupBy(bookRefs, 'book');
  return newBooks;
}

function readPTagInfos(fileText: string): PTagInfo[] {
  return getAllFromMatches(SECTIONS_REG_EX, fileText, (match) => {
    const pTag = match[0];
    const pageNumber = match[1];
    return {
      pTag,
      pageNumber,
    };
  });
}

function getAllFromMatches<T>(regex: RegExp, text: string, matchCb: (matches: RegExpExecArray) => T) {
  let match = regex.exec(text);
  let results: T[] = [];
  while (match) {
    results.push(matchCb(match))
    match = regex.exec(text)
  }
  return results;
}

function findRefsInString(text: string | null, pageNumber: string): BookRef[] {
  return !text ? [] : getAllFromMatches(refRegExp, text, (match) => {
    const book = match[1].trim();
    const location = match[2].replace(new RegExp(`(${hyphensOrComma})$`), '').trim();
    console.log(book, location);
    return {
      book,
      location,
      pageNumber,
    }
  });
}

function readTargets() {
  const fileText = fs.readFileSync(`${__dirname}/../src/targets.md`).toString();
  return _.compact(fileText.split('\n'))
}

function escapeRegex(text: string) {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
};

export function parseJohnsIndex() {
  const scriptureIndexText = fs.readFileSync(`${__dirname}/../src/scripture-index.txt`).toString();
  const lines = _.compact(scriptureIndexText.split('\n'));
  let currentBook: string | undefined;
  let books: Record<string, BookRef[]> = {};
  _.forEach(lines, (line) => {
    const { book, bookInfos } = parseBookInfosFromLine(line, currentBook);
    if (book !== currentBook) {
      currentBook = book;
      books[currentBook] = [];
    } if (!currentBook) {
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
    throw new Error('somehow we got a ref line before a book, that aint right')
  }
  const book = _book;
  if (book === location) {
    location = ``
  }
  const pages = getAllFromMatches(PAGE_REG_EX, pagesText, (match) => match[0]);
  // console.log(line, location, pages);
  return {
    book, bookInfos: pages.map(pageNumber => ({
      location,
      book,
      pageNumber,
    }))
  };
}