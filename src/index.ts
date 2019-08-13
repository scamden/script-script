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
type BookRef = { book: string, pageNumber?: string, location: string };
type ChapterVerse = { chapter: string, verse?: string, note?: string };

type ChapterRange = { start?: ChapterVerse, end?: ChapterVerse, alternate?: string };

type ContiguousRef = {
  book: string,
  pageNumbers: string[],
} & ChapterRange;

type MergedContigousRef = {
  book: string,
  pageNumbers: string[],
  ranges: ChapterRange[]
}

export function readRefsAndCombineWithPrevious(fileName: string = './src/input.html') {
  const readRefs =
    [] ||
    readAndOutputScriptRefs(fileName);
  const previousRefs = parseJohnsIndex();
  const allRefs = _.groupBy(_.flatten([..._.values(readRefs), ..._.values(previousRefs)]), 'book');
  const sortedAllRefs = _.reduce(allRefs, (accum, refs, book) => {
    return {
      ...accum,
      [book]: _.flatten(refs.map((ref): ContiguousRef[] => {
        const { location, pageNumber, ...rest } = ref;
        // const locations = location ? location.split(new RegExp(locSeparator)) : undefined;
        const [nonBracket, bracket] = location.split('[');
        const alternates: Array<string | undefined> = bracket ? bracket.slice(0, bracket.length - 1).split(',') : []
        const definitelyIndependentLocations = nonBracket.split(';');
        const nonRelativeLocations = _.flatten(definitelyIndependentLocations.map((location) => {
          const maybeDependentLocations = location.split(',');
          let previousChVs: ChapterVerse | undefined;
          return maybeDependentLocations.map((loc, idx): ChapterRange => {
            const [startLoc, endLoc] = loc.split(new RegExp(hyphen));
            if (!startLoc) {
              return {
                start: undefined,
                end: undefined
              }
            }
            const alternate = alternates[idx];
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
              alternate,
            }
          })
        }));
        return nonRelativeLocations.map((loc) => {
          return {
            ...rest,
            pageNumbers: _.compact([pageNumber]),
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
      }).reduce((accum, ref) => {
        const previous = accum[accum.length - 1] as ContiguousRef | undefined;
        // TODO: maybe check alternate equality and throw error if unequl when range equal
        if (previous && _.isEqual(previous.start, ref.start) && _.isEqual(previous.end, ref.end)) {
          return [
            ...accum.slice(0, accum.length - 1),
            {
              ...previous,
              ...ref,
              pageNumbers: [
                ...previous.pageNumbers,
                ...ref.pageNumbers,
              ]
            }
          ]
        }
        return [
          ...accum,
          ref
        ]
      }, [] as ContiguousRef[]).map((ref) => {
        return {
          ...ref,
          pageNumbers: _.sortBy(ref.pageNumbers, (pageNumberStr) => {
            const match = pageNumberStr.match(/^\d+/);
            if (!match) {
              throw new Error(`shouldn't have an undefined page`);
            }
            return match[0];
          })
        }
      }).reduce((accum, ref) => {
        const previous = accum[accum.length - 1] as MergedContigousRef | undefined;
        const { start, end, alternate, ...rest } = ref;
        const refRange = {
          start,
          end,
          alternate,
        }
        if (previous && _.isEqual(previous.pageNumbers, ref.pageNumbers)) {
          return [
            ...accum.slice(0, accum.length - 1),
            {
              ...previous,
              ranges: [
                ...previous.ranges,
                refRange
              ]
            }
          ]
        }
        return [
          ...accum,
          {
            ...rest,
            ranges: refRange.start && [refRange] || []
          }
        ]
      }, [] as MergedContigousRef[])

    }
  }, {} as Record<string, MergedContigousRef[]>);
  const contiguousRefsInOrderByBook = _.reduce(sortedAllRefs, (accum, refs) => [...accum, ...refs], [])
  const newIndex = contiguousRefsInOrderByBook.map(({ ranges, book, pageNumbers }, idx) =>
    `${ranges.length > 0 ?
      printRanges(ranges) :
      '\n' + book}    ${pageNumbers.join(', ') || ''}`
  ).join('\n');
  fs.writeFileSync(`${__dirname}/../src/generatedIndex.txt`, newIndex.trim());
}

function printRanges(ranges: ChapterRange[]) {
  const alternates = _.compact(ranges.map(r => r.alternate));
  return `${_.compact(ranges.map(({ start, end }) => printRange(start, end))).join('; ')}${alternates.length > 0 ? ' [' + alternates.join(', ') + ']' : ''}`;
}

function printRange(start: ChapterVerse | undefined, end: ChapterVerse | undefined) {
  return start ? `${chapterVerseToString(start)}${end ? '-' + chapterVerseToString(end) : ''}` : undefined
}

function chapterVerseToString({ chapter, verse, note }: ChapterVerse) {
  return `${chapter}${verse ? ':' + verse : ''}${note ? '.' + note : ''}`;
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
  if (first === '4:74:14' && second === '419')
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
    book, bookInfos: pages.length === 0 ?
      [{ location, book, }]
      : pages.map(pageNumber => ({
        location,
        book,
        pageNumber,
      }))
  };
}